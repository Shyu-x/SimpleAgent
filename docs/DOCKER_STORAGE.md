# Docker 存储架构

## 概述

本架构使用 Docker Compose 部署完整的 AI Chat 后端服务，包括：
- **PostgreSQL** (端口 54320) - 主数据库，支持 pgvector 向量存储
- **Redis** (端口 6380) - 缓存服务
- **Nginx** (端口 8088) - 反向代理
- **前端** (端口 3000) - Next.js 应用
- **后端** (端口 30000) - Express API

## 快速启动

### 1. 复制环境变量文件

```bash
cp backend/.env backend/.env.local
# 编辑 backend/.env.local 配置您的 API Keys
```

### 2. 启动所有服务

```bash
docker-compose up -d
```

### 3. 初始化数据库 (首次运行)

数据库容器会自动执行 `init.sql` 初始化脚本。

如需手动初始化：

```bash
docker exec -i aichat-postgres psql -U chat -d aichat < init.sql
```

### 4. 验证服务

- 前端: http://localhost:8088
- 后端 API: http://localhost:8088/api/health
- PostgreSQL: localhost:54320
- Redis: localhost:6380

## 架构说明

```
                    ┌─────────────────┐
                    │     Nginx       │
                    │   (反向代理)     │
                    │   Port: 8088    │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
    ┌───────────┐    ┌───────────┐    ┌───────────┐
    │  Frontend  │    │   Backend  │    │   Redis   │
    │ (Next.js)  │    │ (Express)  │    │   6380    │
    │  Port:3000 │    │ Port:30000 │    └───────────┘
    └───────────┘    └──────┬──────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  PostgreSQL   │
                    │   (pgvector)  │
                    │   Port:54320  │
                    └───────────────┘
```

## 数据库表结构

| 表名 | 说明 |
|------|------|
| conversations | 对话会话表 |
| messages | 消息记录表 |
| global_memories | 全局记忆表 |
| workflows | 工作流定义表 |
| workflow_executions | 工作流执行记录表 |
| kb_documents | 知识库文档表 |
| kb_embeddings | 知识库向量表 |
| agent_configs | Agent 配置表 |
| user_settings | 用户设置表 |
| file_uploads | 文件上传记录表 |

## API 接口

### 对话管理

```
GET    /api/conversations          # 获取对话列表
GET    /api/conversations/:id      # 获取单个对话
POST   /api/conversations          # 创建对话
PUT    /api/conversations/:id      # 更新对话
DELETE /api/conversations/:id      # 删除对话
GET    /api/conversations/:id/export  # 导出对话
```

### 消息管理

```
GET    /api/conversations/:id/messages       # 获取消息列表
POST   /api/conversations/:id/messages       # 添加消息
POST   /api/conversations/:id/messages/batch # 批量添加
PUT    /api/conversations/:id/messages/:id   # 更新消息
DELETE /api/conversations/:id/messages/:id   # 删除消息
```

### 记忆管理

```
GET    /api/memories           # 获取记忆列表
GET    /api/memories/:id       # 获取单个记忆
POST   /api/memories           # 创建记忆
POST   /api/memories/batch     # 批量创建
PUT    /api/memories/:id       # 更新记忆
DELETE /api/memories/:id       # 删除记忆
GET    /api/memories/stats     # 获取记忆统计
```

## 数据持久化

### 本地开发

数据存储在 Docker 卷中：
- `postgres_data` - PostgreSQL 数据
- `redis_data` - Redis 缓存

### 生产环境

建议将数据卷挂载到本地目录：

```yaml
volumes:
  - /path/to/local/data/postgres:/var/lib/postgresql/data
  - /path/to/local/data/redis:/data
```

## Nginx 配置

反向代理提供以下功能：
- 静态资源缓存 (1年)
- Gzip 压缩
- 请求限流
- SSE 流式响应支持
- WebSocket 支持
- 安全头

## 常见问题

### 数据库连接失败

检查 PostgreSQL 容器是否正常运行：

```bash
docker logs aichat-postgres
docker exec -it aichat-postgres psql -U chat -d aichat -c "SELECT 1"
```

### 端口冲突

如端口冲突，可修改 `docker-compose.yml` 中的端口映射：

```yaml
ports:
  - "54321:5432"  # PostgreSQL
  - "6381:6379"   # Redis
  - "8089:80"     # Nginx
```

## 停止服务

```bash
docker-compose down
```

如需清除所有数据：

```bash
docker-compose down -v
```
