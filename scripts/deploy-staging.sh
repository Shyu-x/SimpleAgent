#!/usr/bin/env bash
# deploy-staging.sh - 部署 staging 环境 (端口 30080/30081)
# 用途: 模拟"staging 环境"以验证端到端，不依赖 Docker daemon
# 用法: bash scripts/deploy-staging.sh [start|stop|status|restart]

set -u

# ============== 配置 ==============
PROJECT_ROOT="/home/xu/Develop/longTermProject/SimpleAgent"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
STAGING_DIR="/tmp/staging"
LOG_DIR="$STAGING_DIR/logs"

BACKEND_PORT="${STAGING_BACKEND_PORT:-30080}"
FRONTEND_PORT="${STAGING_FRONTEND_PORT:-30081}"

BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

BACKEND_PID_FILE="$STAGING_DIR/backend.pid"
FRONTEND_PID_FILE="$STAGING_DIR/frontend.pid"

# ============== 工具函数 ==============
log()  { echo -e "\033[0;36m[deploy]\033[0m $*"; }
ok()   { echo -e "\033[0;32m  ok\033[0m $*"; }
warn() { echo -e "\033[0;33m  ! \033[0m $*"; }
err()  { echo -e "\033[0;31m  x \033[0m $*"; }

port_listening() {
  ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${1}$"
}

wait_healthy() {
  local name="$1" url="$2" tries="${3:-30}"
  for i in $(seq 1 "$tries"); do
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null)
    if [ "$code" = "200" ]; then
      ok "$name 健康 ($code, ${i}s)"
      return 0
    fi
    sleep 1
  done
  err "$name 健康检查失败 ($url, $tries 次)"
  return 1
}

# ============== 动作 ==============
cmd_status() {
  echo "=== staging 状态 ==="
  for entry in "backend:$BACKEND_PORT:$BACKEND_PID_FILE" "frontend:$FRONTEND_PORT:$FRONTEND_PID_FILE"; do
    IFS=":" read -r name port pidf <<< "$entry"
    if [ -f "$pidf" ] && kill -0 "$(cat "$pidf")" 2>/dev/null; then
      ok "$name  运行中 (pid $(cat "$pidf"), 端口 $port)"
    elif port_listening "$port"; then
      warn "$name  端口 $port 被占用 (无 pidfile)"
    else
      err "$name  未运行"
    fi
  done
}

cmd_stop() {
  echo "=== 停止 staging ==="
  for pidf in "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"; do
    if [ -f "$pidf" ]; then
      local pid
      pid=$(cat "$pidf")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        sleep 1
        kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
        ok "已停止 pid $pid"
      fi
      rm -f "$pidf"
    fi
  done
}

cmd_start() {
  echo "=== 启动 staging (端口 $BACKEND_PORT / $FRONTEND_PORT) ==="
  mkdir -p "$LOG_DIR"

  # 1. Backend
  if port_listening "$BACKEND_PORT"; then
    warn "端口 $BACKEND_PORT 已被占用，跳过 backend 启动"
  else
    log "启动 backend (PORT=$BACKEND_PORT, DISABLE_RATE_LIMIT=true)"
    cd "$BACKEND_DIR"
    DISABLE_RATE_LIMIT=true PORT="$BACKEND_PORT" \
      nohup node --watch src/index.js > "$BACKEND_LOG" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    ok "backend pid=$(cat "$BACKEND_PID_FILE")"
  fi

  # 2. Frontend (next start 需先 build, build 产物在 frontend/.next)
  if port_listening "$FRONTEND_PORT"; then
    warn "端口 $FRONTEND_PORT 已被占用，跳过 frontend 启动"
  else
    if [ ! -f "$FRONTEND_DIR/.next/BUILD_ID" ]; then
      err "frontend 未 build (缺少 $FRONTEND_DIR/.next/BUILD_ID)"
      err "请先执行: cd $FRONTEND_DIR && pnpm build"
      return 1
    fi
    log "启动 frontend (PORT=$FRONTEND_PORT, NEXT_PUBLIC_BACKEND_URL=http://localhost:$BACKEND_PORT)"
    cd "$FRONTEND_DIR"
    PORT="$FRONTEND_PORT" NEXT_PUBLIC_BACKEND_URL="http://localhost:$BACKEND_PORT" \
      nohup pnpm exec next start -p "$FRONTEND_PORT" > "$FRONTEND_LOG" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    ok "frontend pid=$(cat "$FRONTEND_PID_FILE")"
  fi

  # 3. 健康检查
  log "等待健康检查 ..."
  wait_healthy "backend"  "http://localhost:$BACKEND_PORT/api/health"  || return 1
  wait_healthy "frontend" "http://localhost:$FRONTEND_PORT/"          || return 1

  echo
  echo "=== staging 部署完成 ==="
  echo "  backend  pid=$(cat "$BACKEND_PID_FILE" 2>/dev/null)  http://localhost:$BACKEND_PORT"
  echo "  frontend pid=$(cat "$FRONTEND_PID_FILE" 2>/dev/null)  http://localhost:$FRONTEND_PORT"
  echo "  logs     $LOG_DIR"
  echo "  停止     bash $0 stop"
}

# ============== 入口 ==============
ACTION="${1:-start}"
case "$ACTION" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  status)  cmd_status ;;
  restart) cmd_stop; cmd_start ;;
  *) echo "用法: $0 {start|stop|status|restart}"; exit 1 ;;
esac
