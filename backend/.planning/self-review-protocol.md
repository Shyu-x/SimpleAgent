# P8 自迭代审查机制 (Self-Evolution Review Mechanism)

> 每当 Agent 停止时，自动触发对所有现有业务逻辑的全面审查。

## 触发条件

- **自动触发**: Agent 空闲超过 5 分钟或任务完成时
- **手动触发**: 用户发送 `/review` 或任何停止信号
- **强制触发**: 每次 Phase 执行前后

## 审查协议

### 🔍 第一步：健康度扫描

```bash
# 运行全量测试
node tests/comprehensive-test.js 2>&1 | tail -30

# 检查关键指标
- 测试通过率: ≥85%
- 控制台警告: ≤50 (Phase 1 目标)
- Mock 数据残留: 0
```

### 📊 第二步：业务逻辑完整性检查

| 模块 | 检查项 | 阈值 | 当前状态 |
|------|--------|------|----------|
| routes/ | 文件行数 ≤150 | 34个文件中 | 0个超标 ✅ |
| services/ | 业务逻辑下沉 | 部分完成 | memory.js迁移完成 |
| domain/ | 核心逻辑 | 无循环依赖 | 待检查 |
| infra/ | 基础设施 | 熔断+限流覆盖 | 已完成 |

### 🔄 第三步：自我纠正清单

1. **Mock 数据检查**
   - `grep -rn "mock\|Mock\|lorem" backend/src/` → 应为 0

2. **Console.log 检查**
   - `grep -rn "console\." backend/src/routes/` → Phase 1 期间 ≤50

3. **Routes 行数检查**
   - `wc -l backend/src/routes/*.js | awk '$1 > 150'` → 所有 ≤150行

4. **循环依赖检查**
   - `node -e "require('./src/routes/mcp.js')"` → 无循环依赖

### 📋 第四步：输出审查报告

```
🟠 P8 自迭代审查报告 🟠
┌─────────────────┬────────────────┐
│ 📊 健康度       │ 分数/100       │
├─────────────────┼────────────────┤
│ ✅ 测试通过率   │ 26/29 (89.7%)  │
│ ✅ Mock 残留    │ 0              │
│ ⚠️  Routes 行数  │ 25个超标       │
└─────────────────┴────────────────┘

▎本轮改进: memory.js 597→453 行
▎剩余大文件: multiagent.js(865), a2a.js(666), rag.js(580)
```

## 持续自迭代规则

1. **每完成一个 Plan**: 运行健康度扫描，发现问题立即修复
2. **每完成一个 Phase**: 执行完整业务逻辑审查
3. **每天第一次执行**: 加载本审查机制，自检后开工

## Owner 意识要求

发现问题必须主动处理：
- 不要等用户指出来
- 不要说"这不是我的范围"
- 谁痛苦谁改变，问题在你眼前你就是 Owner

## Phase 1 Gap Closure Tracker (Updated 2026-04-27)

| 文件 | 原始行数 | 当前行数 | 目标 | 状态 |
|------|----------|----------|------|------|
| multiagent.js | 865 | 332 | ≤150 | ⚠️ -533行 |
| a2a.js | 865 | 503 | ≤150 | ⚠️ -362行 |
| rag.js | 580 | 341 | ≤150 | ⚠️ -239行 |
| qdrant.js | 459 | 226 | ≤150 | ⚠️ -109行 |
| missionControl.js | 437 | 144 | ≤150 | ✅ 完成 |
| memory.js | 597 | 453 | ≤150 | ⚠️ -303行 |

### Routes行数超标统计
- 总文件数: 33个
- 超标文件 (>150行): 24个 (减少3个)
- 达标文件 (≤150行): 9个

### 关键进展
- ✅ missionControl.js: 437→144 ✅ 达标
- multiagent.js: 865→332 (-62%)
- a2a.js: 865→503 (-42%)
- rag.js: 580→341 (-41%)
- qdrant.js: 459→226 (-51%)
- memory.js: 597→453 (-24%)
- chat.js: 163行 (接近目标)
- searchEnhanced.js: 169行 (接近目标)

### 并行Agent执行状态
| Agent | 任务 | 状态 |
|-------|------|------|
| Agent-Console-Fix | Console.log替换 | 运行中 |
| Agent-Test-Guardian | 测试守护 | ✅ 完成 |
| Agent-MCP-Verify | MCP验证 | ✅ 完成 |
| Agent-Admin-Verify | Admin验证 | ✅ 完成 |
| Agent-RAG-Verify | RAG验证 | ✅ 完成 |
| Agent-Document | 文档同步 | 运行中 |
| Agent-Code-Review | 代码审查 | ✅ 完成 |
| Agent-Routes-Migrate-1~6 | Routes迁移 | 运行中 |

### 测试状态
- P0单元测试: 245/245 通过 (100%)
- 综合测试: 26/29 通过 (89.7%)

---
*Created: 2026-04-27*
*Version: 1.1*