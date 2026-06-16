"""Agent 工具循环测试。

不打真实模型:monkeypatch _stream_turn 脚本化两轮——
  第 1 轮:模型决定调 calculator(2+3)
  第 2 轮:模型基于工具结果给出最终答复
验证循环确实执行了工具、把结果喂回、并产出最终文本。
"""

from types import SimpleNamespace

import app.agent as agentmod
from app.agent import run_agent


def _text(t):
    return SimpleNamespace(type="text", text=t)


def _tool(id_, name, inp):
    return SimpleNamespace(type="tool_use", id=id_, name=name, input=inp)


def _msg(blocks):
    return SimpleNamespace(content=blocks, stop_reason="end_turn")


async def test_agent_executes_tool_then_answers(monkeypatch):
    turn = {"n": 0}

    async def fake_stream_turn(client, model, system, messages, tools):
        turn["n"] += 1
        if turn["n"] == 1:
            yield {"delta": "让我算一下 "}
            yield {"final": _msg([_text("让我算一下"), _tool("t1", "calculator", {"expression": "2+3"})])}
        else:
            # 第 2 轮:对话里应已带上工具结果
            yield {"delta": "答案是 5"}
            yield {"final": _msg([_text("答案是 5")])}

    monkeypatch.setattr(agentmod, "_stream_turn", fake_stream_turn)

    events = [
        e
        async for e in run_agent(
            [{"role": "user", "content": "2+3 等于几"}],
            system_prompt="sys",
            tool_names=["calculator"],
            api_key="dummy",
            client=SimpleNamespace(),  # 被 mock 的 _stream_turn 不会用到
        )
    ]
    types = [e["type"] for e in events]

    assert "tool_call" in types, "应有工具调用事件"
    assert "tool_result" in types, "应有工具结果事件"

    tool_result = next(e for e in events if e["type"] == "tool_result")
    assert tool_result["name"] == "calculator"
    assert tool_result["output"] == "5", "calculator(2+3) 应得 5"

    final = next(e for e in events if e["type"] == "final")
    assert final["text"] == "答案是 5"
    assert turn["n"] == 2, "应跑了两轮(调工具后再回模型)"


async def test_agent_without_key_errors():
    events = [
        e
        async for e in run_agent(
            [{"role": "user", "content": "hi"}],
            system_prompt="sys",
            tool_names=[],
            api_key=None,
        )
    ]
    assert events and events[0]["type"] == "error"
