# 可视化全流程验证计划

## 验证目标

验证 Agent 可视化全链路（Trace → API → 前端组件 → A2A SSE → Workflow SSE）数据流是否打通，确保 Agent 执行过程可追踪、可调试、可协作。

## 验证维度总览

| 维度 | 组件 | 关键文件 | 验证重点 |
|------|------|----------|----------|
| Trace 植入 | AgentVisualizer | `backend/src/services/agentEngine.js` | trace 调用点 >= 9 |
| Trace API | 后端端点 | `backend/src/routes/admin/trace.js` | `/api/admin/traces` 正常 |
| 前端组件 | AgentDebugger | `frontend/src/components/agent/AgentDebugger.tsx` | API 路径 + 编译 |
| A2A SSE | SSE 端点 + Hook | `backend/src/routes/a2a.js` + `frontend/src/hooks/useCollaborationSSE.ts` | 协作订阅 |
| Workflow SSE | Workflow API | `backend/src/routes/workflow.js` | 执行 + 状态 + 订阅 |

---

## 1. AgentVisualizer Trace 验证

### 1.1 验证点清单

| 验证点 | 文件位置 | 验证方法 |
|--------|----------|----------|
| trace 实例创建 | `agentEngine.js:707` | `createTrace()` 调用存在 |
| MODEL_CALL step | `agentEngine.js:773` | `trace.startStep(StepType.MODEL_CALL)` |
| LLM Reasoning step | `agentEngine.js:806` | `trace.startStep(StepType.MODEL_CALL)` |
| TOOL_SELECTION step | `agentEngine.js:829` | `trace.startStep(StepType.TOOL_SELECTION)` |
| TOOL_EXECUTION step | `agentEngine.js:837` | `trace.startStep(StepType.TOOL_EXECUTION)` |
| RESULT_AGGREGATION step | `agentEngine.js:863` | `trace.startStep(StepType.RESULT_AGGREGATION)` |
| trace 结束 | `agentEngine.js:820,949` | `trace.complete()` |
| trace 错误处理 | `agentEngine.js:948` | `if (trace && trace.status === 'running')` |

### 1.2 测试命令

```bash
# 1. 统计 trace 调用点数量
grep -n "trace\." backend/src/services/agentEngine.js | grep -v "//" | wc -l

# 2. 验证 StepType 使用
grep -n "StepType\." backend/src/services/agentEngine.js

# 3. 验证 trace 对象方法调用完整性
grep -c "trace\.startStep\|trace\.endStep\|trace\.complete" backend/src/services/agentEngine.js
```

### 1.3 期望输出

- `trace.` 调用点 >= 12 次
- `StepType.MODEL_CALL`, `TOOL_SELECTION`, `TOOL_EXECUTION`, `RESULT_AGGREGATION` 均被使用
- `trace.startStep` / `trace.endStep` / `trace.complete` 配对完整

### 1.4 验收标准

- [ ] trace 实例在 Session 开始时创建
- [ ] 每个 Agent 循环步骤都有对应的 step 记录
- [ ] 异常路径有 trace 保护（`if (trace && trace.status === 'running')`）

---

## 2. AgentDebugger.tsx API 验证

### 2.1 验证点清单

| 验证点 | 文件位置 | 验证方法 |
|--------|----------|----------|
| API 路径正确 | `AgentDebugger.tsx:90` | `'/api/admin/traces'` |
| TypeScript 编译 | `frontend/` | `npx tsc --noEmit` |
| 组件挂载路径 | `frontend/src/app/page.tsx` | AgentDebugger 已引入 |

### 2.2 测试命令

```bash
# 1. 检查 API 路径是否正确
grep "api/admin/traces" frontend/src/components/agent/AgentDebugger.tsx

# 2. TypeScript 编译检查
cd frontend && npx tsc --noEmit 2>&1 | head -20

# 3. Next.js 构建检查
cd frontend && npm run build 2>&1 | tail -30
```

### 2.3 期望输出

- `'/api/admin/traces'` 出现在 fetch 调用中
- `tsc --noEmit` 无错误（或仅有不相关警告）
- `npm run build` 成功完成

### 2.4 验收标准

