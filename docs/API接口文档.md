# API 接口文档

> 版本: v2.1.0
> 更新日期: 2026-04-01
> 架构: MiniMax 单一架构

---

## 一、路由总览

| 前缀 | 文件 | 职责 |
|------|------|------|
| `/api/chat` | `chat.js` | 对话聊天接口 |
| `/api/proxy` | `proxy.js` | MiniMax API 代理 |
| `/api/router` | `router.js` | 模型路由、意图分类、查询改写 |
| `/api/agent` | `agent.js` | MiniMax Agent、Enhanced Agent、持久化 |
| `/api/enhanced-agent` | `enhancedAgent.js` | 增强 Agent 执行 |
| `/api/mcp-agent` | `mcpAgent.js` | MiniMax Agent 路由 |
| `/api/pool` | `pool.js` | 模型池管理 |
| `/api/rag` | `rag.js` | RAG 知识库接口 |
| `/api/a2a` | `a2a.js` | A2A Agent 协作协议 |
| `/api/hitl` | `hitl.js` | HITL 人机确认 |
| `/api/search` | `search.js` | Web 搜索接口 |
| `/api/tools` | `tools.js` | 工具注册表 |
| `/api/conversations` | `conversations.js` | 会话管理 |
| `/api/memories` | `memories.js` | 记忆管理 |
| `/api/sessions` | `sessions.js` | 会话持久化 |

---

## 二、对话与代理接口

### 2.1 聊天接口

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | `/api/chat/` | 发送消息(SSE流式) | `messages`, `message`, `model`, `stream` |
| POST | `/api/chat/stop` | 停止生成 | `messageId` |
| POST | `/api/chat/completions` | OpenAI兼容格式 | 同上 |

### 2.2 MiniMax API 代理

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | `/api/proxy/chat/completions` | MiniMax对话代理(SSE流式) | `messages`, `model`, `stream`, `temperature`, `max_tokens`, `reasoning_split`, `thinking_budget` |
| POST | `/api/proxy/chat` | 简单聊天(非流式) | `messages`, `model`, `temperature`, `max_tokens` |
| GET | `/api/proxy/health` | 健康检查 | - |

---

## 三、模型路由接口

### 3.1 意图与查询

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | `/api/router/intent` | 意图分类 | `query`, `messages`, `context` |
| GET | `/api/router/intents` | 获取意图列表 | - |
| POST | `/api/router/rewrite` | 查询改写 | `query`, `messages`, `intent`, `sessionId` |

### 3.2 检索与搜索

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | `/api/router/search` | 多路检索 | `query`, `knowledgeBaseId`, `channels`, `topK`, `filters`, `intent` |
| GET | `/api/router/search/config` | 检索配置 | - |

### 3.3 聊天执行

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | `/api/router/chat` | 执行聊天 | `messages`, `model`, `stream`, `temperature`, `max_tokens`, `options` |

### 3.4 模型管理

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | `/api/router/models` | 获取模型列表 | - |
| GET | `/api/router/stats` | 路由统计 | - |
| POST | `/api/router/config` | 配置路由策略 | `strategy`, `costSensitivity`, `performanceSensitivity`, `maxRetries` |
| POST | `/api/router/models/:modelId/toggle` | 开关模型 | `enabled` |
| POST | `/api/router/models` | 注册模型 | `id`, `provider`, `capabilities`, `maxTokens`, `costPer1kTokens`, `avgLatency`, `complexityLimit` |
| POST | `/api/router/predict` | 预测模型 | `messages`, `options` |

---

