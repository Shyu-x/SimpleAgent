# 前端能力与后端API需求文档

**版本**: v1.0
**日期**: 2026-04-03
**调研方法**: 5个并行Agent深度分析

---

## 一、文档概述

本文档详细记录了AI Chat玩具前端所有功能与后端API的对应关系，包括：
- 已实现且正常工作的功能
- 已实现但API路径/参数不匹配的功能
- 完全缺失需要新增后端API的功能
- 纯前端实现不需要后端的功能

---

## 二、前端功能完整度总览

### 2.1 按组件统计

| 组件/模块 | 代码行数 | 已实现API | 缺失API | 完成度 |
|-----------|----------|----------|---------|--------|
| **核心聊天** | | | | |
| ChatArea.tsx | 550 | 3 | 0 | 100% |
| ChatInput.tsx | 998 | 0 | 1 | 90% |
| ConversationList.tsx | 453 | 0 | 3 | 50% |
| **侧边栏面板** | | | | |
| MemoryPanel.tsx | ~300 | 0 | 3 | 30% |
| MultiAgentPanel.tsx | ~400 | 7 | 0 | 100% |
| ToolMarketplace.tsx | 1004 | 4 | 5 | 40% |
| KnowledgeBaseManager.tsx | ~500 | 0 | 6+ | 0% |
| **管理后台** | | | | |
| AdminDashboard.tsx | 167 | 0 | 1 | 0% |
| KnowledgeBase/index.tsx | 817 | 4+ | 4 | 70% |
| ToolRegistry/index.tsx | 971 | 4 | 4 | 60% |
| ModelConfig/index.tsx | 574 | 2 | 2 | 50% |
| PromptTemplate/index.tsx | 753 | 6 | 0 | 100% |
| TraceViewer/index.tsx | 834 | 2 | 0 | 100% |
| IntentTreeEditor/index.tsx | 940 | 5 | 0 | 100% |
| **Agent组件** | | | | |
| MissionControl/ | ~1500 | 0 | 4+ | 0% |
| PerformanceMonitor.tsx | 1250 | 0 | 2 | 0% |
| AgentExecutionPanel.tsx | 1560 | 0 | 0 | 100% |
| AgentTeamOrchestrator.tsx | 1286 | 3 | 0 | 100% |
| **状态管理** | | | | |
| chatStore.ts | 620 | N/A | 15+ | 需改造 |
| conversationStore.ts | 199 | N/A | 4+ | 需改造 |
| uiStore.ts | 152 | N/A | 0 | 纯前端 |
| messageStore.ts | 131 | N/A | 0 | 纯函数 |
| agentWorkflowStore.ts | ~400 | N/A | 10+ | 需改造 |
| MissionControlStore.ts | 345 | N/A | 8+ | 需改造 |
| **Hooks层** | | | | |
| useAgentSSE.ts | 253 | 部分 | 1 | 需SSE |
| useHITL.tsx | 418 | 11 | 0 | 100% |
| useIntentDetection.ts | 281 | 0 | 0 | 纯前端 |
| useMemorySystem.ts | ~500 | 0 | 3 | 需后端 |
| useMultiAgent.ts | ~300 | 7 | 0 | 需验证 |

---

## 三、已实现且正常工作的功能

### 3.1 核心聊天功能 ✅

| 功能 | 组件 | 后端API | 状态 |
|------|------|---------|------|
| 发送消息 | ChatArea | `POST /api/v1/chat/completions` | ✅ 完整 |
| 联网搜索 | ChatArea | `POST /api/search/enhanced` | ✅ 完整 |
| 图片生成 | ChatArea | `POST /api/minimax/image` | ✅ 完整 |
| 思维链可视化 | ChatArea | 内嵌在chat响应中 | ✅ 完整 |
| 打字机效果 | ChatArea | SSE流式响应 | ✅ 完整 |

### 3.2 HITL人机协作 ✅

