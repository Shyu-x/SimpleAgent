# AI Agent 架构模式研究 (2025)

**项目**: AI Chat 玩具
**研究日期**: 2026-04-26
**研究目标**: AI Agent 平台的标准化架构模式

---

## 一、AI Agent 核心架构模式

### 1.1 标准组件边界

AI Agent 系统由以下核心组件构成，每个组件有明确的职责边界：

```
┌─────────────────────────────────────────────────────────────┐
│                      AGENT SYSTEM                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              AGENT CORE (AgentEngine)                │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │Memory   │  │Planning │  │Reasoning│  │Action   │  │   │
│  │  │Manager  │  │ Layer   │  │(ReAct)  │  │Generator│  │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  │   │
│  │       └────────────┼────────────┼────────────┘       │   │
│  └────────────────────┼────────────┼─────────────────────┘   │
│                       ↓            ↓                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              TOOL SYSTEM                            │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │Tool      │  │Tool     │  │Tool     │          │   │
│  │  │Registry  │  │Executor  │  │Result   │          │   │
│  │  │          │  │          │  │Merger   │          │   │
│  │  └──────────┘  └──────────┘  └──────────┘          │   │
│  └─────────────────────────────────────────────────────┘   │
│                       ↓                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              RAG SYSTEM                              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │Query     │  │Retrieval │  │Reranker  │          │   │
│  │  │Rewrite   │  │Channel   │  │          │          │   │
│  │  └──────────┘  └──────────┘  └──────────┘          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 组件职责定义

| 组件 | 职责 | 不该做的事 |
|------|------|-----------|
| **AgentEngine** | ReAct 执行循环、取消机制、Token 管理 | 不直接调用外部 API |
| **MemoryManager** | 短期记忆滑动窗口、长期记忆摘要、会话持久化 | 不处理业务逻辑 |
| **PlanningLayer** | 任务分解、子任务规划、依赖图管理 | 不执行工具 |
| **ToolRegistry** | 工具注册、发现、版本管理 | 不执行工具逻辑 |
| **ToolExecutor** | 工具参数提取、超时控制、错误处理 | 不管理工具注册 |
| **RAGPipeline** | 查询改写、检索、组装、引用 | 不处理 Agent 逻辑 |

---

## 二、Agent Loop (观察 → 思考 → 行动) 生产实现

### 2.1 标准 ReAct 循环模式

生产级 Agent Loop 实现需要以下状态机：

```
          ┌─────────────────┐
          │     IDLE        │
          └────────┬────────┘
                   │ processMessage()
                   ↓
          ┌─────────────────┐
     ┌───│   OBSERVING     │ ← 用户输入 / 工具结果
     │   └────────┬────────┘
     │          │ classifyIntent()
     │          ↓
     │   ┌─────────────────┐
     │   │   PLANNING      │ ← 任务分解、路由决策
     │   └────────┬────────┘
     │          │ executePlan()
     │          ↓
     │   ┌─────────────────┐
     │   │    ACTING       │ ← 工具调用 / LLM 生成
     │   └────────┬────────┘
     │          │ needMoreInfo?
     │          ↓
     └───YES    ┌─────────────────┐
               │   REASONING     │ ← 反思、调整策略
               └────────┬────────┘
                       │ NO
                       ↓
               ┌─────────────────┐
               │   COMPLETING    │ ← 组装响应、记录记忆
               └────────┬────────┘
                       │
                       ↓
               ┌─────────────────┐
               │     IDLE       │
               └─────────────────┘
```

### 2.2 关键实现要点

#### 取消机制 (asyncio.Event 风格)

```javascript
// AgentEngine 中的取消模式
class AgentEngine {
  constructor() {
    this._cancelEvent = null;
    this._cancelled = false;
  }

  // 创建取消事件 (在循环开始时调用)
  createCancelEvent() {
    this._cancelEvent = { triggered: false };
    this._cancelled = false;
  }

  // 触发取消 (外部中断)
  cancel() {
    if (this._cancelEvent) {
      this._cancelEvent.triggered = true;
    }
    this._cancelled = true;
  }

  // 检查取消状态 (在每个步骤后调用)
  _checkCancelled() {
    return this._cancelled || (this._cancelEvent?.triggered === true);
  }

