# AI Agent 平台常见陷阱与防护策略 (2025)

**项目:** AI Chat 玩具
**版本:** v2.3.0
**分析日期:** 2026-04-26
**研究范围:** Agent Loop / RAG / 安全 / 性能 / 集成

---

## 一、Agent Loop 关键错误

### 1.1 无限循环陷阱

**问题描述:**
Agent 在无法达成目标时持续循环调用工具，导致 Token 无限消耗和服务不可用。

**识别特征:**
- `routes/agentEngine.js` 或类似文件中缺少 `maxIterations` 检查
- 无退出条件的状态机设计
- 工具返回结果未被正确评估以决定是否继续

**项目中的风险:**
```
backend/src/services/agentEngine.js - ReAct执行循环若无maxTurns限制
backend/src/routes/multiagent.js (646行) - 多Agent协作可能死锁
```

**预防策略:**
```javascript
// 必须实现的最大迭代次数保护
const MAX_ITERATIONS = 50;
let iterations = 0;
while (iterations < MAX_ITERATIONS) {
  const result = await agent.step();
  if (result.isComplete) break;
  iterations++;
}
```

**检测方法:**
- 日志中出现连续 20+ 次同类型工具调用
- 单次请求 Token 消耗超过平均值的 10 倍
- `iteration_count` 指标超过阈值

**对应 Phase:** Phase 1 - Agent 执行循环保护

---

### 1.2 工具调用结果丢失

**问题描述:**
工具执行后结果未正确回填到上下文中，导致后续 Agent 无法基于结果决策。

**项目中的风险:**
```
backend/src/domain/agent/ToolExecutor.js (479行) - 需确认结果回填机制
backend/src/routes/tools.js - 30+工具返回格式可能不一致
```

**预防策略:**
- 标准化工具返回格式 `{ success: boolean, data: any, error?: string }`
- 工具结果必须追加到消息历史
- 添加结果验证层

**对应 Phase:** Phase 3 - 工具调用框架

---

### 1.3 取消机制缺失

**问题描述:**
用户取消请求后 Agent 继续执行已触发的工具调用，造成资源浪费和状态不一致。

**项目中的风险:**
`backend/src/services/agentEngine.js` - CLAUDE.md 提到已实现 `createCancelEvent/cancel/_checkCancelled`，需验证实际效果

**预防策略:**
- 使用 `EventEmitter` 模式传播取消信号
- 工具执行层检查取消状态
- 数据库操作使用事务取消

**检测方法:**
- 用户取消后仍有 SSE 流式输出
- 后台任务队列中存在已取消任务

**对应 Phase:** Phase 1 - 基础设施完善

---

### 1.4 上下文长度失控

**问题描述:**
多轮对话后上下文无限增长，导致推理变慢和 Token 成本爆炸。

**项目中的风险:**
- `services/memory.js` - 需确认滑动窗口或摘要策略
- 对话历史可能包含已失效的工具结果

**预防策略:**
- 实现 `MemoryWindowManager` 滑动窗口
- 设置 `MAX_CONTEXT_TOKENS` 硬限制
- 定期触发摘要而非等到溢出

**对应 Phase:** Phase 1 - 会话记忆管理

---

## 二、RAG 实现常见陷阱

### 2.1 向量降级返回假数据

**问题描述:**
Embedding 服务不可用时静默降级到模拟向量，返回无关结果欺骗用户。

**项目中的风险:**
```
backend/src/domain/search/channels/VectorSearchChannel.js
- 存在 _mockEmbed() 降级逻辑
- CONCERNS.md Concern 6: 生产环境可能静默返回非语义相似的假数据
```

**识别特征:**
- 相似度分数异常高但内容不相关
- 降级日志未触发告警
- 用户反馈"答非所问"

**预防策略:**
```javascript
// 严格模式：embedding 失败时拒绝查询
if (embeddingFailed && STRICT_MODE) {
  throw new Error('Vector search unavailable');
}
```

**检测方法:**
- 监控 `vector_fallback_count` 指标
- 添加"降级模式"到健康检查
- 定期抽查检索结果质量

