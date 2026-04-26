# AI Chat 玩具 - Go 版本

## 项目概述

AI Chat 玩具的 Go 语言实现版本，采用企业级分层架构设计。

### 技术栈

- **语言**: Go 1.21+
- **框架**: Gin (HTTP), Prometheus (监控)
- **向量数据库**: Qdrant
- **缓存**: Redis
- **架构**: DDD (领域驱动设计)

### 项目结构

```
backend_go/
├── cmd/server/           # 应用入口
├── config/               # 配置管理
├── internal/             # 内部包
│   ├── domain/          # 核心业务领域
│   │   ├── model/      # 模型抽象层
│   │   ├── agent/      # Agent执行引擎
│   │   ├── rag/        # RAG检索领域
│   │   ├── search/     # 搜索引擎
│   │   └── a2a/        # A2A协议
│   ├── infra/          # 基础设施
│   │   ├── circuitbreaker/  # 熔断器
│   │   ├── ratelimiter/     # 限流器
│   │   ├── metrics/         # 指标采集
│   │   ├── alert/           # 告警管理
│   │   ├── configcenter/    # 配置中心
│   │   ├── queuemanager/   # 队列管理
│   │   └── sse/             # SSE服务
│   ├── common/errors/  # 统一错误体系
│   ├── services/      # 业务服务
│   ├── handlers/      # 接口处理
│   ├── middleware/    # 中间件
│   └── application/   # 应用编排
├── pkg/minimax/       # MiniMax SDK
├── test/              # 测试代码
└── scripts/           # 脚本工具
```

## 环境要求

- Go 1.21+
- Docker & Docker Compose
- GVM (Go版本管理，推荐)

## GVM 安装与使用

本项目使用 [GVM](https://github.com/moovweb/gvm) 管理 Go 版本。

### 安装 GVM

```bash
# 安装 GVM
bash < <(curl -s -S -L https://raw.githubusercontent.com/moovweb/gvm/master/binscripts/gvm-installer)

# 加载 GVM 环境
source ~/.gvm/scripts/gvm
```

### 安装并使用 Go 版本

```bash
# 安装 Go 1.21
gvm install go1.21 -s

# 使用 Go 1.21
gvm use go1.21

# 创建项目专属 gemset
gvm gemset create ai-chat-go
gvm use go1.21@ai-chat-go

# 设置为默认
gvm use go1.21@ai-chat-go --default
```

### 验证环境

```bash
go version
# go version go1.21

echo $GOPATH
# ~/.gvm
```

## 快速开始

### 1. 环境准备

```bash
# 克隆项目
cd backend_go

# 使用 GVM 设置环境
source ~/.gvm/scripts/gvm
gvm use go1.21@ai-chat-go
```

### 2. 安装依赖

```bash
make deps
# 或
go mod download
go mod verify
```

### 3. 配置

```bash
# 复制配置模板
cp config.yaml.example config.yaml

# 编辑配置（设置 MiniMax API Key 等）
vim config.yaml
```

### 4. 运行

```bash
# 开发模式
make run

# 或直接运行
go run ./cmd/server
```

### 5. Docker Compose 部署

```bash
# 启动所有服务
make docker-up

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f backend

# 停止服务
make docker-down
```

## Makefile 常用命令

```bash
make help          # 显示帮助信息
make deps         # 下载依赖
make tidy         # 整理依赖
make build        # 构建二进制
make run          # 运行
make test         # 运行测试
make test-cover   # 运行测试并生成覆盖率报告
make clean        # 清理构建文件
make docker-build # 构建 Docker 镜像
make docker-run   # 运行 Docker 容器
make docker-up    # 启动 Docker Compose
make docker-down  # 停止 Docker Compose
make fmt          # 格式化代码
make lint         # 代码检查
make vet          # 静态分析
```

## API 接口

### 健康检查

```bash
curl http://localhost:30000/health
```

### 聊天接口

```bash
# 普通聊天
curl -X POST http://localhost:30000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'

# 流式聊天
curl -N http://localhost:30000/api/chat/stream \
  -d '{"message": "你好"}'
```

### Agent 接口

```bash
# 执行 Agent
curl -X POST http://localhost:30000/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{"input": "帮我搜索今天的天气"}'

# 取消执行
curl -X POST http://localhost:30000/api/agent/cancel/{sessionId}
```

### A2A 接口

```bash
# 获取所有 Agent
curl http://localhost:30000/api/a2a/agents

# 发送消息
curl -X POST http://localhost:30000/api/a2a/messages/send \
  -H "Content-Type: application/json" \
  -d '{"to": "agent-id", "content": "hello"}'
```

### HITL 接口

```bash
# 创建确认请求
curl -X POST http://localhost:30000/api/hitl/checkpoint \
  -H "Content-Type: application/json" \
  -d '{"type": "dangerous", "action": "delete", "title": "确认删除?"}'

# 批准
curl -X POST http://localhost:30000/api/hitl/checkpoint/{id}/approve

# 拒绝
curl -X POST http://localhost:30000/api/hitl/checkpoint/{id}/reject
```

## 配置说明

### config.yaml

```yaml
server:
  host: "0.0.0.0"
  port: 30000
  mode: "debug"  # debug/release

minimax:
  api_key: "${MINIMAX_API_KEY}"  # 从环境变量读取
  base_url: "https://api.minimaxi.com/anthropic"
  model: "MiniMax-M2.7"

qdrant:
  addr: "localhost:6333"
  collection: "ai_chat_docs"

rag:
  chunk_size: 512
  top_k: 5
  rerank: true

ratelimit:
  enabled: true
  requests_per_minute: 100
```

## 测试

```bash
# 运行所有测试
make test

# 运行单元测试
go test -v ./internal/domain/...

# 运行带覆盖率的测试
make test-cover

# 运行 E2E 测试（需要 Docker 服务）
make test-e2e
```

## 监控

- **Prometheus**: http://localhost:9090
- **健康检查**: http://localhost:30000/health

## 开发指南

### 代码规范

- 注释使用中文
- 变量命名使用英文
- 遵循 Go 代码规范 (gofmt)
- 使用 golangci-lint 进行代码检查

### 提交规范

```
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式
refactor: 重构
test: 测试
chore: 构建/工具
```

## 文档

- [测试文档](./docs/testing.md) - 详细测试说明
- [部署指南](./docs/deployment.md) - 部署配置
- [API 文档](./docs/api.md) - 接口文档

## License

MIT
