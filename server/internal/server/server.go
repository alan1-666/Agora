// Package server Gin 路由与处理器。
package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"agora/internal/agent"
	"agora/internal/config"
	"agora/internal/hub"
	"agora/internal/llm"
	"agora/internal/orchestration"
	"agora/internal/rag"
	"agora/internal/store"
	"agora/internal/tools"
)

type Server struct {
	cfg config.Config
	st  *store.Store
	hub *hub.Hub
}

func New(cfg config.Config, st *store.Store, h *hub.Hub) *Server {
	return &Server{cfg: cfg, st: st, hub: h}
}

func (s *Server) Routes(r *gin.Engine) {
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "model": s.cfg.Model})
	})
	api := r.Group("/api")
	api.GET("/tools", s.listTools)
	api.GET("/agents", s.listAgents)
	api.POST("/agents", s.createAgent)
	api.PUT("/agents/:id", s.updateAgent)
	api.DELETE("/agents/:id", s.deleteAgent)
	api.GET("/channels", s.listChannels)
	api.POST("/channels", s.createChannel)
	api.GET("/dms", s.listDMs)
	api.POST("/dms", s.openDM)
	api.GET("/channels/:id/messages", s.listMessages)
	api.GET("/channels/:id/stream", s.channelStream)
	api.GET("/threads/:id", s.listThread)
	api.GET("/documents", s.listDocuments)
	api.POST("/documents", s.uploadDocument)
	api.GET("/org/key", s.keyStatus)
	api.PUT("/org/key", s.setKey)
	api.POST("/chat/dispatch", s.dispatch)
	s.registerOAuth(api)
}

// ---------- tools / agents ----------

func (s *Server) listTools(c *gin.Context) {
	out := []gin.H{}
	for _, n := range tools.AllNames {
		t := tools.Registry[n]
		out = append(out, gin.H{"name": t.Name, "description": t.Description})
	}
	c.JSON(200, out)
}

var workerTools = func() []string {
	var w []string
	for _, n := range tools.AllNames {
		if n != "delegate" {
			w = append(w, n)
		}
	}
	return w
}()

func (s *Server) seedDefaults(c *gin.Context) ([]store.Agent, error) {
	worker, err := s.st.CreateAgent(c, store.Agent{
		Name:         "助手",
		SystemPrompt: "你是 Agora 里的 AI 助手。需要算数、查时间、统计文本时,调用对应工具,不要心算。",
		Tools:        workerTools,
	})
	if err != nil {
		return nil, err
	}
	coord, err := s.st.CreateAgent(c, store.Agent{
		Name: "协调者",
		SystemPrompt: "你是协调者。把复杂任务拆成子任务,用 delegate 工具委派给合适的下属 agent 完成," +
			"再把结果汇总成清晰的最终答复。可委派的 agent 见下方花名册。",
		Tools: []string{"delegate", "remember"},
	})
	if err != nil {
		return nil, err
	}
	return []store.Agent{worker, coord}, nil
}

func (s *Server) listAgents(c *gin.Context) {
	agents, err := s.st.ListAgents(c)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if len(agents) == 0 {
		if agents, err = s.seedDefaults(c); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(200, agents)
}

func (s *Server) createAgent(c *gin.Context) {
	var req store.Agent
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "参数错误"})
		return
	}
	var clean []string
	for _, t := range req.Tools {
		if _, ok := tools.Registry[t]; ok {
			clean = append(clean, t)
		}
	}
	req.Tools = clean
	a, err := s.st.CreateAgent(c, req)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, a)
}

func cleanTools(in []string) []string {
	var out []string
	for _, t := range in {
		if _, ok := tools.Registry[t]; ok {
			out = append(out, t)
		}
	}
	return out
}

func (s *Server) updateAgent(c *gin.Context) {
	var req store.Agent
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "参数错误"})
		return
	}
	req.Tools = cleanTools(req.Tools)
	a, err := s.st.UpdateAgent(c, c.Param("id"), req)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, a)
}

