# SimpleAgent API 文档

> SimpleAgent 后端 API 接口文档
> 版本: 1.0.0
> 更新日期: 2026-03-18

---

## 基础信息

### 基础 URL

```
http://localhost:30000/api
```

### 通用响应格式

#### 成功响应

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-03-18T12:00:00.000Z"
}
```

#### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": { ... }
  },
  "timestamp": "2026-03-18T12:00:00.000Z"
}
```

### 通用状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 401 | 认证失败 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 |

---

## 1. 聊天接口 (Chat)

### 1.1 发送消息（流式）

**端点**: `POST /chat`

发送消息并接收流式响应（SSE）。

```bash
curl -X POST http://localhost:30000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "model": "gpt-4o",
    "stream": true
  }'
```

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| messages | Array | 是 | 消息历史 |
| model | String | 是 | 模型名称 |
| stream | Boolean | 否 | 是否流式输出，默认 true |
| temperature | Number | 否 | 温度参数 (0-2) |
| max_tokens | Number | 否 | 最大 token 数 |
| sessionId | String | 否 | 会话 ID |

**响应**: SSE 流式输出

```plaintext
data: {"type": "content", "content": "你"}
data: {"type": "content", "content": "好"}
data: {"type": "done"}
```

### 1.2 停止生成

**端点**: `POST /chat/stop`

停止当前正在进行的流式响应。

```bash
curl -X POST http://localhost:30000/api/chat/stop \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "session-123"}'
```

### 1.3 非流式补全

**端点**: `POST /chat/completions`

一次性返回完整响应（无 SSE）。

```bash
curl -X POST http://localhost:30000/api/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "解释什么是机器学习"}
    ],
    "model": "gpt-4o"
  }'
```

---

## 2. 配置接口 (Config)

### 2.1 获取配置

**端点**: `GET /config`

```bash
curl http://localhost:30000/api/config
```

**响应**:

```json
{
  "channels": [...],
  "keys": {...},
  "defaults": {...}
}
```

### 2.2 获取渠道列表

**端点**: `GET /config/channels`

```bash
curl http://localhost:30000/api/config/channels
```

### 2.3 获取渠道详情

**端点**: `GET /config/channels/:id`

```bash
curl http://localhost:30000/api/config/channels/openai
```

### 2.4 更新渠道配置

**端点**: `PUT /config/channels/:id`

```bash
curl -X PUT http://localhost:30000/api/config/channels/openai \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "apiKey": "sk-xxx",
    "models": ["gpt-4o", "gpt-4o-mini"]
  }'
```

### 2.5 切换渠道状态

**端点**: `POST /config/channels/:id/toggle`

```bash
curl -X POST http://localhost:30000/api/config/channels/openai/toggle
```

### 2.6 获取 API Keys

**端点**: `GET /config/keys`

```bash
curl http://localhost:30000/api/config/keys
```

### 2.7 设置 API Key

**端点**: `POST /config/keys`

```bash
curl -X POST http://localhost:30000/api/config/keys \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "openai",
    "apiKey": "sk-xxx"
  }'
```

### 2.8 获取默认配置

**端点**: `GET /config/defaults`

```bash
curl http://localhost:30000/api/config/defaults
```

### 2.9 更新默认配置

**端点**: `PUT /config/defaults`

```bash
curl -X PUT http://localhost:30000/api/config/defaults \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "temperature": 0.7
  }'
```

---

## 3. 会话管理 (Sessions)

### 3.1 获取会话列表

**端点**: `GET /sessions`

```bash
curl http://localhost:30000/api/sessions
```

### 3.2 获取会话详情

**端点**: `GET /sessions/:id`

```bash
curl http://localhost:30000/api/sessions/session-123
```

### 3.3 创建会话

**端点**: `POST /sessions`

```bash
curl -X POST http://localhost:30000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "title": "新会话",
    "model": "gpt-4o"
  }'
```

### 3.4 删除会话

**端点**: `DELETE /sessions/:id`

```bash
curl -X DELETE http://localhost:30000/api/sessions/session-123
```

