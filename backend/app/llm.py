"""LLM provider 封装。

抽象层:上层 agent 代码只认 `stream_chat`,之后接多模型路由只改这里。
api_key 按组织传入(BYO-key);组织没配时回退到全局 settings.anthropic_api_key(仅 dev 方便)。
"""

from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic

from .config import settings

DEFAULT_SYSTEM_PROMPT = (
    "你是 Agora 平台里的一个 AI 助手,友好、简洁、直接。"
    "用提问者使用的语言回答。"
)


async def stream_chat(
    messages: list[dict],
    api_key: str | None = None,
    model: str | None = None,
    system: str = DEFAULT_SYSTEM_PROMPT,
) -> AsyncIterator[str]:
    """流式调用 Claude,逐段 yield 文本增量。

    messages: [{"role": "user"|"assistant", "content": "..."}]
    api_key:  组织自带的 key;为空则用全局兜底。
    """
    key = api_key or settings.anthropic_api_key
    if not key:
        raise ValueError("未配置模型 API key:请在组织设置里填入 Anthropic key(BYO-key)。")

    client = AsyncAnthropic(api_key=key)
    async with client.messages.stream(
        model=model or settings.model,
        max_tokens=settings.max_tokens,
        system=system,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text
