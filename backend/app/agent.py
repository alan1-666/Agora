"""Agent 工具循环(Anthropic SDK 原生 tool use)。

一轮 = 调模型 → 若模型要调工具,执行并把结果喂回 → 再调模型 → 直到模型给出最终答复。
这就是 "agent loop" 的本体。用 LangGraph 之前先手写一遍,理解每一步在干什么。

事件流(供上层转成 SSE):
  {"type":"delta","text":...}        模型输出的文本增量
  {"type":"tool_call","name","input"} 模型决定调某工具
  {"type":"tool_result","name","output"} 工具执行结果
  {"type":"final","text":...}         最终答复(完整文本,用于落库)

_stream_turn 单独抽出,测试时 monkeypatch 它来脚本化模型行为(离线、不发网络)。
"""

from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic

from .config import settings
from .tools import anthropic_tools_spec, run_tool

MAX_TURNS = 8  # 防止工具循环失控


async def _stream_turn(client, model, system, messages, tools):
    """跑一轮模型调用:流式吐文本增量,最后吐出完整 message 对象。"""
    async with client.messages.stream(
        model=model,
        max_tokens=settings.max_tokens,
        system=system,
        messages=messages,
        tools=tools,
    ) as stream:
        async for text in stream.text_stream:
            yield {"delta": text}
        final = await stream.get_final_message()
        yield {"final": final}


def _block_to_dict(block) -> dict:
    """把 SDK 的 content block 转成可回传的 dict。"""
    if block.type == "text":
        return {"type": "text", "text": block.text}
    if block.type == "tool_use":
        return {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
    return {"type": block.type}


async def run_agent(
    messages: list[dict],
    system_prompt: str,
    tool_names: list[str],
    api_key: str | None,
    model: str | None = None,
    client=None,
) -> AsyncIterator[dict]:
    """跑完整 agent loop,逐个 yield 事件。"""
    key = api_key or settings.anthropic_api_key
    if not key:
        yield {"type": "error", "message": "未配置模型 API key(BYO-key)。"}
        return

    client = client or AsyncAnthropic(api_key=key)
    tools = anthropic_tools_spec(tool_names)
    convo = list(messages)

    for _ in range(MAX_TURNS):
        final = None
        turn_text = []
        async for ev in _stream_turn(client, model or settings.model, system_prompt, convo, tools):
            if "delta" in ev:
                turn_text.append(ev["delta"])
                yield {"type": "delta", "text": ev["delta"]}
            else:
                final = ev["final"]

        # 把这一轮的 assistant 回复(含 tool_use 块)记进对话
        convo.append({"role": "assistant", "content": [_block_to_dict(b) for b in final.content]})

        # 处理工具调用
        tool_results = []
        for block in final.content:
            if block.type == "tool_use":
                yield {"type": "tool_call", "name": block.name, "input": block.input}
                output = run_tool(block.name, block.input)
                yield {"type": "tool_result", "name": block.name, "output": output}
                tool_results.append(
                    {"type": "tool_result", "tool_use_id": block.id, "content": output}
                )

        if tool_results:
            # 把工具结果作为 user 消息喂回,继续下一轮
            convo.append({"role": "user", "content": tool_results})
            continue

        # 没有工具调用 → 这轮就是最终答复
        yield {"type": "final", "text": "".join(turn_text)}
        return

    yield {"type": "final", "text": "".join(turn_text) if turn_text else "(达到最大工具轮数)"}
