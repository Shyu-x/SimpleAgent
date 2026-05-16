# SimpleAgent - 更新日志

**Sprint #5 完成日期**: 2026-05-16

---

## Sprint #5 变更摘要 (2026-05-16)

### 核心成果

| 类别 | 成果 | 状态 |
|------|------|------|
| **CI/CD 流水线** | Lint/Test/Build/Security/Release 全流程 | ✅ 完成 |
| **许可证** | AGPL-3.0 非商业用途 | ✅ 完成 |
| **文档规范化** | 无 emoji、中英双语 | ✅ 完成 |
| **架构图** | mermaid.ink 生成 | ✅ 完成 |

### CI/CD 修复记录

| 问题 | 根因 | 修复 |
|------|------|------|
| Docker lowercase tag | 仓库名含大写 | `tr '[:upper:]' '[:lower:]'` |
| TypeScript null check | detectIntent() 可能返回 null | 添加 null 检查 |
| Docker standalone 缺失 | next.config.js 未配置 | 添加 `output: 'standalone'` |
| Security scan permissions | SARIF 上传缺少权限 | `security-events: write` + `@v4` |

### 关键配置

- **.github/workflows/ci.yml**: 完整 CI/CD 流水线
- **frontend/next.config.js**: `output: 'standalone'` Docker 支持
- **scripts/generate-diagram.py**: 架构图生成脚本
- **docs/CI-CD-Debug-Report.md**: CI/CD 调试经验报告

---

## Sprint #4 变更摘要 (2026-05-15)

### 核心成果

| 类别 | 成果 | 状态 |
|------|------|------|
| **安全强化** | CSRF防护、请求签名、代码注入修复 | ✅ 完成 |
| **安全加固** | WorkflowEngine/MiniMaxAgentRunner 安全修复 | ✅ 完成 |
| **数据库优化** | 索引优化、查询优化、边界检查 | ✅ 完成 |
| **缓存策略** | Admin 缓存完善 | ✅ 完成 |

### 路由精简成果

| 路由文件 | 之前 | 之后 | 减少 |
|----------|------|------|------|
| `a2a.js` | 518行 | 78行 | **85%** |
| `memory.js` | 257行 | 57行 | **78%** |
| `missionControl.js` | 439行 | 144行 | **67%** |
| `hitl.js` | 306行 | 127行 | **58%** |
| `qdrant.js` | 459行 | 226行 | **51%** |
| `rag.js` | 580行 | 341行 | **41%** |
| `sessions.js` | 300+行 | 精简版 | 完成 |
| `searchEnhanced.js` | 300+行 | 精简版 | 完成 |

### 日志规范化进度

| 模块 | 文件数 | 替换数 | 完成度 |
|------|--------|--------|--------|
| Admin Routes | 5 | 40+ | ✅ 100% |
| Search Tools | 6 | 30+ | ✅ 100% |
| HITL/SSE | 3 | 25+ | ✅ 100% |
| Chat/Memories | 2 | 20+ | ✅ 100% |
| Router | 4 | 15+ | ✅ 100% |
| **总计** | **20+** | **130+** | **21.5%** |

---

## 版本规划

| 版本 | 阶段 | 描述 | 状态 |
|------|------|------|------|
| 1.0.0 | 基础功能 | 初始发布版本 | 已完成 |
| 1.1.0 | Phase 1 | 意图识别+查询改写+混合检索 | 已完成 |
| 1.2.0 | Phase 2 | 模型熔断+候选池+全链路追踪 | 已完成 |
| 1.3.0 | Phase 3 | 智能会话记忆+Token控制 | 已完成 |
| 1.4.0 | Phase 4 | 文档Pipeline | 已完成 |
| 1.5.0 | Phase 5 | 前端追踪面板+性能监控+安全增强 | ✅ 已完成 |
| 1.5.1 | 文档更新 | 文档丰富化，添加完整代码示例 | ✅ 已完成 |
| 1.5.2 | 文档更新 | 版本号和时间更新 | ✅ 已完成 |
| 1.6.0 | 量化分析 | Agent系统量化测试与验证 | ✅ 已完成 |
| 1.7.0 | 多Agent协作 | 工作流编排与执行 | ✅ 已完成 |
| 1.8.0 | 自定义模板 | 自定义工作流模板管理 | ✅ 已完成 |
| 1.9.0 | 持续学习系统 | 语义记忆 + 自动学习 + 技术趋势监控 | ✅ 已完成 |
| 2.0.0 | 全面优化 | A2A协议 + 安全中间件 + 单元测试 + 质量保证 | ✅ 已完成 |
| 2.1.0 | 代码规范化 | Git hooks简化 + 统一错误处理 + 错误码标准化 | ✅ 已完成 |

---

## Sprint #4 详细提交记录 (2026-05-15)

### 提交列表

| 提交 | 描述 | 文件数 |
|------|------|--------|
| `064214a` | chore(husky): simplify git hooks | 65 |
| `2e6e810` | refactor: unify error handling and error codes | 22 |
| `8f9ee9b` | refactor(services): standardize error handling with AppError | 34 |
| `ba3801a` | chore: finalize remaining code changes | 30 |
| `afaebbd` | chore(deps): update dependencies and remove unused dev deps | 4 |

### 主要变更

**1. Git Hooks 简化 (064214a)**
- 移除冗长的输出和颜色代码
- 简化 commit-msg 直接使用 commitlint
- 简化 pre-commit 仅保留必要检查

**2. 统一错误处理 (2e6e810)**
- 新增 sendError/sendSuccess 辅助函数
- 集成 AppError 的统一错误码 (1001-9999)
- 新增 SSE trace 订阅端点

**3. 服务层标准化 (8f9ee9b)**
- AgentEngine 集成指标采集
- 工具执行器使用 AppError
- 集成 AgentLogger 结构化日志

**4. 前端测试与配置 (ba3801a)**
- 新增集成测试文件
- 迁移到 ESLint flat config
- 添加 ErrorBoundary 组件

