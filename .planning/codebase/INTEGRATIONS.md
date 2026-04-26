# Integrations

**Project:** AI Chat 玩具
**Documented:** 2026-04-26
**Confidence:** HIGH

## External Services

### MiniMax

| Item | Details |
|------|---------|
| API Type | Token Plan API (Anthropic兼容) |
| Base URL | `https://api.minimaxi.com/anthropic` |
| Auth | Bearer Token (MINIMAX_API_KEY) |
| Models | MiniMax-M2.7, MiniMax-M2.5, MiniMax-VL-01, MiniMax-Text-01 |
| Features | 流式响应、思维链分离、多模态 |

#### MiniMax 模型配置

```javascript
// backend/src/services/model/clients/MiniMaxChatClient.js
const modelConfig = {
  'MiniMax-M2.7': { name: 'MiniMax M2.7 旗舰编程', capabilities: ['text', 'vision', 'code', 'reasoning'], maxTokens: 100000 },
  'MiniMax-M2.5': { name: 'MiniMax M2.5', capabilities: ['text', 'code', 'reasoning'], maxTokens: 100000 },
  'MiniMax-VL-01': { name: 'MiniMax VL 01 多模态', capabilities: ['text', 'vision'], maxTokens: 32000 },
  'MiniMax-Text-01': { name: 'MiniMax Text 01', capabilities: ['text'], maxTokens: 400000 }
};
```

#### MiniMax API 端点

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/messages` | POST | 聊天/流式请求 |

#### 数据流

```
用户输入 → AgentEngine → MiniMaxRouter → MiniMax API
                                     ↓
                              SSE流式响应 → 前端打字机效果
```

### Qdrant Vector Database

| Item | Details |
|------|---------|
| Type | 向量数据库 |
| Host | localhost |
| Port | 6333 (REST) / 6334 (gRPC) |
| Collection | chat_documents |
| Dimension | 1024 |
| Distance | Cosine |

#### Qdrant 配置

```bash
# 环境变量
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=chat_documents
QDRANT_DIMENSION=1024
```

#### Qdrant API 端点

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/collections` | GET | 列出所有集合 |
| `/collections/:name` | GET/PUT/DELETE | 集合管理 |
| `/collections/:name/points` | PUT | 插入向量 |
| `/collections/:name/points/search` | POST | 相似度搜索 |
| `/collections/:name/points/delete` | POST | 删除向量 |

#### 数据流

```
文档 → IngestionPipeline → ParseNode → ChunkNode → EmbeddingNode → QdrantVectorStore → Qdrant
                                                                                  ↓
用户查询 → RAGService → QueryRewrite → VectorSearch → QdrantVectorStore.search → Top-K结果 → Reranker → 最终结果
```

### Ollama (可选)

| Item | Details |
|------|---------|
| Type | 本地LLM + 向量模型 |
| Base URL | `http://localhost:11434` |
| Embedding Model | mxbai-embed-large |
| LLM Model | qwen2.5:7b (可选) |

#### Ollama 配置

```bash
# 环境变量
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=mxbai-embed-large
OLLAMA_LLM_MODEL=qwen2.5:7b
```

### MCP (Model Context Protocol)

| Item | Details |
|------|---------|
| SDK | @modelcontextprotocol/sdk@0.5.0 |
| Type | Agent工具扩展协议 |
| 配置 | .mcp.json |