| 功能 | Hook/组件 | 后端API | 状态 |
|------|-----------|---------|------|
| 获取待处理检查点 | useHITL | `GET /api/hitl/pending` | ✅ |
| 创建检查点 | useHITL | `POST /api/hitl/checkpoint` | ✅ |
| 批准检查点 | useHITL | `POST /api/hitl/checkpoint/:id/approve` | ✅ |
| 拒绝检查点 | useHITL | `POST /api/hitl/checkpoint/:id/reject` | ✅ |
| 请求确认 | useHITL | `POST /api/hitl/confirm` | ✅ |
| 获取历史记录 | useHITL | `GET /api/hitl/history` | ✅ |
| 获取统计 | useHITL | `GET /api/hitl/stats` | ✅ |
| 清除待处理 | useHITL | `POST /api/hitl/clear` | ✅ |
| SSE订阅 | useHITLSSE | `GET /api/hitl/sse` | ✅ |

### 3.3 A2A Agent协作 ✅

| 功能 | 组件 | 后端API | 状态 |
|------|------|---------|------|
| 开始协作 | AgentTeamOrchestrator | `POST /api/a2a/collaborate` | ✅ |
| 轮询状态 | AgentTeamOrchestrator | `GET /api/a2a/collaboration/:id` | ✅ |
| 停止协作 | AgentTeamOrchestrator | `DELETE /api/a2a/collaboration/:id` | ✅ |
| 获取协作结果 | AgentTeamOrchestrator | `GET /api/a2a/collaboration/:id/result` | ✅ |

### 3.4 MCP工具市场 ✅

| 功能 | 组件 | 后端API | 状态 |
|------|------|---------|------|
| 获取MCP状态 | ToolMarketplace | `GET /api/minimax/status` | ✅ |
| 连接MCP | ToolMarketplace | `POST /api/minimax/connect` | ✅ |
| 断开MCP | ToolMarketplace | `POST /api/minimax/disconnect` | ✅ |

### 3.5 管理后台(部分) ✅

| 组件 | 功能 | 后端API | 状态 |
|------|------|---------|------|
| TraceViewer | Trace列表 | `GET /api/admin/traces` | ✅ |
| TraceViewer | Trace统计 | `GET /api/admin/traces/stats` | ✅ |
| PromptTemplate | 模板CRUD | `/api/admin/prompt/*` | ✅ |
| IntentTreeEditor | 意图树CRUD | `/api/admin/intent/*` | ✅ |

---

## 四、API路径/参数不匹配问题

### 4.1 KnowledgeBase 路径不匹配 ⚠️

**问题**: 前端使用 `/documents`，后端使用 `/docs`

| 前端调用 | 后端路由 | 问题 |
|----------|----------|------|
| `GET /api/admin/knowledge/documents` | `GET /api/admin/knowledge/docs` | 路径不一致 |
| `POST /api/admin/knowledge/documents` | `POST /api/admin/knowledge/docs` | 路径不一致 |
| `DELETE /api/admin/knowledge/documents/:id` | `DELETE /api/admin/knowledge/docs/:id` | 路径不一致 |
| `POST /api/admin/knowledge/index/rebuild` | `POST /api/admin/knowledge/reindex` | 路径不一致 |

**需要修改的文件**: `frontend/src/components/admin/KnowledgeBase/index.tsx`

**修改方案**: 将所有 `/documents` 改为 `/docs`，`/index/rebuild` 改为 `/reindex`

---

### 4.2 ToolRegistry 问题 ⚠️

| 问题 | 前端调用 | 后端路由 | 修复方式 |
|------|----------|----------|----------|
| enabled字段不支持 | `PATCH /tools/:name` | `PUT /tools/:name` | 后端添加enabled处理 |
| 分类列表路径 | `GET /tools/categories` | `GET /tools/categories/list` | 添加别名路由 |
| 注册路径 | `POST /tools` | `POST /tools/register` | 添加别名路由 |
| 测试SSE | `POST /tools/test` | `POST /tools/:name/test` | 前端添加工具名参数 |

**需要修改的文件**:
- `frontend/src/components/admin/ToolRegistry/index.tsx`
- `backend/src/routes/admin/tool.js`

---

### 4.3 PromptTemplate 路径问题 ⚠️

| 问题 | 前端调用 | 后端路由 |
|------|----------|----------|
| 模板列表 | `GET /api/admin/prompts` | `GET /api/admin/prompt` |

**需要修改的文件**: `frontend/src/components/admin/PromptTemplate/index.tsx`

---

## 五、完全缺失的后端API

