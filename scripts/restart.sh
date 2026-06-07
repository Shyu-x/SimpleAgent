#!/bin/bash
# ==========================================
# SimpleAgent 重启脚本
# 用法: ./restart.sh [backend|frontend|all]
# ==========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ===== 颜色输出 =====
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

TARGET=${1:-all}

echo "=========================================="
echo "  SimpleAgent 重启脚本"
echo "  目标: $TARGET"
echo "=========================================="

case "$TARGET" in
  backend)
    log_info "重启后端..."
    pm2 restart ai-chat-backend
    ;;
  frontend)
    log_info "重启前端..."
    pm2 restart ai-chat-frontend
    ;;
  all)
    log_info "重启所有服务..."
    pm2 restart all
    ;;
  *)
    log_error "无效目标: $TARGET"
    echo "用法: $0 [backend|frontend|all]"
    exit 1
    ;;
esac

# 等待服务启动
sleep 3

# 验证
log_info "验证服务状态..."
pm2 status

echo "=========================================="
log_info "重启完成!"
echo "=========================================="
