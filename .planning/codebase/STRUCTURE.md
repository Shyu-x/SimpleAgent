# Project Structure

**Project:** AI Chat 玩具
**Type:** Full-stack AI Chat Platform
**Last Updated:** 2026-04-26

## Directory Layout

```
chat玩具/
├── .planning/codebase/     # 架构文档
│   ├── ARCHITECTURE.md      # 架构模式、数据流
│   └── STRUCTURE.md        # 本文件 - 目录结构详解
│
├── backend/                 # Express.js 后端 (端口 30000)
│   ├── src/
│   │   ├── application/    # 应用编排层 (2文件)
│   │   │   ├── ChatOrchestrator.js   # 聊天业务流程编排
│   │   │   └── AgentOrchestrator.js  # Agent任务编排
│   │   │
│   │   ├── domain/         # 核心业务逻辑 (DDD)
│   │   │   ├── model/      # 模型抽象
│   │   │   │   ├── ModelRouter.js    # 模型路由 + 熔断
│   │   │   │   ├── HealthChecker.js   # 健康检查
│   │   │   │   └── index.js
│   │   │   ├── rag/        # RAG领域
│   │   │   │   ├── QueryRewriteService.js   # 问题重写 (513行)
│   │   │   │   ├── QueryDecomposeService.js # 问题拆分 (662行)
│   │   │   │   ├── IntentClassifier.js      # 意图分类 (749行)
│   │   │   │   ├── Reranker.js              # 重排序 (828行)
│   │   │   │   ├── CitationAssembler.js      # 引用组装 (898行)
│   │   │   │   ├── IntentGuidanceService.js # 意图澄清
│   │   │   │   └── ingestion/  # 文档摄取Pipeline
│   │   │   │       ├── IngestionPipeline.js
│   │   │   │       └── nodes/
│   │   │   ├── agent/      # Agent领域
│   │   │   │   ├── IntentRouter.js     # 意图路由 (271行)
│   │   │   │   ├── ToolExecutor.js      # 工具执行器 (479行)
│   │   │   │   ├── MCPToolExecutor.js   # MCP执行器 (503行)
│   │   │   │   ├── ToolResultMerger.js  # 结果合并 (654行)
│   │   │   │   └── ContextAssembler.js # 上下文组装 (552行)
│   │   │   └── search/      # 检索领域
│   │   │       ├── SearchChannel.js
│   │   │       ├── SearchCoordinator.js
│   │   │       └── channels/
│   │   │           ├── KeywordSearchChannel.js
│   │   │           └── VectorSearchChannel.js
│   │   │
│   │   ├── infra/          # 基础设施层
│   │   │   ├── metrics/    # Prometheus指标
│   │   │   ├── alert/      # 告警管理
│   │   │   ├── config/     # 配置中心 (热更新)
│   │   │   ├── queue/      # 优先级队列
│   │   │   ├── circuitBreaker/  # 熔断器
│   │   │   │   ├── CircuitBreaker.js
│   │   │   │   ├── CircuitState.js
│   │   │   │   ├── CircuitEvent.js
│   │   │   │   └── CircuitBreakerFactory.js
│   │   │   ├── rateLimiter/   # 限流器
│   │   │   │   ├── QueueRateLimiter.js
│   │   │   │   └── RateLimiterFactory.js
│   │   │   └── sse/         # SSE基础设施
│   │   │       ├── ProbeBufferingCallback.js  # 探针缓冲
│   │   │       └── sseService.js             # 实际调用MiniMax
│   │   │
│   │   ├── common/         # 通用基础
│   │   │   └── errors/     # 统一错误体系
│   │   │       ├── AppError.js     # 错误基类
│   │   │       ├── errors.js       # 错误码常量
│   │   │       └── index.js
│   │   │
│   │   ├── routes/         # 接口层 (30+ 路由)
│   │   │   ├── chat.js     # 聊天接口 /api/chat
│   │   │   ├── agent.js    # Agent接口 /api/agent
│   │   │   ├── a2a.js      # A2A协议 /api/a2a
│   │   │   ├── hitl.js     # HITL确认 /api/hitl
│   │   │   ├── admin/      # 管理后台API
│   │   │   │   ├── knowledge.js  # 知识库管理
│   │   │   │   ├── tool.js       # 工具管理
│   │   │   │   ├── model.js      # 模型管理
│   │   │   │   ├── prompt.js     # Prompt模板
│   │   │   │   └── trace.js      # 链路追踪
│   │   │   ├── qdrant.js   # Qdrant向量数据库
│   │   │   ├── memory.js   # 记忆API
│   │   │   ├── missionControl.js  # 任务控制
│   │   │   └── ...
│   │   │
│   │   ├── services/      # 业务逻辑层
│   │   │   ├── agentEngine.js   # ReAct执行循环 (核心)
│   │   │   ├── a2aService.js    # A2A服务
│   │   │   ├── ragService.js    # RAG服务
│   │   │   ├── memory.js        # 记忆服务
│   │   │   ├── SemanticMemory.js  # 语义记忆
│   │   │   ├── AgentLogger.js   # 结构化日志
│   │   │   ├── FileCheckpointManager.js  # 检查点持久化
│   │   │   ├── agent/           # Agent服务
│   │   │   │   ├── MemoryWindowManager.js
│   │   │   │   └── ToolExecutor.js
│   │   │   ├── model/           # 模型客户端
│   │   │   │   ├── ChatModelClient.js   # 统一接口
│   │   │   │   ├── clients/
│   │   │   │   │   └── MiniMaxChatClient.js
│   │   │   │   └── ModelClientFactory.js
│   │   │   ├── router/          # 路由服务
│   │   │   │   └── modelRouter.js   # MiniMax模型路由
│   │   │   ├── vector/          # 向量存储
│   │   │   │   ├── QdrantVectorStore.js
│   │   │   │   └── QdrantRouter.js
│   │   │   ├── tools/           # 工具实现 (30+)
│   │   │   │   ├── toolRegistry.js
│   │   │   │   ├── webSearchTool.js
│   │   │   │   ├── weatherTool.js
│   │   │   │   ├── calculatorTool.js
│   │   │   │   ├── imageGenerationTool.js
│   │   │   │   └── SessionNoteTool.js
│   │   │   └── search/          # 检索服务
│   │   │
│   │   ├── middleware/    # Express中间件
│   │   │   ├── security.js  # 安全头、CORS
│   │   │   └── rateLimiter.js  # IP限流
│   │   │
│   │   ├── utils/         # 工具函数
│   │   │   └── retry.js    # 指数退避重试
│   │   │
│   │   ├── scripts/       # 脚本
│   │   │   └── ContinuousLearning.js  # 每10分钟更新技术趋势
│   │   │
│   │   └── index.js       # 入口文件
│   │
│   ├── data/              # 数据目录
│   │   └── agent-states/  # Agent状态持久化
│   │
│   ├── tests/            # 测试
│   │   ├── unit/          # 单元测试
│   │   └── e2e/           # E2E测试
│   │
│   ├── docs/             # 后端文档
│   │   ├── A1-5分钟跑通.md
│   │   ├── B1-分层架构设计.md
│   │   └── ...
│   │
│   └── package.json
│
├── frontend/              # Next.js 前端 (端口 8080)
│   ├── src/
│   │   ├── app/          # Next.js App Router
│   │   │   ├── page.tsx      # 主页面
│   │   │   ├── layout.tsx    # 根布局
│   │   │   ├── globals.css   # 全局样式
│   │   │   └── admin/       # 管理后台页面
│   │   │       ├── kb/
│   │   │       ├── models/
│   │   │       ├── prompts/
│   │   │       ├── tools/
│   │   │       └── traces/
│   │   │
│   │   ├── components/    # React 组件
│   │   │   ├── ChatArea.tsx        # 聊天区域
│   │   │   ├── ChatInput.tsx       # 输入框 + 意图检测
│   │   │   ├── ConversationList.tsx  # 对话列表
│   │   │   ├── MultiWindowChat.tsx   # 多窗口聊天
│   │   │   ├── MarkdownRenderer.tsx  # Markdown渲染
│   │   │   ├── ThinkingChain.tsx     # 思维链展示
│   │   │   ├── IntentSuggestionBanner.tsx  # 意图检测Banner
│   │   │   ├── WelcomeGuide.tsx     # 欢迎指南
│   │   │   ├── ErrorBoundary.tsx    # 错误边界
│   │   │   ├── MemoryPanel.tsx      # 记忆面板
│   │   │   ├── KnowledgeBaseManager.tsx  # 知识库管理
│   │   │   ├── Settings.tsx        # 设置面板
│   │   │   ├── NotePanel.tsx        # 笔记面板
│   │   │   │
│   │   │   ├── agent/     # Agent组件
│   │   │   │   ├── AgentWorkspace.tsx
│   │   │   │   ├── AgentConfigPanel.tsx
│   │   │   │   ├── AgentDebugger.tsx
│   │   │   │   ├── AgentStatusIndicator.tsx
│   │   │   │   ├── ToolCallDisplay.tsx
│   │   │   │   ├── HumanConfirmationDialog.tsx  # HITL确认
│   │   │   │   ├── AgentExecutionPanel.tsx
│   │   │   │   ├── AgentCollaborationPanel.tsx
│   │   │   │   ├── ExecutionHistory.tsx
│   │   │   │   ├── ErrorRecoveryUI.tsx
│   │   │   │   ├── ConfigVersionManager.tsx
│   │   │   │   ├── MissionControl/   # 任务控制中心
│   │   │   │   │   ├── index.tsx
│   │   │   │   │   ├── TaskQueue.tsx
│   │   │   │   │   └── TaskBroadcast.tsx
│   │   │   │   └── workflow/  # 工作流编辑器
│   │   │   │       ├── DndWorkflowCanvas.tsx
│   │   │   │       └── WorkflowTemplateEditor.tsx
│   │   │   │
│   │   │   ├── admin/     # 管理后台组件
│   │   │   │   ├── AdminDashboard.tsx      # 总览仪表盘
│   │   │   │   ├── IntentTreeEditor/       # 意图树编辑
│   │   │   │   ├── KnowledgeBase/          # 知识库管理 (817行)
│   │   │   │   ├── ToolRegistry/           # 工具注册 (971行)
│   │   │   │   ├── ModelConfig/            # 模型配置 (574行)
│   │   │   │   ├── PromptTemplate/         # Prompt模板 (753行)
│   │   │   │   └── TraceViewer/            # 链路追踪 (834行)
│   │   │   │
│   │   │   ├── mobile/   # 移动端适配
│   │   │   │   ├── MobileLayout.tsx
│   │   │   │   ├── MobileChatArea.tsx
│   │   │   │   ├── BottomSheet.tsx
│   │   │   │   └── GestureRecognition.tsx
│   │   │   │
│   │   │   └── animations/  # 动画组件
│   │   │
│   │   ├── stores/       # Zustand 状态管理
│   │   │   ├── chatStore.ts         # 聊天状态
│   │   │   ├── conversationStore.ts # 对话状态
│   │   │   ├── messageStore.ts      # 消息状态
│   │   │   ├── uiStore.ts           # UI状态
│   │   │   └── agentWorkflowStore.ts  # Agent工作流状态
│   │   │
│   │   ├── hooks/        # 自定义Hooks
│   │   │   ├── useAgentSSE.ts       # Agent SSE流式
│   │   │   ├── useRealAgentSSE.ts   # 真实Agent SSE
│   │   │   ├── useHITL.ts           # 人工确认
│   │   │   ├── useIntentDetection.ts # 意图检测
│   │   │   ├── useSearch.tsx        # 搜索
│   │   │   ├── useSearchEnhanced.ts # 增强搜索
│   │   │   ├── useMultiAgent.ts     # 多Agent
│   │   │   ├── useEnhancedAgent.ts  # 增强Agent
│   │   │   ├── useEnhancedMemory.ts  # 增强记忆
│   │   │   ├── useMemorySystem.ts   # 记忆系统
│   │   │   ├── useWorkflowExecution.ts  # 工作流执行
│   │   │   └── useBrowser.tsx       # 浏览器自动化
│   │   │
│   │   ├── lib/          # 工具库
│   │   │   ├── apiClient.ts    # API客户端 (拦截器、重试)
│   │   │   ├── apiConfig.ts   # API端点配置
│   │   │   ├── modelConfig.ts  # 模型配置
│   │   │   ├── api.ts         # API函数
│   │   │   ├── sse.ts         # SSE工具
│   │   │   ├── export.ts      # 导出工具
│   │   │   └── hooks.ts       # 通用Hooks
│   │   │
│   │   ├── types/        # TypeScript类型
│   │   │   ├── index.ts       # 通用类型
│   │   │   ├── prompts.ts     # Prompt类型
│   │   │   ├── thinking.ts    # 思维链类型
│   │   │   ├── api.d.ts       # API类型
│   │   │   └── api-error.d.ts # 错误类型
│   │   │
│   │   ├── contexts/     # React Context
│   │   │   └── RouterContext.tsx
│   │   │
│   │   └── __tests__/   # 测试
│   │
│   ├── docs/            # 前端文档
│   │   ├── A1-5分钟跑通.md
│   │   ├── A2-边做边学.md
│   │   └── B1-React设计思想.md
│   │
│   └── package.json
│
├── docs/                 # 项目文档
│   ├── learning/        # 学习文档
│   │   ├── Agent知识体系.md
│   │   ├── RAG核心面试题详解.md
│   │   ├── Agent深度面试模拟.md
│   │   └── ...
│   ├── CLAUDE.md       # 项目指令 (本文件)
│   └── CHANGELOG.md    # 版本日志
│
├── .mcp.json            # MiniMax MCP配置
├── package.json         # 根目录workspace
└── README.md
```

