# 功能验证测试报告

## 测试概览

| 指标 | 值 |
|------|-----|
| 测试总数 | 22 |
| 通过 | 18 |
| 失败 | 4 |
| 跳过 | 0 |
| 错误 | 0 |
| 通过率 | 81.8% |
| 总耗时 | 1.75s |
| 测试时间 | 2026-05-12T19:36:24.178Z |

## 模块测试结果

| 模块 | 通过/总数 | 通过率 |
|------|-----------|--------|
| qdrant | 3/3 | 100% |
| vectorSearch | 3/4 | 75% |
| fallback | 2/3 | 67% |
| sse | 1/2 | 50% |
| admin | 9/10 | 90% |

## 详细测试结果

### Qdrant 连接测试
- **Qdrant 状态检查 - GET /api/qdrant/status**: PASS
- **Qdrant 集合列表 - GET /api/qdrant/collections**: PASS
- **Qdrant 健康状态 - GET /api/health (检查 Qdrant 依赖)**: PASS

### 向量检索测试
- **创建测试集合 - PUT /api/qdrant/collections/test_func**: FAIL
  - 测试失败
- **插入测试文档 - POST /api/qdrant/documents**: PASS
- **向量相似度搜索 - POST /api/qdrant/search**: PASS
- **清理测试集合 - DELETE /api/qdrant/collections/test_func**: PASS

### 降级机制测试
- **检查降级配置 - GET /api/config**: FAIL
  - 测试失败
- **RAG 搜索（降级路径）- POST /api/rag/search**: PASS
- **搜索服务降级 - GET /api/search**: PASS

### SSE 流式响应测试
- **SSE 流式聊天 - POST /api/chat (流式)**: PASS
- **非流式聊天响应 - POST /api/chat (非流式)**: FAIL
  - 测试失败

### 管理后台 API 测试
- **知识库统计 - GET /api/admin/knowledge/stats**: PASS
- **知识库列表 - GET /api/admin/knowledge/docs**: PASS
- **工具列表 - GET /api/admin/tools**: PASS
- **工具分类 - GET /api/admin/tools/categories/list**: PASS
- **模型列表 - GET /api/admin/models**: PASS
- **模型统计 - GET /api/admin/models/stats**: PASS
- **Prompt 模板列表 - GET /api/admin/prompts**: PASS
- **链路追踪列表 - GET /api/admin/traces**: PASS
- **意图列表 - GET /api/admin/intents**: FAIL
  - 测试失败
- **管理后台统计 - GET /api/admin/stats**: PASS

## 发现的问题

### 1. [MEDIUM] test

**问题**: 部分测试失败

**建议**: 请检查失败测试的网络连接和依赖服务状态


---
*报告生成时间: 2026-05-12T19:36:25.931Z*