**5. 依赖更新 (afaebbd)**
- 移除 commitizen (未使用)
- 更新 husky 到 9.1.7
| 2.1.0 | MiniMax单一架构 | 移除多提供商，完全依赖MiniMax Token Plan | ✅ 已完成 |
| 2.2.0 | Phase 2 & 3 完成 | RAG领域服务、Agent领域组件、基础设施层、管理后台API | ✅ 已完成 |
| 2.4.0 | Phase 1架构收尾 | 路由简化、业务逻辑迁移、日志规范化 | ✅ 已完成 |
| 2.3.0 | 架构统一修复 | Bug修复、API路径修正、前后端对接联调 | ✅ 已完成 |
| 2.4.0 | Phase 1架构收尾 | 路由简化、业务逻辑迁移、日志规范化 | ✅ 已完成 |
| 2.4.1 | Bug修复 | 编译错误、样式加载、SSE流式响应完善 | ✅ 已完成 |
| 2.4.2 | 安全强化 | CSRF防护、请求签名、安全代码注入修复 | ✅ 已完成 |
| 2.5.0 | Sprint #5 | API集成测试100%通过、日志规范化、同步改异步 | ✅ 已完成 |

---

## [2.5.0] Sprint #5 优化 (2026-05-15)

### API集成测试 ✅

| 指标 | 数值 |
|------|------|
| 总测试数 | 35 |
| 通过率 | 100% |
| 总耗时 | 0.09s |

**测试覆盖模块**: health, chat, agent, admin, rag, search, metrics, memory, hitl, a2a, mission

### Bug修复 ✅

**AppError.serviceUnavailable 修复**
- **文件**: `src/routes/admin/stats.js` 等
- **问题**: `AppError.serviceUnavailable` 方法不存在
- **修复**: 使用 `Errors.unavailable()` 替代

**fs.promises 导入修复**
- **文件**: `src/routes/admin/stream.js`
- **问题**: `fs.promises` 未正确导入
- **修复**: 正确导入并使用

### 性能优化 ✅

**数据库连接池**
- PostgreSQL 连接池上限: 10 → 50
- **commit**: `e2a517e` - perf(database): increase PostgreSQL connection pool max

**同步改异步**
- `missionService` 同步改异步，避免阻塞事件循环
- **commit**: `85431ff`

**统一缓存**
- Redis + memory fallback 统一导出
- **commit**: `b1f906a`

### 日志规范化完成 ✅

| 模块 | 完成度 |
|------|--------|
| Admin Routes | 100% |
| Search Tools | 100% |
| HITL/SSE | 100% |
| Chat/Memories | 100% |
| Router | 100% |
| ErrorHandler | 100% |
| RateLimiter | 100% |

### 提交记录

| 提交 | 描述 |
|------|------|
| `3f2a90c` | fix(tests): correct health check endpoint |
| `85431ff` | refactor(missionService): 同步改异步 |
| `d62b387` | test(pressure): add performance pressure test |
| `d38535b` | refactor(routes): replace console.* in admin/model and rag |
| `e2a517e` | perf(database): increase PostgreSQL connection pool max |
| `b1f906a` | feat(cache): add unifiedCache export |
| `8ff813d` | refactor(logging): replace console.* in errorHandler and rate-limiter |

---

## [2.4.2] 安全强化 (2026-05-15)

### 安全修复 ✅

#### 高优先级安全修复
- **commit**: `a332b83` - security: comprehensive security hardening fixes

#### WorkflowEngine 安全修复
- **文件**: `backend/src/services/workflowEngine.js`
- **问题**: 使用不安全的 `new Function()` 可能导致代码注入
- **修复**:
  - 添加 `_safeEval()` 使用安全 AST 解析器
  - 仅支持比较运算符 (===, ==, !==, !=, >=, <=, >, <)
  - 字符串转义防止注入攻击

#### MiniMaxAgentRunner 安全修复
- **文件**: `backend/src/services/miniMaxAgentRunner.js`
- **问题**: 命令注入漏洞
- **修复**:
  - 添加 `_isSafeCommand()` 危险模式检测
  - 用 `spawn()` 替换 `exec()` 安全执行命令
  - 添加路径遍历防护
  - 输出大小限制防止 DoS

#### CSRF 防护 (新增)
- **文件**: `backend/src/middleware/security.js`
- **功能**:
  - `csrfMiddleware()` - 状态修改请求验证
  - `csrfTokenGenerator()` - GET 请求 Token 生成
  - 双重提交 Cookie 模式
  - SSE/流式端点豁免

#### 请求签名验证 (新增)
- **功能**:
  - `requestSignatureMiddleware()` - 防止请求篡改
  - HMAC-SHA256 签名 + 时间戳验证
  - 5分钟过期防止重放攻击
  - 时序安全比较防止时序攻击

#### 限流边界检查
- **文件**: `backend/src/services/database.js`
- **修复**:
  - `safeTake`/`safeSkip` 边界检查 (1-1000, >=0)
  - 防止大 LIMIT/OFFSET 导致资源耗尽

### 数据库优化 ✅

- **commit**: `80aae7a` - feat(db-optimization): 添加数据库索引与查询优化
- **commit**: `9e12951` - feat(admin-cache): 完善缓存策略

---

## [2.4.1] Bug修复 + 日志规范化完成 (2026-05-15)

### Bug 修复

#### 前端编译错误修复 ✅
- **文件**: `SafeAdminWrapper.tsx`
  - 修正 ErrorBoundary 导入路径 (`utils/ErrorBoundary`)
- **文件**: `useAdminSSE.ts`
  - 添加泛型支持 `endpoint/parser/interval` 参数
  - 增强 return 类型
- **文件**: `ChatArea.tsx`
  - 添加 Fragment (`<>`) 包裹消息列表和 loading 动画
- **文件**: `FocusModeChat.tsx`
  - 修复 JSX 结构嵌套问题

#### 暗色模式样式修复 ✅
- **文件**: `tailwind.config.js`
  - 添加 `darkMode: 'class'` 配置
  - 确保与 `globals.css` 中的 `.dark` 选择器一致

#### SSE 流式响应完善 ✅
- **文件**: `backend/src/services/sseService.js`
- **变更**:
  - 替换 `console.*` 为 AgentLogger 结构化日志
  - 添加 `detectStreamType()` 统一检测浏览器/Node.js 流类型
  - 拆分 `_handleBrowserStream`/`_handleNodeStream`/`_processBuffer` 独立方法
  - 增强中文内容处理：JSON解析失败时保留原始数据
  - 添加 `error` 类型处理分支
  - 添加 `stream.on('error')` 错误处理

