# Agent 知识体系 - 完整系统指南

> 本文档是 Agent 知识体系的主入口，系统整合了 ReAct 执行循环、工具系统、记忆系统、多 Agent 协作、RAG 增强等核心概念，并包含面试高频问题。

---

## 一、Agent 知识体系全景图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Agent 知识体系                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                     1. Agent 基础概念                               │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │ │
│  │  │什么是Agent│ │ 核心组件 │ │  vs LLM │ │ 框架对比 │ │ 面试题  │     │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                    ↓                                    │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    2. ReAct 执行循环                                │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │ │
│  │  │Reason   │ │ Act     │ │Observe  │ │Reflect  │ │ 自我纠错│     │ │
│  │  │ 推理    │ │ 行动    │ │ 观察    │ │ 反思    │ │ 重试机制│     │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                    ↓                                    │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                      3. 工具系统 Tool                               │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │ │
│  │  │ 工具定义 │ │ 工具注册 │ │ 工具执行 │ │MCP协议  │ │ 工具选择│     │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                    ↓                                    │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                      4. Memory 记忆系统                             │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │ │
│  │  │Working  │ │ Session  │ │Persistent│ │Token    │ │ 摘要    │     │ │
│  │  │ 记忆    │ │ 记忆    │ │ 记忆    │ │ 控制    │ │ 压缩    │     │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                    ↓                                    │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    5. RAG 检索增强                                  │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │ │
│  │  │Query    │ │Multi-   │ │Rerank   │ │ 幻觉    │ │ 引用    │     │ │
│  │  │Rewrite  │ │Channel  │ │ 精排    │ │ 减少    │ │ 追溯    │     │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                    ↓                                    │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    6. 多 Agent 协作                                 │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │ │
│  │  │ A2A协议 │ │ 主从模式│ │ 对等协作│ │ 自主执行│ │10并行   │     │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 二、Agent 基础概念

### 2.1 什么是 Agent？

**Agent = LLM + Planning + Memory + Tools**

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Agent = 大脑 + 工具 + 记忆                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                         ┌─────────────────┐                          │
│                         │     Agent       │                          │
│                         └────────┬────────┘                          │
│                                  │                                   │
│     ┌────────────────────────────┼────────────────────────────┐    │
│     │                            │                            │    │
│     ↓                            ↓                            ↓    │
│ ┌────────┐               ┌────────────┐               ┌────────┐    │
│ │  LLM   │               │  Planning  │               │ Memory │    │
│ │ 大脑   │               │   规划     │               │  记忆  │    │
│ └────────┘               └────────────┘               └────────┘    │
│                                  │                                   │
│                         ┌────────────┐                               │
│                         │   Tools    │                               │
│                         │   工具集   │                               │
│                         └────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘
```

### 面试高频问题：Agent vs 普通 LLM 的区别

| 维度 | 普通 LLM | Agent |
|------|----------|-------|
| **交互方式** | 一次性输入输出 | 多轮交互、循环执行 |
| **工具使用** | 不可 | 可调用外部工具 |
| **记忆** | 无状态 | 有状态、会累积上下文 |
| **自主性** | 低 | 高，可自主决策 |
| **执行流程** | 单一生成 | ReAct 循环 |

### 2.2 Agent 核心组件

```javascript
/**
 * Agent 核心组件
 */
class Agent {
  constructor() {
    // 1. 大脑 - LLM
    this.llm = new ChatModel();

    // 2. 规划 - ReAct 循环
    this.reactEngine = new ReActEngine();

    // 3. 记忆 - 多层 Memory
    this.memory = {
      working: new WorkingMemory(),      // 当前上下文
      session: new SessionMemory(),       // 会话记忆
      persistent: new PersistentMemory()   // 持久记忆
    };

    // 4. 工具 - Tool Registry
    this.tools = new ToolRegistry();

    // 5. 状态机
    this.state = 'IDLE';
  }
}
```

### 2.3 主流 Agent 框架对比（面试必备）

| 框架 | 开发方 | 特点 | 适用场景 | 评分热度 |
|------|--------|------|----------|----------|
| **LangGraph** | LangChain | 状态机、检查点、循环 | 复杂工作流 | ⭐⭐⭐⭐⭐ |
| **AutoGen** | Microsoft | 多 Agent 协作、对话 | 多角色场景 | ⭐⭐⭐⭐⭐ |
| **CrewAI** | CrewAI | Role-based、并行执行 | 多角色协作 | ⭐⭐⭐⭐ |
| **Dify** | 开源 | 可视化、RAG + Agent | 企业应用 | ⭐⭐⭐⭐ |
| **Coze** | 字节 | 插件生态、Bot | 聊天机器人 | ⭐⭐⭐⭐ |
| **扣子** | 字节 | 国内版 Coze | 国内用户 | ⭐⭐⭐⭐ |
| **AppAgent** | 开源 | 手机/电脑自动化 | 自动化操作 | ⭐⭐⭐ |

**面试加分回答**：
```
"我在项目中参考了 LangGraph 的状态机设计，自己实现了类似的多 Agent 协作系统。
每个 Agent 有明确的状态转换（IDLE → RUNNING → WAITING → COMPLETED），
配合熔断器和限流器保证系统稳定性。"
```

### 2.4 你对 AI Agent 的了解？（面试回答模板）

```
标准回答结构：
1. 定义：Agent = LLM + Planning + Memory + Tools
2. 核心能力：自主决策、工具调用、多轮对话
3. 执行流程：ReAct 循环（Reason → Act → Observe → Reflect）
4. 项目实践：我在 XX 项目中实现了 XX 功能
5. 框架了解：LangGraph/AutoGen/CrewAI 的特点
```

---

## 三、ReAct 执行循环（核心）

### 3.1 为什么 Agent 需要循环执行？

```
用户: "帮我查北京今天的天气，并告诉我应该穿什么"

