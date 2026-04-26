# AI Chat Backend

现代化AI对话平台后端服务 | v2.3.0

## 技术栈

| 技术 | 说明 |
|------|------|
| **运行时** | Node.js + Express |
| **架构** | 企业级分层架构 (Application/Domain/Infra/Common) |
| **AI模型** | MiniMax Token Plan API (M2.7/M2.5/VL-01/Text-01) |
| **协议** | SSE流式响应 / A2A Agent协作 / HITL人机协作 / MCP工具协议 |
| **向量存储** | Ollama (本地) / Qdrant (可选) |
| **指标** | Prometheus格式 + AlertManager |

## 快速开始

### 环境要求

- Node.js 18+
- MiniMax API Key (Token Plan)

### 环境变量 (.env)

```bash
# MiniMax Token Plan API (必需)
MINIMAX_API_KEY=your_token_plan_api_key

# 服务端口 (默认 30000)
PORT=30000

# Ollama 向量模型 (可选)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=mxbai-embed-large

# Qdrant 向量数据库 (可选)
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=chat_documents
```

### 安装与启动

```bash
cd backend
npm install
npm start
```

服务将在 http://localhost:30000 启动

### API文档

启动后访问: http://localhost:30000/api-docs

---

## 核心技术特性

### 1. SSE流式响应

支持实时流式输出，打字机效果

```bash
curl -X POST http://localhost:30000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "你好"}],
    "model": "MiniMax-M2.7",
    "stream": true
  }'
```

响应格式 (SSE):
```
data: {"type": "connected"}\n\n
data: {"type": "chunk", "content": "你"}\n\n
data: {"type": "done"}\n\n
```

### 2. A2A Agent协作协议

Agent间消息传递与任务委托

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/a2a/agents` | 获取所有Agent |
| POST | `/api/a2a/agents/register` | 注册Agent |
| POST | `/api/a2a/messages/send` | 发送消息 |
| GET | `/api/a2a/subscribe/:sessionId` | SSE订阅 |
| POST | `/api/a2a/collaborate` | 执行协作任务 |
| GET | `/api/a2a/collaboration/:taskId` | 获取任务状态 |
| DELETE | `/api/a2a/collaboration/:taskId` | 取消任务 |

### 3. HITL人机协作确认

危险操作二次确认机制

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/hitl/request` | 创建确认请求 |
| POST | `/api/hitl/respond` | 响应确认 (approve/reject) |
| GET | `/api/hitl/subscribe/:sessionId` | SSE订阅 |
| GET | `/api/hitl/status/:requestId` | 查询状态 |

### 4. RAG知识库

支持问题重写、拆分、多路检索与重排序

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/rag/query` | RAG检索查询 |
| POST | `/api/rag/ingest` | 文档摄取 |
| GET | `/api/rag/status` | 索引状态 |

### 5. Ollama本地向量模型

~~Ollama 向量模型~~ - 已移除，统一使用 Qdrant

### 6. Qdrant向量数据库

可选的外部向量数据库

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/qdrant/status` | Qdrant状态 |
| GET | `/api/qdrant/collections` | 集合列表 |
| POST | `/api/qdrant/search` | 向量搜索 |
| POST | `/api/qdrant/documents` | 插入文档 |

---

## 管理后台API

### 模型管理 (`/api/admin/models`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 获取所有模型配置 |
| GET | `/:name` | 获取指定模型 |
| PUT | `/:name` | 更新模型配置 |
| POST | `/:name/circuit-breaker` | 熔断器控制 |
| GET | `/stats` | 模型统计 |

### Prompt模板 (`/api/admin/prompts`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 获取所有模板 |
| POST | `/` | 创建模板 |
| PUT | `/:id` | 更新模板 |
| DELETE | `/:id` | 删除模板 |

### 知识库 (`/api/admin/knowledge`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/docs` | 获取文档列表 |
| POST | `/docs` | 添加文档 |
| GET | `/docs/:id` | 获取文档 |
| PUT | `/docs/:id` | 更新文档 |
| DELETE | `/docs/:id` | 删除文档 |
| POST | `/index` | 触发索引重建 |

### 工具管理 (`/api/admin/tools`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 获取工具列表 |
| GET | `/categories/list` | 获取分类列表 |
| POST | `/register` | 注册工具 |
| PUT | `/:name` | 更新工具 |
| DELETE | `/:name` | 删除工具 |
| POST | `/:name/test` | 测试工具 |
| POST | `/:name/toggle` | 启用/禁用 |