## 四、模型池接口

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | `/api/pool/status` | 池状态 | - |
| GET | `/api/pool/stats` | 池统计 | - |
| POST | `/api/pool/select` | 选择模型 | `capabilities`, `complexity`, `preferredProvider` |
| POST | `/api/pool/request/start` | 请求开始 | `modelId` |
| POST | `/api/pool/request/success` | 请求成功 | `modelId`, `latency` |
| POST | `/api/pool/request/failure` | 请求失败 | `modelId`, `errorType` |
| GET | `/api/pool/fallback/:modelId` | 获取降级模型 | - |
| POST | `/api/pool/models/:modelId/enable` | 启用模型 | - |
| POST | `/api/pool/models/:modelId/disable` | 禁用模型 | - |
| POST | `/api/pool/models` | 注册池模型 | `id`, `provider`, `name`, `capabilities`, `maxTokens`, `costPer1kTokens`, `avgLatency`, `priority` |
| DELETE | `/api/pool/models/:modelId` | 删除模型 | - |
| POST | `/api/pool/models/:modelId/reset` | 重置模型统计 | - |
| POST | `/api/pool/health-check` | 健康检查 | - |
| POST | `/api/pool/reset` | 重置池 | `modelId` (可选) |
| GET | `/api/pool/export` | 导出池配置 | - |

---

## 五、Agent 接口

### 5.1 MiniMax Agent (新架构)

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | `/api/agent/session` | 创建会话 | `apiKey`, `baseURL`, `model`, `workspaceDir`, `maxSteps`, `reasoningSplit`, `thinkingBudget`, `showThinking` |
| POST | `/api/agent/execute` | 执行任务(SSE) | `sessionId`, `task` |
| GET | `/api/agent/session/:id` | 获取会话 | - |
| DELETE | `/api/agent/session/:id` | 删除会话 | - |
| GET | `/api/agent/tools` | 获取工具列表 | - |

### 5.2 Enhanced Agent (增强版)

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | `/api/agent/enhanced/execute` | 执行增强任务 | `sessionId`, `task`, `context` |
| GET | `/api/agent/enhanced/status/:id` | 获取状态 | - |
| POST | `/api/agent/enhanced/pause/:id` | 暂停执行 | - |
| POST | `/api/agent/enhanced/resume/:id` | 恢复执行 | - |
| POST | `/api/agent/enhanced/checkpoint/:id` | 保存检查点 | - |
| GET | `/api/agent/enhanced/checkpoints/:id` | 列出检查点 | - |
| POST | `/api/agent/enhanced/restore/:id/:cpId` | 恢复检查点 | - |
| GET | `/api/agent/enhanced/confirmations/:id` | 待确认列表 | - |
| POST | `/api/agent/enhanced/confirm/:id/:cid` | 响应确认 | `approved`, `modifiedInput` |
| GET | `/api/agent/enhanced/memory/:id` | 获取记忆 | - |
| POST | `/api/agent/enhanced/memory/:id/search` | 搜索记忆 | `query`, `limit` |
| POST | `/api/agent/enhanced/memory/:id/promote` | 提升记忆 | `content`, `type`, `importance` |
| DELETE | `/api/agent/enhanced/session/:id` | 清理会话 | - |
| GET | `/api/agent/enhanced/sessions` | 会话列表 | - |

### 5.3 MCP Agent

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | `/api/mcp-agent/session` | 创建会话 | `apiKey`, `baseURL`, `model`, `workspaceDir`, `maxSteps`, `reasoningSplit`, `thinkingBudget`, `showThinking` |
| POST | `/api/mcp-agent/execute` | 执行任务(SSE) | `sessionId`, `task` |
| GET | `/api/mcp-agent/session/:sessionId` | 获取会话 | - |
| DELETE | `/api/mcp-agent/session/:sessionId` | 删除会话 | - |
| GET | `/api/mcp-agent/tools` | 获取工具列表 | - |

### 5.4 持久化接口

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | `/api/agent/persistence/sessions` | 持久化会话列表 | - |
| GET | `/api/agent/persistence/recoverable` | 可恢复会话 | - |
| POST | `/api/agent/persistence/execute` | 执行持久化任务 | `task`, `context`, `resumeSessionId` |
| POST | `/api/agent/persistence/resume/:id` | 恢复持久化会话 | - |
| DELETE | `/api/agent/persistence/session/:id` | 删除持久化会话 | - |
| POST | `/api/agent/persistence/cleanup` | 清理过期会话 | `maxAgeDays` |

