// Package llm 手写 Anthropic Messages API 流式客户端(支持 x-api-key 与 OAuth Bearer 两种鉴权)。
package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

const apiURL = "https://api.anthropic.com/v1/messages"

// Auth 决定怎么鉴权。Mode: "apikey"(走 x-api-key) 或 "oauth"(走订阅 Bearer token)。
type Auth struct {
	Mode   string
	Secret string
}

type ToolSpec struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"input_schema"`
}

type Block struct {
	Type  string         // text | tool_use
	Text  string         // type=text
	ID    string         // type=tool_use
	Name  string         // type=tool_use
	Input map[string]any // type=tool_use
}

type Message struct {
	Content    []Block
	StopReason string
}

type Request struct {
	Model     string
	MaxTokens int
	System    string
	Messages  []map[string]any
	Tools     []ToolSpec
}

// StreamTurn 跑一轮模型调用:文本增量通过 emitDelta 回调实时吐出,最后返回完整 Message。
// 设计成包级变量,便于测试时替换为脚本化的假实现(离线、不发网络)。
var StreamTurn = func(ctx context.Context, auth Auth, req Request, emitDelta func(string)) (*Message, error) {
	body := map[string]any{
		"model":      req.Model,
		"max_tokens": req.MaxTokens,
		"system":     req.System,
		"messages":   req.Messages,
		"stream":     true,
	}
	if len(req.Tools) > 0 {
		body["tools"] = req.Tools
	}
	buf, _ := json.Marshal(body)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	if auth.Mode == "oauth" {
		httpReq.Header.Set("Authorization", "Bearer "+auth.Secret)
		httpReq.Header.Set("anthropic-beta", "oauth-2025-04-20")
	} else {
		httpReq.Header.Set("x-api-key", auth.Secret)
	}

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b := new(bytes.Buffer)
		b.ReadFrom(resp.Body)
		return nil, fmt.Errorf("anthropic %d: %s", resp.StatusCode, b.String())
	}

	// 逐块累积:text 直接拼;tool_use 的 input 是分片 JSON,先攒字符串最后解析
	blocks := map[int]*Block{}
	toolJSON := map[int]*strings.Builder{}
	stopReason := ""

	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var ev map[string]any
		if err := json.Unmarshal([]byte(line[6:]), &ev); err != nil {
			continue
		}
		switch ev["type"] {
		case "content_block_start":
			idx := int(ev["index"].(float64))
			cb, _ := ev["content_block"].(map[string]any)
			b := &Block{Type: str(cb["type"])}
			if b.Type == "tool_use" {
				b.ID = str(cb["id"])
				b.Name = str(cb["name"])
				toolJSON[idx] = &strings.Builder{}
			}
			blocks[idx] = b
		case "content_block_delta":
			idx := int(ev["index"].(float64))
			d, _ := ev["delta"].(map[string]any)
			switch d["type"] {
			case "text_delta":
				t := str(d["text"])
				if b := blocks[idx]; b != nil {
					b.Text += t
				}
				if emitDelta != nil {
					emitDelta(t)
				}
			case "input_json_delta":
				if sb := toolJSON[idx]; sb != nil {
					sb.WriteString(str(d["partial_json"]))
				}
			}
		case "content_block_stop":
			idx := int(ev["index"].(float64))
			if b := blocks[idx]; b != nil && b.Type == "tool_use" {
				b.Input = map[string]any{}
				if sb := toolJSON[idx]; sb != nil && sb.Len() > 0 {
					_ = json.Unmarshal([]byte(sb.String()), &b.Input)
				}
			}
		case "message_delta":
			if d, ok := ev["delta"].(map[string]any); ok {
				if sr, ok := d["stop_reason"].(string); ok {
					stopReason = sr
				}
			}
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}

	// 按 index 顺序组装
	msg := &Message{StopReason: stopReason}
	for i := 0; i < len(blocks); i++ {
		if b := blocks[i]; b != nil {
			msg.Content = append(msg.Content, *b)
		}
	}
	return msg, nil
}

func str(v any) string {
	s, _ := v.(string)
	return s
}
