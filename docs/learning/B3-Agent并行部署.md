# Agent 并行部署 - 多 Agent 协作架构

## 核心问题
如何让多个 Agent 并行工作？如何设计 Agent 协作系统？

## 为什么需要多 Agent？

### 单 Agent 的局限
```
任务: "分析竞品 A 和竞品 B 的优劣势"

单 Agent 串行:
1. 先分析竞品 A (10秒)
2. 再分析竞品 B (10秒)
3. 总计: 20秒

多 Agent 并行:
1. Agent-A 分析竞品 A (10秒)
2. Agent-B 分析竞品 B (10秒)
3. 汇总结果
4. 总计: 10秒 + 汇总(1秒) ≈ 11秒
```

### 加速效果
```
串行: T1 + T2 + T3 + ... = O(n)
并行: max(T1, T2, T3, ...) = O(1)
```

## 项目中的多 Agent 架构

### 文件位置
```
backend/src/services/MultiAgentCoordinator.js
backend/src/routes/a2a.js
backend/src/services/a2aService.js
```

### Agent 协调器
```javascript
// services/MultiAgentCoordinator.js
class MultiAgentCoordinator {
  constructor() {
    this.agents = new Map();  // agentId -> AgentInstance
    this.maxParallel = 10;    // 最大并行数
  }

  /**
   * 并行执行多个任务
   */
  async executeParallel(tasks) {
    // 1. 分批执行（控制并发数）
    const batches = this.createBatches(tasks, this.maxParallel);
    const results = [];

    for (const batch of batches) {
      // 2. 并行执行同一批次
      const batchResults = await Promise.all(
        batch.map(task => this.executeTask(task))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 执行单个任务
   */
  async executeTask(task) {
    const agent = this.getAgent(task.agentName);

    return await agent.run(task.prompt, {
      context: task.context,
      timeout: task.timeout || 60000
    });
  }
}
```

## A2A 协议 - Agent 间通信

### 什么是 A2A？
Agent-to-Agent 协议：让不同 Agent 能够相互通信和协作

### A2A 消息格式
```javascript
{
  "type": "task",              // 消息类型
  "id": "msg-123",             // 消息 ID
  "from": "agent-a",           // 发送方
  "to": "agent-b",             // 接收方
  "content": {
    "taskId": "task-456",
    "action": "delegate",
    "prompt": "请分析这个数据...",
    "context": {}
  }
}
```

### A2A 服务实现
```javascript
// services/a2aService.js
class A2AService {
  constructor() {
    this.messageQueue = [];
    this.handlers = new Map();
  }

  /**
   * 注册 Agent
   */
  registerAgent(agentId, agent) {
    this.agents.set(agentId, agent);
  }

  /**
   * 发送消息
   */
  async sendMessage(message) {
    const { to, content } = message;
    const targetAgent = this.agents.get(to);

    if (!targetAgent) {
      throw new Error(`Agent ${to} not found`);
    }

    // 路由到对应 Agent
    return await targetAgent.receive(content);
  }

  /**
   * 委托任务
   */
  async delegate(fromAgent, toAgent, task) {
    return await this.sendMessage({
      type: 'delegate',
      from: fromAgent,
      to: toAgent,
      content: {
        action: 'execute',
        task
      }
    });
  }
}
```

## 多 Agent 协作模式

### 模式 1: 主从模式 (Team Leader)
```
            ┌─────────────────┐
            │  Team Leader   │
            │   (主 Agent)   │
            └────────┬────────┘
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ Agent-A │ │ Agent-B │ │ Agent-C │
   │ 负责搜索 │ │ 负责分析 │ │ 负责验证 │
   └─────────┘ └─────────┘ └─────────┘
```

```javascript
async teamLeaderOrchestration(task) {
  // 1. 分解任务
  const subTasks = [
    { id: 1, type: 'search', prompt: '搜索竞品 A 信息' },
    { id: 2, type: 'search', prompt: '搜索竞品 B 信息' },
    { id: 3, type: 'analyze', prompt: '分析搜索结果' },
    { id: 4, type: 'validate', prompt: '验证结论' }
  ];

  // 2. 第一批：并行搜索
  const [resultsA, resultsB] = await Promise.all([
    this.executeTask(subTasks[0]),
    this.executeTask(subTasks[1])
  ]);

  // 3. 第二批：分析
  const analysis = await this.executeTask({
    ...subTasks[2],
    context: { resultsA, resultsB }
  });

  // 4. 第三批：验证
  const validation = await this.executeTask({
    ...subTasks[3],
    context: { analysis }
  });

  return { analysis, validation };
}
```