## Key Files Explained

### Backend Core (backend/src/)

| File | Purpose | Lines |
|------|---------|-------|
| `agentEngine.js` | ReAct执行循环、取消机制、Token摘要 | ~800 |
| `ChatOrchestrator.js` | 聊天业务流程编排、意图分流 | ~200 |
| `ChatModelClient.js` | 统一模型客户端接口 | ~150 |
| `MiniMaxChatClient.js` | MiniMax API实现 | ~200 |
| `modelRouter.js` | MiniMax模型路由、故障转移 | ~300 |
| `toolRegistry.js` | 工具注册与发现 | ~400 |

### Backend Domain (backend/src/domain/)

| File | Purpose | Lines |
|------|---------|-------|
| `IntentClassifier.js` | 三级树形意图分类 (领域→类目→话题) | 749 |
| `QueryRewriteService.js` | 问题补全、省略恢复 | 513 |
| `QueryDecomposeService.js` | 复杂问题拆分为子问题 | 662 |
| `Reranker.js` | 多策略重排序 (CrossEncoder/BM25/Semantic) | 828 |
| `CitationAssembler.js` | 引用追溯与组装 | 898 |
| `ToolExecutor.js` | 工具执行器抽象 | 479 |
| `MCPToolExecutor.js` | MCP协议执行器 | 503 |