---

## 4. 模型路由 (Router)

### 4.1 意图分类

**端点**: `POST /router/intent`

对用户输入进行意图分析。

```bash
curl -X POST http://localhost:30000/api/router/intent \
  -H "Content-Type: application/json" \
  -d '{"query": "搜索今天的天气"}'
```

**响应**:

```json
{
  "intent": {
    "type": "tool_use",
    "name": "工具调用"
  },
  "confidence": 0.9,
  "complexity": 3,
  "action": {
    "action": "tool_call",
    "target": "external_tool"
  }
}
```

### 4.2 获取所有意图类型

**端点**: `GET /router/intents`

```bash
curl http://localhost:30000/api/router/intents
```

### 4.3 查询改写

**端点**: `POST /router/rewrite`

对用户查询进行改写优化。

```bash
curl -X POST http://localhost:30000/api/router/rewrite \
  -H "Content-Type: application/json" \
  -d '{
    "query": "机器学习怎么学",
    "messages": [...]
  }'
```

### 4.4 混合检索

**端点**: `POST /router/search`

执行混合检索（向量 + 全文）。

```bash
curl -X POST http://localhost:30000/api/router/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "什么是深度学习",
    "topK": 5
  }'
```

### 4.5 智能聊天路由

**端点**: `POST /router/chat`

智能选择模型并处理请求。

```bash
curl -X POST http://localhost:30000/api/router/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
```

### 4.6 获取可用模型列表

**端点**: `GET /router/models`

```bash
curl http://localhost:30000/api/router/models
```

### 4.7 获取路由器统计

**端点**: `GET /router/stats`

```bash
curl http://localhost:30000/api/router/stats
```

---

## 5. 模型池 (Model Pool)

### 5.1 获取模型池状态

**端点**: `GET /router/pool/status`

```bash
curl http://localhost:30000/api/router/pool/status
```

### 5.2 获取模型池统计

**端点**: `GET /router/pool/stats`

```bash
curl http://localhost:30000/api/router/pool/stats
```

### 5.3 选择最佳模型

**端点**: `POST /router/pool/select`

```bash
curl -X POST http://localhost:30000/api/router/pool/select \
  -H "Content-Type: application/json" \
  -d '{"taskType": "conversation"}'
```

### 5.4 标记请求开始

**端点**: `POST /router/pool/request/start`

```bash
curl -X POST http://localhost:30000/api/router/pool/request/start \
  -H "Content-Type: application/json" \
  -d '{"modelId": "gpt-4o"}'
```

### 5.5 标记请求成功

**端点**: `POST /router/pool/request/success`

```bash
curl -X POST http://localhost:30000/api/router/pool/request/success \
  -H "Content-Type: application/json" \
  -d '{"modelId": "gpt-4o", "latency": 150}'
```

### 5.6 标记请求失败

**端点**: `POST /router/pool/request/failure`

```bash
curl -X POST http://localhost:30000/api/router/pool/request/failure \
  -H "Content-Type: application/json" \
  -d '{"modelId": "gpt-4o", "error": "rate_limit"}'
```

### 5.7 获取备用模型

**端点**: `GET /router/pool/fallback/:modelId`

```bash
curl http://localhost:30000/api/router/pool/fallback/gpt-4o
```

### 5.8 启用/禁用模型

**端点**: `POST /router/pool/models/:modelId/enable`

```bash
curl -X POST http://localhost:30000/api/router/pool/models/gpt-4o/enable
```

**端点**: `POST /router/pool/models/:modelId/disable`

```bash
curl -X POST http://localhost:30000/api/router/pool/models/gpt-4o/disable
```

### 5.9 注册新模型

**端点**: `POST /router/pool/models`

```bash
curl -X POST http://localhost:30000/api/router/pool/models \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "gpt-5",
    "provider": "openai",
    "priority": 10,
    "enabled": true
  }'
```

### 5.10 移除模型

**端点**: `DELETE /router/pool/models/:modelId`

```bash
curl -X DELETE http://localhost:30000/api/router/pool/models/gpt-5
```