---

## 六、RAG 知识库接口

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | `/api/rag/kb` | 创建知识库 | `name`, `description` |
| GET | `/api/rag/kb` | 知识库列表 | - |
| GET | `/api/rag/kb/:kbId` | 知识库详情 | - |
| DELETE | `/api/rag/kb/:kbId` | 删除知识库 | - |
| POST | `/api/rag/kb/:kbId/documents` | 添加文档 | `title`, `content`, `type`, `metadata` |
| POST | `/api/rag/kb/:kbId/upload` | 上传文件 | `file` (multipart) |
| POST | `/api/rag/kb/:kbId/retrieve` | 检索知识 | `query`, `topK`, `similarityThreshold` |
| POST | `/api/rag/kb/:kbId/context` | 获取对话上下文 | `query`, `topK`, `similarityThreshold` |
| GET | `/api/rag/stats` | RAG统计 | - |

---

## 七、A2A 协作协议接口

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | `/api/a2a/status` | 服务状态 | - |
| GET | `/api/a2a/agents` | Agent列表 | - |
| GET | `/api/a2a/agents/:agentId` | Agent详情 | - |
| POST | `/api/a2a/agents/register` | 注册Agent | `id`, `name`, `type`, `endpoint`, `capabilities`, `metadata` |
| POST | `/api/a2a/agents/:agentId/unregister` | 注销Agent | - |
| POST | `/api/a2a/agents/:agentId/heartbeat` | 心跳检测 | - |
| POST | `/api/a2a/send` | 发送消息 | `from`, `to`, `type`, `payload`, `taskId`, `priority`, `timeout` |
| GET | `/api/a2a/receive` | 接收消息 | `agentId`, `limit`, `clear` |
| GET | `/api/a2a/poll` | 轮询消息 | `agentId`, `timeout` |
| POST | `/api/a2a/result/:taskId` | 返回任务结果 | `result`, `status`, `metadata` |
| POST | `/api/a2a/progress/:taskId` | 发送进度 | `progress`, `metadata` |
| POST | `/api/a2a/status/sync` | 同步状态 | `agentId`, `status`, `metadata` |
| GET | `/api/a2a/tasks/:taskId` | 任务状态 | - |
| GET | `/api/a2a/tasks` | 任务列表 | `status`, `from`, `to`, `limit` |
| DELETE | `/api/a2a/tasks/:taskId` | 取消任务 | - |
| GET | `/api/a2a/unread/:agentId` | 未读消息数 | - |
| GET | `/api/a2a/subscribe/:agentId` | SSE订阅 | - |
| POST | `/api/a2a/ack` | 消息确认 | `agentId`, `messageIds` |

---

## 八、HITL 人机确认接口

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | `/api/hitl/checkpoint` | 创建检查点 | `type`, `title`, `description`, `context`, `options`, `timeout`, `required` |
| GET | `/api/hitl/pending` | 待处理检查点 | - |
| GET | `/api/hitl/checkpoint/:id` | 检查点详情 | - |
| POST | `/api/hitl/checkpoint/:id/approve` | 批准检查点 | `option`, `comment`, `userId` |
| POST | `/api/hitl/checkpoint/:id/reject` | 拒绝检查点 | `reason`, `userId` |
| POST | `/api/hitl/checkpoint/:id/wait` | 等待响应 | `timeout` |
| POST | `/api/hitl/confirm` | 创建并等待确认 | `type`, `title`, `description`, `context`, `options`, `timeout`, `required` |
| GET | `/api/hitl/history` | 历史记录 | `limit` |
| GET | `/api/hitl/stats` | 统计信息 | - |
| POST | `/api/hitl/clear` | 清除待处理 | - |
| GET | `/api/hitl/types` | 检查点类型 | - |
| GET | `/api/hitl/health` | 健康检查 | - |
| GET | `/api/hitl/status` | 状态检查 | - |

---

