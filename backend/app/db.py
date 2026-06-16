"""数据库层:异步引擎 + 会话 + 多租户 RLS。

RLS(行级安全)隔离原理:
- org 作用域表开启 FORCE ROW LEVEL SECURITY + 一条 policy:
  只有 org_id == current_setting('app.current_org') 的行可见/可写。
- 每个请求在事务里 `SET LOCAL app.current_org = <org_id>`,数据库据此自动过滤。
- 这样即使应用层查询漏写 org_id 条件,也不会跨组织泄露 —— 安全底线在 DB 层。

注意:不在 LLM 流式期间持有数据库事务(避免长事务)。写库都在流式前后的短事务里做。
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session as SyncSession

from .config import settings
from .models import ORG_SCOPED_TABLES, Base


# 关键:每个事务开始时自动把当前 org 写进 app.current_org(SET LOCAL,事务级)。
# 这样即使一个会话里中途 commit(事务结束、设置被重置),下一个事务一 begin 就会重新设上,
# RLS 永远有正确的当前组织。比"只在会话开头设一次"健壮(后者遇到中途 commit 就丢)。
@event.listens_for(SyncSession, "after_begin")
def _apply_org_rls(session, transaction, connection):
    org = session.info.get("agora_org")
    if org:
        connection.exec_driver_sql("SELECT set_config('app.current_org', %s, true)", (org,))

# 运行时引擎:连非超级用户 agora_app,RLS 生效
engine = create_async_engine(settings.database_url, pool_pre_ping=True)
_session_factory = async_sessionmaker(engine, expire_on_commit=False)

# 管理引擎:连超级用户,仅用于建表/建角色/RLS(只在启动时用一次)
_admin_engine = create_async_engine(settings.database_admin_url, pool_pre_ping=True)

# 从 app 连接串里解析出运行时角色名,用于授权(默认 agora_app)
_APP_ROLE = settings.database_url.split("://", 1)[1].split(":", 1)[0]
_APP_PWD = settings.database_url.split("://", 1)[1].split(":", 1)[1].split("@", 1)[0]


async def init_db() -> None:
    """建运行时角色 + 建表 + 应用 RLS 策略 + 授权(幂等)。

    用超级用户连接执行;阶段 1 用 create_all 引导 schema,schema 演进后引入 Alembic。
    """
    async with _admin_engine.begin() as conn:
        # 1) 建非超级用户运行时角色(RLS 对它生效)
        await conn.execute(
            text(
                "DO $$ BEGIN "
                f"IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='{_APP_ROLE}') THEN "
                f"CREATE ROLE {_APP_ROLE} LOGIN PASSWORD '{_APP_PWD}'; END IF; END $$;"
            )
        )
        # 2) 建表
        await conn.run_sync(Base.metadata.create_all)
        # 3) 授权给运行时角色
        await conn.execute(text(f"GRANT USAGE ON SCHEMA public TO {_APP_ROLE}"))
        await conn.execute(
            text(f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {_APP_ROLE}")
        )
        await conn.execute(
            text(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {_APP_ROLE}")
        )
        # 4) RLS 策略
        for table in ORG_SCOPED_TABLES:
            await conn.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
            await conn.execute(text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))
            # 删了重建保证策略与代码一致(幂等)
            await conn.execute(text(f"DROP POLICY IF EXISTS org_isolation ON {table}"))
            await conn.execute(
                text(
                    f"CREATE POLICY org_isolation ON {table} "
                    "USING (org_id = current_setting('app.current_org', true)::uuid) "
                    "WITH CHECK (org_id = current_setting('app.current_org', true)::uuid)"
                )
            )


@asynccontextmanager
async def session_for_org(org_id: str) -> AsyncIterator[AsyncSession]:
    """开一个会话并绑定当前组织;该会话所有事务都自动按此 org 受 RLS 约束。

    org 不在这里直接 set,而是记在 session.info,由 after_begin 事件在每个事务开始时应用
    (见上方 _apply_org_rls),从而对"会话中途 commit"也健壮。
    """
    async with _session_factory() as session:
        session.sync_session.info["agora_org"] = org_id
        yield session


@asynccontextmanager
async def session_no_tenant() -> AsyncIterator[AsyncSession]:
    """不设租户的会话,仅用于操作非 org 作用域表(organizations / users)。"""
    async with _session_factory() as session:
        yield session