### 日志规范化完成 ✅

#### Admin Routes 日志替换
- **commit**: `38a7a95` - fix(routes): replace console.* with AgentLogger in all admin routes
- **文件**: `routes/admin/knowledge.js`, `routes/admin/tool.js`, `routes/admin/model.js`
- **覆盖**: 40+ console.* → AgentLogger

#### Search Tools 日志替换
- **commit**: `f3fa0bf` - refactor(services): replace console.* with AgentLogger in search tools
- **文件**: `services/tools/` 下多个搜索工具
- **覆盖**: 30+ console.* → AgentLogger

#### HITL/SSE 日志替换
- **commit**: `ddac2be` - fix(routes): replace console.* with AgentLogger in hitlSSE, chat, memories
- **文件**: `routes/hitlSSE.js`, `routes/chat.js`, `routes/memories.js`
- **覆盖**: 25+ console.* → AgentLogger

#### 路由简化完成
- **commit**: `7be1a92` - refactor(routes): simplify metrics.js, minimaxMcp.js, mcp.js
- **commit**: `b7a032b` - refactor(routes): simplify search.js, proxy.js, multiAgentEngine.js
- **成果**: 8个路由文件大幅精简 (平均减少50%+)

### Admin SSE 推送完善

| 端点 | 功能 | 状态 |
|------|------|------|
| `/api/admin/sse/knowledge` | 知识库实时推送 | ✅ 完成 |
| `/api/admin/sse/tools` | 工具注册实时推送 | ✅ 完成 |
| `/api/admin/sse/models` | 模型配置实时推送 | ✅ 完成 |
| `/api/admin/sse/prompts` | Prompt模板实时推送 | ✅ 完成 |
| `/api/admin/sse/trace` | 链路追踪实时推送 | ✅ 完成 |

---

## [2.4.0] Phase 1架构收尾 (2026-04-27)

### 架构优化

#### 路由文件精简 ✅
| 文件 | 之前 | 之后 | 减少 |
|------|------|------|------|
| `routes/a2a.js` | 518行 | 78行 | 85% |
| `routes/rag.js` | 580行 | 341行 | 41% |
| `routes/qdrant.js` | 459行 | 226行 | 51% |
| `routes/missionControl.js` | 439行 | 144行 | 67% |
| `routes/memory.js` | 257行 | 57行 | 78% |
| `routes/hitl.js` | 306行 | 127行 | 58% |

#### 业务逻辑迁移 ✅
- **HITL服务化**: `HitlService.js` 新增 `setupSSEConnection()` 方法
- **内存存储服务**: 创建 `services/memoryStore.js` (329行)，承接 memory.js 业务逻辑
- **A2A服务增强**: `services/a2aService.js` 提取 SSE 订阅逻辑

#### 新增基础设施 ✅
- **`common/middleware/validate.js`** (57行) - 通用验证中间件
  - 支持 body/query/params 三种验证来源
  - 支持 Joi schema 和简单规则对象
- **`schemas/hitl.js`** (52行) - HITL 参数验证规则定义
- **`infra/logger/AgentLogger.js`** - 结构化日志服务
  - JSON 格式日志输出
  - 多级别日志 (DEBUG, INFO, WARN, ERROR, FATAL)
  - 文件轮转 (10MB max, 5 files)
  - Trace ID 支持

#### 日志规范化 (进行中) ✅
- **已完成**: 113/525 console.* 替换为 AgentLogger (21.5%)
- **已处理文件**:
  - `services/vector/QdrantVectorStore.js` (29处)
  - `routes/missionControl.js` (16处)
  - `routes/rag.js` (13处)
  - `services/statePersistence.js` (12处)
  - `services/FileCheckpointManager.js` (11处)
  - `routes/conversations.js` (11处)
  - 其他 4 个文件
- **剩余**: 412 处待处理

#### 单元测试 ✅
- **测试结果**: 245/245 测试全部通过
- **测试套件**: 4 passed, 4 total

---

## [2.3.0] 架构统一修复 (2026-04-03)

### Bug修复

#### Bug 11: MissionControl 后端API完全缺失 ✅
- 问题：MissionControl组件使用纯前端Zustand store，无后端API连接
- 修复：创建 `routes/missionControl.js`，实现任务队列、Agent状态同步、任务分配功能

#### Bug 12: PerformanceMonitor 完全使用模拟数据 ✅
- 问题：PerformanceMonitor组件使用setTimeout和Math.random()模拟数据
- 修复：实现Metrics API对接Prometheus格式真实指标数据

#### Bug 13: KnowledgeBase API路径不匹配 ✅
- 问题：前端调用 `/documents/*` 但后端路由是 `/docs/*`
- 修复：前端所有路径已修正为 `/api/admin/knowledge/docs`

#### Bug 14: ToolRegistry API路径/参数不匹配 ✅
- 问题：工具启用/禁用、分类列表、注册、测试等功能API路径与后端不一致
- 修复：
  - `/tools/categories` → `/tools/categories/list`
  - POST `/tools` → POST `/tools/register`
  - PATCH → PUT
  - POST `/tools/test` → POST `/tools/${selectedTool}/test`

#### Bug 15: AdminDashboard Stats API缺失 ✅
- 问题：AdminDashboard调用 `GET /api/admin/stats` 但后端无此路由
- 修复：创建 `routes/admin/stats.js`，实现统计API

#### Bug 16: ModelConfig API缺失/响应结构不匹配 ✅
- 问题：ModelConfig组件调用API但后端响应结构不匹配
- 修复：
  - GET `/` 响应结构修正
  - GET `/stats` 响应结构修正
  - PATCH `/:name` 新增端点
  - POST `/:name/circuit-breaker` 新增端点

#### Bug 17: IntentTreeEditor API缺失 ✅
- 问题：IntentTreeEditor调用意图树CRUD API但后端未实现
- 修复：创建 `routes/admin/intent.js`，实现意图树CRUD

#### Bug 18: MemoryPanel 后端API缺失 ✅
- 问题：MemoryPanel组件无后端同步，所有记忆存储在localStorage
- 修复：创建 `routes/memory.js`，实现14个API端点

#### Bug 19: ChatInput 意图检测Banner空实现 ✅
- 问题：IntentSuggestionBanner的onAccept是空实现
- 修复：在onAccept中调用 `setAppMode('agent')`

