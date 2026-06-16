"""测试夹具:每个用例前建表 + 清库 + 重置 dev 鉴权缓存,保证用例间隔离。

测试全程离线(不打真实模型):强制清空全局兜底 key,让 stream_chat 走"未配置 key"
的确定性错误分支,不发网络请求。
"""

import pytest
from sqlalchemy import text

import app.auth as auth
from app.config import settings
from app.db import _admin_engine, init_db

_TABLES = "messages, channels, agents, org_api_keys, memberships, users, organizations"


@pytest.fixture(autouse=True)
async def _db():
    await init_db()
    async with _admin_engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))
    auth._dev_cache = None
    settings.anthropic_api_key = ""  # 离线:无兜底 key
    yield
