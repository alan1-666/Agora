// Package oauth 实现 Claude Code 的 OAuth(PKCE)登录,让用户用 Claude 订阅授权(免 API key)。
//
// ⚠️ 非官方/逆向:复用 Claude Code 公开的 OAuth client。灰色、可能违反条款、Anthropic 改动即失效。
// 常量(2026-06 核实,会变):client_id 与端点见下。
package oauth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const (
	ClientID    = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
	AuthorizeURL = "https://claude.ai/oauth/authorize"
	TokenURL    = "https://platform.claude.com/v1/oauth/token"
	RedirectURI = "https://platform.claude.com/oauth/code/callback"
	Scopes      = "user:profile user:inference user:sessions:claude_code user:mcp_servers"
)

func b64url(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func randB64(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b64url(b)
}

// PKCE 生成 code_verifier 与对应的 S256 challenge。
func PKCE() (verifier, challenge string) {
	verifier = randB64(32)
	sum := sha256.Sum256([]byte(verifier))
	challenge = b64url(sum[:])
	return
}

func NewState() string { return randB64(16) }

// BuildAuthorizeURL 拼授权链接(manual 模式:授权后页面显示 code,用户复制回填)。
func BuildAuthorizeURL(challenge, state string) string {
	q := url.Values{}
	q.Set("code", "true")
	q.Set("client_id", ClientID)
	q.Set("response_type", "code")
	q.Set("redirect_uri", RedirectURI)
	q.Set("scope", Scopes)
	q.Set("code_challenge", challenge)
	q.Set("code_challenge_method", "S256")
	q.Set("state", state)
	// 注意:url.Values.Encode 把空格编码成 '+',但 URL 查询里 '+' 是字面加号,
	// claude.ai 会把 scope 解析坏(Invalid request format)。改成 %20(各值无字面 '+',安全)。
	return AuthorizeURL + "?" + strings.ReplaceAll(q.Encode(), "+", "%20")
}

type Tokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
}

func postForm(form url.Values) (*Tokens, error) {
	resp, err := http.Post(TokenURL, "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("oauth token %d: %s", resp.StatusCode, string(body))
	}
	var t Tokens
	if err := json.Unmarshal(body, &t); err != nil {
		return nil, err
	}
	return &t, nil
}

// Exchange 用授权码换 token。pastedCode 可能是 "code#state" 形式,这里拆开。
func Exchange(pastedCode, verifier, expectState string) (*Tokens, error) {
	code, state := pastedCode, expectState
	if i := strings.Index(pastedCode, "#"); i >= 0 {
		code = pastedCode[:i]
		state = pastedCode[i+1:]
	}
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("state", state)
	form.Set("client_id", ClientID)
	form.Set("redirect_uri", RedirectURI)
	form.Set("code_verifier", verifier)
	return postForm(form)
}

// Refresh 用 refresh_token 换新 access token。
func Refresh(refreshToken string) (*Tokens, error) {
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	form.Set("client_id", ClientID)
	return postForm(form)
}
