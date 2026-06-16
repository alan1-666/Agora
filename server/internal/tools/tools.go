// Package tools 内置工具注册表 + 安全四则运算求值。
package tools

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"agora/internal/llm"
)

type Tool struct {
	Name        string
	Description string
	InputSchema map[string]any
	Run         func(map[string]any) string
}

func argStr(args map[string]any, k string) string {
	if v, ok := args[k].(string); ok {
		return v
	}
	return ""
}

var Registry = map[string]Tool{
	"calculator": {
		Name:        "calculator",
		Description: "计算一个数学表达式(支持 + - * / ** %)。需要算数时用它,别心算。",
		InputSchema: map[string]any{
			"type":       "object",
			"properties": map[string]any{"expression": map[string]any{"type": "string"}},
			"required":   []string{"expression"},
		},
		Run: func(a map[string]any) string {
			v, err := Eval(argStr(a, "expression"))
			if err != nil {
				return "计算出错: " + err.Error()
			}
			return trimNum(v)
		},
	},
	"current_time": {
		Name:        "current_time",
		Description: "返回当前 UTC 时间(ISO 格式)。需要知道现在时间时用。",
		InputSchema: map[string]any{"type": "object", "properties": map[string]any{}},
		Run:         func(map[string]any) string { return time.Now().UTC().Format(time.RFC3339) },
	},
	"text_stats": {
		Name:        "text_stats",
		Description: "统计一段文本的字符数和词数。",
		InputSchema: map[string]any{
			"type":       "object",
			"properties": map[string]any{"text": map[string]any{"type": "string"}},
			"required":   []string{"text"},
		},
		Run: func(a map[string]any) string {
			t := argStr(a, "text")
			return fmt.Sprintf("字符数=%d, 词数=%d", utf8.RuneCountInString(t), len(strings.Fields(t)))
		},
	},
	"delegate": {
		Name:        "delegate",
		Description: "把一个子任务委派给另一个 agent 完成,返回它的结果。用于把复杂任务拆给合适的专家 agent。",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"agent": map[string]any{"type": "string", "description": "目标 agent 名称"},
				"task":  map[string]any{"type": "string", "description": "交给它的具体子任务"},
			},
			"required": []string{"agent", "task"},
		},
		Run: func(map[string]any) string { return "(委派需在会话上下文中执行)" },
	},
	"remember": {
		Name:        "remember",
		Description: "把一条值得长期记住的信息(用户偏好、背景、约定等)存入记忆,以后跨会话可回忆。",
		InputSchema: map[string]any{
			"type":       "object",
			"properties": map[string]any{"fact": map[string]any{"type": "string"}},
			"required":   []string{"fact"},
		},
		Run: func(map[string]any) string { return "(记忆需在会话上下文中执行)" },
	},
}

// AllNames 全部工具名(稳定顺序)。
var AllNames = []string{"calculator", "current_time", "text_stats", "delegate", "remember"}

// Spec 转成 Anthropic tools 参数。
func Spec(names []string) []llm.ToolSpec {
	var out []llm.ToolSpec
	for _, n := range names {
		if t, ok := Registry[n]; ok {
			out = append(out, llm.ToolSpec{Name: t.Name, Description: t.Description, InputSchema: t.InputSchema})
		}
	}
	return out
}

// RunPure 执行纯工具(calculator 等);delegate/remember 由上层 runner 处理。
func RunPure(name string, args map[string]any) string {
	if t, ok := Registry[name]; ok {
		return t.Run(args)
	}
	return "未知工具: " + name
}

func trimNum(f float64) string {
	if f == float64(int64(f)) {
		return fmt.Sprintf("%d", int64(f))
	}
	return fmt.Sprintf("%g", f)
}