一次性生成的问题：
"北京今天 25°C，晴天。建议穿短袖..."

问题：
✗ 如果天气 API 调用失败怎么办？
✗ 如何知道用户的性别/偏好？
✗ 25°C 是摄氏还是华氏？
✗ 建议是否适合用户的场景？
```

### 3.2 ReAct 循环详解

**R**eason → **A**ct → **O**bserve → **R**eflect

```
                    ┌─────────────────────────────┐
                    │           开始              │
                    └─────────────┬───────────────┘
                                  ↓
          ┌─────────────────────────────────────────┐
          │      1. Reason (推理)                  │
          │  分析问题 → 决定是否需要调用工具           │
          └─────────────────────┬───────────────────┘
                                ↓
          ┌─────────────────────────────────────────┐
          │        2. Act (行动)                    │
          │  调用工具 或 生成回复                     │
          └─────────────────────┬───────────────────┘
                                ↓
          ┌─────────────────────────────────────────┐
          │       3. Observe (观察)                 │
          │  获取工具返回结果                         │
          └─────────────────────┬───────────────────┘
                                ↓
          ┌─────────────────────────────────────────┐
          │       4. Reflect (反思)                │
          │  评估是否已达到目标                       │
          └─────────────────────┬───────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ↓                               ↓
            未完成                             完成
                ↓                               ↓
            继续循环                           返回
```

### 3.3 项目中的完整实现

```javascript
// backend/src/services/agentEngine.js
class AgentEngine {
  constructor(options = {}) {
    this.maxTurns = options.maxTurns || 50;      // 最大循环次数
    this.llm = options.llm;                        // LLM 客户端
    this.tools = options.tools;                    // 工具列表
    this.toolExecutor = options.toolExecutor;      // 工具执行器
    this.cancelEvent = null;                       // 取消事件
  }

  /**
   * Agent 主循环
   */
  async run(userMessage, context = {}) {
    const messages = [{ role: 'user', content: userMessage }];
    let turn = 0;
    let done = false;

    while (turn < this.maxTurns && !done) {
      turn++;

      // 取消检查
      if (this._checkCancelled()) {
        return { cancelled: true };
      }

      // 1. Reason: LLM 生成响应
      const response = await this._generate(messages);

      // 2. Act: 执行决策
      if (response.tool_calls && response.tool_calls.length > 0) {
        // 有工具调用
        for (const toolCall of response.tool_calls) {
          try {
            // 带重试的工具执行
            const result = await this._executeWithRetry(
              toolCall.name,
              toolCall.arguments
            );

            // 3. Observe: 添加工具结果到消息历史
            messages.push({
              role: 'tool',
              name: toolCall.name,
              content: JSON.stringify(result)
            });
          } catch (error) {
            // 工具执行失败，记录错误
            messages.push({
              role: 'tool',
              name: toolCall.name,
              content: JSON.stringify({ error: error.message })
            });
          }
        }
      } else {
        // 没有工具调用，返回结果
        done = true;
        return {
          content: response.content,
          turns: turn
        };
      }

      // 4. Reflect: 检查是否继续（下一轮 LLM 判断）
    }

    throw new Error(`Agent 执行超出最大轮次限制 (${this.maxTurns})`);
  }

  /**
   * 带重试的执行
   */
  async _executeWithRetry(name, args, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.toolExecutor.execute(name, args);
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        // 指数退避
        await this._sleep(Math.pow(2, i) * 1000);
      }
    }
  }

  /**
   * 取消机制
   */
  createCancelEvent() {
    this.cancelEvent = new EventEmitter();
    return this.cancelEvent;
  }

  cancel() {
    if (this.cancelEvent) {
      this.cancelEvent.emit('cancel');
    }
  }

  _checkCancelled() {
    // 在循环中定期检查是否有取消信号
    return false; // 简化实现
  }
}
```

### 面试高频问题

**Q: 循环多少次是合理的？**
```
A: 一般 10-50 次，需要设置 maxTurns 防止无限循环
   - 简单任务：5-10 次
   - 复杂任务：20-50 次
   - 设置上限是必要的保护
