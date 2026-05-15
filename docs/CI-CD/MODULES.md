# 模块划分说明

## 概述

本项目采用前后端分离架构，后端基于 Node.js/Express，前端基于 Next.js/React。两个模块独立构建、测试和部署。

## 模块列表

| 模块 | 服务名 | 端口 | 说明 |
|------|--------|------|------|
| `backend` | AI Chat 后端服务 | 30000 | 核心 API 服务 (Agent/RAG/A2A/HITL) |
| `frontend` | AI Chat 前端服务 | 8080 | Next.js Web 应用 |

## 模块结构

```
C:\Users\Xu\Desktop\chat玩具\
├── backend/                 # 后端模块
│   ├── src/
│   │   ├── routes/         # API 路由 (30+)
│   │   ├── services/        # 业务逻辑
│   │   ├── domain/          # 领域模型 (RAG/Agent/Search)
│   │   ├── infra/           # 基础设施 (熔断/限流/监控)
│   │   └── middleware/      # 中间件
│   ├── package.json
│   ├── ecosystem.config.js  # PM2 配置
│   └── jest.config.js
│
├── frontend/               # 前端模块
│   ├── src/
│   │   ├── app/            # Next.js App Router
│   │   ├── components/      # React 组件
│   │   ├── stores/          # Zustand 状态管理
│   │   └── lib/             # 工具函数
│   ├── package.json
│   ├── next.config.js
│   └── eslint.config.mjs
│
├── .github/
│   └── workflows/
│       └── ci-cd.yml        # GitHub Actions 工作流配置
│
└── docs/CI-CD/              # CI/CD 文档
```

## 触发条件

### Backend 后端模块

```yaml
# .github/workflows/ci-cd.yml 中的 job 触发逻辑
jobs:
  backend-lint:
    # 任何 backend 文件变化都会触发
    - backend/src/**/*
    - backend/package.json
    - backend/package-lock.json
```

### Frontend 前端模块

```yaml
jobs:
  frontend-lint:
    # 任何 frontend 文件变化都会触发
    - frontend/src/**/*
    - frontend/package.json
    - frontend/package-lock.json
```

## 模块独立性

每个模块具备以下独立性：

1. **独立配置** - 独立的 package.json 和配置文件
2. **独立依赖** - 独立的 node_modules
3. **独立测试** - 可单独运行测试
4. **独立构建** - 可单独构建
5. **独立部署** - 可单独部署到服务器

## 模块间通信

### REST API 调用

前端通过环境变量配置的后端地址进行通信：

```javascript
// 前端配置 (frontend/.env.local)
NEXT_PUBLIC_BACKEND_URL=http://localhost:30000

// 生产环境
NEXT_PUBLIC_BACKEND_URL=https://api.chat.toy
```

### 健康检查

每个模块需要实现健康检查端点：

```javascript
// backend/src/health.js
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    module: 'backend',
    timestamp: new Date().toISOString()
  });
});
```

## GitHub Actions Job 依赖关系

```
backend-lint ──────────┬──> backend-build ──┐
                      │                     │
backend-test ─────────┼──> backend-api-check ┼──┬──> deploy-staging
                      │                     │  │
backend-security ─────┘                     │  │
                                           │  │
frontend-lint ──────────┬───────────────────┘  │
                      │                     │
frontend-typecheck ────┴──> frontend-build ──┘
                                               │
                                        release
```

### Job 说明

| Job | 说明 | 依赖 |
|-----|------|------|
| `backend-lint` | 后端代码检查 (ESLint, 语法) | 无 |
| `backend-test` | 后端测试 (Jest) | backend-lint |
| `backend-api-check` | 后端 API 路由验证 | backend-test |
| `backend-security` | 后端安全扫描 | backend-test |
| `backend-build` | 后端构建验证 | backend-test, backend-api-check |
| `frontend-lint` | 前端代码检查 (ESLint, Prettier) | 无 |
| `frontend-typecheck` | 前端 TypeScript 检查 | frontend-lint |
| `frontend-build` | 前端 Next.js 构建 | frontend-typecheck |
| `deploy-staging` | 部署到 Staging | backend-build, frontend-build |
| `release` | 创建 GitHub Release | backend-build, frontend-build |

## PM2 部署配置

### backend/ecosystem.config.js

```javascript
module.exports = {
  apps: [{
    name: 'ai-chat-backend',
    script: 'src/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 30000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 30000
    }
  }]
};
```

### 部署命令

```bash
# 安装依赖
npm ci

# 启动服务 (开发)
pm2 start ecosystem.config.js

# 启动服务 (生产)
pm2 start ecosystem.config.js --env production

# 查看状态
pm2 list

# 查看日志
pm2 logs ai-chat-backend

# 重启
pm2 restart ai-chat-backend
```

## 添加新模块

如需添加新模块（如微服务），请执行以下步骤：

1. 创建模块目录结构
2. 添加 `package.json`
3. 在 `.github/workflows/ci-cd.yml` 中添加对应的 job
4. 配置 PM2 或 Docker 部署

## 相关文档

- [部署流程](./DEPLOYMENT.md)
- [环境变量配置](./ENVIRONMENT.md)
- [.github/workflows/ci-cd.yml](./workflow-reference.md)