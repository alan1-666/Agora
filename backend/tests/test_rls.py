"""多租户 RLS 隔离测试 —— 这是整个平台的安全底线,必须始终通过。"""

import pytest
from sqlalchemy import select

from app.db import session_for_org, session_no_tenant
from app.models import Channel, Message, Organization


async def _make_org(name: str) -> str:
    async with session_no_tenant() as s:
        org = Organization(name=name)
        s.add(org)
        await s.commit()
        return str(org.id)


async def _add_message(org_id: str, content: str) -> None:
    async with session_for_org(org_id) as s:
        ch = Channel(org_id=org_id, name="general")
        s.add(ch)
        await s.flush()
        s.add(Message(org_id=org_id, channel_id=ch.id, seq=1, role="user", content=content))
        await s.commit()


async def test_org_cannot_see_other_orgs_data():
    """即使查询不带 org 过滤,RLS 也只返回当前 org 的行。"""
    org_a = await _make_org("A")
    org_b = await _make_org("B")
    await _add_message(org_a, "A 的消息")
    await _add_message(org_b, "B 的消息")

    async with session_for_org(org_a) as s:
        chans = (await s.execute(select(Channel))).scalars().all()
        msgs = (await s.execute(select(Message))).scalars().all()
    assert len(chans) == 1
    assert [m.content for m in msgs] == ["A 的消息"]

    async with session_for_org(org_b) as s:
        msgs_b = (await s.execute(select(Message))).scalars().all()
    assert [m.content for m in msgs_b] == ["B 的消息"]


async def test_cannot_write_row_for_another_org():
    """WITH CHECK 应拦截:A 的会话不能写入标着 B org_id 的行。"""
    org_a = await _make_org("A")
    org_b = await _make_org("B")
    async with session_for_org(org_a) as s:
        ch = Channel(org_id=org_a, name="general")
        s.add(ch)
        await s.flush()
        ch_id = ch.id
        await s.commit()

    with pytest.raises(Exception):
        async with session_for_org(org_a) as s:
            s.add(Message(org_id=org_b, channel_id=ch_id, seq=1, role="user", content="越权"))
            await s.commit()


async def test_no_tenant_set_returns_nothing():
    """未设当前 org 时,org 作用域表读不到任何行(current_setting 为空 → 不匹配)。"""
    org_a = await _make_org("A")
    await _add_message(org_a, "A 的消息")
    async with session_for_org("00000000-0000-0000-0000-000000000000") as s:
        msgs = (await s.execute(select(Message))).scalars().all()
    assert msgs == []
