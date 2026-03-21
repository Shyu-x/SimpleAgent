#!/bin/bash
# NLP功能自动化测试脚本
# 执行方法: bash tests/nlp_test_runner.sh

BASE_URL="http://localhost:30000"

echo "======================================"
echo "NLP 功能自动化测试"
echo "======================================"

# 测试计数器
PASS=0
FAIL=0

# 1. 意图识别测试
echo ""
echo "【测试1: 意图识别】"
echo "--------------------------------------"

# 测试知识库查询意图
RESULT=$(curl -s -X POST "$BASE_URL/api/router/intent" \
  -H "Content-Type: application/json" \
  -d '{"query":"什么是机器学习"}')

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✓ 知识库查询意图识别 - PASS"
  ((PASS++))
else
  echo "✗ 知识库查询意图识别 - FAIL"
  ((FAIL++))
fi

# 测试工具调用意图
RESULT=$(curl -s -X POST "$BASE_URL/api/router/intent" \
  -H "Content-Type: application/json" \
  -d '{"query":"搜索今天天气怎么样"}')

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✓ 工具调用意图识别 - PASS"
  ((PASS++))
else
  echo "✗ 工具调用意图识别 - FAIL"
  ((FAIL++))
fi

# 测试创意生成意图
RESULT=$(curl -s -X POST "$BASE_URL/api/router/intent" \
  -H "Content-Type: application/json" \
  -d '{"query":"帮我写一首关于春天的诗"}')

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✓ 创意生成意图识别 - PASS"
  ((PASS++))
else
  echo "✗ 创意生成意图识别 - FAIL"
  ((FAIL++))
fi


# 2. 查询改写测试
echo ""
echo "【测试2: 查询改写】"
echo "--------------------------------------"

RESULT=$(curl -s -X POST "$BASE_URL/api/router/rewrite" \
  -H "Content-Type: application/json" \
  -d '{"query":"它的原理是什么","messages":[{"role":"user","content":"什么是机器学习"},{"role":"assistant","content":"机器学习是..."}]}')

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✓ 查询改写(上下文补全) - PASS"
  ((PASS++))
else
  echo "✗ 查询改写(上下文补全) - FAIL"
  ((FAIL++))
fi


# 3. 混合检索测试
echo ""
echo "【测试3: 混合检索】"
echo "--------------------------------------"

RESULT=$(curl -s -X POST "$BASE_URL/api/router/search" \
  -H "Content-Type: application/json" \
  -d '{"query":"machine learning","channels":["vector","fulltext"]}')

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✓ 混合检索(向量+全文) - PASS"
  ((PASS++))
else
  echo "✗ 混合检索(向量+全文) - FAIL"
  ((FAIL++))
fi


# 4. 模型候选池测试
echo ""
echo "【测试4: 模型候选池】"
echo "--------------------------------------"

# 获取模型池状态
RESULT=$(curl -s "$BASE_URL/api/router/pool/status")

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✓ 获取模型池状态 - PASS"
  ((PASS++))
else
  echo "✗ 获取模型池状态 - FAIL"
  ((FAIL++))
fi

# 选择模型
RESULT=$(curl -s -X POST "$BASE_URL/api/router/pool/select" \
  -H "Content-Type: application/json" \
  -d '{"capabilities":["text","code"]}')

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✓ 选择最佳模型 - PASS"
  ((PASS++))
else
  echo "✗ 选择最佳模型 - FAIL"
  ((FAIL++))
fi


# 5. 模型成功/失败标记
echo ""
echo "【测试5: 模型健康状态标记】"
echo "--------------------------------------"

RESULT=$(curl -s -X POST "$BASE_URL/api/router/pool/request/success" \
  -H "Content-Type: application/json" \
  -d '{"modelId":"gpt-4o","latency":1200}')

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✓ 标记请求成功 - PASS"
  ((PASS++))
else
  echo "✗ 标记请求成功 - FAIL"
  ((FAIL++))
fi

RESULT=$(curl -s -X POST "$BASE_URL/api/router/pool/request/failure" \
  -H "Content-Type: application/json" \
  -d '{"modelId":"gpt-4o"}')

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✓ 标记请求失败 - PASS"
  ((PASS++))
else
  echo "✗ 标记请求失败 - FAIL"
  ((FAIL++))
fi


# 6. 路由统计测试
echo ""
echo "【测试6: 路由统计】"
echo "--------------------------------------"

RESULT=$(curl -s "$BASE_URL/api/router/stats")

if echo "$RESULT" | grep -q '"totalRequests"'; then
  echo "✓ 获取路由统计 - PASS"
  ((PASS++))
else
  echo "✗ 获取路由统计 - FAIL"
  ((FAIL++))
fi


# 7. 记忆系统测试
echo ""
echo "【测试7: 记忆系统】"
echo "--------------------------------------"

RESULT=$(curl -s "$BASE_URL/api/memory/stats")

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✓ 获取记忆统计 - PASS"
  ((PASS++))
else
  echo "✗ 获取记忆统计 - FAIL"
  ((FAIL++))
fi


# 8. RAG系统测试
echo ""
echo "【测试8: RAG知识库】"
echo "--------------------------------------"

RESULT=$(curl -s "$BASE_URL/api/rag/stats")

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✓ 获取RAG统计 - PASS"
  ((PASS++))
else
  echo "✗ 获取RAG统计 - FAIL"
  ((FAIL++))
fi


# 9. Multi-Agent测试
echo ""
echo "【测试9: Multi-Agent系统】"
echo "--------------------------------------"

RESULT=$(curl -s "$BASE_URL/api/multiagent/health")

if echo "$RESULT" | grep -q '"status":"ok"'; then
  echo "✓ Multi-Agent健康检查 - PASS"
  ((PASS++))
else
  echo "✗ Multi-Agent健康检查 - FAIL"
  ((FAIL++))
fi


# 10. 会话管理测试
echo ""
echo "【测试10: 会话管理】"
echo "--------------------------------------"

RESULT=$(curl -s "$BASE_URL/api/sessions")

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✓ 获取会话列表 - PASS"
  ((PASS++))
else
  echo "✗ 获取会话列表 - FAIL"
  ((FAIL++))
fi


# 11. 工具注册测试
echo ""
echo "【测试11: 工具系统】"
echo "--------------------------------------"

RESULT=$(curl -s "$BASE_URL/api/mcp/tools")

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✓ 获取工具列表 - PASS"
  ((PASS++))
else
  echo "✗ 获取工具列表 - FAIL"
  ((FAIL++))
fi


# 测试总结
echo ""
echo "======================================"
echo "测试结果汇总"
echo "======================================"
echo "通过: $PASS"
echo "失败: $FAIL"
echo "总计: $((PASS + FAIL))"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "🎉 所有测试通过!"
  exit 0
else
  echo "⚠️  部分测试失败，请检查"
  exit 1
fi