func (s *Server) deleteAgent(c *gin.Context) {
	if err := s.st.DeleteAgent(c, c.Param("id")); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"ok": true})
}

// ---------- channels / messages ----------

func (s *Server) listChannels(c *gin.Context) {
	chs, err := s.st.ListChannels(c)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if chs == nil {
		chs = []store.Channel{}
	}
	c.JSON(200, chs)
}

func (s *Server) createChannel(c *gin.Context) {
	var req struct {
		Name string `json:"name"`
	}
	_ = c.ShouldBindJSON(&req)
	if req.Name == "" {
		req.Name = "general"
	}
	ch, err := s.st.CreateChannel(c, req.Name)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, ch)
}

func (s *Server) listDMs(c *gin.Context) {
	dms, err := s.st.ListDMs(c)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, dms)
}

func (s *Server) openDM(c *gin.Context) {
	var req struct {
		AgentID string `json:"agent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.AgentID == "" {
		c.JSON(400, gin.H{"error": "缺少 agent_id"})
		return
	}
	dm, err := s.st.GetOrCreateDM(c, req.AgentID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, dm)
}

func (s *Server) listMessages(c *gin.Context) {
	msgs, err := s.st.ListMessages(c, c.Param("id"))
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, msgs)
}

func (s *Server) listThread(c *gin.Context) {
	msgs, err := s.st.ListThread(c, c.Param("id"))
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, msgs)
}

// ---------- documents ----------

func (s *Server) listDocuments(c *gin.Context) {
	docs, err := s.st.ListDocuments(c)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, docs)
}

func (s *Server) uploadDocument(c *gin.Context) {
	var req struct {
		Name string `json:"name"`
		Text string `json:"text"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "参数错误"})
		return
	}
	id, n, err := rag.Ingest(c, s.st, req.Name, req.Text)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"id": id, "name": req.Name, "chunks": n})
}

// ---------- 模型凭证 ----------

func (s *Server) keyStatus(c *gin.Context) {
	st, err := s.st.KeyStatus(c)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, st)
}

func (s *Server) setKey(c *gin.Context) {
	var req struct {
		APIKey string `json:"api_key"`
		Model  string `json:"model"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.APIKey == "" {
		c.JSON(400, gin.H{"error": "参数错误"})
		return
	}
	if err := s.st.SetAPIKey(c, req.APIKey, req.Model); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"ok": true})
}

// ---------- 流式对话(经 agent) ----------

func rosterText(agents []store.Agent, exclude string) string {
	var b strings.Builder
	first := true
	for _, a := range agents {
		if a.Name == exclude {
			continue
		}
		if first {
			b.WriteString("\n\n【可委派的 agent 花名册】")
			first = false
		}
		sp := a.SystemPrompt
		if r := []rune(sp); len(r) > 60 {
			sp = string(r[:60])
		}
		b.WriteString("\n- " + a.Name + ":" + sp)
	}
	return b.String()
}

// channelStream 是频道的实时事件流(SSE):订阅 hub,把新消息/agent 活动推给前端。
func (s *Server) channelStream(c *gin.Context) {
	channelID := c.Param("id")
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(500, gin.H{"error": "stream unsupported"})
		return
	}

	ch := s.hub.Subscribe(channelID)
	defer s.hub.Unsubscribe(channelID, ch)
	c.Writer.Write([]byte(": connected\n\n"))
	flusher.Flush()

	ctx := c.Request.Context()
	for {
		select {
		case ev := <-ch:
			b, _ := json.Marshal(ev)
			c.Writer.Write([]byte("data: " + string(b) + "\n\n"))
			flusher.Flush()
		case <-ctx.Done():
			return
		}
	}
}

// dispatch 派活:存下用户消息并立即返回,agent 在后台 goroutine 里干活,
// 进度(delta/工具)与最终结果通过 hub 推给该频道的订阅者。客户端断开也不影响后台完成。
func (s *Server) dispatch(c *gin.Context) {
	var req struct {
		ChannelID string `json:"channel_id"`
		Content   string `json:"content"`
		AgentID   string `json:"agent_id"`
		ThreadID  string `json:"thread_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "参数错误"})
		return
	}
	if ok, _ := s.st.ChannelExists(c, req.ChannelID); !ok {
		c.JSON(404, gin.H{"error": "频道不存在"})
		return
	}

	agents, _ := s.st.ListAgents(c)
	if len(agents) == 0 {
		agents, _ = s.seedDefaults(c)
	}
	ag := agents[0]
	if req.AgentID != "" {
		for _, a := range agents {
			if a.ID == req.AgentID {
				ag = a
			}
		}
	}

	var parent *string
	if req.ThreadID != "" {
		parent = &req.ThreadID
	}
	// 存用户消息并立即推给订阅者
	userMsg, err := s.st.AddMessage(c, req.ChannelID, "user", req.Content, parent)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	s.hub.Publish(req.ChannelID, hub.Event{"type": "message", "message": userMsg})

	// 解析鉴权/模型(在请求上下文内,goroutine 用 bg ctx)
	llmAuth := s.resolveAuth(c)
	model := s.cfg.Model
	if st, _ := s.st.KeyStatus(c); st.Model != "" {
		model = st.Model
	}
	if ag.Model != nil && *ag.Model != "" {
		model = *ag.Model
	}

	c.JSON(202, gin.H{"ok": true})

	// 后台干活
	go s.runTask(req.ChannelID, req.ThreadID, parent, req.Content, ag, agents, llmAuth, model)
}

