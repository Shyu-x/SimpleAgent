# 功能验证测试报告

## 测试概览

| 指标 | 值 |
|------|-----|
| 测试总数 | 22 |
| 通过 | 0 |
| 失败 | 0 |
| 跳过 | 22 |
| 错误 | 0 |
| 通过率 | 0.0% |
| 总耗时 | 0.08s |
| 测试时间 | 2026-05-12T19:34:20.585Z |

## 模块测试结果

| 模块 | 通过/总数 | 通过率 |
|------|-----------|--------|
| qdrant | 0/3 | 0% |
| vectorSearch | 0/4 | 0% |
| fallback | 0/3 | 0% |
| sse | 0/2 | 0% |
| admin | 0/10 | 0% |

## 详细测试结果

### Qdrant 连接测试
- **Qdrant 状态检查 - GET /api/qdrant/status**: SKIP
  - 服务未启动或无法连接
- **Qdrant 集合列表 - GET /api/qdrant/collections**: SKIP
  - 服务未启动或无法连接
- **Qdrant 健康状态 - GET /api/health (检查 Qdrant 依赖)**: SKIP
  - 服务未启动或无法连接

### 向量检索测试
- **创建测试集合 - PUT /api/qdrant/collections/test_func**: SKIP
  - 服务未启动或无法连接
- **插入测试文档 - POST /api/qdrant/documents**: SKIP
  - 服务未启动或无法连接
- **向量相似度搜索 - POST /api/qdrant/search**: SKIP
  - 服务未启动或无法连接
- **清理测试集合 - DELETE /api/qdrant/collections/test_func**: SKIP
  - 服务未启动或无法连接

### 降级机制测试
- **检查降级配置 - GET /api/config**: SKIP
  - 服务未启动或无法连接
- **RAG 搜索（降级路径）- POST /api/rag/search**: SKIP
  - 服务未启动或无法连接
- **搜索服务降级 - GET /api/search**: SKIP
  - 服务未启动或无法连接

### SSE 流式响应测试
- **SSE 流式聊天 - POST /api/chat (流式)**: SKIP
  - SSE 服务不可用
- **非流式聊天响应 - POST /api/chat (非流式)**: SKIP
  - 服务未启动或无法连接

### 管理后台 API 测试
- **知识库统计 - GET /api/admin/knowledge/stats**: SKIP
  - 服务未启动或无法连接
- **知识库列表 - GET /api/admin/knowledge/docs**: SKIP
  - 服务未启动或无法连接
- **工具列表 - GET /api/admin/tools**: SKIP
  - 服务未启动或无法连接
- **工具分类 - GET /api/admin/tools/categories/list**: SKIP
  - 服务未启动或无法连接
- **模型列表 - GET /api/admin/models**: SKIP
  - 服务未启动或无法连接
- **模型统计 - GET /api/admin/models/stats**: SKIP
  - 服务未启动或无法连接
- **Prompt 模板列表 - GET /api/admin/prompts**: SKIP
  - 服务未启动或无法连接
- **链路追踪列表 - GET /api/admin/traces**: SKIP
  - 服务未启动或无法连接
- **意图列表 - GET /api/admin/intents**: SKIP
  - 服务未启动或无法连接
- **管理后台统计 - GET /api/admin/stats**: SKIP
  - 服务未启动或无法连接

---
*报告生成时间: 2026-05-12T19:34:20.672Z*
