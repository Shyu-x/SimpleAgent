# SimpleAgent - 项目指令

## 项目概述
- SimpleAgent - 现代化AI对话平台
- 技术栈：React 19 + Next.js 16 + Zustand 5 + Express
- 端口：前端 3001，后端 30000
- **架构**: MiniMax 单一架构 (v2.5.1+)

## MiniMax 单一架构 (2026-03-20)

### 设计理念
- 完全依赖 MiniMax Token Plan API
- 简化配置，提高统一性和体验
- 移除多提供商复杂性

### 支持的 MiniMax 模型
| 模型 | 说明 | Token限制 |
|------|------|-----------|
| MiniMax-M2.7 | 旗舰编程版（默认） | 100K |
| MiniMax-M2.5 | 标准版 | 100K |
| MiniMax-VL-01 | 多模态版 | 32K |
| MiniMax-Text-01 | 长文本版 | 400K |

> **注意**: 默认使用 `MiniMax-M2.7` 模型，`highspeed` 版本 Token Plan 不支持

### Token Plan 优势
- 包含 M2.7 旗舰编程模型
- 支持思维链分离 (reasoning_split)
- 支持多模态 (VL-01)
- 高速通道可用

## 核心功能
1. SSE流式响应
2. 打字机效果
3. **MiniMax Token Plan API 支持**
4. API Key安全存储（sessionStorage）
5. 响应式移动端UI
6. 多模态输入（图片上传、语音录制）
7. 内容预览（文档/网页）
8. **MiniMax 模型路由器**
9. MCP 工具系统
10. RAG 知识库
11. 多Agent协作
12. 浏览器自动化
13. MiniMax 思维链可视化
14. MiniMax 自动生图（意图检测 + image-01 API）
15. 持续学习系统
16. A2A Agent-to-Agent 协议
17. HITL 人机协作确认系统
18. 安全中间件（速率限制/CORS/安全头）
19. 单元测试框架
20. **Agent 重试机制 (指数退避)**
21. **结构化 JSON 日志系统**
22. **Session Note Tool 持久化记忆**
23. **Token 摘要管理**
24. **取消机制 (asyncio.Event 风格)**
25. **RAG 问题重写与拆分**
26. **多路检索与重排序**
27. **意图识别与澄清引导**
28. **内存向量存储（默认）/ Qdrant（可选）**
29. **企业级管理后台 (知识库/工具/模型/Prompt/追踪)**

## 前端功能完整度 (2026-04-03)

| 模块 | 完整度 | 说明 |
|------|--------|------|
| 核心聊天 (ChatArea/ChatInput) | 100% | ✅ IntentBanner已修复 |
| HITL人机协作 | 100% | 全部11个端点已实现 |
| A2A Agent协作 | 100% | 协作API完整 |
| MCP工具市场 | 40% | 连接有，但工具管理无后端 |
| 管理后台-TraceViewer | 100% | 完整 |
| 管理后台-PromptTemplate | 100% | ✅ 路径已正确 |
| 管理后台-IntentTreeEditor | 100% | ✅ CRUD API已完成 |
| 管理后台-KnowledgeBase | 95% | ✅ 路径已修正 |
| 管理后台-ToolRegistry | 95% | ✅ 路径/参数已修正 |
| 管理后台-ModelConfig | 95% | ✅ 响应结构已修正 |
| 管理后台-AdminDashboard | 100% | ✅ Stats API已完成 |
| MissionControl | 100% | ✅ MissionControl API已完成 |
| PerformanceMonitor | 100% | ✅ Metrics API已完成 |
| MemoryPanel | 100% | ✅ 后端API已完成 |
30. **MetricsCollector/AlertManager/ConfigCenter/QueueManager**

## 语言要求
- 所有代码注释、文档、用户界面文本使用中文
- 变量命名使用英文
- 保持代码简洁，避免过度注释

## GSD 工作流配置

### 工作流触发
- 使用 `/use superpowers` 或直接派发 gsd-executor agent

### 配置位置
- `backend/.gsd/workflow.json` - 工作流配置
- `backend/.gsd/iteration-state.json` - 迭代状态
- `backend/.gsd/todo.md` - 待办任务

### 迭代模式
- Sprint 间隔: 30分钟
- Team Size: 10+ agent
- 测试阈值: 100%通过

### 架构健康
- 当前评分: 8.25/10
- 目标评分: 8.5/10

## 响应式断点
- 移动端 < 640px
- 平板 640px - 1023px
- 桌面 1024px+

## 关键文件

### 前端 (frontend/src/)
- `app/page.tsx` - 主页面
- `components/ChatArea.tsx` - 聊天区域
- `components/ChatInput.tsx` - 输入框
- `components/MultiWindowChat.tsx` - 多窗口聊天
- `components/ConversationList.tsx` - 对话列表
- `components/MarkdownRenderer.tsx` - Markdown渲染
- `components/ThinkingChain.tsx` - 思维链展示
- `components/WelcomeGuide.tsx` - 欢迎指南
- `components/ErrorBoundary.tsx` - 错误边界
- `components/agent/` - Agent相关组件
  - `MissionControl/` - 任务控制中心
  - `HumanConfirmationDialog.tsx` - 人工确认对话框
  - `AgentExecutionPanel.tsx` - 执行面板
  - `PerformanceMonitor.tsx` - 性能监控
  - `ToolMarketplace.tsx` - 工具市场
- `components/admin/` - 管理后台
  - `AdminDashboard.tsx` - 总览仪表盘
  - `KnowledgeBase/` - 知识库管理界面
  - `ToolRegistry/` - 工具注册管理界面
  - `ModelConfig/` - 模型配置界面
  - `PromptTemplate/` - Prompt模板管理界面
  - `TraceViewer/` - 链路追踪查看界面
- `store/chatStore.ts` - 状态管理
- `stores/conversationStore.ts` - 对话状态
- `stores/messageStore.ts` - 消息状态
- `stores/uiStore.ts` - UI状态
- `lib/apiClient.ts` - API客户端
- `lib/apiConfig.ts` - API配置
- `lib/modelConfig.ts` - 模型配置
- `hooks/useAgentSSE.ts` - Agent SSE钩子
- `hooks/useHITL.ts` - 人工确认钩子
- `hooks/useIntentDetection.ts` - 意图检测

### 后端 (backend/src/)