```

**Q: 工具调用失败怎么办？**
```
A: 实现重试机制 + 错误返回给 LLM 决定
   1. 捕获异常
   2. 重试 3 次（指数退避）
   3. 仍失败则返回错误信息
   4. LLM 决定是否换工具或放弃
```

**Q: ReAct 和 Agent 是什么关系？**
```
A: ReAct 是 Agent 的执行模式
   - ReAct = Reasoning + Acting 循环
   - Agent = LLM + ReAct + Memory + Tools
```

---

## 四、工具系统 Tool

### 4.1 工具接口定义

```javascript
/**
 * 工具基类
 */
class Tool {
  constructor(name, description, parameters) {
    this.name = name;
    this.description = description;  // LLM 据此决定是否调用
    this.parameters = parameters;    // JSON Schema
  }

  /**
   * 执行工具
   * @param {object} args - 参数
   * @returns {Promise<object>} 执行结果
   */
  async execute(args) {
    throw new Error('Tool.execute() must be implemented');
  }
}

/**
 * 天气工具示例
 */
class WeatherTool extends Tool {
  constructor() {
    super(
      'weather',
      '获取指定城市的天气信息，返回温度、湿度、天气状况',
      {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称，如"北京"、"上海"'
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            default: 'celsius'
          }
        },
        required: ['city']
      }
    );
  }

  async execute({ city, unit = 'celsius' }) {
    const response = await fetch(`/api/weather?q=${city}`);
    const data = await response.json();
    return {
      city: data.name,
      temperature: unit === 'celsius' ? data.temp : data.temp * 9/5 + 32,
      humidity: data.humidity,
      condition: data.condition
    };
  }
}
```

### 4.2 工具注册与发现

```javascript
// services/tools/toolRegistry.js
class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(tool) {
    this.tools.set(tool.name, tool);
  }

  get(name) {
    return this.tools.get(name);
  }

  getAll() {
    return Array.from(this.tools.values());
  }

  // 获取工具列表（用于 LLM 的 function calling）
  getToolDefinitions() {
    return this.getAll().map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }
}

// 注册工具
const registry = new ToolRegistry();
registry.register(new WeatherTool());
registry.register(new CalculatorTool());
registry.register(new SearchTool());
```

### 4.3 MCP 协议（Model Context Protocol）

MCP 是 Anthropic 提出的标准协议，让 Agent 能调用外部工具：

```javascript
// MCP 工具调用格式
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "weather",
    "arguments": { "city": "北京" }
  }
}

// MCP 响应格式
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "北京今天 25°C，晴天"
      }
    ]
  }
}
```

### 面试高频问题

**Q: 工具系统如何保证可靠性？**
```
A: 实现超时控制 + 参数验证 + 重试机制

1. executeWithTimeout: 设置最大执行时间
2. _validateParameters: 验证参数类型和必填
3. 重试机制: 失败后指数退避重试
```

---

## 五、Memory 记忆系统

### 5.1 三层记忆架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Agent Memory Architecture                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Working Memory                           │   │
│  │  LLM 直接看到的上下文，包含系统提示 + 历史消息                 │   │
│  │  - 系统提示 (System Prompt)                                  │   │
│  │  - 对话历史 (Messages)                                       │   │
│  │  - 工具返回结果 (Tool Results)                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Session Memory                            │   │
│  │  当前会话的短期记忆，支持滑动窗口和摘要                        │   │
│  │  - 最近 N 轮对话                                            │   │
│  │  - 超过限制则摘要压缩                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   Persistent Memory                          │   │
│  │  跨会话的持久记忆，包含 RAG 检索和用户偏好                    │   │
│  │  - RAG 知识库检索结果                                        │   │
│  │  - Session Notes (会话笔记)                                 │   │
│  │  - 用户偏好设置                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 长短期记忆的提取、压缩与冲突更新机制

#### 记忆提取机制

```javascript
class MemoryExtractor {
  /**
   * 从对话历史中提取关键信息
   */
  extract(conversation) {
    const extraction = {
      decisions: [],      // 关键决策
      facts: [],         // 用户提供的事实
      preferences: [],   // 用户偏好
      questions: [],     // 未解决的问题
      entities: []       // 提到的实体
    };

    for (const message of conversation) {
      // 1. 提取决策
      if (this.isDecisionPoint(message)) {
        extraction.decisions.push({
          content: message.content,
          timestamp: message.timestamp
        });
      }

      // 2. 提取事实
      const facts = this.extractFacts(message.content);
      extraction.facts.push(...facts);

      // 3. 提取偏好
      const preferences = this.extractPreferences(message.content);
      extraction.preferences.push(...preferences);

      // 4. 提取实体
      const entities = this.extractEntities(message.content);
      extraction.entities.push(...entities);
    }

    return extraction;
  }