### 5.11 重置模型统计

**端点**: `POST /router/pool/models/:modelId/reset`

```bash
curl -X POST http://localhost:30000/api/router/pool/models/gpt-4o/reset
```

### 5.12 手动健康检查

**端点**: `POST /router/pool/health-check`

```bash
curl -X POST http://localhost:30000/api/router/pool/health-check
```

### 5.13 导出模型池配置

**端点**: `GET /router/pool/export`

```bash
curl http://localhost:30000/api/router/pool/export
```

---

## 6. 知识库 (RAG)

### 6.1 获取 RAG 统计

**端点**: `GET /rag/stats`

```bash
curl http://localhost:30000/api/rag/stats
```

### 6.2 添加文档

**端点**: `POST /rag/documents`

```bash
curl -X POST http://localhost:30000/api/rag/documents \
  -H "Content-Type: application/json" \
  -d '{
    "content": "机器学习是人工智能的一个分支...",
    "metadata": {
      "source": "article",
      "title": "机器学习简介"
    }
  }'
```

### 6.3 搜索知识库

**端点**: `POST /rag/search`

```bash
curl -X POST http://localhost:30000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "什么是神经网络",
    "topK": 5
  }'
```

### 6.4 删除文档

**端点**: `DELETE /rag/documents/:id`

```bash
curl -X DELETE http://localhost:30000/api/rag/documents/doc-123
```

---

## 7. 工具系统 (MCP)

### 7.1 获取 MCP 状态

**端点**: `GET /mcp/status`

```bash
curl http://localhost:30000/api/mcp/status
```

### 7.2 获取可用工具列表

**端点**: `GET /mcp/tools`

```bash
curl http://localhost:30000/api/mcp/tools
```

### 7.3 调用工具

**端点**: `POST /mcp/call`

```bash
curl -X POST http://localhost:30000/api/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "web_search",
    "params": {
      "query": "今天的天气"
    }
  }'
```

### 7.4 连接 MCP 服务器

**端点**: `POST /mcp/connect`

```bash
curl -X POST http://localhost:30000/api/mcp/connect \
  -H "Content-Type: application/json" \
  -d '{
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
  }'
```

### 7.5 断开 MCP 连接

**端点**: `POST /mcp/disconnect`

```bash
curl -X POST http://localhost:30000/api/mcp/disconnect \
  -H "Content-Type: application/json" \
  -d '{"serverName": "filesystem"}'
```

### 7.6 获取工具分类

**端点**: `GET /mcp/categories`

```bash
curl http://localhost:30000/api/mcp/categories
```

---

## 8. Agent 系统

### 8.1 执行 Agent 任务

**端点**: `POST /enhanced-agent/execute`

```bash
curl -X POST http://localhost:30000/api/enhanced-agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "搜索今天的AI新闻",
    "sessionId": "session-123"
  }'
```

### 8.2 获取 Agent 状态

**端点**: `GET /enhanced-agent/status/:sessionId`

```bash
curl http://localhost:30000/api/enhanced-agent/status/session-123
```

### 8.3 暂停 Agent

**端点**: `POST /enhanced-agent/pause/:sessionId`

```bash
curl -X POST http://localhost:30000/api/enhanced-agent/pause/session-123
```

### 8.4 恢复 Agent

**端点**: `POST /enhanced-agent/resume/:sessionId`

```bash
curl -X POST http://localhost:30000/api/enhanced-agent/resume/session-123
```

### 8.5 创建检查点

**端点**: `POST /enhanced-agent/checkpoint/:sessionId`

```bash
curl -X POST http://localhost:30000/api/enhanced-agent/checkpoint/session-123
```

### 8.6 获取检查点列表

**端点**: `GET /enhanced-agent/checkpoints/:sessionId`

```bash
curl http://localhost:30000/api/enhanced-agent/checkpoints/session-123
```

### 8.7 恢复检查点

**端点**: `POST /enhanced-agent/restore/:sessionId/:checkpointId`