### Backend Infrastructure (backend/src/infra/)

| File | Purpose | Lines |
|------|---------|-------|
| `CircuitBreaker.js` | 三态熔断器 (CLOSED/OPEN/HALF_OPEN) | ~200 |
| `MetricsCollector.js` | Prometheus指标采集 | 927 |
| `AlertManager.js` | 告警管理 (critical/warning/info) | 985 |
| `ConfigCenter.js` | 配置热更新 | 425 |
| `QueueManager.js` | 优先级队列 + SSE通知 | 477 |
| `ProbeBufferingCallback.js` | SSE首包探针缓冲 | ~100 |

### Frontend State (frontend/src/stores/)

| File | Purpose |
|------|---------|
| `chatStore.ts` | 聊天状态、API配置、模型配置 |
| `conversationStore.ts` | 对话列表、侧边栏状态 |
| `messageStore.ts` | 消息状态、思维链 |
| `uiStore.ts` | UI状态、主题、布局 |

### Frontend Key Components (frontend/src/components/)

| Component | Purpose |
|-----------|---------|
| `ChatArea.tsx` | 聊天消息展示、思维链 |
| `ChatInput.tsx` | 输入框、意图检测Banner |
| `IntentSuggestionBanner.tsx` | 意图检测结果展示与接受 |
| `HumanConfirmationDialog.tsx` | HITL人工确认对话框 |
| `AgentExecutionPanel.tsx` | Agent执行状态面板 |
| `MissionControl/` | 任务控制中心、任务队列 |
| `AdminDashboard.tsx` | 管理后台总览仪表盘 |

