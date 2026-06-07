# A2A (Agent-to-Agent) 协议说明

> 本文档描述 SimpleAgent 项目中的 A2A 协议实现，用于 Agent 之间的消息传递、任务委托和协作调度。

## 目录

- [概述](#概述)
- [协调模式](#协调模式)
- [API 端点](#api-端点)
- [消息类型](#消息类型)
- [任务状态](#任务状态)
- [使用示例](#使用示例)

---

## 概述

A2A 协议是 SimpleAgent 的多 Agent 协作核心协议，基于 Claude Code 多 Agent 协作机制设计实现。

### 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| A2AService | `services/a2aService.js` | Agent 注册、消息传递、任务委托 |
| MultiAgentCoordinator | `services/MultiAgentCoordinator.js` | 多 Agent 协作调度、三种协调模式 |
| A2A 路由 | `routes/a2a.js` | REST API 接口层 |

### 架构特点

- **消息代理模式**：基于内存的消息队列，支持 SSE 实时订阅
- **心跳检测**：60 秒无心跳视为离线，自动清理
- **任务委托**：支持超时控制、优先级、标签
- **生命周期钩子**：task:created / task:completed / task:failed / task:skipped

---

## 协调模式

### 三种协调模式

| 模式 | 值 | 说明 | 适用场景 |
|------|------|------|----------|
| 团队领导模式 | `team_leader` | 主 Agent 主导，其他执行 | 复杂分层任务 |
| 协作模式 | `collaborative` | 对等协作，共享职责 | 并行专业工作 |
| 自主模式 | `autonomous` | 独立执行，最小协调 | 独立并行任务 |

### 模式详解

#### 1. TEAM_LEADER (团队领导模式)

主 Agent 协调，其他 Agent 执行。每层任务选择一个主 Agent，先执行主 Agent，成功后再并行执行其他 Worker。

```
┌─────────────────────────────────────────┐
│  Level 1                                │
│  ┌─────────┐     ┌─────────┐            │
│  │ Leader  │────▶│ Worker1 │            │
│  │   ✓     │     │   ✓     │            │
│  └────┬────┘     └─────────┘            │
└───────┼──────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  Level 2                                │
│  ┌─────────┐     ┌─────────┐            │
│  │ Leader  │────▶│ Worker2 │            │
│  │   ✓     │     │   ✓     │            │
│  └─────────┘     └─────────┘            │
└─────────────────────────────────────────┘
```

#### 2. COLLABORATIVE (协作模式)

基于依赖关系的层级执行，同一层任务并行执行，下一层需等上一层完成。

```
┌─────────────────────────────────────────┐
│  Level 1 (并行)                         │
│  ┌─────────┐     ┌─────────┐            │
│  │ Task A  │     │ Task B  │            │
│  └────┬────┘     └────┬────┘            │
└───────┼───────────────┼──────────────────┘
        │               │
        ▼               ▼
┌─────────────────────────────────────────┐
│  Level 2 (等 Level 1 完成)             │
│  ┌─────────────────────────┐            │
│  │    Task C (依赖 A, B)    │            │
│  └─────────────────────────┘            │
└─────────────────────────────────────────┘
```

#### 3. AUTONOMOUS (自主模式)

所有任务独立并行执行，无协调依赖，最小化协调开销。

```
┌─────────────────────────────────────────┐
│  所有任务并行独立执行                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Task A  │ │ Task B  │ │ Task C  │   │
│  │   ✓     │ │   ✓     │ │   ✓     │   │
│  └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────┘
```

### 前后端定义一致性

> **重要**: 前后端协调模式枚举定义需保持一致

| 位置 | 枚举名 | 值 |
|------|--------|-----|
| **前端** | `CoordinationMode` | `'TEAM_LEADER' \| 'COLLABORATIVE' \| 'AUTONOMOUS'` |
| **后端** | `CoordinationMode` | `'team_leader' \| 'collaborative' \| 'autonomous'` |

**前端定义** (`frontend/src/components/agent/CoordinationModeSelector.tsx`):
```typescript
export type CoordinationMode = 'TEAM_LEADER' | 'COLLABORATIVE' | 'AUTONOMOUS';
```

**后端定义** (`backend/src/services/MultiAgentCoordinator.js`):
```javascript
const CoordinationMode = {
  TEAM_LEADER: 'team_leader',      // 注意：存储值为小写下划线格式
  COLLABORATIVE: 'collaborative',
  AUTONOMOUS: 'autonomous'
};
```

**API 响应格式** (`GET /api/a2a/coordination/modes`):
```json
{
  "success": true,
  "modes": {
    "TEAM_LEADER": {
      "value": "team_leader",
      "description": "One agent orchestrates others",
      "useCase": "Complex hierarchical tasks"
    },
    "COLLABORATIVE": {
      "value": "collaborative",
      "description": "Agents share responsibilities",
      "useCase": "Parallel specialized work"
    },
    "AUTONOMOUS": {
      "value": "autonomous",
      "description": "Agents work independently",
      "useCase": "Independent parallel tasks"
    }
  }
}
```

---

## API 端点

### 服务状态

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/a2a/status` | 获取服务统计信息 |

**响应示例**:
```json
{
  "success": true,
  "onlineAgents": 3,
  "totalAgents": 5,
  "pendingTasks": 2,
  "messageInboxSize": 15,
  "processedMessages": 150
}
```

### Agent 管理

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/a2a/agents` | 获取所有 Agent |
| GET | `/api/a2a/agents/:agentId` | 获取单个 Agent |
| POST | `/api/a2a/agents/register` | 注册 Agent |
| POST | `/api/a2a/agents/:agentId/unregister` | 注销 Agent |
| POST | `/api/a2a/agents/:agentId/heartbeat` | 心跳检测 |

**注册请求**:
```json
{
  "id": "agent-coder-1",
  "name": "代码编写 Agent",
  "type": "coder",
  "capabilities": ["code-generation", "refactoring"],
  "metadata": { "effort": "high" }
}
```

### 消息传递

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/a2a/send` | 发送消息/委托任务 |
| GET | `/api/a2a/receive` | 拉取消息 |
| GET | `/api/a2a/poll` | 长轮询消息 |
| GET | `/api/a2a/unread/:agentId` | 获取未读消息数 |
| POST | `/api/a2a/ack` | 确认消息已读 |
| GET | `/api/a2a/subscribe/:agentId` | SSE 订阅消息 |

**发送消息请求**:
```json
{
  "from": "agent-coordinator",
  "to": "agent-coder-1",
  "type": "task.delegate",
  "payload": {
    "title": "实现用户登录功能",
    "description": "需要实现 JWT 认证",
    "input": { "spec": "..." }
  },
  "priority": 1,
  "timeout": 60000
}
```

### 任务管理

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/a2a/tasks` | 列出所有任务 |
| GET | `/api/a2a/tasks/:taskId` | 获取任务状态 |
| POST | `/api/a2a/result/:taskId` | 返回任务结果 |
| POST | `/api/a2a/progress/:taskId` | 发送进度更新 |
| DELETE | `/api/a2a/tasks/:taskId` | 取消任务 |

### 协作任务

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/a2a/collaborate` | 执行协作任务 |
| GET | `/api/a2a/collaboration/stats` | 获取协作统计 |
| GET | `/api/a2a/collaboration/:taskId` | 获取协作状态 |
| GET | `/api/a2a/collaboration/:taskId/result` | 获取协作结果 |
| DELETE | `/api/a2a/collaboration/:taskId` | 取消协作 |
| GET | `/api/a2a/collaboration/:taskId/subscribe` | SSE 订阅协作状态 |

**协作请求示例**:
```json
{
  "title": "PR Review 协作",
  "tasks": [
    {
      "agentName": "reviewer",
      "taskType": "security-review",
      "prompt": "审查 PR 中的安全问题...",
      "dependencies": []
    },
    {
      "agentName": "reviewer",
      "taskType": "code-review",
      "prompt": "审查 PR 中的代码质量问题...",
      "dependencies": []
    }
  ],
  "options": {
    "coordinationMode": "collaborative",
    "minSuccessRate": 0.5,
    "timeout": 120000
  }
}
```

### 协调模式

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/a2a/coordination/modes` | 获取协调模式信息 |

### 任务定义

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/a2a/tasks/define` | 创建任务定义 |
| POST | `/api/a2a/tasks/define/batch` | 批量创建任务定义 |
| GET | `/api/a2a/tasks/define/:taskId` | 获取任务定义 |

---

## 消息类型

| 类型 | 说明 | 用途 |
|------|------|------|
| `task.delegate` | 任务委托 | 主 Agent 向 Worker 委托任务 |
| `result.return` | 结果回传 | Worker 返回执行结果 |
| `status.sync` | 状态同步 | Agent 状态广播 |
| `heartbeat` | 心跳检测 | 保持连接活跃 |
| `error.notify` | 错误通知 | 任务失败/取消通知 |
| `progress.update` | 进度更新 | 任务执行进度 |

### A2AMessage 结构

```javascript
{
  id: "msg_1234567890_abc",
  type: "task.delegate",
  from: "agent-coordinator",
  to: "agent-coder-1",
  taskId: "task_abc123",
  sessionId: "session_xyz",
  payload: {
    title: "实现登录功能",
    description: "使用 JWT 实现",
    input: { spec: "..." }
  },
  status: "pending",
  timestamp: 1704067200000,
  expiresAt: 1704067500000,
  replyTo: null,
  metadata: {}
}
```

---

## 任务状态

| 状态 | 说明 |
|------|------|
| `pending` | 等待执行 |
| `running` | 执行中 |
| `completed` | 已完成 |
| `failed` | 失败 |
| `cancelled` | 已取消 |
| `skipped` | 因依赖失败而跳过 |

### 协作任务状态

| 状态 | 说明 |
|------|------|
| `pending` | 等待开始 |
| `running` | 执行中 |
| `partial_completed` | 部分完成 |
| `completed` | 全部完成 |
| `failed` | 全部失败 |
| `cancelled` | 已取消 |

---

## 使用示例

### 1. 注册 Agent

```javascript
// POST /api/a2a/agents/register
const response = await fetch('/api/a2a/agents/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 'agent-coder-1',
    name: '代码编写 Agent',
    type: 'coder',
    capabilities: ['code-generation', 'refactoring']
  })
});
```

### 2. 委托任务

```javascript
// POST /api/a2a/send
const response = await fetch('/api/a2a/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: 'coordinator',
    to: 'agent-coder-1',
    type: 'task.delegate',
    payload: {
      title: '实现登录功能',
      description: '使用 JWT 实现用户认证',
      input: { spec: '...' }
    },
    timeout: 60000
  })
});
```

### 3. 发起协作

```javascript
// POST /api/a2a/collaborate
const response = await fetch('/api/a2a/collaborate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'PR 审查协作',
    tasks: [
      {
        agentName: 'security-reviewer',
        taskType: 'security-review',
        prompt: '审查安全问题...',
        dependencies: []
      },
      {
        agentName: 'code-reviewer',
        taskType: 'code-review',
        prompt: '审查代码质量...',
        dependencies: []
      }
    ],
    options: {
      coordinationMode: 'collaborative',
      minSuccessRate: 0.5
    }
  })
});
```

### 4. SSE 订阅消息

```javascript
const eventSource = new EventSource('/api/a2a/subscribe/agent-coder-1');

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  console.log('收到消息:', data);
});

eventSource.addEventListener('connected', (event) => {
  console.log('连接成功');
});
```

---

## 前端组件

### CoordinationModeSelector

前端组件位置: `frontend/src/components/agent/CoordinationModeSelector.tsx`

**支持模式**:

| 模式 | 中文标签 | 图标 |
|------|----------|------|
| `TEAM_LEADER` | 团队领导模式 | Users |
| `COLLABORATIVE` | 协作模式 | Link2 |
| `AUTONOMOUS` | 自主模式 | Zap |

**组件变体**:

1. **下拉选择器** (默认): 完整功能，支持详情展示
2. **紧凑模式** (`compact={true}`): 按钮组风格
3. **单选按钮组** (`CoordinationModeRadioGroup`): 表单内使用

---

## 注意事项

1. **值不一致**: 前端使用大写枚举 (`TEAM_LEADER`)，后端存储使用小写下划线格式 (`team_leader`)，API 传输时需转换
2. **心跳超时**: 60 秒无心跳视为离线
3. **消息过期**: 默认 30 分钟过期
4. **任务超时**: 默认 5 分钟，需在委托时指定
5. **依赖循环**: 系统会检测并拒绝循环依赖

---

**文档更新**: 2026-05-24
**版本**: v2.5.1