```bash
curl -X POST http://localhost:30000/api/enhanced-agent/restore/session-123/checkpoint-1
```

### 8.8 获取待确认列表

**端点**: `GET /enhanced-agent/confirmations/:sessionId`

```bash
curl http://localhost:30000/api/enhanced-agent/confirmations/session-123
```

### 8.9 确认操作

**端点**: `POST /enhanced-agent/confirm/:sessionId/:confirmationId`

```bash
curl -X POST http://localhost:30000/api/enhanced-agent/confirm/session-123/conf-1 \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'
```

### 8.10 获取 Agent 记忆

**端点**: `GET /enhanced-agent/memory/:sessionId`

```bash
curl http://localhost:30000/api/enhanced-agent/memory/session-123
```

### 8.11 搜索记忆

**端点**: `POST /enhanced-agent/memory/:sessionId/search`

```bash
curl -X POST http://localhost:30000/api/enhanced-agent/memory/session-123/search \
  -H "Content-Type: application/json" \
  -d '{"query": "之前讨论的AI"}'
```

### 8.12 提升为长期记忆

**端点**: `POST /enhanced-agent/memory/:sessionId/promote`

```bash
curl -X POST http://localhost:30000/api/enhanced-agent/memory/session-123/promote \
  -H "Content-Type: application/json" \
  -d '{"memoryId": "mem-123"}'
```

### 8.13 删除会话

**端点**: `DELETE /enhanced-agent/session/:sessionId`

```bash
curl -X DELETE http://localhost:30000/api/enhanced-agent/session/session-123
```

### 8.14 获取所有会话

**端点**: `GET /enhanced-agent/sessions`

```bash
curl http://localhost:30000/api/enhanced-agent/sessions
```

---

## 9. 多 Agent 引擎

### 9.1 获取 Agent 类型

**端点**: `GET /agents/types`

```bash
curl http://localhost:30000/api/agents/types
```

### 9.2 获取可用工具

**端点**: `GET /agents/tools`

```bash
curl http://localhost:30000/api/agents/tools
```

### 9.3 执行多 Agent 任务

**端点**: `POST /agents/execute`

```bash
curl -X POST http://localhost:30000/api/agents/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "分析数据并生成报告",
    "agentType": "coordinator"
  }'
```

### 9.4 创建 Agent 团队

**端点**: `POST /agents/team`

```bash
curl -X POST http://localhost:30000/api/agents/team \
  -H "Content-Type": application/json" \
  -d '{
    "name": "数据分析团队",
    "agents": [
      {"role": "coordinator", "model": "gpt-4o"},
      {"role": "analyzer", "model": "gpt-4o"},
      {"role": "reporter", "model": "gpt-4o-mini"}
    ]
  }'
```

### 9.5 获取团队状态

**端点**: `GET /agents/team/:teamId/status`

```bash
curl http://localhost:30000/api/agents/team/team-123/status
```

### 9.6 获取团队结果

**端点**: `GET /agents/team/:teamId/result`

```bash
curl http://localhost:30000/api/agents/team/team-123/result
```

---

## 10. 会话记忆 (Memory)

### 10.1 初始化记忆

**端点**: `POST /memory/initialize`

```bash
curl -X POST http://localhost:30000/api/memory/initialize \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "session-123"}'
```

### 10.2 添加记忆

**端点**: `POST /memory/add`

```bash
curl -X POST http://localhost:30000/api/memory/add \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123",
    "content": "用户喜欢机器学习话题",
    "type": "user_preference"
  }'
```

### 10.3 搜索记忆

**端点**: `POST /memory/search`

```bash
curl -X POST http://localhost:30000/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123",
    "query": "用户偏好"
  }'
```

### 10.4 获取会话记忆

**端点**: `POST /memory/session`

```bash
curl -X POST http://localhost:30000/api/memory/session \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "session-123"}'
```

### 10.5 获取记忆统计

**端点**: `GET /memory/stats`

```bash
curl http://localhost:30000/api/memory/stats
```

### 10.6 清除会话记忆

**端点**: `DELETE /memory/session/:sessionId`

