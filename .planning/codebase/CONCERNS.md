# Technical Concerns & Technical Debt

**Project:** AI Chat 玩具 - Modern AI Chat Platform
**Analyzed:** 2026-04-26
**Version:** v2.3.0 (架构统一修复完成)
**Confidence:** HIGH

---

## Critical Technical Debt

### Concern 1: 业务逻辑未从 Routes 迁移到 Services

**What goes wrong:**
Routes 层（`backend/src/routes/`）承载了大量业务逻辑，违反分层架构原则。Routes 应只做参数校验和响应组装，业务逻辑应下沉到 services/ 层。

**Why it happens:**
Phase 1 分层架构改造不彻底，目录结构建立了但业务逻辑迁移未完成。

**Evidence:**
| File | Lines | Issue |
|------|-------|-------|
| `routes/a2a.js` | 865 | Agent协作协议 |
| `routes/multiagent.js` | 646 | 多Agent编排 |
| `routes/missionControl.js` | 693 | 任务控制中心 |
| `routes/memory.js` | 597 | 记忆服务 |
| `routes/rag.js` | 578 | RAG检索 |
| `routes/conversations.js` | 395 | 对话管理 |
| `routes/hitl.js` | 386 | HITL确认 |

**Total routes code:** 9,782 行，仍有大量业务逻辑未下沉

**How to avoid:**
Routes 文件应控制在 100-150 行以内，只包含：参数验证、路由分发、响应组装。

**Warning signs:**
- 单个 route 文件超过 200 行
- Route 文件中直接调用 MiniMax API
- Route 文件中直接操作数据库

**Phase to address:** Phase 1 未完成项 - 优先级 P0

---

### Concern 2: 大量 Mock 数据残留

**What goes wrong:**
代码库中仍存在多处模拟数据/降级逻辑，生产环境中会返回非真实结果。

**Why it happens:**
开发过程中快速验证功能时引入，遗忘移除。

**Evidence:**
```
backend/src/routes/admin/trace.js       - generateMockTrace(), initMockTraces()
backend/src/routes/admin/prompt.js     - 模拟版本历史
backend/src/routes/multiagent.js       - mockLLMClient
backend/src/domain/agent/MCPToolRegistry.js - 模拟 MCP 工具发现
backend/src/domain/search/channels/VectorSearchChannel.js - _mockEmbed()
backend/src/routes/agentTrace.js       - 模拟执行结果
backend/src/routes/config.js           - require('../data/mockData')
```

**How to avoid:**
- 完成开发后必须移除所有 mock 代码
- 添加 `NODE_ENV=production` 检查拒绝模拟数据
- 添加单元测试验证真实 API 调用

**Warning signs:**
- 搜索 "mock" 返回多个文件
- 降级路径包含 "mock" 字样
- 代码注释说 "仅用于测试"

**Phase to address:** Phase 1 - 优先级 P1

---

### Concern 3: 控制台日志残留

**What goes wrong:**
544 处 `console.log/error/warn` 散落在 110 个文件中，生产环境不应有调试日志。

**Why it happens:**
开发调试遗留，未统一日志规范。

**How to avoid:**
- 使用结构化日志服务 `AgentLogger.js`
- 添加 lint 规则禁止 `console.*`
- 生产构建时自动移除控制台日志

**Warning signs:**
- `grep -r "console\." backend/src/` 返回大量结果
- 日志未分级（debug/info/warn/error）

**Phase to address:** Phase 1 日志规范化 - 优先级 P2

---

## Recurring Bug Patterns

### Pattern 1: API 路径不匹配 (前端/后端)

**Root cause:** 前后端 API 约定未同步维护

**Bug incidents:**
- Bug 13: KnowledgeBase `/documents/*` vs `/docs/*`
- Bug 14: ToolRegistry 多个端点路径不一致
- Bug 15: AdminDashboard Stats API 缺失
- Bug 17: IntentTreeEditor CRUD API 缺失
- Bug 20: PromptTemplate `/prompts` vs `/prompt`

**Prevention:**
- 建立 OpenAPI/Swagger 规范
- 前后端共享 API 类型定义
- 添加 API 集成测试