### 5.1 AdminDashboard Stats API ❌

**优先级**: P0
**影响**: 管理后台首页无法显示统计数据

**前端调用**: `fetch('/api/admin/stats')`
**后端状态**: 路由未注册

**需要新增的路由**: `backend/src/routes/admin/stats.js`

```javascript
/**
 * GET /api/admin/stats
 * 返回系统统计信息
 */
router.get('/', async (req, res) => {
  // 返回: 总请求数、成功率、平均延迟、活跃会话、模型调用分布、工具使用统计
});
```

---

### 5.2 ModelConfig API ❌

**优先级**: P1
**影响**: 模型配置页面无法正常工作

**前端调用**:
- `GET /api/admin/models` - 获取模型列表
- `GET /api/admin/models/stats` - 获取模型统计

**后端状态**: 路由未实现

**需要新增的路由**: `backend/src/routes/admin/model.js`

---

### 5.3 MissionControl 后端API ❌

**优先级**: P0
**影响**: 任务控制中心完全无法使用，所有数据仅内存保存

#### 5.3.1 任务管理API

| 操作 | API | 说明 |
|------|-----|------|
| 创建任务 | `POST /api/mission/tasks` | 创建新任务 |
| 获取任务列表 | `GET /api/mission/tasks` | 支持筛选/分页 |
| 更新任务 | `PATCH /api/mission/tasks/:id` | 更新状态/分配 |
| 删除任务 | `DELETE /api/mission/tasks/:id` | 删除任务 |
| 批量分配 | `POST /api/mission/tasks/batch/assign` | 批量分配Agent |

#### 5.3.2 Agent管理API

| 操作 | API | 说明 |
|------|-----|------|
| 获取Agent列表 | `GET /api/mission/agents` | 获取可用Agent |
| Agent心跳 | `POST /api/mission/agents/heartbeat` | Agent状态更新 |
| 更新Agent状态 | `PATCH /api/mission/agents/:id/status` | 更新状态/进度 |

#### 5.3.3 SSE实时更新

| 操作 | API | 说明 |
|------|-----|------|
| 任务更新订阅 | `GET /api/mission/subscribe/:missionId` | SSE实时推送 |

**需要新增的路由**: `backend/src/routes/mission.js`

---

### 5.4 PerformanceMonitor Metrics API ❌

**优先级**: P1
**影响**: 性能监控显示虚假数据

#### 5.4.1 Prometheus指标端点

**前端调用**: `GET /metrics`
**后端状态**: 未实现

**需要新增的路由**: `backend/src/routes/metrics.js`

```javascript
/**
 * GET /metrics
 * Prometheus格式指标
 */
router.get('/', (req, res) => {
  const collector = getMetricsCollector();
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(collector.toPrometheusFormat());
});
```

#### 5.4.2 实时指标SSE

**前端调用**: `GET /api/metrics/stream`
**后端状态**: 未实现

---

### 5.5 MemoryPanel 后端API ❌

**优先级**: P2
**影响**: 记忆无法跨会话同步

| 操作 | API | 说明 |
|------|-----|------|
| 同步会话记忆 | `POST /api/memory/session` | 同步到服务器 |
| 同步全局记忆 | `POST /api/memory/global` | 同步全局知识 |
| 搜索记忆 | `GET /api/memory/search` | 服务器端搜索 |

---

### 5.6 IntentTreeEditor 后端API ❌

**优先级**: P2
**影响**: 意图树编辑器无法保存修改

**前端调用**:
- `GET /api/admin/intent/tree`
- `POST /api/admin/intent/node`
- `PATCH /api/admin/intent/node/:id`
- `DELETE /api/admin/intent/node/:id`
- `POST /api/admin/intent/test`

**后端状态**: 前端组件已实现但后端路由缺失

**需要新增的路由**: `backend/src/routes/admin/intent.js`

---

## 六、纯前端实现的功能

以下功能不需要后端API，是纯前端实现：

### 6.1 意图检测系统 ✅

| Hook | 实现方式 |
|------|----------|
| useIntentDetection | 关键词模式匹配 + 权重评分 |
| useImageIntent | 正则表达式模式匹配 |
| detectIntent | 7种意图类型分类 |

### 6.2 记忆系统(本地) ✅

