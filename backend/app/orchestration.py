"""多智能体编排:统一的工具执行器。

把"有状态工具"(需要 org/DB 上下文的)和"纯工具"统一在一个 tool_runner 里:
- remember:写长期记忆
- delegate:把子任务派给另一个 agent,跑一个嵌套的 run_agent,返回其结果(supervisor 模式)
- 其余:走纯工具(calculator 等)

delegate 让"协调者 agent"能把活拆给"专家 agent"——多智能体协作的本体,不需要图框架,
就是"子 agent 当成一个工具来调用"。带深度防护,避免无限委派。
"""

from sqlalchemy import select

from .agent import run_agent
from .db import session_for_org
from .models import Agent
from .retrieval import add_memory
from .tools import run_tool

MAX_DELEGATE_DEPTH = 2


def make_tool_runner(org_id: str, api_key: str | None, depth: int = 0):
    async def runner(name: str, args: dict):
        if name == "remember":
            await add_memory(org_id, str(args.get("fact", "")))
            return "已记住"

        if name == "delegate":
            if depth >= MAX_DELEGATE_DEPTH:
                return "委派层级过深,已停止(防止无限委派)。"
            agent_name = str(args.get("agent", "")).strip()
            task = str(args.get("task", "")).strip()
            async with session_for_org(org_id) as s:
                sub = (
                    await s.execute(select(Agent).where(Agent.name == agent_name))
                ).scalars().first()
            if sub is None:
                return f"找不到名为「{agent_name}」的 agent。"
            # 跑一个嵌套的子 agent(它自己也有 tool_runner,支持工具/记忆;深度+1)
            answer = ""
            async for ev in run_agent(
                [{"role": "user", "content": task}],
                sub.system_prompt,
                sub.tools or [],
                api_key=api_key,
                model=sub.model,
                tool_runner=make_tool_runner(org_id, api_key, depth + 1),
            ):
                if ev["type"] == "final":
                    answer = ev["text"]
            return answer or "(子任务无结果)"

        return run_tool(name, args)

    return runner
