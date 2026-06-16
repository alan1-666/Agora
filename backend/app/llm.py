"""LLM provider 封装。

现在只封 Claude；之所以单独抽一层,是为了之后(阶段 3+)接多模型路由时,
上层 agent 代码不用改 —— 只认这里暴露的 `stream_chat` 接口。
"""

from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic

from .config import settings

_client = AsyncAnthropic(api_key=settings.anthropic_api_key)

# 单 agent 的人设。阶段 3 做多 agent 时,每个 agent 会带自己的 system_prompt。
DEFAULT_SYSTEM_PROMPT = (
    "你是 Agora 平台里的一个 AI 助手,友好、简洁、直接。"
    "用提问者使用的语言回答。"
)


async def stream_chat(
    messages: list[dict],
    system: str = DEFAULT_SYSTEM_PROMPT,
) -> AsyncIterator[str]:
    """流式调用 Claude,逐段 yield 文本增量。

    messages: [{"role": "user"|"assistant", "content": "..."}]
    """
    async with _client.messages.stream(
        model=settings.model,
        max_tokens=settings.max_tokens,
        system=system,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text
