#!/bin/bash
# ==========================================
# SimpleAgent 健康检查脚本
# 用法: ./health-check.sh [verbose]
# ==========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ===== 颜色输出 =====
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

VERBOSE=false
[[ "${1:-}" == "verbose" ]] && VERBOSE=true

check_service() {
  local name=$1
  local url=$2

  echo -n "  $name ... "

  if curl -sf "$url" > /dev/null 2>&1; then
    echo -e "${GREEN}OK${NC}"
    return 0
  else
    echo -e "${RED}FAIL${NC}"
    return 1
  fi
}

echo "=========================================="
echo "  SimpleAgent 健康检查"
echo "=========================================="

errors=0

# 后端健康检查
echo ""
echo "[后端服务]"
check_service "API健康" "http://localhost:30000/api/health" || ((errors++))
check_service "Swagger文档" "http://localhost:30000/api-docs" || ((errors++))

# 前端健康检查
echo ""
echo "[前端服务]"
check_service "前端首页" "http://localhost:3001" || ((errors++))

# PM2 状态检查
echo ""
echo "[PM2 进程状态]"
if pm2 describe ai-chat-backend &>/dev/null; then
  status=$(pm2 describe ai-chat-backend | grep "status" | head -1 | awk '{print $4}')
  if [[ "$status" == "online" ]]; then
    echo -e "  后端进程 ... ${GREEN}online${NC}"
  else
    echo -e "  后端进程 ... ${RED}$status${NC}"
    ((errors++))
  fi
else
  echo -e "  后端进程 ... ${RED}not running${NC}"
  ((errors++))
fi

if pm2 describe ai-chat-frontend &>/dev/null; then
  status=$(pm2 describe ai-chat-frontend | grep "status" | head -1 | awk '{print $4}')
  if [[ "$status" == "online" ]]; then
    echo -e "  前端进程 ... ${GREEN}online${NC}"
  else
    echo -e "  前端进程 ... ${RED}$status${NC}"
    ((errors++))
  fi
else
  echo -e "  前端进程 ... ${RED}not running${NC}"
  ((errors++))
fi

# 详细日志输出
if $VERBOSE; then
  echo ""
  echo "[最近错误日志 - 后端]"
  pm2 logs ai-chat-backend --lines 10 --nostream 2>/dev/null || true

  echo ""
  echo "[最近错误日志 - 前端]"
  pm2 logs ai-chat-frontend --lines 10 --nostream 2>/dev/null || true
fi

echo ""
echo "=========================================="
if [[ $errors -eq 0 ]]; then
  echo -e "  ${GREEN}所有检查通过!${NC}"
  exit 0
else
  echo -e "  ${RED}发现 $errors 个问题${NC}"
  exit 1
fi
echo "=========================================="
