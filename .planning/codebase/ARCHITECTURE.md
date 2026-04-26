# Architecture Research

**Domain:** AI Chat Platform (Full-stack JavaScript/TypeScript)
**Researched:** 2026-04-26
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Next.js 15 / React 19)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  App/    │  │Components│  │  Hooks/  │  │  Stores/ │  │   Lib/   │       │
│  │  Pages   │  │   (UI)   │  │  Logic   │  │  State   │  │  Utils   │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │             │             │              │
├───────┴─────────────┴─────────────┴─────────────┴─────────────┴──────────────┤
│                              BACKEND (Express.js)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        ROUTES (Interface Layer)                       │    │
│  │   chat.js | agent.js | a2a.js | hitl.js | admin/* | qdrant.js       │    │
│  └────────────────────────────────┬────────────────────────────────────┘    │
├───────────────────────────────────┼──────────────────────────────────────────┤
│                        SERVICES (Business Logic Layer)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Agent/     │  │    Model/    │  │     RAG/     │  │    Tools/    │     │
│  │   Engine     │  │   Clients    │  │   Services   │  │   Registry   │     │
│  └───────┬──────┘  └───────┬──────┘  └───────┬──────┘  └───────┬──────┘     │
│          │                 │                 │                 │             │
├──────────┴─────────────────┴─────────────────┴─────────────────┴─────────────┤
│                         APPLICATION (Orchestration Layer)                    │
│  ┌────────────────────────┐        ┌────────────────────────┐                 │
│  │   ChatOrchestrator     │        │   AgentOrchestrator   │                 │
│  │   - Intent Routing     │        │   - Task Coordination  │                 │
│  │   - Query Rewriting    │        │   - Multi-Agent Collab │                 │
│  └───────────┬────────────┘        └───────────┬────────────┘                 │
├──────────────┼─────────────────────────────────┼─────────────────────────────┤
│                         DOMAIN (Core Business Logic)                          │
│  ┌───────────┴───────────┐   ┌─────────────────┴─────────────────┐           │
│  │  Model/               │   │  RAG/                         │           │
│  │  - ModelRouter        │   │  - QueryRewriteService        │           │
│  │  - HealthChecker      │   │  - QueryDecomposeService      │           │
│  └───────────────────────┘   │  - IntentClassifier           │           │
│                              │  - Reranker                   │           │
│  ┌───────────────────────────┴──────────────────────────────┐             │
│  │  Agent/                  │  Search/                      │             │
│  │  - IntentRouter           │  - SearchChannel              │             │
│  │  - ToolExecutor            │  - SearchCoordinator          │             │
│  │  - MCPToolExecutor         └───────────────────────────────┘             │
│  └─────────────────────────────────────────────────────────────┘             │
├─────────────────────────────────────────────────────────────────────────────┤
│                      INFRASTRUCTURE (Cross-Cutting Concerns)                   │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────┐ │
│  │ Metrics/  │  │  Alert/   │  │  Config/  │  │  Queue/   │  │ SSE/    │ │
│  │ Collector │  │ Manager   │  │  Center   │  │  Manager  │  │ Service │ │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘  └─────────┘ │
│                        ┌─────────────────────┐                               │
│                        │ CircuitBreaker/    │                               │
│                        │ RateLimiter/       │                               │
│                        └─────────────────────┘                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                         COMMON (Shared Utilities)                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐            │
│  │     Errors/      │  │  CircuitBreaker │  │     Utils/       │            │
│  │   AppError.js    │  │   (duplicate)   │  │    retry.js      │            │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Routes** | HTTP interface, parameter validation, response assembly | Express Router, middleware chain |
| **Services** | Business logic orchestration, tool execution | Singleton services with DI |
| **Application** | High-level orchestration, cross-cutting concerns | ChatOrchestrator, AgentOrchestrator |
| **Domain** | Core business rules, domain models | Pure JavaScript classes |
| **Infra** | Technical concerns (metrics, alerts, config, queue) | Cross-cutting decorators |
| **Common** | Shared utilities, error handling | Error classes, retry utilities |

## Recommended Project Structure

```
backend/src/
├── application/           # 应用编排层
│   ├── ChatOrchestrator.js      # 聊天编排器
│   └── AgentOrchestrator.js     # Agent编排器
├── domain/               # 核心业务逻辑 (DDD)
│   ├── model/             # 模型抽象
│   │   ├── ModelRouter.js       # 模型路由
│   │   ├── HealthChecker.js      # 健康检查
│   │   └── index.js
│   ├── rag/               # RAG领域
│   │   ├── QueryRewriteService.js   # 问题重写
│   │   ├── QueryDecomposeService.js # 问题拆分
│   │   ├── IntentClassifier.js      # 意图分类
│   │   ├── Reranker.js              # 重排序
│   │   ├── CitationAssembler.js     # 引用组装
│   │   └── ingestion/    # 文档摄取
│   │       ├── IngestionPipeline.js
│   │       └── nodes/
│   └── agent/            # Agent领域
│       ├── IntentRouter.js
│       ├── ToolExecutor.js
│       ├── MCPToolExecutor.js
│       ├── ToolResultMerger.js
│       └── ContextAssembler.js
├── infra/                # 基础设施层
│   ├── metrics/          # 指标采集 (Prometheus格式)
│   ├── alert/           # 告警管理
│   ├── config/          # 配置中心 (热更新)
│   ├── queue/           # 队列管理器
│   ├── circuitBreaker/  # 熔断器
│   │   ├── CircuitBreaker.js
│   │   ├── CircuitState.js
│   │   ├── CircuitEvent.js
│   │   └── CircuitBreakerFactory.js
│   ├── rateLimiter/     # 限流器
│   │   ├── QueueRateLimiter.js
│   │   ├── RateLimiterFactory.js
│   │   └── client.js
│   └── sse/              # SSE基础设施
│       ├── ProbeBufferingCallback.js
│       └── sseService.js
├── common/               # 通用基础
│   ├── errors/           # 统一错误体系
│   │   ├── AppError.js
│   │   ├── errors.js
│   │   └── index.js
│   └── CircuitBreaker.js
├── routes/               # 接口层 (30+ 路由)
│   ├── chat.js           # 聊天接口
│   ├── agent.js          # Agent接口
│   ├── a2a.js            # A2A协议
│   ├── hitl.js           # HITL确认
│   ├── admin/            # 管理后台API
│   │   ├── knowledge.js
│   │   ├── tool.js
│   │   ├── model.js
│   │   ├── prompt.js
│   │   └── trace.js
│   └── qdrant.js         # Qdrant向量数据库
├── services/             # 业务逻辑层
│   ├── agentEngine.js    # Agent执行引擎 (ReAct循环)
│   ├── agent/            # Agent服务
│   │   ├── IntentClassifier.js
│   │   ├── QueryRewriteService.js
│   │   ├── QueryDecomposeService.js
│   │   ├── MemoryWindowManager.js
│   │   ├── ToolExecutor.js
│   │   └── AgentVisualizer.js
│   ├── model/            # 模型客户端
│   │   ├── ChatModelClient.js      # 统一接口
│   │   ├── clients/MiniMaxChatClient.js
│   │   └── ModelClientFactory.js
│   ├── rag/             # RAG服务
│   │   ├── ragService.js
│   │   ├── QueryRewriteService.js
│   │   └── RerankerService.js
│   ├── router/          # 模型路由
│   │   ├── modelRouter.js
│   │   └── QdrantRouter.js
│   ├── tools/           # 工具实现 (30+)
│   │   ├── toolRegistry.js
│   │   ├── weatherTool.js
│   │   ├── webSearchTool.js
│   │   └── ...
│   └── metrics/         # 指标收集
├── middleware/          # 中间件
│   ├── security.js      # 安全头、CORS
│   └── rateLimiter.js   # 请求限流
├── utils/               # 工具函数
│   └── retry.js         # 指数退避重试
└── scripts/             # 脚本
    └── ContinuousLearning.js  # 持续学习

frontend/src/
├── app/                  # Next.js App Router
│   ├── page.tsx         # 主页面
│   ├── layout.tsx       # 根布局
│   ├── globals.css      # 全局样式
│   └── admin/           # 管理后台页面
│       ├── kb/          # 知识库
│       ├── models/      # 模型配置
│       ├── prompts/     # Prompt模板
│       ├── tools/       # 工具管理
│       └── traces/       # 链路追踪
├── components/           # React 组件
│   ├── ChatArea.tsx     # 聊天区域
│   ├── ChatInput.tsx    # 输入框
│   ├── ConversationList.tsx  # 对话列表
│   ├── MultiWindowChat.tsx   # 多窗口聊天
│   ├── MarkdownRenderer.tsx   # Markdown渲染
│   ├── ThinkingChain.tsx     # 思维链展示
│   ├── IntentSuggestionBanner.tsx  # 意图检测Banner
│   ├── agent/           # Agent相关组件
│   │   ├── AgentWorkspace.tsx
│   │   ├── HumanConfirmationDialog.tsx
│   │   ├── AgentExecutionPanel.tsx
│   │   ├── ToolMarketplace.tsx
│   │   ├── MissionControl/
│   │   └── workflow/
│   ├── admin/           # 管理后台组件
│   │   ├── AdminDashboard.tsx
│   │   ├── KnowledgeBase/
│   │   ├── ToolRegistry/
│   │   ├── ModelConfig/
│   │   ├── PromptTemplate/
│   │   └── TraceViewer/
│   └── mobile/          # 移动端适配
├── stores/              # Zustand 状态管理
│   ├── chatStore.ts     # 聊天状态
│   ├── conversationStore.ts  # 对话状态
│   ├── messageStore.ts  # 消息状态
│   └── uiStore.ts       # UI状态
├── hooks/               # 自定义Hooks
│   ├── useAgentSSE.ts   # Agent SSE钩子
│   ├── useHITL.ts       # 人工确认钩子
│   ├── useIntentDetection.ts  # 意图检测
│   ├── useRealAgentSSE.ts
│   └── useSearch.tsx
├── lib/                 # 工具库
│   ├── apiClient.ts     # API客户端
│   ├── apiConfig.ts     # API配置
│   ├── modelConfig.ts   # 模型配置
│   ├── sse.ts           # SSE工具
│   └── export.ts
├── types/               # TypeScript类型
│   ├── index.ts
│   ├── prompts.ts
│   └── thinking.ts
└── contexts/            # React Context
    └── RouterContext.tsx
```

### Structure Rationale

- **application/**: High-level orchestration separates business flow from HTTP concerns
- **domain/**: Pure business logic independent of frameworks (DDD)
- **infra/**: Technical concerns that cut across all layers (metrics, alerts, config)
- **routes/**: Thin HTTP layer - only parameter validation and response assembly
- **services/**: Business logic that doesn't fit domain boundaries (tool implementations)
- **frontend stores/**: Zustand for reactive state with persistence middleware

## Architectural Patterns

### Pattern 1: Domain-Driven Design (DDD)

**What:** Separating core business logic into `domain/` with entities like `ModelRouter`, `Reranker`, `IntentClassifier`
**When to use:** Complex business domains with multiple related entities
**Trade-offs:** + Clear boundaries, + testable, - initial overhead

**Example:**
```javascript
// domain/rag/IntentClassifier.js
class IntentClassifier {
  classify(query) { /* pure business logic */ }
  getClarificationQuestion(lowConfidenceIntent) { /* domain knowledge */ }
}

