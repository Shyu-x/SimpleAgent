# Agent 架构与性能评估

> 文档版本: v2.1.0
> 更新日期: 2026-03-20

---

## 一、核心架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AgentEngine                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        执行循环 (ReAct Loop)                          │   │
│  │                                                                     │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐        │   │
│  │   │ Reason  │───▶│  Act    │───▶│ Observe │───▶│ Reflect │        │   │
│  │   │  思考   │    │  行动   │    │  观察   │    │  反思   │        │   │
│  │   └─────────┘    └─────────┘    └─────────┘    └─────────┘        │   │
│  │        │                                            │               │   │
│  │        │              ┌─────────┐                  │               │   │
│  │        └─────────────▶│ Continue│◀─────────────────┘               │   │
│  │                       │  决策   │                                    │   │
│  │                       └─────────┘                                    │   │
│  │                              │                                       │   │
│  │                              ▼                                       │   │
│  │                       ┌─────────────┐                                │   │
│  │                       │   Finish    │                                │   │
│  │                       │    结束     │                                │   │
│  │                       └─────────────┘                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │   ToolRegistry   │  │    Memory        │  │  SemanticMemory  │         │
│  │   工具注册表      │  │    短期记忆      │  │   语义记忆       │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │ StatePersistence │  │FileCheckpoint    │  │   HITLManager    │         │
│  │  状态持久化       │  │  文件检查点      │  │  人机确认        │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │   A2AService     │  │   AgentLogger    │  │  SessionNote    │         │
│  │  Agent间通信      │  │   结构化日志     │  │  持久化笔记     │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 组件说明

| 组件 | 类名 | 职责 |
|------|------|------|
| 执行引擎 | `AgentEngine` | 核心 ReAct 循环 orchestration |
| 工具注册表 | `ToolRegistry` | 工具注册、选择、调用 |
| 短期记忆 | `MemoryService` | 对话历史管理 |
| 语义记忆 | `SemanticMemory` | 向量嵌入存储与检索 |
| 状态持久化 | `StatePersistence` | 会话状态管理 |
| 文件检查点 | `FileCheckpointManager` | 故障恢复点 |
| 人机确认 | `HITLManager` | 危险操作确认 |
| A2A通信 | `A2AService` | 多Agent协作 |
| 结构化日志 | `AgentLogger` | JSON Lines日志 |
| 持久化笔记 | `SessionNoteTool` | 长期记忆 |

### 1.3 ReAct 循环状态机

```
                    ┌──────────────────────────────────────┐
                    │                                       │
                    ▼                                       │
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐   │
│ REASON  │───▶│   ACT   │───▶│ OBSERVE │───▶│ REFLECT │   │
│  思考   │    │  执行   │    │  记录   │    │  评估   │   │
└─────────┘    └─────────┘    └─────────┘    └─────────┘   │
                                                           │
                    ┌──────────────────────────────────────┤
                    │                                      │
                    ▼                                      ▼
             ┌─────────────┐                       ┌─────────────┐
             │  CONTINUE   │                       │   FINISH    │
             │   继续循环  │                       │    结束     │
             └─────────────┘                       └─────────────┘
```

---

## 二、执行时序图

### 2.1 完整执行时序

```
用户                    AgentEngine              ToolRegistry           LLM
 │                          │                       │                   │
 │───execute(task)─────────▶│                       │                   │
 │                          │───createCancelEvent──▶│                   │
 │                          │───startNewRun────────│                   │
 │                          │                       │                   │
 │                          │                       │───listTools()─────▶│
 │                          │                       │◀──tools───────────│
 │                          │                       │                   │
 │                          │  Loop Start (maxIterations)               │
 │                          │                       │                   │
 │                          │───think()───────────▶│                   │
 │                          │                       │───selectTool()───▶│
 │                          │                       │◀──selectedTool────│
 │                          │◀──thought─────────────│                   │
 │                          │                       │                   │
 │                          │──act(toolName, input)│                   │
 │                          │                       │                   │
 │                          │                       │──execute(input)──▶│
 │                          │                       │◀──result──────────│
 │                          │◀──actionResult───────│                   │
 │                          │                       │                   │
 │                          │──reflect()───────────│                   │
 │                          │                       │                   │
 │                          │   ┌─success?─────────┤                   │
 │                          │   │                  │                   │
 │                          │   ├─retry────────────│                   │
 │                          │   ├─finish──────────│                   │
 │                          │   └─stop────────────│                   │
 │                          │                       │                   │
 │                          │───saveCheckpoint()───│                   │
 │                          │                       │                   │
 │◀──results───────────────│                       │                   │
```

### 2.2 工具执行时序 (含重试与超时)