func (s *Server) runTask(
	channelID, threadID string, parent *string, content string,
	ag store.Agent, agents []store.Agent, llmAuth llm.Auth, model string,
) {
	ctx := context.Background()
	pub := func(ev hub.Event) { s.hub.Publish(channelID, ev) }
	pub(hub.Event{"type": "activity", "state": "working", "agent": ag.Name})

	// 历史(线程或频道)
	var history []store.Message
	if parent != nil {
		history, _ = s.st.ListThread(ctx, threadID)
	} else {
		history, _ = s.st.ListMessages(ctx, channelID)
	}
	msgs := make([]map[string]any, 0, len(history))
	for _, m := range history {
		msgs = append(msgs, map[string]any{"role": m.Role, "content": m.Content})
	}

	system := ag.SystemPrompt
	for _, t := range ag.Tools {
		if t == "delegate" {
			system += rosterText(agents, ag.Name)
			break
		}
	}
	if items, err := rag.Retrieve(ctx, s.st, content, 3, 4); err == nil {
		system += rag.BuildContext(items)
	}

	runner := orchestration.MakeToolRunner(s.st, llmAuth, model, s.cfg.MaxTokens, 0)
	answer := ""
	agent.Run(ctx, agent.Params{
		Messages: msgs, System: system, ToolNames: ag.Tools,
		Auth: llmAuth, Model: model, MaxTokens: s.cfg.MaxTokens,
	}, runner, func(e agent.Event) {
		switch e.Type {
		case "delta":
			pub(hub.Event{"type": "activity", "kind": "delta", "text": e.Text})
		case "tool_call":
			pub(hub.Event{"type": "activity", "kind": "tool_call", "name": e.Name, "input": e.Input})
		case "tool_result":
			pub(hub.Event{"type": "activity", "kind": "tool_result", "name": e.Name, "output": e.Output})
		case "final":
			answer = e.Text
		case "error":
			pub(hub.Event{"type": "activity", "kind": "error", "text": e.Text})
		}
	})

	if answer != "" {
		if m, err := s.st.AddMessage(ctx, channelID, "assistant", answer, parent); err == nil {
			pub(hub.Event{"type": "message", "message": m})
		}
	}
	pub(hub.Event{"type": "activity", "state": "done"})
}
