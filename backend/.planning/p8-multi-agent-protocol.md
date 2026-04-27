# P8 全栈审查与多Agent协作机制

> **P8 自迭代审查协议** - 每当Agent停止时自动触发全面审查

## 🔥 PUA执行模式激活 [PUA生效 🔥]

**味道**: 🟠 阿里味 (Owner意识 + 闭环驱动)
**方法论**: 定目标→追过程→拿结果

## 第一阶段：健康度扫描

### 必检项 (每次停止时)
```bash
# 1. 测试通过率
npm test -- --runInBand --testPathPatterns="unit/(mcp|pluginManager|workflowEngine|skillSystem)" 2>&1 | grep -E "(Test Suites|Tests:)" | tail -2

# 2. Mock残留
grep -rn "mock\|Mock\|lorem" backend/src/ --include="*.js" | grep -v "node_modules" | wc -l

# 3. Console.log超标
grep -rn "console\." backend/src/ --include="*.js" | grep -v "node_modules" | wc -l

# 4. Routes行数超标
wc -l backend/src/routes/*.js | awk '$1 > 150 {count++} END {print count}'
```

### 审查标准

| 指标 | 目标 | 当前 | 状态 |
|------|------|------|------|
| P0测试通过率 | 100% | 245/245 | ✅ |
| 综合测试通过率 | ≥85% | 89.7% | ✅ |
| Mock残留 | 0 | 0 | ✅ |
| Console.log | ≤50 | 412 | ⚠️ |
| Routes达标率 | 100% | 18% | ❌ |

## 第二阶段：多Agent并行执行框架

### Agent池配置
- **并行数量**: 10+ agents
- **执行模式**: 并行执行，分层治理
- **通信机制**: A2A协议 + 状态共享

### Agent职责分配

| Agent | 职责 | 当前任务 |
|-------|------|---------|
| P8-Orchestrator | 全局协调、进度追踪 | 调度所有Agent |
| Agent-Logic-Migrate | 业务逻辑迁移 | memory.js剩余行数 |
| Agent-Console-Fix | Console.log替换 | AgentLogger替换 |
| Agent-Test-Guardian | 测试守护 | 确保245测试持续通过 |
| Agent-Routes-Audit | Routes行数审计 | 统计超标文件 |
| Agent-MCP-Verify | MCP协议验证 | Phase 2验证 |
| Agent-Admin-Verify | Admin API验证 | Phase 3验证 |
| Agent-RAG-Verify | RAG功能验证 | Phase 4验证 |
| Agent-Document | 文档同步 | 所有变更记录 |
| Agent-Code-Review | 代码审查 | 关键文件审查 |

## 第三阶段：Phase执行矩阵

### Phase 1 完成状态
- ✅ 01-01: 业务逻辑迁移 (hitl.js完成)
- ✅ 01-02: Mock数据清理 (完成)
- ✅ 01-03: 日志规范化 (113处替换)
- ✅ 01-04: 基础设施测试 (47测试新增)

### Phase 2-4 完成状态
- ✅ Phase 2: MCP工具市场完善 (3/3 plans)
- ✅ Phase 3: 管理后台集成 (3/3 plans)
- ✅ Phase 4: 生产级能力 (2/2 plans)

## 第四阶段：持续自迭代规则

### 停止触发条件
1. 每完成一个Plan → 健康度扫描
2. 每完成一个Phase → 完整业务逻辑审查
3. 发现任何测试失败 → 立即暂停并修复
4. 发现任何回归 → 立即回滚

### Owner意识要求
- 问题在你眼前，你就是Owner
- 不要等用户指出来
- 谁痛苦谁改变

---

*Created: 2026-04-27*
*Version: 2.0*
*Status: 🔥 执行中
