package agent

import (
	"context"
	"testing"

	"agora/internal/llm"
	"agora/internal/tools"
)

func TestAgentExecutesToolThenAnswers(t *testing.T) {
	orig := llm.StreamTurn
	defer func() { llm.StreamTurn = orig }()

	turn := 0
	llm.StreamTurn = func(ctx context.Context, auth llm.Auth, req llm.Request, emit func(string)) (*llm.Message, error) {
		turn++
		if turn == 1 {
			return &llm.Message{Content: []llm.Block{
				{Type: "tool_use", ID: "t1", Name: "calculator", Input: map[string]any{"expression": "2+3"}},
			}}, nil
		}
		emit("答案是 5")
		return &llm.Message{Content: []llm.Block{{Type: "text", Text: "答案是 5"}}}, nil
	}

	runner := func(ctx context.Context, name string, input map[string]any) (string, error) {
		return tools.RunPure(name, input), nil
	}

	var ev []Event
	Run(context.Background(), Params{
		Messages: []map[string]any{{"role": "user", "content": "2+3?"}},
		System:   "sys", ToolNames: []string{"calculator"},
		Auth: llm.Auth{Mode: "apikey", Secret: "dummy"}, Model: "m", MaxTokens: 100,
	}, runner, func(e Event) { ev = append(ev, e) })

	var tcall, tres, final *Event
	for i := range ev {
		switch ev[i].Type {
		case "tool_call":
			tcall = &ev[i]
		case "tool_result":
			tres = &ev[i]
		case "final":
			final = &ev[i]
		}
	}
	if tcall == nil || tcall.Name != "calculator" {
		t.Fatal("应有 calculator 工具调用")
	}
	if tres == nil || tres.Output != "5" {
		t.Fatalf("工具结果应为 5, got %v", tres)
	}
	if final == nil || final.Text != "答案是 5" {
		t.Fatalf("最终答复错误: %v", final)
	}
	if turn != 2 {
		t.Errorf("应跑 2 轮, got %d", turn)
	}
}

// 多智能体:协调者通过 delegate(子 agent 当工具)委派,验证嵌套循环。
func TestMultiAgentDelegate(t *testing.T) {
	orig := llm.StreamTurn
	defer func() { llm.StreamTurn = orig }()

	turn := 0
	llm.StreamTurn = func(ctx context.Context, auth llm.Auth, req llm.Request, emit func(string)) (*llm.Message, error) {
		turn++
		switch turn {
		case 1: // 协调者:委派
			return &llm.Message{Content: []llm.Block{
				{Type: "tool_use", ID: "d1", Name: "delegate", Input: map[string]any{"agent": "助手", "task": "算 2+3"}},
			}}, nil
		case 2: // 子 agent:答复
			emit("5")
			return &llm.Message{Content: []llm.Block{{Type: "text", Text: "5"}}}, nil
		default: // 协调者:汇总
			emit("助手算出是 5")
			return &llm.Message{Content: []llm.Block{{Type: "text", Text: "助手算出是 5"}}}, nil
		}
	}

	// 测试用 runner:delegate 跑一个嵌套 agent(无 DB,内联子 agent)
	var runner ToolRunner
	runner = func(ctx context.Context, name string, input map[string]any) (string, error) {
		if name == "delegate" {
			answer := ""
			Run(ctx, Params{
				Messages:  []map[string]any{{"role": "user", "content": input["task"].(string)}},
				System:    "你是助手", ToolNames: []string{},
				Auth: llm.Auth{Mode: "apikey", Secret: "dummy"}, Model: "m", MaxTokens: 100,
			}, runner, func(e Event) {
				if e.Type == "final" {
					answer = e.Text
				}
			})
			return answer, nil
		}
		return tools.RunPure(name, input), nil
	}

	var ev []Event
	Run(context.Background(), Params{
		Messages: []map[string]any{{"role": "user", "content": "帮我算 2+3"}},
		System:   "你是协调者", ToolNames: []string{"delegate"},
		Auth: llm.Auth{Mode: "apikey", Secret: "dummy"}, Model: "m", MaxTokens: 100,
	}, runner, func(e Event) { ev = append(ev, e) })

	var tres, final *Event
	for i := range ev {
		switch ev[i].Type {
		case "tool_result":
			tres = &ev[i]
		case "final":
			final = &ev[i]
		}
	}
	if tres == nil || tres.Output != "5" {
		t.Fatalf("委派结果应是子 agent 的答复 5, got %v", tres)
	}
	if final == nil || final.Text != "助手算出是 5" {
		t.Fatalf("协调者汇总错误: %v", final)
	}
	if turn != 3 {
		t.Errorf("应跑 3 轮(协调者2+子1), got %d", turn)
	}
}