  /**
   * 判断是否是决策点
   */
  isDecisionPoint(message) {
    const decisionKeywords = ['决定', '选择', '采用', '使用', '安排'];
    return decisionKeywords.some(k => message.content.includes(k));
  }
}
```

#### 冲突更新机制

```javascript
class ConflictResolver {
  /**
   * 处理记忆冲突
   */
  resolve(newMemory, existingMemory) {
    const resolved = { ...existingMemory };

    // 1. 用户偏好冲突：新值覆盖旧值
    for (const pref of newMemory.preferences) {
      const existing = resolved.preferences.find(p => p.key === pref.key);
      if (existing) {
        pref.previousValue = existing.value;
        pref.updateReason = 'user_update';
      }
      resolved.preferences = this.upsertPreference(resolved.preferences, pref);
    }

    // 2. 事实冲突：保留最新 + 标记冲突
    for (const fact of newMemory.facts) {
      const conflicting = resolved.facts.find(
        f => f.entity === fact.entity && f.attribute === fact.attribute
      );
      if (conflicting && conflicting.value !== fact.value) {
        conflicting.hasConflict = true;
        conflicting.alternativeValues = [conflicting.value, fact.value];
        conflicting.latestValue = fact.value;
      } else {
        resolved.facts.push(fact);
      }
    }

    // 3. 决策冲突：不覆盖，保留历史
    resolved.decisions.push(...newMemory.decisions);

    return resolved;
  }
}
```

#### 极端情绪检测与干预

```javascript
class EmotionalIntervention {
  /**
   * 检测极端情绪
   */
  detectEmotion(message) {
    const emotionKeywords = {
      anger: ['愤怒', '生气', '讨厌', '滚', '白痴'],
      sadness: ['难过', '伤心', '失望', '沮丧', '绝望'],
      anxiety: ['焦虑', '担心', '害怕', '紧张', '不安']
    };

    const scores = {};
    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      scores[emotion] = keywords.reduce(
        (sum, k) => sum + (message.content.includes(k) ? 1 : 0), 0
      );
    }

    const maxEmotion = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

    return {
      emotion: maxEmotion[0],
      intensity: maxEmotion[1],
      isExtreme: maxEmotion[1] >= 2
    };
  }

  /**
   * 情绪干预 - 不中断对话流
   */
  async intervene(emotion, currentResponse) {
    const strategies = {
      anger: {
        response: '我理解您可能感到沮丧，让我们换个话题...',
        action: 'delay_escalation'
      },
      sadness: {
        response: '听起来您最近不太顺利，想聊聊发生了什么吗？',
        action: 'empathetic_support'
      },
      anxiety: {
        response: '别担心，我们可以一步一步来解决这个问题。',
        action: 'reduce_complexity'
      }
    };

    const strategy = strategies[emotion];
    // 不替换原回复，而是追加温和干预
    return `${currentResponse}\n\n${strategy.response}`;
  }
}
```

### 5.3 Token 控制与摘要管理

```javascript
// services/MemoryWindowManager.js
class MemoryWindowManager {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 100000;     // 最大 token 数
    this.windowSize = options.windowSize || 10;       // 窗口大小
    this.summarizeThreshold = 0.8;                   // 摘要触发阈值
  }

  /**
   * 管理消息历史，控制 token 数量
   */
  manageMemory(messages) {
    const currentTokens = this.estimateTokens(messages);

    if (currentTokens > this.maxTokens * this.summarizeThreshold) {
      return this.summarizeAndCompress(messages);
    }

    if (messages.length > this.windowSize * 2) {
      return this.slidingWindow(messages);
    }

    return messages;
  }

  estimateTokens(messages) {
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  slidingWindow(messages) {
    return messages.slice(-this.windowSize);
  }

  async summarizeAndCompress(messages) {
    const summaryPrompt = `
      请总结以下对话的要点，保留：
      1. 关键决策和结论
      2. 用户的重要偏好和信息
      3. 未完成的任务或问题

      对话如下：
      ${messages.map(m => `${m.role}: ${m.content}`).join('\n')}
    `;

    const summary = await this.llm.chat([{ role: 'user', content: summaryPrompt }]);

    return [
      { role: 'system', content: `对话摘要: ${summary}` },
      messages[messages.length - 1]
    ];
  }
}
```

### 面试高频问题

**Q: 如何避免 Context 超出 LLM 限制？**
```
A: 分层管理 + Token 控制
   1. Working Memory: LLM 直接看到的，控制总量
   2. Session Memory: 滑动窗口或摘要
   3. Persistent Memory: RAG 检索，按需获取
   4. Token 估算 + 阈值触发摘要
