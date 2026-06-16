"""Agora 后端 · 阶段 1：生产地基(多租户 + 持久化对话 + BYO-key)。

- 多租户:所有数据按 org 隔离(RLS)。鉴权(dev shim / Clerk)给出当前 org/user。
- 持久化:频道与消息落 Postgres,刷新仍在。
- BYO-key:组织在设置里存自己的 Anthropic key,加密落库,调用时取用。
"""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select

from .agent import run_agent
from .auth import AuthContext, get_auth
from .config import settings
from .crypto import decrypt, encrypt
from .db import init_db, session_for_org
from .models import Agent, Channel, Document, Message, OrgApiKey
from .orchestration import make_tool_runner
from .retrieval import build_context, ingest_document, retrieve
from .tools import ALL_TOOL_NAMES


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Agora API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# ---------- Agents ----------

class CreateAgentRequest(BaseModel):
    name: str
    system_prompt: str = ""
    model: str | None = None
    tools: list[str] = []


def _agent_dict(a: Agent) -> dict:
    return {
        "id": str(a.id),
        "name": a.name,
        "system_prompt": a.system_prompt,
        "model": a.model,
        "tools": a.tools or [],
    }


# 工人 agent 用除 delegate 外的所有工具;协调者用 delegate(+remember)负责拆活
_WORKER_TOOLS = [t for t in ALL_TOOL_NAMES if t != "delegate"]


async def _seed_default_agents(s, org_id: str) -> list[Agent]:
    """组织没有 agent 时,种两个默认:工人「助手」+「协调者」(演示多智能体)。"""
    worker = Agent(
        org_id=org_id,
        name="助手",
        system_prompt="你是 Agora 里的 AI 助手。需要算数、查时间、统计文本时,调用对应工具,不要心算。",
        tools=_WORKER_TOOLS,
    )
    coordinator = Agent(
        org_id=org_id,
        name="协调者",
        system_prompt=(
            "你是协调者。把复杂任务拆成子任务,用 delegate 工具委派给合适的下属 agent 完成,"
            "再把结果汇总成清晰的最终答复。可委派的 agent 见下方花名册。"
        ),
        tools=["delegate", "remember"],
    )
    s.add_all([worker, coordinator])
    await s.commit()
    return [worker, coordinator]


def _roster_text(agents: list[Agent], exclude_name: str) -> str:
    """给协调者注入"花名册":有哪些 agent、各自擅长什么。"""
    others = [a for a in agents if a.name != exclude_name]
    if not others:
        return ""
    lines = ["", "【可委派的 agent 花名册】"]
    for a in others:
        snippet = (a.system_prompt or "")[:60]
        lines.append(f"- {a.name}:{snippet}")
    return "\n".join(lines)


@app.get("/api/agents")
async def list_agents(auth: AuthContext = Depends(get_auth)):
    async with session_for_org(auth.org_id) as s:
        rows = (await s.execute(select(Agent).order_by(Agent.created_at))).scalars().all()
        if not rows:
            rows = await _seed_default_agents(s, auth.org_id)
        return [_agent_dict(a) for a in rows]


@app.post("/api/agents")
async def create_agent(req: CreateAgentRequest, auth: AuthContext = Depends(get_auth)):
    async with session_for_org(auth.org_id) as s:
        a = Agent(
            org_id=auth.org_id,
            name=req.name,
            system_prompt=req.system_prompt,
            model=req.model,
            tools=[t for t in req.tools if t in ALL_TOOL_NAMES],
        )
        s.add(a)
        await s.commit()
        return _agent_dict(a)


@app.get("/api/tools")
async def list_tools():
    from .tools import REGISTRY

    return [{"name": t.name, "description": t.description} for t in REGISTRY.values()]


# ---------- 文档(RAG 资料) ----------

class UploadDocRequest(BaseModel):
    name: str
    text: str


@app.get("/api/documents")
async def list_documents(auth: AuthContext = Depends(get_auth)):
    async with session_for_org(auth.org_id) as s:
        rows = (await s.execute(select(Document).order_by(Document.created_at.desc()))).scalars().all()
        return [{"id": str(d.id), "name": d.name} for d in rows]