#### Bug 20: PromptTemplate 路径不匹配 ✅
- 问题：前端调用 `/api/admin/prompts` 但后端是 `/api/admin/prompt`
- 验证：经检查后端路由已正确挂载为 `/api/admin/prompts`

### 其他修复

| Bug | 描述 | 修复 |
|-----|------|------|
| Bug 8 | 默认模型名称错误 | `MiniMax-M2.7-highspeed` → `MiniMax-M2.7` |
| Bug 9 | RAG余弦相似度NaN | 添加除零和NaN检查 |
| Bug 10 | 工具系统缺少保护 | 添加executeWithTimeout和参数验证 |

### 前后端对接联调

- 前端：`frontend/src/lib/apiConfig.ts` API路径修正
- Backend-Nest：TypeScript编译错误修复（60+错误 → 0错误）
- Backend-Nest：依赖注入配置修复（工厂提供者模式）

---

## [2.2.0] Phase 2 & 3 完成 (2026-04-01)

### 架构升级

#### Phase 2: RAG核心能力增强 ✅
- **RAG领域服务** (domain/rag/)
  - QueryRewriteService (513行) - 问题重写
  - QueryDecomposeService (662行) - 问题拆分
  - IntentClassifier (749行) - 意图分类 (5种意图)
  - Reranker (828行) - 多策略重排序
  - CitationAssembler (898行) - 引用组装

#### Phase 3: Agent核心能力增强 ✅
- **Agent领域组件** (domain/agent/)
  - IntentRouter (271行) - 意图路由分流
  - ToolExecutor (479行) - 工具执行器抽象
  - MCPToolExecutor (503行) - MCP协议执行器
  - ToolResultMerger (654行) - 多工具结果合并
  - ContextAssembler (552行) - 上下文组装器

#### 基础设施层 (infra/) ✅
- MetricsCollector (927行) - Prometheus指标采集
- AlertManager (985行) - 告警管理
- ConfigCenter (425行) - 配置中心热更新
- QueueManager (477行) - 优先级队列/SSE通知

#### 管理后台API (routes/admin/) ✅
- knowledge.js (346行) - 知识库管理
- tool.js (359行) - 工具管理
- model.js (264行) - 模型管理
- prompt.js (424行) - Prompt模板
- trace.js (346行) - 链路追踪

#### 管理后台界面 (frontend/src/components/admin/) ✅
- AdminDashboard.tsx (167行) - 总览仪表盘
- KnowledgeBase/ (817行) - 知识库管理界面
- ToolRegistry/ (971行) - 工具注册界面
- ModelConfig/ (574行) - 模型配置界面
- PromptTemplate/ (753行) - 模板管理界面
- TraceViewer/ (834行) - 追踪查看界面

### Ollama向量模型集成 ✅
- OllamaRouter.js (149行) - Ollama路由封装
- routes/ollama.js (321行) - Ollama管理API
- docker-compose.yml - GPU/CPU自动检测配置
- Ollama部署指南.md - 部署文档

### Qdrant向量数据库集成 ✅
- QdrantVectorStore.js (340行) - Qdrant客户端
- QdrantRouter.js (363行) - 向量路由
- routes/qdrant.js (234行) - Qdrant管理API
- Docker容器: qdrant/qdrant:latest (端口6333/6334)

### 代码统计
- 总计新增: 16,067行代码 (35+ 文件/模块)

### Agent评估结果 (2026-04-01)
| 维度 | 评分 | 权重 |
|------|------|------|
| **总分** | **87/100** | - |
| **评级** | **A级 - 优秀** | - |
| RAG检索 | 98 | 15% |
| 工具调用 | 94 | 20% |
| 上下文保持 | 90 | 10% |
| 基础对话 | 88 | 15% |

---

## [2.1.0] MiniMax单一架构 (2026-03-20)

### 架构变更

#### 移除多提供商支持
- **原因**: 简化架构，提高统一性和体验
- **影响**: 完全依赖 MiniMax Token Plan API

#### 前端简化
- `frontend/src/types/index.ts` - 只保留 MiniMax 模型
- `frontend/src/lib/modelConfig.ts` - 简化为 MiniMax 配置
- `frontend/src/components/MultiModelConfig.tsx` - 简化为 MiniMaxConfigPanel
- `frontend/src/store/chatStore.ts` - 简化 API Key 验证

#### 后端简化
- `backend/src/routes/proxy.js` - 简化为 MiniMax 代理
- `backend/src/services/router/modelRouter.js` - 简化为 MiniMaxRouter
- `backend/src/services/agentEngine.js` - 默认使用 MiniMax
- `backend/src/services/llmIntentClassifier.js` - 默认使用 MiniMax

#### 支持的 MiniMax 模型
| 模型 | 说明 | Token限制 |
|------|------|-----------|
| MiniMax-M2.7 | 旗舰编程版（默认） | 100K |
| MiniMax-M2.5 | 标准版 | 100K |
| MiniMax-M2.5 | 标准版 | 100K |
| MiniMax-VL-01 | 多模态版 | 32K |
| MiniMax-Text-01 | 长文本版 | 400K |

### 环境变量变更
```bash
# 移除的环境变量
# OPENAI_API_KEY
# ANTHROPIC_API_KEY
# DEEPSEEK_API_KEY
# GOOGLE_API_KEY
# ZHIPU_API_KEY

# 保留的环境变量
MINIMAX_API_KEY=your_token_plan_api_key  # 必需
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic  # 可选
```

### 文档更新
- `CLAUDE.md` - 添加 MiniMax 单一架构说明
- `CHANGELOG.md` - 添加 v2.1.0 版本记录

---

## [2.0.0] 全面优化 (2026-03-20)

### 新增功能

#### 1. A2A (Agent-to-Agent) 协议支持 ✅
- **文件**: `backend/src/routes/a2a.js`, `backend/src/services/a2aService.js`
- **功能**:
  - Agent 注册与心跳检测
  - 消息传递与任务委托
  - SSE 实时订阅
  - 任务状态管理

#### 2. 安全中间件 ✅
- **文件**: `backend/src/middleware/security.js`
- **功能**:
  - IP 速率限制 (100请求/分钟)
  - 请求体大小限制 (10MB)
  - CORS 配置
  - 安全响应头

