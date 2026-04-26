# ReAct执行循环 - Agent 大脑深度解析

## 核心问题
Agent 如何通过"思考-行动-观察"循环来解决复杂问题？

## 为什么 Agent 需要循环执行？

### 1. AI 模型的局限性
```
用户: "帮我查天气，然后告诉我应该穿什么"

一次性生成的问题：
┌─────────────────────────────────────────────────────────┐
│  AI 直接回复: "北京今天 25°C，晴天，建议穿短袖"          │
│                                                         │
│  问题：                                                  │
│  ✗ 如果天气 API 调用失败？                               │
│  ✗ 如何知道用户的性别/偏好？                              │
│  ✗ 25°C 是摄氏还是华氏？                                 │
│  ✗ "应该穿什么"需要更多上下文                            │
└─────────────────────────────────────────────────────────┘
```

### 2. 循环执行的优势
```
┌─────────────────────────────────────────────────────────┐
│  循环 (ReAct) 解决问题的方式：                            │
│                                                         │
│  Turn 1: Reason → "用户要查天气，需要调用天气 API"        │
│          Act → 调用 weather_tool(city="北京")            │
│          Observe → "25°C, 晴"                           │
│                                                         │
│  Turn 2: Reason → "现在知道了天气，需要考虑穿着建议"       │
│          Act → 考虑温度、天气、用户可能的需求             │
│          Observe → 生成建议                              │
│                                                         │
│  优势：                                                  │
│  ✓ 每一步可验证                                          │
│  ✓ 失败可重试                                            │
│  ✓ 可以根据中间结果调整策略                              │
└─────────────────────────────────────────────────────────┘
```

## ReAct 三要素

### 1. Reason (推理)
让 LLM 分析当前状态，决定下一步行动

### 2. Act (行动)
执行工具调用或生成回复

### 3. Observe (观察)
获取工具返回结果，决定是否继续

## 项目中的实现

### 文件位置
`backend/src/services/agentEngine.js`

### 核心代码结构
```javascript
class AgentEngine {
  constructor(options = {}) {
    this.maxTurns = options.maxTurns || 50;      // 最大循环次数
    this.llm = options.llm;                        // LLM 客户端
    this.tools = options.tools;                    // 可用工具列表
    this.toolExecutor = options.toolExecutor;      // 工具执行器
  }

  /**
   * Agent 主循环
   */
  async run(userMessage, context = {}) {
    const messages = [
      { role: 'user', content: userMessage }
    ];

    let turn = 0;
    let done = false;

    while (turn < this.maxTurns && !done) {
      turn++;

      // 1. 生成 LLM 响应
      const response = await this.llm.chat([
        this.systemPrompt,
        ...messages
      ]);

      // 2. 检查是否有工具调用
      if (response.tool_calls && response.tool_calls.length > 0) {
        // 执行工具
        for (const toolCall of response.tool_calls) {
          const result = await this.toolExecutor.execute(
            toolCall.name,
            toolCall.arguments
          );

          // 3. 添加工具结果到消息历史
          messages.push({
            role: 'tool',
            name: toolCall.name,
            content: JSON.stringify(result)
          });
        }
      } else {
        // 没有工具调用，返回最终回复
        done = true;
        return {
          content: response.content,
          turns: turn
        };
      }
    }

    throw new Error(`Agent 执行超出最大轮次限制 (${this.maxTurns})`);
  }
}
```

### 执行流程图
```
                    ┌─────────────────┐
                    │  用户消息        │
                    └────────┬────────┘
                             ↓
         ┌──────────────────────────────────────┐
         │       LLM 生成响应 / 决策              │
         │  (Reason: 分析问题，决定下一步)        │
         └─────────────────┬────────────────────┘
                           ↓
         ┌──────────────────────────────────────┐
         │     决策分支                          │
         │  - 有工具调用？→ 执行工具              │
         │  - 无工具调用？→ 返回最终回复          │
         └─────────────────┬────────────────────┘
                           │
              ┌────────────┴────────────┐
              ↓                         ↓
    ┌──────────────────┐      ┌──────────────────┐
    │    执行工具        │      │    返回回复       │
    │  (Act)            │      │    (Done)        │
    └──────────────────┘      └──────────────────┘
              ↓
    ┌──────────────────┐
    │    获取结果        │
    │  (Observe)        │
    └──────────────────┘
              ↓
    ┌──────────────────┐
    │    添加到历史      │
    │  继续下一轮循环    │
    └──────────────────┘
```

