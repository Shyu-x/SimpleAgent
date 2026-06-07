#!/usr/bin/env bash
# smoke.sh - 5 路径冒烟测试
# 用法: bash scripts/smoke.sh

set -u
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
PASS=0; FAIL=0

check() {
  local name="$1"; local url="$2"; local want="${3:-200}"
  local got
  got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null)
  if [ "$got" = "$want" ]; then
    echo -e "  ${GREEN}✓${NC} $name → $got"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} $name → $got (期望 $want)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== SimpleAgent 5 路径冒烟 ==="
echo

echo "[1] 健康检查"
check "后端 /api/health" http://localhost:30000/api/health
check "后端 /metrics"    http://localhost:30000/metrics
echo

echo "[2] API 路径"
check "Swagger 文档"     http://localhost:30000/api-docs/
check "A2A Agent 列表"  http://localhost:30000/api/a2a/agents
check "HITL 健康"        http://localhost:30000/api/hitl/health
check "MCP 状态"         http://localhost:30000/api/mcp/status
check "工具列表"         http://localhost:30000/api/tools
check "RAG 知识库"       http://localhost:30000/api/rag/kb
check "Admin 模型"       http://localhost:30000/api/admin/models
check "Admin 工具"       http://localhost:30000/api/admin/tools
check "Admin 链路追踪"   http://localhost:30000/api/admin/traces
echo

echo "[3] 前端"
check "前端 /"           http://localhost:3001
echo

echo "=== 总结: ${PASS} 通过, ${FAIL} 失败 ==="
[ "$FAIL" = "0" ]