#### 3. 单元测试框架 ✅
- **文件**: `backend/tests/unit/`
- **覆盖**:
  - HITL 检查点管理
  - A2A 协议
  - API 路由

#### 4. 性能监控升级 ✅
- **文件**: `frontend/src/components/agent/PerformanceMonitor.tsx`
- **功能**:
  - SVG 迷你折线图和柱状图
  - 性能告警系统
  - 优化建议分析

#### 5. HITL 确认增强 ✅
- **文件**: `frontend/src/components/agent/HumanConfirmationDialog.tsx`
- **功能**:
  - 风险等级颜色编码
  - 倒计时进度条
  - 键盘快捷键
  - 类似操作跳过

#### 6. 工作流模板系统 ✅
- **文件**: `frontend/src/components/agent/WorkflowEditor.tsx`
- **模板**:
  - 论文阅读助手
  - 代码审查流程
  - 数据分析流程
  - 写作助手流程

### 修复的Bug

| Bug | 文件 | 修复 |
|-----|------|------|
| 后端模块路径错误 | `agentEngine.js` | `../../hitl` → `../routes/hitl` |
| 渲染期访问ref | `useAgentSSE.ts` | 添加useState管理 |
| 接口缺少字段 | `useHITLSSE.ts` | 添加reconnect等 |
| totalTokens不存在 | `PerformanceMonitor.tsx` | 改用input+outputTokens |
| useCallback未导入 | `Settings.tsx` | 添加导入 |

### 安全增强
- ✅ 速率限制 (100请求/分钟/IP)
- ✅ 输入大小限制 (10MB)
- ✅ CORS 配置
- ✅ 安全响应头 (X-Content-Type-Options, X-Frame-Options 等)

### 质量保证
- ✅ TypeScript: 0 errors
- ✅ ESLint: 0 errors
- ✅ 后端语法检查: 全部通过
- ✅ 单元测试: 3个测试文件

---

## [1.9.0] 持续学习系统 (2026-03-20)

### 新增功能

#### 1. FileCheckpointManager - 文件系统持久化检查点 ✅
- **文件**: `backend/src/services/FileCheckpointManager.js`
- **功能**:
  - 文件系统持久化检查点存储
  - 自动清理过期检查点（TTL）
  - 元数据管理（版本、时间戳、摘要）
  - 跨会话恢复支持
  - 完整状态序列化/反序列化
- **API端点**:
  - `POST /api/multiagent/engine/:sessionId/checkpoint` - 创建检查点
  - `GET /api/multiagent/engine/:sessionId/checkpoint` - 获取检查点
  - `DELETE /api/multiagent/engine/:sessionId/checkpoint` - 删除检查点
  - `GET /api/multiagent/engine/:sessionId/checkpoints` - 列出所有检查点

#### 2. SemanticMemory - 双层语义记忆系统 ✅
- **文件**: `backend/src/services/SemanticMemory.js`
- **功能**:
  - 短期记忆（工作内存）+ 长期记忆（持久化）
  - 多种嵌入支持（OpenAI嵌入/本地嵌入/模拟嵌入）
  - 语义搜索（余弦相似度）
  - 自动记忆提升（短期 → 长期）
  - 记忆摘要与压缩
  - 持久化存储（JSON文件）
- **API端点**:
  - `POST /api/multiagent/engine/:sessionId/memory/add` - 添加记忆
  - `GET /api/multiagent/engine/:sessionId/memory/search` - 语义搜索
  - `GET /api/multiagent/engine/:sessionId/memory/stats` - 获取统计信息
  - `DELETE /api/multiagent/engine/:sessionId/memory` - 清除记忆

#### 3. ContinuousLearning - 自动学习系统 ✅
- **文件**: `backend/src/scripts/ContinuousLearning.js`
- **功能**:
  - 自动搜索GitHub热门AI项目
  - 分析技术趋势（Agent框架、React Agent、MCP协议等8大领域）
  - 生成Markdown格式趋势报告
  - 定时执行（每10分钟自动运行）
- **输出**: `docs/learning/技术趋势报告.md`
- **定时任务**: 每10分钟执行 (任务ID: 00b27f20)

### Bug修复

| Bug ID | 描述 | 修复版本 |
|--------|------|----------|
| 函数重复 | agentEngine.js中act()函数重复定义 | 1.9.0 |
| JSON解析 | _parseJSONResponse()解析失败静默返回空对象 | 1.9.0 |

### 新增文件
```
backend/src/services/
├── FileCheckpointManager.js    # 文件检查点持久化管理
└── SemanticMemory.js           # 双层语义记忆系统

backend/src/scripts/
└── ContinuousLearning.js       # 持续学习脚本

docs/
├── 六层架构技术栈详解.md        # 技术栈完整分析
├── 功能验证与持续改进报告.md   # 测试与改进报告
├── Agent架构批判性分析与优化方案.md  # 架构分析与优化
└── learning/
    └── 技术趋势报告.md          # 自动生成的趋势报告
```

### 文档更新
- **持续改进检查清单**: 更新检查项、标记已完成P0/P1任务
- **持续优化日志**: 记录第一轮优化完成情况
- **CLAUDE.md**: 添加持续优化机制说明

### 技术趋势监控领域
1. Agent框架 (langgraph, langchain)
2. React Agent (react AI agent workflow)
3. MCP协议 (mcp model context protocol)
4. 浏览器Agent (browser automation AI agent)
5. 多Agent协作 (multi-agent collaboration)
6. 最新React技术 (react-19, next.js-16)
7. Zustand状态管理 (zustand state management)
8. TypeScript最佳实践 (typescript best practices)

### 参考开源项目
| 项目 | Stars | 借鉴要点 |
|------|-------|----------|
| LangGraph | 26.8k | 状态机、检查点 |
| DeerFlow | 31.8k | Sandbox、记忆、技能 |
| LobeHub | 73.9k | 多Agent协作 |
| ChatDev | 31.7k | 软件开发Agent |
| GenAI Agents | 20.6k | 教程、最佳实践 |

---

## [1.8.0] 自定义工作流模板管理 (2026-03-18)

### 新增功能

#### 自定义工作流模板编辑器
- **完整模板管理界面**: `WorkflowTemplateEditor.tsx` - 可视化模板编辑器
  - 创建、编辑、删除自定义模板
  - 模板导入/导出功能（JSON格式）
  - 预设模板快速创建
  - Agent和Task可视化配置
  - 任务依赖关系配置
  - 使用统计追踪