```
AgentEngine              withRetry              withTimeout           Tool
      │                      │                      │                  │
      │──execute()──────────▶│                      │                  │
      │                      │                      │                  │
      │                      │──attempt 1──────────▶│                  │
      │                      │                      │──tool.execute()─▶│
      │                      │                      │     (timeout)    │
      │                      │                      │◀──TimeoutError───│
      │                      │                      │                  │
      │                      │◀──exponential backoff│                  │
      │                      │                      │                  │
      │                      │──attempt 2──────────▶│                  │
      │                      │                      │──tool.execute()─▶│
      │                      │                      │◀──result──────────│
      │                      │                      │                  │
      │                      │◀──success───────────│                  │
      │                      │                      │                  │
      │◀──result─────────────│                      │                  │
```

### 2.3 检查点保存时序

```
AgentEngine          FileCheckpointManager      StatePersistence
      │                      │                      │
      │──save(sessionId)────▶│                      │
      │                      │──write file─────────▶│
      │                      │                      │
      │                      │◀──success───────────│
      │                      │                      │
      │◀──checkpoint saved──│                      │
      │                      │                      │
      │         ...          │                      │
      │                      │                      │
      │──resume(sessionId)───▶│                      │
      │                      │──read file───────────▶│
      │                      │◀──state──────────────│
      │                      │                      │
      │◀──resumed────────────│                      │
```

---

## 三、运行流程图

### 3.1 主执行流程

```
┌─────────────────────────────────────────────────────────────────┐
│                         execute(task)                            │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. 初始化                                                       │
│  ├── 创建会话 (StatePersistence)                                 │
│  ├── 启动日志 (AgentLogger.startNewRun)                         │
│  ├── 初始化消息列表 (messages)                                   │
│  └── 重置状态 (status=running)                                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Agent 主循环 (for i in maxIterations)                       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  2.1 前置检查                                              │  │
│  │  ├── _checkCancelled() → 取消事件检查                      │  │
│  │  ├── _summarizeMessages() → Token 超限检查                  │  │
│  │  └── status === 'paused' → 暂停检查                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                │                                │
│                                ▼                                │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  2.2 Think (思考阶段)                                      │  │
│  │  ├── reason() → 分析任务，决定是否完成                      │  │
│  │  └── _selectToolWithLLM() → 选择工具                       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                │                                │
│                    ┌───────────┴───────────┐                     │
│                    ▼                       ▼                      │
│            ┌───────────────┐       ┌───────────────┐            │
│            │ type ===     │       │ type ===     │            │
│            │   'finish'   │       │   'action'   │            │
│            └───────────────┘       └───────────────┘            │
│                    │                       │                     │
│                    ▼                       ▼                     │
│            ┌───────────────┐       ┌───────────────┐            │
│            │  完成返回     │       │  Act (行动)   │            │
│            │ results.success│       │              │            │
│            │    = true    │       │ act(tool,    │            │
│            │              │       │   input)     │            │
│            └───────────────┘       └───────────────┘            │
│                                                │                │
│                                                ▼                │
│                                    ┌─────────────────────┐      │
│                                    │  2.3 Act 执行       │      │
│                                    │  ├── HITL检查       │      │
│                                    │  ├── withTimeout    │      │
│                                    │  └── 返回结果       │      │
│                                    └─────────────────────┘      │
│                                                │                │
│                                                ▼                │
│                                    ┌─────────────────────┐      │
│                                    │  2.4 Reflect 反思  │      │
│                                    │  ├── success?      │      │
│                                    │  ├── retry?        │      │
│                                    │  ├── finish?       │      │
│                                    │  └── stop?         │      │
│                                    └─────────────────────┘      │
│                                                │                │
│                                                ▼                │
│                                    ┌─────────────────────┐      │
│                                    │  2.5 检查点保存    │      │
│                                    │  saveFileCheckpoint│      │
│                                    └─────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. 循环结束                                                      │
│  ├── 达到最大迭代次数 → results.finalResult = "未完成"            │
│  └── 状态持久化 → _storeSemanticMemory()                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. 返回结果                                                      │
│  { success, finalResult, iterations, toolCalls, error }         │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 取消流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      取消请求 (cancel)                            │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  cancel()                                                        │
│  └── this.cancelEvent.cancelled = true                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  下次循环迭代 (_checkCancelled() 返回 true)                       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  if (_checkCancelled()) {                                  │  │
│  │    _cleanupIncompleteMessages(messages);  // 保留已完成步骤  │  │
│  │    if (_cancelCallback) _cancelCallback();                 │  │
│  │    return 'Task cancelled';                                │  │
│  │  }                                                        │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、性能评估体系

### 4.1 核心性能指标

| 指标 | 描述 | 计算方式 | 目标值 |
|------|------|----------|--------|
| **执行成功率** | 任务成功完成的比例 | `success_count / total_count` | > 95% |
| **平均迭代次数** |完成任务所需的平均循环次数 | `sum(iterations) / total_count` | 越少越好 |
| **工具调用效率** | 每次工具调用的价值 | `successful_tools / total_tools` | > 85% |
| **Token 消耗率** | Token 使用效率 | `output_tokens / input_tokens` | 合理范围 |
| **平均响应延迟** | 从请求到完成的时间 | `sum(latency) / count` | < 5s |
| **摘要触发率** | Token 摘要的触发频率 | `summarize_count / total_count` | < 20% |

### 4.2 性能测试方法

#### 4.2.1 单元级测试

```javascript
// 测试工具执行性能
async function benchmarkToolExecution(toolName, iterations = 100) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await tool.execute(testInput);
    times.push(Date.now() - start);
  }
  return {
    avg: times.reduce((a, b) => a + b) / times.length,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99)
  };
}
```

#### 4.2.2 集成测试

```javascript
// Agent 端到端性能测试
async function benchmarkAgentExecution(tasks, config) {
  const results = [];
  for (const task of tasks) {
    const agent = new AgentEngine(config);
    const start = Date.now();
    const result = await agent.execute(task);
    results.push({
      task,
      latency: Date.now() - start,
      iterations: result.iterations,
      success: result.success,
      toolCalls: result.toolCalls.length
    });
  }
  return aggregateResults(results);
}
```

#### 4.2.3 压力测试

```javascript
// 并发压力测试
async function stressTest(agent, tasks, concurrency = 10) {
  const batch = tasks.slice(0, concurrency);
  const promises = batch.map(task => agent.execute(task));
  const results = await Promise.allSettled(promises);
  return {
    total: tasks.length,
    succeeded: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    avgLatency: calculateAvgLatency(results)
  };
}
```

### 4.3 性能数据采集

```javascript
// 在 agentEngine.js 中采集性能数据
class PerformanceMetrics {
  constructor() {
    this.metrics = {
      executionCount: 0,
      successCount: 0,
      totalIterations: 0,
      totalLatency: 0,
      toolCallStats: new Map(),
      tokenUsage: { input: 0, output: 0 },
      errorCount: 0,
      cancelCount: 0
    };
  }

