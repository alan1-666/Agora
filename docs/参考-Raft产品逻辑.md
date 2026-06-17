# 参考 · Raft（Slock）产品逻辑

> Raft（前身 slock.ai，现 raft.build）是我们 Agora 的对标参考:"人 + AI 智能体在一个 Slack 式工作空间里协作"。
> 本文记录它的**产品逻辑与接入方式**,以及和 Agora 的根本区别。来源:raft.build / docs.raft.build / 创始人 stdrc(@istdrc,前 Moonshot Kimi CLI 作者)。整理 2026-06。

---

## 一句话

**Raft 自己没有 AI 引擎。它的"AI 成员"本质是你本机上已装好、已登录的编码 CLI(Claude Code / Codex / Gemini CLI…)。Raft = 网页协作层 + 本机 daemon,daemon 把你的 CLI 包装成频道里的一个"同事"。**

---

## 产品结构

和 Slack 一样:**Server(工作区) → Channel(频道) → Thread(线程) / DM**。区别是频道里的成员除了人,还有 AI agent。agent 带持久记忆,能被 @、能认领任务、在 thread 里干活汇报。

## 怎么接入 AI(关键,容易找不到)

**网页里没有"加 AI"按钮**。接入是两步,且要动终端:

1. **Add Computer(连一台电脑)**
   - app 里打开 "Add Computer" → 它生成一条命令 → 复制到**终端运行**
   - 这条命令装 **Raft daemon**(轻量后台进程),把这台机器连到你的 server
   - 成功后给电脑起名

2. **Create an Agent(创建 agent)**
   - 选一个 **runtime** = 你**已经在用的编码 CLI**:Claude Code、Codex CLI、Gemini CLI、Cursor CLI、OpenCode、Kimi CLI、Copilot CLI 等
   - 官方原话:*"it's where your existing AI subscription plugs in"*(你现有 AI 订阅在这里接入)
   - 创建后 agent 作为成员出现在频道、在 #all 打招呼

## 由此推出的产品逻辑

- **AI 跑在本地**:agent 在你"连进去的那台电脑"上跑(daemon),算力/数据在你这边。
- **不用填 API key**:AI 鉴权走**你那个 CLI 自己的登录**(Claude Code 登录 = 你的 Claude 订阅)。这就是"用订阅、不填 key"的来源。
- **编排现成 CLI,不自造引擎**:和 vibe-kanban 一个套路。省了造 agent 引擎、白嫖你已付的订阅;代价是 AI 能力 = 那些 CLI 的能力,平台只做编排 + 协作 + UI。
- **必须本地/混合**:正因为要用你的本机算力和订阅授权,执行就得在你这边。纯云 SaaS 给不了这个体验。

完整流程:建 Server → 建 Channel → **Add Computer(跑命令装 daemon)→ Create Agent(选 CLI runtime)** → @agent 派活 → 它在 thread 干活汇报。

---

## Raft vs Agora(我们的选择)

| | Raft | Agora(本项目) |
|---|---|---|
| AI 引擎 | **没有**,包你的 Claude Code/Codex CLI | **自己写的**(agent 循环 / 工具 / RAG / 多智能体) |
| 接入 AI | Add Computer + 选 CLI runtime | 填 API key / Claude 订阅登录 |
| AI 在哪跑 | 你连进去的机器(daemon) | 你的本地后端 |
| 鉴权 | 你 CLI 的现成登录(订阅) | API key,或逆向 Claude OAuth |

**关键区别**:Raft 走**"编排现成 CLI"**这条路(省事、白嫖订阅,但 AI 能力受制于那些 CLI、平台是薄壳);
Agora 走**"自建引擎"**这条路(我们亲手写了 agent 循环/工具/RAG/多智能体,更懂内部、可定制,代价是要自己接模型鉴权)。

这是当初那个岔路口(编排 CLI vs 自建引擎)的体现,我们(隐含)选了自建引擎。所以 Agora **不需要** Raft 那套 "Add Computer / daemon",接入就是"填 key 或登录 Claude",更直接。要不要往 Raft 那种编排形态靠,等于要不要放弃自建引擎——目前不改。

---

*调研整理,作对照用。不影响 Agora 当前方向(本地优先 + 自建引擎)。*
