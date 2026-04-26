# 数据存储层架构分析报告

**项目**: AI Chat 玩具
**日期**: 2026-04-04
**版本**: v2.3.0

---

## 1. 存储架构概览

本项目包含两套后端实现，存储架构各有特色：

| 后端 | 语言 | 存储方案 |
|------|------|----------|
| Node.js (backend/) | JavaScript | 内存 + JSON文件 + 向量数据库 |
| Go (backend_go/) | Go | PostgreSQL + Redis + Milvus |

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js 8080)                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        ┌───────────────────┐             ┌───────────────────┐
        │  Node.js Backend  │             │   Go Backend      │
        │   (Port 30000)    │             │  (Port 30001)     │
        ├───────────────────┤             ├───────────────────┤
        │  MemoryService    │             │ ConversationMemory │
        │  SemanticMemory   │             │ Service           │
        │  EnhancedMemory   │             ├───────────────────┤
        │  SmartMemory      │             │ PostgreSQL        │
        │  FileCheckpoint   │             │ (会话/消息/记忆)   │
        │  Manager          │             ├───────────────────┤
        ├───────────────────┤             │ Redis             │
        │  RAGService       │             │ (缓存/限流/锁)    │
        │  QdrantRouter     │             ├───────────────────┤
        │  OllamaRouter     │             │ Milvus            │
        │  (向量存储)       │             │ (向量存储)        │
        └───────────────────┘             └───────────────────┘
                │                                   │
                ▼                                   ▼
    ┌───────────────────────┐       ┌───────────────────────┐
    │   存储层实现          │       │   存储层实现         │
    ├───────────────────────┤       ├───────────────────────┤
    │ 内存 (Map)            │       │ 内存 (slice+mutex)   │
    │ JSON 文件              │       │ PostgreSQL            │
    │  - data/agent-states/ │       │  - conversations      │
    │  - data/memory/      │       │  - messages           │
    │  - data/rag/         │       │  - global_memories    │
    │ Qdrant (向量数据库)   │       │ Redis                  │
    │ Ollama (嵌入模型)     │       │  - session_cache      │
    └───────────────────────┘       │  - rate_limiter       │
                                    │  - lock               │
                                    │ Milvus (向量数据库)  │
                                    └───────────────────────┘
```

---

## 2. Node.js 后端存储

### 2.1 内存存储 (In-Memory)

#### MemoryService (`services/memory.js`)
- **数据结构**: `Map<string, Session>`
- **配置参数**:
  - `maxMessages`: 100 (最大消息数)
  - `maxTokens`: 4000 (最大Token)
  - `compressionThreshold`: 3000 (压缩阈值)
  - `preserveRecentRounds`: 10 (保留最近轮次)
- **压缩策略**: 双维度判断 (Token数 + 消息数)
  - Token超限优先
  - 消息数超限
  - 双重预警 (任一达到60%)

#### EnhancedMemoryService (`services/enhancedMemory.js`)
- **短期记忆**: `MemoryItem[]` 数组, 最大100项
- **长期记忆**: `MemoryItem[]` 数组, 最大10000项
- **持久化**: JSON文件 `data/memory/memory.json`
- **嵌入向量**: 128维度简化嵌入 (SimpleEmbedder)
- **搜索**: 余弦相似度, 阈值0.3

#### SemanticMemory (`services/SemanticMemory.js`)
- **短期**: 最大50项
- **长期**: 最大1000项, 持久化到 `data/memory/longterm.json`
- **嵌入配置**:
  - Provider: OpenAI / Local / Mock
  - 维度: 1536 (OpenAI) / 可配置

#### SmartMemory (`services/smartMemory.js`)
- **滑动窗口**: 默认10条消息
- **摘要阈值**: 20条消息触发摘要
- **数据结构**: `Map<string, Session>`

### 2.2 文件存储 (File-Based)

#### StatePersistence (`services/statePersistence.js`)
- **存储路径**: `data/agent-states/`
- **数据结构**:
```json
{
  "id": "session_xxxx",
  "task": "任务描述",
  "context": {},
  "status": "pending|running|completed|error|checkpoint",
  "createdAt": 1774168355913,
  "updatedAt": 1774168355914,
  "checkpoints": [],
  "currentCheckpoint": "cp_xxx",
  "metadata": { "iterations": 0, "toolCalls": 0, "errors": 0 }
}
```
- **检查点**: 最多10个, 自动清理7天前过期

#### FileCheckpointManager (`services/FileCheckpointManager.js`)
- **存储路径**: `data/checkpoints/`
- **元数据**: `_meta.json` 记录所有检查点
- **清理策略**: 7天过期, 最多100个

#### SessionNoteTool (`services/tools/SessionNoteTool.js`)
- **存储路径**: `workspace/.agent_memory.json`
- **工具类型**: record_note / recall_notes
- **分类**: 支持 category 标签

### 2.3 向量数据库存储

#### QdrantVectorStore (`services/vector/QdrantVectorStore.js`)
- **连接**: `http://localhost:6333`
- **集合**: `chat_documents` (默认)
- **维度**: 1024 (默认)
- **距离度量**: Cosine
- **API**: RESTful (无需SDK)

