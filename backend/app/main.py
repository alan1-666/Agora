"""Agora 后端 · 阶段 1：生产地基(多租户 + 持久化对话 + BYO-key)。

- 多租户:所有数据按 org 隔离(RLS)。鉴权(dev shim / Clerk)给出当前 org/user。
- 持久化:频道与消息落 Postgres,刷新仍在。
- BYO-key:组织在设置里存自己的 Anthropic key,加密落库,调用时取用。
"""

import json
from collections.abc import AsyncIterator

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select

from .auth import AuthContext, get_auth
from .config import settings
from .crypto import decrypt, encrypt
from .db import init_db, session_for_org
from .llm import stream_chat
from .models import Channel, Message, OrgApiKey

app = FastAPI(title="Agora API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup() -> None:
    await init_db()


@app.get("/health")
async def health():
    return {"status": "ok", "model": settings.model, "dev_mode": settings.dev_mode}


# ---------- 组织模型 key(BYO-key) ----------

class SetKeyRequest(BaseModel):
    api_key: str
    model: str | None = None


@app.put("/api/org/key")
async def set_org_key(req: SetKeyRequest, auth: AuthContext = Depends(get_auth)):
    """存/更新本组织的 Anthropic key(加密)。"""
    async with session_for_org(auth.org_id) as s:
        existing = (
            await s.execute(select(OrgApiKey).where(OrgApiKey.org_id == auth.org_id))
        ).scalar_one_or_none()
        if existing:
            existing.encrypted_key = encrypt(req.api_key)
            existing.model = req.model
        else:
            s.add(
                OrgApiKey(
                    org_id=auth.org_id,
                    provider="anthropic",
                    encrypted_key=encrypt(req.api_key),
                    model=req.model,
                )
            )
        await s.commit()
    return {"ok": True}


@app.get("/api/org/key")
async def get_org_key_status(auth: AuthContext = Depends(get_auth)):
    """只返回是否已配置 + 用的模型,不回明文 key。"""
    async with session_for_org(auth.org_id) as s:
        row = (
            await s.execute(select(OrgApiKey).where(OrgApiKey.org_id == auth.org_id))
        ).scalar_one_or_none()
        return {"configured": row is not None, "model": row.model if row else None}


async def _org_api_key(org_id: str) -> str | None:
    async with session_for_org(org_id) as s:
        row = (
            await s.execute(select(OrgApiKey).where(OrgApiKey.org_id == org_id))
        ).scalar_one_or_none()
        return decrypt(row.encrypted_key) if row else None


# ---------- 频道 ----------

class CreateChannelRequest(BaseModel):
    name: str = "general"


@app.get("/api/channels")
async def list_channels(auth: AuthContext = Depends(get_auth)):
    async with session_for_org(auth.org_id) as s:
        rows = (await s.execute(select(Channel).order_by(Channel.created_at))).scalars().all()
        return [{"id": str(c.id), "name": c.name} for c in rows]


@app.post("/api/channels")
async def create_channel(req: CreateChannelRequest, auth: AuthContext = Depends(get_auth)):
    async with session_for_org(auth.org_id) as s:
        c = Channel(org_id=auth.org_id, name=req.name)
        s.add(c)
        await s.commit()
        return {"id": str(c.id), "name": c.name}


@app.get("/api/channels/{channel_id}/messages")
async def list_messages(channel_id: str, auth: AuthContext = Depends(get_auth)):
    async with session_for_org(auth.org_id) as s:
        rows = (
            await s.execute(
                select(Message).where(Message.channel_id == channel_id).order_by(Message.seq)
            )
        ).scalars().all()
        return [{"role": m.role, "content": m.content, "seq": m.seq} for m in rows]


# ---------- 流式对话(落库) ----------

class ChatRequest(BaseModel):
    channel_id: str
    content: str


async def _next_seq(s, channel_id: str) -> int:
    cur = (
        await s.execute(
            select(func.coalesce(func.max(Message.seq), 0)).where(Message.channel_id == channel_id)
        )
    ).scalar_one()
    return int(cur) + 1


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest, auth: AuthContext = Depends(get_auth)):
    org_id = auth.org_id

    # 1) 短事务:存用户消息 + 取该频道历史 + 取组织 key
    async with session_for_org(org_id) as s:
        ch = (
            await s.execute(select(Channel).where(Channel.id == req.channel_id))
        ).scalar_one_or_none()
        if ch is None:
            raise HTTPException(404, "频道不存在或无权访问")

        seq = await _next_seq(s, req.channel_id)
        s.add(
            Message(
                org_id=org_id,
                channel_id=req.channel_id,
                seq=seq,
                role="user",
                content=req.content,
                sender_user_id=auth.user_id,
            )
        )
        history_rows = (
            await s.execute(
                select(Message).where(Message.channel_id == req.channel_id).order_by(Message.seq)
            )
        ).scalars().all()
        history = [{"role": m.role, "content": m.content} for m in history_rows]
        history.append({"role": "user", "content": req.content})
        await s.commit()

    api_key = await _org_api_key(org_id)

    # 2) 流式(不持有数据库事务),边推边攒完整回复
    async def gen() -> AsyncIterator[bytes]:
        full = []
        try:
            async for delta in stream_chat(history, api_key=api_key):
                full.append(delta)
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n".encode()
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n".encode()
        # 3) 短事务:存 assistant 回复(有内容才存)
        answer = "".join(full)
        if answer:
            async with session_for_org(org_id) as s2:
                seq2 = await _next_seq(s2, req.channel_id)
                s2.add(
                    Message(
                        org_id=org_id,
                        channel_id=req.channel_id,
                        seq=seq2,
                        role="assistant",
                        content=answer,
                    )
                )
                await s2.commit()
        yield b'data: {"done": true}\n\n'

    return StreamingResponse(gen(), media_type="text/event-stream")