- [ ] AgentDebugger.tsx 使用正确路径 `/api/admin/traces`
- [ ] 无 TypeScript 编译错误
- [ ] 构建产物包含 AgentDebugger

---

## 3. A2A SSE 验证

### 3.1 验证点清单

| 验证点 | 文件位置 | 验证方法 |
|--------|----------|----------|
| SSE 订阅端点 | `a2a.js:77` | `GET /collaboration/:taskId/subscribe` |
| subscribeCollaboration 实现 | `a2aService.js:840` | `subscribeCollaboration()` 方法存在 |
| useCollaborationSSE hook | `frontend/src/hooks/useCollaborationSSE.ts:30` | hook 已导出 |
| EventSource 模式 | `useCollaborationSSE.ts` | 正确处理 SSE 事件 |

### 3.2 测试命令

```bash
# 1. 验证 SSE 端点路由存在
grep -n "subscribeCollaboration" backend/src/routes/a2a.js

# 2. 验证 hook 导出
grep -n "export.*useCollaborationSSE" frontend/src/hooks/useCollaborationSSE.ts

# 3. 启动后端并测试 SSE 连接（手动）
curl -N http://localhost:30000/api/a2a/collaboration/test-task-id/subscribe \
  -H "Accept: text/event-stream" \
  --max-time 5 \
  2>&1 | head -10
```

### 3.3 期望输出

- SSE 路由已注册
- `useCollaborationSSE` hook 存在且可导入
- SSE 端点返回 `text/event-stream` 格式（或超时，说明端点正常）

### 3.4 验收标准

- [ ] `/api/a2a/collaboration/:taskId/subscribe` 端点已注册
- [ ] `subscribeCollaboration()` 实现完整
- [ ] `useCollaborationSSE` hook 可被其他组件使用

---

## 4. Workflow API 验证

### 4.1 验证点清单

| 验证点 | 文件位置 | 验证方法 |
|--------|----------|----------|
| POST 执行端点 | `workflow.js:70` | `router.post('/execute')` |
| GET 状态端点 | `workflow.js:121` | `router.get('/execute/:executionId/status')` |
| POST 停止端点 | `workflow.js:135` | `router.post('/execute/:executionId/stop')` |
| SSE 订阅端点 | `workflow.js:142` | `router.get('/subscribe/:executionId')` |

### 4.2 测试命令

```bash
# 1. 验证所有 workflow 路由已注册
grep -n "router\.\(get\|post\)" backend/src/routes/workflow.js

# 2. 测试 POST /api/workflow/execute（空body测试）
curl -X POST http://localhost:30000/api/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{}' \
  -w "\nHTTP Status: %{http_code}\n" 2>&1 | head -20

# 3. 测试 GET /api/workflow/execute/:id/status（无效ID）
curl http://localhost:30000/api/workflow/execute/invalid-id/status \
  -w "\nHTTP Status: %{http_code}\n" 2>&1 | head -10
```

### 4.3 期望输出

- 四个路由均已注册：`/execute`, `/execute/:id/status`, `/execute/:id/stop`, `/subscribe/:id`
- POST 返回 400（参数缺失）或 500（服务未启动），不等于 404
- GET 返回 404（ID不存在）或 200（正常），不等于 404 路由不存在

### 4.4 验收标准

- [ ] `/api/workflow/execute` POST 端点存在
- [ ] `/api/workflow/execute/:id/status` GET 端点存在
- [ ] `/api/workflow/execute/:id/stop` POST 端点存在
- [ ] `/api/workflow/subscribe/:id` GET SSE 端点存在

---

## 5. 端到端集成验证

### 5.1 验证场景矩阵

| 场景 | 起点 | 终点 | 验证数据流 |
|------|------|------|------------|
| Agent 单轮执行 | 用户提问 | Trace 持久化 | `问题 → AgentEngine.trace → /api/admin/traces` |
| Agent 多轮执行 | 用户提问 | 前端显示 | `问题 → AgentEngine.trace → API → AgentDebugger.tsx` |
| A2A 协作 | 协作请求 | SSE 订阅 | `POST /api/a2a/collaborate → subscribeCollaboration → SSE` |
| Workflow 执行 | 启动工作流 | 实时状态 | `POST /execute → SSE /subscribe/:id → 前端` |