## 九、搜索接口

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | `/api/search/web` | Web搜索 | `query`, `limit`, `source`, `format` |
| GET | `/api/search/config` | 搜索配置 | - |
| GET | `/api/search/providers` | 搜索源列表 | - |
| POST | `/api/search/test` | 测试搜索源 | `source`, `query` |
| GET | `/api/search/health` | 健康检查 | - |

---

## 十、工具接口

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | `/api/tools` | 工具列表 | - |

---

## 十一、MCP 接口

### 11.1 MiniMax MCP

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | `/api/minimax/image` | 图像生成 | `model`, `prompt`, `aspect_ratio`, `resolution` |
| POST | `/api/minimax/tts` | 语音合成 | `model`, `text`, `voice_setting` |
| POST | `/api/minimax/connect` | 连接MCP服务 | 配置信息 |
| GET | `/api/minimax/status` | MCP状态 | - |

### 11.2 通用 MCP

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | `/api/mcp/status` | 连接状态 | - |
| POST | `/api/mcp/connect` | 连接Server | `serverUrl`, `apiKey` |
| GET | `/api/mcp/tools` | 工具列表 | - |
| POST | `/api/mcp/tools/:toolName/execute` | 执行工具 | `arguments` |

---

## 十二、会话与记忆接口

### 12.1 会话管理

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | `/api/sessions` | 会话列表 | - |
| GET | `/api/sessions/:id` | 会话详情 | - |
| DELETE | `/api/sessions/:id` | 删除会话 | - |
| GET | `/api/sessions/:id/messages` | 消息历史 | `limit`, `before` |
| DELETE | `/api/sessions/:id/messages` | 清空消息 | - |

### 12.2 记忆管理

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | `/api/memories` | 记忆列表 | - |
| GET | `/api/memories/:id` | 记忆详情 | - |
| DELETE | `/api/memories/:id` | 删除记忆 | - |
| POST | `/api/memories/search` | 搜索记忆 | `query`, `limit` |

---

## 十三、其他接口

### 13.1 对话管理

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | `/api/conversations` | 对话列表 | `page`, `pageSize`, `keyword`, `status` |
| POST | `/api/conversations` | 创建对话 | `title`, `modelId`, `systemPrompt`, `options` |
| GET | `/api/conversations/:id` | 对话详情 | - |
| DELETE | `/api/conversations/:id` | 删除对话 | - |
| GET | `/api/conversations/:id/messages` | 消息列表 | `page`, `pageSize`, `before` |

### 13.2 追踪接口

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| GET | `/api/trace/:sessionId` | 获取追踪数据 | - |
| GET | `/api/trace/page` | 追踪页面 | - |

### 13.3 浏览器自动化

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| POST | `/api/browser/action` | 执行浏览器动作 | `action`, `params` |
| GET | `/api/browser/status` | 浏览器状态 | - |

---

## 十四、错误码

| 前缀 | 类别 | 说明 |
|------|------|------|
| 1xxx | 认证授权 | Token无效、权限不足 |
| 2xxx | 参数校验 | 必填参数缺失、格式错误 |
| 3xxx | 业务逻辑 | 会话不存在、操作不允许 |
| 4xxx | 外部依赖 | API超时、第三方服务错误 |
| 5xxx | 系统异常 | 内部错误、数据库故障 |

---

## 十五、 SSE 事件类型

### 对话事件
| 事件 | 说明 |
|------|------|
| `message` | 消息片段 |
| `done` | 完成 |
| `error` | 错误 |

### Agent 事件
| 事件 | 说明 |
|------|------|
| `start` | 开始执行 |
| `step_start` | 步骤开始 |
| `thinking` | 思考中 |
| `tool_call` | 工具调用 |
| `complete` | 执行完成 |
| `cancelled` | 已取消 |
| `max_steps_reached` | 达到最大步数 |
| `done` | 完成 |

### 思维链事件
| 事件 | 说明 |
|------|------|
| `thinking_delta` | 思维内容片段 |
| `thinking_complete` | 思维完成 |

---

**文档更新**: 2026-04-01 (v2.1.0)