**对应 Phase:** Phase 2 - RAG 核心能力

---

### 2.2 分块策略不合理

**问题描述:**
- 块过大：引入过多噪声，召回精度下降
- 块过小：丢失上下文，完整性差
- 块无重叠：跨块关键信息被截断

**项目中的风险:**
- `RAG_CHUNK_SIZE=512` (来自 .env.example) - 需验证是否适合 M2.7 模型
- `domain/rag/ingestion/` - 文档摄取 Pipeline 需确认分块策略

**预防策略:**
- 基于内容类型选择分块策略：代码块更小、文档更大
- 添加块重叠 (通常 10-20%)
- 保留元数据：标题、来源、页码

**对应 Phase:** Phase 2 - 文档入库流程

---

### 2.3 忽视重排序资源消耗

**问题描述:**
多路召回后直接使用 CrossEncoder 重排序，但 CrossEncoder 是 CPU 密集型操作，大流量时成为瓶颈。

**项目中的风险:**
```
backend/src/domain/rag/Reranker.js (828行)
- 多策略重排序：CrossEncoder/BM25/Semantic/Diversity
- 高并发时可能阻塞 SSE 流式响应
```

**预防策略:**
- 添加重排序超时：`rerank_timeout_ms = 500`
- 使用异步重排序，前端先展示初筛结果
- 限制重排序候选集大小：`top_k <= 20`

**对应 Phase:** Phase 2 - 检索后处理

---

### 2.4 幻觉 (Hallucination) 控制缺失

**问题描述:**
RAG 检索到无关内容时，模型仍强行生成流畅但错误的回答。

**识别特征:**
- 引用来源与回答内容不符
- 模型自信地陈述未在检索结果中出现的事实
- 无"未找到足够相关信息"的拒答机制

**预防策略:**
```javascript
// 必须实现的置信度检查
const relevanceScore = calculateRelevance(query, chunks);
if (relevanceScore < MIN_CONFIDENCE) {
  return { answer: "未找到足够相关信息", confidence: 0 };
}
```

**对应 Phase:** Phase 2 - RAG 核心能力

---

### 2.5 向量数据库生产参数未优化

**问题描述:**
Qdrant 使用默认配置，HNSW 参数、量化配置、索引策略未调优。

**项目中的风险:**
```
CONCERNS.md Concern 9:
- QDRANT_HOST=localhost, QDRANT_DIMENSION=1024
- 缺少 HNSW/DiskANN 配置
- 无备份策略和监控告警
```

**预防策略:**
- 生产环境配置 `hnsw，空间` 参数
- 启用向量量化 (`quantization:.Binary`)
- 设置 `on_disk: true` 处理大向量

**对应 Phase:** Phase 4 - 生产级能力

---

## 三、安全漏洞

### 3.1 提示词注入 (Prompt Injection)

**问题描述:**
用户输入中嵌入恶意指令，覆盖或绕过系统提示词。

**项目中的风险:**
- `/api/chat` 直接将用户输入注入 prompt
- 未对用户输入进行清洗
- 多 Agent 协作时提示词在 Agent 间传递可能被篡改

**预防策略:**
```javascript
// 输入清洗示例
function sanitizeUserInput(input) {
  // 移除明显的注入模式
  return input
    .replace(/^ignore previous instructions:/gi, '')
    .replace(/你现在是.*?说/gi, '')
    .trim();
}
```

**检测方法:**
- 监控包含 "ignore"、"forget"、"system" 的输入
- 对抗性输入测试集

**对应 Phase:** Phase 1 - 基础设施 (安全中间件)

---

### 3.2 API Key 泄露风险

**问题描述:**
- MiniMax API Key 存储在 sessionStorage (前端)，可被 XSS 访问
- 后端 .env 未加入 .gitignore
- API Key 硬编码在代码中

**项目中的风险:**
```
CONCERNS.md Concern 8:
- API Key 存储在 sessionStorage (XSS 可访问)
- .env.example 中有配置示例
```