// Called from services, not routes directly
```

### Pattern 2: Orchestrator Pattern

**What:** Central coordinator (ChatOrchestrator) manages complex workflows across multiple services
**When to use:** Complex multi-step flows requiring coordination
**Trade-offs:** + Centralized logic, + easy to modify flow, + monitoring point

**Example:**
```javascript
// application/ChatOrchestrator.js
class ChatOrchestrator {
  async processMessage(query, context) {
    const intent = await this.intentClassifier.classify(query);
    if (intent.needsClarification) {
      return this.generateClarification(intent);
    }
    const rewrittenQuery = await this.queryRewriter.rewrite(query);
    const results = await this.hybridSearch.search(rewrittenQuery);
    return this.assembleResponse(results);
  }
}
```

### Pattern 3: Circuit Breaker Pattern

**What:** Prevents cascading failures by wrapping external service calls with state machine
**When to use:** External API calls that can fail or timeout
**Trade-offs:** + Resilience, + Graceful degradation, - Added complexity

**Example:**
```javascript
// infra/circuitBreaker/CircuitBreaker.js
class CircuitBreaker {
  async execute(fn) {
    if (this._state === CircuitState.OPEN) {
      throw new ServiceUnavailableError();
    }
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (e) {
      this._onFailure();
      throw e;
    }
  }
}
```

### Pattern 4: Repository Pattern

**What:** Abstracts data access behind interfaces (vector store, memory store)
**When to use:** Multiple data sources or potential technology swaps
**Trade-offs:** + Testability, + Flexibility, - Indirection overhead

**Example:**
```javascript
// services/vector/QdrantVectorStore.js
class QdrantVectorStore {
  async search(vector, options) { /* Qdrant-specific */ }
  async upsert(documents) { /* Qdrant-specific */ }
}