```

**Q: 记忆冲突如何处理？**
```
A: 分类型处理
   1. 偏好冲突：新值覆盖，记录历史
   2. 事实冲突：保留两者，标记冲突
   3. 决策冲突：不覆盖，保留完整历史
```

**Q: 如何检测用户极端情绪并干预？**
```
A: 关键词检测 + 不打断对话
   1. 情绪关键词匹配
   2. 识别 anger/sadness/anxiety
   3. 干预策略：冷静/共情/简化
   4. 追加干预而非替换回复
```

---

## 六、RAG 检索增强

### 6.1 RAG 为何能减少幻觉？

```
┌─────────────────────────────────────────────────────────────────────┐
│                      RAG 减少幻觉的原理                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  幻觉的原因：                                                         │
│  1. 知识边界 - 模型不知道最新信息、私有知识                           │
│  2. 训练偏差 - 某些知识训练不足                                       │
│  3. 推理错误 - 复杂推理过程中"走神"                                   │
│  4. 上下文误导 - 无关上下文干扰                                       │
│                                                                      │
│  RAG 的解决方案：                                                     │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  1. 提供事实基础 - 检索真实文档作为证据                       │     │
│  │  2. 限制生成范围 - 让 LLM "看"着文档回答                      │     │
│  │  3. 引用追溯 - 用户可验证，降低信任幻觉                       │     │
│  │  4. 最新知识 - 实时检索，不依赖训练数据                        │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 完整 RAG 流程

```
用户问题
    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    第一阶段：Query Processing                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐                         │
│  │  Query Rewrite  │    │Query Decompose  │                         │
│  │  问题改写        │    │  问题拆分        │                         │
│  │  - 代词消解      │    │  - 复杂问题分解   │                         │
│  │  - 省略补全      │    │  - 并列问题分离   │                         │
│  └─────────────────┘    └─────────────────┘                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    第二阶段：Multi-Channel Retrieval                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐│
│  │ Vector Search   │    │    BM25         │    │   Keyword       ││
│  │  向量检索        │    │   关键词检索     │    │   精确匹配       ││
│  │  (语义相似)     │    │   (词项权重)    │    │   (专有名词)    ││
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘│
│           └─────────────────────┼─────────────────────┘           │
│                                 ↓                                   │
│                         ┌─────────────────┐                        │
│                         │  RRF 融合       │                        │
│                         │  结果合并去重    │                        │
│                         └─────────────────┘                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    第三阶段：Rerank 精排                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐│
│  │ CrossEncoder    │    │     BM25        │    │   Semantic      ││
│  │  精排            │    │   重排          │    │   重排          ││
│  │  (最准确但慢)    │    │   (关键词权重)  │    │   (多样性)      ││
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘│
│           └─────────────────────┼─────────────────────┘           │
│                                 ↓                                   │
│                         ┌─────────────────┐                        │
│                         │  加权融合        │                        │
│                         │  返回 Top 5-10  │                        │
│                         └─────────────────┘                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    第四阶段：Generation + Citation                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐                         │
│  │Context Assembly │    │  Citation       │                         │
│  │  组装上下文      │    │  引用追溯        │                         │
│  │  + System Prompt│    │  [1] [2] [3]    │                         │
│  └─────────────────┘    └─────────────────┘                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3 稠密向量 vs 稀疏向量

| 类型 | 定义 | 示例 | 适用场景 |
|------|------|------|----------|
| **稠密向量 (Dense)** | 所有维度都有值，浮点数 | [0.23, -0.45, 0.89, ...] | 语义相似性搜索 |
| **稀疏向量 (Sparse)** | 大部分值为 0，只有少数维度有值 | [0, 0, 0, 0.95, 0, 0, 0.23, ...] | 关键词匹配、BM25 |

**核心对比**：

| 维度 | 稠密向量 | 稀疏向量 |
|------|----------|----------|
| **语义理解** | ✅ 强 | ❌ 弱 |
| **关键词匹配** | ❌ 弱 | ✅ 强 |
| **专有名词** | 一般 | ✅ 强 |
| **计算方式** | 余弦相似度 | BM25 / TF-IDF |

**融合策略**：

```javascript
// 互补融合 - 兼顾语义和关键词
const hybridScore = 0.7 * denseSimilarity + 0.3 * sparseScore;

// RRF (Reciprocal Rank Fusion)
const rrfScore = (1 / (60 + denseRank)) + (1 / (60 + sparseRank));
```

### 6.4 文档切片：为什么要切片？如何设置重叠？

#### 为什么要切片？

```
长文档不分片的问题：
1. 向量化失真 - 长文档语义复杂，压缩到单一向量丢失细节
2. 检索精度下降 - 相关片段被无关内容稀释
3. 上下文长度限制 - 可能超出 LLM 上下文
4. 检索粒度不细 - 用户只需要某一段内容
```

#### 切片重叠的作用

```
切片 1: [0 ──────────────────── 500]
          重叠 [450 ───────────────── 950] 切片 2
            重叠 [900 ────────────── 1400] 切片 3

