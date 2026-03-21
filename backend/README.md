# AI Chat Backend

现代化AI对话平台后端服务

## 快速开始

### 安装依赖

```bash
cd backend
npm install
```

### 启动服务

```bash
npm start
```

服务将在 http://localhost:8080 启动

## API 接口

### 1. SSE流式聊天 - `/api/chat`

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "你好"}],
    "model": "gpt-4o",
    "stream": true
  }'
```

响应格式 (SSE):
```
data: {"type": "connected"}\n\n
data: {"type": "chunk", "content": "你"}\n\n
data: {"type": "chunk", "content": "好"}\n\n
...
data: {"type": "done"}\n\n
```

### 2. 停止生成 - `/api/chat/stop`

```bash
curl -X POST http://localhost:3001/api/chat/stop
```

### 3. 配置管理 - `/api/config`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/config | 获取所有配置 |
| GET | /api/config/channels | 获取渠道列表 |
| GET | /api/config/channels/:id | 获取指定渠道 |
| PUT | /api/config/channels/:id | 更新渠道配置 |
| POST | /api/config/channels/:id/toggle | 切换渠道启用状态 |
| GET | /api/config/keys | 获取API Key状态 |
| POST | /api/config/keys | 设置API Key |

### 4. 会话管理 - `/api/sessions`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/sessions | 获取所有会话 |
| GET | /api/sessions/:id | 获取指定会话 |
| POST | /api/sessions | 创建新会话 |
| PUT | /api/sessions/:id | 更新会话 |
| POST | /api/sessions/:id/messages | 添加消息 |
| DELETE | /api/sessions/:id | 删除会话 |

### 5. 健康检查 - `/api/health`

```bash
curl http://localhost:3001/api/health
```

## SSE数据格式

标准SSE格式:
```
data: {"type": "chunk", "content": "文字"}\n\n
```

类型说明:
- `connected`: 连接成功
- `chunk`: 内容片段
- `done`: 完成
- `error`: 错误

## 支持的渠道

- OpenAI (gpt-4o, gpt-4-turbo, gpt-3.5-turbo)
- Anthropic Claude (claude-3-opus, claude-3-sonnet, claude-3-haiku)
- 智谱AI (glm-4, glm-3-turbo)
- Minimax (abab6.5s-chat, abab6-chat)
