# Agora server (Go)

本地优先单用户后端。Go + Gin + pgx + pgvector。手写 Anthropic 客户端(支持 API key 与 Claude 订阅 OAuth)。

## 运行
```bash
# 需要 postgres(docker compose up -d,库 agoradb 会自动建表)
go run .                      # :8000
# 或编译单二进制
go build -o agora-srv . && ./agora-srv
```
配置走环境变量(都有默认值):`DATABASE_URL`(默认 agoradb@5433)、`ANTHROPIC_API_KEY`(兜底)、`APP_SECRET`(加密凭证)、`MODEL`、`PORT`。

## 结构
```
internal/config   配置
internal/db       连接 + 建表(单用户,无多租户)
internal/store    数据访问 + 凭证(key/oauth)
internal/crypto   AES-GCM 加密凭证
internal/llm      手写 Anthropic Messages 流式客户端(apikey/oauth)
internal/tools    工具注册 + 安全四则求值
internal/embed    本地哈希词袋 embedding
internal/rag      分块/嵌入/检索
internal/agent    agent 工具循环
internal/orchestration  统一 tool runner(remember/delegate)
internal/server   Gin 路由与处理器
```
