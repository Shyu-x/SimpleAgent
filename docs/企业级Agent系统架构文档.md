# AI Chat 玩具 - 企业级 Agent 系统架构文档

> 版本: v2.2.0 Enterprise
> 日期: 2026-03-22
> 状态: 正式发布

---

## 一、架构总览

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              前端 (React 19 + Next.js 16)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Stores   │  │ Components  │  │   Hooks    │  │   ErrorBoundary    │  │
│  │  (Zustand) │  │             │  │             │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │ HTTP/SSE
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              后端 (Node.js + Express)                          │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         routes/ (接口层)                                   │   │
│  │   chat.js  agent.js  search.js  rag.js  hitl.js  a2a.js  mcp.js     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                      application/ (应用编排层)                            │   │
│  │   ┌─────────────────────┐      ┌─────────────────────┐                 │   │
│  │   │  ChatOrchestrator  │      │  AgentOrchestrator   │                 │   │
│  │   │    (226行)         │      │    (274行)          │                 │   │
│  │   └─────────────────────┘      └─────────────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        domain/ (领域逻辑层)                               │   │
│  │                                                                            │   │
│  │   ┌──────────────────────────────────────────────────────────────┐     │   │
│  │   │  agent/          │  search/          │  rag/              │     │   │
│  │   │  ─────────────    │  ─────────────     │  ─────────────     │     │   │
│  │   │  • AgentEngine   │  • SearchChannel   │  • RAGService     │     │   │
│  │   │  • IntentClass.  │  • VectorChannel   │  • IngestionPipe. │     │   │
│  │   │  • MemoryManager │  • KeywordChannel   │    - ParseNode   │     │   │
│  │   │  • TokenManager  │  • SearchCoord.   │    - ChunkNode   │     │   │
│  │   │                  │  • ProcessorChain   │    - EmbedNode   │     │   │
│  │   │  model/          │                    │    - IndexNode   │     │   │
│  │   │  ─────────────    │  postProcessors/   │                   │     │   │
│  │   │  • ModelRouter   │  ─────────────     │                   │     │   │
│  │   │  • HealthChecker │  • Deduplication   │                   │     │   │
│  │   │                  │  • Reranker        │                   │     │   │
│  │   │                  │  • ThresholdFilter │                   │     │   │
│  │   └──────────────────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                      infra/ (基础设施层)                                 │   │
│  │                                                                            │   │
│  │   circuitBreaker/     │  rateLimiter/      │  sse/                     │   │
│  │   ───────────────     │  ──────────────      │  ─────────────            │   │
│  │   • CircuitBreaker    │  • QueueRateLimiter │  • ProbeBuffering        │   │
│  │   • CircuitState      │  • RateLimiterFact. │                           │   │
│  │   • CircuitEvent      │  • RedisClient      │                           │   │
│  │   • CircuitFactory    │                     │                           │   │
│  │                                                                            │   │
│  │   cache/              │  tracing/          │  llm/                     │   │
│  │   ─────               │  ───────           │  ─────                     │   │
│  │   • RedisCache        │  • TraceService     │  • ChatModelClient       │   │
│  │                       │  • TraceContext     │  • MiniMaxClient        │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        common/ (通用能力层)                              │   │
│  │   errors/              │  response.js     │  idGenerator.js            │   │
│  │   ─────────            │  ───────────      │  ───────────────            │   │
│  │   • AppError          │  • 统一响应格式   │  • Snowflake ID           │   │
│  │   • ErrorCodes        │                   │                            │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、分层架构详解

### 2.1 各层职责

| 层级 | 目录 | 职责 | 约束 |
|------|------|------|------|
| **routes** | `routes/` | 参数校验、响应组装、路由定义 | 每文件 < 100 行，业务逻辑 0 行 |
| **application** | `application/` | 业务流程编排、跨领域协作 | 依赖 domain 服务 |
| **domain** | `domain/` | 核心业务规则、领域模型 | 无第三方依赖 |
| **infra** | `infra/` | 技术实现、第三方适配 | 无业务逻辑 |
| **common** | `common/` | 通用工具、错误码、上下文 | 无任何依赖 |