目的：防止语义截断
```

**重叠比例设置**：

| 场景 | 重叠比例 | 理由 |
|------|----------|------|
| 叙事性文档 | 10-20% | 语义相对独立 |
| 技术文档 | 20-30% | 上下文关联强 |
| 对话/聊天 | 30-50% | 上下文极强 |

### 6.5 余弦相似度 vs 欧氏距离

| 维度 | 余弦相似度 | 欧氏距离 |
|------|------------|----------|
| **考虑因素** | 方向（不考虑 magnitude） | 方向 + 长度 |
| **向量长度敏感** | 不敏感 | 敏感 |
| **适用场景** | 语义相似 | 聚类、分类 |
| **文本相似度** | ✅ 更常用 | 一般 |

```javascript
// 余弦相似度
cosineSimilarity(A, B) = (A · B) / (|A| × |B|)

// 欧氏距离
euclideanDistance(A, B) = √(Σ(Ai - Bi)²)
```

### 6.6 Top-K 过大的问题

| K 设置 | 适用场景 | 问题 |
|--------|----------|------|
| **K=3~5** | 简单问答 | 可能遗漏 |
| **K=5~10** | 一般 RAG（推荐） | 平衡 |
| **K>20** | 不推荐 | 上下文稀释、噪声引入、成本增加 |

### 6.7 HyDE 原理与优势

**HyDE (Hypothetical Document Embeddings)**：先用 LLM 生成假设性答案，再用这个答案去检索

```
传统 RAG:
Query → 直接检索 → 可能召回不精准

HyDE:
Query → LLM 生成假设答案 → 用假设答案检索 → 基于真实文档回答
```

**适用场景**：模糊概念性问题、开放式问题

### 6.8 为什么需要 BM25 + 向量检索融合？

**面试高频问题：为什么引入 BM25？融合比例是怎样的？**

| 检索方式 | 优点 | 缺点 |
|----------|------|------|
| **向量检索** | 语义理解强 | 可能遗漏精确关键词 |
| **BM25** | 关键词精确匹配 | 无法理解语义 |

**融合策略**：

```javascript
// RRF (Reciprocal Rank Fusion) - 最常用
const rrfScore = (1 / (60 + vectorRank)) + (1 / (60 + bm25Rank));

// 项目中的实际权重配置
const RERANK_WEIGHTS = {
  crossEncoder: 0.4,
  bm25: 0.2,
  semantic: 0.3,
  diversity: 0.1
};
```

### 6.9 Rerank 为何能提高质量？

```javascript
// 第一阶段召回的问题
// 向量检索可能返回：
[
  { doc: "Python是一种编程语言", score: 0.95 },
  { doc: "Java是一种编程语言", score: 0.93 },
  { doc: "编程语言的历史发展", score: 0.90 }  // 语义相关但关键词不精确
]

// Rerank 后（CrossEncoder 会考虑词项匹配）：
[
  { doc: "Python是一种编程语言", rerank_score: 0.99 },
  { doc: "Java是一种编程语言", rerank_score: 0.97 },
  { doc: "编程语言的历史发展", rerank_score: 0.75 }  // 分数下降
]
```

### 6.10 引用追溯与幻觉控制

```javascript
// Prompt 边界控制防止幻觉
const SYSTEM_PROMPT = `
你是一个基于检索文档回答问题的助手。

重要规则：
1. 如果检索到的文档不包含回答问题所需的信息，直接回答"我没有找到相关信息"
2. 不要编造或推测文档中没有的信息
3. 如果信息部分不足，先说明已知部分，再指出不足之处
4. 回答时使用"[来源X]"标注参考的文档
`;
```

### 6.11 增量索引策略

```javascript
// 文档局部更新时避免全量重算
class IncrementalIndexManager {
  async updateDocument(docId, newContent, embeddingModel) {
    const oldVersion = this.docVersions.get(docId) || 0;
    const newVersion = oldVersion + 1;

    // 删除旧 chunks
    const chunksToDelete = this.findChunksByDocId(docId);
    for (const chunkId of chunksToDelete) {
      await this.vectorDB.delete(chunkId);
    }

    // 索引新 chunks
    const newChunks = this.chunkDocument(newContent);
    for (let i = 0; i < newChunks.length; i++) {
      const vector = await embeddingModel.embed(newChunks[i]);
      await this.vectorDB.upsert({
        id: `${docId}_chunk_${i}`,
        vector,
        metadata: { docId, version: newVersion, content: newChunks[i] }
      });
    }

    this.docVersions.set(docId, newVersion);
  }
}
```

### 6.5 引用追溯（减少幻觉的关键）

```javascript
// domain/rag/CitationAssembler.js
class CitationAssembler {
  assemble(query, answer, retrievedDocs) {
    const citations = retrievedDocs.map((doc, idx) => ({
      id: `[${idx + 1}]`,
      source: doc.source,
      content: doc.content,
      url: doc.url
    }));

    return {
      answer: this.insertCitations(answer, citations),
      citations,
      hasCitations: citations.length > 0
    };
  }

