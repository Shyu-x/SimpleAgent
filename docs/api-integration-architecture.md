# API 集成架构分析报告

## 1. 系统概览

### 1.1 技术栈
- **前端**: React 19 + Next.js 16 + Zustand 5
- **后端**: Express.js + Node.js
- **通信**: REST API + SSE 流式响应
- **端口**: 前端 8080，后端 30000

### 1.2 核心配置文件

| 文件 | 职责 |
|------|------|
| `frontend/src/lib/apiConfig.ts` | 前端 API 端点配置 |
| `frontend/src/lib/apiClient.ts` | HTTP 客户端封装、拦截器、重试机制 |
| `backend/src/index.js` | 后端路由注册与中间件配置 |
| `backend/src/middleware/errorHandler.js` | 统一错误处理 |
| `backend/src/services/sseService.js` | SSE 流式服务 |

---

## 2. API 客户端配置

### 2.1 前端 API 配置 (`apiConfig.ts`)

```typescript
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000';

export const API_ENDPOINTS = {
  base: API_BASE,
  chat: `${API_BASE}/chat`,
  rag: { kb: `${API_BASE}/rag/kb`, stats: `${API_BASE}/rag/stats` },
  hitl: `${API_BASE}/hitl`,
  a2a: `${API_BASE}/a2a`,
  minimax: `${API_BASE}/minimax`,
  metrics: { realtime: `${API_BASE}/metrics/realtime`, ... },
  // ... 20+ 端点分类
};
```

### 2.2 API 客户端核心功能 (`apiClient.ts`)

#### 核心特性
| 特性 | 实现 |
|------|------|
| **拦截器** | 请求/响应/错误三类拦截器，支持添加/移除 |
| **Bearer Token 认证** | 自动从 sessionStorage 获取并添加 Authorization 头 |
| **超时控制** | 默认 30s，支持 AbortController 取消 |
| **自动重试** | 5xx 错误/网络错误/超时，指数退避 (1s, 2s, 4s...) |
| **JSON 序列化** | 自动设置 Content-Type，自动解析响应 |

#### 错误分类
```typescript
export type ApiErrorCode =
  | 'NETWORK'      // 网络错误 (status === 0)
  | 'TIMEOUT'      // 请求超时
  | 'SERVER'       // 服务器错误 (5xx)
  | 'CLIENT'       // 客户端错误 (4xx)
  | 'UNAUTHORIZED' // 401
  | 'FORBIDDEN'    // 403
  | 'NOT_FOUND'    // 404
  | 'UNKNOWN';
```

#### SSE 流式请求
```typescript
export async function fetchStream(
  endpoint: string,
  body: Record<string, unknown>,
  callbacks: StreamCallbacks,  // onChunk, onThinking, onDone, onError
  options: StreamOptions = {}
): Promise<void>
```

---

## 3. 后端路由架构

### 3.1 路由注册概览 (`backend/src/index.js`)

```javascript
// 30+ 路由模块
app.use('/api/chat', chatRoutes);              // SSE 聊天
app.use('/api/hitl', hitlRoutes);              // HITL 确认
app.use('/api/a2a', a2aRoutes);                 // Agent 协作
app.use('/api/agent', a2aRoutes);              // Agent 别名
app.use('/api/rag', ragRoutes);                 // 知识库
app.use('/api/memory', memoryRoutes);          // 记忆系统
app.use('/api/mission', missionControlRoutes); // 任务控制
app.use('/api/admin/knowledge', adminKnowledgeRoutes);
app.use('/api/admin/tools', adminToolRoutes);
app.use('/api/admin/models', adminModelRoutes);
app.use('/api/admin/prompts', adminPromptRoutes);
app.use('/api/admin/traces', adminTraceRoutes);
app.use('/api/admin/intent', adminIntentRoutes);
app.use('/api/admin/stats', adminStatsRoutes);
// Ollama 路由已移除，统一使用 Qdrant
app.use('/api/qdrant', qdrantRoutes);           // Qdrant 向量数据库
app.use('/api/qdrant', qdrantRoutes);           // Qdrant 向量数据库
app.use('/api/metrics', metricsRoutes);        // Prometheus 指标
app.use('/api/mcp', mcpRoutes);                // MCP 协议
// ... 更多路由
```

