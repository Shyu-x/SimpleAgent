# SimpleAgent API 文档

## 概述

SimpleAgent 提供 RESTful API 和 SSE 流式接口，支持对话、Agent、RAG、知识库等功能。

- **基础 URL**: `http://localhost:30000`
- **API 格式**: JSON
- **认证方式**: Bearer Token
- **流式响应**: Server-Sent Events (SSE)

---

## 目录

- [基础信息](#基础信息)
- [认证与限流](#认证与限流)
- [核心接口](#核心接口)
- [Agent 接口](#agent-接口)
- [RAG 与知识库](#rag-与知识库)
- [管理后台](#管理后台)
- [A2A 协作](#a2a-协作)
- [HITL 确认](#hitl-确认)
- [错误码](#错误码)

---

## 基础信息

### 服务器

| 环境 | URL |
|------|-----|
| 本地开发 | `http://localhost:30000` |
| Docker | `http://localhost:30000` |
| 生产环境 | `https://api.example.com` |

### 请求头

```http
Content-Type: application/json
Authorization: Bearer <your_token>
```

### 响应格式

成功响应:

```json
{
  "success": true,
  "data": { ... }
}
```

错误响应:

```json
{
  "success": false,
  "error": {
    "code": 2001,
    "message": "参数校验失败",
    "details": "message 不能为空"
  }
}
```

---

## 认证与限流

### 认证方式

API 使用 Bearer Token 认证:

```http
Authorization: Bearer your_token_here
```

### 速率限制

| 接口类型 | 限制 |
|----------|------|
| 默认接口 | 100 请求/分钟 |
| Agent 执行 | 20 请求/分钟 |
| 消息发送 | 60 请求/分钟 |
| 知识检索 | 30 请求/分钟 |

### 错误码分类

| 前缀 | 类别 | 说明 |
|------|------|------|
| 1xxx | 认证授权 | Token 无效/过期 |
| 2xxx | 参数校验 | 请求参数错误 |
| 3xxx | 业务逻辑 | 业务逻辑错误 |
| 4xxx | 外部依赖 | 外部服务故障 |
| 5xxx | 系统异常 | 服务器内部错误 |

---

## 核心接口

### 健康检查

```
GET /health
```

检查服务健康状态。

**响应示例**:

```json
{
  "status": "ok",
  "timestamp": 1748000000000,
  "services": {
    "api": "ok",
    "minimax": "ok"
  }
}
```

---

### 发送消息

```
POST /api/chat/send
```

发送用户消息并获取 AI 回复。支持 SSE 流式响应。

**请求体**:

```json
{
  "conversationId": "conv_abc123",
  "message": "你好，请介绍一下你自己",
  "modelId": "MiniMax-M2.7",
  "attachments": [],
  "options": {
    "temperature": 0.7,
    "maxTokens": 4000,
    "topP": 0.9
  }
}
```

**参数说明**:

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| conversationId | string | 是 | 会话 ID |
| message | string | 是 | 用户消息 |
| modelId | string | 否 | 模型 ID (默认 MiniMax-M2.7) |
| attachments | array | 否 | 附件列表 (图片/音频) |
| options | object | 否 | 生成参数 |

**流式响应事件**:

| 事件 | 说明 | 数据 |
|------|------|------|
| `message` | 消息片段 | 文本内容 |
| `tool_call` | 工具调用 | { name, args } |
| `tool_result` | 工具结果 | { name, result } |
| `thinking` | 思维链 | 推理过程 |
| `done` | 完成 | 最终结果 |
| `error` | 错误 | 错误信息 |

**响应示例** (SSE):

```
event: message
data: {"content": "你好！"}

event: message
data: {"content": "我是 SimpleAgent"}

event: done
data: {"final": true, "response": "我是 SimpleAgent..."}
```

---

### 取消消息

```
POST /api/chat/stop
```

取消正在进行的消息生成。

**请求体**:

```json
{
  "sessionId": "session_xyz"
}
```

---

## Agent 接口

### Agent 执行

```
POST /api/agent/execute
```

以 Agent 模式执行任务。

**请求体**:

```json
{
  "task": "帮我搜索今天的天气",
  "mode": "auto",
  "maxIterations": 10,
  "tools": ["search", "weather"]
}
```

**响应**:

```json
{
  "taskId": "task_123",
  "status": "running",
  "result": {
    "success": true,
    "output": "今天北京晴，温度 25°C",
    "steps": [
      { "step": 1, "action": "search_weather", "result": "..." }
    ]
  }
}
```

---

### Agent 状态

```
GET /api/agent/status/:taskId
```

查询 Agent 任务执行状态。

---

### MCP 工具调用

```
POST /api/mcp/call
```

调用 MCP 协议工具。

**请求体**:

```json
{
  "server": "filesystem",
  "tool": "read_file",
  "args": {
    "path": "/path/to/file"
  }
}
```

---

## RAG 与知识库

### 文档管理

```
POST /api/admin/knowledge/docs
```

上传文档到知识库。

**请求体**:

```json
{
  "title": "产品文档",
  "content": "文档内容...",
  "metadata": {
    "category": "product",
    "tags": ["文档", "产品"]
  }
}
```

**响应**:

```json
{
  "id": "doc_123",
  "title": "产品文档",
  "status": "indexed",
  "createdAt": "2026-05-23T10:00:00Z"
}
```

---

### 知识检索

```
POST /api/rag/search
```

检索知识库。

**请求体**:

```json
{
  "query": "产品的核心功能是什么",
  "topK": 5,
  "threshold": 0.5
}
```

**响应**:

```json
{
  "results": [
    {
      "id": "doc_123",
      "title": "产品文档",
      "content": "产品的核心功能包括...",
      "score": 0.95,
      "metadata": { ... }
    }
  ]
}
```

---

### 管理后台 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/admin/knowledge/docs` | GET/POST | 文档列表/创建 |
| `/api/admin/knowledge/docs/:id` | GET/PUT/DELETE | 文档 CRUD |
| `/api/admin/knowledge/stats` | GET | 知识库统计 |
| `/api/admin/tools` | GET | 工具列表 |
| `/api/admin/tools/:name` | GET/PUT | 工具详情/更新 |
| `/api/admin/models` | GET | 模型列表 |
| `/api/admin/models/:name` | PATCH | 更新模型配置 |
| `/api/admin/prompts` | GET/POST | Prompt 模板 |
| `/api/admin/trace` | GET | 链路追踪 |

---

## A2A 协作

### Agent 注册

```
POST /api/a2a/agents/register
```

注册 Agent 到协作网络。

---

### 发送消息

```
POST /api/a2a/messages/send
```

向其他 Agent 发送消息。

---

### 执行协作任务

```
POST /api/a2a/collaborate
```

执行多 Agent 协作任务。

**请求体**:

```json
{
  "title": "PR Review",
  "mode": "collaborative",
  "tasks": [
    {
      "id": "task-1",
      "agentName": "code-reviewer",
      "prompt": "审查代码 bug..."
    },
    {
      "id": "task-2",
      "agentName": "security-checker",
      "prompt": "检查安全漏洞...",
      "dependencies": ["task-1"]
    }
  ]
}
```

---

## HITL 确认

### 创建确认请求

```
POST /api/hitl/request
```

创建人工确认请求。

**请求体**:

```json
{
  "type": "dangerous_operation",
  "action": "delete_file",
  "details": {
    "path": "/data/backup",
    "recursive": true
  },
  "riskLevel": "high",
  "timeout": 60
}
```

---

### 响应确认

```
POST /api/hitl/respond
```

响应确认请求。

**请求体**:

```json
{
  "requestId": "hitl_123",
  "approved": true,
  "comment": "确认删除"
}
```

---

### SSE 订阅

```
GET /api/hitl/subscribe/:sessionId
```

订阅确认状态变化。

---

## 错误码

### 认证授权类 (1xxx)

| 错误码 | 说明 |
|--------|------|
| 1001 | Token 无效 |
| 1002 | Token 已过期 |
| 1003 | 无访问权限 |

### 参数校验类 (2xxx)

| 错误码 | 说明 |
|--------|------|
| 2001 | 参数不能为空 |
| 2002 | 参数格式错误 |
| 2003 | 参数超出范围 |
| 2004 | 缺少必需参数 |

### 业务逻辑类 (3xxx)

| 错误码 | 说明 |
|--------|------|
| 3001 | 会话不存在 |
| 3002 | 工具执行失败 |
| 3003 | Agent 执行超时 |
| 3004 | 知识库检索无结果 |
| 3005 | 模型服务不可用 |

### 外部依赖类 (4xxx)

| 错误码 | 说明 |
|--------|------|
| 4001 | MiniMax API 调用失败 |
| 4002 | Qdrant 连接失败 |
| 4003 | 外部服务超时 |

### 系统异常类 (5xxx)

| 错误码 | 说明 |
|--------|------|
| 5001 | 服务器内部错误 |
| 5002 | 流式响应中断 |
| 5003 | 熔断器触发 |
| 5004 | 限流触发 |

---

## 快速开始示例

### cURL

```bash
# 健康检查
curl http://localhost:30000/health

# 发送消息
curl -X POST http://localhost:30000/api/chat/send \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv_test",
    "message": "你好"
  }'

# 知识检索
curl -X POST http://localhost:30000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "产品功能"
  }'
```

### JavaScript

```javascript
// 发送消息
const response = await fetch('http://localhost:30000/api/chat/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    conversationId: 'conv_test',
    message: '你好'
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  const events = parseSSSEvents(text);

  for (const event of events) {
    if (event.type === 'message') {
      console.log('收到消息:', event.data);
    } else if (event.type === 'done') {
      console.log('完成');
    }
  }
}
```

---

## 相关文档

- [接口文档](./接口文档.md) - OpenAPI 3.0 格式完整文档
- [API 设计规范](./API设计规范文档.md) - 设计原则与规范
- [错误码规范文档](./错误码规范文档.md) - 详细错误码说明