# AI Chat 玩具 - API 完整文档

## 目录

1. [概述](#概述)
2. [基础信息](#基础信息)
3. [聊天接口](#聊天接口)
4. [Agent接口](#agent接口)
5. [A2A接口](#a2a接口)
6. [HITL接口](#hitl接口)
7. [Admin管理接口](#admin管理接口)
8. [监控接口](#监控接口)
9. [错误码说明](#错误码说明)
10. [使用示例](#使用示例)

---

## 概述

### API 基础URL

```
http://localhost:30000
```

### 认证方式

本项目使用 API Key 认证，通过 HTTP Header 传递：

```
Authorization: Bearer <your_api_key>
```

### 请求格式

- Content-Type: `application/json`
- 字符编码: `UTF-8`

### 响应格式

所有 API 返回 JSON 格式，成功响应示例：

```json
{
    "success": true,
    "data": { ... }
}
```

失败响应示例：

```json
{
    "error": {
        "code": 400,
        "message": "参数错误",
        "detail": "messages不能为空"
    }
}
```

---

## 基础信息

### 健康检查

检查服务是否正常运行。

**请求**

```http
GET /health
```

**响应**

```json
{
    "service": "ai-chat-backend-go",
    "status": "ok",
    "version": "1.0.0"
}
```

---

## 聊天接口

### 1. 发送聊天消息

发送消息并获取 AI 回复。

**请求**

```http
POST /api/chat
Content-Type: application/json

{
    "messages": [
        {
            "role": "user",
            "content": "你好"
        }
    ],
    "model": "MiniMax-M2.7",
    "stream": false
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| messages | array | 是 | 消息列表 |
| messages[].role | string | 是 | 角色：user/assistant/system |
| messages[].content | string | 是 | 消息内容 |
| model | string | 否 | 模型名称，默认 MiniMax-M2.7 |
| stream | boolean | 否 | 是否流式响应，默认 false |

**响应**

```json
{
    "id": "user",
    "model": "MiniMax-M2.7",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "你好！有什么可以帮助你的吗？"
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "input_tokens": 42,
        "output_tokens": 35,
        "total_tokens": 77
    }
}
```

### 2. 流式聊天

使用 SSE 进行流式响应。

**请求**

```http
POST /api/chat/stream
Content-Type: application/json

{
    "messages": [
        {
            "role": "user",
            "content": "讲一个故事"
        }
    ],
    "model": "MiniMax-M2.7"
}
```

**响应 (SSE)**

```
event: message
data: {"content": "很久"}

event: message
data: {"content": "以前"}

event: message
data: {"content": "，"}

event: done
data: {"content": ""}
```

### 3. 获取会话历史

获取指定会话的聊天记录。

**请求**

```http
GET /api/chat/history/{sessionId}
```

| 参数 | 类型 | 说明 |
|------|------|------|
| sessionId | string | 会话ID |

**响应**

```json
{
    "success": true,
    "session": {
        "ID": "user",
        "Messages": [
            {
                "role": "user",
                "content": "Hello"
            },
            {
                "role": "assistant",
                "content": "Hello! How can I help you?"
            }
        ],
        "CreatedAt": 1775142899237,
        "UpdatedAt": 1775142912998,
        "Metadata": {}
    }
}
```

### 4. 获取会话列表

获取所有会话的列表。

**请求**

```http
GET /api/chat/sessions
```

**响应**

```json
{
    "success": true,
    "sessions": [
        {
            "ID": "user-001",
            "Messages": [...],
            "CreatedAt": 1775142899237,
            "UpdatedAt": 1775142912998
        }
    ]
}
```

### 5. 删除会话

删除指定的会话。

**请求**

```http
DELETE /api/chat/session/{sessionId}
```

**响应**

```json
{
    "success": true,
    "message": "会话已删除"
}
```

---

## Agent接口

### 1. 执行 Agent 任务

让 Agent 执行特定任务。

**请求**

```http
POST /api/agent/execute
Content-Type: application/json

{
    "task": "帮我查询今天北京的天气",
    "sessionId": "session-001",
    "tools": ["weather", "search"],
    "maxSteps": 10
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| task | string | 是 | 要执行的任务 |
| sessionId | string | 否 | 会话ID |
| tools | array | 否 | 允许使用的工具列表 |
| maxSteps | number | 否 | 最大执行步数，默认10 |

**响应**

```json
{
    "success": true,
    "taskId": "task-001",
    "status": "completed",
    "result": {
        "content": "今天北京天气晴，温度15-25度",
        "toolCalls": [
            {
                "tool": "weather",
                "args": {"city": "北京"},
                "result": "晴，15-25度"
            }
        ]
    }
}
```

### 2. Agent SSE 流式

Agent 执行结果的流式输出。

**请求**

```http
GET /api/agent/stream?task=帮我查询天气&sessionId=session-001
```

**响应 (SSE)**

```
event: thinking
data: {"content": "我需要先查询天气工具"}

event: tool_call
data: {"tool": "weather", "args": {"city": "北京"}}

event: tool_result
data: {"result": "晴，15-25度"}

event: done
data: {"content": "今天北京天气晴，温度15-25度"}
```

### 3. 取消 Agent 任务

取消正在执行的 Agent 任务。

**请求**

```http
POST /api/agent/cancel/{sessionId}
```

**响应**

```json
{
    "success": true,
    "message": "任务已取消"
}
```

### 4. 获取 Agent 工具列表

获取当前可用的工具列表。

**请求**

```http
GET /api/agent/tools
```

**响应**

```json
{
    "success": true,
    "tools": [
        {
            "name": "weather",
            "description": "查询天气",
            "parameters": {
                "city": {"type": "string", "description": "城市名称"}
            }
        },
        {
            "name": "search",
            "description": "网络搜索",
            "parameters": {
                "query": {"type": "string", "description": "搜索关键词"}
            }
        }
    ]
}
```

### 5. 获取 Agent 会话

获取 Agent 执行状态和历史。

**请求**

```http
GET /api/agent/session/{id}
```

**响应**

```json
{
    "success": true,
    "session": {
        "id": "session-001",
        "status": "completed",
        "createdAt": "2026-04-03T01:00:00Z",
        "messages": [...],
        "tools": ["weather", "search"]
    }
}
```

### 6. 获取所有 Agent 会话

**请求**

```http
GET /api/agent/sessions
```

**响应**

```json
{
    "success": true,
    "sessions": [...]
}
```

---

## A2A接口

A2A (Agent-to-Agent) 协议用于多个 Agent 之间的通信。

### 1. 获取所有 Agent

**请求**

```http
GET /api/a2a/agents
```

**响应**

```json
{
    "success": true,
    "agents": [
        {
            "id": "agent-001",
            "name": "researcher",
            "description": "研究助手",
            "status": "online",
            "capabilities": ["search", "analysis"]
        }
    ],
    "count": 1
}
```

### 2. 获取单个 Agent

**请求**

```http
GET /api/a2a/agents/{agentId}
```

**响应**

```json
{
    "success": true,
    "agent": {
        "id": "agent-001",
        "name": "researcher",
        "description": "研究助手",
        "status": "online",
        "capabilities": ["search", "analysis"],
        "lastHeartbeat": "2026-04-03T01:00:00Z"
    }
}
```

### 3. Agent 心跳

Agent 定期发送心跳表示在线。

**请求**

```http
POST /api/a2a/agents/{agentId}/heartbeat
Content-Type: application/json

{
    "status": "online",
    "capabilities": ["search", "analysis"]
}
```

**响应**

```json
{
    "success": true,
    "timestamp": 1775142899237
}
```

### 4. 发送消息

向指定 Agent 发送消息。

**请求**

```http
POST /api/a2a/messages/send
Content-Type: application/json

{
    "from": "agent-001",
    "to": "agent-002",
    "message": {
        "type": "task",
        "content": "帮我分析这份报告",
        "taskId": "task-001"
    }
}
```

**响应**

```json
{
    "success": true,
    "messageId": "msg-001",
    "timestamp": 1775142899237
}
```

### 5. 订阅消息

通过 SSE 订阅 Agent 消息。

**请求**

```http
GET /api/a2a/subscribe/{sessionId}
```

**响应 (SSE)**

```
event: message
data: {"from": "agent-002", "content": "分析完成"}

event: message
data: {"from": "agent-002", "content": "结果如下..."}
```

---

## HITL接口

HITL (Human-in-the-Loop) 用于需要人工确认的操作。

### 1. 创建检查点

创建一个需要人工确认的检查点。

**请求**

```http
POST /api/hitl/checkpoint
Content-Type: application/json

{
    "type": "approval",
    "title": "确认删除文件",
    "description": "即将删除 10 个文件",
    "payload": {
        "files": ["file1.txt", "file2.txt"],
        "action": "delete"
    },
    "timeout": 60
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 检查点类型：approval/confirm/warning |
| title | string | 是 | 标题 |
| description | string | 是 | 描述 |
| payload | object | 否 | 附加数据 |
| timeout | number | 否 | 超时时间（秒），默认60 |

**响应**

```json
{
    "success": true,
    "checkpoint": {
        "id": "cp-001",
        "type": "approval",
        "title": "确认删除文件",
        "status": "pending",
        "createdAt": 1775142899237,
        "expiresAt": 1775142959237
    }
}
```

### 2. 获取检查点

**请求**

```http
GET /api/hitl/checkpoint/{id}
```

**响应**

```json
{
    "success": true,
    "checkpoint": {
        "id": "cp-001",
        "type": "approval",
        "title": "确认删除文件",
        "description": "即将删除 10 个文件",
        "status": "pending",
        "payload": {...},
        "createdAt": 1775142899237,
        "expiresAt": 1775142959237
    }
}
```

### 3. 批准检查点

**请求**

```http
POST /api/hitl/checkpoint/{id}/approve
Content-Type: application/json

{
    "comment": "确认删除"
}
```

**响应**

```json
{
    "success": true,
    "checkpoint": {
        "id": "cp-001",
        "status": "approved",
        "approvedAt": 1775142900000
    }
}
```

### 4. 拒绝检查点

**请求**

```http
POST /api/hitl/checkpoint/{id}/reject
Content-Type: application/json

{
    "reason": "不应该删除这些文件"
}
```

**响应**

```json
{
    "success": true,
    "checkpoint": {
        "id": "cp-001",
        "status": "rejected",
        "rejectedAt": 1775142900000
    }
}
```

### 5. 获取待处理检查点

**请求**

```http
GET /api/hitl/pending
```

**响应**

```json
{
    "success": true,
    "checkpoints": [
        {
            "id": "cp-001",
            "type": "approval",
            "title": "确认删除文件",
            "status": "pending",
            "createdAt": 1775142899237
        }
    ],
    "count": 1
}
```

### 6. 获取历史记录

**请求**

```http
GET /api/hitl/history
```

**响应**

```json
{
    "success": true,
    "history": [
        {
            "id": "cp-001",
            "type": "approval",
            "title": "确认删除文件",
            "status": "approved",
            "createdAt": 1775142899237,
            "approvedAt": 1775142900000
        }
    ],
    "count": 1
}
```

### 7. 获取统计信息

**请求**

```http
GET /api/hitl/stats
```

**响应**

```json
{
    "success": true,
    "stats": {
        "approved": 10,
        "pending": 2,
        "rejected": 3,
        "timeout": 1,
        "total": 16
    }
}
```

### 8. 请求确认

**请求**

```http
POST /api/hitl/confirm
Content-Type: application/json

{
    "type": "dangerous",
    "action": "delete",
    "resource": "10 files",
    "reason": "清理临时文件"
}
```

### 9. 清除待处理

**请求**

```http
POST /api/hitl/clear
```

---

## Admin管理接口

### 知识库管理

#### 1. 列出知识库文档

**请求**

```http
GET /api/admin/knowledge
```

**响应**

```json
{
    "success": true,
    "documents": [
        {
            "id": "doc-001",
            "title": "产品手册",
            "createdAt": "2026-04-01T00:00:00Z"
        }
    ]
}
```

#### 2. 获取知识库文档

**请求**

```http
GET /api/admin/knowledge/{id}
```

#### 3. 创建知识库文档

**请求**

```http
POST /api/admin/knowledge
Content-Type: application/json

{
    "title": "新文档",
    "content": "文档内容...",
    "tags": ["tag1", "tag2"]
}
```

#### 4. 更新知识库文档

**请求**

```http
PUT /api/admin/knowledge/{id}
Content-Type: application/json

{
    "title": "更新后的标题",
    "content": "更新后的内容"
}
```

#### 5. 删除知识库文档

**请求**

```http
DELETE /api/admin/knowledge/{id}
```

#### 6. 重新索引文档

**请求**

```http
POST /api/admin/knowledge/{id}/index
```

---

### 工具管理

#### 1. 列出工具

**请求**

```http
GET /api/admin/tool
```

**响应**

```json
{
    "success": true,
    "tools": [
        {
            "name": "weather",
            "description": "查询天气",
            "enabled": true
        }
    ]
}
```

#### 2. 获取工具详情

**请求**

```http
GET /api/admin/tool/{name}
```

#### 3. 注册工具

**请求**

```http
POST /api/admin/tool
Content-Type: application/json

{
    "name": "custom_tool",
    "description": "自定义工具",
    "parameters": {
        "input": {"type": "string"}
    },
    "handler": "custom_tool_handler"
}
```

#### 4. 更新工具

**请求**

```http
PUT /api/admin/tool/{name}
```

#### 5. 删除工具

**请求**

```http
DELETE /api/admin/tool/{name}
```

#### 6. 测试工具

**请求**

```http
POST /api/admin/tool/{name}/test
Content-Type: application/json

{
    "args": {"input": "test"}
}
```

---

### 模型管理

#### 1. 列出模型

**请求**

```http
GET /api/admin/model
```

**响应**

```json
{
    "success": true,
    "models": [
        {
            "name": "MiniMax-M2.7",
            "provider": "minimax",
            "enabled": true
        }
    ]
}
```

#### 2. 获取模型详情

**请求**

```http
GET /api/admin/model/{name}
```

#### 3. 注册模型

**请求**

```http
POST /api/admin/model
Content-Type: application/json

{
    "name": "gpt-4",
    "provider": "openai",
    "apiKey": "sk-xxx",
    "endpoint": "https://api.openai.com/v1"
}
```

#### 4. 更新模型

**请求**

```http
PUT /api/admin/model/{name}
```

#### 5. 删除模型

**请求**

```http
DELETE /api/admin/model/{name}
```

#### 6. 健康检查

**请求**

```http
GET /api/admin/model/{name}/health
```

---

### Prompt模板管理

#### 1. 列出模板

**请求**

```http
GET /api/admin/prompt
```

#### 2. 获取模板

**请求**

```http
GET /api/admin/prompt/{id}
```

#### 3. 创建模板

**请求**

```http
POST /api/admin/prompt
Content-Type: application/json

{
    "name": "default_chat",
    "template": "你是一个助手，{{system_prompt}}",
    "variables": ["system_prompt"]
}
```

#### 4. 更新模板

**请求**

```http
PUT /api/admin/prompt/{id}
```

#### 5. 删除模板

**请求**

```http
DELETE /api/admin/prompt/{id}
```

#### 6. 创建版本

**请求**

```http
POST /api/admin/prompt/{id}/version
Content-Type: application/json

{
    "template": "更新后的模板...",
    "version": "2.0"
}
```

---

### 链路追踪

#### 1. 列出追踪记录

**请求**

```http
GET /api/admin/trace
```

#### 2. 获取追踪详情

**请求**

```http
GET /api/admin/trace/{id}
```

#### 3. 获取统计信息

**请求**

```http
GET /api/admin/trace/stats
```

#### 4. 按会话获取追踪

**请求**

```http
GET /api/admin/trace/session/{sessionId}
```

---

## 监控接口

### Metrics

Prometheus 格式的指标数据。

**请求**

```http
GET /metrics
```

**响应**

```
# HELP go_gc_duration_seconds GC duration
# TYPE go_gc_duration_seconds summary
go_gc_duration_seconds{quantile="0"} 0.000123
...

# HELP http_requests_total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="POST",path="/api/chat"} 100
...
```

---

## 错误码说明

| 错误码 | HTTP状态 | 说明 |
|--------|----------|------|
| 400 | 400 | 参数错误 |
| 401 | 401 | 未授权 |
| 403 | 403 | 禁止访问 |
| 404 | 404 | 资源不存在 |
| 429 | 429 | 请求过于频繁 |
| 500 | 500 | 服务器内部错误 |
| 502 | 502 | 网关错误 |
| 503 | 503 | 服务不可用 |

---

## 使用示例

### cURL 示例

```bash
# 健康检查
curl http://localhost:30000/health

# 发送聊天消息
curl -X POST http://localhost:30000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'

# 获取会话历史
curl http://localhost:30000/api/chat/history/user

# 获取工具列表
curl http://localhost:30000/api/agent/tools

# 获取待处理确认
curl http://localhost:30000/api/hitl/pending

# 批准确认
curl -X POST http://localhost:30000/api/hitl/checkpoint/cp-001/approve
```

### JavaScript (Fetch) 示例

```javascript
// 发送聊天消息
async function sendChat(message) {
    const response = await fetch('http://localhost:30000/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messages: [{ role: 'user', content: message }]
        })
    });
    return await response.json();
}

// 使用
const result = await sendChat('Hello!');
console.log(result.choices[0].message.content);
```

### Python 示例

```python
import requests

# 发送聊天消息
def send_chat(message):
    response = requests.post(
        'http://localhost:30000/api/chat',
        json={'messages': [{'role': 'user', 'content': message}]}
    )
    return response.json()

# 使用
result = send_chat('Hello!')
print(result['choices'][0]['message']['content'])
```