```bash
curl -X DELETE http://localhost:30000/api/memory/session/session-123
```

### 10.7 清除特定记忆

**端点**: `DELETE /memory/:id`

```bash
curl -X DELETE http://localhost:30000/api/memory/mem-123
```

---

## 11. 人机协作 (HITL)

### 11.1 创建检查点

**端点**: `POST /hitl/checkpoint`

```bash
curl -X POST http://localhost:30000/api/hitl/checkpoint \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-123",
    "type": "tool_execution",
    "data": {
      "tool": "web_search",
      "params": {...}
    }
  }'
```

### 11.2 获取待处理列表

**端点**: `GET /hitl/pending`

```bash
curl http://localhost:30000/api/hitl/pending
```

### 11.3 批准操作

**端点**: `POST /hitl/checkpoint/:id/approve`

```bash
curl -X POST http://localhost:30000/api/hitl/checkpoint/check-123/approve \
  -H "Content-Type: application/json" \
  -d '{"comment": "批准执行"}'
```

### 11.4 拒绝操作

**端点**: `POST /hitl/checkpoint/:id/reject`

```bash
curl -X POST http://localhost:30000/api/hitl/checkpoint/check-123/reject \
  -H "Content-Type: application/json" \
  -d '{"comment": "拒绝原因"}'
```

### 11.5 获取历史

**端点**: `GET /hitl/history`

```bash
curl http://localhost:30000/api/hitl/history
```

### 11.6 获取统计

**端点**: `GET /hitl/stats`

```bash
curl http://localhost:30000/api/hitl/stats
```

---

## 12. 浏览器自动化

### 12.1 初始化浏览器

**端点**: `POST /browser/init`

```bash
curl -X POST http://localhost:30000/api/browser/init \
  -H "Content-Type: application/json" \
  -d '{"browser": "chromium", "headless": false}'
```

### 12.2 创建会话

**端点**: `POST /browser/session`

```bash
curl -X POST http://localhost:30000/api/browser/session
```

### 12.3 导航到 URL

**端点**: `POST /browser/navigate`

```bash
curl -X POST http://localhost:30000/api/browser/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### 12.4 点击元素

**端点**: `POST /browser/click`

```bash
curl -X POST http://localhost:30000/api/browser/click \
  -H "Content-Type: application/json" \
  -d '{"selector": "#submit-button"}'
```

### 12.5 输入文本

**端点**: `POST /browser/type`

```bash
curl -X POST http://localhost:30000/api/browser/type \
  -H "Content-Type: application/json" \
  -d '{"selector": "#search-input", "text": "hello"}'
```

### 12.6 获取页面内容

**端点**: `POST /browser/content`

```bash
curl -X POST http://localhost:30000/api/browser/content
```

### 12.7 提取数据

**端点**: `POST /browser/extract`

```bash
curl -X POST http://localhost:30000/api/browser/extract \
  -H "Content-Type: application/json" \
  -d '{"schema": {"title": "h1", "links": "a@href"}}'
```

### 12.8 截图

**端点**: `POST /browser/screenshot`

```bash
curl -X POST http://localhost:30000/api/browser/screenshot
```

### 12.9 执行 JavaScript

**端点**: `POST /browser/evaluate`

```bash
curl -X POST http://localhost:30000/api/browser/evaluate \
  -H "Content-Type: application/json" \
  -d '{"script": "document.title"}'
```

### 12.10 等待元素

**端点**: `POST /browser/wait`

```bash
curl -X POST http://localhost:30000/api/browser/wait \
  -H "Content-Type: application/json" \
  -d '{"selector": "#loaded", "timeout": 5000}'
```

### 12.11 滚动页面

**端点**: `POST /browser/scroll`

```bash
curl -X POST http://localhost:30000/api/browser/scroll \
  -H "Content-Type: application/json" \
  -d '{"direction": "down", "amount": 500}'
```

### 12.12 查找元素

**端点**: `POST /browser/element`

```bash
curl -X POST http://localhost:30000/api/browser/element \
  -H "Content-Type: application/json" \
  -d '{"selector": ".product-item"}'
