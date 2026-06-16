"""Agora 后端 · 阶段 0：能流式对话的单 agent。

提供一个 SSE 流式聊天接口。还没有工具、记忆、多 agent —— 那些在后续阶段加。
"""

import json
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .config import settings
from .llm import stream_chat

app = FastAPI(title="Agora API", version="0.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]


@app.get("/health")
async def health():
    return {"status": "ok", "model": settings.model}


async def _sse(messages: list[dict]) -> AsyncIterator[bytes]:
    """把 LLM 文本增量包成 SSE 事件。

    约定:每个 data 是一个 JSON,{"delta": "..."} 是增量,{"done": true} 是结束。
    """
    try:
        async for delta in stream_chat(messages):
            yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n".encode()
    except Exception as e:  # 把错误也推给前端,方便调试
        yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n".encode()
    yield b"data: {\"done\": true}\n\n"


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    messages = [m.model_dump() for m in req.messages]
    return StreamingResponse(_sse(messages), media_type="text/event-stream")
