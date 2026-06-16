package config

import (
	"os"
	"strings"
)

// Config 从环境变量读取(本地单用户,默认值即可直接跑)。
type Config struct {
	DatabaseURL  string
	AppSecret    string // 加密本地存的 key/token
	AnthropicKey string // 兜底 API key(没登录/没配时用)
	Model        string
	MaxTokens    int
	EmbeddingDim int
	Port         string
	CORSOrigins  []string
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func Load() Config {
	return Config{
		// Go 后端用独立库 agoradb(不与 Python 版冲突),端口 5433 避开本机 5432
		DatabaseURL:  getenv("DATABASE_URL", "postgres://agora:agora@localhost:5433/agoradb"),
		AppSecret:    getenv("APP_SECRET", "dev-insecure-change-me"),
		AnthropicKey: getenv("ANTHROPIC_API_KEY", ""),
		Model:        getenv("MODEL", "claude-sonnet-4-6"),
		MaxTokens:    2048,
		EmbeddingDim: 256,
		Port:         getenv("PORT", "8000"),
		CORSOrigins:  strings.Split(getenv("CORS_ORIGINS", "http://localhost:3000"), ","),
	}
}
