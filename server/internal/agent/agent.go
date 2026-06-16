// Package agent 实现 agent 工具循环(模型→工具→喂回→直到完成)。与 Python 版同逻辑。
package agent

import (
	"context"
	"strings"

	"agora/internal/llm"
	"agora/internal/tools"
)

const maxTurns = 8

type Event struct {
	Type   string         // delta | tool_call | tool_result | final | error
	Text   string         // delta/final/error
	Name   string         // tool_call/tool_result
	Input  map[string]any // tool_call
	Output string         // tool_result
}

type Params struct {
	Messages  []map[string]any
	System    string
	ToolNames []string
	Auth      llm.Auth
	Model     string
	MaxTokens int
}

// ToolRunner 执行工具,支持有状态工具(remember 写记忆 / delegate 跑子 agent)。
type ToolRunner func(ctx context.Context, name string, input map[string]any) (string, error)

// Run 跑完整 agent loop,逐个事件回调 emit。
func Run(ctx context.Context, p Params, runner ToolRunner, emit func(Event)) {
	if p.Auth.Secret == "" {
		emit(Event{Type: "error", Text: "未配置模型鉴权:请填 API key 或登录 Claude。"})
		return
	}
	spec := tools.Spec(p.ToolNames)
	convo := append([]map[string]any{}, p.Messages...)

	for turn := 0; turn < maxTurns; turn++ {
		var turnText strings.Builder
		msg, err := llm.StreamTurn(ctx, p.Auth, llm.Request{
			Model: p.Model, MaxTokens: p.MaxTokens, System: p.System, Messages: convo, Tools: spec,
		}, func(d string) {
			turnText.WriteString(d)
			emit(Event{Type: "delta", Text: d})
		})
		if err != nil {
			emit(Event{Type: "error", Text: err.Error()})
			return
		}

		convo = append(convo, map[string]any{"role": "assistant", "content": blocksToContent(msg.Content)})

		var toolResults []map[string]any
		for _, b := range msg.Content {
			if b.Type == "tool_use" {
				emit(Event{Type: "tool_call", Name: b.Name, Input: b.Input})
				out, rerr := runner(ctx, b.Name, b.Input)
				if rerr != nil {
					out = "工具出错: " + rerr.Error()
				}
				emit(Event{Type: "tool_result", Name: b.Name, Output: out})
				toolResults = append(toolResults, map[string]any{
					"type": "tool_result", "tool_use_id": b.ID, "content": out,
				})
			}
		}

		if len(toolResults) > 0 {
			convo = append(convo, map[string]any{"role": "user", "content": toolResults})
			continue
		}
		emit(Event{Type: "final", Text: turnText.String()})
		return
	}
	emit(Event{Type: "final", Text: "(达到最大工具轮数)"})
}

func blocksToContent(blocks []llm.Block) []map[string]any {
	out := []map[string]any{}
	for _, b := range blocks {
		switch b.Type {
		case "text":
			if b.Text == "" {
				continue // Anthropic 拒绝空 text 块
			}
			out = append(out, map[string]any{"type": "text", "text": b.Text})
		case "tool_use":
			out = append(out, map[string]any{"type": "tool_use", "id": b.ID, "name": b.Name, "input": b.Input})
		}
	}
	return out
}