  // 执行循环中的步骤
  async _executeStep(step) {
    // 步骤开始前检查
    if (this._checkCancelled()) {
      throw new AgentCancelledError('Agent execution was cancelled');
    }

    const result = await step.execute();

    // 步骤完成后再次检查
    if (this._checkCancelled()) {
      throw new AgentCancelledError('Agent execution was cancelled');
    }

    return result;
  }
}
```

#### Token 管理与摘要

```javascript
// Token 控制模式
class AgentEngine {
  _estimateTokens(messages) {
    // 简单估算: 平均每个 token 4 字符
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  _shouldSummarize() {
    // 超过 80% Token 限制时触发摘要
    return this._estimatedTokens > (this._maxTokens * 0.8);
  }

  async _summarizeMessages() {
    const summary = await this._llm.summarize(this._messages);
    this._messages = [{ role: 'system', content: summary }];
  }
}
```

---

## 三、工具执行框架最佳实践

### 3.1 工具注册与发现

```javascript
// 标准工具注册表模式
class ToolRegistry {
  constructor() {
    this._tools = new Map();
    this._categories = new Map();
  }

  register(tool) {
    // tool = { name, description, parameters, execute, category }
    this._tools.set(tool.name, tool);

    // 按类别索引
    if (!this._categories.has(tool.category)) {
      this._categories.set(tool.category, []);
    }
    this._categories.get(tool.category).push(tool.name);
  }

  discover(intent) {
    // 基于意图发现工具
    return this._tools.values().filter(tool =>
      tool.description.toLowerCase().includes(intent.toLowerCase())
    );
  }

  get(name) {
    return this._tools.get(name);
  }
}
```

### 3.2 工具执行模式

```javascript
// 带超时和验证的工具执行
class ToolExecutor {
  async execute(toolName, args, options = {}) {
    const tool = this._registry.get(toolName);
    if (!tool) {
      throw new ToolNotFoundError(toolName);
    }

    // 参数验证
    const validatedArgs = this._validateParameters(tool.parameters, args);

    // 超时控制
    return this._executeWithTimeout(async () => {
      return tool.execute(validatedArgs);
    }, options.timeout || 30000);
  }

  async _executeWithTimeout(fn, timeoutMs) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new ToolTimeoutError()), timeoutMs)
      )
    ]);
  }

  _validateParameters(schema, args) {
    // JSON Schema 验证
    for (const [key, spec] of Object.entries(schema)) {
      if (spec.required && !(key in args)) {
        throw new MissingParameterError(key);
      }
      if (typeof args[key] !== spec.type) {
        throw new InvalidParameterTypeError(key, spec.type, typeof args[key]);
      }
    }
    return args;
  }
}
```

### 3.3 工具结果合并

多工具并行执行时，结果合并模式：

```javascript
// ToolResultMerger - 处理多工具结果
class ToolResultMerger {
  mergeResults(results) {
    // 按依赖关系排序结果
    const sorted = this._topologicalSort(results);

    // 按序组装
    let context = {};
    for (const result of sorted) {
      context = this._mergeIntoContext(context, result);
    }

    return context;
  }

  _mergeIntoContext(ctx, result) {
    // 冲突解决策略：后者覆盖 或 智能合并
    return { ...ctx, ...result.data };
  }
}
```

---

## 四、RAG 集成到 Agent Loop

### 4.1 RAG 在 Agent 中的定位

RAG 不是独立系统，而是 Agent 的"知识检索能力"：

```
Agent Loop 中的 RAG 集成点:

User Input
    ↓
[OBSERVING] ── Intent Detection
    ↓
[PLANNING] ──── 是否需要外部知识?
    ↓              ↓
    │    YES ──→ [RAG Retrieval] ─→ 将检索结果注入 context
    │              ↓
    NO ───────────┘
    ↓
[ACTING] ─── Tool Execution / LLM Generation
    ↓
[REASONING] ─ 反思结果，必要时再次检索
```

### 4.2 RAG 作为 Tool

最简洁的集成方式：把 RAG 当作一个特殊 Tool：

```javascript
// RAGTool - 将 RAG 作为工具集成
class RAGTool {
  constructor(ragService) {
    this.name = 'retrieve_knowledge';
    this.description = '检索知识库回答问题';
    this.parameters = {
      query: { type: 'string', required: true },
      topK: { type: 'number', required: false, default: 5 }
    };
    this._ragService = ragService;
  }

  async execute(args) {
    // 执行检索
    const results = await this._ragService.search({
      query: args.query,
      topK: args.topK || 5
    });

    // 组装为引用格式
    return {
      answer: results.answer,
      citations: results.citations,
      sources: results.documents.map(d => d.metadata)
    };
  }
}
```

### 4.3 检索增强时机

| 时机 | 模式 | 适用场景 |
|------|------|----------|
| **Planning 时检索** | 检测到知识问答意图立即检索 | 简单事实性问题 |
| **Reasoning 时检索** | 首次结果不足，再次检索 | 复杂多跳问题 |
| **Acting 时检索** | 工具执行需要背景知识 | 需要实时数据的任务 |

---

## 五、扩展性模式 (0-1k / 1k-100k / 100k+ 用户)

### 5.1 分阶段架构演进

```
阶段 1: 0-1k 用户 (单体架构)
═══════════════════════════════════════