@app.post("/api/documents")
async def upload_document(req: UploadDocRequest, auth: AuthContext = Depends(get_auth)):
    doc_id, n = await ingest_document(auth.org_id, req.name, req.text)
    return {"id": doc_id, "name": req.name, "chunks": n}


# ---------- 流式对话(经 agent,落库) ----------

class ChatRequest(BaseModel):
    channel_id: str
    content: str
    agent_id: str | None = None


async def _next_seq(s, channel_id: str) -> int:
    cur = (
        await s.execute(
            select(func.coalesce(func.max(Message.seq), 0)).where(Message.channel_id == channel_id)
        )
    ).scalar_one()
    return int(cur) + 1


def _sse(payload: dict) -> bytes:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode()


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest, auth: AuthContext = Depends(get_auth)):
    org_id = auth.org_id

    # 1) 短事务:存用户消息 + 取频道历史 + 取选定 agent
    async with session_for_org(org_id) as s:
        ch = (
            await s.execute(select(Channel).where(Channel.id == req.channel_id))
        ).scalar_one_or_none()
        if ch is None:
            raise HTTPException(404, "频道不存在或无权访问")

        all_agents = (await s.execute(select(Agent).order_by(Agent.created_at))).scalars().all()
        if not all_agents:
            all_agents = await _seed_default_agents(s, org_id)
        if req.agent_id:
            agent = next((a for a in all_agents if str(a.id) == req.agent_id), None)
        else:
            agent = all_agents[0]
        if agent is None:
            agent = all_agents[0]

        seq = await _next_seq(s, req.channel_id)
        s.add(
            Message(
                org_id=org_id, channel_id=req.channel_id, seq=seq, role="user",
                content=req.content, sender_user_id=auth.user_id,
            )
        )
        history_rows = (
            await s.execute(
                select(Message).where(Message.channel_id == req.channel_id).order_by(Message.seq)
            )
        ).scalars().all()
        history = [{"role": m.role, "content": m.content} for m in history_rows]
        history.append({"role": "user", "content": req.content})
        agent_system = agent.system_prompt
        agent_tools = agent.tools or []
        agent_model = agent.model
        # 协调者注入花名册,知道能委派给谁
        if "delegate" in agent_tools:
            agent_system += _roster_text(all_agents, agent.name)
        await s.commit()

    api_key = await _org_api_key(org_id)

    # 检索相关记忆 + 资料,注入 agent 的 system(RAG)
    retrieved = await retrieve(org_id, req.content)
    system_with_context = agent_system + build_context(retrieved)

    # 统一工具执行器:remember(记忆)/delegate(委派子 agent)/纯工具
    tool_runner = make_tool_runner(org_id, api_key)

    # 2) 跑 agent loop(不持有数据库事务),转发事件
    async def gen() -> AsyncIterator[bytes]:
        answer = ""
        async for ev in run_agent(
            history, system_with_context, agent_tools, api_key=api_key,
            model=agent_model, tool_runner=tool_runner,
        ):
            if ev["type"] == "final":
                # 最终文本已经在本轮通过 delta 流式推过了,这里只留作落库
                answer = ev["text"]
            elif ev["type"] == "delta":
                yield _sse({"delta": ev["text"]})
            elif ev["type"] == "tool_call":
                yield _sse({"tool_call": {"name": ev["name"], "input": ev["input"]}})
            elif ev["type"] == "tool_result":
                yield _sse({"tool_result": {"name": ev["name"], "output": ev["output"]}})
            elif ev["type"] == "error":
                yield _sse({"error": ev["message"]})

        # 3) 短事务:存 assistant 最终答复
        if answer:
            async with session_for_org(org_id) as s2:
                seq2 = await _next_seq(s2, req.channel_id)
                s2.add(
                    Message(
                        org_id=org_id, channel_id=req.channel_id, seq=seq2,
                        role="assistant", content=answer,
                    )
                )
                await s2.commit()
        yield b'data: {"done": true}\n\n'

    return StreamingResponse(gen(), media_type="text/event-stream")
