# AI Chat 玩具 - API 设计规范文档

> 版本: v1.0.0
> 日期: 2026-03-21
> 状态: 正式发布

---

## 一、RESTful API 设计原则

### 1.1 URL 设计规范

```
基础路径: /api/v1

资源路径规范:
- 使用复数名词: /users, /conversations, /agents
- 使用 kebab-case: /conversation-history, /user-settings
- 嵌套资源限制在 2 层: /users/{id}/conversations/{id}
- 不使用文件扩展名: /users/123 而不是 /users/123.json
```

### 1.2 HTTP 方法使用

| 方法 | 用途 | 幂等性 | 安全性 |
|------|------|--------|--------|
| GET | 读取资源 | 是 | 是 |
| POST | 创建资源 | 否 | 否 |
| PUT | 更新资源（完整） | 是 | 否 |
| PATCH | 更新资源（部分） | 否 | 否 |
| DELETE | 删除资源 | 是 | 否 |

### 1.3 状态码使用

| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 200 | OK | 成功获取/更新资源 |
| 201 | Created | 成功创建资源 |
| 204 | No Content | 成功删除，无返回内容 |
| 400 | Bad Request | 参数校验失败 |
| 401 | Unauthorized | 未认证 |
| 403 | Forbidden | 无权限 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突 |
| 429 | Too Many Requests | 限流 |
| 500 | Internal Server Error | 系统错误 |
| 502 | Bad Gateway | 外部服务不可用 |
| 503 | Service Unavailable | 服务不可用 |
| 504 | Gateway Timeout | 超时 |

---

## 二、API 路由定义

### 2.1 对话相关 API

#### 发送消息
```
POST /api/v1/chat/send
```

**请求头**:
```
Authorization: Bearer {token}
Content-Type: application/json
X-Trace-Id: {traceId}
```

**请求体**:
```json
{
  "conversationId": "conv_abc123",
  "message": "你好，请介绍一下你自己",
  "modelId": "MiniMax-M2.7-highspeed",
  "stream": true,
  "options": {
    "temperature": 0.7,
    "maxTokens": 4000,
    "topP": 0.9
  }
}
```

**流式响应**:
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
X-Trace-Id: abc123

event: message
data: {"type": "message", "content": "你好"}

event: message
data: {"type": "message", "content": "，我是"}

event: done
data: {"type": "done", "usage": {"inputTokens": 50, "outputTokens": 200}}

event: error
data: {"type": "error", "code": "4103", "message": "LLM 请求限流"}
```

---

#### 创建会话
```
POST /api/v1/conversations
```

**请求体**:
```json
{
  "title": "技术讨论",
  "modelId": "MiniMax-M2.7-highspeed",
  "metadata": {
    "source": "web"
  }
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "conv_abc123",
    "title": "技术讨论",
    "modelId": "MiniMax-M2.7-highspeed",
    "createdAt": "2026-03-21T10:30:00.000Z",
    "updatedAt": "2026-03-21T10:30:00.000Z",
    "messageCount": 0
  }
}
```

---

#### 获取会话列表
```
GET /api/v1/conversations?page=1&pageSize=20&keyword=技术
```

**响应**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "conv_abc123",
        "title": "技术讨论",
        "modelId": "MiniMax-M2.7-highspeed",
        "messageCount": 15,
        "createdAt": "2026-03-21T10:30:00.000Z",
        "updatedAt": "2026-03-21T11:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

#### 获取会话详情
```
GET /api/v1/conversations/{conversationId}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "conv_abc123",
    "title": "技术讨论",
    "modelId": "MiniMax-M2.7-highspeed",
    "messages": [
      {
        "id": "msg_001",
        "role": "user",
        "content": "你好，请介绍一下你自己",
        "createdAt": "2026-03-21T10:30:00.000Z"
      },
      {
        "id": "msg_002",
        "role": "assistant",
        "content": "你好，我是 AI Chat...",
        "model": "MiniMax-M2.7-highspeed",
        "usage": {
          "inputTokens": 50,
          "outputTokens": 200
        },
        "createdAt": "2026-03-21T10:30:01.000Z"
      }
    ],
    "createdAt": "2026-03-21T10:30:00.000Z",
    "updatedAt": "2026-03-21T10:30:01.000Z"
  }
}
```

---

#### 删除会话
```
DELETE /api/v1/conversations/{conversationId}
```

**响应**:
```
HTTP/1.1 204 No Content
```

---

### 2.2 Agent 相关 API

#### 创建 Agent
```
POST /api/v1/agents
```

**请求体**:
```json
{
  "name": "代码审查助手",
  "description": "自动审查代码质量和安全问题",
  "modelId": "MiniMax-M2.7-highspeed",
  "tools": ["web_search", "file_read", "code_review"],
  "maxIterations": 10,
  "timeout": 60000,
  "memoryEnabled": true,
  "ragEnabled": false
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "agent_abc123",
    "name": "代码审查助手",
    "description": "自动审查代码质量和安全问题",
    "modelId": "MiniMax-M2.7-highspeed",
    "tools": ["web_search", "file_read", "code_review"],
    "maxIterations": 10,
    "timeout": 60000,
    "createdAt": "2026-03-21T10:30:00.000Z"
  }
}
```

---

#### 执行 Agent
```
POST /api/v1/agents/{agentId}/execute
```

**请求体**:
```json
{
  "input": "请审查 src/utils/auth.js 文件",
  "stream": true,
  "options": {
    "sessionId": "session_xyz"
  }
}
```

**流式响应**:
```
event: start
data: {"runId": "run_abc123", "agentId": "agent_abc123", "timestamp": "..."}

