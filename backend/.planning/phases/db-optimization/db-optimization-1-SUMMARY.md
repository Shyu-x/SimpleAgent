---
phase: db-optimization
plan: "1"
subsystem: backend
tags: [database, index, query-optimization]
dependency-graph:
  requires: []
  provides: [query-optimizer]
  affects: [memoryStore, ragService, SemanticMemory, EnhancedMemory]
tech-stack:
  added: [IndexedMap, QueryTimeoutDecorator, CacheIndexManager]
  patterns: [query-timeout, pagination, lru-cache]
key-files:
  created:
    - src/services/queryOptimizer.js
  modified:
    - src/services/memoryStore.js
    - src/services/ragService.js
    - src/services/SemanticMemory.js
    - src/services/enhancedMemory.js
decisions:
  - 使用 setTimeout 实现查询超时控制
  - 内存存储使用 Map 索引替代全表扫描
  - Qdrant HNSW/PQ 配置已在之前优化
metrics:
  duration: "~15 minutes"
  completed: "2026-05-15"
---

# Phase db-optimization Plan 1: 数据库索引与查询优化

## 一句话总结
为内存存储添加索引优化和查询超时控制，提升高频查询性能。

## 优化措施

### 1. 新增 queryOptimizer.js 模块
- `IndexedMap`: 支持多字段排序索引的 Map 存储
- `withQueryTimeout`: 查询超时装饰器
- `paginateQuery`: 分页查询工具函数
- `CacheIndexManager`: LRU 缓存索引管理器

### 2. MemoryStoreService 优化
- 全局记忆查询添加 5s 超时控制
- 使用 IndexedMap 索引加速排序

### 3. RAGService 优化
- RAG 检索添加 10s 超时控制
- 添加缓存索引管理器 (TTL 30s)

### 4. SemanticMemory 优化
- 语义搜索添加 5s 超时控制
- 添加类型/重要性索引

### 5. EnhancedMemory 优化
- 增强记忆搜索添加 5s 超时控制

### 6. Qdrant 向量数据库 (已存在)
- HNSW 索引: m=32, efConstruction=128
- PQ 量化: quantile=0.99
- 重试机制: 3次, 指数退避

## 已添加的索引

| 服务 | 索引类型 | 优化字段 |
|------|----------|----------|
| MemoryStoreService | Map Index | sessionId, memoryId |
| SemanticMemory | Type Index | type, importance |
| EnhancedMemory | Map Index | id, type, timestamp |
| RAGService | Cache Index | kbId (TTL 30s) |
| QdrantVectorStore | HNSW + PQ | 向量索引 |

## 查询超时配置

| 服务 | 超时时间 |
|------|----------|
| memoryStore.getGlobalMemories | 5000ms |
| memoryStore.searchGlobalMemories | 5000ms |
| ragService.retrieve | 10000ms |
| SemanticMemory.search | 5000ms |
| EnhancedMemory.search | 5000ms |

## 验证结果
- 所有模块语法检查通过
- 模块间依赖正确加载

## Deviations from Plan
无 - 计划执行完全符合

## Threat Flags
无 - 优化仅影响查询性能，无新增安全表面