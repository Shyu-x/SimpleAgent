#!/usr/bin/env bash
# online-gate.sh - 商业级上线门禁检查
# 用法: bash scripts/online-gate.sh
# 退出码: 0 = GO, 1 = NO-GO

set -u
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

PASS=0; FAIL=0; WARN=0
RESULTS=()

check() {
  local name="$1"; local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} $name"
    PASS=$((PASS+1))
    RESULTS+=("PASS: $name")
  else
    echo -e "${RED}✗${NC} $name"
    FAIL=$((FAIL+1))
    RESULTS+=("FAIL: $name")
  fi
}

warn() {
  local name="$1"; local detail="$2"
  echo -e "${YELLOW}⚠${NC} $name — $detail"
  WARN=$((WARN+1))
  RESULTS+=("WARN: $name — $detail")
}

echo "=== G4 商业级上线门禁 ==="
echo

# === 服务可用性 ===
echo "[1] 服务可用性"
check "后端 health 200" \
  "[ \$(curl -s -o /dev/null -w '%{http_code}' http://localhost:30000/api/health) = '200' ]"
check "前端 200" \
  "[ \$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001) = '200' ]"
check "Prometheus /metrics 200" \
  "[ \$(curl -s -o /dev/null -w '%{http_code}' http://localhost:30000/metrics) = '200' ]"
echo

# === 冒烟 ===
echo "[2] 5 路径冒烟"
check "Swagger 200" "[ \$(curl -s -o /dev/null -w '%{http_code}' http://localhost:30000/api-docs/) = '200' ]"
check "RAG 知识库 API" "[ \$(curl -s -o /dev/null -w '%{http_code}' http://localhost:30000/api/rag/kb) = '200' ]"
check "A2A Agent 列表" "[ \$(curl -s -o /dev/null -w '%{http_code}' http://localhost:30000/api/a2a/agents) = '200' ]"
check "HITL 健康" "[ \$(curl -s -o /dev/null -w '%{http_code}' http://localhost:30000/api/hitl/health) = '200' ]"
check "工具列表" "[ \$(curl -s -o /dev/null -w '%{http_code}' http://localhost:30000/api/tools) = '200' ]"
echo

# === 回归 ===
echo "[3] 回归测试"
cd /home/xu/Develop/longTermProject/SimpleAgent
COMP_RESULT=$(cd backend && timeout 120 node tests/comprehensive-test.js 2>&1 | grep -E '总测试数|通过:' | tail -2)
TOTAL=$(echo "$COMP_RESULT" | grep '总测试数' | grep -oE '[0-9]+')
PASSED=$(echo "$COMP_RESULT" | grep '通过:' | grep -oE '[0-9]+')
if [ -n "$TOTAL" ] && [ -n "$PASSED" ] && [ "$TOTAL" = "$PASSED" ] && [ "$TOTAL" -gt 0 ]; then
  echo -e "${GREEN}✓${NC} 综合测试 $PASSED/$TOTAL"
  PASS=$((PASS+1))
else
  echo -e "${RED}✗${NC} 综合测试 $PASSED/$TOTAL"
  FAIL=$((FAIL+1))
fi
echo

# === 单元测试 ===
echo "[4] 单元测试"
BACKEND_UNIT=$(cd backend && pnpm test 2>&1 | grep -E '^Tests:' | tail -1)
FRONTEND_UNIT=$(cd frontend && pnpm test 2>&1 | grep -E 'Tests +[0-9]+' | tail -1)
echo "后端: $BACKEND_UNIT"
echo "前端: $FRONTEND_UNIT"
if echo "$BACKEND_UNIT" | grep -qE 'Tests: +[0-9]+ passed' && \
   echo "$FRONTEND_UNIT" | grep -qE 'Tests +[0-9]+ passed'; then
  echo -e "${GREEN}✓${NC} 单元测试通过"
  PASS=$((PASS+1))
else
  echo -e "${RED}✗${NC} 单元测试失败"
  FAIL=$((FAIL+1))
fi
echo

# === 类型 ===
echo "[5] 类型严格"
TSC_EXIT=$(cd frontend && npx tsc --noEmit 2>&1; echo $?)
if [ "$TSC_EXIT" = "0" ]; then
  echo -e "${GREEN}✓${NC} tsc --noEmit exit 0"
  PASS=$((PASS+1))
else
  echo -e "${RED}✗${NC} tsc --noEmit exit $TSC_EXIT"
  FAIL=$((FAIL+1))
fi
echo

# === 安全 ===
echo "[6] 安全基线"
HARDKEY=$(grep -rE 'sk-[a-zA-Z0-9]{20,}' backend/src/ frontend/src/ 2>/dev/null | wc -l)
if [ "$HARDKEY" = "0" ]; then
  echo -e "${GREEN}✓${NC} 无硬编码密钥"
  PASS=$((PASS+1))
else
  echo -e "${RED}✗${NC} 发现 $HARDKEY 处硬编码密钥"
  FAIL=$((FAIL+1))
fi
echo

# === 文档 ===
echo "[7] 文档"
for doc in docs/online/RUNBOOK.md docs/online/DEPLOY.md CHANGELOG.md; do
  if [ -f "$doc" ]; then
    echo -e "${GREEN}✓${NC} $doc 存在"
    PASS=$((PASS+1))
  else
    echo -e "${RED}✗${NC} $doc 缺失"
    FAIL=$((FAIL+1))
  fi
done
echo

# === 总结 ===
echo "=== 总结 ==="
echo -e "通过: ${GREEN}$PASS${NC}  失败: ${RED}$FAIL${NC}  警告: ${YELLOW}$WARN${NC}"
echo

if [ "$FAIL" = "0" ]; then
  echo -e "${GREEN}=== GO — 可以上线 ===${NC}"
  exit 0
else
  echo -e "${RED}=== NO-GO — 还有 $FAIL 项阻塞 ===${NC}"
  exit 1
fi