event: thought
data: {"type": "thought", "content": "需要先读取文件内容...", "iteration": 1}

event: tool_call
data: {"type": "tool_call", "tool": "file_read", "input": {"path": "src/utils/auth.js"}}

event: tool_result
data: {"type": "tool_result", "tool": "file_read", "success": true, "output": "..."}

event: thought
data: {"type": "thought", "content": "文件已读取，现在开始审查...", "iteration": 2}

event: message
data: {"type": "message", "content": "审查结果：该文件存在以下问题..."}

event: checkpoint
data: {"type": "checkpoint", "checkpointId": "cp_001", "state": {...}}

event: done
data: {"type": "done", "runId": "run_abc123", "iterations": 5, "success": true, "usage": {...}}

event: error
data: {"type": "error", "code": "3205", "message": "Agent 执行超时"}
```

---

#### 获取 Agent 列表
```
GET /api/v1/agents?page=1&pageSize=20&status=running
```

---

#### 获取 Agent 执行历史
```
GET /api/v1/agents/{agentId}/history?page=1&pageSize=20
```

---

### 2.3 RAG/知识库 API

#### 创建知识库
```
POST /api/v1/kbs
```

**请求体**:
```json
{
  "name": "产品文档",
  "description": "公司产品相关文档",
  "embeddingModel": "mxbai-embed-large",
  "chunkStrategy": "semantic",
  "chunkSize": 500,
  "overlap": 50
}
```

---

#### 上传文档
```
POST /api/v1/kbs/{kbId}/documents
Content-Type: multipart/form-data

file: (binary)
title: 产品功能介绍
description: 详细介绍各功能模块
```

**响应**:
```json
{
  "success": true,
  "data": {
    "documentId": "doc_abc123",
    "kbId": "kb_abc123",
    "title": "产品功能介绍",
    "status": "processing",
    "chunks": 0,
    "createdAt": "2026-03-21T10:30:00.000Z"
  }
}
```

---

#### 获取文档处理状态
```
GET /api/v1/kbs/{kbId}/documents/{documentId}/status
```

**响应**:
```json
{
  "success": true,
  "data": {
    "documentId": "doc_abc123",
    "status": "completed",
    "progress": 100,
    "chunks": 45,
    "errors": [],
    "startedAt": "2026-03-21T10:30:00.000Z",
    "completedAt": "2026-03-21T10:31:30.000Z"
  }
}
```

---

#### 检索知识库
```
POST /api/v1/kbs/{kbId}/search
```

**请求体**:
```json
{
  "query": "如何配置 Docker",
  "topK": 5,
  "minSimilarity": 0.7,
  "includeMetadata": true
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "content": "Docker 配置步骤如下：\n1. 安装 Docker Engine\n2. 配置 daemon.json\n3. 重启服务",
        "score": 0.92,
        "documentId": "doc_abc123",
        "documentTitle": "Docker 安装指南",
        "chunkId": "chunk_001",
        "metadata": {
          "source": "/docs/docker.md",
          "page": 1
        }
      }
    ],
    "queryRewrite": "Docker 安装和配置方法",
    "totalDuration": 156,
    "channels": {
      "vector": {"count": 10, "duration": 45},
      "keyword": {"count": 5, "duration": 12}
    }
  }
}
```

---

### 2.4 HITL 人机确认 API

#### 创建确认请求
```
POST /api/v1/hitl/requests
```

**请求体**:
```json
{
  "sessionId": "session_abc123",
  "type": "dangerous_operation",
  "operation": "delete_files",
  "details": {
    "files": ["/tmp/test.txt", "/tmp/data.json"],
    "reason": "清理临时文件"
  },
  "timeout": 60000,
  "callbackUrl": "/api/hitl/callback"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "requestId": "hitl_abc123",
    "status": "pending",
    "expiresAt": "2026-03-21T10:31:00.000Z"
  }
}
```

---

#### 确认请求 SSE 订阅
```
GET /api/v1/hitl/subscribe/{sessionId}
```

**SSE 事件**:
```
event: hitl_request
data: {"requestId": "hitl_abc123", "type": "dangerous_operation", "operation": "delete_files", "details": {...}, "timeout": 60}