| 操作 | 方法 |
|------|------|
| 插入 | `PUT /collections/{name}/points` |
| 搜索 | `POST /collections/{name}/points/search` |
| 删除 | `POST /collections/{name}/points/delete` |
| 集合管理 | `GET/PUT/DELETE /collections/{name}` |

#### OllamaRouter (`services/router/OllamaRouter.js`)
- **嵌入模型**: mxbai-embed-large (推荐) / nomic-embed-text
- **LLM模型**: qwen2.5:7b (默认)
- **预热机制**: 启动时自动加载embedding模型

#### RAGService (`services/ragService.js`)
- **存储路径**: `data/rag/`
- **分块策略**: 500字符, 50字符重叠
- **嵌入**: Ollama > OpenAI > SimpleEmbed (降级)
- **重排序**: CrossEncoder / BM25 / Semantic / Diversity

### 2.4 数据流

```
用户输入
    │
    ▼
┌─────────────────────────────────────┐
│         MemoryService               │
│  (会话记忆: Map<sessionId, Session>) │
│  - addMessage()                     │
│  - getMessages()                     │
│  - compress() 压缩                   │
│  - search() 关键词搜索               │
└─────────────────────────────────────┘
    │
    ├─────────────────────┐
    ▼                     ▼
┌─────────────┐    ┌─────────────┐
│  PostgreSQL │    │   RAGService │
│  (可选)     │    │  (知识库)   │
│  - 对话    │    │  - 向量检索 │
│  - 消息    │    │  - 混合召回 │
└─────────────┘    └─────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │   Qdrant    │
                  │  (向量存储)  │
                  └─────────────┘
```

---

## 3. Go 后端存储

### 3.1 PostgreSQL 存储

#### 数据库配置 (`infra/database/config.go`)
```go
type DBConfig struct {
    URL            string
    MaxConns       20
    MinConns       5
    MaxConnLifetime time.Hour
    MaxConnIdleTime 30 * time.Minute
    HealthCheck    time.Minute
}
```

#### 数据表

**conversations** - 对话表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | VARCHAR | 用户ID |
| title | VARCHAR | 对话标题 |
| metadata | JSONB | 元数据 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**messages** - 消息表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| conversation_id | UUID | 对话ID |
| role | VARCHAR | user/assistant/system/tool |
| content | TEXT | 消息内容 |
| model | VARCHAR | 使用的模型 |
| provider | VARCHAR | 提供商 |
| tokens_used | INT | Token消耗 |
| attachments | JSONB | 附件 |
| metadata | JSONB | 元数据 |
| created_at | TIMESTAMP | 创建时间 |

**global_memories** - 全局记忆表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | VARCHAR | 用户ID |
| content | TEXT | 记忆内容 |
| type | VARCHAR | 记忆类型 |
| importance | VARCHAR | 重要性 |
| tags | JSONB | 标签 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 3.2 Redis 存储

#### Session Cache (`infra/redis/session_cache.go`)
- **用途**: 会话状态缓存
- **TTL**: 可配置