**Phase to address:** Phase 4 生产级能力 - 优先级 P1

---

### Pattern 2: 模拟数据未移除 (Fake Data)

**Root cause:** 快速验证时引入模拟数据，遗忘清理

**Bug incidents:**
- Bug 7: SSE Service 返回 Lorem ipsum 模拟文本
- Bug 12: PerformanceMonitor 使用 `Math.random()` 模拟数据
- Bug 11: MissionControl 纯前端 Zustand store 无后端

**Prevention:**
- 完成标准：CRUD + 真实 API 集成
- 添加 "Fake Data Checklist" 验收清单
- 代码审查时重点检查 mock 移除

**Phase to address:** Phase 1 收尾 - 优先级 P1

---

### Pattern 3: 配置/参数验证缺失

**Root cause:** 早期快速迭代时跳过验证

**Bug incidents:**
- Bug 9: RAG cosineSimilarity NaN (除零未检查)
- Bug 10: 工具执行无超时控制和参数验证

**Prevention:**
- 添加 `executeWithTimeout` 工具执行包装
- 添加 `_validateParameters` 参数校验
- 使用 Zod/Joi 进行运行时验证

**Phase to address:** Phase 1 - 优先级 P1

---

## Architectural Concerns

### Concern 4: Phase 1 完成度标记不准确

**Issue:**
CLAUDE.md 标记 "Phase 1完成度" 有多项已✅，但 CLAUDE.md 自身注明：
- `⚠️ 业务逻辑迁移routes→services (进行中)`

**Reality:**
- Routes 层仍有 9,782 行代码
- 多处 mock 数据未清理
- 控制台日志未规范化
- Phase 1 实际完成度约 60-70%

**Impact:**
对项目状态过于乐观，可能导致技术债积累。

**Recommendation:**
重新评估 Phase 1 完成度，明确剩余工作项。

---

### Concern 5: 管理后台前后端集成未完成

**Issue:**
管理后台组件（817-971行）调用后端 API，但部分仍为模拟/缺失状态。

| 组件 | 完整度 | 状态 |
|------|--------|------|
| AdminDashboard | 100% | Stats API 已完成 |
| KnowledgeBase | 95% | 路径已修正 |
| ToolRegistry | 95% | 路径/参数已修正 |
| ModelConfig | 95% | 响应结构已修正 |
| PromptTemplate | 100% | 路径已正确 |
| TraceViewer | 100% | 完整 |

**Concern:**
- MCP工具市场仅 40%（工具管理无后端）
- 管理后台界面和后端 API 未完全联调

**Phase to address:** Phase 5 体验与管理后台完善 - 优先级 P2

---

### Concern 6: 向量检索降级路径存在

**Issue:**
`VectorSearchChannel.js` 中存在 `_mockEmbed()` 降级逻辑，当真实 embedding 服务不可用时返回基于文本哈希的模拟向量。

**Risk:**
- 生产环境可能静默返回非语义相似的假数据
- 用户无法察觉检索结果质量下降

**Recommendation:**
- 添加 `VECTOR_FALLBACK_STRICT=1` 环境变量
- 严格模式下，embedding 失败时拒绝查询而非降级

---

## Security Concerns

### Concern 7: 依赖安全

**Issue:**
`backend/package-lock.json` 有修改记录，需确认依赖版本安全性。

**Known concerns:**
- highlight.js → 已替换为 shiki (安全修复，Bug 4)
- rehype-raw → 已移除 (安全修复，Bug 4)

**Recommendation:**
- 定期 `npm audit`
- 添加 GitHub Dependabot
- 记录第三方库审计结果

---

### Concern 8: API Key 安全

**Issue:**
- MiniMax API Key 存储在 `sessionStorage`（前端）
- `.env.example` 中有配置示例

**Current state:**
✅ API Key 不提交到 git
⚠️ sessionStorage 可被 XSS 访问
⚠️ 后端 .env 配置安全性未审计

**Recommendation:**
- 考虑 httpOnly cookie 存储 token
- 后端添加 API Key 轮换机制

---

## Performance Concerns

### Concern 9: 向量数据库未配置生产参数

**Issue:**
Qdrant 已集成（端口6333/6334），但生产环境参数未优化。

