"""多智能体(协调者→委派→子 agent→汇总)测试。

不打真实模型:mock _stream_turn,按调用顺序脚本化三轮:
  turn1 = 协调者决定 delegate 给「助手」
  turn2 = 子 agent「助手」执行并答复(嵌套 run_agent 触发)
  turn3 = 协调者拿到子结果后汇总
全局计数器跨"协调者 + 子 agent"的 _stream_turn 调用递增,所以顺序天然对上。
"""

from types import SimpleNamespace

import app.agent as agentmod
from app.agent import run_agent
from app.db import session_for_org, session_no_tenant
from app.models import Agent, Organization
from app.orchestration import make_tool_runner


def _text(t):
    return SimpleNamespace(type="text", text=t)


def _tool(id_, name, inp):
    return SimpleNamespace(type="tool_use", id=id_, name=name, input=inp)


def _msg(blocks):
    return SimpleNamespace(content=blocks, stop_reason="end_turn")


async def _seed():
    async with session_no_tenant() as s:
        org = Organization(name="A")
        s.add(org)
        await s.commit()
        org_id = str(org.id)
    # agents 是 org 作用域表(RLS),要用 org 会话插入
    async with session_for_org(org_id) as s:
        s.add(Agent(org_id=org_id, name="助手", system_prompt="工人", tools=["calculator"]))
        await s.commit()
    return org_id


async def test_coordinator_delegates_to_worker(monkeypatch):
    org_id = await _seed()
    turn = {"n": 0}

    async def fake_stream_turn(client, model, system, messages, tools):
        turn["n"] += 1
        if turn["n"] == 1:
            # 协调者:委派给助手
            yield {"final": _msg([_tool("d1", "delegate", {"agent": "助手", "task": "算 2+3"})])}
        elif turn["n"] == 2:
            # 子 agent 助手:直接答(嵌套 run_agent)
            yield {"delta": "5"}
            yield {"final": _msg([_text("5")])}
        else:
            # 协调者:汇总
            yield {"delta": "助手算出结果是 5"}
            yield {"final": _msg([_text("助手算出结果是 5")])}

    monkeypatch.setattr(agentmod, "_stream_turn", fake_stream_turn)

    runner = make_tool_runner(org_id, api_key="dummy")
    events = [
        e
        async for e in run_agent(
            [{"role": "user", "content": "帮我算 2+3"}],
            system_prompt="你是协调者",
            tool_names=["delegate"],
            api_key="dummy",
            client=SimpleNamespace(),
            tool_runner=runner,
        )
    ]

    # 协调者应发出一次 delegate 工具调用
    tcall = next(e for e in events if e["type"] == "tool_call")
    assert tcall["name"] == "delegate"
    assert tcall["input"]["agent"] == "助手"

    # delegate 的结果应是子 agent 的答复
    tres = next(e for e in events if e["type"] == "tool_result")
    assert tres["output"] == "5"

    # 协调者最终汇总
    final = next(e for e in events if e["type"] == "final")
    assert final["text"] == "助手算出结果是 5"
    assert turn["n"] == 3  # 协调者2轮 + 子agent1轮


async def test_delegate_unknown_agent(monkeypatch):
    org_id = await _seed()
    runner = make_tool_runner(org_id, api_key="dummy")
    out = await runner("delegate", {"agent": "不存在的", "task": "x"})
    assert "找不到" in out
