// Package server Gin 路由与处理器。
package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"agora/internal/config"
	"agora/internal/hub"
	"agora/internal/runtime"
	"agora/internal/store"
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
		c.JSON(200, gin.H{"status": "ok"})
	})
	api := r.Group("/api")
	api.GET("/runtime", s.runtimeStatus)
	api.GET("/agents", s.listAgents)
	api.POST("/agents", s.createAgent)
	api.PUT("/agents/:id", s.updateAgent)
	api.DELETE("/agents/:id", s.deleteAgent)
	api.GET("/channels", s.listChannels)
	api.POST("/channels", s.createChannel)
	api.GET("/channels/:id/members", s.listMembers)
	api.POST("/channels/:id/members", s.addMember)
	api.DELETE("/channels/:id/members/:agentId", s.removeMember)
	api.GET("/dms", s.listDMs)
	api.POST("/dms", s.openDM)
	api.GET("/channels/:id/messages", s.listMessages)
	api.GET("/channels/:id/stream", s.channelStream)
	api.GET("/threads/:id", s.listThread)
	api.POST("/chat/dispatch", s.dispatch)
}

// ---------- tools / agents ----------

// runtimeStatus 报告本机 claude CLI 是否可用(Raft 模式靠它执行)。
func (s *Server) runtimeStatus(c *gin.Context) {
	c.JSON(200, gin.H{"available": runtime.Available(), "version": runtime.Version()})
}

func (s *Server) seedDefaults(ctx context.Context) ([]store.Agent, error) {
	a, err := s.st.CreateAgent(ctx, store.Agent{
		Name:         "助手",
		SystemPrompt: "你是 Agora 里的 AI 助手,友好、简洁、直接,用提问者的语言回答。",
		Tools:        []string{},
	})
	if err != nil {
		return nil, err
	}
	return []store.Agent{a}, nil
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
	if req.Tools == nil {
		req.Tools = []string{}
	}
	a, err := s.st.CreateAgent(c, req)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, a)
}

func (s *Server) updateAgent(c *gin.Context) {
	var req store.Agent
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "参数错误"})
		return
	}
	if req.Tools == nil {
		req.Tools = []string{}
	}
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
	// 新频道默认拉入当前全部 agent 作为成员
	if agents, e := s.st.ListAgents(c); e == nil {
		for _, a := range agents {
			_ = s.st.AddChannelMember(c, ch.ID, a.ID)
		}
	}
	c.JSON(200, ch)
}

// channelMembers 取频道成员;为空(旧频道)则自动补全为当前全部 agent。
func (s *Server) channelMembers(ctx context.Context, channelID string) ([]store.Agent, error) {
	mem, err := s.st.ListChannelMembers(ctx, channelID)
	if err != nil {
		return nil, err
	}
	if len(mem) == 0 {
		agents, err := s.st.ListAgents(ctx)
		if err != nil {
			return nil, err
		}
		if len(agents) == 0 {
			agents, _ = s.seedDefaults(ctx)
		}
		for _, a := range agents {
			_ = s.st.AddChannelMember(ctx, channelID, a.ID)
		}
		mem = agents
	}
	return mem, nil
}

func (s *Server) listMembers(c *gin.Context) {
	mem, err := s.channelMembers(c, c.Param("id"))
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, mem)
}

func (s *Server) addMember(c *gin.Context) {
	var req struct {
		AgentID string `json:"agent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.AgentID == "" {
		c.JSON(400, gin.H{"error": "缺少 agent_id"})
		return
	}
	if err := s.st.AddChannelMember(c, c.Param("id"), req.AgentID); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"ok": true})
}

func (s *Server) removeMember(c *gin.Context) {
	if err := s.st.RemoveChannelMember(c, c.Param("id"), c.Param("agentId")); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"ok": true})
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

// ---------- 流式对话(经 claude CLI) ----------

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

	members, _ := s.channelMembers(c, req.ChannelID)
	if len(members) == 0 {
		c.JSON(400, gin.H{"error": "该频道没有成员"})
		return
	}
	ag := members[0]
	if req.AgentID != "" {
		for _, a := range members {
			if a.ID == req.AgentID {
				ag = a
			}
		}
	}

	var parent *string
	if req.ThreadID != "" {
		parent = &req.ThreadID
	}
	userMsg, err := s.st.AddMessage(c, req.ChannelID, "user", req.Content, parent)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	s.hub.Publish(req.ChannelID, hub.Event{"type": "message", "message": userMsg})

	c.JSON(202, gin.H{"ok": true})

	go s.runAgentTask(req.ChannelID, req.ThreadID, parent, ag, members, 0, "")
}

const maxRelayHops = 3

// runAgentTask 让某 agent 在频道里干活;若回复里 @了本频道其他成员,自动接力派活(hop 上限防循环)。
func (s *Server) runAgentTask(channelID, threadID string, parent *string, ag store.Agent, members []store.Agent, hop int, nudge string) {
	ctx := context.Background()
	pub := func(ev hub.Event) { s.hub.Publish(channelID, ev) }
	pub(hub.Event{"type": "activity", "state": "working", "agent": ag.Name})

	var history []store.Message
	if parent != nil {
		history, _ = s.st.ListThread(ctx, threadID)
	} else {
		history, _ = s.st.ListMessages(ctx, channelID)
	}
	// 最后一条是"当前触发消息",其余作为历史上下文
	content := ""
	var hist []runtime.Msg
	for i, m := range history {
		if i == len(history)-1 {
			content = m.Content
			break
		}
		hist = append(hist, runtime.Msg{Role: m.Role, Content: m.Content})
	}

	model := ""
	if ag.Model != nil {
		model = *ag.Model
	}
	system := ag.SystemPrompt + rosterPrompt(members, ag.Name) + nudge

	answer, err := runtime.RunClaude(ctx, system, model, hist, content)
	if err != nil {
		pub(hub.Event{"type": "activity", "kind": "error", "text": err.Error()})
		pub(hub.Event{"type": "activity", "state": "done"})
		return
	}
	if answer != "" {
		if m, e := s.st.AddMessage(ctx, channelID, "assistant", answer, parent); e == nil {
			pub(hub.Event{"type": "message", "message": m})
		}
	}
	pub(hub.Event{"type": "activity", "state": "done"})

	// 接力:回复里 @了本频道其他成员 → 自动派活给 TA
	if hop < maxRelayHops && answer != "" {
		for _, m := range members {
			if m.Name != ag.Name && strings.Contains(answer, "@"+m.Name) {
				nudge := "\n\n【接力】你被「" + ag.Name + "」在频道里 @ 了,请基于上文接力处理你那部分,简洁作答。"
				go s.runAgentTask(channelID, threadID, parent, m, members, hop+1, nudge)
			}
		}
	}
}

// rosterPrompt 告诉 agent 本频道还有哪些成员、可以 @ 谁接力。
func rosterPrompt(members []store.Agent, self string) string {
	var b strings.Builder
	first := true
	for _, m := range members {
		if m.Name == self {
			continue
		}
		if first {
			b.WriteString("\n\n【本频道其他成员】需要时可在回复中 @某成员 让 TA 接力处理(只 @ 真正需要的):")
			first = false
		}
		sp := m.SystemPrompt
		if r := []rune(sp); len(r) > 50 {
			sp = string(r[:50])
		}
		b.WriteString("\n- @" + m.Name + "：" + sp)
	}
	return b.String()
}