#### 增强的状态管理
- **持久化服务**: `workflowPersistence.ts` - 高可用性支持
  - 工作流自动保存
  - 执行历史记录
  - 检查点管理
  - 数据导入/导出
  - 自动清理过期数据

#### 真正的SSE实时更新
- **SSE客户端**: `useRealAgentSSE.ts` - 实时事件推送
  - EventSource实时连接
  - 自动重连机制
  - 心跳保活
  - 多通道支持

#### 完整功能测试
- **测试脚本**: `tests/multiagent_test_full.js` - 全面的功能测试
  - 18个测试用例，覆盖所有核心功能
  - 后端健康检查
  - 模板管理API
  - 引擎生命周期
  - 任务执行测试
  - 错误处理测试
  - 记忆系统测试
  - Crew系统测试
  - 前端集成测试
  - 性能测试

### 后端API增强
- 添加 `/api/multiagent/engine/:sessionId/checkpoint` - 检查点创建
- 添加 `/api/multiagent/engine/:sessionId/memory/stats` - 记忆统计
- 添加 `/api/multiagent/crew/:crewId/execute` - Crew执行
- 添加 `/api/multiagent/crew/:crewId/status` - Crew状态
- 统一API响应格式

### 测试结果
| 测试类别 | 通过率 |
|---------|--------|
| 后端健康检查 | 100% |
| 模板管理API | 100% |
| 引擎生命周期 | 100% |
| 任务执行测试 | 100% |
| 错误处理测试 | 100% |
| 记忆系统测试 | 100% |
| Crew系统测试 | 100% |
| 前端集成测试 | 100% |
| 性能测试 | 100% |
| **总计** | **100% (18/18)** |

### 新增文件
```
frontend/src/
├── components/
│   └── WorkflowTemplateEditor.tsx   # 工作流模板编辑器
├── hooks/
│   └── useRealAgentSSE.ts           # SSE实时更新
└── lib/
    └── workflowPersistence.ts        # 持久化服务

backend/src/routes/
└── multiagent.js                    # 新增兼容端点

tests/
└── multiagent_test_full.js          # 完整功能测试
```

---

## [1.7.0] 多Agent协作平台 (2026-03-18)

### 新增功能

#### 前端工作流管理
- **Zustand 状态管理**: `agentWorkflowStore.ts` - 完整的工作流状态管理
  - 工作流定义（agents, tasks, 流程类型）
  - 执行状态跟踪（进度、错误、确认请求）
  - 实时事件处理
- **API 客户端**: `agentWorkflowAPI.ts` - 与后端多Agent系统通信
  - 引擎创建与管理
  - 任务执行与控制（暂停/恢复/停止）
  - 检查点管理
  - 人机确认系统
  - Crew 系统支持
- **SSE 实时更新**: `useAgentSSE.ts` - 实时接收执行事件
- **工作流执行服务**: `workflowExecutionService.ts` - 完整的工作流编排
  - 顺序执行、并行执行、层级执行
  - 任务依赖管理
  - 错误处理与恢复
  - 自动检查点保存

#### 增强的多Agent面板
- **任务输入对话框**: 执行前输入任务内容
- **后端连接状态指示**: 实时显示后端健康状态
- **暂停/恢复/停止控制**: 执行过程中完整控制
- **后端 API 集成**: 与后端 Agent Engine 深度集成
- **执行日志**: 实时显示任务执行状态

#### 测试脚本
- **功能测试**: `tests/multiagent_test.js` - 验证多Agent系统 API

### 文件结构
```
frontend/src/
├── hooks/
│   ├── useAgentSSE.ts          # SSE 实时更新 Hook
│   └── useWorkflowExecution.ts  # 工作流执行 Hook
├── lib/
│   ├── agentWorkflowAPI.ts      # API 客户端
│   └── workflowExecutionService.ts # 工作流执行服务
└── store/
    └── agentWorkflowStore.ts   # Zustand 状态管理
```

---

## [1.6.0] 量化分析与验证 (2026-03-18 04:40)

### 版本更新
- 新增量化分析脚本: `backend/tests/量化分析_runner.js`
- 17组对照实验设计（意图分类5组+工具选择4组+性能3组+错误处理3组+并行2组）
- 直接API调用 vs Agent系统对比实验

### 量化分析结果

#### 实验1: 意图分类对比（5组）
| 组别 | 准确率 | F1分数 |
|------|--------|--------|
| 仅关键词匹配 | **70.0%** | 71.4% |
| LLM + 关键词混合 | 58.6% | 62.7% |
| 仅LLM | 58.6% | 62.7% |
| LLM高置信度+关键词后备 | 58.6% | 61.5% |
| 纯规则 | 44.3% | 47.4% |

#### 实验2: 工具选择对比（4组）
| 组别 | 准确率 |
|------|--------|
| 关键词匹配 | **90.0%** |
| LLM语义选择 | 75.0% |
| 混合(语义+关键词) | 75.0% |
| 描述匹配 | 60.0% |

#### 实验3: 性能基准（3组）
| 组别 | 平均延迟 |
|------|----------|
| 关键词匹配 | **0.00ms** |
| LLM小模型 (gpt-4o-mini) | 91.70ms |
| LLM大模型 (gpt-4o) | 208.90ms |

#### 实验6: 直接API调用 vs Agent系统对比（核心）
| 模式 | 平均延迟 | 工具调用率 | 延迟增量 |
|------|----------|------------|----------|
| 直接API调用 | 154.8ms | 0% | baseline |
| 智能工具增强 | 107.0ms | 44% | -30.9% |
| Agent系统完整流程 | 186.6ms | 32% | +20.5% |

#### 关键发现
1. **延迟开销可控**: Agent系统增加约32ms延迟（+20.5%）
2. **工具调用能力**: Agent系统可自动调用工具（32-44%使用率），直接API为0
3. **任务理解提升**: 智能增强准确率78% vs 直接API 64%

### 核心结论
- 关键词匹配在意图分类和工具选择上表现最佳（70%/90%准确率）
- LLM语义理解准确率略低，可能是Mock测试的局限性
- Agent系统相比直接API调用有显著优势：
  - 自动工具调用能力
  - 任务理解能力提升14%
  - 延迟开销可控（<200ms）
