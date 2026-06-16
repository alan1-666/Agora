package tools

import "testing"

func TestEval(t *testing.T) {
	cases := map[string]float64{
		"(2+3)*4": 20,
		"2**10":   1024,
		"10%3":    1,
		"-5+2":    -3,
	}
	for expr, want := range cases {
		got, err := Eval(expr)
		if err != nil || got != want {
			t.Errorf("Eval(%q)=%v,%v want %v", expr, got, err, want)
		}
	}
}

func TestEvalRejectsUnsafe(t *testing.T) {
	if _, err := Eval("foo(1)"); err == nil {
		t.Error("非法表达式应报错")
	}
}

func TestCalculatorTool(t *testing.T) {
	if got := RunPure("calculator", map[string]any{"expression": "(13*17)+5"}); got != "226" {
		t.Errorf("calculator=%q want 226", got)
	}
}

func TestTextStats(t *testing.T) {
	if got := RunPure("text_stats", map[string]any{"text": "hello world"}); got != "字符数=11, 词数=2" {
		t.Errorf("text_stats=%q", got)
	}
}
