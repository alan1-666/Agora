// Package server Gin 路由与处理器。
package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"agora/internal/agent"
	"agora/internal/config"
	"agora/internal/orchestration"
	"agora/internal/rag"
	"agora/internal/store"
	"agora/internal/tools"
)

type Server struct {
	cfg config.Config
	st  *store.Store
}

func New(cfg config.Config, st *store.Store) *Server {
	return &Server{cfg: cfg, st: st}
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
	api.GET("/channels/:id/messages", s.listMessages)
	api.GET("/documents", s.listDocuments)
	api.POST("/documents", s.uploadDocument)
	api.GET("/org/key", s.keyStatus)
	api.PUT("/org/key", s.setKey)
	api.POST("/chat/stream", s.chatStream)
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

func (s *Server) listMessages(c *gin.Context) {
	msgs, err := s.st.ListMessages(c, c.Param("id"))
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

func (s *Server) chatStream(c *gin.Context) {
	var req struct {
		ChannelID string `json:"channel_id"`
		Content   string `json:"content"`
		AgentID   string `json:"agent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "参数错误"})
		return
	}
	ok, _ := s.st.ChannelExists(c, req.ChannelID)
	if !ok {
		c.JSON(404, gin.H{"error": "频道不存在"})
		return
	}

	agents, err := s.st.ListAgents(c)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if len(agents) == 0 {
		agents, _ = s.seedDefaults(c)
	}
	var ag store.Agent
	if req.AgentID != "" {
		for _, a := range agents {
			if a.ID == req.AgentID {
				ag = a
			}
		}
	}
	if ag.ID == "" {
		ag = agents[0]
	}

	// 存用户消息 + 取历史
	_ = s.st.AddMessage(c, req.ChannelID, "user", req.Content)
	history, _ := s.st.ListMessages(c, req.ChannelID)
	msgs := make([]map[string]any, 0, len(history))
	for _, m := range history {
		msgs = append(msgs, map[string]any{"role": m.Role, "content": m.Content})
	}

	// system: 人设 + 花名册(协调者) + 检索上下文(RAG)
	system := ag.SystemPrompt
	hasDelegate := false
	for _, t := range ag.Tools {
		if t == "delegate" {
			hasDelegate = true
		}
	}
	if hasDelegate {
		system += rosterText(agents, ag.Name)
	}
	if items, err := rag.Retrieve(c, s.st, req.Content, 3, 4); err == nil {
		system += rag.BuildContext(items)
	}

	// 鉴权:OAuth(自动刷新)或 API key,否则兜底全局 key
	llmAuth := s.resolveAuth(c)
	model := s.cfg.Model
	if st, _ := s.st.KeyStatus(c); st.Model != "" {
		model = st.Model
	}
	if ag.Model != nil && *ag.Model != "" {
		model = *ag.Model
	}

	// SSE
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	flusher, _ := c.Writer.(http.Flusher)
	send := func(payload map[string]any) {
		b, _ := json.Marshal(payload)
		c.Writer.Write([]byte("data: " + string(b) + "\n\n"))
		if flusher != nil {
			flusher.Flush()
		}
	}

	runner := orchestration.MakeToolRunner(s.st, llmAuth, model, s.cfg.MaxTokens, 0)
	answer := ""
	agent.Run(c, agent.Params{
		Messages: msgs, System: system, ToolNames: ag.Tools,
		Auth: llmAuth, Model: model, MaxTokens: s.cfg.MaxTokens,
	}, runner, func(e agent.Event) {
		switch e.Type {
		case "delta":
			send(map[string]any{"delta": e.Text})
		case "tool_call":
			send(map[string]any{"tool_call": map[string]any{"name": e.Name, "input": e.Input}})
		case "tool_result":
			send(map[string]any{"tool_result": map[string]any{"name": e.Name, "output": e.Output}})
		case "final":
			answer = e.Text
		case "error":
			send(map[string]any{"error": e.Text})
		}
	})

	if answer != "" {
		_ = s.st.AddMessage(c, req.ChannelID, "assistant", answer)
	}
	send(map[string]any{"done": true})
}