#### 分层架构
```
src/
├── application/           # 应用编排层
│   ├── ChatOrchestrator.js
│   └── AgentOrchestrator.js
├── domain/               # 核心业务逻辑
│   ├── model/            # 模型抽象
│   │   ├── ModelRouter.js
│   │   ├── HealthChecker.js
│   │   └── index.js
│   ├── rag/              # RAG领域
│   │   ├── QueryRewriteService.js   # 问题重写
│   │   ├── QueryDecomposeService.js # 问题拆分
│   │   ├── IntentClassifier.js      # 意图分类
│   │   ├── Reranker.js               # 重排序(多策略)
│   │   ├── CitationAssembler.js      # 引用组装
│   │   └── ingestion/    # 文档摄取
│   │       ├── IngestionPipeline.js
│   │       ├── IngestionNode.js
│   │       └── nodes/    # 节点实现
│   │           ├── ParseNode.js
│   │           ├── ChunkNode.js
│   │           ├── EmbeddingNode.js
│   │           └── IndexNode.js
│   ├── agent/            # Agent领域
│   │   ├── IntentRouter.js      # 意图路由
│   │   ├── ToolExecutor.js       # 工具执行器
│   │   ├── MCPToolExecutor.js    # MCP执行器
│   │   ├── ToolResultMerger.js   # 结果合并
│   │   └── ContextAssembler.js  # 上下文组装
│   └── search/           # 检索领域
│       ├── SearchChannel.js
│       ├── SearchCoordinator.js
│       ├── ProcessorChain.js
│       └── channels/     # 检索通道
│           ├── VectorSearchChannel.js
│           └── KeywordSearchChannel.js
├── infra/                # 基础设施层
│   ├── metrics/          # 指标采集 (Prometheus格式)
│   ├── alert/            # 告警管理
│   ├── config/           # 配置中心 (热更新)
│   ├── queue/            # 队列管理器
│   ├── circuitBreaker/   # 熔断器
│   │   ├── CircuitBreaker.js
│   │   ├── CircuitState.js
│   │   ├── CircuitEvent.js
│   │   └── CircuitBreakerFactory.js
│   ├── rateLimiter/      # 限流器
│   │   ├── QueueRateLimiter.js
│   │   ├── RateLimiterFactory.js
│   │   └── client.js
│   └── sse/              # SSE基础设施
│       ├── ProbeBufferingCallback.js
│       └── sseService.js      # SSE流式服务(实际调用MiniMax API)
├── common/               # 通用基础
│   ├── errors/           # 错误体系
│   │   ├── AppError.js
│   │   ├── errors.js
│   │   └── index.js
│   └── CircuitBreaker.js
├── routes/              # 接口层 (30+ 路由)
│   ├── admin/           # 管理后台API
│   │   ├── knowledge.js # 知识库管理
│   │   ├── tool.js      # 工具管理
│   │   ├── model.js     # 模型管理
│   │   ├── prompt.js    # Prompt模板
│   │   └── trace.js     # 链路追踪
│   ├── qdrant.js        # Qdrant向量数据库API
│   ├── a2a.js           # A2A协议
│   └── hitl.js          # HITL确认
├── services/            # 业务逻辑层
│   ├── agent/           # Agent服务
│   │   ├── IntentClassifier.js
│   │   ├── QueryRewriteService.js
│   │   ├── QueryDecomposeService.js
│   │   ├── MemoryWindowManager.js
│   │   ├── ToolExecutor.js
│   │   └── AgentVisualizer.js
│   ├── model/           # 模型客户端
│   │   ├── ChatModelClient.js
│   │   ├── clients/MiniMaxChatClient.js
│   │   └── ModelClientFactory.js
│   ├── rag/            # RAG服务
│   │   ├── ragService.js
│   │   ├── QueryRewriteService.js
│   │   └── RerankerService.js
│   ├── router/         # 模型路由
│   │   ├── modelRouter.js  # MiniMax路由
│   │   └── QdrantRouter.js # Qdrant向量路由
│   ├── tools/          # 工具实现 (30+)
│   ├── metrics/        # 指标收集
│   └── tracing/        # 追踪服务
├── middleware/          # 中间件
├── utils/              # 工具函数
└── scripts/            # 脚本
```

#### 核心服务
| 服务 | 文件 | 职责 |
|------|------|------|
| AgentEngine | `services/agentEngine.js` | ReAct执行循环、取消机制 |
| ChatModelClient | `services/model/ChatModelClient.js` | 统一模型客户端 |
| MiniMaxRouter | `services/router/modelRouter.js` | MiniMax模型路由 |
| OllamaRouter | `services/router/OllamaRouter.js` | ~~Ollama向量模型路由~~ 已移除 |
| QdrantRouter | `services/vector/QdrantRouter.js` | Qdrant向量路由（simpleVectorize+Qdrant，降级到memory） |
| ToolRegistry | `services/tools/toolRegistry.js` | 工具注册管理 |
| SemanticMemory | `services/SemanticMemory.js` | 语义记忆系统 |
| RAGService | `services/ragService.js` | 知识检索服务 |
| ChatOrchestrator | `application/ChatOrchestrator.js` | 聊天编排 |
| AgentOrchestrator | `application/AgentOrchestrator.js` | Agent编排 |
| ModelRouter | `domain/model/ModelRouter.js` | 领域模型路由 |
| SSEService | `services/sseService.js` | SSE流式服务(实际调用MiniMax) |
| CircuitBreaker | `infra/circuitBreaker/CircuitBreaker.js` | 熔断器 |
| QueueRateLimiter | `infra/rateLimiter/QueueRateLimiter.js` | 队列限流 |
| MetricsCollector | `infra/metrics/MetricsCollector.js` | Prometheus指标采集 |
| AlertManager | `infra/alert/AlertManager.js` | 告警管理 |
| ConfigCenter | `infra/config/ConfigCenter.js` | 配置中心热更新 |
| QueueManager | `infra/queue/QueueManager.js` | 优先级队列管理 |

## 环境管理 (2026-05-17)

### 版本约束

| 项目 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥18.0.0, <25.0.0 | LTS 版本，推荐 v20.x |
| pnpm | ≥8.0.0 | 项目默认包管理器 |

### 环境配置

**必须使用 nvm (Node Version Manager) 管理 Node 版本**

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# 切换到正确版本
nvm use  # 读取 .nvmrc

# 安装 pnpm
npm install -g pnpm
```

**版本锁定文件**:
- `.nvmrc` - Node 版本锁定 (当前: 20)
- `package.json engines` - 包管理器约束

### 依赖安装

```bash
# 后端
cd backend && pnpm install

# 前端
cd frontend && pnpm install

# 使用 workspace (从根目录)
pnpm install
pnpm --filter @simpleagent/backend dev
```

### PM2 进程管理

```bash
# 启动
pm2 start ecosystem.config.js

# 查看状态
pm2 list

# 重启
pm2 restart ai-chat-backend
pm2 restart ai-chat-frontend

# 查看日志
pm2 logs ai-chat-backend
```

### 验证命令

```bash
# 验证环境
node --version    # 期望: v20.x.x
pnpm --version    # 期望: ≥10.x.x

# 验证服务
curl http://localhost:30000/api/health   # 后端
curl http://localhost:3001               # 前端
```

详细文档: `docs/环境管理规范.md`

## 环境变量

> **警告**: 禁止将包含真实密钥的 `.env` 文件提交到 Git。项目通过 `.gitignore` 规则排除敏感文件。

### 后端 (.env)
```bash
# MiniMax Token Plan API (必需)
MINIMAX_API_KEY=your_token_plan_api_key

# MiniMax API 地址 (可选)
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic

# RAG 配置
RAG_CHUNK_SIZE=512
RAG_TOP_K=5
RAG_RERANK=true

# Qdrant 向量数据库配置
# 向量存储模式：qdrant（默认，优先使用），memory（降级备用）
VECTOR_DB_TYPE=qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=chat_documents
QDRANT_DIMENSION=1024

# Qdrant HNSW 索引配置
QDRANT_HNSW_M=32
QDRANT_HNSW_EF_CONSTRUCTION=128
QDRANT_HNSW_FULL_SCAN=10000

