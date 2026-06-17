// Package runtime 把任务交给本机已登录的编码 CLI 执行(Raft 模式)。
// 当前支持 Claude Code(`claude -p`):用用户自己的订阅登录,无需 API key / OAuth。
package runtime

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Msg struct {
	Role    string
	Content string
}

// Available 本机是否装了 claude CLI。
func Available() bool {
	_, err := exec.LookPath("claude")
	return err == nil
}

// Version 取 claude 版本(失败返回空)。
func Version() string {
	out, err := exec.Command("claude", "--version").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func workDir() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".agora", "work")
	_ = os.MkdirAll(dir, 0o755)
	return dir
}

// RunClaude 用 claude -p 跑一轮:把(可选)历史作为上下文 + 当前消息作为任务,
// system 作为人设(append 到 Claude Code 默认 system),返回最终回复文本。
func RunClaude(ctx context.Context, system, model string, history []Msg, content string) (string, error) {
	prompt := content
	if len(history) > 0 {
		var b strings.Builder
		b.WriteString("【对话历史(供参考)】\n")
		for _, m := range history {
			who := "用户"
			if m.Role == "assistant" {
				who = "助手"
			}
			b.WriteString(who + "：" + m.Content + "\n")
		}
		b.WriteString("\n【当前消息】\n" + content)
		prompt = b.String()
	}

	args := []string{"-p", prompt, "--output-format", "text"}
	if system != "" {
		args = append(args, "--append-system-prompt", system)
	}
	if model != "" {
		args = append(args, "--model", model)
	}

	cmd := exec.CommandContext(ctx, "claude", args...)
	cmd.Dir = workDir()
	var errb bytes.Buffer
	cmd.Stderr = &errb
	out, err := cmd.Output()
	if err != nil {
		msg := strings.TrimSpace(errb.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("claude 运行失败：%s", msg)
	}
	return strings.TrimSpace(string(out)), nil
}
