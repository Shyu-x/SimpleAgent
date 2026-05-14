# AI Chat 玩具 - GitLab CI/CD 流水线

## 概述

本项目使用 GitLab CI/CD 实现前后端集成流水线，支持模块级并行构建、测试门禁和灰度发布。

## 流水线架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GitLab CI/CD Pipeline                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐        │
│  │  Lint   │───▶│  Test   │───▶│  Build  │───▶│ Security│        │
│  │         │    │ (并行)   │    │ (前后端) │    │         │        │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘        │
│       │              │              │              │               │
│       ▼              ▼              ▼              ▼               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              deploy-staging (自动/手动)                    │   │
│  │   ┌──────────┐ ┌──────────┐                               │   │
│  │   │ backend  │ │ frontend │                               │   │
│  │   └──────────┘ └──────────┘                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │           deploy-production (灰度发布 - 手动)              │   │
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
| `lint` | 代码规范检查 (commitlint, ESLint, TypeCheck) | 所有分支 |
| `test` | 前后端测试 (Jest, Vitest, Playwright) | 文件变化时 |
| `build` | Docker 镜像构建 (backend, frontend) | 测试通过后 |
| `security` | 安全扫描 (Trivy, npm audit, SAST) | main/develop/MR |
| `deploy-staging` | 自动部署预发环境 | main/develop |
| `deploy-production` | 灰度发布生产环境 | main (手动) |

## 模块划分

| 模块 | 路径 | 触发条件 |
|------|------|----------|
| `backend` | `backend/src/**`, `backend/Dockerfile` | backend 目录下任何变化 |
| `frontend` | `frontend/src/**`, `frontend/Dockerfile` | frontend 目录下任何变化 |

## 流水线配置

### 触发规则

```yaml
workflow:
  rules:
    - 主分支 (main): 全部阶段执行
    - 开发分支 (develop*): 跳过生产部署
    - feature 分支: 仅 lint + test
    - hotfix 分支: 全部阶段执行
    - MR 合并请求: 全部阶段
    - 手动触发: 自定义阶段
```

### 模块级并行

各模块的测试和构建 job 完全独立，互不阻塞：

```
test:backend    ─────────────────────────────────────────────▶ build:backend
test:order      ───▶ build:order      (order 模块独立)  ───▶ deploy:staging:order
test:user       ───▶ build:user       (user 模块独立)   ───▶ deploy:staging:user
test:payment    ───▶ build:payment    (payment 模块独立)───▶ deploy:staging:payment
     │
     ▼
  (并行执行，互不阻塞)
```

### 灰度发布策略

```
阶段 1: 10% 流量 ──▶ 验证 ──▶ 阶段 2: 50% 流量 ──▶ 验证 ──▶ 阶段 3: 100%
```

## 环境配置

### GitLab CI/CD 变量

在 GitLab 项目 `Settings > CI/CD > Variables` 中配置：

| 变量 | 说明 | 必需 |
|------|------|------|
| `CI_DOCKER_REGISTRY` | Docker 镜像仓库地址 | 是 |
| `CI_K8S_STAGING_CLUSTER` | Staging K8s 集群上下文 | 是 |
| `CI_K8S_PRODUCTION_CLUSTER` | Production K8s 集群上下文 | 是 |
| `SLACK_WEBHOOK_URL` | Slack 通知 Webhook | 否 |

### Kubernetes 配置

```bash
# 获取集群凭证
kubectl config get-contexts
kubectl config use-context <context-name>

# 验证配置
kubectl get nodes
kubectl get namespaces
```

## 回滚操作

### 自动回滚触发条件

- 健康检查失败
- 部署超时
- 运行时错误率超过阈值

### 手动回滚命令

```bash
# 回滚特定模块
kubectl rollout undo deployment/<module>-service -n <namespace>

# 查看回滚历史
kubectl rollout history deployment/<module>-service -n <namespace>

# 回滚到指定版本
kubectl rollout undo deployment/<module>-service -n <namespace> --to-revision=<revision>
```

## 使用指南

### 1. 提交代码

```bash
git checkout -b feature/my-feature
# 修改代码
git commit -m "feat(module): add new feature"
git push origin feature/my-feature
```

**Commit Message 格式**:
```
<type>(<scope>): <subject>

# 示例
feat(order): add order creation API
fix(user): resolve login timeout issue
refactor(payment): optimize payment flow
```

### 2. 创建 Merge Request

```bash
git push origin feature/my-feature
# 在 GitLab 上创建 MR
```

流水线将自动触发：
1. Lint 检查 (commitlint + ESLint)
2. 模块级测试 (仅相关模块)
3. Docker 镜像构建

### 3. 部署到 Staging

当 MR 合并到 `develop` 或 `main` 分支时，自动部署到 Staging。

```bash
# 手动触发 Staging 部署
gitlab-ci-cli trigger --stage deploy-staging --module backend
```

### 4. 灰度发布到 Production

1. 在 GitLab CI/CD Pipeline 页面
2. 找到对应 deploy job
3. 点击 "Play" 手动触发
4. 验证无问题后点击 "Play" 继续下一阶段

### 5. 回滚

```bash
# 在 GitLab Pipeline 页面找到 rollback job
# 或使用 kubectl 手动回滚
kubectl rollout undo deployment/ai-chat-backend -n ai-chat-production
```

## 监控与告警

### 健康检查端点

| 环境 | 端点 |
|------|------|
| Staging | `https://staging.chat.toy/health` |
| Production | `https://chat.toy/health` |

### 告警配置

- Slack 通知: 流水线失败、部署失败、健康检查失败
- GitLab 集成: Pipeline Status Badge

## 故障排查

### 常见问题

#### 1. 测试失败

```bash
# 本地运行测试
cd backend
npm test

# 运行特定模块测试
npm test -- --testPathPattern=order

# 查看测试覆盖率
npm run test:coverage
```

#### 2. 构建失败

```bash
# 本地构建 Docker 镜像
cd backend
docker build -t ai-chat-backend:test .

# 检查构建日志
docker logs <container-id>
```

#### 3. 部署失败

```bash
# 检查 Pod 状态
kubectl get pods -n ai-chat-staging
kubectl describe pod <pod-name> -n ai-chat-staging

# 查看日志
kubectl logs <pod-name> -n ai-chat-staging

# 检查 events
kubectl get events -n ai-chat-staging --sort-by='.lastTimestamp'
```

## 性能优化

### 并行执行

- 测试 job 使用 `needs` 实现跨 stage 并行
- 模块级 job 独立执行，互不阻塞
- 使用 `cache` 减少依赖安装时间

### 增量构建

- Docker 构建使用 `--cache-from` 复用层
- 仅在文件变化时触发构建

### 资源优化

- 合理设置 job timeout
- 使用适当的 runner tags
- 按需启用 allow_failure

## 相关文档

- [模块划分说明](./MODULES.md)
- [部署流程说明](./DEPLOYMENT.md)
- [.gitlab-ci.yml 详解](./gitlab-ci-reference.md)
- [环境变量配置](./ENVIRONMENT.md)

## 更新日志

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.1.0 | 2026-05-13 | 前后端集成流水线 |
| v1.0.0 | 2026-05-13 | 初始版本，模块级并行构建 |