### 模式 2: 对等协作 (Collaborative)
```
┌─────────┐         ┌─────────┐
│ Agent-A │ ←──────→ │ Agent-B │
│ 擅长代码 │         │ 擅长文档 │
└─────────┘         └─────────┘
        ↑                 ↑
         ↑               ↑
          ↓             ↓
    ┌───────────────────┐
    │   结果汇总器        │
    └───────────────────┘
```

```javascript
async collaborativeWork(mainTask) {
  // 1. 主 Agent 分析任务，分配给专业 Agent
  const plan = await this.analyzeAndPlan(mainTask);

  // 2. 并行执行专业任务
  const specializedResults = await Promise.all(
    plan.subTasks.map(st => this.delegateToSpecialist(st))
  );

  // 3. 汇总结果
  return await this.summarize(specializedResults);
}

async delegateToSpecialist(task) {
  // 根据任务类型选择专业 Agent
  const specialist = this.selectSpecialist(task.type);
  return await this.delegate(task.from, specialist, task);
}
```

### 模式 3: 自主执行 (Autonomous)
```
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Agent-A │  │ Agent-B │  │ Agent-C │
│ 独立执行 │  │ 独立执行 │  │ 独立执行 │
└─────────┘  └─────────┘  └─────────┘
     ↓              ↓              ↓
  结果-A         结果-B         结果-C
     ↓              ↓              ↓
  ┌─────────────────────────────────────┐
  │           结果收集器                  │
  └─────────────────────────────────────┘
```

```javascript
async autonomousExecution(tasks) {
  // 1. 启动多个独立 Agent
  const agentPromises = tasks.map(task => {
    const agent = this.createAgent(task.type);
    return agent.run(task.prompt);
  });

  // 2. 并行等待所有结果
  const results = await Promise.all(agentPromises);

  // 3. 收集结果
  return this.collectResults(results);
}
```

## 10 个 Agent 并行执行

### 架构设计
```
                    ┌────────────────┐
                    │  任务分发器     │
                    │ (Task Router)  │
                    └───────┬────────┘
                            │
    ┌────────────────────────┼────────────────────────┐
    │                        │                        │
    ↓                        ↓                        ↓
┌─────────┐            ┌─────────┐            ┌─────────┐
│Agent-01 │            │Agent-02 │            │Agent-03 │
│ 数据收集│            │ 数据收集│            │ 数据收集│
└─────────┘            └─────────┘            └─────────┘
    ↓                        ↓                        ↓
┌─────────┐            ┌─────────┐            ┌─────────┐
│Agent-04 │            │Agent-05 │            │Agent-06 │
│ 数据分析│            │ 数据分析│            │ 数据分析│
└─────────┘            └─────────┘            └─────────┘
    ↓                        ↓                        ↓
┌─────────┐            ┌─────────┐            ┌─────────┐
│Agent-07 │            │Agent-08 │            │Agent-09 │
│ 结果验证│            │ 结果验证│            │ 结果验证│
└─────────┘            └─────────┘            └─────────┘
    ↓                        ↓                        ↓
    └────────────────────────┼────────────────────────┘
                             ↓
                    ┌────────────────┐
                    │   Agent-10     │
                    │   结果汇总     │
                    └────────────────┘
```

