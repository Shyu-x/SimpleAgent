# Vercel 部署指南

## 前端部署 (自动)

前端通过 Vercel 自动部署，每次 push 到 master 或 release/* 分支会自动触发构建。

### 1. 导入项目

1. 访问 [vercel.com](https://vercel.com)
2. Import GitHub repository `Shyu-x/SimpleAgent`
3. 选择 frontend 目录作为部署路径

### 2. 配置环境变量

在 Vercel Dashboard 中添加：

```
NEXT_PUBLIC_BACKEND_URL=https://your-backend-url.com
```

### 3. 配置构建命令

```
Build Command: pnpm build
Output Directory: .next
Install Command: pnpm install
```

### 4. 域名绑定 (可选)

在 Vercel Dashboard 的 Domains 中添加自定义域名。

## 后端部署

后端需要单独部署，有以下选项：

### 选项1: Railway (推荐)

1. 访问 [railway.app](https://railway.app)
2. Connect GitHub repository
3. Select backend folder
4. 设置环境变量:
   - `MINIMAX_API_KEY`
   - `PORT=30000`
   - `NODE_ENV=production`
5. Railway 会自动检测并部署

### 选项2: Render

1. 访问 [render.com](https://render.com)
2. 创建 Web Service
3. Connect GitHub repository
4. 设置:
   - Build Command: `pnpm install`
   - Start Command: `node src/index.js`
5. 设置环境变量

### 选项3: 自托管 Docker

使用已构建的 Docker 镜像:

```bash
docker pull ghcr.io/shyu-x/simpleagent/backend:latest
docker run -d -p 30000:30000 \
  -e MINIMAX_API_KEY=your_key \
  ghcr.io/shyu-x/simpleagent/backend:latest
```

## Vercel + 自托管后端 架构

```
用户 → Vercel Frontend → API 请求 → 你的后端服务器:30000
```

确保后端服务器配置了 CORS 允许 Vercel 域名。