  insertCitations(answer, citations) {
    const citationText = citations
      .map(c => `${c.id} ${c.source}`)
      .join(', ');

    return citations.length > 0
      ? `${answer}\n\n参考: ${citationText}`
      : answer;
  }
}
```

### 面试高频问题

**Q: RAG 中的幻觉问题怎么处理？**
```
A: 多重保障
   1. 检索质量：多路召回 + Rerank
   2. 引用追溯：让用户可验证
   3. 不确定性估计：高置信度才引用，低置信度拒答
   4. 后验证：生成后让 LLM 自检一致性
```

**Q: Rerank 后返回几个 Chunk？**
```
A: 通常 5-10 个
   - 过多：上下文稀释、成本增加
   - 过少：可能遗漏相关信息
   - 需要结合 maxContextLength 动态调整
```

---

## 七、多 Agent 协作

### 7.1 A2A 协议 - Agent 间通信

```javascript
// A2A 消息格式
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

### 7.2 三种协作模式

**模式 1: 主从模式 (Team Leader)**
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

**模式 2: 对等协作 (Collaborative)**
```
┌─────────┐         ┌─────────┐
│ Agent-A │ ←──────→ │ Agent-B │
│ 擅长代码 │         │ 擅长文档 │
└─────────┘         └─────────┘
```

**模式 3: 自主执行 (Autonomous)**
```
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Agent-A │  │ Agent-B │  │ Agent-C │
│ 独立执行 │  │ 独立执行 │  │ 独立执行 │
└─────────┘  └─────────┘  └─────────┘
```

### 7.3 10 个 Agent 并行执行架构

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
    └────────────────────────┼────────────────────────┘
                             ↓
                    ┌────────────────┐
                    │   Agent-10     │
                    │   结果汇总     │
                    └────────────────┘
```

### 7.4 并行上下文隔离

**面试高频问题：多 Agent 系统如何确保并行而不读同一个上下文？**

```javascript
// 每个 Agent 有独立的执行上下文
class MultiAgentCoordinator {
  async executeParallel(tasks, contexts) {
    return Promise.all(
      tasks.map((task, idx) => {
        // 隔离上下文 - 每个 Agent 读自己的 context
        const isolatedContext = contexts[idx];
        return this.executeTask(task, isolatedContext);
      })
    );
  }
}
```

---

## 八、综合面试题解

### 8.1 RAG 相关面试题

**Q1: 为什么引入 BM25？向量检索和 BM25 的融合比例是怎样的？**
```
A:
- 向量检索擅长语义相似，BM25 擅长关键词精确匹配
- 融合可以兼顾两者优点
- 常用 RRF (Reciprocal Rank Fusion) 方法
- 比例通常 0.7:0.3 或根据效果调整
```

**Q2: 检索融合的具体流程是什么？**
```
A:
1. 多路召回：向量 + BM25 + 关键词，各自返回 Top 20
2. RRF 融合：合并结果并去重
3. Rerank 精排：CrossEncoder 精排
4. 截断输出：返回 Top 5-10
```

**Q3: Rerank 后返回几个块？有没有验证过？**
```
A:
- 通常返回 5-10 个
- 可以用 MRR、Recall@K 验证
- 需要平衡召回率和上下文长度
```

**Q4: 幻觉问题怎么处理？**
```
A:
1. RAG 检索提供事实基础
2. 引用追溯让用户验证
3. 不确定性估计，低置信度拒答
4. 生成后 LLM 自检
```

### 8.2 Agent 相关面试题

**Q5: 你对 AI Agent 的了解？**
```
A:
1. Agent = LLM + Planning + Memory + Tools
2. 核心能力：自主决策、工具调用、多轮对话
3. 执行流程：ReAct 循环
4. 框架：LangGraph/AutoGen/CrewAI
```

**Q6: 上下文工程（Context Engineering）？**
```
A:
- Working Memory: LLM 直接看到的
- Session Memory: 滑动窗口或摘要
- Persistent Memory: RAG 检索
- Token 控制 + 摘要压缩
```

**Q7: 多智能体系统设计架构？**
```
A:
1. 主从模式：主 Agent 分解任务
2. 对等协作：专业 Agent 并行
3. 自主执行：独立任务独立 Agent
4. A2A 协议通信
```

### 8.3 系统设计面试题

**Q8: asyncio 异步编程的优势？**

```javascript
// 为什么需要 asyncio？
// 场景：并发调用 100 个 LLM API

// 同步方式 - 串行执行
async function syncCalls() {
  const results = [];
  for (const prompt of prompts) {
    const result = await callLLM(prompt);  // 每次等待 1 秒
    results.push(result);                   // 总计 100 秒
  }
  return results;
}