# Qdrant PQ 量化配置
QDRANT_QUANTIZATION_ENABLED=true
QDRANT_QUANTILE=0.99
```

### 前端 (.env.local)
```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:30000
```

## 持续优化机制 (2026-03-20)

### 自动化学习
- **定时任务**: 每10分钟自动运行
- **任务ID**: 00b27f20
- **脚本**: `backend/src/scripts/ContinuousLearning.js`
- **输出**: `docs/learning/技术趋势报告.md`

### 监控领域
1. Agent框架 (langgraph, langchain)
2. React Agent (react AI agent workflow)
3. MCP协议 (mcp model context protocol)
4. 浏览器Agent (browser automation AI agent)
5. 多Agent协作 (multi-agent collaboration)
6. 最新React技术 (react-19 next.js-16)
7. Zustand模式 (zustand state management)
8. TypeScript最佳实践

### 参考开源项目
| 项目 | Stars | 借鉴要点 |
|------|-------|----------|
| LangGraph | 26.8k | 状态机、检查点 |
| DeerFlow | 31.8k | Sandbox、记忆、技能 |
| LobeHub | 73.9k | 多Agent协作 |
| ChatDev | 31.7k | 软件开发Agent |
| GenAI Agents | 20.6k | 教程、最佳实践 |
| **MiniMax Mini-Agent** | 1.9k | Agent执行循环、Token管理、取消机制 |

## MiniMax Mini-Agent 优化 (2026-03-20)

### 已实施的优化
| 优化项 | 文件 | 说明 |
|--------|------|------|
| 重试机制 | `backend/src/utils/retry.js` | 指数退避、超时包装 |
| 结构化日志 | `backend/src/services/AgentLogger.js` | JSON Lines日志、彩色控制台 |
| Session Note Tool | `backend/src/services/tools/SessionNoteTool.js` | 持久化记忆、分类检索 |
| Token 摘要 | `backend/src/services/agentEngine.js` | 自动摘要、防连续触发 |
| 取消机制 | `backend/src/services/agentEngine.js` | createCancelEvent/cancel/_checkCancelled |

### 关键实现
```javascript
// 取消事件
agent.createCancelEvent();  // 创建
agent.cancel();             // 触发
if (agent._checkCancelled()) // 检查

// Token 摘要
const estimated = agent._estimateTokens();
if (agent._shouldSummarize()) {
  await agent._summarizeMessages();
}

// 日志
agent.logger.logRequest(messages, tools);
agent.logger.logToolResult(name, args, success, result);