## Layer Responsibilities Summary

| Layer | What it contains | What it should NOT contain |
|-------|-------------------|---------------------------|
| **routes/** | HTTP handling, parameter validation, response formatting | Business logic, SQL queries |
| **services/** | Business logic, tool execution, orchestration | HTTP handling, direct infra coupling |
| **application/** | High-level orchestration, cross-cutting coordination | HTTP, data format details |
| **domain/** | Pure business rules, entities, domain services | HTTP, infrastructure, frameworks |
| **infra/** | Technical concerns (metrics, alerts, config, queue) | Business logic |
| **common/** | Shared utilities, error definitions | Business logic, HTTP |

## Data Flow Summary

```
Frontend (React/Zustand)
    ↓ HTTP/SSE
Routes (chat.js, agent.js, ...)
    ↓ Direct call
Application (ChatOrchestrator, AgentOrchestrator)
    ↓ Direct call
Domain (IntentClassifier, Reranker, ToolExecutor)
    ↓ Direct call
Services (agentEngine, model clients, tools)
    ↓ HTTP
External Services (MiniMax API, Qdrant)
```

## Build Order (for understanding codebase)

1. **Common** - Error definitions, utilities (retry)
2. **Domain** - Pure business logic (IntentClassifier, Reranker)
3. **Services** - Business logic implementations (agentEngine, tools)
4. **Infra** - Technical infrastructure (circuitBreaker, metrics)
5. **Application** - Orchestration (ChatOrchestrator)
6. **Routes** - HTTP interface (thin layer on top)
7. **Frontend** - UI components consuming the API

---

*Structure documented for: AI Chat 玩具*
*Last Updated: 2026-04-26*