**预防策略:**
- 使用 httpOnly cookie 存储 token
- 后端添加 API Key 轮换机制
- 添加请求来源验证
- 定期轮换 API Key

**对应 Phase:** Phase 1 - 安全加固

---

### 3.3 工具权限滥用

**问题描述:**
Agent 可调用任何已注册工具，包括危险操作 (删除文件、格式化数据库)。

**项目中的风险:**
- HITL 确认系统可能未覆盖所有危险工具
- `30+ 内置工具` 权限分级不明

**预防策略:**
- 工具分级：安全 / 需确认 / 禁止
- 添加每次调用的权限检查
- 敏感工具增加冷却时间

**对应 Phase:** Phase 3 - 工具调用框架

---

### 3.4 数据泄露

**问题描述:**
- RAG 检索结果包含敏感信息
- 对话历史被未授权访问
- 向量数据库被攻击

**预防策略:**
- RAG 检索前添加权限过滤
- 对话数据加密存储
- 向量数据库网络隔离

**对应 Phase:** Phase 4 - 生产级能力

---

## 四、性能问题

### 4.1 首包延迟过高

**问题描述:**
Agent 思考时间过长 (Tool calling planning, RAG retrieval)，用户等待首包超过 3 秒。

**项目中的风险:**
- SSE 流式响应可能因 RAG 多路检索变慢
- `miniMaxAgentRunner.js` 需确认是否有首包探测

**预防策略:**
- 流式输出先返回 "正在思考..." placeholder
- 并行执行 Tool planning 和 RAG retrieval
- 添加 `stream_first_token_timeout_ms = 3000`

**对应 Phase:** Phase 4 - 性能优化

---

### 4.2 并发连接数失控

**问题描述:**
SSE 长连接占用大量并发限额，后端负载飙升。

**项目中的风险:**
- 前端多个 Tab 同时打开
- `QueueRateLimiter` (477行) 需验证实际效果
- 无单用户并发限制

**预防策略:**
```javascript
// 每个用户最大并发 SSE 连接
const MAX_CONCURRENT_PER_USER = 3;
const userConnections = await getUserConnectionCount(userId);
if (userConnections >= MAX_CONCURRENT_PER_USER) {
  return res.status(429).json({ error: 'Too many connections' });
}
```

**对应 Phase:** Phase 4 - 限流保护

---

### 4.3 Token 消耗无上限

**问题描述:**
- 长对话上下文无限增长
- 批量任务重复消费 Token
- 重试逻辑放大 Token 消耗

**项目中的风险:**
- CLAUDE.md 提到 "Token 摘要管理"，需验证是否完整
- 无单请求 Token 上限保护

**预防策略:**
- 单请求 Token 上限：`MAX_REQUEST_TOKENS = 100000`
- 启用自动摘要：`window_size = 20 messages`
- 批量任务添加确认机制

**对应 Phase:** Phase 1 - Token 控制

---

### 4.4 数据库连接池耗尽

**问题描述:**
- `services/database.js` 连接池未优化
- 高并发时等待连接超时
- 慢查询阻塞连接池

**项目中的风险:**
```
CONCERNS.md Concern 10:
- 未看到连接池配置
- 慢查询无日志
```

**预防策略:**
```javascript
// PostgreSQL 连接池配置
{
  max: 20,        // 最大连接数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
}
```

**检测方法:**
- 监控 `db_pool_available` 指标
- 慢查询日志 (threshold: 1000ms)

**对应 Phase:** Phase 4 - 数据库优化

---

## 五、集成错误

### 5.1 API 路径前后端不一致

**问题描述:**
- 前端调用 `/documents/*`，后端路由是 `/docs/*`
- 组件声称 100% 完整但实际无后端对接

**项目中的风险:**
```
CONCERNS.md Pattern 1 - API路径不匹配:
- Bug 13: KnowledgeBase
- Bug 14: ToolRegistry
- Bug 15: AdminDashboard Stats
- Bug 17: IntentTreeEditor
- Bug 20: PromptTemplate
```

