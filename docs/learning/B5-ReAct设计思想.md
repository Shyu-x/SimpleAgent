# ReAct设计思想 - 为什么Agent要循环执行？

## 核心问题
为什么不能让 AI 一次性生成完整答案？

## 不循环的后果

### 1. 复杂问题无法分解
```
用户: "帮我查北京今天的天气，并告诉我应该穿什么"

一次性生成:
"北京今天 25°C，晴天。建议穿短袖和薄外套..."

问题:
- 如果天气 API 调用失败怎么办？
- 如何知道用户的性别/偏好来建议穿着？
- 温度单位是否需要转换？
```

### 2. 工具调用不可控
- 无法在执行过程中验证参数
- 无法根据中间结果调整策略
- 工具返回错误无法重试

### 3. 错误无法修正
```
用户: "计算 1+1=?"

一次性生成: "1+1=2" ✓

用户: "计算 1+1=? 并解释为什么"

一次性生成: "1+1=2，因为数学是人类的发明" ✗ (错误!)
           (正确: 数学是发现，不是发明)

问题: 第一轮已经结束，无法修正第二轮的错误
```

## 解决方案：增量执行（ReAct）

### 核心思想
**R**eason → **A**ct → **O**bserve → **R**eflect 循环

```
         ┌──────────────────────────────┐
         │         开始                 │
         └──────────────┬───────────────┘
                        ↓
         ┌──────────────────────────────┐
         │  1. Reason (推理)            │
         │  分析问题，决定下一步行动       │
         └──────────────┬───────────────┘
                        ↓
         ┌──────────────────────────────┐
         │  2. Act (行动)               │
         │  调用工具 / 生成回复           │
         └──────────────┬───────────────┘
                        ↓
         ┌──────────────────────────────┐
         │  3. Observe (观察)           │
         │  获取工具返回结果              │
         └──────────────┬───────────────┘
                        ↓
         ┌──────────────────────────────┐
         │  4. Reflect (反思)           │
         │  评估是否已达到目标           │
         └──────────────┬───────────────┘
                        │
            ┌───────────┴───────────┐
            ↓                       ↓
        未完成                      完成
        ↓                       ↓
        继续循环                   结束
```

## 项目中的实现

### 文件位置
`backend/src/services/agentEngine.js`

### 核心代码结构
```javascript
class AgentEngine {
  async run(userMessage, context) {
    const maxTurns = 50;  // 防止无限循环
    let turn = 0;
    let done = false;

    // 初始化消息历史
    const messages = [
      { role: 'user', content: userMessage }
    ];

    // ReAct 执行循环
    while (turn < maxTurns && !done) {
      turn++;

      // 1. Reason: 让 LLM 分析并决定行动
      const response = await this.llm.chat([
        ...this.systemPrompt,
        ...messages,
        { role: 'user', content: '请分析并决定下一步行动' }
      ]);

      // 2. Act: 根据决策执行
      if (response.tool_calls) {
        for (const toolCall of response.tool_calls) {
          const result = await this.executeTool(
            toolCall.name,
            toolCall.arguments
          );

          // 3. Observe: 添加结果到消息历史
          messages.push({
            role: 'tool',
            name: toolCall.name,
            content: JSON.stringify(result)
          });
        }
      } else {
        // 没有工具调用，直接返回
        done = true;
        return response.content;
      }

      // 4. Reflect: 检查是否完成（由 LLM 决定）
      // 下一轮会判断是否继续循环
    }

    throw new Error('Agent 执行超出最大轮次限制');
  }
}
```

### 执行流程图
```
用户消息
    ↓
┌─────────────────────────────────────────┐
│           LLM 生成响应                    │
│  (分析问题 → 决定是否调用工具)              │
└─────────────────────────────────────────┘
    ↓
┌─────────────────┐    ┌─────────────────┐
│   无工具调用     │    │   有工具调用     │
│   返回结果      │    │   执行工具      │
└─────────────────┘    └─────────────────┘
                              ↓
                    ┌─────────────────┐
                    │   获取工具结果   │
                    └─────────────────┘
                              ↓
                    ┌─────────────────┐
                    │ 添加到消息历史   │
                    └─────────────────┘
                              ↓
                       继续下一轮循环
```

## 设计权衡

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **循环执行 (ReAct)** | 可修正、可追踪、可重试 | 延迟增加 | 复杂任务、工具调用 |
| **一步到位** | 延迟低、简单 | 不可修正、无法工具调用 | 简单问答 |

### 为什么延迟增加还要用循环？
- 复杂任务中，可靠性比速度更重要
- 工具调用是 AI 能力的关键（访问实时信息、操作外部系统）
- 用户更在意答案正确，而不是快 200ms

## 取消机制

项目实现了 asyncio.Event 风格的取消机制：
```javascript
// 创建取消事件
createCancelEvent() {
  this.cancelEvent = new EventEmitter();
}

// 触发取消
cancel() {
  if (this.cancelEvent) {
    this.cancelEvent.emit('cancel');
  }
}

// 检查取消状态
_checkCancelled() {
  // 在循环中定期检查
}
```

## 新手常见问题

Q: 循环多少次是合理的？
A: 一般 10-50 次，需要设置 `maxTurns` 上限防止无限循环

Q: 工具调用失败怎么办？
A: 捕获异常，返回错误给 LLM，让其决定是否重试或换工具

Q: 如何避免循环卡死？
A: 设置超时、使用计数器、LLM 自我判断是否继续

Q: ReAct 和 Agent 是什么关系？
A: ReAct 是 Agent 的执行模式，Agent 是基于 ReAct 模式的 AI 系统

## 延伸学习
- 项目源码：`backend/src/services/agentEngine.js`
- 相关概念：Tool Executor、Intent Router、Context Assembler
- 外部资料：[ReAct 论文](https://arxiv.org/abs/2210.03629)
