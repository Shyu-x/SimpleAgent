# 云平台部署指南

## 概述

SimpleAgent 支持多种云平台部署。以下是推荐的部署方案。

---

## 方案1: GitHub Container Registry + Docker

### 自动构建

每次 push 到 master 或 release/* 分支，GitHub Actions 会自动:
1. 构建 backend 和 frontend Docker 镜像
2. 推送到 ghcr.io

### 手动部署

```bash
# 拉取预构建镜像
docker pull ghcr.io/shyu-x/simpleagent/backend:latest
docker pull ghcr.io/shyu-x/simpleagent/frontend:latest

# 运行
docker run -d -p 30000:30000 \
  -e MINIMAX_API_KEY=your_key \
  ghcr.io/shyu-x/simpleagent/backend:latest

docker run -d -p 3001:3001 \
  ghcr.io/shyu-x/simpleagent/frontend:latest
```

---

## 方案2: Railway (推荐)

### 部署步骤

1. 访问 [railway.app](https://railway.app)
2. 点击 "New Project" → "Deploy from GitHub repo"
3. 选择 `Shyu-x/SimpleAgent` 仓库
4. 选择 `backend` 文件夹作为根目录
5. Railway 自动检测 Node.js 项目

### 环境变量

在 Railway Dashboard 添加:

```
MINIMAX_API_KEY = your_token_plan_key
NODE_ENV = production
PORT = 30000
VECTOR_DB_TYPE = memory
```

### 域名

Railway 会自动分配一个 `.railway.app` 子域名。

---

## 方案3: Render

### 部署步骤

1. 访问 [render.com](https://render.com)
2. 点击 "New" → "Web Service"
3. Connect GitHub repository
4. 配置:
   - Root Directory: `backend`
   - Build Command: `pnpm install`
   - Start Command: `node src/index.js`

### 环境变量

同样添加上述环境变量。

---

## 方案4: Vercel (仅前端)

### 前端部署

1. 访问 [vercel.com](https://vercel.com)
2. Import `Shyu-x/SimpleAgent`
3. Framework: Next.js
4. Root Directory: `frontend`
5. Environment Variables:
   - `NEXT_PUBLIC_BACKEND_URL` = 你的后端 URL

### 后端部署

后端需要配合 Railway 或 Render 部署。

---

## 方案5: Fly.io (边缘部署)

### 安装 Fly CLI

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

### 部署

```bash
cd backend
fly launch
fly secrets set MINIMAX_API_KEY=your_key
fly deploy
```

---

## Docker Compose 单机部署

```bash
# 拉取所有镜像
docker pull ghcr.io/shyu-x/simpleagent/backend:latest
docker pull ghcr.io/shyu-x/simpleagent/frontend:latest
docker pull qdrant/qdrant:latest

# 一键启动
docker network create simpleagent
docker run -d --network simpleagent --name qdrant qdrant/qdrant:latest
docker run -d --network simpleagent -p 30000:30000 -e QDRANT_HOST=qdrant ghcr.io/shyu-x/simpleagent/backend:latest
docker run -d --network simpleagent -p 3001:3001 ghcr.io/shyu-x/simpleagent/frontend:latest
```

---

## 环境变量清单

| 变量 | 必需 | 说明 |
|------|------|------|
| `MINIMAX_API_KEY` | 是 | MiniMax API 密钥 |
| `NODE_ENV` | 是 | production |
| `PORT` | 是 | 30000 |
| `VECTOR_DB_TYPE` | 否 | memory 或 qdrant |
| `QDRANT_HOST` | 否 | qdrant 服务地址 |

---

## 域名配置

部署后，需要配置 CORS 允许你的域名:

```javascript
// backend/src/middleware/security.js
const corsOptions = {
  origin: [
    'https://your-frontend.vercel.app',
    'https://your-domain.com'
  ],
  credentials: true
};
```