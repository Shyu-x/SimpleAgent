# RAG 系统技术文档

> 文档版本: v1.0.0
> 更新日期: 2026-04-07
> 项目版本: v2.3.0

---

## 目录

1. [系统概述](#系统概述)
2. [技术架构](#技术架构)
3. [核心组件](#核心组件)
4. [数据流](#数据流)
5. [API接口](#api接口)
6. [配置指南](#配置指南)
7. [使用示例](#使用示例)

---

## 系统概述

RAG（Retrieval-Augmented Generation）系统是 AI Chat 玩具的核心知识检索组件，负责从向量数据库中检索相关文档片段，并将其注入到 LLM 的上下文中，以增强生成质量。

### 主要功能

| 功能 | 说明 |
|------|------|
| 问题重写 | 上下文补全、语义扩展、意图保持、歧义消除 |
| 问题拆分 | 纵向拆分（顺序步骤）、横向拆分（并行维度）、混合拆分 |
| 向量检索 | Qdrant 向量数据库 |
| 关键词检索 | BM25 算法实现 |
| 多路融合 | RRFS（倒数排名融合）算法 |
| 重排序 | CrossEncoder/BM25/Semantic/Diversity 多策略 |
| 引用组装 | 段落/句子/短语级别引用追溯 |

---

## 技术架构

### 分层架构

```
┌─────────────────────────────────────────┐
│           RAG 入口层 (ragService)         │
├─────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────────┐  │
│  │ QueryRewrite │  │ QueryDecompose   │  │
│  │ Service     │  │ Service         │  │
│  └─────────────┘  └─────────────────┘  │
├─────────────────────────────────────────┤
│         SearchCoordinator (搜索协调器)     │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │ VectorSearch │  │ KeywordSearch    │  │
│  │ Channel     │  │ Channel         │  │
│  └─────────────┘  └─────────────────┘  │
├─────────────────────────────────────────┤
│         Reranker (重排序器)              │
├─────────────────────────────────────────┤
│         CitationAssembler (引用组装器)    │
└─────────────────────────────────────────┘
```

### 技术栈

| 组件 | 技术 | 源码位置 |
|------|------|----------|
| 向量模型 | 简单哈希向量 | 内置实现 |
| 向量存储 | Qdrant | `services/vector/QdrantVectorStore.js` |
| 嵌入服务 | MiniMax Embedding API | `services/model/clients/MiniMaxEmbeddingClient.js` |

---

## 核心组件

### 1. QueryRewriteService（问题重写服务）

**文件**: `domain/rag/QueryRewriteService.js` (513行)

**功能**: 对用户问题进行重写，补全上下文信息

**重写类型**:

```javascript
const REWRITE_TYPES = {
  CONTEXTUAL_COMPLETION: 'contextual_completion',    // 上下文补全
  SEMANTIC_EXPANSION: 'semantic_expansion',          // 语义扩展
  INTENT_PRESERVATION: 'intent_preservation',        // 意图保持
  DISAMBIGUATION: 'disambiguation'                  // 歧义消除
};
```

**核心方法**:

| 方法 | 说明 |
|------|------|
| `rewrite(query, history)` | 重写问题 |
| `_completeContext()` | 补全上下文 |
| `_expandSemantic()` | 语义扩展 |
| `_preserveIntent()` | 保持意图 |
| `_disambiguate()` | 消除歧义 |

### 2. QueryDecomposeService（问题拆分服务）

**文件**: `domain/rag/QueryDecomposeService.js` (662行)

**功能**: 将复杂问题拆分为多个简单子问题

**拆分策略**:

```javascript
const DECOMPOSE_STRATEGIES = {
  SEQUENTIAL: 'sequential',   // 纵向拆分（步骤顺序）
  PARALLEL: 'parallel',       // 横向拆分（维度并行）
  HYBRID: 'hybrid'            // 混合拆分
};
```

**核心方法**:

| 方法 | 说明 |
|------|------|
| `decompose(query, strategy)` | 拆分问题 |
| `_decomposeSequential()` | 纵向拆分 |
| `_decomposeParallel()` | 横向拆分 |
| `_decomposeHybrid()` | 混合拆分 |

### 3. VectorSearchChannel（向量检索通道）

**文件**: `domain/search/channels/VectorSearchChannel.js`

**功能**: 使用向量相似度进行文档检索

**支持的向量存储**:

| 存储 | 说明 |
|------|------|
| Qdrant | 生产级向量数据库 |
| Ollama | ~~本地向量模型~~ 已移除 |
| Memory | 内存向量存储（开发用） |

**核心方法**:

| 方法 | 说明 |
|------|------|
| `search(query, options)` | 执行向量搜索 |
| `_embed(text)` | 生成嵌入向量 |
| `_cosineSimilarity(a, b)` | 计算余弦相似度 |

### 4. KeywordSearchChannel（关键词检索通道）

**文件**: `domain/search/channels/KeywordSearchChannel.js`

**功能**: 使用 BM25 算法进行关键词检索

**核心方法**:

| 方法 | 说明 |
|------|------|
| `search(query, options)` | 执行关键词搜索 |
| `_calculateBM25(doc, query)` | 计算 BM25 分数 |

### 5. SearchCoordinator（搜索协调器）

**文件**: `domain/search/SearchCoordinator.js`

**功能**: 协调多路检索，执行结果融合

**RRFS 融合公式**:

```javascript
// RRFS (Reciprocal Rank Fusion)
score = weight / (k + rank)
// k = 60 (默认常量)
```

**核心方法**:

| 方法 | 说明 |
|------|------|
| `searchAll(query, options)` | 多路并行搜索 |
| `_fuseResults(results)` | 融合搜索结果 |
| `_applyWeights(results)` | 应用权重 |

### 6. Reranker（重排序器）

**文件**: `domain/rag/Reranker.js` (828行)

**功能**: 对检索结果进行多策略重排序

**重排序策略**:

```javascript
const RERANK_STRATEGIES = {
  CROSS_ENCODER: 'cross_encoder_rerank',    // LLM相关性评估
  BM25: 'bm25_score_boost',                // BM25分数增强
  SEMANTIC: 'semantic_similarity',         // 语义相似度
  DIVERSITY: 'diversity_boost'              // 多样性提升
};
```

**核心方法**:

| 方法 | 说明 |
|------|------|
| `rerank(query, results, strategy)` | 重排序 |
| `_crossEncoderRerank()` | LLM重排 |
| `_bm25ScoreBoost()` | BM25增强 |
| `_semanticSimilarity()` | 语义重排 |
| `_diversityBoost()` | 多样性提升 |

### 7. CitationAssembler（引用组装器）

**文件**: `domain/rag/CitationAssembler.js` (898行)

**功能**: 组装检索结果与引用信息

**引用级别**:

```javascript
const CITATION_LEVELS = {
  PARAGRAPH: 'paragraph',   // 段落级别
  SENTENCE: 'sentence',      // 句子级别
  PHRASE: 'phrase'           // 短语级别
};
```

**核心方法**:

| 方法 | 说明 |
|------|------|
| `assemble(results, level)` | 组装引用 |
| `_extractCitations()` | 提取引用 |
| `_formatSource()` | 格式化来源 |

---

## 数据流

### 检索流程

```
用户问题
    │
    ▼
┌─────────────────┐
│ QueryRewrite    │ ◄── 历史消息
│ Service         │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ QueryDecompose  │
│ Service         │
└─────────────────┘
    │
    ├───► VectorSearch ──────────► Qdrant
    │
    └───► KeywordSearch ─────────► BM25
    │
    ▼
┌─────────────────┐
│ SearchCoordina  │
│ tor (RRFS融合)  │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Reranker        │
│ (多策略重排)    │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ CitationAssembl │
│ er              │
└─────────────────┘
    │
    ▼
  检索结果 + 引用
```

---

## API接口

### 后端路由

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/rag/search` | POST | RAG搜索 |
| `/api/rag/kb` | GET | 知识库统计 |
| `/api/rag/stats` | GET | RAG统计 |
| `/api/qdrant/search` | POST | Qdrant搜索 |

### 请求示例

```bash
# RAG搜索
curl -X POST http://localhost:30000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "什么是人工智能？",
    "topK": 5,
    "similarityThreshold": 0.7
  }'
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "content": "人工智能是计算机科学的一个分支...",
        "metadata": {
          "source": "AI简介.md",
          "page": 1
        },
        "score": 0.92,
        "citations": [
          { "start": 0, "end": 10, "text": "人工智能" }
        ]
      }
    ],
    "query": "什么是人工智能？",
    "rewrittenQuery": "请解释人工智能的定义和概念",
    "totalResults": 5
  }
}
```

---

## 配置指南

### 环境变量

```bash
# RAG 配置
RAG_CHUNK_SIZE=512           # 分块大小
RAG_TOP_K=5                  # 返回结果数
RAG_RERANK=true              # 是否重排序
RAG_SIMILARITY_THRESHOLD=0.7 # 相似度阈值

# Qdrant 向量数据库
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=chat_documents
QDRANT_DIMENSION=1024
```

### 组件配置

```javascript
// QueryRewriteService 配置
{
  enableContextCompletion: true,
  enableSemanticExpansion: true,
  maxHistoryLength: 10
}

// QueryDecomposeService 配置
{
  defaultStrategy: 'HYBRID',
  maxSubQuestions: 5
}

// Reranker 配置
{
  strategies: ['CROSS_ENCODER', 'BM25', 'SEMANTIC', 'DIVERSITY'],
  weights: { crossEncoder: 0.4, bm25: 0.2, semantic: 0.3, diversity: 0.1 }
}
```

---

## 使用示例

### 基础使用

```javascript
const { ragService } = require('./services/ragService');

// 执行 RAG 搜索
const results = await ragService.search('什么是机器学习？', {
  topK: 5,
  rerank: true,
  includeCitations: true
});

console.log(results);
```

### 自定义重排序

```javascript
const { reranker } = require('./domain/rag/Reranker');

// 使用特定策略重排
const rankedResults = await reranker.rerank(
  query,
  results,
  { strategy: 'CROSS_ENCODER', topK: 3 }
);
```

---

**文档更新日期**: 2026-04-07
