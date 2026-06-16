# 部署说明

> 阶段 1 状态:可本地起、可部署到海外单机。多租户/落库/BYO-key 已就绪;
> Clerk 真鉴权与计费在后续阶段接(当前 DEV_MODE 下用内置 org)。

## 关键约束:区域

后端要调 `api.anthropic.com`(或各组织的 BYO-key 对应 provider),**中国大陆节点直连不通**。
部署在海外节点(**美国延迟最低**,亚洲选新加坡/日本)。前端是静态产物,放哪都行。

## 本地开发

```bash
# 1) 起依赖(postgres+redis;postgres 映射在 5433 避开本机 5432)
docker compose up -d

# 2) 后端
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # 可不填 key,DEV_MODE 下也能跑(LLM 调用会提示未配置)
uvicorn app.main:app --reload --port 8000

# 3) 前端(另一个终端)
cd frontend
pnpm install
cp .env.example .env.local      # 默认连 localhost:8000
pnpm dev                        # http://localhost:3000
```

不配 Clerk key → DEV 模式,自动用内置 dev 组织,直接能聊天。
要真正得到模型回复:进「设置」给组织填一个 Anthropic key(BYO-key),或在后端 `.env` 填 `ANTHROPIC_API_KEY` 兜底。

## 生产部署(单机示例)

1. 海外 VPS(能直连 Anthropic),装 Docker。
2. **数据库**:用托管 Postgres(带 pgvector)或自建;设强密码;`DATABASE_URL` 用非超级用户角色(RLS 才生效),`DATABASE_ADMIN_URL` 用管理员角色建表/建角色。
3. **后端**:容器化 FastAPI(uvicorn/gunicorn),env 配置:
   - `DATABASE_URL` / `DATABASE_ADMIN_URL`
   - `APP_SECRET_KEY`(加密组织 key 用,**强随机、勿进代码**)
   - `DEV_MODE=false` + Clerk 配置(待 Clerk 接入阶段)
4. **前端**:`pnpm build` 产物,放 Vercel 或 nginx 静态托管;`NEXT_PUBLIC_API_URL` 指向后端;配 Clerk 则填 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`。
5. 域名 + HTTPS(nginx/Caddy 反代后端,前端走 CDN)。

## CI

`.github/workflows/ci.yml`:push/PR 自动跑后端 pytest(起 postgres service)+ 前端构建(含 tsc)。

## 成本护栏(上线前必做)

- 每组织 token 用量配额 + 告警(阶段 5 实现)。
- 各组织 BYO-key 在 Anthropic 后台设用量上限,防 agent 死循环烧钱。