#### Rate Limiter (`infra/redis/ratelimiter.go`)
- **用途**: API限流
- **算法**: 令牌桶/滑动窗口

#### Distributed Lock (`infra/redis/lock.go`)
- **用途**: 分布式锁
- **实现**: RedLock 算法

### 3.3 向量存储 - Qdrant

#### QdrantClient (`services/rag/qdrant_client.go`)
- **用途**: RAG向量检索
- **集合**: 可配置
- **维度**: 1024
- **距离**: Cosine

### 3.4 内存存储

#### ConversationMemoryService (`domain/agent/memory_service.go`)
```go
type ConversationMemoryService struct {
    config        MemoryServiceConfig
    messages      []*MemoryMessage
    summary       string
    summaryAt     int
    mu            sync.RWMutex
    sessionID     string
    persistFunc   PersistFunc  // 持久化函数
    loadFunc      LoadFunc     // 加载函数
}

type MemoryServiceConfig struct {
    WindowSize      int    // 滑动窗口大小
    MaxTokens       int    // 最大token数
    EnableSummary   bool   // 启用摘要
    SummaryThresh   int    // 摘要阈值
    PersistEnabled  bool   // 启用持久化
}
```
- **持久化函数**: 可注入 (支持 PostgreSQL / Redis / File)
- **摘要策略**: Token超限触发, 保留摘要点到当前窗口

### 3.5 数据流

```
用户输入
    │
    ▼
┌─────────────────────────────────────┐
│  ConversationMemoryService          │
│  (内存: slice + RWMutex)            │
│  - Append()                         │
│  - GetMessages()                    │
│  - GetRecentMessages()              │
│  - SetSummary()                     │
└─────────────────────────────────────┘
    │ (PersistFunc)
    ▼
┌─────────────────────────────────────┐
│         PostgreSQL                  │
│  - conversations 表                 │
│  - messages 表                      │
│  - global_memories 表               │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│         Redis                       │
│  - session_cache (会话缓存)         │
│  - rate_limiter (限流)              │
│  - lock (分布式锁)                  │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│         Milvus                      │
│  (向量检索)                          │
└─────────────────────────────────────┘
```

---

## 4. RAG 知识库存储

### 4.1 文档摄取流程

```
文档上传
    │
    ▼
┌─────────────────────────────────────┐
│         IngestionPipeline           │
├─────────────────────────────────────┤
│  1. ParseNode - 文档解析             │
│     支持: .md, .txt, .json           │
├─────────────────────────────────────┤
│  2. ChunkNode - 文本分块             │
│     策略: 500字符, 50重叠            │
├─────────────────────────────────────┤
│  3. EmbeddingNode - 向量化           │
│     Ollama mxbai-embed-large        │
│     或 OpenAI text-embedding-ada-002 │
├─────────────────────────────────────┤
│  4. IndexNode - 索引写入             │
│     Qdrant / Milvus                 │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│       向量数据库                    │
│  Qdrant: data/rag/*.json (备份)     │
│  Milvus: 云服务                    │
└─────────────────────────────────────┘
```

### 4.2 检索流程

```
用户查询
    │
    ▼
┌─────────────────────────────────────┐
│      QueryRewriteService           │
│  - 补全上下文                       │
│  - 同义词扩展                       │
│  - 拆分子问题                      │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│      Multi-Channel Search           │
├─────────────────────────────────────┤
│  1. VectorSearchChannel             │
│     向量相似度检索 (Qdrant/Milvus)  │
├─────────────────────────────────────┤
│  2. KeywordSearchChannel            │
│     BM25 关键词检索                 │
├─────────────────────────────────────┤
│  3. HybridSearchChannel             │
│     向量 + 关键词混合               │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│         RerankerService             │
│  - CrossEncoder 重排序             │
│  - BM25 分数融合                    │
│  - Diversity 去重                  │
│  - CitationAssembler 引用组装       │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│         检索结果                    │
│  [1] 内容块1 (相似度: 0.92)        │
│  [2] 内容块2 (相似度: 0.87)        │
└─────────────────────────────────────┘
```