// Used uniformly without exposing Qdrant implementation
```

## Data Flow

### Request Flow (Chat Message)

```
[User Input in ChatInput]
    ↓
[Frontend: chatStore.addMessage()]
    ↓
[lib/apiClient.ts: fetchSSE()] → POST /api/chat
    ↓
[Backend Routes: routes/chat.js]
    ↓
[Application: ChatOrchestrator.process()]
    ↓
[Domain: IntentClassifier.classify()]
    ↓
[Domain: QueryRewriteService.rewrite()]
    ↓
[Services: HybridSearch.search()]
    ↓
[Domain: Reranker.rerank()]
    ↓
[Services: agentEngine.execute()] (if tool call needed)
    ↓
[Services: MiniMaxRouter.chat()]
    ↓
[SSE Stream back to frontend]
    ↓
[Frontend: useAgentSSE onChunk callback]
    ↓
[UI: MarkdownRenderer + ThinkingChain]
```

### State Management (Zustand)

```
[State Store: chatStore.ts]
    ↓ (subscribe)
[Components: ChatArea, ChatInput, MessageList]
    ↕
[Actions: setMessages, addMessage, setConversations]
    ↓
[Reducers: Immer-powered Zustand mutations]
    ↓
[Persistence: sessionStorage for API keys, MemoryPanel data]
```

### Key Data Flows

1. **Chat Flow:** User input → Intent detection → Query rewrite → RAG search → LLM response → SSE stream
2. **Agent Flow:** Task → Intent router → Tool executor → Result merger → Response assembly
3. **Admin Flow:** CRUD operations → Admin routes → Domain services → Persistence
4. **Memory Flow:** Conversation → Semantic memory → Session notes → Recall on context

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Monolith fine, no caching needed |
| 1k-100k users | Add Redis caching, connection pooling |
| 100k+ users | Split into microservices (chat vs agent vs admin) |

### Scaling Priorities

1. **First bottleneck:** SSE connections (limit per user, implement heartbeat)
2. **Second bottleneck:** RAG vector search (Qdrant cluster, replica scaling)
3. **Third bottleneck:** MiniMax API rate limits (model pooling, request queuing)

## Anti-Patterns

### Anti-Pattern 1: Routing Business Logic to Routes

**What people do:** Put business logic directly in Express route handlers
**Why it's wrong:** Hard to test, violates single responsibility, couples HTTP to business
**Do this instead:** Keep routes thin, delegate to services/orchestrators

### Anti-Pattern 2: Mixed Infrastructure and Domain Code

**What people do:** Import infra utilities (metrics, circuit breaker) directly in domain classes
**Why it's wrong:** Domain becomes coupled to infrastructure, hard to reuse
**Do this instead:** Use dependency injection, pass infra as constructor arguments

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| MiniMax API | Direct HTTP with retry | Token Plan API, models M2.7/VL-01 |
| Qdrant | HTTP REST | Vector storage, 1024-dim embeddings |
| Ollama | HTTP REST (optional) | Local embedding model |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Routes → Orchestrators | Direct function call | Sync, returns Promise |
| Orchestrators → Domain | Direct function call | Pure business logic |
| Services → Infra | Dependency injection | MetricsCollector, AlertManager |

## Sources

- CLAUDE.md (项目指令)
- domain/rag/IntentClassifier.js (749 lines - 意图分类)
- domain/agent/ToolExecutor.js (479 lines - 工具执行)
- infra/circuitBreaker/CircuitBreaker.js (熔断器实现)
- frontend/stores/chatStore.ts (Zustand状态管理)

---

*Architecture research for: AI Chat Platform*
*Researched: 2026-04-26*