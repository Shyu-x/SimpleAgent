# MiniMax M2.7 API 调研报告

> 调研日期: 2026-03-18
> 调研来源: MiniMax-AI/Mini-Agent 源码分析 + MiniMax 官方 API 文档

---

## 一、模型概述

MiniMax M2.7 是 MiniMax 于 2026 年 3 月 18 日发布的最新一代 Agent 旗舰大模型，核心特性：

- **核心突破**: 首次展示"模型自我进化"路径，通过 Agent Harness 体系让模型深度参与自身训练与优化
- **编程能力**: SWE-Pro 基准 56.22%，追平 GPT-5.3-Codex；VIBE-Pro 55.6%，几乎与 Opus 4.6 持平
- **工具调用**: 复杂 Tools (>2000 Token) 场景下 97% 遵循率
- **专业办公**: GDPval-AA ELO 得分 1495（开源最高），Office 三件套复杂编辑能力显著提升
- **Agent 协作**: 支持 Agent Teams、复杂 Skills、Tool Search tool

---

## 二、API 接入点

### 2.1 端点地址

| 地区 | 协议 | 端点地址 |
|------|------|----------|
| 国际 | Anthropic 兼容 | `https://api.minimax.io/anthropic` |
| 国际 | OpenAI 兼容 | `https://api.minimax.io/v1` |
| 中国 | Anthropic 兼容 | `https://api.minimaxi.com/anthropic` |
| 中国 | OpenAI 兼容 | `https://api.minimaxi.com/v1` |

### 2.2 模型名称

- **M2.7**: `MiniMax-M2.7` (最新版 Agent 模型)
- **M2.5**: `MiniMax-M2.5` (M2.5 支持 Interleaved Thinking)
- **M2**: `MiniMax-M2` (开源版本)

### 2.3 API Key 配置

```bash
# 环境变量配置示例
MINIMAX_API_KEY=your_api_key_here
```

---

## 三、核心参数详解

### 3.1 reasoning_split 参数

**作用**: 控制思考内容（Thinking/Reasoning）的输出格式

```javascript
// 启用 reasoning_split (推荐)
extra_body: { reasoning_split: true }

// 禁用 reasoning_split (默认)
extra_body: { reasoning_split: false }
```

| 值 | 行为 | 适用场景 |
|----|------|----------|
| `true` | 思考内容分离到 `reasoning_details` 字段 | 需要单独显示思考过程 |
| `false` | 思考内容以 `<think>` 标签嵌入 `content` 字段 | 兼容旧版行为 |

### 3.2 thinking / reasoning_details 字段

**Anthropic SDK 响应格式** (content 块列表):

```javascript
// 响应 content 是一个块数组，需遍历区分类型
response.content = [
  { type: "thinking",  thinking: "模型思考内容", signature: "..." },
  { type: "text",     text: "输出文本内容" },
  { type: "tool_use", id: "call_xxx", name: "tool_name", input: {...} }
]

// 访问方式
for (const block of response.content) {
  if (block.type === "thinking") {
    console.log("思考:", block.thinking)
  } else if (block.type === "text") {
    console.log("文本:", block.text)
  } else if (block.type === "tool_use") {
    console.log("工具:", block.name, block.input)
  }
}
```

**OpenAI SDK 响应格式** (reasoning_split=true):

```javascript
// reasoning_details 在 message 对象中
message.reasoning_details = [{ type: "reasoning.text", text: "..." }]
message.tool_calls = [...]
message.content = "..."
```

### 3.3 其他参数配置

| 参数 | 建议值 | 说明 |
|------|--------|------|
| `max_tokens` | 4096+ | 最大输出 token 数，建议 4096 以支持长思考链 |
| `temperature` | 0.7-1.0 | 默认值 1.0，Agent 任务建议 0.7 |
| `model` | `MiniMax-M2.7` | M2.7 为最新版 |

---

## 四、交错式思维 (Interleaved Thinking)

### 4.1 工作原理

M2.5/M2.7 原生支持 **Interleaved Thinking**，模型在每轮工具调用前后都能进行思考，实现：

1. 工具执行前：根据环境和已有信息推理下一步行动
2. 工具执行后：根据返回结果继续推理下一个动作
3. 最终输出：汇总所有推理过程，输出最终答案

### 4.2 实现要点