### 5.2 测试流程

#### 流程 1: Agent Trace 链路验证

```bash
# 启动后端
cd backend && npm run dev &

# 触发一次 chat
curl -X POST http://localhost:30000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "sessionId": "test-e2e-001"}' \
  -w "\nHTTP Status: %{http_code}\n" &

sleep 3

# 查询 trace 数据
curl http://localhost:30000/api/admin/traces \
  -w "\nHTTP Status: %{http_code}\n" 2>&1 | head -30
```

**期望**: trace 数据应包含 MODEL_CALL, TOOL_SELECTION, TOOL_EXECUTION 等 step 类型

#### 流程 2: AgentDebugger 前端渲染验证

```bash
# 启动前端
cd frontend && npm run dev &

# 访问 http://localhost:3001
# 打开浏览器 DevTools → Network
# 找到对 /api/admin/traces 的请求
# 验证 Response 包含 trace 数据结构
```

**期望**: Network 面板显示 `/api/admin/traces` 返回 200，Response 为 JSON 数组

#### 流程 3: A2A SSE 协作验证

```bash
# 发起协作任务
TASK_RESP=$(curl -X POST http://localhost:30000/api/a2a/collaborate \
  -H "Content-Type: application/json" \
  -d '{"task": "test", "agents": ["test-agent"]}' \
  2>/dev/null)

TASK_ID=$(echo $TASK_RESP | grep -o '"taskId":"[^"]*"' | cut -d'"' -f4)

# 订阅 SSE
curl -N http://localhost:30000/api/a2a/collaboration/$TASK_ID/subscribe \
  --max-time 10 \
  -H "Accept: text/event-stream" 2>&1 | head -20
```

**期望**: SSE 连接建立成功，收到 event-stream 数据

#### 流程 4: Workflow SSE 验证

```bash
# 启动工作流
WF_RESP=$(curl -X POST http://localhost:30000/api/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{"workflowId": "test", "input": {}}' \
  2>/dev/null)

EXEC_ID=$(echo $WF_RESP | grep -o '"executionId":"[^"]*"' | cut -d'"' -f4)

# 订阅 SSE
curl -N http://localhost:30000/api/workflow/subscribe/$EXEC_ID \
  --max-time 10 \
  -H "Accept: text/event-stream" 2>&1 | head -20
```

**期望**: SSE 连接建立成功，收到实时执行状态

### 5.3 验收标准

| 指标 | 标准 |
|------|------|
| Trace 数据完整性 | trace 对象包含 >= 5 个 step |
| API 响应时间 | `/api/admin/traces` < 500ms |
| SSE 连接成功率 | 连接建立 < 2s |
| 前端组件渲染 | AgentDebugger 无 JS 错误 |
| Workflow 状态更新 | SSE 推送频率 >= 1/秒 |

---

## 6. 验证检查清单

### 前置条件

- [ ] 后端服务运行在 `localhost:30000`
- [ ] 前端服务运行在 `localhost:3001`
- [ ] 数据库/内存存储可用
- [ ] MiniMax API Key 已配置（可选，用于实际 Agent 执行）

### 执行顺序

1. **Phase 1**: 后端 API 验证（步骤 1-4）
2. **Phase 2**: 前端组件验证（步骤 2、5.2 流程 2）
3. **Phase 3**: 端到端集成验证（步骤 5）

### 输出产物

- 验证报告: `.gsd/visualization-verify-report.md`
- 通过的验证项: 更新至 `STATE.md`
- 失败的验证项: 创建 `.gsd/visualization-failed-tasks.md`

---

## 7. 风险与降级

| 风险 | 概率 | 影响 | 降级方案 |
|------|------|------|----------|
| MiniMax API 不可用 | 低 | Agent 无法实际执行 | 使用 mock 数据验证 trace 生成 |
| SSE 连接超时 | 中 | 无法验证实时性 | 检查路由注册 + 手动 curl 验证 |
| 前端构建失败 | 低 | AgentDebugger 不可用 | 检查 TypeScript 错误并修复类型 |