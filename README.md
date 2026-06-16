# Agora

> 一个让 **人 + 多个 AI 智能体（agents）在同一个工作空间里协作干活** 的 web 平台。
> 形态类比：Slack-for-AI-agents——频道 / 私信 / 线程，但里面的"同事"是带记忆、会用工具、能自主完成任务的 AI agent。

**目标：做一个能投入生产、长期迭代的产品** —— **多租户 SaaS** 形态的通用 AI 协作工作空间。
Agent 平台是一个"超集"，做它会把 LLM 接入、工具调用、多智能体编排、记忆/RAG、评估、
实时基础设施，加上多租户/认证/计费的 SaaS 工程，全部亲手实现一遍。

## 名字由来
**Agora** = 古希腊的公共广场，人们聚集、交流、协作、做决定的地方。
正好对应"人和 AI 智能体汇聚、协作"的产品内核；且 *agora* 与 *agent* 同源（都来自表示"聚集/驱动"的词根）。

## 文档
- [方向调整·本地优先](docs/方向调整-本地优先.md) ← **当前方向（Slock 模式，本地优先），从这里开始**
- [生产架构与路线图](docs/生产架构与路线图.md) — 技术细节(RLS/agent/RAG)仍适用；"多租户 SaaS"定位已被上文取代
- [技术选型与架构路线图（学习版）](docs/技术选型与架构路线图.md) — 最早方向，存档

## 当前状态（2026-06）
**本地优先单用户 app**。功能完整：流式对话 → 工具调用 → 记忆/RAG → 多智能体协作。

- **后端：Go**（`server/`，Gin + pgx + pgvector，单二进制好分发）。手写 Anthropic 客户端，
  支持 **API Key** 与 **Claude 订阅 OAuth 登录** 两种接入。
- **前端：Next.js + TS + React**（`frontend/`）。频道/流式对话/工具可视化/资料库/设置。
- 模型接入：设置页用 Claude 订阅登录（免 key，⚠️非官方）或填 API Key。

起服务：`docker compose up -d`（postgres）→ `cd server && go run .` → `cd frontend && pnpm dev`。
> 早期 Python 后端(多租户云 SaaS 方向)已被 Go 本地版取代,见 git 历史。