### 2.2 目录结构

```
backend/src/
│
├── common/                           # 通用能力层
│   ├── errors/
│   │   ├── AppError.js              # 统一错误类 (7大类错误码)
│   │   └── index.js
│   ├── response.js                   # 统一响应格式
│   └── index.js
│
├── infra/                            # 基础设施层
│   ├── circuitBreaker/              # 三态熔断器
│   │   ├── CircuitBreaker.js       # 核心实现 (CLOSED/OPEN/HALF_OPEN)
│   │   ├── CircuitState.js         # 状态枚举
│   │   ├── CircuitEvent.js         # 事件枚举
│   │   ├── CircuitBreakerFactory.js # 工厂模式
│   │   └── index.js
│   │
│   ├── rateLimiter/                # 限流器
│   │   ├── QueueRateLimiter.js    # 队列式限流 (Redis ZSET)
│   │   ├── RateLimiterFactory.js   # 工厂模式
│   │   ├── client.js              # Redis 客户端
│   │   └── index.js
│   │
│   ├── sse/                        # SSE 封装
│   │   ├── ProbeBufferingCallback.js # 首包探测装饰器
│   │   └── index.js
│   │
│   ├── cache/                      # 缓存抽象
│   ├── tracing/                    # 追踪服务
│   └── llm/                        # LLM 适配器
│
├── domain/                           # 领域逻辑层
│   ├── search/                     # 检索领域
│   │   ├── SearchChannel.js       # 抽象基类 (策略模式)
│   │   ├── SearchCoordinator.js   # 检索协调器 (门面模式)
│   │   ├── ProcessorChain.js     # 后处理器链 (责任链模式)
│   │   ├── channels/              # 检索通道实现
│   │   │   ├── VectorSearchChannel.js    # 向量检索
│   │   │   └── KeywordSearchChannel.js    # BM25 关键词检索
│   │   └── postProcessors/       # 后处理器
│   │       ├── PostProcessor.js           # 抽象基类
│   │       ├── DeduplicationProcessor.js  # 去重 (Jaccard)
│   │       ├── RerankerProcessor.js      # LLM 重排
│   │       └── ThresholdFilterProcessor.js # 阈值过滤
│   │
│   ├── rag/                        # RAG 领域
│   │   └── ingestion/            # 文档入库
│   │       ├── IngestionPipeline.js # 流水线骨架 (模板方法)
│   │       ├── IngestionNode.js    # 节点基类
│   │       └── nodes/              # 节点实现
│   │           ├── ParseNode.js     # 解析节点
│   │           ├── ChunkNode.js     # 分块节点 (语义/递归/固定)
│   │           ├── EmbeddingNode.js  # 向量化节点
│   │           └── IndexNode.js     # 索引节点
│   │
│   └── model/                      # 模型领域
│       ├── ModelRouter.js          # 模型路由器
│       └── HealthChecker.js        # 健康检查器
│
├── application/                     # 应用编排层
│   ├── ChatOrchestrator.js        # 聊天编排器 (226行)
│   └── AgentOrchestrator.js       # Agent 编排器 (274行)
│
├── routes/                          # 接口层
│   ├── chat.js                    # 聊天路由 (~90行)
│   ├── agent.js                  # Agent 路由 (~57行)
│   ├── search.js                 # 检索路由
│   ├── rag.js                    # RAG 路由
│   ├── hitl.js                   # HITL 路由
│   ├── a2a.js                    # A2A 路由
│   └── index.js                  # 路由汇总
│
├── middleware/                      # 中间件
│   ├── errorHandler.js           # 全局错误处理
│   ├── rateLimiter.js            # 限流中间件
│   ├── security.js               # 安全中间件
│   └── trace.js                  # Trace ID 中间件
│
└── services/                       # 遗留服务 (待迁移)
    ├── agentEngine.js            # Agent 执行引擎
    ├── ragService.js             # RAG 服务
    ├── toolRegistry.js          # 工具注册表
    └── ...
```

---

## 三、核心模块详解