- 并行执行加速比: 3.33x

### 新增文件
- `backend/tests/量化分析_runner.js` - 量化分析测试脚本
- `backend/tests/量化分析结果/` - 测试结果输出目录

---

## [1.5.2] 文档更新 (2026-03-18 00:00)

### 版本更新
- 更新所有文档版本号和更新时间
- AI-Chat开发手记.md → v3.2
- 架构设计方案.md → v1.4
- 功能测试文档.md → v1.5.2
- 源码详细分析报告.md → v4.2

---

## [1.5.1] 文档更新 (2026-03-17)

### 文档优化

#### 文档清理
- 删除过时文档 (AGENTS.md, GEMINI.md)
- 删除散乱截图文件 (9个)
- 删除过时测试目录 (6个)
- 清理docs子目录过时文档
- 将测试数据移至tests目录

#### 文档丰富化
- **AI-Chat开发手记.md** (v3.1)
  - 添加完整代码示例 (Zustand, SSE, ChatArea, MarkdownRenderer)
  - 新增核心技术系统详解 (意图识别、查询改写、混合检索、模型池、智能记忆)
  - 新增性能优化经验、Bug修复全过程、测试经验总结

- **架构设计方案.md** (v1.3)
  - 添加后端路由实现代码 (chat.js, proxy.js, sessions.js, mcp.js, router.js, multiagent.js)
  - 添加服务层代码 (tracing.js, cacheService.js, logger.js, modelPool.js, smartMemory.js)
  - 添加中间件代码 (rateLimiter.js)
  - 新增安全性设计、性能与可靠性、监控运维章节

- **功能测试文档.md** (v1.5.1)
  - 添加测试Runner代码
  - 添加量化测试、压测、参数评估详情

- **源码详细分析报告.md** (v4.1)
  - 添加前后端源码详细分析
  - 添加代码结构图表

---

## [1.5.0] 已完成 (2026-03-17)

### Phase 4: 文档Pipeline

#### P4-1: 文档摄取Pipeline系统 ✅
- **文件**: `backend/src/services/ingestion/pipeline.js` (新建)
- **新增功能**:
  - DocumentPipeline 类，支持多种文档格式解析
  - 支持格式: PDF, Markdown, TXT, HTML
  - 多种分块策略: fixed (固定大小), sentence (按句子), paragraph (按段落)
  - 可配置 chunkSize 和 chunkOverlap
  - 支持自定义解析器和分块器注册
  - 每个chunk包含: id, content, metadata (source, type, index, totalChunks)
- **使用示例**:
  ```javascript
  const { DocumentPipeline } = require('./services/ingestion/pipeline');
  const pipeline = new DocumentPipeline({ chunkSize: 500, chunkOverlap: 50 });
  const chunks = await pipeline.process('document.md', { chunker: 'paragraph' });
  ```

### Phase 3: 智能会话记忆

#### P3-1: 智能会话记忆系统 ✅
- **文件**: `backend/src/services/smartMemory.js` (新建)
- **新增功能**:
  - 滑动窗口记忆管理 (maxWindowSize, summaryThreshold)
  - 自动摘要压缩 (compress, extractKeyPoints)
  - 上下文管理 (getContext, getSession)
  - 会话统计 (getStats, clearSession)

#### P3-2: Token控制系统 ✅
- **文件**: `backend/src/services/tokenCounter.js` (新建)
- **新增功能**:
  - Token估算（支持中文/英文比率：中文1.5/汉字，英文1.3/字符）
  - 消息格式开销计算（每条消息+4 tokens，消息间隔+3 tokens）
  - 成本估算 (美元/百万tokens)
  - 每日/每月Token使用限制检查
  - 使用量按会话记录统计
- **支持模型定价**:
  - gpt-4o: $5.00 / $15.00 (输入/输出)
  - gpt-4o-mini: $0.15 / $0.60
  - claude-opus-4-6: $15.00 / $75.00
  - claude-sonnet-4-6: $3.00 / $15.00
  - claude-haiku-4-5: $0.25 / $1.25
  - deepseek-chat: $0.14 / $0.28
  - glm-4: $0.05 / $0.05
  - abab6.5s-chat: $0.20 / $0.20
- **API**:
  - `estimateTokens(text, language)` - 估算Token数量
  - `estimateMessageTokens(messages)` - 计算整组消息Token数
  - `calculateCost(inputTokens, outputTokens, model)` - 计算成本
  - `recordUsage(sessionId, inputTokens, outputTokens)` - 记录使用量
  - `checkLimit(sessionId)` - 检查是否超限
  - `getStats(sessionId)` - 获取统计信息

### Phase 2: 稳定性增强

#### P2-1: 模型熔断系统 ✅
- **安装**: `npm install opossum --save`
- **文件**: `backend/src/utils/circuitBreakerExample.js` (示例)
- **新增功能**:
  - opossum 熔断库，用于实现模型熔断功能
  - 支持 CLOSED → OPEN → HALF_OPEN 状态转换
  - 熔断触发条件：错误率超过50%或连续失败5次
  - 可配置超时时间和重置超时

#### P2-2: 全链路追踪系统 ✅
- **安装**: `npm install uuid --save`
- **文件**: `backend/src/services/tracing.js` (新建)
- **新增功能**:
  - 基于 OpenTracing 风格的追踪服务
  - 使用 uuid 生成唯一 traceId
  - 追踪每个请求的: method, url, status, duration, error
  - 通过 HTTP Header (x-trace-id, x-span-id) 传递 traceId 实现分布式追踪
  - 自动内存清理 (最多保留1000条追踪记录)
  - 统计接口: total, completed, avgDuration, errorRate
- **集成**:
  - 在 `backend/src/index.js` 中集成 tracingMiddleware
  - 每个响应自动添加 X-Trace-Id header

#### P2-3: 模型候选池 ✅
- **文件**: `backend/src/services/modelPool.js` (新建)
- **新增功能**:
  - 模型注册与管理 (registerModel, removeModel)
  - 基于优先级和健康分数的智能模型选择 (selectModel)
  - 失败率跟踪和自动降级 (markFailure, markSuccess)
  - 延迟统计和性能监控 (getAverageLatency, getHealthScore)
  - 冷却期机制防止频繁切换 (cooldownPeriod)
  - 事件监听机制 (on, emit, off)
  - 配置导出功能 (exportConfig)