**Current config:**
```bash
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=chat_documents
QDRANT_DIMENSION=1024
```

**Missing:**
- 向量索引类型（HNSW/DiskANN）
- 量化配置
- 备份策略
- 监控告警

**Phase to address:** Phase 4 生产级能力 - 优先级 P2

---

### Concern 10: 无数据库连接池优化

**Evidence:**
- `services/database.js` 存在
- 但未看到连接池配置
- `services/redis.js` 存在但未确认是否启用

**Recommendation:**
- 添加 PostgreSQL 连接池配置
- 确认 Redis 是否用于缓存/会话
- 添加慢查询日志

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **A2A Agent协作:** `routes/a2a.js` 865行 - 需确认是否已迁移业务逻辑到 services
- [ ] **多Agent协作:** `routes/multiagent.js` 646行 - mockLLMClient 需替换为真实实现
- [ ] **MissionControl:** Bug 11 标记"修复中" - 需确认后端API是否已完成
- [ ] **PerformanceMonitor:** Bug 12 标记"修复中" - 需确认 Metrics API 对接状态
- [ ] **IntentTreeEditor:** Bug 17 标记"修复中" - 需确认 CRUD API 状态
- [ ] **MCP工具市场:** 仅40%完整度 - 工具管理后端API缺失
- [ ] **向量检索:** `_mockEmbed()` 降级逻辑 - 需确认生产环境行为
- [ ] **管理后台:** 所有组件声称"95-100%" - 需实际集成测试验证

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| 在 routes 中写业务逻辑 | 快速开发 | 难以维护/测试/扩展 | 仅在 MVP 验证阶段 |
| 使用 mock 数据 | 前后端并行开发 | 假数据流入生产 | 仅在单元测试 |
| 不移除 console.log | 快速调试 | 性能损耗/信息泄露 | 仅在开发环境 |
| 跳过参数验证 | 减少代码量 | 安全漏洞/NaN | Never |
| 硬编码 API 路径 | 避免协调 | 前后端不一致 | Only with shared types |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| MiniMax API | 使用 highspeed 版本 | 使用 standard MiniMax-M2.7 |
| 前端/后端 API | 路径不匹配 | 共享 OpenAPI 规范 |
| SSE 流式 | 模拟数据未移除 | 添加端到端集成测试 |
| 向量检索 | 降级返回假数据 | 严格模式拒绝查询 |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| 大文件路由 | 打开 IDE 卡顿 | Route ≤200行 | >500行时 |
| console.log 散落 | 日志文件膨胀 | 结构化日志服务 | >1000次调用/天 |
| 向量降级 | 检索结果质量下降 | 监控相似度分数 | 生产环境无监控 |

---

## Recovery Strategies

| Concern | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| 业务逻辑迁移 | MEDIUM | 逐步重构：先抽取 services，再精简 routes |
| Mock 数据移除 | LOW | grep -r "mock" → 逐文件清理 → 添加测试保护 |
| 控制台日志 | LOW | 添加 eslint 规则 + 自动替换为 logger |
| API 路径不匹配 | MEDIUM | 建立共享类型定义 + 添加集成测试 |

---

## Phase Mapping

| Concern | Prevention Phase | Verification |
|---------|------------------|--------------|
| 业务逻辑迁移 | Phase 1 (未完成) | Route 文件 ≤150行 |
| Mock 数据移除 | Phase 1 收尾 | `grep -r "mock" src/` 无结果 |
| 控制台日志 | Phase 1 日志规范 | ESLint no-console 通过 |
| API 路径不匹配 | Phase 4 | 集成测试全通过 |
| 向量降级严格模式 | Phase 2 | 生产监控无假数据 |
| 数据库连接池 | Phase 4 | 压测验证 |

---

## Sources

- Bug修复记录 (2026-03-14, 2026-03-15, 2026-04-01, 2026-04-03)
- CLAUDE.md Phase 1-3 完成度评估
- `backend/src/routes/` 代码审计 (9,782 行)
- `grep -r "mock"` 结果分析
- `grep -r "console\."` 结果分析 (544 处)

---

*Technical debt analysis for: AI Chat 玩具*
*Analyzed: 2026-04-26*