| Hook | 说明 |
|------|------|
| useMemorySystem | 基于Zustand store + 本地向量相似度 |
| getSessionMemories | 读写chatStore |
| searchMemories | generateSemanticHash + cosineSimilarity |

### 6.3 UI状态管理 ✅

| Store | 说明 |
|-------|------|
| uiStore | 纯UI状态，sessionStorage持久化 |
| messageStore | 纯函数工具，无状态 |
| chatStore (部分) | 对话相关依赖后端，但基础状态纯前端 |

---

## 七、Store层API需求汇总

### 7.1 chatStore.ts 需要后端API的Action

| Action | 当前实现 | 需要的后端API |
|--------|----------|--------------|
| createConversation | 本地状态 | `POST /api/conversations` |
| deleteConversation | 本地状态 | `DELETE /api/conversations/:id` |
| restoreConversation | 本地状态 | `POST /api/conversations/restore` |
| addMessage | 本地状态 | `POST /api/conversations/:id/messages` |
| updateLastMessage | 本地状态 | `PATCH /api/messages/:id` |
| deleteMessage | 本地状态 | `DELETE /api/messages/:id` |
| updateConversationTitle | 本地状态 | `PATCH /api/conversations/:id` |
| addGlobalMemory | 本地状态 | `POST /api/memory/global` |
| updateGlobalMemory | 本地状态 | `PATCH /api/memory/:id` |
| deleteGlobalMemory | 本地状态 | `DELETE /api/memory/:id` |
| hydrateGlobalMemories | 本地状态 | `GET /api/memories` |
| addCustomPrompt | 本地状态 | `POST /api/admin/prompt` |
| updateCustomPrompt | 本地状态 | `PUT /api/admin/prompt/:id` |
| deleteCustomPrompt | 本地状态 | `DELETE /api/admin/prompt/:id` |
| setApiConfig | 本地状态 | `POST /api/admin/model/config` |

### 7.2 agentWorkflowStore.ts 需要后端API的Action

| Action | 当前实现 | 需要的后端API |
|--------|----------|--------------|
| startExecution | 本地状态 | `POST /api/agent/execute` |
| pauseExecution | 本地状态 | `PATCH /api/agent/execution/:id/pause` |
| resumeExecution | 本地状态 | `PATCH /api/agent/execution/:id/resume` |
| stopExecution | 本地状态 | `DELETE /api/agent/execution/:id` |
| handleSSEEvent | 模拟SSE | `GET /api/agent/sse/:sessionId` |

### 7.3 MissionControlStore.ts 需要后端API的Action

| Action | 当前实现 | 需要的后端API |
|--------|----------|--------------|
| initializeAgents | 本地状态 | `GET /api/mission/agents` |
| addTask | 本地状态 | `POST /api/mission/tasks` |
| assignTask | 本地状态 | `PATCH /api/mission/tasks/:id` |
| completeTask | 本地状态 | `PATCH /api/mission/tasks/:id` |
| broadcastTask | 本地状态 | `POST /api/mission/broadcast` |
| batchComplete | 本地状态 | `POST /api/mission/tasks/batch/complete` |

---

## 八、Hooks层API需求汇总

### 8.1 需要后端API的Hooks

| Hook | 需要的API | 优先级 | 状态 |
|------|----------|--------|------|
| useHITL.tsx | `/api/hitl/*` (11个端点) | P0 | ✅ 已实现 |
| useHITLSSE | `/api/hitl/sse` | P0 | ✅ 已实现 |
| useAgentSSE | `/api/agent/sse` | P1 | ❌ 缺失(目前轮询) |
| useEnhancedAgent | `/api/enhancedAgent/*` (12个端点) | P1 | ❌ 缺失 |
| useMultiAgent | `/api/multiagent/*` (7个端点) | P1 | ⚠️ 待验证 |
| useSearch | `/api/search/web` | P2 | ⚠️ 待验证 |

### 8.2 纯前端Hooks

| Hook | 实现方式 |
|------|----------|
| useIntentDetection | 关键词匹配 |
| useImageIntent | 正则表达式 |
| useMemorySystem | Zustand + 本地向量 |

---

## 九、修复优先级与工作量

### 9.1 P0 - 立即修复

