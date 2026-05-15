# CI/CD 环境变量配置指南

## 概述

本文档说明 GitHub Actions 流水线所需的环境变量配置，以及如何在本地验证 CI 配置。

## GitHub Secrets 配置

### 1. 进入 Secrets 配置页面

1. 登录 GitHub
2. 进入仓库 `Settings > Secrets and variables > Actions`
3. 点击 `New repository secret` 添加新 Secret

### 2. 必需 Secrets

| Secret | 说明 | 示例值 |
|--------|------|--------|
| `STAGING_SSH_KEY` | Staging 服务器 SSH 私钥 | `-----BEGIN OPENSSH PRIVATE KEY-----\n...` |

### 3. 可选 Secrets

| Secret | 说明 | 示例值 |
|--------|------|--------|
| `DOCKER_REGISTRY` | Docker 镜像仓库地址 | `ghcr.io/username` |
| `SLACK_WEBHOOK_URL` | Slack 通知 Webhook | `https://hooks.slack.com/services/xxx` |

### 4. 配置 SSH Key 用于部署

```bash
# 1. 生成 SSH 密钥对 (在本地机器)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f github-actions-key

# 2. 将公钥添加到目标服务器
cat github-actions-key.pub >> ~/.ssh/authorized_keys

# 3. 将私钥内容添加到 GitHub Secrets
# Settings > Secrets and variables > Actions > New repository secret
# Name: STAGING_SSH_KEY
# Secret: [粘贴私钥内容]
```

### 5. Secret 命名规范

```
STAGING_SSH_KEY      # Staging 环境 SSH 私钥
PRODUCTION_SSH_KEY   # Production 环境 SSH 私钥 (可选)
DOCKER_REGISTRY      # Docker 镜像仓库地址 (可选)
```

## 环境变量矩阵

| 环境 | 用途 | 配置位置 |
|------|------|----------|
| `development` | 本地开发 | `.env` 文件 |
| `staging` | 预发测试 | GitHub Secrets (SSH Key) |
| `production` | 生产环境 | GitHub Secrets + Server Config |

## GitHub Actions 环境变量

### workflow 文件中的 env

```yaml
# .github/workflows/ci-cd.yml
env:
  NODE_VERSION: '20.x'
  PM2_VERSION: 'latest'
```

### 运行时环境变量

| 变量 | 说明 | 设置位置 |
|------|------|----------|
| `GITHUB_REF` | 分支/标签引用 | 自动设置 |
| `GITHUB_SHA` | 提交 SHA | 自动设置 |
| `GITHUB_REPOSITORY` | 仓库名称 | 自动设置 |
| `GITHUB_ACTOR` | 触发用户 | 自动设置 |

## 前端环境变量

### 构建时变量

```yaml
# .github/workflows/ci-cd.yml
- name: Build Next.js
  run: npm run build
  env:
    NEXT_TELEMETRY_DISABLED: '1'  # 禁用 Next.js 遥测
    NEXT_PUBLIC_BACKEND_URL: ${{ secrets.FRONTEND_BACKEND_URL }}  # 如果需要
```

### 可用变量 (Next.js)

| 变量 | 说明 | 限制 |
|------|------|------|
| `NEXT_PUBLIC_*` | 客户端可见 | 只能前缀 `NEXT_PUBLIC_` |
| `NEXT_TELEMETRY_DISABLED` | 禁用遥测 | 构建时有效 |

## 后端环境变量

### 生产环境配置

```bash
# 服务器上的 .env 文件
MINIMAX_API_KEY=your_api_key_here
NODE_ENV=production
PORT=30000

# Redis 配置 (可选)
REDIS_HOST=localhost
REDIS_PORT=6379

# Qdrant 配置 (可选)
VECTOR_DB_TYPE=qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

## 本地验证 CI 配置

### 1. 模拟 GitHub Actions 环境

```bash
# 设置模拟环境变量
export GITHUB_REF=refs/heads/main
export GITHUB_SHA=$(git rev-parse HEAD)
export GITHUB_REPOSITORY=username/repo-name

# 运行后端测试
cd backend && npm test

# 运行前端构建
cd frontend && npm run build
```

### 2. 验证 YAML 语法

```bash
# 使用 actionlint 检查 GitHub Actions YAML
# 安装: pip install actionlint
actionlint .github/workflows/*.yml
```

### 3. 本地测试 Jobs

由于 GitHub Actions 无法本地运行，可以使用 Docker 模拟：

```bash
# 模拟 backend-lint job
docker run --rm -v $(pwd)/backend:/app -w /app node:20-alpine sh -c "
  npm ci && npm run lint && node --check src/index.js
"

# 模拟 frontend-lint job
docker run --rm -v $(pwd)/frontend:/app -w /app node:20-alpine sh -c "
  npm ci && npm run lint || true
"
```

## 服务器部署配置

### SSH 连接

```bash
# 测试 SSH 连接
ssh -i ~/.ssh/staging_key user@staging-server

# 部署脚本示例
#!/bin/bash
# deploy.sh
ssh -i $STAGING_SSH_KEY user@staging-server << 'EOF'
  cd /opt/ai-chat
  git pull origin main
  npm ci --production
  pm2 restart backend
EOF
```

### PM2 配置

```bash
# 常用 PM2 命令
pm2 list                    # 查看进程列表
pm2 logs --lines 50         # 查看最近日志
pm2 monit                   # 实时监控
pm2 save                    # 保存进程列表
pm2 startup                 # 设置开机自启

# 环境变量
pm2 start ecosystem.config.js --env production
```

## 常见问题

### 1. Secrets 不可用

```bash
# 检查 workflow 是否正确引用 secrets
# 正确的写法:
secrets.STAGING_SSH_KEY
# 错误的写法:
$STAGING_SSH_KEY  # 这是环境变量，不是 secrets
```

### 2. SSH 连接失败

```bash
# 确认私钥格式正确 (应该是 -----BEGIN OPENSSH PRIVATE KEY-----)
# 确认公钥已添加到服务器 ~/.ssh/authorized_keys
# 确认 SSH 权限正确
chmod 600 ~/.ssh/private_key
```

### 3. 环境变量未传递

```bash
# 在 job 中正确使用 env
- name: Build
  run: npm run build
  env:
    NEXT_TELEMETRY_DISABLED: '1'
    MY_SECRET: ${{ secrets.MY_SECRET }}
```

## 相关文档

- [.github/workflows/ci-cd.yml](./workflow-reference.md)
- [部署流程](./DEPLOYMENT.md)
- [模块划分](./MODULES.md)