┌─────────────────────────────────┐
│          Express Server         │
│  ┌─────────────────────────────┐│
│  │  Routes → Services → Domain ││
│  │                             ││
│  │  AgentEngine + RAG + Tools  ││
│  └─────────────────────────────┘│
└─────────────────────────────────┘
         │
    MiniMax API
         │
    Qdrant (单节点)

特点:
- 无需缓存
- SSE 连接数 < 1000
- 单进程足够

阶段 2: 1k-100k 用户 (缓存 + 连接池)
═══════════════════════════════════════

┌─────────────────────────────────┐
│         Express Server          │
│  ┌─────────────────────────────┐│
│  │  Routes → Services → Domain ││
│  └─────────────────────────────┘│
└───────────────┬─────────────────┘
                │
    ┌───────────┴───────────┐
    ↓                       ↓
┌─────────┐           ┌─────────┐
│  Redis  │           │ Connection│
│  Cache  │           │   Pool   │
└─────────┘           └─────────┘
    │                       │
    └───────────┬───────────┘
                ↓
        MiniMax API + Qdrant Cluster

特点:
- Redis 缓存会话 / 检索结果
- 连接池复用 (HTTP Agent)
- SSE 连接数 1k-10k

阶段 3: 100k+ 用户 (微服务拆分)
═══════════════════════════════════════

┌──────────────────────────────────────────────────┐
│                   API Gateway                     │
│              (Kong / NGINX + Lua)                 │
└──────────────────┬─────────────────┬──────────────┘
                   │                 │
       ┌───────────┴───┐   ┌────────┴────────┐
       ↓               ↓   ↓                 ↓
┌────────────┐  ┌────────────┐  ┌────────────────┐
│ Chat Service│  │Agent Service│  │  Admin Service  │
│  (SSE专用)  │  │ (任务执行)  │  │  (CRUD APIs)   │
└────────────┘  └────────────┘  └────────────────┘
       │               │                 │
       └───────────────┼─────────────────┘
                       ↓
              ┌─────────────────┐
              │  Message Queue   │
              │  (Redis Streams)│
              └────────┬────────┘
                       │
       ┌───────────────┼───────────────┐
       ↓               ↓               ↓
  ┌──────────┐   ┌──────────┐   ┌──────────┐
  │MiniMax   │   │ Qdrant   │   │ Memory   │
  │API Pool  │   │ Cluster  │   │ Service  │
  └──────────┘   └──────────┘   └──────────┘
```

### 5.2 扩展性关键指标

| 阶段 | 用户规模 | 同时 SSE 连接 | RAG QPS | Agent 并发 |
|------|----------|--------------|---------|------------|
| 阶段 1 | 0-1k | < 100 | < 10 | < 20 |
| 阶段 2 | 1k-100k | 100-10k | 10-100 | 20-200 |
| 阶段 3 | 100k+ | 10k-100k | 100-1000 | 200-2000 |

### 5.3 关键瓶颈与解决方案

| 瓶颈 | 阶段 1 → 2 | 阶段 2 → 3 |
|------|------------|------------|
| **SSE 连接数** | 增加 worker 进程 | 专用 Chat Service + 连接池 |
| **MiniMax API 限流** | 请求队列 + 重试 | 多 API Key 轮询 + 模型池 |
| **Qdrant 查询** | 增加 replica | Qdrant 集群 + 分片 |
| **会话记忆** | 内存 → Redis | 专用 Memory Service |
| **工具执行** | 同步执行 | 异步队列 + Worker Pool |

---

## 六、数据流图

### 6.1 完整 Agent 处理流程

```
                                    ┌──────────────────────┐
                                    │    External APIs     │
                                    │  ┌──────────────┐    │
                                    │  │  MiniMax API │    │
                                    │  └──────────────┘    │
                                    │  ┌──────────────┐    │
                                    │  │  Qdrant      │    │
                                    │  └──────────────┘    │
                                    └──────────┬───────────┘
                                               │
    User ────│                                │
             │                                ▼
             ▼                    ┌───────────────────────┐
