// Package orchestration 统一的工具执行器:remember(记忆)/ delegate(多智能体委派)/ 纯工具。
package orchestration

import (
	"context"

	"agora/internal/agent"
	"agora/internal/embed"
	"agora/internal/llm"
	"agora/internal/store"
	"agora/internal/tools"
)

const maxDelegateDepth = 2

func argStr(m map[string]any, k string) string {
	if v, ok := m[k].(string); ok {
		return v
	}
	return ""
}

// MakeToolRunner 构造一个工具执行器。delegate 会跑嵌套的 agent(深度防护)。
func MakeToolRunner(st *store.Store, auth llm.Auth, model string, maxTokens, depth int) agent.ToolRunner {
	return func(ctx context.Context, name string, input map[string]any) (string, error) {
		switch name {
		case "remember":
			fact := argStr(input, "fact")
			if err := st.AddMemory(ctx, fact, embed.One(fact)); err != nil {
				return "", err
			}
			return "已记住", nil

		case "delegate":
			if depth >= maxDelegateDepth {
				return "委派层级过深,已停止(防止无限委派)。", nil
			}
			agentName := argStr(input, "agent")
			task := argStr(input, "task")
			sub, err := st.GetAgentByName(ctx, agentName)
			if err != nil {
				return "", err
			}
			if sub == nil {
				return "找不到名为「" + agentName + "」的 agent。", nil
			}
			subModel := model
			if sub.Model != nil && *sub.Model != "" {
				subModel = *sub.Model
			}
			answer := ""
			agent.Run(ctx, agent.Params{
				Messages:  []map[string]any{{"role": "user", "content": task}},
				System:    sub.SystemPrompt,
				ToolNames: sub.Tools,
				Auth:      auth,
				Model:     subModel,
				MaxTokens: maxTokens,
			}, MakeToolRunner(st, auth, model, maxTokens, depth+1), func(e agent.Event) {
				if e.Type == "final" {
					answer = e.Text
				}
			})
			if answer == "" {
				answer = "(子任务无结果)"
			}
			return answer, nil

		default:
			return tools.RunPure(name, input), nil
		}
	}
}
