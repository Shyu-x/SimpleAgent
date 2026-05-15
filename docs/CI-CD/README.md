# AI Chat 玩具 - GitHub Actions CI/CD 流水线

## 概述

本项目使用 GitHub Actions 实现前后端集成流水线，支持模块级并行构建、测试门禁和自动部署。

## 流水线架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GitHub Actions Workflow                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐        │
│  │  Lint   │───▶│  Test   │───▶│  Build  │───▶│Security │        │
│  │ (并行)   │    │ (并行)   │    │ (并行)   │    │         │        │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘        │
│       │              │              │              │               │
│       ▼              ▼              ▼              ▼               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              deploy-staging (master/main 分支)            │   │
│  │   ┌──────────┐ ┌──────────┐                               │   │
│  │   │ backend  │ │ frontend │                               │   │
│  │   └──────────┘ └──────────┘                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              release (自动创建 GitHub Release)              │   │
│  │   ┌──────────┐ ┌──────────┐                               │   │
│  │   │ backend  │ │ frontend │                               │   │
│  │   └──────────┘ └──────────┘                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 流水线阶段

| 阶段 | 说明 | 触发条件 |
|------|------|----------|
| `lint` | 代码规范检查 (ESLint, Prettier, TypeCheck) | 所有分支 |
| `test` | 前后端测试 (Jest, Playwright) | 文件变化时 |
| `build` | 构建产物生成 (backend 验证, frontend Next.js build) | 测试通过后 |
| `security` | 安全扫描 (npm audit, secrets 检查) | master/main/MR |
| `deploy-staging` | 自动部署预发环境 | master/main 分支 |
| `release` | 自动创建 GitHub Release + Docker 镜像构建 | master/main 分支 |

## 模块划分

| 模块 | 路径 | 触发条件 |
|------|------|----------|
| `backend` | `backend/src/**`, `backend/package.json` | backend 目录下任何变化 |
| `frontend` | `frontend/src/**`, `frontend/package.json` | frontend 目录下任何变化 |

## 流水线配置

### 触发规则

GitHub Actions 工作流在 `.github/workflows/ci-cd.yml` 中配置：

```yaml
on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]
```

| 分支类型 | 行为 |
|----------|------|
| master/main | 完整流水线 + Staging 部署 + Release |
| feature/* | 仅 lint + test (跳过部署) |
| hotfix/* | 完整流水线执行 |

### 模块级并行

各模块的测试和构建 job 完全独立，互不阻塞：

```
backend-lint    ─────────────────────────────────────────────▶ backend-build
     │
     ▼
backend-test    ──▶ backend-api-check ──▶ backend-security

frontend-lint   ─────────────────────────────────────────────▶ frontend-build
     │
     ▼
frontend-typecheck

     │
     ▼
(并行执行，互不阻塞)
```

## 环境配置

### GitHub Secrets

在 GitHub 仓库 `Settings > Secrets and variables > Actions` 中配置：

| Secret | 说明 | 必需 |
|--------|------|------|
| `STAGING_SSH_KEY` | Staging 服务器 SSH 私钥 | 是 (部署时) |
| `DOCKER_REGISTRY` | Docker 镜像仓库地址 | 否 |

### SSH 部署配置

```bash
# 配置 SSH 密钥用于部署
ssh-keygen -t ed25519 -C "github-actions-deploy"

# 将公钥添加到目标服务器 ~/.ssh/authorized_keys
# 将私钥添加到 GitHub Secrets STAGING_SSH_KEY
```

## 回滚操作

### 自动回滚触发条件

- 健康检查失败
- 部署超时
- 运行时错误率超过阈值

### 手动回滚命令

```bash
# SSH 到服务器后使用 PM2 回滚
pm2 rollback <app-name>

# 或指定版本
pm2 stop <app-name>
pm2 start <app-name> --watch --update-env
```

## 使用指南

### 1. 提交代码

```bash
git checkout -b feature/my-feature
# 修改代码
git commit -m "feat(backend): add new feature"
git push origin feature/my-feature
```

**Commit Message 格式** (Conventional Commits):
```
<type>(<scope>): <subject>

# 示例
feat(backend): add new API endpoint
fix(frontend): resolve chat scroll issue
refactor(rag): optimize query rewrite
```

### 2. 创建 Pull Request

```bash
git push origin feature/my-feature
# 在 GitHub 上创建 PR
```

流水线将自动触发：
1. Lint 检查 (ESLint + Prettier)
2. 模块级测试 (仅相关模块)
3. 构建验证

### 3. 部署到 Staging

当 PR 合并到 `master` 或 `main` 分支时，自动部署到 Staging。

### 4. 创建 Release

合并到 main 分支后会自动：
- 创建 GitHub Release (使用日期 + 短 SHA 作为版本)
- 生成 changelog
- 构建 Docker 镜像 (已配置但注释)

### 5. 回滚

```bash
# SSH 到 Staging 服务器
ssh user@staging-server

# 使用 PM2 回滚
pm2 list           # 查看所有进程
pm2 logs <app-id>  # 查看日志
pm2 rollback <app-id>  # 回滚到上一版本
```

## 监控与告警

### 健康检查端点

| 环境 | 端点 |
|------|------|
| Staging | `https://staging.simpleagent.example.com/health` |
| Production | `https://chat.toy/health` |

### GitHub 集成

- Actions 状态显示在 PR 中
- Release 页面自动生成

## 故障排查

### 常见问题

#### 1. 测试失败

```bash
# 本地运行测试
cd backend
npm test

# 前端测试
cd frontend
npm run test || npm run test:ci

# 查看测试覆盖率
npm run test:coverage
```

#### 2. 构建失败

```bash
# 检查 backend 语法
cd backend
node --check src/index.js

# 检查 frontend 构建
cd frontend
npm run build
```

#### 3. 部署失败

```bash
# 检查 GitHub Actions 日志
# 仓库 > Actions > 点击失败的工作流 > 查看日志

# 手动部署测试
scp -r backend/ user@staging:/opt/ai-chat/backend/
ssh user@staging "cd /opt/ai-chat && pm2 restart all"
```

## 性能优化

### 并行执行

- 后端/前端 job 完全独立并行
- 使用 `needs` 声明依赖关系
- 使用 `cache` 减少依赖安装时间 (npm cache)

### 增量构建

- GitHub Actions 自动缓存 npm 依赖
- 仅在文件变化时触发构建

### 资源优化

- job 默认超时 30 分钟
- 使用 `if: false` 禁用可选 job (如 E2E)

## 相关文档

- [.github/workflows/ci-cd.yml 详解](./workflow-reference.md)
- [模块划分说明](./MODULES.md)
- [部署流程说明](./DEPLOYMENT.md)
- [环境变量配置](./ENVIRONMENT.md)

## 更新日志

| 版本 | 日期 | 说明 |
|------|------|------|
| v2.0.0 | 2026-05-15 | 从 GitLab CI/CD 迁移到 GitHub Actions |
| v1.1.0 | 2026-05-13 | 前后端集成流水线 |
| v1.0.0 | 2026-05-13 | 初始版本，模块级并行构建 |