### 3.1 检索通道架构 (策略模式)

```
┌─────────────────────────────────────────────────────────────┐
│                    SearchCoordinator (门面)                   │
│                  并行/串行/加权检索 + 结果融合                  │
└────────────────────────────┬────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ VectorChannel   │ │ KeywordChannel  │ │ HybridChannel   │
│ (向量检索)       │ │ (BM25检索)      │ │ (混合检索)       │
│ weight: 0.7     │ │ weight: 0.3    │ │ 前两者组合       │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             ▼
              ┌────────────────────────────┐
              │     结果融合 (RRFS)         │
              │  score = w / (60 + rank)   │
              └────────────────────────────┘
                             │
                             ▼
              ┌────────────────────────────┐
              │    后处理器链 (责任链)        │
              │  1. Deduplication (去重)    │
              │  2. Reranker (LLM重排)      │
              │  3. ThresholdFilter (过滤)   │
              └────────────────────────────┘
```

**核心代码示例**:

```javascript
// SearchCoordinator.js - 并行检索 + RRFS 融合
class SearchCoordinator {
  async search(query, options = {}) {
    // 1. 并行执行所有通道
    const results = await Promise.all(
      this.channels.map(ch => ch.search(query, options))
    );

    // 2. RRFS 融合
    return this._fuseResults(results, 'RRFS');
  }

  _fuseResults(channelResults, fusionType = 'RRFS') {
    // RRFS 公式: score += weight / (60 + rank)
    for (const { results } of channelResults) {
      for (let rank = 0; rank < results.length; rank++) {
        results[rank].score += results[rank].weight / (60 + rank + 1);
      }
    }
  }
}
```

### 3.2 文档入库 Pipeline (模板方法模式)

```
┌─────────────────────────────────────────────────────────────────┐
│                    IngestionPipeline (模板方法)                    │
│                                                                 │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐      │
│  │  Parse  │ → │  Clean  │ → │  Chunk  │ → │  Embed  │ → ... │
│  │ (解析)   │   │ (清洗)   │   │ (分块)   │   │ (向量化) │      │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘      │
│                                                                 │
│  每节点独立执行、独立日志、支持条件跳过、支持并行组                  │
└─────────────────────────────────────────────────────────────────┘
```

**核心代码示例**:

```javascript
// IngestionPipeline.js - 模板方法
class IngestionPipeline {
  async run(initialContext) {
    const context = { ...initialContext, traceId: generateId() };

    for (const node of this.nodes) {
      if (node.shouldSkip(context)) continue;

      const result = await node.execute(context);  // 节点执行
      context.nodeResults[node.name] = result;
      Object.assign(context, result);  // 合并到上下文
    }

    return context;
  }
}

// ChunkNode.js - 子类实现
class ChunkNode extends IngestionNode {
  async execute(context) {
    const text = context.parsed?.text;
    const chunks = this.chunkStrategy === 'semantic'
      ? await this.semanticChunk(text)    // LLM 语义分块
      : this.recursiveChunk(text);       // 递归字符分块
    return { chunks };
  }
}
```

### 3.3 三态熔断器

```
     失败超阈值
         │
         ▼
    ┌─────────┐
───▶│ CLOSED  │◀────────────┐
    └────┬────┘             │
         │ 成功              │ 探测成功
         ▼                  │ (successThreshold次)
    ┌─────────┐             │
    │  OPEN   │─────────────┘
    └────┬────┘
         │ 超时(resetTimeout)
         ▼
    ┌─────────┐
───▶│HALF_OPEN│────────────┐
    └────┬────┘             │
         │ 探测失败         │ 探测成功
         ▼                  │
    ┌─────────┐             │
    │  OPEN   │─────────────┘
    └─────────┘
```

**核心代码示例**:

```javascript
// CircuitBreaker.js
class CircuitBreaker {
  async execute(fn, fallback) {
    // OPEN 状态：直接返回降级
    if (this.state === STATES.OPEN) {
      if (Date.now() < this.nextAttempt) {
        return fallback ? fallback() : null;
      }
      this._transitionTo(STATES.HALF_OPEN);
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      return fallback ? fallback() : null;
    }
  }
}
```