| 问题 | 修复方式 | 工作量 |
|------|----------|--------|
| AdminDashboard Stats API | 新建 `routes/admin/stats.js` | 小 |
| KnowledgeBase路径修正 | 修改前端3处API调用 | 小 |
| ToolRegistry enabled支持 | 修改后端1处 + 前端1处 | 小 |

### 9.2 P1 - 高优先级

| 问题 | 修复方式 | 工作量 |
|------|----------|--------|
| MissionControl后端API | 新建 `routes/mission.js` + Service | 中 |
| PerformanceMonitor Metrics | 新建 `routes/metrics.js` | 中 |
| ModelConfig API | 新建 `routes/admin/model.js` | 中 |
| ToolRegistry路径修正 | 修改前端4处 + 后端2处 | 小 |

### 9.3 P2 - 中优先级

| 问题 | 修复方式 | 工作量 |
|------|----------|--------|
| ChatInput onAccept修复 | 修改前端1处 | 微小 |
| MemoryPanel API | 新建 `routes/memory.js` | 中 |
| IntentTreeEditor API | 新建 `routes/admin/intent.js` | 中 |

### 9.4 P3 - 低优先级

| 问题 | 修复方式 | 工作量 |
|------|----------|--------|
| ConversationList持久化 | 改造store + 新建API | 中 |
| PromptTemplate路径 | 修改前端1处 | 微小 |

---

## 十、完整API需求清单

### 10.1 需要新建的后端路由

| 路由文件 | 路由前缀 | 端点数 | 说明 |
|----------|----------|--------|------|
| `routes/admin/stats.js` | `/api/admin/stats` | 1 | 系统统计 |
| `routes/admin/model.js` | `/api/admin/models` | 2 | 模型配置 |
| `routes/admin/intent.js` | `/api/admin/intent` | 5 | 意图树管理 |
| `routes/mission.js` | `/api/mission` | 8 | MissionControl |
| `routes/metrics.js` | `/api/metrics` | 2 | 性能指标 |
| `routes/memory.js` | `/api/memory` | 4 | 记忆同步 |

### 10.2 需要修正的前端API调用

| 文件 | 问题 | 修改数 |
|------|------|--------|
| `KnowledgeBase/index.tsx` | `/documents` → `/docs` | 7处 |
| `ToolRegistry/index.tsx` | 路径 + 参数修正 | 5处 |
| `PromptTemplate/index.tsx` | `/prompts` → `/prompt` | 1处 |
| `ChatInput.tsx` | onAccept空实现 | 1处 |

### 10.3 需要修正的后端路由

| 文件 | 问题 | 修改数 |
|------|------|--------|
| `routes/admin/knowledge.js` | 添加缺失路由 | 4个 |
| `routes/admin/tool.js` | enabled支持 + 别名 | 3处 |

---

## 十一、架构改造建议

### 11.1 Store层改造

当前问题：
- chatStore 和 conversationStore 职责重叠
- 所有对话/消息操作仅更新本地状态，没有自动同步后端的机制

建议方案：
```
状态变更 → 自动同步器 → 后端API
```

实现方式：
1. 在关键Store Action中集成API调用
2. 或使用Redux Thunk风格的async actions
3. 添加失败重试机制

### 11.2 SSE连接改造

当前问题：
- useAgentSSE 使用轮询模拟SSE
- PerformanceMonitor 完全使用模拟数据

建议方案：
1. 后端实现真正的SSE端点
2. 前端切换到真实EventSource
3. 添加断线重连机制

---

## 十二、测试验证清单

修复完成后需要验证的功能：

- [ ] AdminDashboard 统计数据显示正常
- [ ] KnowledgeBase 文档列表/上传/删除正常
- [ ] ToolRegistry 工具启用/禁用正常
- [ ] ToolRegistry 工具测试SSE流正常
- [ ] ModelConfig 模型列表显示正常
- [ ] MissionControl 任务持久化正常
- [ ] MissionControl Agent状态同步正常
- [ ] PerformanceMonitor 显示真实指标
- [ ] ChatInput 意图Banner点击切换Agent模式
- [ ] MemoryPanel 记忆跨会话同步

---

**文档版本**: v1.0
**最后更新**: 2026-04-03
**调研Agent数**: 5个并行