**关键约束**: 为了保证 Interleaved Thinking 生效、模型思维链不被打断，**完整的 `response.content`（Anthropic）或 `response_message`（OpenAI）必须原封不动地保留在消息历史中**。

```javascript
// ❌ 错误做法：只保留文本内容，丢失思考链
assistantMessage.content = response.content[1].text  // 丢失 thinking!

// ✅ 正确做法：完整保留所有块
assistantMessage.content = response.content  // 包含所有 thinking/text/tool_use 块
```

### 4.3 消息历史格式

**Anthropic SDK 格式**:

```javascript
// 保留 reasoning_details
{
  role: "assistant",
  content: [
    { type: "thinking", thinking: "...", signature: "..." },
    { type: "tool_use", id: "call_xxx", name: "get_weather", input: {...} },
    { type: "text", text: "根据天气信息..." }
  ]
}
```

**OpenAI SDK 格式**:

```javascript
// 保留 reasoning_details
{
  role: "assistant",
  content: "最终输出文本",
  reasoning_details: [{ type: "reasoning.text", text: "思考过程..." }],
  tool_calls: [...]
}
```

---

## 五、工具调用实现

### 5.1 Anthropic SDK 工具格式

```javascript
const tools = [
  {
    name: "get_weather",
    description: "获取指定城市的天气信息",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "城市名称，格式为 '城市, 国家'，例如 'San Francisco, US'"
        }
      },
      required: ["location"]
    }
  }
]

// API 调用
const response = await client.messages.create({
  model: "MiniMax-M2.7",
  max_tokens: 4096,
  messages: messageHistory,
  tools: tools
})
```

### 5.2 OpenAI SDK 工具格式

```javascript
const tools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "获取指定城市的天气信息",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "城市名称，格式为 '城市, 国家'，例如 'San Francisco, US'"
          }
        },
        required: ["location"]
      }
    }
  }
]

// API 调用 (reasoning_split=true 启用交错式思维)
const response = await client.chat.completions.create({
  model: "MiniMax-M2.7",
  messages: messageHistory,
  tools: tools,
  extra_body: { reasoning_split: true }
})
```

### 5.3 工具循环处理

```javascript
// Agent 执行循环
while (true) {
  const response = await llm.generate(messages, tools)

  // 处理响应中的每个块
  for (const block of response.content) {
    if (block.type === "thinking") {
      // 显示思考过程（可选）
      print(`思考: ${block.thinking}`)
    } else if (block.type === "text") {
      // 累积文本输出
      finalText += block.text
    } else if (block.type === "tool_use") {
      // 执行工具
      const result = await executeTool(block.name, block.input)
      // 添加工具结果到消息历史
      messages.push({
        role: "tool",
        tool_call_id: block.id,
        content: JSON.stringify(result)
      })
    }
  }

  // 检查是否完成（无 tool_use 块）
  const hasToolUse = response.content.some(b => b.type === "tool_use")
  if (!hasToolUse) break
}
```

---

## 六、Mini-Agent 源码分析

### 6.1 Agent 执行循环 (mini_agent/agent.py)

核心执行循环结构：

```python
async def run(self, cancel_event: Optional[asyncio.Event] = None) -> str:
    step = 0
    while step < self.max_steps:
        # 1. 取消检查
        if self._check_cancelled():
            self._cleanup_incomplete_messages()
            return "Task cancelled by user."

        # 2. Token 限制检查 & 消息摘要
        await self._summarize_messages()

        # 3. LLM 调用
        response = await self.llm.generate(messages=self.messages, tools=tool_list)

        # 4. 更新 token 计数
        if response.usage:
            self.api_total_tokens = response.usage.total_tokens

        # 5. 记录日志
        self.logger.log_response(
            content=response.content,
            thinking=response.thinking,
            tool_calls=response.tool_calls,
            finish_reason=response.finish_reason,
        )

        # 6. 添加助手消息
        assistant_msg = Message(
            role="assistant",
            content=response.content,
            thinking=response.thinking,
            tool_calls=response.tool_calls,
        )
        self.messages.append(assistant_msg)

        # 7. 打印思考过程
        if response.thinking:
            print(f"\n🧠 Thinking: {response.thinking}")

        # 8. 无工具调用则完成
        if not response.tool_calls:
            return response.content

        # 9. 执行工具调用
        for tool_call in response.tool_calls:
            result = await tool.execute(**arguments)
            messages.append(tool_msg)  # 添加工具结果消息
```

### 6.2 LLM 客户端 (mini_agent/llm/openai_client.py)