- **API端点**:
  - `GET /api/router/pool/status` - 获取模型池状态
  - `GET /api/router/pool/stats` - 获取模型池统计
  - `POST /api/router/pool/select` - 选择最佳模型
  - `POST /api/router/pool/request/start` - 标记请求开始
  - `POST /api/router/pool/request/success` - 标记请求成功
  - `POST /api/router/pool/request/failure` - 标记请求失败
  - `GET /api/router/pool/fallback/:modelId` - 获取备用模型
  - `POST /api/router/pool/models/:modelId/enable` - 启用模型
  - `POST /api/router/pool/models/:modelId/disable` - 禁用模型
  - `POST /api/router/pool/models` - 注册新模型
  - `DELETE /api/router/pool/models/:modelId` - 移除模型
  - `POST /api/router/pool/models/:modelId/reset` - 重置模型统计
  - `POST /api/router/pool/health-check` - 手动触发健康检查
  - `GET /api/router/pool/export` - 导出模型池配置

---

## [1.5.0] 已完成 (2026-03-17)

### Phase 5: 前端增强与性能优化

#### P5-1: 前端追踪面板 ✅
- **文件**: `frontend/src/components/TraceViewer.tsx` (新建)
- **新增功能**:
  - 可视化追踪面板组件
  - 实时请求统计展示 (总请求/已完成/平均耗时/错误率)
  - 自动刷新功能 (可配置间隔)
  - Trace ID 复制功能
  - 响应状态颜色标识
  - 请求详情展开查看

#### P5-2: 缓存服务 ✅
- **安装**: `npm install node-cache --save`
- **文件**: `backend/src/services/cacheService.js` (新建)
- **新增功能**:
  - 内存缓存服务 (基于 node-cache)
  - TTL 过期机制
  - 批量操作支持 (mset, mget)
  - 命中率统计
  - 键数量限制

#### P5-3: 限流服务 ✅
- **安装**: `npm install express-rate-limit express-slow-down --save`
- **文件**: `backend/src/middleware/rateLimiter.js` (新建)
- **新增功能**:
  - 全局限流 (15分钟100次)
  - 登录限流 (15分钟5次)
  - API限流 (1分钟60次)
  - 聊天限流 (1分钟10次)
  - 慢速模式 (连续请求减速)
  - 可配置自定义限流器

#### P5-4: 日志服务 ✅
- **安装**: `npm install winston --save`
- **文件**: `backend/src/services/logger.js` (新建)
- **新增功能**:
  - Winston日志集成
  - 多级别日志 (error, warn, info, http, debug)
  - 多输出目标 (控制台、文件)
  - 日志分割 (按日期/大小)
  - 异常捕获
  - HTTP请求日志

#### P5-5: 性能监控面板 ✅
- **文件**: `frontend/src/components/PerformanceDashboard.tsx` (新建)
- **新增功能**:
  - 实时性能监控面板
  - 运行时间统计
  - 请求计数和响应时间
  - 内存使用可视化
  - 响应时间趋势图表 (基于 Recharts)
  - P95响应时间指标
  - 自动刷新功能

### Phase 1: 基础架构增强

#### P1-1: 意图识别系统 ✅
- **文件**: `backend/src/services/router/taskClassifier.js`
- **新增功能**:
  - 树形意图分类 (INTENT_TYPES)
  - 5大主类目: 知识库查询、工具调用、日常对话、创意生成、任务执行
  - 子意图细分 (code, document, search, weather, greeting等)
  - 置信度阈值检测 (HIGH: 0.8, MEDIUM: 0.5, LOW: 0.3)
  - 歧义处理与确认消息生成
  - 执行动作判定 (tool_call, knowledge_retrieval, content_generation等)
- **API端点**:
  - `POST /api/router/intent` - 意图分类
  - `GET /api/router/intents` - 获取所有意图类型

#### P1-2: 查询改写系统 ✅
- **文件**: `backend/src/services/queryRewriter.js` (新建)
- **新增功能**:
  - 上下文补全 (completeContext)
  - 复杂查询分解 (decompose)
  - 实体与话题提取
  - 历史消息上下文引用检测
- **API端点**:
  - `POST /api/router/rewrite` - 查询改写

#### P1-3: 混合检索系统 ✅
- **文件**: `backend/src/services/hybridSearch.js` (新建)
- **新增功能**:
  - 多通道并行检索 (向量 + 全文 + 意图)
  - 加权分数合并
  - 互惠排名融合 (RRF) 重排序
  - LLM 重排扩展接口
  - 查询词匹配增强
- **API端点**:
  - `POST /api/router/search` - 混合检索
  - `GET /api/router/search/config` - 获取检索配置

---

## [1.0.0] 初始版本 (2026-03-14)

### 核心功能

#### 聊天系统
- SSE流式响应
- 打字机效果
- 多平台API支持 (OpenAI, Anthropic, Google, 智谱AI, MiniMax, DeepSeek)
- API Key安全存储
- 响应式移动端UI

#### Agent系统
- ReAct Agent
- Enhanced Agent
- Multi-Agent协作
- 工作流可视化

#### RAG知识库
- 文档处理与分块
- 向量化存储
- 混合检索

#### 工具系统
- 10+内置工具
- MCP v2.0支持
- 浏览器自动化 (Puppeteer)

#### 前端功能
- 多模态输入 (图片上传、语音录制)
- 内容预览 (文档/网页)
- 代码高亮 (Shiki + dompurify)
- 多窗口对话

### Bug修复

| Bug ID | 描述 | 修复版本 |
|--------|------|----------|
| Bug 2 | 历史记录侧边栏无法关闭 | 1.0.0 |
| Bug 3 | 多窗口模式布局失效 | 1.0.0 |
| Bug 4 | Markdown XSS安全风险 | 1.0.0 |
| Bug 5 | 后端连接配置缺失 | 1.0.0 |
| Bug 6 | ESC键无法关闭面板 | 1.0.0 |

---

## 开发规范

### 提交格式
```
[类型] 描述

- 影响的文件
- 变更详情
```

类型: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

### 版本号语义
- **主版本号**: 重大架构变更
- **次版本号**: 新功能添加
- **修订号**: Bug修复和优化