### 3.4 应用编排器

```javascript
// ChatOrchestrator.js - 单例模式
class ChatOrchestrator {
  static getInstance() {
    if (!_instance) _instance = new ChatOrchestrator();
    return _instance;
  }

  // 意图分类
  classifyIntent({ query, messages }) {
    return this.intentClassifier.classify({ query, messages });
  }

  // 查询改写
  async rewriteQuery({ query, messages, intent }) {
    return this.queryRewriter.rewrite({ query, messages, intent });
  }

  // 混合检索
  async search({ query, knowledgeBaseId, channels }) {
    return this.hybridSearch.search({ query, knowledgeBaseId, channels });
  }

  // 聊天执行
  async executeChat({ messages, model, stream }) {
    return this.modelRouter.execute({ messages, model, stream });
  }
}
```

```javascript
// AgentOrchestrator.js
class AgentOrchestrator {
  // 增强 Agent 会话管理
  getOrCreateSession(sessionId) {
    if (!sessions.has(sessionId)) {
      const engine = new EnhancedAgentEngine({ sessionId });
      engine.on('checkpoint_saved', (cp) => { ... });
      sessions.set(sessionId, { engine, ... });
    }
    return sessions.get(sessionId);
  }

  // MiniMax Agent 会话
  createMiniMaxSession({ apiKey, model, maxSteps }) {
    const agent = new MiniMaxAgentRunner({ apiKey, model, maxSteps });
    const sessionId = `agent_${Date.now()}`;
    miniMaxSessions.set(sessionId, { agent, ... });
    return { sessionId, tools: agent.getToolSchemas() };
  }
}
```

---

## 四、设计模式应用总结

| 模式 | 位置 | 解决的问题 |
|------|------|-----------|
| **策略模式** | `domain/search/SearchChannel` | 检索通道可插拔，新增通道 0 修改 |
| **策略模式** | `domain/search/postProcessors/*` | 后处理器可替换，运行时可配置 |
| **模板方法** | `domain/rag/ingestion/IngestionPipeline` | 流水线骨架固定，节点实现可变 |
| **门面模式** | `domain/search/SearchCoordinator` | 封装多通道复杂性，统一检索入口 |
| **责任链** | `domain/search/ProcessorChain` | 后处理步骤按序执行，可动态组合 |
| **装饰器** | `infra/sse/ProbeBufferingCallback` | 不修改原回调，增加首包探测 |
| **工厂模式** | `infra/circuitBreaker/CircuitBreakerFactory` | 熔断器生命周期管理 |
| **单例模式** | `application/ChatOrchestrator` | 全局唯一编排器实例 |

---

## 五、API 路由概览

### 5.1 路由文件行数统计

| 路由文件 | 行数 | 状态 |
|---------|------|------|
| `routes/chat.js` | ~90 | ✅ < 100 |
| `routes/agent.js` | ~57 | ✅ < 100 |
| `routes/router.js` | ~95 | ✅ < 100 (重构后) |
| `routes/search.js` | ~80 | ✅ < 100 |
| `routes/rag.js` | ~120 | ⏳ 待优化 |
| `routes/hitl.js` | ~90 | ✅ |
| `routes/a2a.js` | ~100 | ⏳ 待优化 |

### 5.2 核心 API

```
POST /api/chat/send           # 发送消息 (SSE 流式)
POST /api/chat/execute        # 执行聊天
GET  /api/conversations       # 获取会话列表
POST /api/conversations       # 创建会话
DELETE /api/conversations/:id  # 删除会话

POST /api/agent/execute       # Agent 执行
GET  /api/agent/sessions     # Agent 会话列表
POST /api/agent/sessions     # 创建 Agent 会话
GET  /api/agent/checkpoints   # 检查点列表

POST /api/search               # RAG 检索
POST /api/kb/:id/documents     # 上传文档
GET  /api/kb/:id/search       # 知识库检索

POST /api/hitl/request        # 创建确认请求
POST /api/hitl/respond        # 响应确认
GET  /api/hitl/subscribe/:id  # SSE 订阅

POST /api/a2a/agents/register # 注册 Agent
POST /api/a2a/tasks/send     # 发送任务
GET  /api/a2a/tasks/:id      # 获取任务状态
```