### 3.2 核心路由模块

| 路由 | 文件 | 端点数 | 说明 |
|------|------|--------|------|
| chat | routes/chat.js | 3 | SSE 流式聊天 |
| hitl | routes/hitl.js | 11 | HITL 人机协作 |
| a2a | routes/a2a.js | 25+ | Agent-to-Agent 协作 |
| rag | routes/rag.js | 8 | 知识库检索 |
| memory | routes/memory.js | 14 | 记忆系统 |
| admin/knowledge | routes/admin/knowledge.js | 12 | 知识库管理 |
| admin/tool | routes/admin/tool.js | 15 | 工具管理 |
| admin/model | routes/admin/model.js | 10 | 模型管理 |

---

## 4. 端点矩阵 (Frontend → Backend)

### 4.1 核心聊天流程

| 前端 Hook/组件 | API 端点 | 方法 | 说明 |
|----------------|----------|------|------|
| ChatArea | `/api/chat` | POST | SSE 流式聊天 |
| useAgentSSE | `/api/multiagent/sse/:sessionId` | GET | Agent 工作流 SSE |
| useHITL | `/api/hitl/checkpoint` | POST | 创建确认检查点 |
| useHITL | `/api/hitl/checkpoint/:id/approve` | POST | 批准 |
| useHITL | `/api/hitl/checkpoint/:id/reject` | POST | 拒绝 |

### 4.2 Agent 协作流程

| 前端 | API 端点 | 方法 | 说明 |
|------|----------|------|------|
| AgentTeamOrchestrator | `/api/a2a/agents` | GET | 获取 Agent 列表 |
| AgentTeamOrchestrator | `/api/a2a/collaborate` | POST | 发起协作任务 |
| AgentTeamOrchestrator | `/api/a2a/collaboration/:id` | GET | 获取协作状态 |
| AgentTeamOrchestrator | `/api/a2a/subscribe/:agentId` | GET | SSE 订阅消息 |

### 4.3 管理后台

| 前端组件 | API 端点 | 方法 | 说明 |
|----------|----------|------|------|
| KnowledgeBase | `/api/admin/knowledge/docs` | GET/POST | 文档 CRUD |
| ToolRegistry | `/api/admin/tools` | GET/POST/PUT | 工具注册管理 |
| ModelConfig | `/api/admin/models` | GET/PATCH | 模型配置 |
| PromptTemplate | `/api/admin/prompts` | GET/POST/PUT | Prompt 模板 |
| TraceViewer | `/api/admin/traces` | GET | 链路追踪查询 |
| IntentTreeEditor | `/api/admin/intent/tree` | GET/POST | 意图树编辑 |
| AdminDashboard | `/api/admin/stats` | GET | 统计信息 |

### 4.4 RAG 与检索

| 前端 Hook | API 端点 | 方法 | 说明 |
|-----------|----------|------|------|
| useKnowledgeBase | `/api/rag/kb/query` | POST | 知识库检索 |
| useSearch | `/api/search` | POST | 混合搜索 |
| useSearchEnhanced | `/api/search/enhanced` | POST | 增强搜索 |

---

## 5. SSE/WebSocket 集成

### 5.1 SSE 服务架构 (`sseService.js`)

```javascript
class SSEService {
  // SSE 流式聊天
  static async handleChat(req, res) {
    // 1. 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // 2. 调用 MiniMax API
    const result = await miniMaxRouter.execute({
      messages,
      model: 'MiniMax-M2.7',
      stream: true
    });

    // 3. 流式转发响应
    const reader = responseStream.getReader();
    while ({ done } = await reader.read()) {
      // 解析并转发 MiniMax 响应格式
    }
  }
}
```

### 5.2 SSE 事件格式