event: hitl_response
data: {"requestId": "hitl_abc123", "approved": true, "userId": "user_xxx", "timestamp": "..."}
```

---

#### 响应确认请求
```
POST /api/v1/hitl/requests/{requestId}/respond
```

**请求体**:
```json
{
  "approved": true,
  "comment": "确认可以删除这些临时文件"
}
```

---

### 2.5 A2A 协作 API

#### 注册 Agent
```
POST /api/v1/a2a/agents/register
```

**请求体**:
```json
{
  "agentId": "agent_abc123",
  "name": "代码审查助手",
  "capabilities": ["code_review", "web_search"],
  "endpoint": "http://localhost:30000/api/a2a/agents/agent_abc123",
  "metadata": {
    "version": "1.0.0"
  }
}
```

---

#### 发送任务
```
POST /api/v1/a2a/tasks/send
```

**请求体**:
```json
{
  "fromAgentId": "agent_requester",
  "toAgentId": "agent_coder",
  "taskType": "code_generation",
  "input": {
    "description": "生成一个用户登录的 REST API",
    "requirements": ["使用 Express", "支持 JWT 认证", "包含单元测试"]
  },
  "callbackUrl": "http://localhost:30000/api/a2a/tasks/callback"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "taskId": "task_abc123",
    "status": "pending",
    "estimatedDuration": 30000
  }
}
```

---

#### 订阅任务结果
```
GET /api/v1/a2a/tasks/{taskId}/subscribe
```

---

## 三、错误响应格式

### 3.1 标准错误响应

```json
{
  "success": false,
  "code": "2001",
  "message": "参数校验失败",
  "detail": "message 字段不能为空",
  "traceId": "abc123def456",
  "timestamp": "2026-03-21T10:30:00.000Z",
  "path": "/api/v1/chat/send",
  "errors": [
    {
      "field": "message",
      "message": "消息内容不能为空",
      "code": "REQUIRED_FIELD"
    }
  ],
  "suggestion": "请检查请求参数是否完整"
}
```

### 3.2 业务错误响应

```json
{
  "success": false,
  "code": "3205",
  "message": "Agent 执行超时",
  "detail": "Agent: agent_abc123, iterations: 10/10",
  "traceId": "abc123def456",
  "timestamp": "2026-03-21T10:30:00.000Z",
  "path": "/api/v1/agents/agent_abc123/execute",
  "suggestion": "请尝试减少任务复杂度或增加 timeout 配置"
}
```

### 3.3 限流响应

```json
{
  "success": false,
  "code": "3005",
  "message": "请求过于频繁",
  "traceId": "abc123def456",
  "timestamp": "2026-03-21T10:30:00.000Z",
  "path": "/api/v1/chat/send",
  "retryAfter": 5,
  "blockedBy": "user"
}
```

---

## 四、WebSocket API

### 4.1 实时对话

```
WS /api/v1/ws/chat?token={jwt}
```

**消息格式**:
```json
// 客户端发送
{
  "type": "message",
  "conversationId": "conv_abc123",
  "content": "你好"
}

// 服务端发送
{
  "type": "message",
  "content": "你好",
  "done": false
}

{
  "type": "done",
  "usage": {"inputTokens": 50, "outputTokens": 100}
}

{
  "type": "error",
  "code": "4103",
  "message": "LLM 请求限流"
}
```

---

## 五、API 版本管理

### 5.1 版本策略

```
- URL 路径版本: /api/v1/, /api/v2/
- 主要版本 (v1, v2): 不兼容变更
- 次要版本: 向后兼容的功能添加
- 补丁版本: 内部变更，不影响 API
```

### 5.2 版本兼容性

```javascript
// 中间件版本检查
function versionCheck(req, res, next) {
  const version = req.headers['api-version'] || 'v1';

  if (!['v1'].includes(version)) {
    return res.status(400).json({
      success: false,
      code: '2003',
      message: `API 版本 ${version} 不支持`
    });
  }

  req.apiVersion = version;
  next();
}
```

---

**文档更新日期**: 2026-03-21
**下次审查**: 2026-04-21
**负责人**: AI Team
