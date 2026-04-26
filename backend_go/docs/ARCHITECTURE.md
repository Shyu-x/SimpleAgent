# GAgent Go 架构设计文档

## 一、系统架构概览

GAgent Go 采用分层架构设计，从上到下依次为：

```
┌─────────────────────────────────────────────────────────┐
│                    HTTP/REST API                         │
│                  (handlers + middleware)                 │
├─────────────────────────────────────────────────────────┤
│                   Application Layer                      │
│              (ChatOrchestrator, AgentOrchestrator)      │
├─────────────────────────────────────────────────────────┤
│                     Domain Layer                        │
│         (Agent, RAG, Model, Search, A2A, HITL)         │
├─────────────────────────────────────────────────────────┤
│                  Infrastructure Layer                    │
│    (CircuitBreaker, RateLimiter, Metrics, Alert)       │
├─────────────────────────────────────────────────────────┤
│                    External Services                     │
│           (MiniMax API, Redis, Qdrant)           │
└─────────────────────────────────────────────────────────┘
```

## 二、核心组件

### 2.1 Domain Layer (领域层)

#### Agent 模块 (`internal/domain/agent/`)
- **Executor**: ReAct 执行循环核心
  - `Execute()`: 同步执行
  - `StreamExecute()`: 流式执行
  - `Cancel()`: 取消执行
- **ToolExecutor**: 工具执行器
  - `Register()`: 注册工具
  - `Execute()`: 执行工具
- **MemoryService**: 对话记忆管理
  - 滑动窗口记忆
  - 自动摘要

#### RAG 模块 (`internal/domain/rag/`)
- **Retriever**: 检索器接口
- **HybridRetriever**: 混合检索（向量+关键词）
- **Reranker**: 多策略重排序
  - CrossEncoderReranker
  - BM25Reranker
  - SemanticReranker

#### Model 模块 (`internal/domain/model/`)
- **Model**: 模型接口抽象
- **Router**: 模型路由
- **Registry**: 模型注册表

### 2.2 Infrastructure Layer (基础设施层)

#### CircuitBreaker (`internal/infra/circuitbreaker/`)
```
State: Closed → Open → HalfOpen → Closed
```
- **FailureThreshold**: 失败阈值（默认5）
- **SuccessThreshold**: 成功阈值（默认3）
- **RecoveryTimeout**: 恢复超时（默认30秒）

#### RateLimiter (`internal/infra/ratelimiter/`)
- 令牌桶算法
- 支持 Redis 分布式限流
- 并发信号量控制

#### MetricsCollector (`internal/infra/metrics/`)
- Prometheus 格式指标
- HTTP 请求计数
- Agent 执行统计
- RAG 检索性能

#### AlertManager (`internal/infra/alert/`)
- 告警级别: Critical / Warning / Info
- 告警通道: 日志 / Webhook

### 2.3 Application Layer (应用编排层)

#### ChatOrchestrator (`internal/application/chat_orchestrator.go`)
- 聊天请求编排
- 模型调用封装
- 流式响应处理

#### AgentOrchestrator (`internal/application/agent_orchestrator.go`)
- Agent 任务编排
- 工具调用协调
- 结果聚合

## 三、数据流

### 3.1 聊天请求流程

```
用户请求 → HTTP Handler → Middleware (限流/熔断)
    ↓
ChatOrchestrator.Chat()
    ↓
Model.Chat() (with CircuitBreaker)
    ↓
SSE Response / JSON Response
```

### 3.2 Agent 执行流程

```
用户输入 → IntentResolver (意图识别)
    ↓
MemoryService.GetMessages() (获取记忆)
    ↓
buildMessages() (构建消息)
    ↓
ReAct Loop:
    ├─ Model.Chat() → 检查工具调用
    │   ├─ 无工具调用 → 返回结果
    │   └─ 有工具调用 → ToolExecutor.Execute()
    │       ↓
    │       添加工具结果到消息
    │       ↓
    │       继续下一轮迭代
    │
    ├─ 检查取消信号
    ├─ 检查超时
    └─ 检查最大迭代次数
    ↓
返回 ExecuteResult
```

### 3.3 RAG 检索流程

```
用户查询 → QueryRewriteService (问题改写)
    ↓
QueryDecomposeService (问题分解)
    ↓
并行执行:
    ├─ VectorStore.Search() (向量检索)
    └─ KeywordSearch.Search() (关键词检索)
    ↓
HybridRetriever.mergeResults() (RRF融合)
    ↓
Reranker.Rerank() (重排序)
    ↓
返回 Top-K 结果
```

## 四、设计模式

### 4.1 策略模式
- `Retriever` 接口多种实现
- `Reranker` 多策略重排序
- `RateLimiter` 多种限流算法

### 4.2 工厂模式
- `ModelClientFactory`: 模型客户端创建
- `CircuitBreakerFactory`: 熔断器创建

### 4.3 责任链模式
- Middleware 链式调用
- RAG 后处理器链

### 4.4 观察者模式
- CircuitBreaker 状态变更通知
- AlertManager 告警订阅

### 4.5 注册表模式
- `ToolRegistry`: 工具注册表
- `ModelRegistry`: 模型注册表

## 五、容错机制

### 5.1 熔断器
```
正常请求:
    Request → CircuitBreaker → Service

失败累积到阈值:
    CircuitBreaker OPEN
    Request → 快速返回错误

等待 RecoveryTimeout:
    CircuitBreaker HALF_OPEN
    允许部分请求通过

连续成功:
    CircuitBreaker CLOSED
```

### 5.2 限流
```
令牌桶:
    tokens += rate * elapsed
    if tokens >= 1:
        tokens--
        允许请求
    else:
        拒绝请求
```

### 5.3 重试
- 指数退避策略
- 最大重试次数限制
- 熔断期间跳过重试

## 六、监控指标

### 6.1 HTTP 指标
- `http_requests_total{method, path, status}`
- `http_request_duration_seconds{method, path}`

### 6.2 Agent 指标
- `agent_executions_total{status}`
- `agent_execution_duration_seconds`
- `agent_tool_calls_total{tool_name}`

### 6.3 RAG 指标
- `rag_retrieval_duration_seconds`
- `rag_retrieval_results_count`

### 6.4 熔断器指标
- `circuitbreaker_state{name, state}`
- `circuitbreaker_requests_total{name}`

## 七、扩展性

### 7.1 添加新模型
1. 实现 `model.Model` 接口
2. 在 `ModelRegistry` 注册
3. 配置路由策略

### 7.2 添加新工具
1. 实现工具 Handler
2. 在 `ToolRegistry` 注册
3. 定义工具 Schema

### 7.3 添加新检索通道
1. 实现 `Retriever` 接口
2. 在 `SearchCoordinator` 注册
3. 配置通道权重
