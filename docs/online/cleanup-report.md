=== G2 console 清理报告 ===

**总扫描: 498 处 → 312 处 (KEEP), 实际清理 186 处**

# 工作概览

| 类别 | 数量 | 范围 |
|------|------|------|
| KEEP | ~25 处 (12 个文件) | logger 模块、CLI demo 脚本、tracing、VM2 沙箱、plugin 暴露 API、JSDoc 注释 |
| REPLACE | ~160 处 (35 个 backend 文件) | 全部后端生产服务，console.* → logger |
| REMOVE | ~26 处 (6 个 frontend 文件) | debug-only console.log/console.debug |
| 残留 frontend console.error | ~280 处 (60+ 文件) | React catch 块中的标准错误处理，KEEP（按前端惯例） |

# 修改文件

## 后端 (35 个文件)

### Services
- `a2aService.js`, `agentEngine.js`, `taskQueue.js`
- `cacheService.js`, `database.js`, `redis.js`, `pluginManager.js`
- `redisCache.js`, `errorHandler.js`, `memory.js`, `extendedTools.js`
- `multiagentService.js`, `enhancedAgentEngine.js`, `MultiAgentCoordinator.js`
- `mcpToolService.js`, `mcpSearchService.js`, `mcp.js`
- `QdrantService.js`, `ragService.js`, `miniMaxSearchTool.js`
- `SemanticMemory.js`, `hybridSearch.js`, `searchRouter.js`, `modelPool.js`, `performanceMonitor.js`
- `mockVectorStore.js`, `unifiedCache.js`, `ingestion/pipeline.js`
- `router/modelRouter.js`, `router/taskClassifier.js`
- `services/enhancedMemory.js`, `services/hitl/HitlService.js`
- `services/search/SearchCoordinator.js`

### Infra
- `infra/alert/AlertManager.js`
- `infra/config/ConfigCenter.js`
- `infra/metrics/MetricsCollector.js`
- `infra/queue/QueueManager.js`
- `infra/rateLimiter/client.js`, `infra/rateLimiter/QueueRateLimiter.js`
- `infra/monitoring/gateway.service.js`, `prometheus.service.js`, `qdrant-monitor.js`

### Middleware / Utils / Common
- `middleware/circuitBreaker.js`, `middleware/rateLimit.js`
- `utils/retry.js`, `common/errors.js`

### Domain
- `domain/rag/IntentClassifier.js`
- `domain/search/postProcessors/RerankerProcessor.js`

### Root & Lib
- `config/index.js`
- `n8n.js`, `browser.js`, `enhancedMemory.js`, `hitl.js`, `mcp.js`, `search.js`

## 前端 (6 个文件)
- `hooks/useMemorySystem.ts` (2 console.debug)
- `components/agent/ExecutionHistory.tsx` (1 console.log in mock)
- `components/admin/TraceViewer/index.tsx` (2 console.log)
- `components/admin/TraceViewer.tsx` (1 console.log)