```

### 12.13 关闭浏览器

**端点**: `POST /browser/close`

```bash
curl -X POST http://localhost:30000/api/browser/close
```

### 12.14 获取浏览器状态

**端点**: `GET /browser/status`

```bash
curl http://localhost:30000/api/browser/status
```

---

## 13. 搜索服务

### 13.1 执行联网搜索

**端点**: `POST /search/web`

```bash
curl -X POST http://localhost:30000/api/search/web \
  -H "Content-Type: application/json" \
  -d '{
    "query": "最新AI新闻",
    "source": "jina"
  }'
```

### 13.2 获取搜索配置

**端点**: `GET /search/config`

```bash
curl http://localhost:30000/api/search/config
```

---

## 14. 任务队列

### 14.1 添加任务

**端点**: `POST /tasks/add`

```bash
curl -X POST http://localhost:30000/api/tasks/add \
  -H "Content-Type: application/json" \
  -d '{
    "task": "process_data",
    "params": {"id": 123}
  }'
```

### 14.2 获取任务状态

**端点**: `GET /tasks/:id`

```bash
curl http://localhost:30000/api/tasks/task-123
```

### 14.3 取消任务

**端点**: `DELETE /tasks/:id`

```bash
curl -X DELETE http://localhost:30000/api/tasks/task-123
```

### 14.4 获取队列状态

**端点**: `GET /tasks/queue/status`

```bash
curl http://localhost:30000/api/tasks/queue/status
```

---

## 15. 插件系统

### 15.1 获取插件列表

**端点**: `GET /plugins`

```bash
curl http://localhost:30000/api/plugins
```

### 15.2 安装插件

**端点**: `POST /plugins/install`

```bash
curl -X POST http://localhost:30000/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"name": "my-plugin", "source": "npm"}'
```

### 15.3 卸载插件

**端点**: `POST /plugins/uninstall`

```bash
curl -X POST http://localhost:30000/api/plugins/uninstall \
  -H "Content-Type: application/json" \
  -d '{"name": "my-plugin"}'
```

---

## 16. 技能系统

### 16.1 获取技能列表

**端点**: `GET /skills`

```bash
curl http://localhost:30000/api/skills
```

### 16.2 执行技能

**端点**: `POST /skills/execute`

```bash
curl -X POST http://localhost:30000/api/skills/execute \
  -H "Content-Type: application/json" \
  -d '{
    "skill": "code_review",
    "params": {"code": "..."}
  }'
```

---

## 17. 健康检查

### 17.1 服务健康状态

**端点**: `GET /health`

```bash
curl http://localhost:30000/api/health
```

**响应**:

```json
{
  "status": "ok",
  "timestamp": "2026-03-18T12:00:00.000Z",
  "uptime": 3600
}
```

---

## 附录

### A. 支持的模型列表

| 提供商 | 模型 |
|--------|------|
| OpenAI | gpt-5, gpt-4o, gpt-4o-mini, o1, o1-mini, o3, o3-mini |
| Anthropic | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 |
| Google | gemini-2.5-pro, gemini-2.5-flash |
| DeepSeek | deepseek-chat, deepseek-coder, deepseek-reasoner |
| MiniMax | abab7-chat, abab6.5s-chat |
| 智谱AI | glm-4-plus, glm-4-flash |

### B. 意图类型

| 类型 | 说明 |
|------|------|
| tool_use | 工具调用 |
| creative | 创意生成 |
| task | 任务执行 |
| knowledge | 知识查询 |
| conversation | 日常对话 |
| vision | 视觉理解 |

### C. 错误代码

| 代码 | 说明 |
|------|------|
| INVALID_REQUEST | 请求参数无效 |
| AUTH_FAILED | 认证失败 |
| RATE_LIMITED | 请求频率超限 |
| MODEL_UNAVAILABLE | 模型不可用 |
| TOOL_NOT_FOUND | 工具不存在 |
| EXECUTION_FAILED | 执行失败 |
| TIMEOUT | 执行超时 |