```typescript
// 前端接收格式
interface SSEEvent {
  type: 'chunk' | 'thinking' | 'done' | 'error' | 'connected';
  content?: string;    // 流式文本
  thinking?: string;   // MiniMax 思维链
}

// 后端发送格式 (data: {...})
{ "type": "chunk", "content": "Hello" }
{ "type": "thinking", "content": "思考中..." }
{ "type": "done", "content": "" }
{ "type": "error", "errorType": "TIMEOUT", "message": "..." }
```

### 5.3 前端 SSE 处理 (`useAgentSSE.ts`)

```typescript
// 两种实现
1. useAgentSSE - 轮询模式 (当前默认)
   - 每 2 秒轮询 /api/multiagent/status
   - 检测状态变化触发事件

2. useRealAgentSSE - 真实 SSE 连接
   - EventSource 连接到 /api/a2a/subscribe/:agentId
   - 支持 task_start, task_complete, confirmation 等事件
```

### 5.4 A2A SSE 订阅

```javascript
// GET /api/a2a/subscribe/:agentId
// 事件流:
data: { "event": "connected", "agentId": "..." }
data: { "event": "message", "data": { ... } }
data: { "event": "task_complete", "taskId": "...", "result": "..." }
: heartbeat  // 每 30 秒心跳
```

---

## 6. 认证与安全

### 6.1 认证流程

```
前端                                    后端
  |                                      |
  |-- POST /api/chat (SSE) ------------->|
  |   Authorization: Bearer <token>      |
  |                                      |-- sessionStorage.getItem('auth_token')
  |<-- SSE Stream -----------------------|
```

### 6.2 Token 存储

```typescript
// apiClient.ts
const TOKEN_KEY = 'auth_token';

apiClient.addRequestInterceptor((config) => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});
```

### 6.3 CORS 配置

```javascript
// backend/src/index.js
const corsOptions = {
  origin: (origin, callback) => {
    // 允许 localhost 和无 origin 请求
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      callback(null, true);
    } else {
      callback(null, true); // 生产环境应限制
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Trace-Id', 'X-Span-Id'],
  credentials: false
};
```

### 6.4 安全中间件

| 中间件 | 位置 | 功能 |
|--------|------|------|
| 请求体大小限制 | index.js | `express.json({ limit: '1mb' })` |
| CORS | index.js | 跨域请求控制 |
| 追踪中间件 | index.js | TracingService 全链路追踪 |
| 基础请求日志 | index.js | 非生产环境记录请求 |

---

## 7. 错误处理

### 7.1 前端错误处理 (`apiClient.ts`)

```typescript
// 错误类
export class ApiError extends Error {
  isNetworkError(): boolean;   // status === 0
  isTimeout(): boolean;        // code === 'TIMEOUT'
  isServerError(): boolean;    // 5xx
  isClientError(): boolean;    // 4xx
  isUnauthorized(): boolean;    // 401
  isForbidden(): boolean;      // 403
  getErrorType(): ApiErrorCode;
}

// 错误拦截器
apiClient.addErrorInterceptor((error) => {
  console.error(`[API] ❌ ${error.url} - ${error.message}`, {
    status: error.status,
    code: error.code,
  });
});
```

### 7.2 后端错误处理 (`middleware/errorHandler.js`)

```javascript
// AppError 错误码体系
AppError.CODES = {
  SYS_INTERNAL: { code: 'SYS-001', status: 500 },
  VAL_INVALID: { code: 'VAL-002', status: 400 },
  AUTH_REQUIRED: { code: 'AUTH-001', status: 401 },
  RATE_LIMIT: { code: 'RATE-001', status: 429 },
  // ...
};

// 错误响应格式
{
  success: false,
  error: {
    code: 'AUTH-001',
    message: '未授权访问',
    requestId: 'req_123456_abc',
    details: { ... }
  }
}
```

### 7.3 错误传播流程

```
1. 后端捕获异常
2. errorHandler 中间件处理
3. 根据错误类型分类 (AppError/ValidationError/SyntaxError/MongoError/JWT)
4. 记录日志 (console.error/warn)
5. 返回统一格式 JSON

前端 fetchApi 捕获响应:
6. 检查 response.ok (2xx)
7. 5xx 错误触发重试
8. 4xx 错误调用 errorInterceptors
9. 返回 ApiResult { data, error, status }
```