// Session Note
await agent.sessionNoteTool.recordNote('内容', '分类');
await agent.sessionNoteTool.recallNotes('分类');
```

## 文档索引

### 核心文档
| 文件 | 说明 |
|------|------|
| `CHANGELOG.md` | 版本更新日志 |
| `CLAUDE.md` | 项目指令（本文件） |
| `docs/Phase2-3完成报告.md` | Phase 2 & 3 完成报告 |
| `docs/Qdrant部署指南.md` | Qdrant向量数据库部署指南 |
| `docs/六层架构技术栈详解.md` | 完整技术栈分析 |
| `docs/功能验证与持续改进报告.md` | 测试与改进 |
| `docs/Agent架构批判性分析与优化方案.md` | 架构分析 |
| `docs/持续优化日志.md` | 优化进度追踪 |
| `docs/高级功能测试报告.md` | 高级功能测试 |
| `docs/learning/技术趋势报告.md` | 技术趋势（自动更新） |
| `docs/MiniMax-Mini-Agent调研报告.md` | MiniAgent调研与优化 |
| `docs/Agent架构与性能评估.md` | Agent架构、时序图、性能评估 |
| `docs/Agent工具与团队协作.md` | 工具列表、A2A协议详解 |
| `frontend/docs/前端功能验证报告.md` | **前端UI与业务逻辑验证报告 (2026-04-03)** |

## 文档索引

### 核心文档
| 文件 | 说明 |
|------|------|
| `CHANGELOG.md` | 版本更新日志 |
| `CLAUDE.md` | 项目指令（本文件） |
| `docs/六层架构技术栈详解.md` | 完整技术栈分析 |
| `docs/Agent架构深度分析报告.md` | 架构分析、代码质量 |
| `docs/持续优化日志.md` | 优化进度追踪 |
| `docs/learning/技术趋势报告.md` | 技术趋势（自动更新） |
| `docs/MiniMax-Mini-Agent调研报告.md` | MiniAgent调研与优化 |
| `docs/Agent架构与性能评估.md` | Agent架构、时序图、性能评估 |
| `docs/Agent工具与团队协作.md` | 工具列表、A2A协议详解 |
| `docs/通用Agent智能体开发框架设计.md` | Agent开发框架设计 |
| `docs/全模块Agent协作系统技术规范.md` | 全模块协作规范 |
| `docs/测试结果与质量分析报告.md` | 测试与质量分析 |
| `docs/技术调研与选型报告.md` | 技术选型与调研 |

## Bug修复记录

### Bug修复记录 (2026-03-14)

### Bug 2: 历史记录侧边栏
- 问题：侧边栏无法关闭
- 修复：在 ConversationList 组件添加关闭按钮，调用 setSidebarOpen(false)

### Bug 3: 多窗口模式
- 问题：某些布局模式下多窗口功能失效
- 修复：
  - 修正 getContainerStyles() 逻辑
  - 支持网格布局下单窗口显示（col-span-2 row-span-2）
  - 不存在的对话显示占位符而非隐藏

### Bug 4: Markdown渲染
- 问题：使用 highlight.js 和 rehype-raw 存在安全风险
- 修复：
  - 使用 shiki 替代 highlight.js 进行语法高亮
  - 使用 dompurify 进行 XSS 安全过滤
  - 移除 rehype-raw 插件
  - 配置严格的 ALLOWED_TAGS 和 ALLOWED_ATTR

## Bug修复记录 (2026-03-15)

### Bug 5: 后端连接配置缺失
- 问题：消息发送后无响应
- 原因：前端缺少 NEXT_PUBLIC_BACKEND_URL 环境变量配置
- 修复：在 frontend/.env.local 添加 NEXT_PUBLIC_BACKEND_URL=http://localhost:30000

### Bug 6: ESC 键无法关闭面板
- 问题：知识库和记忆面板按 ESC 键无法关闭
- 修复：在 page.tsx 添加全局 ESC 键监听器，监听 sidePanelContent 状态变化

## Bug修复记录 (2026-04-01)

### Bug 7: SSE Service 返回模拟回复
- 问题：`/api/chat` SSE流式接口返回 `Lorem ipsum` 模拟文本
- 原因：`sseService.js` 中有模拟回复逻辑，未实际调用 MiniMax API
- 修复：
  - 移除 `mockData.js` 引用和模拟回复逻辑
  - 改用 `MiniMaxRouter` 实际调用 MiniMax-M2.7 API
  - 正确处理 `result.result`（流式响应）

### Bug 8: 模型名称错误
- 问题：默认使用 `MiniMax-M2.7-highspeed` 但 Token Plan 不支持
- 修复：默认模型改为 `MiniMax-M2.7`

### Bug 9: RAG 余弦相似度 NaN
- 问题：`cosineSimilarity` 计算返回 NaN
- 修复：添加除零和 NaN 检查

### Bug 10: 工具系统缺少保护
- 问题：工具执行无超时控制和参数验证
- 修复：添加 `executeWithTimeout` 和 `_validateParameters`

## Bug修复记录 (2026-04-03) - v2.3.0 架构统一修复

### Bug 11: MissionControl 后端API完全缺失
- 问题：`MissionControl` 组件使用纯前端 Zustand store，无后端API连接，页面刷新后数据丢失
- 影响：任务队列、Agent状态同步、任务分配功能完全不可用
- 状态：**🔄 修复中** - `routes/missionControl.js` 开发中

### Bug 12: PerformanceMonitor 完全使用模拟数据
- 问题：`PerformanceMonitor` 组件使用 `setTimeout` 和 `Math.random()` 模拟数据
- 影响：性能指标、告警、优化建议均为虚假数据
- 状态：**🔄 修复中** - Metrics API对接中

### Bug 13: KnowledgeBase API路径不匹配 ✅
- 问题：前端调用 `/documents/*` 但后端路由是 `/docs/*`
- 修复：前端所有路径已修正为 `/api/admin/knowledge/docs`
- Agent: agent-kb-fix

### Bug 14: ToolRegistry API路径/参数不匹配 ✅
- 问题：工具启用/禁用、分类列表、注册、测试等功能API路径与后端不一致
- 修复：
  - `/tools/categories` → `/tools/categories/list`
  - POST `/tools` → POST `/tools/register`
  - PATCH → PUT
  - POST `/tools/test` → POST `/tools/${selectedTool}/test`
- Agent: agent-toolreg-fix

### Bug 15: AdminDashboard Stats API缺失
- 问题：`AdminDashboard.tsx` 调用 `GET /api/admin/stats` 但后端无此路由
- 影响：管理后台首页统计面板无法显示
- 状态：**🔄 修复中** - `routes/admin/stats.js` 开发中

### Bug 16: ModelConfig API缺失/响应结构不匹配 ✅
- 问题：`ModelConfig/index.tsx` 调用 `GET /api/admin/models` 和 `/api/admin/models/stats` 但后端响应结构不匹配
- 修复：
  - GET `/` 响应结构修正
  - GET `/stats` 响应结构修正
  - PATCH `/:name` 新增端点
  - POST `/:name/circuit-breaker` 新增端点
- Agent: agent-modelconfig-fix

### Bug 17: IntentTreeEditor API缺失
- 问题：`IntentTreeEditor/index.tsx` 调用意图树CRUD API但后端未实现
- 影响：意图树编辑无法保存
- 状态：**🔄 修复中** - `routes/admin/intent.js` 开发中

### Bug 18: MemoryPanel 后端API缺失 ✅
- 问题：`MemoryPanel` 组件无后端同步，所有记忆存储在localStorage
- 影响：记忆无法跨会话同步
- 修复：已创建 `routes/memory.js`，实现14个API端点
- Agent: agent-memory-api

### Bug 19: ChatInput 意图检测Banner空实现 ✅
- 问题：`IntentSuggestionBanner` 的 `onAccept` 是空实现
- 修复：在 `onAccept` 中调用 `setAppMode('agent')`
- Agent: agent-chatinput-fix

### Bug 20: PromptTemplate 路径不匹配 ✅
- 问题：前端调用 `/api/admin/prompts` 但后端是 `/api/admin/prompt`
- 修复：经检查后端路由已正确挂载为 `/api/admin/prompts`，无需修改
- Agent: agent-prompt-fix

### 其他已确认正常的功能
- Bug 8: 默认模型名称修正 ✅ - `MiniMax-M2.7-highspeed` → `MiniMax-M2.7`
- Bug 4: Markdown渲染安全修复 ✅ - 已使用 shiki + dompurify

## 大规模深度测试 (2026-03-17)

### 测试脚本
- `tests/量化测试_runner.js` - 大规模量化测试 (12000+请求)
  - 意图识别测试 (5000请求)
  - 查询改写测试 (2000请求)
  - 混合检索测试 (2000请求)
  - 模型池测试 (3000请求)

- `tests/压测_runner.js` - 压力测试
  - 递增压测 (10/50/100/200并发)
  - 峰值测试
  - 恢复测试

- `tests/参数评估_runner.js` - 参数评估
  - 熔断参数评估
  - 限流参数评估
  - Token控制参数评估

- `tests/测试报告_可视化.html` - 测试报告可视化

### 测试方法论
- NLP模型评估标准 (BLEU/ROUGE/METEOR/Perplexity)
- 后端性能测试指标 (QPS/延迟P50-P99/吞吐量/错误率)
- AI系统测试方法 (提示注入/对抗样本/边界条件/回归/A/B测试)

## Agent系统量化分析 (2026-03-18)

### 测试脚本
- `backend/tests/量化分析_runner.js` - 17组对照实验

### 量化分析结果
- **意图分类（5组）**: 关键词匹配最佳 70%
- **工具选择（4组）**: 关键词匹配最佳 90%
- **性能基准（3组）**: 关键词匹配 0.00ms，LLM小模型 91.70ms，LLM大模型 208.90ms
- **并行执行**: 加速比 3.33x
- **直接API vs Agent**: Agent增加20.5%延迟，但工具调用率44%，任务理解提升14%

### 直接API vs Agent对比结论
| 指标 | 直接API | Agent系统 | 差异 |
|------|---------|-----------|------|
| 延迟 | 154.8ms | 186.6ms | +20.5% |
| 工具调用率 | 0% | 32-44% | +44% |
| 任务理解 | 64% | 78% | +14% |

## 文档索引

### 项目文档
| 文件 | 说明 |
|------|------|
| `CHANGELOG.md` | 版本更新日志 |
| `CLAUDE.md` | 项目指令（本文件） |
| `docs/功能评估.md` | 功能完整性评估与测试结果 |
| `docs/功能测试文档.md` | 详细测试用例与验收标准 |
| `docs/架构设计方案.md` | 系统架构设计文档 |
| `docs/架构分析改良报告.md` | 架构分析与改进建议 |
| `docs/技术调研与选型报告.md` | 技术选型与调研报告 |
| `docs/AI-Chat开发手记.md` | 开发过程记录 |
| `docs/源码详细分析报告.md` | 代码结构详细分析 |
| `docs/DEPLOYMENT.md` | 部署指南 |
| `docs/BROWSER_AUTOMATION_PLAYBOOK.md` | 浏览器自动化手册 |
| `docs/前端能力与后端API需求文档.md` | **前端所有功能与后端API需求 (v1.0 - 2026-04-03)** |

### 测试数据
| 文件 | 说明 |
|------|------|
| `tests/NLP测试语料集.md` | NLP测试语料 |
| `frontend/docs/前端功能验证报告.md` | **前端UI与业务逻辑验证报告 (2026-04-03)** |
| `tests/超大规模NLP测试语料集.md` | 大规模测试语料 |

## E2E 测试系统 (2026-03-19)

### 测试文件
| 文件 | 说明 |
|------|------|
| `tests/e2e/full-interface-test.js` | 自定义测试运行器 (支持截图分析) |
| `tests/e2e/playwright.config.js` | Playwright 配置 |
| `tests/e2e/page.spec.ts` | 页面加载测试 |
| `tests/e2e/chat.spec.ts` | 聊天功能测试 |
| `tests/e2e/sidebar.spec.ts` | 侧边栏测试 |
| `tests/e2e/settings.spec.ts` | 设置面板测试 |
| `tests/e2e/agent.spec.ts` | Agent 模式测试 |
| `tests/e2e/focus-mode.spec.ts` | 专注模式测试 |
| `tests/e2e/responsive.spec.ts` | 响应式布局测试 |

### 运行命令
```bash
# 安装 Playwright 浏览器
cd frontend && npx playwright install chromium

# 自定义测试运行器
node tests/e2e/full-interface-test.js

# Playwright Test
cd frontend && npm run test:e2e:playwright
npm run test:e2e:headed   # 有头模式
npm run test:e2e:ui       # UI 模式
npm run test:e2e:mobile   # 移动端测试
```

### Minimax Vision 集成
- 配置 `MINIMAX_API_KEY` 环境变量
- 自动截图分析界面异常
- 生成 HTML 测试报告

## MiniMax MCP Server (2026-03-19)

### MCP 配置
- 配置文件: `.mcp.json` (项目根目录)
- 文档 MCP: `uvx minimax-coding-plan-mcp`
- API Host: `https://api.minimaxi.com`

### 后端路由 (`/api/minimax`)
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/minimax/image` | POST | MiniMax 图像生成 (image-01) |
| `/api/minimax/tts` | POST | 语音合成 (speech-02-hd) |
| `/api/minimax/connect` | POST | 连接 MiniMax MCP Server |
| `/api/minimax/status` | GET | 获取 MCP 连接状态 |

### 意图检测 (`useIntentDetection.ts`)
- `image_generation`: 显式生图关键词 (画/生成图片/帮我画等)
- `creative`: 创意生成关键词
- `vision`: 视觉/图片理解意图
- `tool_use`: 工具使用意图
- `knowledge`: 知识问答意图

### 测试报告
- 输出目录: `test-results/`
- HTML 报告: `test-results/html/index.html`
- 截图目录: `test-results/screenshots/`

## A2A 协议 (2026-03-20)

### Agent-to-Agent 通信
- **文件**: `backend/src/routes/a2a.js`, `backend/src/services/a2aService.js`
- **功能**:
  - Agent 注册与心跳检测
  - 消息传递与任务委托
  - SSE 实时订阅
  - 任务状态管理

### 多Agent协作系统 (v2.0 - 2026-04-02)

基于 Claude Code 多Agent协作机制设计：

#### 三种协调模式
| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `team_leader` | 主 Agent 主导，其他执行 | 复杂分层任务 |
| `collaborative` | 对等协作，共享职责 | 并行专业工作 |
| `autonomous` | 独立执行，最小协调 | 独立并行任务 |

#### 增强任务定义
```javascript
{
  id: 'task-1',
  agentName: 'code-reviewer',
  taskType: 'code-review',
  prompt: 'Review the PR for bugs...',
  dependencies: ['task-0'],        // 依赖的任务 ID
  effort: 'high',                // low/medium/high
  maxTurns: 50,
  timeout: 60000,
  successCriteria: 'No critical bugs found',
  additionalInstructions: 'Focus on security'
}
```

#### 生命周期钩子
| 钩子 | 触发 | 用途 |
|------|------|------|
| `task:created` | 任务创建 | 监控初始化 |
| `task:completed` | 任务完成 | 追踪完成 |
| `task:failed` | 任务失败 | 错误处理 |
| `task:skipped` | 任务跳过 | 依赖失败 |
| `collaboration:started` | 协作开始 | 启动事件 |
| `collaboration:completed` | 协作完成 | 结果汇总 |

#### 标准化结果汇总
```javascript
{
  id: 'collab-123',
  title: 'PR Review',
  status: 'completed',
  summary: {
    totalTasks: 3,
    completed: 3,
    failed: 0,
    skipped: 0,
    successRate: 1.0
  },
  results: [...],           // 详细任务结果
  dependencyGraph: {         // 依赖图
    nodes: [...],
    edges: [...]
  },
  validation: {
    passed: true,
    criteria: 0.5
  }
}
```

### 后端路由 (`/api/a2a`)
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/a2a/agents` | GET | 获取所有Agent |
| `/api/a2a/agents/:agentId` | GET | 获取单个Agent |
| `/api/a2a/agents/:agentId/heartbeat` | POST | 心跳检测 |
| `/api/a2a/messages/send` | POST | 发送消息 |
| `/api/a2a/subscribe/:sessionId` | GET | SSE订阅 |
| `/api/a2a/collaborate` | POST | 执行协作任务 |
| `/api/a2a/collaboration/:taskId` | GET | 获取任务状态 |
| `/api/a2a/collaboration/:taskId/result` | GET | 获取标准化结果 |
| `/api/a2a/collaboration/:taskId` | DELETE | 取消任务 |
| `/api/a2a/collaboration/stats` | GET | 获取统计信息 |
| `/api/a2a/tasks/define` | POST | 创建任务定义 |
| `/api/a2a/tasks/define/batch` | POST | 批量创建任务 |
| `/api/a2a/tasks/:taskId` | GET | 获取任务定义 |
| `/api/a2a/coordination/modes` | GET | 获取协调模式信息 |

## HITL 人机协作确认系统 (2026-03-20)

### 确认类型
- **危险操作**: 文件删除、格式化、清空
- **不可逆操作**: DROP、TRUNCATE、批量覆盖
- **高费用调用**: GPT-4/5、图像/视频生成
- **外部HTTP请求**: 可选检测

### 后端路由 (`/api/hitl`)
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/hitl/request` | POST | 创建确认请求 |
| `/api/hitl/respond` | POST | 响应确认 |
| `/api/hitl/subscribe/:sessionId` | GET | SSE订阅 |
| `/api/hitl/status/:requestId` | GET | 查询状态 |

### 前端组件
- `HumanConfirmationDialog.tsx` - 确认对话框
  - 风险等级颜色编码（高危红色、中危黄色）
  - 倒计时进度条（60秒超时）
  - 键盘快捷键（Y/N/C）

## 安全中间件 (2026-03-20)

### 中间件列表
- **文件**: `backend/src/middleware/security.js`
- **功能**:
  - IP 速率限制 (100请求/分钟)
  - 请求体大小限制 (10MB)
  - CORS 配置
  - 安全响应头

### 安全头
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

## 测试框架 (2026-04-01)

### 测试文件
| 文件 | 说明 |
|------|------|
| `tests/comprehensive-test.js` | 综合API测试 (29/29通过) |
| `tests/agent-evaluation-system.js` | Agent全面评价体系 (8维度34用例) |
| `tests/dialogue-scenario-test.js` | 连续对话场景测试 (5场景15轮) |
| `backend/tests/unit/` | 单元测试 |

### 运行命令
```bash
# 综合测试
node tests/comprehensive-test.js

# Agent评价
node tests/agent-evaluation-system.js

# 对话场景测试
node tests/dialogue-scenario-test.js

# 单元测试
node backend/tests/unit/hitl.test.js
node backend/tests/unit/a2a.test.js
node backend/tests/unit/api.test.js
```

## 测试优化 (2026-03-20)

### Token消耗优化
- **量化测试**: 10 topics × 100 chars × 3 groups (~15K tokens)
- **对照实验**: 10 rounds × 2 groups (~8K tokens)
- **E2E测试**: Vision分析默认关闭 (ENABLE_VISION_ANALYSIS=false)

### Mock移除
- 已删除 `backend/__mocks__/` 目录
- 所有测试使用真实实现
- SSE Service 已修复，不再返回模拟回复

## Ollama 向量模型集成 (2026-04-01)

### Qdrant 向量数据库
- Qdrant 向量数据库（端口6333/6334）
- RESTful API 接口
- 高性能向量相似度搜索
- 无需额外 SDK 依赖

## Qdrant 向量数据库 (2026-04-02)

### 特性
- 高性能向量相似度搜索
- RESTful API 接口
- 无需额外 SDK 依赖
- 支持整数或 UUID 格式点 ID

### 环境配置
```bash
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=chat_documents
QDRANT_DIMENSION=1024
```

### 后端路由 (`/api/qdrant`)
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/qdrant/status` | GET | 获取 Qdrant 状态 |
| `/api/qdrant/collections` | GET | 列出所有集合 |
| `/api/qdrant/collections/:collection` | GET | 获取集合信息 |
| `/api/qdrant/collections/:collection` | PUT | 创建集合 |
| `/api/qdrant/collections/:collection` | DELETE | 删除集合 |
| `/api/qdrant/documents` | POST | 插入文档向量 |
| `/api/qdrant/documents/batch` | POST | 批量插入 |
| `/api/qdrant/search` | POST | 相似度搜索 |
| `/api/qdrant/documents` | DELETE | 删除文档向量 |
| `/api/qdrant/stats/:collection` | GET | 获取集合统计 |

### 核心服务
| 服务 | 文件 | 说明 |
|------|------|------|
| QdrantVectorStore | `services/vector/QdrantVectorStore.js` | Qdrant 客户端 |
| QdrantRouter | `services/vector/QdrantRouter.js` | 向量路由（embedding + storage）|

## 管理后台 API (routes/admin/)

### 后端路由
| 组件 | 文件 | 说明 |
|------|------|------|
| 知识库管理 | `routes/admin/knowledge.js` | 文档CRUD、索引管理 (346行) |
| 工具管理 | `routes/admin/tool.js` | 工具注册、配置、测试 (359行) |
| 模型管理 | `routes/admin/model.js` | 模型配置、健康检查 (264行) |
| Prompt模板 | `routes/admin/prompt.js` | 模板CRUD、版本管理 (424行) |
| 链路追踪 | `routes/admin/trace.js` | Trace查询、统计 (346行) |

### 前端组件
| 组件 | 目录 | 说明 |
|------|------|------|
| 管理仪表盘 | `AdminDashboard.tsx` | 总览页面（未集成） |
| 知识库管理 | `KnowledgeBase/` | 完整Admin界面 (817行，未集成) |
| 工具管理 | `ToolRegistry/` | 完整Admin界面 (971行，未集成) |
| 模型配置 | `ModelConfig/` | 完整Admin界面 (574行，未集成) |
| Prompt模板 | `PromptTemplate/` | 完整Admin界面 (753行，未集成) |
| 链路追踪 | `TraceViewer/` | 完整Admin界面 (834行，未集成) |

> **注意**: 前端存在两套并行组件：
> - `components/KnowledgeBaseManager.tsx` - 已集成到侧边栏的知识库面板
> - `components/admin/KnowledgeBase/index.tsx` - 独立的完整Admin界面（未集成）
> - `AdminDashboard.tsx` 等组件为独立Admin页面设计，需配合路由使用

---

**文档更新日期**: 2026-05-15
**最后更新**: v2.5.0 Sprint #5 完成 ✅

## Agent 评估结果 (2026-04-01)

### 综合评分
| 维度 | 评分 | 权重 |
|------|------|------|
| **总分** | **87/100** | - |
| **评级** | **A级 - 优秀** | - |
| 基础对话 | 88 | 15% |
| 工具调用 | 94 | 20% |
| 多Agent协作 | 77 | 15% |
| RAG检索 | 98 | 15% |
| 意图识别 | 86 | 10% |
| 流式响应 | 83 | 10% |
| 上下文保持 | 90 | 10% |
| 错误处理 | 58 | 5% |

### 亮点
- RAG检索评分最高 (98) - 多策略重排序有效
- 工具调用表现优秀 (94) - 搜索、计算、天气等功能正常
- 上下文保持能力强 (90) - 多轮对话记忆良好

### 待改进
- 错误处理 (58) - 无效输入处理需加强
- 多Agent协作 (77) - A2A协议需完善

### 测试报告
- 综合测试: `docs/test-results/comprehensive-test-report-20260401.json` (29/29通过)
- 评估体系: `docs/test-results/agent-evaluation-20260401T151004.html`
- 对话场景: `docs/test-results/dialogue-test-*.json`

---

# 企业级 Agentic RAG 平台升级路线图 (2026-03-21)

## 一、项目改造总目标

将当前 Agent 应用升级为具备以下企业级能力的企业级 Agentic RAG 系统：

- 多轮对话问答
- 检索增强生成（RAG）
- Agent 工具调用
- MCP 工具协议集成
- 多模型路由与容错
- 会话记忆管理
- 问题重写与拆分
- 意图识别与澄清引导
- 多路检索与重排序
- 文档入库 ETL Pipeline
- 全链路追踪与可观测性
- 后台配置化管理
- 高并发与限流保护
- 可扩展插件化架构

## 二、企业级设计标准

### 1. RAG 全链路能力
- 文档解析
- 清洗与标准化
- 分块策略
- 向量化
- 多路召回
- 检索结果去重
- 重排序
- Prompt 组装
- 流式生成
- 引用来源保留
- 幻觉控制

### 2. 问题处理能力
- 问题重写：补全上下文、省略信息恢复
- 问题拆分：复杂问题自动拆成多个子问题
- 意图识别：区分知识问答、工具调用、闲聊、任务执行
- 低置信度澄清：不要硬猜，必要时反问用户

### 3. 会话记忆能力
- 近 N 轮短期记忆
- 超长上下文自动摘要
- 记忆压缩
- 记忆持久化
- 不同会话隔离
- Token 成本控制

### 4. 检索架构能力
- 关键词检索
- 向量检索
- 意图定向检索
- 混合召回
- 并行检索
- 后处理流水线
- TopK 可配置
- 重排序可插拔

### 5. 模型工程化能力
- 多模型接入抽象
- 主备/优先级路由
- 健康检查
- 熔断降级
- 首包探测
- 超时保护
- 重试策略
- 流式输出封装

### 6. 工具调用能力
- 工具注册机制
- 工具发现机制
- 工具参数提取
- 工具执行编排
- 工具结果回填
- 工具失败兜底
- MCP 协议兼容层

### 7. 工程化与生产级能力
- 分层架构
- 模块边界
- 接口抽象
- 配置中心化
- 限流/排队
- 并发控制
- 权限控制
- 全链路 Trace
- 日志规范
- 错误码体系
- 异常体系
- 测试覆盖
- 可运维性

## 三、分阶段升级路线图

### Phase 1：架构收敛与基础设施补齐
**优先级：P0**

- 分层重构
- 核心接口抽象
- 配置整理
- 异常与日志规范
- Trace 基础设施
- 基本限流和超时控制

**为什么先做这个**：基础不牢，地动山摇。当前代码缺乏清晰分层，接口边界模糊，必须先打好基础才能继续演进。

**涉及模块**：
- `src/routes/` - 接口层收敛
- `src/services/` - 业务逻辑层抽象
- `src/infra/` - 基础设施层（新增）
- `src/common/` - 通用能力层（新增）

**预期收益**：
- 代码可维护性提升 50%
- 新功能接入成本降低 40%
- 问题定位时间减少 60%

**风险点**：改动面大，可能影响现有功能

**依赖关系**：是后续所有阶段的基础

### Phase 2：RAG 核心能力增强
**优先级：P1**

- 文档入库流程
- 分块与向量化
- 检索服务抽象
- 多路召回
- 检索后处理
- 引用与结果可信度增强

**涉及模块**：
- `src/services/rag/` - RAG 服务（重构）
- `src/services/ingestion/` - 文档摄取（已有，需增强）
- `src/services/search/` - 检索服务（新增）

### Phase 3：Agent 核心能力增强
**优先级：P1**

- 意图识别
- 问题重写
- 问题拆分
- 工具调用框架
- MCP 集成层
- 任务路由

**涉及模块**：
- `src/services/agent/` - Agent 核心（重构）
- `src/services/tools/` - 工具层（增强）
- `src/services/mcp/` - MCP 协议（增强）

### Phase 4：生产级能力建设
**优先级：P2**

- 多模型路由
- 熔断降级
- 队列式限流
- 会话记忆压缩
- 可观测性
- 后台配置化

**涉及模块**：
- `src/services/router/` - 路由层（重构）
- `src/services/circuitBreaker/` - 熔断器（新增）
- `src/services/queue/` - 队列服务（新增）
- `src/services/monitoring/` - 监控服务（新增）

### Phase 5：体验和管理后台完善
**优先级：P2**

- 可视化配置
- 链路追踪页
- 知识库管理
- Tool 管理
- 模型管理
- Prompt 模板管理

**涉及模块**：
- `frontend/src/components/admin/` - 管理后台（新增）
- `backend/src/routes/admin/` - 管理 API（新增）

## 四、重点补齐能力清单

### A. 分层架构改造
目标分层：
- `application/` - 应用编排层
- `domain/` - 核心业务逻辑
- `infra/` - 基础设施与三方适配
- `web/` - 接口层
- `common/` - 通用基础能力

要求：
- 业务逻辑不能散落在 routes
- 模型供应商逻辑不能污染业务层
- 检索实现与调用编排解耦
- Tool 具体实现与 Tool 路由解耦

### B. RAG 检索引擎增强
核心类：
- `QueryRewriteService` - 问题重写
- `QueryDecomposeService` - 问题拆分
- `IntentClassifier` - 意图分类
- `SearchChannel` - 检索通道
- `SearchCoordinator` - 检索协调器
- `SearchResultPostProcessor` - 结果后处理
- `Reranker` - 重排序
- `CitationAssembler` - 引用组装

要求：
- 检索通道可插拔
- 支持并行执行
- 支持结果去重
- 支持重排序
- 支持配置不同通道的权重
- 支持结果来源记录

### C. Agent 路由与工具调用
核心类：
- `AgentOrchestrator` - Agent 编排器
- `IntentRouter` - 意图路由
- `ToolRegistry` - 工具注册表
- `ToolExecutor` - 工具执行器
- `MCPToolExecutor` - MCP 工具执行器
- `ToolCallPlanner` - 工具调用规划器
- `ToolResultMerger` - 工具结果合并

要求：
- 支持"知识问答"和"工具调用"自动分流
- 支持一个问题触发多个工具
- 支持工具失败降级
- 支持工具结果回填到最终答案

### D. 模型路由与故障处理
核心类：
- `ChatModelClient` - 聊天模型客户端
- `EmbeddingModelClient` - Embedding 模型客户端
- `ModelRouter` - 模型路由器
- `ModelHealthChecker` - 模型健康检查
- `CircuitBreaker` - 熔断器
- `FailoverPolicy` - 故障转移策略
- `StreamingCallback` - 流式回调

要求：
- 模型供应商接入标准化
- 失败后自动切换候选模型
- 流式输出统一回调接口
- 首包探测避免半截脏数据

### E. 会话记忆与上下文管理
核心类：
- `ConversationSession` - 会话
- `MessageStore` - 消息存储
- `MemoryWindowManager` - 记忆窗口管理
- `MemorySummarizer` - 记忆摘要器
- `ContextAssembler` - 上下文组装器

### F. 文档入库 Pipeline
核心类：
- `DocumentIngestionPipeline` - 文档摄取流水线
- `IngestionNode` - 摄取节点基类
- `ParseNode` - 解析节点
- `CleanNode` - 清洗节点
- `ChunkNode` - 分块节点
- `EnhanceNode` - 增强节点
- `EmbeddingNode` - 向量化节点
- `IndexWriteNode` - 索引写入节点

要求：
- 节点化编排
- 节点日志可观测
- 单节点失败可定位
- 支持重试

### G. 可观测性与运维能力
增加能力：
- 全链路 Trace ID
- 每个环节耗时统计
- 关键节点输入输出摘要
- Tool 调用日志
- 模型切换日志
- 检索召回日志
- 错误日志结构化
- 慢请求识别

### H. 并发与限流保护
增加能力：
- 用户级限流
- 全局限流
- 并发信号量
- 排队机制
- 超时踢出
- SSE 状态通知
- 防止雪崩和惊群

## 五、设计模式使用指南

- **策略模式**：用于检索通道、重排序器、工具执行器、模型路由策略
- **工厂模式**：用于复杂对象创建、回调构建、模型客户端构建
- **注册表模式**：用于工具注册、节点注册、检索器注册
- **模板方法**：用于入库节点执行骨架
- **责任链模式**：用于后处理器链、降级链
- **装饰器模式**：用于流式输出包装、首包探测
- **观察者模式**：用于事件通知、Trace 钩子

## 六、当前架构概览

### 后端目录结构 (企业级分层架构)
```
backend/src/
├── application/           # 应用编排层
│   ├── ChatOrchestrator.js
│   └── AgentOrchestrator.js
├── domain/                # 核心业务逻辑
│   ├── model/             # 模型抽象
│   ├── rag/               # RAG领域
│   │   └── ingestion/     # 文档摄取Pipeline
│   └── search/            # 检索领域
│       └── channels/      # 多路检索通道
├── infra/                 # 基础设施层
│   ├── circuitBreaker/    # 熔断器实现
│   ├── rateLimiter/       # 限流器实现
│   └── sse/               # SSE基础设施
├── common/                # 通用基础能力
│   └── errors/            # 统一错误体系
├── routes/                # 接口层 (25+ 路由)
├── services/              # 业务逻辑层
│   ├── agent/            # Agent核心服务
│   ├── model/            # 模型客户端
│   ├── rag/              # RAG服务
│   ├── search/           # 检索服务
│   ├── router/           # 模型路由
│   ├── tools/            # 工具实现 (30+)
│   ├── metrics/          # 指标收集
│   └── tracing/          # 追踪服务
├── middleware/           # 中间件
├── utils/                # 工具函数
└── scripts/              # 脚本
```

### 核心服务
| 服务 | 文件 | 职责 |
|------|------|------|
| AgentEngine | `services/agentEngine.js` | Agent执行引擎、ReAct循环 |
| ChatModelClient | `services/model/ChatModelClient.js` | 统一模型客户端接口 |
| MiniMaxRouter | `services/router/modelRouter.js` | MiniMax模型路由 |
| ToolRegistry | `services/tools/toolRegistry.js` | 工具注册与管理 |
| SemanticMemory | `services/SemanticMemory.js` | 语义记忆 |
| RAGService | `services/ragService.js` | 知识检索与注入 |
| ChatOrchestrator | `application/ChatOrchestrator.js` | 聊天编排器 |
| AgentOrchestrator | `application/AgentOrchestrator.js` | Agent编排器 |
| ModelRouter | `domain/model/ModelRouter.js` | 领域模型路由 |
| CircuitBreaker | `infra/circuitBreaker/CircuitBreaker.js` | 熔断器 |
| QueueRateLimiter | `infra/rateLimiter/QueueRateLimiter.js` | 队列限流 |
| FileCheckpointManager | `services/FileCheckpointManager.js` | 检查点持久化 |
| AgentLogger | `services/AgentLogger.js` | 结构化日志 |
| SessionNoteTool | `services/tools/SessionNoteTool.js` | 会话笔记 |

### 已有能力
- ✅ SSE流式响应 + 打字机效果
- ✅ ReAct Agent执行循环
- ✅ 工具注册与调用 (30+工具)
- ✅ 会话记忆管理 (滑动窗口 + 摘要)
- ✅ Token自动摘要管理
- ✅ 取消机制 (asyncio.Event风格)
- ✅ 结构化JSON日志系统
- ✅ 熔断降级 (企业级实现)
- ✅ HITL人机协作确认
- ✅ A2A Agent-to-Agent协议
- ✅ MCP协议集成
- ✅ RAG多路检索与重排序
- ✅ 文档摄取ETL Pipeline
- ✅ 限流中间件
- ✅ 全链路追踪
- ✅ 企业级分层架构 (DDD)
- ✅ 模型抽象层
- ✅ 统一错误体系
- ✅ 探针缓冲SSE回调
- ✅ **问题重写与拆分** (QueryRewrite/QueryDecompose)
- ✅ **意图识别** (5种意图分类 + 澄清机制)
- ✅ **多策略重排序** (CrossEncoder/BM25/Semantic/Diversity)
- ✅ **引用追溯** (CitationAssembler)
- ✅ **Ollama本地向量模型** (mxbai-embed-large)
- ✅ **MetricsCollector** (Prometheus格式)
- ✅ **AlertManager** (critical/warning/info)
- ✅ **ConfigCenter** (配置热更新)
- ✅ **QueueManager** (优先级队列/SSE通知)
- ✅ **管理后台** (知识库/工具/模型/Prompt/追踪)

### Phase 1完成度
- ✅ 分层架构 (application/domain/infra/common)
- ✅ 核心接口抽象 (ChatModelClient)
- ✅ 统一错误处理 (AppError)
- ✅ RAG领域服务 (多路召回、重排序)
- ✅ 熔断器实现 (CircuitBreaker)
- ✅ 限流器实现 (QueueRateLimiter)
- ✅ SSE探针缓冲 (ProbeBufferingCallback)
- ⚠️ 业务逻辑迁移routes→services (进行中)

### Phase 2 & 3 完成度 (2026-04-01)
- ✅ RAG领域服务 (domain/rag/)
  - QueryRewriteService (513行) - 问题重写
  - QueryDecomposeService (662行) - 问题拆分
  - IntentClassifier (749行) - 意图分类 (5种意图)
  - Reranker (828行) - 重排序 (多策略: CrossEncoder/BM25/Semantic/Diversity)
  - CitationAssembler (898行) - 引用组装
- ✅ Agent领域组件 (domain/agent/)
  - IntentRouter (271行) - 意图路由分流
  - ToolExecutor (479行) - 工具执行器抽象
  - MCPToolExecutor (503行) - MCP协议执行器
  - ToolResultMerger (654行) - 多工具结果合并
  - ContextAssembler (552行) - 上下文组装器
- ✅ 基础设施层 (infra/)
  - MetricsCollector (927行) - Prometheus指标采集
  - AlertManager (985行) - 告警管理 (critical/warning/info)
  - ConfigCenter (425行) - 配置中心 (热更新)
  - QueueManager (477行) - 队列管理器 (优先级/SSE通知)
- ✅ 管理后台API (routes/admin/)
  - knowledge.js (346行) - 知识库管理
  - tool.js (359行) - 工具管理
  - model.js (264行) - 模型管理
  - prompt.js (424行) - Prompt模板
  - trace.js (346行) - 链路追踪
- ✅ 管理后台界面 (frontend/src/components/admin/)
  - AdminDashboard.tsx (167行) - 总览仪表盘
  - KnowledgeBase/ (817行) - 知识库管理界面
  - ToolRegistry/ (971行) - 工具注册界面
  - ModelConfig/ (574行) - 模型配置界面
  - PromptTemplate/ (753行) - 模板管理界面
  - TraceViewer/ (834行) - 追踪查看界面
- ✅ Qdrant向量数据库集成 (2026-04-02)
  - QdrantVectorStore.js (340行) - Qdrant客户端
  - QdrantRouter.js (363行) - 向量路由
  - routes/qdrant.js (234行) - Qdrant管理API
  - Docker容器: qdrant/qdrant:latest (端口6333/6334)
- 📊 总计新增: 16,067行代码 (35+ 文件/模块)

## 七、第一阶段优先改造点 (Phase 1)

### 1. 路由层收敛 (P0)
将散落在 routes/ 的业务逻辑提取到 services/，routes 只做参数校验和响应组装。

### 2. 模型抽象层 (P0)
建立 `ChatModelClient` 接口，抽象 MiniMax/其他模型调用。

### 3. 统一错误处理 (P1)
建立错误码体系，统一异常格式，区分业务异常和系统异常。

### 4. 配置中心化 (P1)
将分散的配置收敛到 `config/` 目录，统一管理。

### 5. 日志规范化 (P1)
统一日志格式，添加 traceId 支持，建立日志规范文档。

## 八、面试亮点指南

每个重要改造请补充：
- **为什么企业里需要它**：解决什么问题
- **它解决什么真实问题**：具体业务场景
- **面试里可以怎么讲**：STAR 法则描述

示例：
> "我在项目中实现了 X 功能，使用了 Y 架构设计解决了 Z 问题。具体是这样的...（STAR）"

---

## Wave #8 历史 (2026-06-06)

### Wave #8.1 完成 (3 agent 并行, 4 commit)
- **A11y 修复**: 81→33 违规 (-60%) — de15366
  - `frontend/src/app/agent/page.tsx` 加 `<main>` landmark + `<h1>`
  - `frontend/src/components/agent/MissionControl/MissionControl.tsx` 加 2 aria-label
- **Docker 瘦身**: 镜像 3.17GB → 243MB (-92%) — 353aa03 + 998cb2c
  - 多阶段构建: backend 1.4G→177MB, frontend 1.77G→66MB
  - `.dockerignore` 162 规则 (node_modules / .next / .git / docs / tests)
  - 修复 EACCES bug: chown /app 给 nodejs
- **8 Journey 脚本骨架** — efb0cf7
  - login / hitl / admin / a2a / i18n / mcp / alert / incident
  - `--live` / `--dry-run` 双模式
  - 8 README + 8 占位 PNG

### Wave #8.2 计划 (2 agent 并行)
- **agent_i18n**: 装 next-intl, 抽 200+ zh-CN 字符串, 加 en locale
- **agent_kms_todo**: KMS interface + Local/Vault stub + 清 5 TODO

### Wave #8.3 计划 (主会话亲自做)
- 33 个 a11y 违规修复 (8 critical button-name, 23 serious color-contrast)
- 8 个 journey 真实截图
- Grafana + Prometheus 部署
- 5 类天然边界 (真实登录/多用户/A2A 真实/告警端到端/LLM 成本)

### 累计
- 本会话 commit: 41+ (35 前会话 + 6 当前)
- 镜像减少: 92%
- a11y 修复: 60%
- GATE: 15/15 GO 持续

---

**企业级升级完成日期**: 2026-03-21
**Wave #8 完成日期**: 2026-06-06