### 代码实现
```javascript
// 执行 10 个 Agent 并行任务
async execute10AgentsParallel(data) {
  const NUM_AGENTS = 10;
  const BATCH_SIZE = 5;  // 每批最多 5 个，避免资源耗尽

  // 阶段 1: 数据收集 (Agent 1-3)
  const collectionTasks = [
    { id: 1, agent: 'collector', data: data.sourceA },
    { id: 2, agent: 'collector', data: data.sourceB },
    { id: 3, agent: 'collector', data: data.sourceC }
  ];

  // 阶段 2: 数据分析 (Agent 4-6)
  const analysisTasks = [
    { id: 4, agent: 'analyzer', context: {} },
    { id: 5, agent: 'analyzer', context: {} },
    { id: 6, agent: 'analyzer', context: {} }
  ];

  // 阶段 3: 结果验证 (Agent 7-9)
  const validationTasks = [
    { id: 7, agent: 'validator', context: {} },
    { id: 8, agent: 'validator', context: {} },
    { id: 9, agent: 'validator', context: {} }
  ];

  // 阶段 4: 汇总 (Agent 10)
  const summaryTask = { id: 10, agent: 'summarizer', context: {} };

  // 分阶段执行
  const collections = await this.executeBatch(collectionTasks);
  const analyses = await this.executeBatch(analysisTasks, { collections });
  const validations = await this.executeBatch(validationTasks, { analyses });

  // 最终汇总
  return await this.executeTask({
    ...summaryTask,
    context: { validations }
  });
}

// 批量执行
async executeBatch(tasks, context = {}) {
  const results = [];

  for (let i = 0; i < tasks.length; i += 5) {
    const batch = tasks.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map(task => this.executeTask({
        ...task,
        context: { ...context, ...task.context }
      }))
    );
    results.push(...batchResults);
  }

  return results;
}
```

## Agent 生命周期管理

### Agent 状态机
```
        ┌──────────┐
        │ CREATING │
        └────┬─────┘
             ↓
        ┌──────────┐
    ┌──→│  IDLE   │←─────────────────┐
    │   └────┬─────┘                  │
    │        ↓                        │
    │   ┌──────────┐                   │
    │   │ RUNNING  │──────────────────┘ (出错重试)
    │   └────┬─────┘
    │        ↓
    │   ┌──────────┐
    │   │ WAITING  │ (等待资源/依赖)
    │   └────┬─────┘
    │        ↓
    │   ┌──────────┐
    └───│ COMPLETED│
        └──────────┘
```

### 健康检查与心跳
```javascript
class AgentLifecycleManager {
  constructor() {
    this.agents = new Map();
    this.heartbeatInterval = 30000;  // 30秒心跳
  }

  startHeartbeat(agentId) {
    const interval = setInterval(async () => {
      const agent = this.agents.get(agentId);
      if (!agent) {
        clearInterval(interval);
        return;
      }

      try {
        await agent.ping();
      } catch (error) {
        console.error(`Agent ${agentId} heartbeat failed:`, error);
        this.handleAgentFailure(agentId);
      }
    }, this.heartbeatInterval);
  }

  handleAgentFailure(agentId) {
    const agent = this.agents.get(agentId);
    agent.state = 'FAILED';

    // 通知协调器
    this.coordinator.notifyAgentFailure(agentId);
  }
}
```

## 部署注意事项

### 1. 资源限制
```javascript
const AGENT_CONFIG = {
  maxConcurrent: 10,        // 最大并发 Agent 数
  maxMemoryPerAgent: '512MB', // 每个 Agent 内存限制
  maxExecutionTime: 60000,   // 最大执行时间
  retryAttempts: 3          // 重试次数
};
```

### 2. 熔断保护
```javascript
// 单个 Agent 失败不影响其他 Agent
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 30000
});

async function safeExecuteAgent(task) {
  return circuitBreaker.execute(() => executeAgent(task));
}
```

### 3. 负载均衡
```javascript
// 选择负载最轻的 Agent
function selectAgent(taskType) {
  const available = this.agents
    .filter(a => a.type === taskType && a.state === 'IDLE')
    .sort((a, b) => a.currentLoad - b.currentLoad);

  return available[0];
}
```

## 新手常见问题

Q: 10 个 Agent 同时运行会崩吗？
A: 需要控制并发数、内存限制、设置熔断保护

Q: Agent 之间如何通信？
A: 通过 A2A 协议，有统一的消息格式和路由

Q: Agent 失败怎么办？
A: 设置重试机制、熔断保护、任务重新分配

## 延伸学习
- 项目 A2A 源码：`backend/src/services/a2aService.js`
- 项目协调器：`backend/src/services/MultiAgentCoordinator.js`
- Multi-Agent 论文：https://arxiv.org/abs/2308.10832