### 链路追踪 (`/api/admin/traces`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 查询追踪记录 |
| GET | `/:traceId` | 获取详情 |
| GET | `/stats` | 统计信息 |

---

## 工具注册表

核心文件: `src/services/tools/toolRegistry.js`

### 内置工具 (30+)

| 分类 | 工具 | 说明 |
|------|------|------|
| **搜索** | web_search, duckduckgo_search, enhanced_search | 网页搜索 |
| **计算** | calculator | 数学计算 |
| **日期时间** | datetime, timezone_converter | 时间处理 |
| **文件** | file_operations | 文件读写 |
| **代码** | code_execution, code_review | 代码执行/审查 |
| **数据** | data_processing | 数据处理 |
| **Web** | http_request, web_scraper | HTTP请求/网页抓取 |
| **多媒体** | image_generation | 图像生成 |
| **实用** | qr_code, url_shortener, currency_converter | 二维码/短链接/汇率 |
| **笔记** | session_note_tool | 会话笔记持久化 |

### 工具执行特性

- **超时控制**: 各工具独立超时配置
- **参数验证**: 自动参数校验
- **重试机制**: 指数退避重试
- **意图匹配**: 关键词 + LLM语义匹配

---

## 目录结构

```
backend/src/
├── index.js                    # 入口、路由注册
├── application/                 # 应用编排层
│   ├── ChatOrchestrator.js
│   └── AgentOrchestrator.js
├── routes/                      # 接口层 (35+ 路由)
│   ├── chat.js                 # SSE聊天
│   ├── a2a.js                  # A2A协议
│   ├── hitl.js                 # HITL确认
│   ├── rag.js                  # RAG检索
│   ├── admin/                  # 管理后台
│   │   ├── model.js
│   │   ├── prompt.js
│   │   ├── knowledge.js
│   │   ├── tool.js
│   │   ├── trace.js
│   │   └── stats.js
│   ├── qdrant.js               # Qdrant向量数据库
│   └── metrics.js              # 性能指标
├── services/                    # 业务逻辑层
│   ├── agentEngine.js          # Agent执行引擎
│   ├── sseService.js           # SSE流式服务
│   ├── toolRegistry.js         # 工具注册表
│   ├── ragService.js           # RAG服务
│   └── router/
│       └── modelRouter.js      # MiniMax模型路由
├── domain/                      # 核心业务逻辑
│   ├── agent/                  # Agent领域
│   │   ├── IntentRouter.js
│   │   ├── ToolExecutor.js
│   │   └── ContextAssembler.js
│   ├── rag/                    # RAG领域
│   │   ├── QueryRewriteService.js
│   │   ├── QueryDecomposeService.js
│   │   ├── Reranker.js
│   │   └── CitationAssembler.js
│   └── model/                  # 模型抽象
├── infra/                       # 基础设施层
│   ├── circuitBreaker/          # 熔断器
│   ├── rateLimiter/            # 限流器
│   ├── metrics/                # 指标采集
│   ├── alert/                  # 告警管理
│   ├── config/                 # 配置中心
│   └── queue/                  # 队列管理
├── middleware/                  # 中间件
│   ├── security.js             # 安全 (CORS/安全头)
│   ├── rateLimiter.js          # 限流
│   └── trace.js                # 链路追踪
└── common/                      # 公共基础
    └── errors/                  # 统一错误体系
```

---

## 中间件

| 中间件 | 文件 | 职责 |
|--------|------|------|
| **security.js** | CORS配置、安全响应头、IP限流 |
| **rateLimiter.js** | 请求频率限制 |
| **errorHandler.js** | 全局错误处理、统一响应格式 |
| **trace.js** | 全链路追踪 (TraceID/SpanID) |

### 安全配置

```javascript
// 安全响应头
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block

// CORS
允许来源: http://localhost:8080 (开发环境)

// 限流
100 请求/分钟/IP
```

---

## 健康检查

```bash
curl http://localhost:30000/api/health
```

响应: `{ "status": "ok", "timestamp": "2026-04-07T..." }`

---

## 数据存储

| 数据类型 | 存储方案 | 路径 |
|---------|---------|------|
| 会话状态 | File (StatePersistence) | `data/agent-states/` |
| 语义记忆 | File + MiniMax Embeddings | `data/semantic-memory/` |
| 检查点 | FileCheckpointManager | `data/checkpoints/` |
| Agent日志 | JSON Lines | `logs/agent/` |
| Session Note | JSON File | `workspace/.agent_memory.json` |

---

**文档更新**: 2026-04-07
**版本**: v2.3.0
