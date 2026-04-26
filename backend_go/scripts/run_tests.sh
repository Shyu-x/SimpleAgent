#!/bin/bash

# AI Chat 玩具 - 测试运行脚本
# 作者: 测试团队
# 日期: 2026-04-02

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试报告目录
REPORT_DIR="test-results"
COVER_PROFILE="${REPORT_DIR}/coverage.out"

# 创建报告目录
mkdir -p "${REPORT_DIR}"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  AI Chat 玩具 - Go 测试运行脚本     ${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# 显示Go版本
echo -e "${YELLOW}Go 版本:${NC}"
go version
echo ""

# 清理之前的测试缓存
echo -e "${YELLOW}清理之前的测试缓存...${NC}"
go clean -testcache
echo ""

# 下载依赖
echo -e "${YELLOW}下载依赖...${NC}"
go mod download
echo ""

# 运行单元测试
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  运行单元测试                          ${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

UNIT_TESTS_PASSED=0
UNIT_TESTS_FAILED=0

# 测试基础设施 - 熔断器
echo -e "${YELLOW}测试 infra/circuitbreaker...${NC}"
if go test -v -race ./infra/circuitbreaker/... 2>&1; then
    echo -e "${GREEN}✓ circuitbreaker 测试通过${NC}"
    ((UNIT_TESTS_PASSED++))
else
    echo -e "${RED}✗ circuitbreaker 测试失败${NC}"
    ((UNIT_TESTS_FAILED++))
fi
echo ""

# 测试基础设施 - 限流器
echo -e "${YELLOW}测试 infra/ratelimiter...${NC}"
if go test -v -race ./infra/ratelimiter/... 2>&1; then
    echo -e "${GREEN}✓ ratelimiter 测试通过${NC}"
    ((UNIT_TESTS_PASSED++))
else
    echo -e "${RED}✗ ratelimiter 测试失败${NC}"
    ((UNIT_TESTS_FAILED++))
fi
echo ""

# 测试基础设施 - 指标收集器
echo -e "${YELLOW}测试 infra/metrics...${NC}"
if go test -v -race ./infra/metrics/... 2>&1; then
    echo -e "${GREEN}✓ metrics 测试通过${NC}"
    ((UNIT_TESTS_PASSED++))
else
    echo -e "${RED}✗ metrics 测试失败${NC}"
    ((UNIT_TESTS_FAILED++))
fi
echo ""

# 测试领域 - Agent
echo -e "${YELLOW}测试 domain/agent...${NC}"
if go test -v -race ./domain/agent/... 2>&1; then
    echo -e "${GREEN}✓ agent 测试通过${NC}"
    ((UNIT_TESTS_PASSED++))
else
    echo -e "${RED}✗ agent 测试失败${NC}"
    ((UNIT_TESTS_FAILED++))
fi
echo ""

# 测试领域 - RAG
echo -e "${YELLOW}测试 domain/rag...${NC}"
if go test -v -race ./domain/rag/... 2>&1; then
    echo -e "${GREEN}✓ rag 测试通过${NC}"
    ((UNIT_TESTS_PASSED++))
else
    echo -e "${RED}✗ rag 测试失败${NC}"
    ((UNIT_TESTS_FAILED++))
fi
echo ""

# 测试领域 - Model
echo -e "${YELLOW}测试 domain/model...${NC}"
if go test -v -race ./domain/model/... 2>&1; then
    echo -e "${GREEN}✓ model 测试通过${NC}"
    ((UNIT_TESTS_PASSED++))
else
    echo -e "${RED}✗ model 测试失败${NC}"
    ((UNIT_TESTS_FAILED++))
fi
echo ""

# 测试领域 - A2A
echo -e "${YELLOW}测试 domain/a2a...${NC}"
if go test -v -race ./domain/a2a/... 2>&1; then
    echo -e "${GREEN}✓ a2a 测试通过${NC}"
    ((UNIT_TESTS_PASSED++))
else
    echo -e "${RED}✗ a2a 测试失败${NC}"
    ((UNIT_TESTS_FAILED++))
fi
echo ""

# 运行集成测试
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  运行集成测试                          ${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

echo -e "${YELLOW}测试 test/integration...${NC}"
if go test -v -race ./test/integration/... 2>&1; then
    echo -e "${GREEN}✓ integration 测试通过${NC}"
else
    echo -e "${RED}✗ integration 测试失败${NC}"
fi
echo ""

# 运行E2E测试
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  运行 E2E 测试                         ${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

echo -e "${YELLOW}测试 test/e2e...${NC}"
if go test -v -race ./test/e2e/... 2>&1; then
    echo -e "${GREEN}✓ e2e 测试通过${NC}"
else
    echo -e "${RED}✗ e2e 测试失败${NC}"
fi
echo ""

# 计算测试覆盖率
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  计算测试覆盖率                        ${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

echo -e "${YELLOW}运行覆盖率测试...${NC}"
go test -race -coverprofile="${COVER_PROFILE}" ./...
go tool cover -func="${COVER_PROFILE}" -o="${REPORT_DIR}/coverage.txt"
go tool cover -html="${COVER_PROFILE}" -o="${REPORT_DIR}/coverage.html" 2>/dev/null || true
echo ""

# 显示测试总结
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  测试总结                              ${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo -e "${GREEN}单元测试模块通过: ${UNIT_TESTS_PASSED}${NC}"
echo -e "${RED}单元测试模块失败: ${UNIT_TESTS_FAILED}${NC}"
echo ""

# 显示覆盖率
if [ -f "${REPORT_DIR}/coverage.txt" ]; then
    echo -e "${YELLOW}覆盖率报告:${NC}"
    tail -10 "${REPORT_DIR}/coverage.txt"
    echo ""
fi

# 生成JUnit XML报告
echo -e "${YELLOW}生成JUnit XML报告...${NC}"
go test -junitxml="${REPORT_DIR}/results.xml" ./... 2>&1 || true
echo ""

# 复制报告到前端目录
if [ -d "../frontend/test-results" ]; then
    cp -r "${REPORT_DIR}"/* "../frontend/test-results/" 2>/dev/null || true
    echo -e "${GREEN}报告已复制到 frontend/test-results/${NC}"
fi

echo ""
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  测试完成                              ${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# 如果所有单元测试通过，返回0
if [ ${UNIT_TESTS_FAILED} -eq 0 ]; then
    echo -e "${GREEN}所有单元测试通过!${NC}"
    exit 0
else
    echo -e "${RED}有单元测试失败${NC}"
    exit 1
fi