### 7.4 SSE 错误处理

```javascript
// backend sseService.js
function classifyError(error, response) {
  if (包含 'API Key') return { type: 'authentication_error', ... }
  if (包含 '429'/'rate limit') return { type: 'rate_limit_error', ... }
  if (包含 'timeout') return { type: 'timeout_error', ... }
  if (response?.status >= 500) return { type: 'server_error', ... }
  return { type: 'unknown_error', ... }
}

// 前端 fetchStream 错误回调
callbacks.onError?.(new ApiError(error.message, 0, 'NETWORK', endpoint));
```

---

## 8. API 流程图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         前端 (React/Next.js)                        │
├─────────────────────────────────────────────────────────────────────┤
│  ChatArea              AgentTeamOrchestrator     AdminDashboard     │
│  useAgentSSE           useRealAgentSSE          KnowledgeBase      │
│  useHITL               useKnowledgeBase          ToolRegistry       │
│         │                      │                      │             │
│         └──────────────────────┼──────────────────────┘             │
│                                ▼                                      │
│                   ┌─────────────────────┐                            │
│                   │   apiClient.ts      │                            │
│                   │  • fetchApi()       │                            │
│                   │  • fetchStream()    │                            │
│                   │  • 拦截器/重试      │                            │
│                   └─────────┬───────────┘                            │
│                             │                                         │
└─────────────────────────────┼─────────────────────────────────────────┘
                              │ HTTP/HTTPS + SSE
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         后端 (Express.js)                            │
├─────────────────────────────────────────────────────────────────────┤
│  /api/chat ──────────► sseService.js ──────────► MiniMax API        │
│  /api/hitl ──────────► hitlManager.js                                │
│  /api/a2a ───────────► a2aService.js ────────► MultiAgentCoordinator│
│  /api/rag ───────────► ragService.js                                 │
│  /api/memory ────────► memoryService.js                              │
│  /api/admin/* ───────► routes/admin/*.js                             │
│                              │                                         │
│                   ┌──────────┴──────────┐                            │
│                   │  errorHandler.js    │                            │
│                   │  • AppError 处理    │                            │
│                   │  • 统一响应格式     │                            │
│                   │  • 日志记录         │                            │
│                   └─────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. 关键数据流

### 9.1 聊天消息流

```
1. 用户输入消息
2. ChatInput 调用 setMessages()
3. 前端调用 fetchStream('/api/chat', { messages, stream: true }, callbacks)
4. 后端 SSEService.handleChat() 接收请求
5. 验证 messages 参数
6. 调用 miniMaxRouter.execute({ messages, stream: true })
7. MiniMax API 返回流式响应
8. SSE Service 读取流并解析 MiniMax 格式
9. 转换格式: content_block_delta → chunk/thinking
10. 前端 onChunk/onThinking 回调更新 UI
11. 完成后 onDone() 调用
```

### 9.2 HITL 确认流

```
1. Agent 执行遇到需要确认的操作
2. 后端调用 hitlManager.createCheckpoint({ type, title, ... })
3. 前端 useHITL 轮询 /api/hitl/pending
4. 弹窗 HumanConfirmationDialog
5. 用户选择 批准/拒绝
6. 前端调用 POST /api/hitl/checkpoint/:id/approve 或 /reject
7. hitlManager 更新状态并继续/中止操作
8. SSE/轮询通知前端结果
```

### 9.3 A2A 协作流

```
1. 前端调用 POST /api/a2a/collaborate
2. MultiAgentCoordinator 创建 TaskDefinition
3. 根据 coordinationMode 执行:
   - team_leader: 主 Agent 分配任务给其他 Agent
   - collaborative: Agent 对等协作
   - autonomous: 独立并行执行
4. 钩子事件触发 (task:created, task:completed 等)
5. SSE 推送进度给订阅的前端
6. 完成后返回标准化结果汇总
```

---

## 10. 安全考虑

### 10.1 当前安全措施

| 措施 | 实现 | 状态 |
|------|------|------|
| CORS | 允许 localhost，生产环境需配置 | ⚠️ 生产环境需修改 |
| 请求体大小限制 | 1MB limit | ✅ |
| Bearer Token | sessionStorage 存储 | ⚠️ 无刷新机制 |
| 错误信息隐藏 | 生产环境不返回 stack trace | ✅ |
| 安全响应头 | X-Content-Type-Options 等 | ❌ 未配置 |
| IP 限流 | 中间件层面未实现 | ⚠️ 需完善 |
| 参数校验 | 各路由自行校验 | ⚠️ 不一致 |

### 10.2 建议改进

1. **CORS 生产配置**: 限制 origin 为实际域名
2. **Token 刷新机制**: 实现 Access Token + Refresh Token
3. **安全响应头**: 添加 helmet 中间件
4. **限流中间件**: 集成 express-rate-limit
5. **统一参数校验**: 使用 express-validator 或 zod

---

## 11. 端点完整列表

### 11.1 核心业务端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/chat | SSE 流式聊天 |
| POST | /api/chat/stop | 停止生成 |
| GET | /api/health | 健康检查 |
| POST | /api/search | 混合搜索 |
| POST | /api/search/enhanced | 增强搜索 |

### 11.2 HITL 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/hitl/checkpoint | 创建检查点 |
| GET | /api/hitl/pending | 获取待处理 |
| POST | /api/hitl/checkpoint/:id/approve | 批准 |
| POST | /api/hitl/checkpoint/:id/reject | 拒绝 |
| GET | /api/hitl/history | 历史记录 |
| GET | /api/hitl/stats | 统计信息 |

### 11.3 A2A 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/a2a/status | 服务状态 |
| GET | /api/a2a/agents | Agent 列表 |
| POST | /api/a2a/agents/register | 注册 Agent |
| POST | /api/a2a/send | 发送消息 |
| GET | /api/a2a/subscribe/:agentId | SSE 订阅 |
| POST | /api/a2a/collaborate | 发起协作 |
| GET | /api/a2a/collaboration/:id | 协作状态 |
| POST | /api/a2a/tasks/define | 定义任务 |

### 11.4 Admin 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | /api/admin/knowledge/docs | 文档管理 |
| GET/POST/PUT | /api/admin/tools | 工具管理 |
| GET/PATCH | /api/admin/models | 模型配置 |
| GET/POST/PUT | /api/admin/prompts | Prompt 模板 |
| GET | /api/admin/traces | 链路追踪 |
| GET/POST | /api/admin/intent/tree | 意图树 |
| GET | /api/admin/stats | 统计信息 |

### 11.5 向量服务端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/qdrant/status | Qdrant 状态 |
| GET | /api/qdrant/collections | 集合列表 |
| POST | /api/qdrant/search | Qdrant 搜索 |
| GET | /api/qdrant/collections | 集合列表 |
| POST | /api/qdrant/search | Qdrant 搜索 |

---

## 12. 总结

### 架构优点
1. **统一 API 客户端**: 拦截器机制灵活，支持请求/响应/错误统一处理
2. **SSE 流式响应**: 完整的流式聊天实现，支持思维链
3. **完善的错误体系**: AppError 错误码体系，错误分类清晰
4. **丰富的端点**: 30+ 路由覆盖聊天、Agent、RAG、管理等场景
5. **A2A 协议完整**: 支持 Agent 注册、消息传递、任务委托、SSE 订阅

### 改进建议
1. **安全增强**: CORS 生产配置、Token 刷新、安全响应头
2. **参数校验统一**: 引入 zod/express-validator 统一校验
3. **限流完善**: 集成 express-rate-limit 防止滥用
4. **文档完善**: Swagger 文档覆盖所有端点
5. **测试覆盖**: 补充 API 集成测试

---

**文档版本**: v1.0
**生成日期**: 2026-04-04
**分析范围**: 前端 API 客户端 + 后端路由架构 + SSE 集成 + 错误处理
