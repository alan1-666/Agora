#!/usr/bin/env bash
# Agora 一键启动:postgres + Go 后端(:8000) + 前端(:3000)。Ctrl+C 一并停止(postgres 容器保留)。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# 1) 前置检查
for c in docker go pnpm; do
  command -v "$c" >/dev/null 2>&1 || { echo "✗ 缺少 $c,请先安装"; exit 1; }
done

# 2) 启动 postgres 并等就绪
echo "==> 启动 postgres..."
docker compose up -d postgres >/dev/null
echo -n "==> 等 postgres 就绪 "
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U agora >/dev/null 2>&1; then break; fi
  echo -n "."; sleep 1
done
echo "ok"

# 3) 确保 Go 用的库 agoradb 存在(建表由后端启动时自动完成)
if ! docker compose exec -T postgres psql -U agora -d agora -tAc \
     "SELECT 1 FROM pg_database WHERE datname='agoradb'" 2>/dev/null | grep -q 1; then
  echo "==> 创建数据库 agoradb..."
  docker compose exec -T postgres createdb -U agora agoradb
fi

# 4) 退出时清理后台进程(按 PID + 端口双保险强杀,避免残留)
mkdir -p logs
BACK_PID=""; FRONT_PID=""
_cleaned=""
cleanup() {
  [ -n "$_cleaned" ] && return; _cleaned=1
  echo; echo "==> 停止服务(postgres 容器保留,如需停止: docker compose stop)..."
  [ -n "$BACK_PID" ] && kill "$BACK_PID" 2>/dev/null || true
  [ -n "$FRONT_PID" ] && kill "$FRONT_PID" 2>/dev/null || true
  pkill -f '/tmp/agora-srv' 2>/dev/null || true
  pkill -f 'next dev|next-server' 2>/dev/null || true
  sleep 1
  # 兜底:按端口强杀仍残留的
  lsof -ti tcp:8000 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti tcp:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
}
# 信号到达时清理并显式退出(否则 wait 会卡住不返回)
trap 'cleanup; exit 0' INT TERM
trap cleanup EXIT

# 5) 编译并启动 Go 后端(编译同步做,出错能立刻看到)
echo "==> 编译 Go 后端..."
( cd server && go build -o /tmp/agora-srv . )
echo "==> 启动后端 :8000 ..."
( exec /tmp/agora-srv ) >logs/backend.log 2>&1 &
BACK_PID=$!

# 6) 启动前端(首次自动装依赖)
if [ ! -d frontend/node_modules ]; then
  echo "==> 安装前端依赖(首次)..."
  ( cd frontend && pnpm install )
fi
echo "==> 启动前端 :3000 ..."
( cd frontend && exec pnpm dev -p 3000 ) >logs/frontend.log 2>&1 &
FRONT_PID=$!

sleep 3
cat <<EOF

================================================
  Agora 已启动
    前端  http://localhost:3000
    后端  http://localhost:8000
    日志  logs/backend.log  logs/frontend.log
  首次用先去  /settings  接入模型(Claude 登录 或 API Key)
  按 Ctrl+C 退出
================================================
EOF

wait