关键实现点：

```python
class OpenAIClient(LLMClientBase):
    async def _make_api_request(self, api_messages, tools=None):
        params = {
            "model": self.model,
            "messages": api_messages,
            # 启用 reasoning_split 分离思考内容
            "extra_body": {"reasoning_split": True},
        }
        if tools:
            params["tools"] = self._convert_tools(tools)

        response = await self.client.chat.completions.create(**params)
        return response

    def _convert_messages(self, messages):
        # ...
        if msg.thinking:
            # 关键：在历史消息中保留 reasoning_details
            assistant_msg["reasoning_details"] = [{"text": msg.thinking}]
        # ...
```

### 6.3 消息摘要机制

当 token 超过限制（默认 80000），Agent 自动执行消息摘要：

```python
async def _summarize_messages(self):
    """消息历史摘要：保留用户意图，总结执行过程"""
    # 策略：
    # - 保留所有用户消息
    # - 总结每轮 Agent 执行过程
    # - 结构: system -> user1 -> summary1 -> user2 -> summary2 -> ...
```

---

## 七、最佳实践

### 7.1 参数配置建议

```javascript
// Chat Completion 请求配置
{
  model: "MiniMax-M2.7",
  max_tokens: 4096,           // 建议 4096+，支持长思考链
  temperature: 0.7,            // Agent 任务建议 0.7
  extra_body: {
    reasoning_split: true     // 启用交错式思维
  }
}
```

### 7.2 消息历史管理

```javascript
// ✅ 正确：完整保留响应内容
const assistantMessage = {
  role: "assistant",
  content: response.content,           // 包含所有块
  reasoning_details: response.reasoning_details,
  tool_calls: response.tool_calls
}

// ✅ 正确：添加工具结果
messages.push({
  role: "tool",
  tool_call_id: toolCallId,
  content: result.content
})
```

### 7.3 thinking 内容显示

```javascript
// 前端显示思考内容
function displayThinking(thinkingContent) {
  return `
    <div class="thinking-block">
      <div class="thinking-header">
        <span class="thinking-icon">🧠</span>
        <span>思考过程</span>
      </div>
      <div class="thinking-content">
        ${escapeHtml(thinkingContent)}
      </div>
    </div>
  `
}
```

---

## 八、与本项目的集成

### 8.1 现有配置

当前项目 `backend/src/services/router/modelRouter.js` 中 MiniMax 模型配置：

```javascript
DEFAULT_MODELS = {
  'abab7-chat': {
    provider: 'minimax',
    name: 'MiniMax Chat',
    capabilities: ['text', 'vision', 'code', 'reasoning'],
    maxTokens: 128000,
    // ...
  }
}
```

### 8.2 待增强配置

需添加 M2.7 专属配置：

```javascript
'MiniMax-M2.7': {
  provider: 'minimax',
  name: 'MiniMax M2.7',
  capabilities: ['text', 'vision', 'code', 'reasoning', 'agent'],
  maxTokens: 128000,
  costPer1kTokens: { input: 0.002, output: 0.01 },  // 待确认
  avgLatency: 1000,
  complexityLimit: 10,
  priority: 1,
  enabled: true,
  features: {
    interleavedThinking: true,    // 支持交错式思维
    reasoningSplit: true,         // 支持 reasoning_split
    toolUse: true                 // 原生工具调用
  }
}
```

### 8.3 API 调用增强

后端代理 (`backend/src/routes/proxy.js`) 需支持：

```javascript
// MiniMax M2.7 API 调用示例
const response = await fetch(`${MINIMAX_API_BASE}/v1/chat/completions`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: "MiniMax-M2.7",
    messages: formattedMessages,
    tools: convertedTools,
    max_tokens: 4096,
    extra_body: {
      reasoning_split: true
    }
  })
})
```

---

## 九、参考资料

- [MiniMax 开放平台文档 - 工具使用 & 交错思维链](https://platform.minimaxi.com/docs/guides/text-m2-function-call)
- [MiniMax Platform API Docs](https://platform.minimax.io/docs/guides/text-m2-function-call)
- [Mini-Agent GitHub 源码](https://github.com/MiniMax-AI/Mini-Agent)
- [MiniMax M2 发布博客](https://minimaxi.com/news/minimax-m2)
- [M2.7 发布新闻 (IT之家)](https://www.ithome.com/0/930/274.htm)