## Cleanup
- 删除 20 个 `.bak` 文件 (frontend ChatArea.tsx.bak + 19 个 backend/tests/unit/*.bak)

# KEEP 清单（合法保留）

| 文件 | 原因 |
|------|------|
| `backend/src/common/logger.js` | logger 自身实现 |
| `backend/src/infra/logger/AgentLogger.js` | logger 自身实现 |
| `backend/src/services/AgentLogger.js` | logger 自身实现（1 处 console.error 是文件写入失败的兜底） |
| `backend/src/di-test.js`, `di-example.js` | CLI 演示脚本，console 是唯一输出 |
| `backend/src/scripts/ContinuousLearning.js`, `ScheduledTechUpdate.js` | CLI 脚本，console 是唯一输出 |
| `backend/src/utils/circuitBreakerExample.js` | 演示示例 |
| `backend/src/multiagent.js` | `Crew.log()` 是公开 API |
| `backend/src/services/tracing.js`, `tracing/TraceService.js` | tracing 服务有自己的 logger 风格 |
| `backend/src/services/tools/codeExecutionTool.js` | VM2 沙箱的 console 拦截是核心机制 |
| `backend/src/services/pluginManager.js` | 暴露给插件的 console 包装是 API |
| `backend/src/infra/sse/ProbeBufferingCallback.js` | 仅 JSDoc 注释中的示例 |
| `backend/src/domain/model/HealthChecker.js` | JSDoc 注释中的示例 |
| `backend/src/domain/rag/QueryRewriteService.di.js` | CLI 演示 |
| `backend/src/domain/rag/ingestion/index.js` | 启动横幅 |

# 测试

```
backend unit: 709/709 passed (27 test suites)
frontend unit: 877/877 passed | 9 skipped (49 test files)
comprehensive: 26/26 passed
tsc: exit 0
```

# 服务健康

```
backend=200 (http://localhost:30000/api/health)
frontend=200 (http://localhost:3001)
```

# 截图

`docs/online/screenshots/`:
- `main.png` — 主对话页
- `welcome.png` — WelcomeGuide 弹窗
- `admin-dashboard.png` — 管理后台首页
- `admin-tools.png` — 管理后台 - 工具注册
- `admin-kb.png` — 管理后台 - 知识库

# Commits (语义分组)

| SHA | 主题 |
|-----|------|
| `25ac801` | a2aService + agentEngine + taskQueue (3 文件) |
| `118955b` | chore: 删除 ChatArea.tsx.bak |
| `0ef238e` | cacheService + database + redis + pluginManager (4 文件) |
| `7df4866` | redisCache + errorHandler + memory + extendedTools (4 文件) |
| `c5a59f2` | multiagentService + enhancedAgentEngine + MultiAgentCoordinator (3 文件) |
| `c58a036` | mcpToolService + mcpSearchService + mcp (3 文件) |
| `358584a` | QdrantService + ragService + miniMaxSearchTool (3 文件) |
| `a0a723b` | SemanticMemory + hybridSearch + searchRouter + modelPool + performanceMonitor (5 文件) |
| `edaa5dd` | mockVectorStore + unifiedCache + ingestion/pipeline + taskClassifier (4 文件) |
| `c083bf2` | modelRouter (1 文件) |
| `ece5edf` | MetricsCollector (1 文件) |
| `8e86f2c` | rateLimiter/client + QueueManager + ConfigCenter + AlertManager (4 文件) |
| `3a2e8c1` | gateway.service + prometheus.service + qdrant-monitor (3 文件) |
| `7b247a1` | circuitBreaker + rateLimit middleware (2 文件) |
| `3a864f5` | utils/retry + common/errors + QueueRateLimiter (3 文件) |
| `86a6abd` | n8n + browser + enhancedMemory + hitl + mcp + search (6 文件) |
| `953095c` | Reranker + SearchCoordinator + HitlService + enhancedMemory + IntentClassifier + config (6 文件) |
| `5d2eaa3` | fix: mcp.js sed 损坏后修复 |
| `3f35e69` | Playwright 截图脚本 + 5 张截图 |
| `b6e4f32` | useMemorySystem + ExecutionHistory (2 文件) |
| `eaad892` | TraceViewer × 2 (2 文件) |
| `75bb82a` | miniMaxSearchTool 最后一处 console.log |

# 关键发现

1. **mcp.js sed 损坏事件**：使用 `sed` 批量替换 mcp.js 时，由于模式中含特殊字符 `?.` 导致 sed 把所有字符都拆开，整个文件被破坏。已从 git 恢复并用 Edit 工具重新应用修改。
2. **后端代码结构清晰**：几乎所有 backend 服务都遵循 `createLogger('serviceName')` 模式，迁移非常直接。
3. **前端 console 大量集中在 catch 块**：~280 处 console.error 是 React 错误处理的惯例（boundary、event handlers），按前端惯例保留。
4. **debug console.log 集中在 SSE 连接、hydration、mock handler** 这几类，已清理。

# 已知遗留

前端大约 280 处 console.error 主要分布在：
- React ErrorBoundary 组件（5+ 文件）
- SSE 客户端的 catch 块（apiClient, useAdminSSE, useCollaborationSSE 等 8+ 钩子）
- Admin 页面 fetch 失败处理
- Stores 的 hydration 错误处理

按前端惯例这些都是合法的 console.error 用法，KEEP。

# 分支

`fix/urgent-bugs @ 75bb82a` (pushed to origin)
