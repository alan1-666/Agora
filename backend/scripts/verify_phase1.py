"""阶段 1 验证:多租户隔离 + 落库。直接打数据库层(不经 HTTP),证明:

1. 落库:频道/消息能写入并读回。
2. RLS 隔离:org A 的会话看不到 org B 的数据(核心安全保证)。
3. 漏写 org 过滤也安全:即使查询不带 org_id 条件,RLS 也只返回当前 org 的行。
"""

import asyncio

from sqlalchemy import select

from app.db import init_db, session_for_org, session_no_tenant
from app.models import Channel, Message, Organization


async def main() -> None:
    await init_db()

    # 建两个组织(非 org 作用域表,用无租户会话)
    async with session_no_tenant() as s:
        a = Organization(name="Org A")
        b = Organization(name="Org B")
        s.add_all([a, b])
        await s.commit()
        org_a, org_b = str(a.id), str(b.id)
    print(f"建组织 A={org_a[:8]}  B={org_b[:8]}")

    # 在 A 里建频道 + 写消息
    async with session_for_org(org_a) as s:
        ch = Channel(org_id=org_a, name="general")
        s.add(ch)
        await s.flush()
        s.add(Message(org_id=org_a, channel_id=ch.id, seq=1, role="user", content="A 的消息"))
        await s.commit()
        ch_a = str(ch.id)
    print(f"A 建频道 {ch_a[:8]} + 写 1 条消息")

    # 在 B 里建频道 + 写消息
    async with session_for_org(org_b) as s:
        ch = Channel(org_id=org_b, name="general")
        s.add(ch)
        await s.flush()
        s.add(Message(org_id=org_b, channel_id=ch.id, seq=1, role="user", content="B 的消息"))
        await s.commit()
    print("B 建频道 + 写 1 条消息")

    # 关键验证:用 A 的会话查"所有频道/消息"(故意不加 org_id 条件)
    async with session_for_org(org_a) as s:
        chans = (await s.execute(select(Channel))).scalars().all()
        msgs = (await s.execute(select(Message))).scalars().all()
    print(f"\nA 的会话看到: {len(chans)} 个频道, {len(msgs)} 条消息")
    assert len(chans) == 1, f"RLS 失败! A 应只见 1 频道,实际 {len(chans)}"
    assert len(msgs) == 1 and msgs[0].content == "A 的消息", "RLS 失败! A 看到了别组织的消息"
    print("  ✓ A 只看到自己的频道和消息(看不到 B 的)")

    # 用 B 的会话同理
    async with session_for_org(org_b) as s:
        msgs_b = (await s.execute(select(Message))).scalars().all()
    assert len(msgs_b) == 1 and msgs_b[0].content == "B 的消息", "RLS 失败!"
    print("  ✓ B 只看到自己的消息(看不到 A 的)")

    # 跨租户写入也应被拦:在 A 的会话里试图插入标着 B org_id 的行
    blocked = False
    try:
        async with session_for_org(org_a) as s:
            s.add(Message(org_id=org_b, channel_id=ch_a, seq=2, role="user", content="越权"))
            await s.commit()
    except Exception:
        blocked = True
    assert blocked, "RLS 失败! A 竟能写入标着 B org_id 的行"
    print("  ✓ A 无法写入标着 B org_id 的行(WITH CHECK 拦截)")

    print("\n✅ 阶段 1 多租户隔离验证全部通过")


if __name__ == "__main__":
    asyncio.run(main())
