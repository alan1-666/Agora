# Agora backend

Python + FastAPI。阶段 0：能流式对话的单 agent（SSE）。

## 运行

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env        # 填入 ANTHROPIC_API_KEY
uvicorn app.main:app --reload --port 8000
```

- 健康检查：`curl localhost:8000/health`
- 交互文档：http://localhost:8000/docs
- 流式聊天：`POST /api/chat/stream`，body `{"messages":[{"role":"user","content":"你好"}]}`，返回 SSE，每个 `data` 是 `{"delta":"..."}`，结束是 `{"done":true}`。

## 结构
```
app/
  config.py   # 环境变量配置(API key / 模型)
  llm.py      # Claude provider 封装(流式) —— 之后接多模型只改这里
  main.py     # FastAPI + SSE 接口
```
