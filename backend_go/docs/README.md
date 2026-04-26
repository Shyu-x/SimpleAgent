# AI Chat 玩具 - Go 版本后端

## 项目简介

这是一个使用 **Go 语言** 开发的企业级 AI Agent 后端系统，集成了 **MiniMax-M2.7** 大语言模型，支持：

- 💬 **智能对话** - 基于 MiniMax API 的自然语言交互
- 🤖 **Agent 执行** - ReAct 执行循环，工具调用
- 🔍 **RAG 检索** - 知识库增强生成
- 👥 **A2A 协作** - 多 Agent 之间通信
- ✅ **HITL 确认** - 人机协作确认机制
- 📊 **监控指标** - Prometheus 格式指标采集
- 🔒 **熔断限流** - 企业级稳定性保护

## 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 语言 | Go 1.21+ | 高性能、并发、安全 |
| Web框架 | Gin | Go 最流行的 HTTP 框架 |
| 配置 | Viper | 支持 YAML、环境变量 |
| 日志 | zerolog | 高性能结构化日志 |
| 熔断 | gobreaker | 熔断器实现 |
| 限流 | limiter | 多策略限流 |
| 指标 | prometheus | Prometheus 客户端 |

## 快速开始

### 1. 安装 Go

访问 [https://go.dev/dl/](https://go.dev/dl/) 下载安装 Go 1.21 或更高版本。

验证安装：
```bash
go version
# 输出: go version go1.21.x linux/amd64
```

### 2. 克隆项目

```bash
cd ~/projects  # 或你喜欢的目录
git clone <项目地址> backend_go
cd backend_go
```

### 3. 配置环境变量

创建 `.env` 文件：

```bash
# MiniMax API 配置
MINIMAX_API_KEY=你的API密钥
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic
MINIMAX_MODEL=MiniMax-M2.7
```

### 4. 运行服务

```bash
# 下载依赖
go mod tidy

# 编译
go build -o server ./cmd/server

# 运行
MINIMAX_API_KEY=你的密钥 ./server
```

服务启动后访问：`http://localhost:30000/health`

## API 接口一览

### 聊天接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 发送聊天消息 |
| POST | `/api/chat/stream` | SSE 流式聊天 |
| GET | `/api/chat/history/:sessionId` | 获取会话历史 |
| GET | `/api/chat/sessions` | 获取会话列表 |
| DELETE | `/api/chat/session/:sessionId` | 删除会话 |

### Agent 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/agent/execute` | 执行 Agent 任务 |
| GET | `/api/agent/stream` | Agent SSE 流式 |
| POST | `/api/agent/cancel/:sessionId` | 取消任务 |
| GET | `/api/agent/tools` | 获取工具列表 |

### A2A 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/a2a/agents` | 列出所有 Agent |
| GET | `/api/a2a/agents/:agentId` | 获取单个 Agent |
| POST | `/api/a2a/agents/:agentId/heartbeat` | Agent 心跳 |
| POST | `/api/a2a/messages/send` | 发送消息 |
| GET | `/api/a2a/subscribe/:sessionId` | SSE 订阅 |

### HITL 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/hitl/checkpoint` | 创建检查点 |
| GET | `/api/hitl/checkpoint/:id` | 获取检查点 |
| POST | `/api/hitl/checkpoint/:id/approve` | 批准 |
| POST | `/api/hitl/checkpoint/:id/reject` | 拒绝 |
| GET | `/api/hitl/pending` | 待处理列表 |

### Admin 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST/PUT/DELETE | `/api/admin/knowledge` | 知识库管理 |
| GET/POST/PUT/DELETE | `/api/admin/tool` | 工具管理 |
| GET/POST/PUT/DELETE | `/api/admin/model` | 模型管理 |
| GET/POST/PUT/DELETE | `/api/admin/prompt` | Prompt 模板 |
| GET | `/api/admin/trace` | 链路追踪 |

## 测试示例

### cURL 测试

```bash
# 健康检查
curl http://localhost:30000/health

# 发送聊天
curl -X POST http://localhost:30000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'

# 获取历史
curl http://localhost:30000/api/chat/history/user
```

## 项目结构

```
backend_go/
├── cmd/server/main.go          # 程序入口
├── config/                     # 配置模块
├── pkg/minimax/               # MiniMax SDK
├── internal/                   # 内部包
│   ├── application/           # 应用编排层
│   ├── domain/                # 领域层
│   │   ├── agent/             # Agent 领域
│   │   ├── model/             # 模型领域
│   │   ├── rag/               # RAG 领域
│   │   └── a2a/               # A2A 领域
│   ├── handlers/               # HTTP 处理器
│   ├── middleware/            # 中间件
│   └── infra/                 # 基础设施
│       ├── circuitbreaker/    # 熔断器
│       ├── ratelimiter/       # 限流器
│       └── metrics/           # 指标
├── domain/                    # 根级领域（测试用）
├── infra/                     # 根级基础设施（测试用）
└── docs/                      # 文档
```

## 学习路径

1. **Go 基础** - 参考 [GO_TUTORIAL.md](GO_TUTORIAL.md)
2. **项目入门** - 参考 [PROJECT_TUTORIAL.md](PROJECT_TUTORIAL.md)
3. **API 文档** - 参考 [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
4. **代码贡献** - 参考 [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT
