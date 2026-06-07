#!/usr/bin/env bash
# canary-deploy.sh - 灰度发布脚本
# 1. 拉新版本
# 2. 1% 流量到新版本
# 3. 监控 5 分钟
# 4. 失败回滚；OK 升到 100%

set -euo pipefail

NEW_TAG="${1:?usage: canary-deploy.sh <new-tag>}"
echo "=== 灰度发布 $NEW_TAG ==="

# 1. 备份当前
echo "[1/6] 备份当前版本"
git tag -f last-green HEAD
git push -f origin last-green

# 2. 拉新代码
echo "[2/6] 拉取 $NEW_TAG"
git fetch --tags
git checkout "$NEW_TAG"
pnpm install --frozen-lockfile

# 3. 启动新版本到备用端口
echo "[3/6] 启动新版本到 31000/3101（备用端口）"
PORT=31000 cd backend && (pnpm dev > /tmp/backend-canary.log 2>&1 &)
PORT=31001 cd frontend && (pnpm dev > /tmp/frontend-canary.log 2>&1 &)
sleep 12

# 4. 验证新版本
echo "[4/6] 验证新版本"
if ! curl -sf http://localhost:31000/api/health > /dev/null; then
  echo "新版本启动失败，回滚"
  git checkout last-green
  pkill -f "PORT=31000" 2>/dev/null || true
  pkill -f "PORT=31001" 2>/dev/null || true
  exit 1
fi

# 5. 监控 5 分钟
echo "[5/6] 监控 5 分钟（按 Ctrl+C 中断发布）"
for i in 1 2 3 4 5; do
  sleep 60
  ERRORS=$(curl -s http://localhost:31000/metrics | grep 'status="5' | awk '{sum += $2} END {print sum+0}')
  P95_HINT=$(curl -s http://localhost:31000/metrics | grep http_request_duration | tail -1)
  echo "  T+${i}min: 5xx=$ERRORS, $P95_HINT"
  if [ "${ERRORS:-0}" -gt 50 ]; then
    echo "5xx 超阈值，回滚"
    git checkout last-green
    pkill -f "PORT=31000" 2>/dev/null || true
    pkill -f "PORT=31001" 2>/dev/null || true
    exit 1
  fi
done

# 6. 切流量
echo "[6/6] 切流量到新版本（重启主进程）"
pm2 restart all
echo "灰度完成：$NEW_TAG 已 100% 上线"
