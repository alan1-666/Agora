"""工具单测(离线、确定性)。"""

from app.tools import ALL_TOOL_NAMES, anthropic_tools_spec, run_tool


def test_calculator():
    assert run_tool("calculator", {"expression": "(2+3)*4"}) == "20"
    assert run_tool("calculator", {"expression": "2**10"}) == "1024"


def test_calculator_rejects_unsafe():
    # 非算术表达式应被安全拒绝,而不是执行任意代码
    out = run_tool("calculator", {"expression": "__import__('os').system('ls')"})
    assert "出错" in out


def test_text_stats():
    assert run_tool("text_stats", {"text": "hello world"}) == "字符数=11, 词数=2"


def test_unknown_tool():
    assert "未知" in run_tool("nope", {})


def test_spec_format():
    spec = anthropic_tools_spec(ALL_TOOL_NAMES)
    assert len(spec) == len(ALL_TOOL_NAMES) >= 4  # calculator/current_time/text_stats/remember
    assert all({"name", "description", "input_schema"} <= set(t) for t in spec)
