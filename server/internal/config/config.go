package config

import (
	"os"
	"strings"
)

// Config 从环境变量读取(本地单用户,默认值即可直接跑)。
type Config struct {
	DatabaseURL string
	Port        string
	CORSOrigins []string
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func Load() Config {
	return Config{
		// 独立库 agoradb,端口 5433 避开本机 5432
		DatabaseURL: getenv("DATABASE_URL", "postgres://agora:agora@localhost:5433/agoradb"),
		Port:        getenv("PORT", "8000"),
		CORSOrigins: strings.Split(getenv("CORS_ORIGINS", "http://localhost:3000"), ","),
	}
}