// 异步方式 - 并发执行
async function asyncCalls() {
  const results = await Promise.all(
    prompts.map(prompt => callLLM(prompt))  // 全部并行
  );
  return results;                           // 总计 ~1 秒
}
```

| 场景 | 同步方式 | 异步方式 |
|------|----------|----------|
| HTTP 请求 | 串行等待 | 并行请求 |
| SSE 流式 | 难以处理 | 轻松处理 |
| WebSocket | 每连接一线程 | 单线程多连接 |

**Q9: 分布式令牌桶限流实现？**
```javascript
// Redis + Lua
const luaScript = `
local key = KEYS[1]
local rate = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local tokens = tonumber(redis.call('GET', key)) or capacity

local elapsed = now - (redis.call('GET', key..':last') or now)
local added = elapsed * rate
tokens = math.min(capacity, tokens + added)

if tokens >= 1 then
    tokens = tokens - 1
    redis.call('SET', key, tokens)
    redis.call('SET', key..':last', now)
    return 1
end
return 0
`;
```

**Q10: 滑动窗口 vs 令牌桶？**
```
| 维度       | 令牌桶      | 滑动窗口    |
|------------|-------------|-------------|
| 突发流量   | 允许        | 不允许      |
| 平滑输出   | 允许        | 不允许      |
| 实现复杂度 | 简单        | 稍复杂      |
| Redis 友好 | Lua 脚本    | Sorted Set  |
```

**Q11: SGLang vs vLLM PagedAttention？**

| 维度 | vLLM | SGLang |
|------|------|--------|
| **推理延迟** | 低 | 更低 |
| **显存利用率** | 高 (PagedAttention) | 更高 |
| **流式输出** | 好 | 更好 |
| **并行控制** | 基础 | 高级 |
| **适用场景** | 通用推理 | 复杂工作流 |

```
SGLang 优势：
1. 连续批处理优化
2. RadixAttention 树结构，前缀复用
3. 分布式张量并行，更低通信开销
```

**Q12: LRU 缓存实现？**
```javascript
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();  // Map 保持插入顺序
  }

  get(key) {
    if (!this.cache.has(key)) return -1;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);  // 移到末尾
    return value;
  }

  put(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, value);
  }
}
```

**Q13: 第 K 大元素（手撕算法）？**
```javascript
// 快速选择算法 - 平均 O(n)
function findKthLargest(nums, k) {
  return quickSelect(nums, 0, nums.length - 1, nums.length - k);
}

function quickSelect(nums, left, right, kSmallest) {
  if (left === right) return nums[left];

  const pivotIndex = partition(nums, left, right);

  if (kSmallest === pivotIndex) {
    return nums[pivotIndex];
  } else if (kSmallest < pivotIndex) {
    return quickSelect(nums, left, pivotIndex - 1, kSmallest);
  } else {
    return quickSelect(nums, pivotIndex + 1, right, kSmallest);
  }
}

function partition(nums, left, right) {
  const pivot = nums[right];
  let i = left;

  for (let j = left; j < right; j++) {
    if (nums[j] <= pivot) {
      [nums[i], nums[j]] = [nums[j], nums[i]];
      i++;
    }
  }

  [nums[i], nums[right]] = [nums[right], nums[i]];
  return i;
}
```

---

## 九、项目中的 Agent 实现

### 9.1 核心文件

| 文件 | 职责 |
|------|------|
| `backend/src/services/agentEngine.js` | ReAct 执行循环 |
| `backend/src/services/tools/toolRegistry.js` | 工具注册管理 |
| `backend/src/services/a2aService.js` | A2A 协议通信 |
| `backend/src/services/MultiAgentCoordinator.js` | 多 Agent 协调 |
| `backend/src/domain/rag/Reranker.js` | RAG 重排序 |
| `backend/src/domain/rag/QueryRewriteService.js` | 问题改写 |

### 9.2 面试可讲的亮点

```
1. 熔断保护：单个 Agent 失败不影响整体
2. 限流控制：防止系统过载
3. 取消机制：asyncio.Event 风格
4. Token 控制：摘要压缩防止超出限制
5. 多路召回：向量 + BM25 + RRF 融合
6. Rerank 精排：CrossEncoder 提升精度
```

---

## 十、延伸学习

### 10.1 内部文档
- [ReAct 设计思想](B5-ReAct设计思想.md)
- [Agent 并行部署](B3-Agent并行部署.md)
- [RAG 系统设计](../RAG系统技术文档.md)
- [企业级 Agent 架构](../企业级Agent系统架构文档.md)

### 10.2 外部资源
- [ReAct 论文](https://arxiv.org/abs/2210.03629)
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [AutoGen 文档](https://microsoft.github.io/autogen/)
- [CrewAI 文档](https://docs.crewai.com/)