  recordExecution(result, latency) {
    this.metrics.executionCount++;
    if (result.success) this.metrics.successCount++;
    this.metrics.totalIterations += result.iterations;
    this.metrics.totalLatency += latency;
  }

  recordToolCall(toolName, success, latency) {
    const stats = this.metrics.toolCallStats.get(toolName) || { count: 0, success: 0, totalLatency: 0 };
    stats.count++;
    if (success) stats.success++;
    stats.totalLatency += latency;
    this.metrics.toolCallStats.set(toolName, stats);
  }

  getReport() {
    return {
      successRate: this.metrics.successCount / this.metrics.executionCount,
      avgIterations: this.metrics.totalIterations / this.metrics.executionCount,
      avgLatency: this.metrics.totalLatency / this.metrics.executionCount,
      toolEfficiency: this.calculateToolEfficiency(),
      errorRate: this.metrics.errorCount / this.metrics.executionCount
    };
  }
}
```

### 4.4 日志分析

```bash
# 分析日志获取性能数据
cat logs/agent/run_*.json | jq '
  select(.type == "step_end") |
  {
    step: .step,
    elapsed: .elapsedMs
  }
' | jq -s '{
  total: length,
  avgStepTime: (map(.elapsed) | add / length),
  p95: (map(.elapsed) | sort |.[floor(length * 0.95)])
}'
```

### 4.5 性能优化建议

| 阶段 | 优化项 | 预期效果 |
|------|--------|----------|
| 思考 | 缓存 LLM 响应 | 减少 30% LLM 调用 |
| 工具选择 | 优化选择算法 | 减少迭代次数 |
| 执行 | 并行工具调用 | 减少 40% 延迟 |
| 摘要 | 增加 Token 限制 | 减少摘要频率 |
| 检查点 | 异步保存 | 减少 20% I/O 阻塞 |

---

## 五、架构优缺点

### 5.1 优点

1. **ReAct 模式清晰** - Think/Act/Observe/Reflect 循环明确
2. **多种记忆机制** - 短期(对话)、长期(语义)、持久化(Session Note)
3. **完善的容错** - 检查点恢复、取消机制、重试机制
4. **人机协作** - HITL 确认危险操作
5. **多Agent支持** - A2A 协议协作

### 5.2 缺点

1. **单线程执行** - 工具串行执行，无法并行
2. **无流式输出** - 必须等待完整结果
3. **摘要实现简单** - 仅用字符数估算，非精确 Token 计数
4. **缺少监控** - 无实时指标 dashboard

### 5.3 改进方向

- [ ] 工具并行执行 (Promise.all)
- [ ] SSE 流式响应
- [ ] tiktoken 精确 Token 计数
- [ ] 实时性能监控 Dashboard
- [ ] 自适应迭代次数

---

**文档更新**: 2026-03-20 (v2.1.0)
