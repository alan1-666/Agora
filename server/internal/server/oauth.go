package server

import (
	"context"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"agora/internal/llm"
	"agora/internal/oauth"
)

// 单用户:登录是一次性交互流程,pending PKCE 存内存即可。
type pendingLogin struct {
	mu       sync.Mutex
	verifier string
	state    string
}

var pending pendingLogin

func (s *Server) registerOAuth(api *gin.RouterGroup) {
	api.POST("/auth/claude/start", s.claudeStart)
	api.POST("/auth/claude/finish", s.claudeFinish)
}

// 生成授权链接(用户在浏览器打开 → 授权 → 复制页面给出的 code)。
func (s *Server) claudeStart(c *gin.Context) {
	verifier, challenge := oauth.PKCE()
	state := oauth.NewState()
	pending.mu.Lock()
	pending.verifier, pending.state = verifier, state
	pending.mu.Unlock()
	c.JSON(200, gin.H{"url": oauth.BuildAuthorizeURL(challenge, state)})
}

// 用回填的 code 换 token 并存储。
func (s *Server) claudeFinish(c *gin.Context) {
	var req struct {
		Code  string `json:"code"`
		Model string `json:"model"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Code == "" {
		c.JSON(400, gin.H{"error": "缺少授权码"})
		return
	}
	pending.mu.Lock()
	verifier, state := pending.verifier, pending.state
	pending.mu.Unlock()
	if verifier == "" {
		c.JSON(400, gin.H{"error": "请先点「开始登录」"})
		return
	}
	tok, err := oauth.Exchange(req.Code, verifier, state)
	if err != nil {
		c.JSON(400, gin.H{"error": "换取 token 失败: " + err.Error()})
		return
	}
	model := req.Model
	if model == "" {
		model = s.cfg.Model
	}
	expiry := time.Now().Unix() + tok.ExpiresIn
	if err := s.st.SetOAuth(c, tok.AccessToken, tok.RefreshToken, expiry, model); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"ok": true})
}

// resolveAuth 取当前鉴权;若是 OAuth 且 access token 快过期,自动用 refresh token 刷新。
func (s *Server) resolveAuth(ctx context.Context) llm.Auth {
	if refresh, expiry, model, isOAuth, err := s.st.OAuthCreds(ctx); err == nil && isOAuth {
		if time.Now().Unix() >= expiry-60 {
			if tok, err := oauth.Refresh(refresh); err == nil {
				newExpiry := time.Now().Unix() + tok.ExpiresIn
				rt := tok.RefreshToken
				if rt == "" {
					rt = refresh
				}
				_ = s.st.SetOAuth(ctx, tok.AccessToken, rt, newExpiry, model)
			}
		}
	}
	auth, _ := s.st.GetAuth(ctx)
	a := llm.Auth{Mode: auth.Mode, Secret: auth.Secret}
	if a.Secret == "" && s.cfg.AnthropicKey != "" {
		a = llm.Auth{Mode: "apikey", Secret: s.cfg.AnthropicKey}
	}
	return a
}