**预防策略:**
- 使用 OpenAPI 规范定义所有 API
- 前后端共享类型定义
- 添加 API 集成测试

**检测方法:**
```bash
# 自动检测路径不一致
npx openapi-validator
```

**对应 Phase:** Phase 4 - API 规范化

---

### 5.2 Mock 数据流入生产

**问题描述:**
开发时引入的模拟数据未移除，生产环境返回虚假结果。

**项目中的风险:**
```
CONCERNS.md Pattern 2 - 模拟数据未移除:
- Bug 7: SSE Service 返回 Lorem ipsum
- Bug 12: PerformanceMonitor 使用 Math.random()
- Bug 11: MissionControl 纯前端无后端
```

**完整 Mock 文件清单 (来自 CONCERNS.md):**
```
backend/src/routes/admin/trace.js       - generateMockTrace(), initMockTraces()
backend/src/routes/admin/prompt.js     - 模拟版本历史
backend/src/routes/multiagent.js       - mockLLMClient
backend/src/domain/agent/MCPToolRegistry.js - 模拟 MCP 工具发现
backend/src/domain/search/channels/VectorSearchChannel.js - _mockEmbed()
backend/src/routes/agentTrace.js       - 模拟执行结果
backend/src/routes/config.js           - require('../data/mockData')
```

**预防策略:**
```javascript
// 生产环境拒绝模拟数据
if (process.env.NODE_ENV === 'production') {
  if (hasMockData(response)) {
    throw new Error('Mock data detected in production');
  }
}
```

**验证方法:**
```bash
grep -r "mock\|Mock\|lorem\|Math.random()" backend/src/
```

**对应 Phase:** Phase 1 - Mock 清理

---

### 5.3 状态管理前后端不同步

**问题描述:**
- MissionControl 前端使用 Zustand store，后端无持久化
- 页面刷新后数据丢失
- 多端操作状态冲突

**项目中的风险:**
```
CONCERNS.md Bug 11: MissionControl 后端API完全缺失
```

**预防策略:**
- 所有状态操作必须经过后端 API
- 添加 WebSocket 实时同步
- 乐观更新 + 后端冲突解决

**对应 Phase:** Phase 5 - 体验完善

---

### 5.4 错误处理不一致

**问题描述:**
- 部分接口返回 200 + 错误对象，部分返回 4xx/5xx
- 前端未处理所有错误码
- 错误信息泄露内部实现

**预防策略:**
```javascript
// 统一错误响应格式
{
  success: false,
  error: {
    code: 'RAG_RETRIEVAL_FAILED',
    message: '检索服务暂时不可用',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  }
}
```

**对应 Phase:** Phase 1 - 统一错误体系

---

## 六、架构陷阱

### 6.1 业务逻辑沉没在 Routes 层

**问题描述:**
Routes 文件超过 200 行，包含业务逻辑，违反分层架构。

**项目中的风险:**
```
CONCERNS.md Concern 1:
- routes 代码总计 9,782 行
- 最大文件: routes/a2a.js (865行), routes/multiagent.js (646行)
- Phase 1 实际完成度约 60-70%
```

**识别特征:**
- Route 文件中直接调用 `MiniMax API`
- Route 文件中直接操作数据库
- Route 文件超过 150 行

**预防策略:**
```
Routes 层职责:
- 参数校验 (Joi/Zod)
- 路由分发
- 响应组装
- 错误处理

Services 层职责:
- 业务逻辑
- 数据访问
- 外部 API 调用
```

**对应 Phase:** Phase 1 未完成 - P0 优先级

---

### 6.2 单体架构的扩展瓶颈

**问题描述:**
所有 Agent 逻辑在单一进程，高并发时无法水平扩展。

**预防策略:**
- Agent 执行器抽象为独立 Worker
- 使用消息队列 (Redis/AMQP) 分发任务
- 添加健康检查和自动扩缩容

**对应 Phase:** Phase 4 - 生产级架构

---

## 七、检测清单

### Warning Signs (早期预警)