---

## 六、错误码体系

### 6.1 错误码分类

| 大类 | 范围 | 说明 | HTTP 状态码 |
|------|------|------|-------------|
| 1xxx | 认证授权 | Token/API Key 验证 | 401/403 |
| 2xxx | 参数校验 | 请求参数校验 | 400 |
| 3xxx | 业务逻辑 | 业务规则校验 | 400 |
| 4xxx | 外部依赖 | 第三方服务调用 | 502/503 |
| 5xxx | 系统异常 | 系统级别错误 | 500 |

### 6.2 AppError 使用

```javascript
const { AppError, ErrorCodes } = require('../common/errors');

// 抛出错误
throw new AppError('AGENT_NOT_FOUND', 'Agent 不存在', {
  httpStatus: 404,
  detail: `Agent ID: ${agentId} 不存在`,
  suggestion: '请检查 Agent ID 是否正确'
});
```

---

## 七、前端架构

### 7.1 Store 拆分

```
frontend/src/stores/
├── conversationStore.ts    # 对话 CRUD (< 200行)
├── messageStore.ts        # 消息操作 (< 200行)
├── uiStore.ts             # UI 状态 (< 150行)
└── index.ts               # 统一导出
```

**对比**:
- 之前: `useChatStore.ts` (621行) 承担所有职责
- 现在: 按领域拆分，每个 Store < 200行

### 7.2 ErrorBoundary

```typescript
// components/ErrorBoundary.tsx
class ErrorBoundary extends Component {
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    logger.error('React Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

### 7.3 API Client 拦截器

```typescript
// lib/apiClient.ts
class APIClient {
  interceptors = {
    request: [],   // 请求拦截
    response: [],  // 响应拦截
    error: []      // 错误拦截
  };

  async request<T>(config): Promise<T> {
    for (const interceptor of this.interceptors.request) {
      config = await interceptor(config);
    }
    // ... 执行请求
  }
}
```

---

## 八、测试覆盖

### 8.1 单元测试

| 测试文件 | 覆盖模块 |
|---------|---------|
| `CircuitBreaker.test.js` | 三态熔断器 |
| `SearchChannel.test.js` | 检索通道 |
| `ingestionPipeline.test.js` | 文档 Pipeline |
| `modelRouter.test.js` | 模型路由 |
| `rateLimiter.test.js` | 限流器 |
| `errors.test.js` | 错误处理 |
| `TraceService.test.js` | 追踪服务 |

### 8.2 集成测试

| 测试文件 | 覆盖接口 |
|---------|---------|
| `chatApi.test.js` | 15 个测试 |
| `agentApi.test.js` | 21 个测试 |
| `searchApi.test.js` | 20 个测试 |

---

## 九、面试亮点

### 9.1 分层架构

> "我设计并实现了四层分层架构 (routes/application/domain/infra)，将业务逻辑从 819 行的 router.js 抽取到 application 层，routes 文件每文件控制在 100 行以内。"

### 9.2 检索系统

> "我设计并实现了多路检索架构，使用策略模式定义 SearchChannel 接口，向量检索和 BM25 关键词检索并行执行，结果通过 RRFS 融合算法合并，最后经过去重、重排序、阈值过滤后返回。"

### 9.3 熔断降级

> "我实现了三态熔断器 (CLOSED/OPEN/HALF_OPEN)，配合首包探测装饰器，确保模型切换时用户无感知。当模型失败达到阈值时自动熔断，冷却后进入半开探测，成功则恢复。"

### 9.4 文档 Pipeline

> "我设计了基于模板方法模式的文档入库流水线，每步作为独立节点执行，包含解析、清洗、分块、向量化、索引。节点独立日志，出问题能精确定位到哪一步。"

---

**文档更新日期**: 2026-03-22
**下次审查**: 2026-03-29
**负责人**: AI Team
