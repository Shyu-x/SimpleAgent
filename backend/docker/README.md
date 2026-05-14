# ==========================================
# AI Chat Backend - Docker Deployment Guide
# ==========================================

## 文件说明

- `Dockerfile` - 多阶段构建的生产镜像
- `docker-compose.yml` - 服务编排配置
- `.env.docker` - Docker 环境变量示例
- `docker/entry.sh` - 容器启动脚本

## 快速开始

### 1. 配置环境变量

```bash
# 复制环境变量配置
cp backend/.env.docker backend/.env

# 编辑 .env 填入实际配置
nano backend/.env
```

### 2. 构建和启动

```bash
# 进入 backend 目录
cd backend

# 构建镜像
docker build -t ai-chat-backend:latest .

# 启动服务 (使用 docker-compose)
docker-compose up -d

# 或者单独启动后端
docker run -d --name ai-chat-backend \
  --env-file .env \
  -p 30000:30000 \
  ai-chat-backend:latest
```

### 3. 验证服务

```bash
# 检查健康状态
curl http://localhost:30000/api/health

# 查看日志
docker logs -f ai-chat-backend
```

## 服务说明

### 容器架构

```
┌─────────────────────────────────────────────────┐
│              Docker Network                      │
│                                                  │
│  ┌──────────────┐      ┌──────────────────┐     │
│  │   backend    │──────│     qdrant       │     │
│  │  (port 30000)│      │  (port 6333/6334)│     │
│  └──────────────┘      └──────────────────┘     │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 后端服务
- **镜像**: `ai-chat-backend:latest`
- **端口**: `30000`
- **健康检查**: `/api/health`
- **日志目录**: `/app/logs`

### Qdrant 向量数据库
- **镜像**: `qdrant/qdrant:latest`
- **端口**: `6333` (API), `6334` (Dashboard)
- **数据卷**: `ai-chat-qdrant-data`
- **健康检查**: `http://localhost:6333/readyz`

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | `production` |
| `PORT` | 服务端口 | `30000` |
| `MINIMAX_API_KEY` | MiniMax API 密钥 | (必填) |
| `MINIMAX_BASE_URL` | MiniMax API 地址 | `https://api.minimaxi.com/anthropic` |
| `QDRANT_HOST` | Qdrant 主机 | `qdrant` |
| `QDRANT_PORT` | Qdrant 端口 | `6333` |
| `RAG_CHUNK_SIZE` | RAG 分块大小 | `512` |
| `RAG_TOP_K` | 检索返回数量 | `5` |

## 注意事项

### Node.js 版本
项目依赖 Node.js 20+ (Prisma 要求)，Dockerfile 已使用 `node:20-alpine`。

### 目录权限
容器使用非 root 用户 (`nodejs:1001`)，已在镜像中创建必要的目录：
- `/app/logs` - 日志目录
- `/app/data` - 数据目录

### 信号处理
使用 `dumb-init` 处理 SIGTERM/SIGINT 信号，确保优雅关闭。

## 故障排查

### 容器启动失败

```bash
# 查看详细日志
docker logs ai-chat-backend

# 进入容器调试
docker exec -it ai-chat-backend sh
```

### 健康检查失败

```bash
# 检查端口是否可达
docker exec -it ai-chat-backend curl http://localhost:30000/api/health

# 检查依赖服务
docker exec -it ai-chat-backend curl http://qdrant:6333/readyz
```

### 性能问题

```bash
# 查看资源使用
docker stats ai-chat-backend

# 查看完整日志
docker logs --tail 500 ai-chat-backend
```

## 扩展部署

### 添加前端服务

编辑 `docker-compose.yml` 添加前端服务：

```yaml
frontend:
  build:
    context: ./frontend
    dockerfile: Dockerfile
  ports:
    - "8080:8080"
  environment:
    - NEXT_PUBLIC_BACKEND_URL=http://backend:30000
  depends_on:
    - backend
```

### 使用 Nginx 反向代理

```yaml
nginx:
  image: nginx:alpine
  ports:
    - "80:80"
  volumes:
    - ./nginx.conf:/etc/nginx/nginx.conf:ro
  depends_on:
    - backend
```

## 开发模式

### 热重载

```bash
# 挂载源代码目录
docker run -d \
  --name ai-chat-backend-dev \
  -v $(pwd)/src:/app/src:ro \
  -p 30000:30000 \
  ai-chat-backend:latest
```

### 使用 docker-compose 开发模式

```bash
# 启动所有服务
docker-compose up

# 查看实时日志
docker-compose logs -f backend

# 停止服务
docker-compose down
```