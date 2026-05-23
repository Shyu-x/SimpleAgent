# 前端组件测试覆盖计划 - Core + Agent

**日期**: 2026-05-18
**状态**: 待审核
**优先级**: P1

## 1. 测试范围

### Core 组件 (5个)

| 组件 | 优先级 | 测试要点 |
|------|--------|----------|
| ChatArea.tsx | P1 | 消息列表渲染、滚动、加载状态、空状态 |
| ChatInput.tsx | P1 | 输入框、发送按钮、快捷键、回车发送 |
| Message.tsx | P1 | 消息渲染、头像、状态图标、复制功能 |
| MarkdownRenderer.tsx | P1 | Markdown 解析、代码高亮、安全过滤 |
| ThinkingChain.tsx | P1 | 思维链展开/折叠、动画、状态 |

### Agent 组件 (7个)

| 组件 | 优先级 | 测试要点 |
|------|--------|----------|
| AgentExecutionPanel.tsx | P1 | Agent 执行状态、执行日志、取消功能 |
| AgentTeamOrchestrator.tsx | P1 | 多 Agent 协作、任务分配、状态同步 |
| HumanConfirmationDialog.tsx | P1 | 确认弹窗、风险等级、倒计时、快捷键 |
| ToolMarketplace.tsx | P1 | 工具列表、搜索、分类、启用/禁用 |
| PerformanceMonitor.tsx | P1 | 性能指标、图表渲染、告警显示 |
| AgentDebugger.tsx | P1 | 调试面板、日志查看、断点、变量 |
| AgentCollaborationPanel.tsx | P1 | 协作状态、消息传递、A2A 协议 |

## 2. 测试策略

### 2.1 TDD 流程
1. **RED**: 写失败的测试
2. **GREEN**: 实现最小代码通过测试
3. **REFACTOR**: 清理优化

### 2.2 测试覆盖标准
- 每个组件至少 5 个核心测试用例
- 测试组件状态渲染、用户交互、边界条件
- Mock 外部依赖 (API、SSE、Store)

### 2.3 验收标准
- 所有测试通过
- 代码覆盖率 > 70%
- 无 regression

## 3. 实现顺序

| Phase | 组件 | 测试数量 |
|-------|------|----------|
| Phase 1 | ChatArea + Message | 10 tests |
| Phase 2 | ChatInput + MarkdownRenderer | 10 tests |
| Phase 3 | AgentExecutionPanel | 8 tests |
| Phase 4 | AgentTeamOrchestrator | 8 tests |
| Phase 5 | HumanConfirmationDialog | 6 tests |
| Phase 6 | ToolMarketplace | 6 tests |
| Phase 7 | PerformanceMonitor | 6 tests |
| Phase 8 | AgentDebugger + CollaborationPanel | 8 tests |

**总计**: ~62 个测试用例

## 4. 技术要求

- 使用 Vitest (项目已配置)
- 使用 @testing-library/react
- Mock Zustand stores
- Mock API 调用
- 模拟 SSE 事件

## 5. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 组件过于复杂 | 测试编写困难 | 分解为多个测试用例 |
| 状态依赖复杂 | Mock 困难 | 使用 store 隔离 |
| 异步操作 | 测试不稳定 | 使用 waitFor/async utilities |