package server

import (
	"context"
	"encoding/json"
	"strings"
	"sync"

	"agora/internal/hub"
	"agora/internal/runtime"
	"agora/internal/store"
)

// plan 是协调者拆解任务的结构化输出。
type plan struct {
	Mode     string `json:"mode"` // delegate | direct
	Note     string `json:"note"` // 给用户看的分工说明(delegate 时)
	Answer   string `json:"answer"`
	Subtasks []struct {
		Member string `json:"member"`
		Task   string `json:"task"`
	} `json:"subtasks"`
}

// runOrchestration 协调者编排:协调者拆任务 → 工人并行执行 → 协调者综合。
func (s *Server) runOrchestration(channelID, threadID string, parent *string, coord store.Agent, members []store.Agent) {
	ctx := context.Background()
	pub := func(ev hub.Event) { s.hub.Publish(channelID, ev) }

	// 触发消息 + 历史上下文
	content, hist := s.scopeHistory(ctx, channelID, threadID, parent)

	// ① 拆解:协调者按结构化 JSON 决定自己答 / 分工
	pub(hub.Event{"type": "activity", "state": "working", "agent": coord.Name})
	planSys := coord.SystemPrompt + planPrompt(members, coord.Name)
	raw, err := runtime.RunClaude(ctx, planSys, modelOf(coord), hist, content)
	if err != nil {
		pub(hub.Event{"type": "activity", "kind": "error", "text": err.Error()})
		pub(hub.Event{"type": "activity", "state": "done"})
		return
	}
	p := parsePlan(raw)

	// 协调者选择自己答(或解析失败兜底为直接回答)
	if p.Mode != "delegate" || len(p.Subtasks) == 0 {
		answer := strings.TrimSpace(p.Answer)
		if answer == "" {
			answer = raw // 兜底:JSON 没解析出来就把原文当回答
		}
		s.saveAndPublish(ctx, channelID, parent, coord.Name, answer, "")
		pub(hub.Event{"type": "activity", "state": "done"})
		return
	}

	// ② 分工说明先发出来(让用户看到协调者怎么拆的)
	if note := strings.TrimSpace(p.Note); note != "" {
		s.saveAndPublish(ctx, channelID, parent, coord.Name, note, "")
	}

	// ③ 工人并行执行,各自只拿到自己那块子任务
	type result struct {
		name, task, out string
	}
	results := make([]result, len(p.Subtasks))
	var wg sync.WaitGroup
	for i, st := range p.Subtasks {
		w := findMember(members, st.Member)
		if w == nil || w.Name == coord.Name {
			continue
		}
		wg.Add(1)
		go func(i int, task string, w store.Agent) {
			defer wg.Done()
			pub(hub.Event{"type": "activity", "state": "working", "agent": w.Name})
			sys := w.SystemPrompt + "\n\n【协调者指派】你受「" + coord.Name + "」指派,只需完成下面这块,简洁、聚焦地交付你的结果:\n" + task
			out, err := runtime.RunClaude(ctx, sys, modelOf(w), hist, task)
			if err != nil {
				out = "⚠️ " + err.Error()
			}
			// 工人消息记 relay_from=协调者,前端据此把"协调者 → 工人"连成串
			s.saveAndPublish(ctx, channelID, parent, w.Name, out, coord.Name)
			results[i] = result{w.Name, task, out}
		}(i, st.Task, *w)
	}
	wg.Wait()

	// ④ 综合:协调者拿到全部工人结果,产出给用户的最终回答
	pub(hub.Event{"type": "activity", "state": "working", "agent": coord.Name})
	var b strings.Builder
	b.WriteString("用户的原始请求:\n" + content + "\n\n各成员已交付:")
	for _, r := range results {
		if r.name == "" {
			continue
		}
		b.WriteString("\n\n【" + r.name + "】(负责:" + r.task + ")\n" + r.out)
	}
	b.WriteString("\n\n请综合以上,给用户一个完整、连贯的最终回答(不要逐条复述,要整合)。")
	final, err := runtime.RunClaude(ctx, coord.SystemPrompt+synthPrompt(), modelOf(coord), nil, b.String())
	if err != nil {
		final = "⚠️ 综合失败:" + err.Error()
	}
	s.saveAndPublish(ctx, channelID, parent, coord.Name, final, "")
	pub(hub.Event{"type": "activity", "state": "done"})
}

// scopeHistory 取作用域内的历史:最后一条作为当前触发内容,其余作为上下文。
func (s *Server) scopeHistory(ctx context.Context, channelID, threadID string, parent *string) (string, []runtime.Msg) {
	var history []store.Message
	if parent != nil {
		history, _ = s.st.ListThread(ctx, threadID)
	} else {
		history, _ = s.st.ListMessages(ctx, channelID)
	}
	content := ""
	var hist []runtime.Msg
	for i, m := range history {
		if i == len(history)-1 {
			content = m.Content
			break
		}
		hist = append(hist, runtime.Msg{Role: m.Role, Content: m.Content})
	}
	return content, hist
}

// saveAndPublish 落一条 assistant 消息并推送(author=作者,relayFrom 非空=接力/指派来源)。
func (s *Server) saveAndPublish(ctx context.Context, channelID string, parent *string, author, content, relayFrom string) {
	if strings.TrimSpace(content) == "" {
		return
	}
	a := author
	var rf *string
	if relayFrom != "" {
		rf = &relayFrom
	}
	if m, e := s.st.AddMessage(ctx, channelID, "assistant", content, parent, &a, rf); e == nil {
		s.hub.Publish(channelID, hub.Event{"type": "message", "message": m})
	}
}

func findMember(members []store.Agent, name string) *store.Agent {
	name = strings.TrimSpace(strings.TrimPrefix(name, "@"))
	for i := range members {
		if members[i].Name == name {
			return &members[i]
		}
	}
	return nil
}

func modelOf(a store.Agent) string {
	if a.Model != nil {
		return *a.Model
	}
	return ""
}

// parsePlan 从协调者输出里抽出 JSON 计划;抽不出就返回空(调用方兜底为直接回答)。
func parsePlan(raw string) plan {
	var p plan
	s := raw
	// 去掉 ```json ... ``` 围栏
	if i := strings.Index(s, "```"); i >= 0 {
		s = s[i+3:]
		s = strings.TrimPrefix(s, "json")
		if j := strings.Index(s, "```"); j >= 0 {
			s = s[:j]
		}
	}
	// 截取第一个 { 到最后一个 }
	lo, hi := strings.Index(s, "{"), strings.LastIndex(s, "}")
	if lo < 0 || hi <= lo {
		return p
	}
	_ = json.Unmarshal([]byte(s[lo:hi+1]), &p)
	return p
}

func planPrompt(members []store.Agent, self string) string {
	var b strings.Builder
	b.WriteString("\n\n【你是本频道的协调者】可调用的成员:")
	for _, m := range members {
		if m.Name == self {
			continue
		}
		sp := m.SystemPrompt
		if r := []rune(sp); len(r) > 60 {
			sp = string(r[:60])
		}
		b.WriteString("\n- " + m.Name + "：" + sp)
	}
	b.WriteString("\n\n请判断如何完成用户请求,**只输出一个 JSON**(不要任何额外文字):" +
		"\n- 若需要分工:{\"mode\":\"delegate\",\"note\":\"一句话说明你怎么分工\",\"subtasks\":[{\"member\":\"成员名\",\"task\":\"交给TA的具体子任务\"}]}" +
		"\n- 若你自己就能答:{\"mode\":\"direct\",\"answer\":\"你的回答\"}" +
		"\nmember 必须是上面列出的确切名字;只分给真正需要的成员。")
	return b.String()
}

func synthPrompt() string {
	return "\n\n【综合阶段】你是协调者,下面给你各成员的交付物,请整合成给用户的最终回答。语言与用户一致,自然连贯,不要逐条复述、不要暴露内部分工细节。"
}