---

## 5. 会话与记忆管理

### 5.1 Node.js 会话管理

```
┌─────────────────────────────────────────────────────────┐
│                    会话生命周期                          │
├─────────────────────────────────────────────────────────┤
│  创建会话                                               │
│  MemoryService.getSession(sessionId)                    │
│    │                                                    │
│    ▼                                                    │
│  添加消息                                               │
│  MemoryService.addMessage(message, sessionId)            │
│    │                                                    │
│    ├─── Token/消息数超限? ──► compress() 压缩          │
│    │                                                    │
│    ▼                                                    │
│  获取上下文                                             │
│  MemoryService.getMessages(sessionId, limit)            │
│    │                                                    │
│    ▼                                                    │
│  搜索记忆                                               │
│  MemoryService.search(query, sessionId)                 │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Go 会话管理

```
┌─────────────────────────────────────────────────────────┐
│                    会话生命周期                          │
├─────────────────────────────────────────────────────────┤
│  创建会话                                               │
│  NewConversationMemoryService(sessionID, config)       │
│    │                                                    │
│    ▼                                                    │
│  加载记忆                                               │
│  Load(ctx) ──► loadFunc(sessionID)                     │
│    │                                                    │
│    ▼                                                    │
│  追加消息                                               │
│  Append(msg)                                            │
│    │                                                    │
│    ├─── persistFunc != nil ──► 异步持久化               │
│    │                                                    │
│    ├─── shouldSummarize() ──► 设置摘要点               │
│    │                                                    │
│    ▼                                                    │
│  获取消息                                               │
│  GetMessages() ──► 摘要 + 滑动窗口                      │
└─────────────────────────────────────────────────────────┘
```

---

## 6. 持久化机制

### 6.1 备份策略

| 存储类型 | 备份方式 | 恢复方式 |
|----------|----------|----------|
| JSON文件 | 实时写入 | 文件读取 |
| PostgreSQL | WAL + 定时快照 | PITR恢复 |
| Redis | RDB/AOF | 主从同步 |
| Qdrant | 快照机制 | 快照恢复 |
| Milvus | 分布式存储 | 云服务管理 |

### 6.2 数据过期策略

| 存储 | 过期配置 | 清理方式 |
|------|----------|----------|
| agent-states | 7天 | cleanupExpiredSessions() |
| checkpoints | 7天 | cleanupExpired() |
| memory (Node.js) | 无限制 | 按条目数裁剪 |
| RAG kb | 无限制 | 手动删除 |

---

## 7. 存储层对比

| 维度 | Node.js 后端 | Go 后端 |
|------|-------------|---------|
| **会话存储** | MemoryService (Map) | ConversationMemoryService (slice) |
| **持久化** | JSON文件 | PostgreSQL |
| **向量数据库** | Qdrant (REST) | Milvus (gRPC) |
| **缓存** | 无 | Redis |
| **摘要策略** | 双维度判断 | Token阈值 |
| **滑动窗口** | preserveRecentRounds | WindowSize |
| **压缩方式** | 早期摘要 + 完整摘要 | 摘要点 + 窗口 |

---

## 8. 架构问题与优化建议

### 8.1 当前问题

1. **Node.js 后端**
   - 内存存储无Redis缓存，高并发下性能受限
   - JSON文件存储无原子性保证
   - Qdrant/Milvus双向量库配置复杂

2. **Go 后端**
   - Milvus客户端实现状态未知
   - PostgreSQL连接池配置需优化
   - 缺乏文件备份机制

### 8.2 优化建议

1. **统一存储层**: 建议Go后端作为主存储，Node.js作为轻量前端代理
2. **缓存强化**: 为Node.js后端添加Redis缓存层
3. **向量库收敛**: Qdrant和Milvus保留其一，避免维护成本
4. **持久化增强**: 添加定期快照和增量备份
5. **监控完善**: 存储指标 (QPS/延迟/容量) 接入MetricsCollector

---

**文档更新**: 2026-04-04
**分析人**: Claude Code Storage Agent