## Agent 的工具系统

### 工具接口
```javascript
/**
 * 工具接口定义
 */
class Tool {
  constructor(name, description, parameters) {
    this.name = name;           // 工具名称
    this.description = description;  // 工具描述（给 LLM 看）
    this.parameters = parameters; // JSON Schema 参数定义
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
```

### 项目中的工具示例
```javascript
// services/tools/WeatherTool.js
class WeatherTool extends Tool {
  constructor() {
    super(
      'weather',
      '获取指定城市的天气信息',
      {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名称' }
        },
        required: ['city']
      }
    );
  }

  async execute(args) {
    const { city } = args;
    const response = await fetch(`https://api.weather.com?q=${city}`);
    return await response.json();
  }
}
```

### 工具注册
```javascript
// services/tools/toolRegistry.js
const tools = [
  new WeatherTool(),
  new CalculatorTool(),
  new SearchTool(),
  // ...
];

module.exports = { tools };
```

## Agent 的自我纠错机制

### 1. 工具执行失败重试
```javascript
async executeWithRetry(toolName, args, maxRetries = 3) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await this.toolExecutor.execute(toolName, args);
    } catch (error) {
      lastError = error;
      console.log(`Retry ${i + 1}/${maxRetries}: ${error.message}`);

      // 指数退避
      await this.sleep(Math.pow(2, i) * 1000);
    }
  }

  throw new Error(`工具执行失败: ${lastError.message}`);
}
```

### 2. 取消机制
```javascript
class AgentEngine {
  constructor() {
    this.cancelEvent = null;
  }

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
    // 在循环中定期检查
    if (this.cancelEvent) {
      // 检查是否有取消信号
      // 返回 true 表示应该停止
    }
    return false;
  }

  async run(userMessage) {
    while (!this.done) {
      // 每轮开始检查
      if (this._checkCancelled()) {
        return { cancelled: true };
      }

      // 执行...
    }
  }
}
```

## 记忆与上下文管理

### Token 控制
```javascript
class MemoryWindowManager {
  constructor(maxTokens = 100000) {
    this.maxTokens = maxTokens;
  }

  // 估算 tokens
  estimateTokens(messages) {
    // 粗略估算：每 4 个字符约等于 1 token
    const totalChars = messages.reduce((sum, m) =>
      sum + m.content.length, 0
    );
    return Math.ceil(totalChars / 4);
  }

  // 决定是否需要摘要
  shouldSummarize(messages) {
    return this.estimateTokens(messages) > this.maxTokens * 0.8;
  }

  // 摘要消息
  async summarize(messages) {
    const summaryPrompt = `
      请总结以下对话的要点，保留关键信息:
      ${messages.map(m => `${m.role}: ${m.content}`).join('\n')}
    `;

    return await this.llm.chat([
      { role: 'user', content: summaryPrompt }
    ]);
  }
}
```

## 新手常见问题

Q: 循环多少次是合理的？
A: 一般 10-50 次，需要设置 `maxTurns` 防止无限循环

Q: 工具调用失败怎么办？
A: 捕获异常，返回错误给 LLM，让其决定是否重试或换工具

Q: Agent 容易陷入死循环吗？
A: 可能的，设置 `maxTurns` 限制，LLM 也有一定的自我判断能力

Q: 如何让 Agent 更可靠？
A: 提供清晰的工具描述、合理的重试机制、适当的上下文

## 延伸学习
- 项目源码：`backend/src/services/agentEngine.js`
- ReAct 原始论文：https://arxiv.org/abs/2210.03629
- LangChain Agent：https://python.langchain.com/docs/modules/agents/
