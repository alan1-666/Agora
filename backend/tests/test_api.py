"""HTTP 接口测试:走 ASGI(不起真服务器),验证落库 + BYO-key + 流式错误分支。"""

from httpx import ASGITransport, AsyncClient

from app.main import app


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_health():
    async with _client() as ac:
        r = await ac.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_channel_and_message_persist():
    async with _client() as ac:
        ch = (await ac.post("/api/channels", json={"name": "general"})).json()
        # 发消息:无 key → 流式吐 error 事件,但用户消息应落库
        body = (await ac.post("/api/chat/stream", json={"channel_id": ch["id"], "content": "你好"})).text
        assert '"error"' in body and '"done": true' in body

        msgs = (await ac.get(f"/api/channels/{ch['id']}/messages")).json()
    assert len(msgs) == 1
    assert msgs[0]["role"] == "user"
    assert msgs[0]["content"] == "你好"


async def test_byo_key_roundtrip_no_plaintext():
    async with _client() as ac:
        assert (await ac.get("/api/org/key")).json()["configured"] is False
        await ac.put("/api/org/key", json={"api_key": "sk-ant-secret", "model": "claude-sonnet-4-6"})
        status = (await ac.get("/api/org/key")).json()
    assert status["configured"] is True
    assert status["model"] == "claude-sonnet-4-6"
    # 状态接口不回明文 key
    assert "sk-ant-secret" not in str(status)
