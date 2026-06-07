# SimpleAgent 部署手册

> 生产环境部署的标准流程。

## 0. 前置条件

- Node.js ≥ 18.0.0 < 25.0.0（推荐 v20.x，nvm 管理）
- pnpm ≥ 8.0.0
- 可选：Docker 20+、PM2、Qdrant、PostgreSQL 14+
- 端口：30000（后端）、3001（前端）、6333（Qdrant）

```bash
# 装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm use    # 读取 .nvmrc
npm i -g pnpm
```

## 1. 克隆与安装

```bash
git clone <repo>
cd SimpleAgent
pnpm install                              # workspace 根
pnpm --filter @simpleagent/backend install
pnpm --filter @simpleagent/frontend install
```

## 2. 环境变量

**禁止**把真实 `.env` 提交到 Git。模板在 `.env.example`。

```bash
# 后端
cp backend/.env.example backend/.env
# 编辑 backend/.env 填入 MINIMAX_API_KEY 等

# 前端
cp frontend/.env.local.example frontend/.env.local
# 编辑 frontend/.env.local：NEXT_PUBLIC_BACKEND_URL=http://localhost:30000
```

### 关键环境变量

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `MINIMAX_API_KEY` | ✅ | - | MiniMax Token Plan API key |
| `MINIMAX_BASE_URL` | ❌ | `https://api.minimaxi.com/anthropic` | API 地址 |
| `RAG_CHUNK_SIZE` | ❌ | 512 | RAG 分块大小 |
| `RAG_TOP_K` | ❌ | 5 | 检索 top k |
| `RAG_RERANK` | ❌ | true | 是否重排序 |
| `VECTOR_DB_TYPE` | ❌ | qdrant | qdrant / memory |
| `QDRANT_HOST` | ❌ | localhost | Qdrant 主机 |
| `QDRANT_PORT` | ❌ | 6333 | Qdrant 端口 |
| `PORT` | ❌ | 30000 | 后端监听端口 |
| `NODE_ENV` | ❌ | development | development / production |
| `NEXT_PUBLIC_BACKEND_URL` | ✅ | - | 前端访问后端的 URL |

## 3. 数据库（可选）

```bash
# 启动 PostgreSQL（如果使用）
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=simpleagent \
  -p 5432:5432 \
  postgres:14

# 启动 Qdrant
docker run -d --name qdrant \
  -p 6333:6333 -p 6334:6334 \
  -qdrant/qdrant:latest
```

> **降级模式**：如果 Qdrant/PostgreSQL 不可用，系统会自动降级到内存向量 + 文件存储，**不阻塞启动**。

## 4. 启动方式

### 方式 A：PM2（推荐生产）

```bash
cat > ecosystem.config.js <<'EOF'
module.exports = {
  apps: [
    {
      name: 'ai-chat-backend',
      script: 'pnpm',
      args: 'start',
      cwd: './backend',
      env: { NODE_ENV: 'production', PORT: 30000 },
      max_memory_restart: '500M',
      instances: 1,
      autorestart: true,
    },
    {
      name: 'ai-chat-frontend',
      script: 'pnpm',
      args: 'start',
      cwd: './frontend',
      env: { NODE_ENV: 'production', PORT: 3001 },
      max_memory_restart: '300M',
      instances: 1,
      autorestart: true,
    },
  ],
};
EOF

pm2 start ecosystem.config.js
pm2 save
pm2 startup   # 开机自启
```

### 方式 B：Docker Compose

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 方式 C：直接后台跑（开发/测试）

```bash
cd backend && pnpm dev > /tmp/backend.log 2>&1 &
cd frontend && pnpm dev > /tmp/frontend.log 2>&1 &
```

## 5. 验证

```bash
# 健康
curl http://localhost:30000/api/health
# 期望：{"status":"ok","timestamp":"..."}

# 前端
curl -s -o /dev/null -w 'http=%{http_code}\n' http://localhost:3001
# 期望：200

# 综合冒烟
node backend/tests/comprehensive-test.js
# 期望：26/26 通过

# 上线门禁
bash scripts/online-gate.sh
# 期望：GO
```

## 6. 监控

- 健康端点：`/api/health`（200）、`/metrics`（Prometheus 格式）
- 日志：`/tmp/backend.log`（dev）、`~/.pm2/logs/`（PM2）
- 关键指标：
  - `http_requests_total{status="5xx"}` — 5xx 计数
  - `sse_connections_active` — SSE 活跃连接
  - `circuit_breaker_state` — 熔断器状态
  - `nodejs_heap_size_used_bytes` — 堆使用

## 7. 灰度发布

详见 `RUNBOOK.md` 第 8 节和 `scripts/canary-deploy.sh`。

## 8. 回滚

```bash
# 1. 列出最近 5 个版本
pm2 list
git log --oneline -10
# 2. 代码回滚
git checkout <last-green-sha>
pnpm install
# 3. 重启
pm2 restart all
# 4. 验证
bash scripts/online-gate.sh
```

## 9. 备份

```bash
# 数据目录（建议每天）
tar czf backup-$(date +%Y%m%d).tar.gz data/ backend/data/
# 上传到对象存储（示例）
aws s3 cp backup-*.tar.gz s3://simpleagent-backups/
```