| 指标 | 阈值 | 可能问题 |
|------|------|----------|
| 单路由文件行数 | > 200 行 | 业务逻辑未下沉 |
| `grep "mock" count` | > 10 文件 | Mock 数据未清理 |
| `grep "console.log" count` | > 100 处 | 日志未规范化 |
| 单请求 Token 消耗 | > 平均 10x | 上下文失控 |
| SSE 连接数 | > 1000 | 并发失控 |
| RAG 降级次数 | > 0 (生产) | 向量服务异常 |
| 相似度分数 | > 0.95 但内容不相关 | 向量降级假数据 |
| Tool 调用无结果 | > 5% | 工具执行异常 |

---

### Prevention Strategies Summary

| Phase | 优先级 | 陷阱 | 策略 |
|-------|--------|------|------|
| Phase 1 | P0 | 业务逻辑在 Routes | 抽取到 services，精简 routes ≤150行 |
| Phase 1 | P0 | 无限循环 | 实现 maxIterations 保护 |
| Phase 1 | P1 | Mock 数据残留 | grep 清理，添加测试保护 |
| Phase 1 | P1 | 提示词注入 | 输入清洗，安全中间件 |
| Phase 1 | P1 | API Key 安全 | httpOnly cookie，轮换机制 |
| Phase 2 | P1 | 向量降级假数据 | 严格模式，拒绝查询 |
| Phase 2 | P1 | 幻觉控制 | 置信度检查，拒答机制 |
| Phase 3 | P2 | 工具权限滥用 | 分级权限，冷却时间 |
| Phase 4 | P2 | 首包延迟 | 并行执行，流式占位 |
| Phase 4 | P2 | Token 无上限 | 单请求上限，自动摘要 |
| Phase 4 | P2 | 数据库连接池 | 连接池配置，慢查询日志 |
| Phase 4 | P2 | 并发失控 | 单用户限流，队列缓冲 |
| Phase 5 | P3 | 状态不同步 | 后端 API 持久化，WebSocket |

---

## 八、项目特定风险映射

基于 CONCERNS.md 识别的风险:

| 风险 | 文件 | 陷阱类型 | 优先级 | Phase |
|------|------|----------|--------|-------|
| 业务逻辑未迁移 | routes/* (9782行) | 架构 | P0 | Phase 1 |
| Mock 数据残留 | trace.js, multiagent.js, 等 | 集成 | P1 | Phase 1 |
| 向量降级假数据 | VectorSearchChannel.js | RAG | P1 | Phase 2 |
| API 路径不匹配 | Bug 13-17, 20 | 集成 | P1 | Phase 4 |
| sessionStorage XSS | 前端存储 | 安全 | P1 | Phase 1 |
| 控制台日志残留 | 544处 console.* | 性能/安全 | P2 | Phase 1 |
| Qdrant 生产参数 | .env 配置 | 性能 | P2 | Phase 4 |
| 数据库连接池 | database.js | 性能 | P2 | Phase 4 |
| MissionControl 无后端 | routes/missionControl.js | 集成 | P2 | Phase 5 |
| MCP 工具市场 40% | routes/mcpAgent.js | 功能 | P2 | Phase 5 |

---

## 九、参考标准

- **OWASP LLM Top 10** - 2025 年 AI 安全威胁
- **Google SRE Handbook** - 可用性、性能最佳实践
- **LangGraph Best Practices** - Agent 循环设计
- **RAG Audit Framework** - 检索质量评估

---

## 十、后续行动

1. **立即 (本周):**
   - 确认 `agentEngine.js` 的 maxIterations 和取消机制
   - 清理 VectorSearchChannel.js 的 _mockEmbed() 降级逻辑
   - 添加 NODE_ENV=production 检查拒绝模拟数据

2. **短期 (本月):**
   - 完成 routes → services 业务逻辑迁移
   - 实现统一的错误响应格式
   - 添加 API 集成测试

3. **中期 (下季度):**
   - Phase 4 生产级能力：限流、监控、连接池
   - Phase 5 管理后台前后端联调

---

*文档更新: 2026-04-26*
*来源: 行业最佳实践 + CONCERNS.md 项目分析*