┌────────────────────────┐        │     BACKEND           │
│       FRONTEND          │        │  ┌─────────────────┐  │
│  ┌──────────────────┐  │        │  │   Routes Layer   │  │
│  │    ChatInput     │──┼────────┼──│   (validation)   │  │
│  └──────────────────┘  │        │  └────────┬────────┘  │
│  ┌──────────────────┐  │        │           │           │
│  │   ChatArea       │  │        │           ▼           │
│  │   (SSE render)   │  │◀────────│  ┌─────────────────┐  │
│  └──────────────────┘  │        │  │  Orchestrator    │  │
│                        │        │  │ ChatOrchestrator │  │
└────────────────────────┘        │  └────────┬────────┘  │
                                   │           │           │
                                   │     ┌─────┴─────┐     │
                                   │     ▼           ▼     │
                                   │  ┌────────┐ ┌────────┐│
                                   │  │ Domain │ │Services││
                                   │  │ Intent │ │  RAG   ││
                                   │  │Router │ │Search ││
                                   │  └────────┘ └────────┘│
                                   │     │           │     │
                                   │     │    ┌──────┘     │
                                   │     ▼    ▼            │
                                   │  ┌─────────────────┐   │
                                   │  │   ToolExecutor  │   │
                                   │  └────────┬────────┘   │
                                   │           │            │
                                   └───────────┼────────────┘
                                               │
                                    ┌──────────┴───────────┐
                                    │   SSE Stream Output   │
                                    └──────────────────────┘
```

---

## 七、推荐构建顺序

### Phase 1: 核心循环 (第 1-2 周)

```
Day 1-3: AgentEngine 核心
├── ReAct 状态机 (IDLE → OBSERVING → PLANNING → ACTING → REASONING → COMPLETING)
├── 取消机制 (createCancelEvent / cancel / _checkCancelled)
└── Token 估算 (_estimateTokens / _shouldSummarize / _summarizeMessages)

Day 4-7: 工具系统
├── ToolRegistry (注册 / 发现 / 分类)
├── ToolExecutor (参数验证 / 超时控制)
└── 基础工具 (web_search, calculator, memory)

Day 8-14: Memory 系统
├── MemoryWindowManager (滑动窗口)
├── SessionNoteTool (持久化记忆)
└── ContextAssembler (上下文组装)
```

### Phase 2: RAG 集成 (第 3-4 周)

```
Day 15-18: RAG Pipeline
├── QueryRewriteService (问题补全)
├── QueryDecomposeService (复杂问题拆分)
└── Reranker (多策略重排序)

Day 19-21: 检索通道
├── VectorSearchChannel (Qdrant)
├── KeywordSearchChannel
└── HybridSearchCoordinator

Day 22-28: RAG 与 Agent 集成
├── RAG 作为 Tool
├── 检索时机决策 (Planning / Reasoning / Acting)
└── CitationAssembler (引用生成)
```

### Phase 3: 生产级特性 (第 5-6 周)

```
Day 29-35: 弹性和可观测性
├── CircuitBreaker (熔断器)
├── QueueRateLimiter (限流)
├── MetricsCollector (Prometheus)
└── AlertManager (critical / warning / info)

Day 36-42: 扩展能力
├── SSE 连接管理 (心跳 / 超时)
├── Redis 会话缓存
└── 请求队列 + Worker Pool
```

---

## 八、架构检查清单

### 组件边界检查

- [ ] AgentEngine 只负责循环控制，不直接调用外部 API
- [ ] ToolExecutor 不管理工具注册，ToolRegistry 不执行工具逻辑
- [ ] RAG 检索结果通过 ContextAssembler 组装，不直接注入 Prompt
- [ ] 所有外部调用 (MiniMax/Qdrant) 通过 Router/Client 抽象

### 数据流检查

- [ ] 用户输入 → Intent Detection → 路由决策
- [ ] 知识问答 → RAG Pipeline → 检索结果注入
- [ ] 工具调用 → ToolExecutor → 结果合并 → 响应组装
- [ ] 所有步骤后可检查取消状态

### 生产级检查

- [ ] 取消机制可在任意步骤中断循环
- [ ] Token 超过 80% 限制自动触发摘要
- [ ] 工具执行有超时保护 (默认 30s)
- [ ] 外部 API 调用有熔断保护
- [ ] SSE 有心跳检测 (避免僵尸连接)

---

## 参考资料

- 项目当前架构: `.planning/codebase/ARCHITECTURE.md`
- 项目定义: `.planning/PROJECT.md`
- CLAUDE.md (项目指令)
- LangGraph 状态机设计
- MiniMax Mini-Agent 取消机制实现

---

*研究完成日期: 2026-04-26*