#### MCP 后端路由

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/minimax/image` | POST | 图像生成 (image-01) |
| `/api/minimax/tts` | POST | 语音合成 (speech-02-hd) |
| `/api/minimax/connect` | POST | 连接MiniMax MCP Server |
| `/api/minimax/status` | GET | 获取MCP连接状态 |

### 其他外部服务

#### Web Search

| Provider | Tool | Auth |
|----------|------|------|
| DuckDuckGo | DuckDuckGoSearchTool | 无需API Key |
| MiniMax | MiniMaxSearchTool | 需要API Key |

#### 浏览器自动化

| Item | Details |
|------|---------|
| Library | Playwright |
| Use Case | 浏览器Agent自动化 |

### 服务间数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                           前端 (Port 8080)                            │
│  React 19 + Next.js 15 + Zustand 5 + Shiki + DOMPurify             │
└─────────────────────────────────────────────────────────────────────┘
                              │ HTTP/SSE
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           后端 (Port 30000)                          │
│  Express.js + AgentEngine (ReAct) + SSE Service                     │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   MiniMax API  │  │  Qdrant (6333)  │  │  Ollama (11434) │
│  Token Plan    │  │  Vector Store   │  │  Local Embed    │
│  - M2.7       │  │  - 文档向量化    │  │  - mxbai-embed │
│  - VL-01      │  │  - 相似度搜索   │  │  - qwen2.5     │
│  - Text-01    │  │                 │  │                │
└────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │
         ▼                    ▼
┌────────────────┐  ┌─────────────────┐
│  HITL Manager  │  │  RAG Pipeline   │
│  人机确认      │  │  - 问题重写     │
│  (60秒超时)    │  │  - 问题拆分     │
│               │  │  - 多路召回     │
│               │  │  - 重排序       │
└────────────────┘  └─────────────────┘
         │
         ▼
┌────────────────┐
│  A2A Service   │
│  Agent协作     │
│  - 任务委托    │
│  - 结果返回    │
└────────────────┘
```

### 意图检测与分流

```
用户输入 → IntentClassifier → 意图类型分流
                          │
                          ├─ knowledge → RAGService → Qdrant搜索
                          ├─ tool_use → ToolExecutor → 30+工具
                          ├─ image_generation → MiniMax image-01
                          ├─ creative → MiniMax M2.7 (创意模式)
                          └─ general → MiniMax Chat
```

### 端口配置

| Service | Port | Protocol |
|---------|------|----------|
| Frontend | 8080 | HTTP |
| Backend | 30000 | HTTP/SSE |
| Qdrant | 6333/6334 | REST/gRPC |
| Ollama | 11434 | HTTP |
| PostgreSQL | 5432 | TCP (Prisma) |
| Redis | 6379 | TCP (ioredis) |

### 环境变量汇总

```bash
# MiniMax (必需)
MINIMAX_API_KEY=your_token_plan_api_key
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic

# Ollama (可选)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=mxbai-embed-large
OLLAMA_LLM_MODEL=qwen2.5:7b

# Qdrant (可选，已有内存向量存储)
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=chat_documents
QDRANT_DIMENSION=1024

# RAG
RAG_CHUNK_SIZE=512
RAG_TOP_K=5
RAG_RERANK=true

# Frontend
NEXT_PUBLIC_BACKEND_URL=http://localhost:30000
```

## 核心数据流

### 1. 用户对话流程

```
用户输入 → ChatInput → API Client → /api/chat → SSE响应 → 前端打字机效果 → ChatArea渲染
```

### 2. Agent执行流程

```
用户输入 → IntentClassifier → 意图类型
                              │
                              ├─ [tool_use] → ToolExecutor → 工具执行
                              │                         ↓
                              │                    HITL确认(可选)
                              │                         ↓
                              │                    AgentLogger
                              │                         ↓
                              └─ [general] → MiniMax API
                                                ↓
                                           Token摘要(超限)
                                                ↓
                                           SSE流式响应
```

### 3. RAG检索流程

```
用户查询 → QueryRewriteService → 改写后查询
                ↓
          QueryDecomposeService → 拆分为子问题
                ↓
          SearchCoordinator → 多路检索
                ↓
          ┌───────┴───────┐
          ▼               ▼
    VectorSearch    KeywordSearch
          │               │
          └───────┬───────┘
                  ▼
            Reranker → 重排序
                  ↓
            CitationAssembler → 引用组装
                  ↓
            最终结果 + 引用
```

### 4. 状态持久化流程

```
AgentEngine → StatePersistence → 内存状态
         ↓
    FileCheckpointManager → ./data/checkpoints/*.json
         ↓
    SemanticMemory → MiniMax embeddings → ./data/semantic-memory/*.json
```

## Sources

- [MiniMax API文档](https://api.minimaxi.com) — Token Plan API
- [Qdrant文档](https://qdrant.github.io/qdrant/) — 向量数据库
- [Ollama文档](https://github.com/ollama/ollama) — 本地模型
- [MCP协议](https://modelcontextprotocol.io) — 模型上下文协议

---
*Integrations documentation for: AI Chat 玩具*
*Documented: 2026-04-26*
