"""鉴权:从请求解析出 (org_id, user_id)。

- dev_mode=True:用内置的开发 org/user(首次调用自动 seed),免 Clerk,方便本地起步。
- dev_mode=False:校验 Clerk 会话 JWT,把 clerk_org_id / clerk_user_id 映射到本地 org/user。
  (Clerk 校验逻辑留待前端接 Clerk 时补全;这里先占位抛错,避免误以为有鉴权。)

返回的是本地 Organization.id / User.id(UUID 字符串)。
"""

from dataclasses import dataclass

from fastapi import Header, HTTPException
from sqlalchemy import select, text

from .config import settings
from .db import session_no_tenant
from .models import Membership, Organization, User

DEV_ORG_NAME = "Dev Org"
DEV_USER_EMAIL = "dev@agora.local"


@dataclass
class AuthContext:
    org_id: str
    user_id: str


_dev_cache: AuthContext | None = None


async def _ensure_dev_context() -> AuthContext:
    """保证开发用 org/user/membership 存在,返回其 id。"""
    global _dev_cache
    if _dev_cache:
        return _dev_cache

    async with session_no_tenant() as s:
        org = (
            await s.execute(select(Organization).where(Organization.name == DEV_ORG_NAME))
        ).scalar_one_or_none()
        if org is None:
            org = Organization(name=DEV_ORG_NAME, clerk_org_id="dev")
            s.add(org)
            await s.flush()

        user = (
            await s.execute(select(User).where(User.email == DEV_USER_EMAIL))
        ).scalar_one_or_none()
        if user is None:
            user = User(email=DEV_USER_EMAIL, name="Dev", clerk_user_id="dev")
            s.add(user)
            await s.flush()

        # membership 是 org 作用域表(RLS),插入前要设当前组织
        await s.execute(
            text("SELECT set_config('app.current_org', :o, true)"), {"o": str(org.id)}
        )
        exists = (
            await s.execute(
                select(Membership).where(
                    Membership.org_id == org.id, Membership.user_id == user.id
                )
            )
        ).scalar_one_or_none()
        if exists is None:
            s.add(Membership(org_id=org.id, user_id=user.id, role="owner"))
        await s.commit()

        _dev_cache = AuthContext(org_id=str(org.id), user_id=str(user.id))
        return _dev_cache


async def get_auth(authorization: str | None = Header(default=None)) -> AuthContext:
    """FastAPI 依赖:返回当前请求的 (org_id, user_id)。"""
    if settings.dev_mode:
        return await _ensure_dev_context()

    # 生产:校验 Clerk 会话 token(待前端接 Clerk 时实现)
    raise HTTPException(
        status_code=501,
        detail="生产鉴权(Clerk)尚未接入;当前请置 DEV_MODE=true 本地开发。",
    )
