"""内置工具注册表。

每个工具 = 名称 + 描述 + 输入 JSON Schema(给模型看)+ run 执行函数。
阶段 2 先做 3 个确定性、离线的工具,便于演示 agent loop 和离线测试。
之后(阶段 5+)可接外部 API / MCP 工具。
"""

import ast
import operator
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable


@dataclass
class Tool:
    name: str
    description: str
    input_schema: dict
    run: Callable[[dict], str]


# ---------- calculator:安全的四则/幂运算(ast 求值,不用 eval) ----------

_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _safe_eval(node):
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_safe_eval(node.operand))
    raise ValueError("不支持的表达式")


def _calculator(args: dict) -> str:
    expr = str(args.get("expression", ""))
    try:
        return str(_safe_eval(ast.parse(expr, mode="eval")))
    except Exception as e:
        return f"计算出错: {e}"


def _current_time(args: dict) -> str:
    return datetime.now(timezone.utc).isoformat()


def _text_stats(args: dict) -> str:
    text = str(args.get("text", ""))
    chars = len(text)
    words = len(text.split())
    return f"字符数={chars}, 词数={words}"


REGISTRY: dict[str, Tool] = {
    "calculator": Tool(
        name="calculator",
        description="计算一个数学表达式(支持 + - * / ** %)。需要算数时用它,别心算。",
        input_schema={
            "type": "object",
            "properties": {"expression": {"type": "string", "description": "如 (2+3)*4"}},
            "required": ["expression"],
        },
        run=_calculator,
    ),
    "current_time": Tool(
        name="current_time",
        description="返回当前 UTC 时间(ISO 格式)。需要知道现在时间时用。",
        input_schema={"type": "object", "properties": {}},
        run=_current_time,
    ),
    "text_stats": Tool(
        name="text_stats",
        description="统计一段文本的字符数和词数。",
        input_schema={
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
        run=_text_stats,
    ),
}

ALL_TOOL_NAMES = list(REGISTRY.keys())


def anthropic_tools_spec(tool_names: list[str]) -> list[dict]:
    """转成 Anthropic tools 参数格式。"""
    return [
        {"name": t.name, "description": t.description, "input_schema": t.input_schema}
        for n in tool_names
        if (t := REGISTRY.get(n))
    ]


def run_tool(name: str, args: dict) -> str:
    tool = REGISTRY.get(name)
    if tool is None:
        return f"未知工具: {name}"
    return tool.run(args)
