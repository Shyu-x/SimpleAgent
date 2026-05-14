# CI/CD 环境变量配置指南

## 概述

本文档说明 GitLab CI/CD 流水线所需的环境变量配置，以及如何在本地验证 CI 配置。

## GitLab CI/CD 变量配置

### 1. 进入变量配置页面

1. 登录 GitLab
2. 进入项目 `Settings > CI/CD > Variables`
3. 点击 `Add variable` 添加新变量

### 2. 必需变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `DOCKER_REGISTRY` | Docker 镜像仓库地址 | `registry.gitlab.com` |
| `K8S_STAGING_CLUSTER` | Staging K8s 集群上下文 | `staging-cluster` |
| `K8S_PRODUCTION_CLUSTER` | Production K8s 集群上下文 | `production-cluster` |

### 3. 可选变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `SLACK_WEBHOOK_URL` | Slack 通知 Webhook | `https://hooks.slack.com/services/xxx` |
| `K8S_NAMESPACE_STAGING` | Staging 命名空间 | `ai-chat-staging` |
| `K8S_NAMESPACE_PRODUCTION` | Production 命名空间 | `ai-chat-production` |

### 4. 保护变量

建议将以下变量设置为 `Protected`（仅在 protected branches/tags 可用）：

- `K8S_PRODUCTION_CLUSTER`
- `DOCKER_REGISTRY`（写入权限）

### 5. 变量配置示例

```
Key: DOCKER_REGISTRY
Value: registry.gitlab.com
Protect variable: ✓
Mask variable: ✗
```

## Kubernetes 配置

### 获取集群凭证

```bash
# 查看可用上下文
kubectl config get-contexts

# 切换到目标集群
kubectl config use-context <context-name>

# 验证连接
kubectl get nodes
kubectl get namespaces
```

### 创建 Kubernetes Secret（用于镜像拉取）

```bash
# 创建 Pull Secret
kubectl create secret docker-registry gitlab-regcred \
  --docker-server=registry.gitlab.com \
  --docker-username=gitlab-ci-token \
  --docker-password=$CI_JOB_TOKEN \
  --namespace=ai-chat-staging
```

## 本地验证 CI 配置

### 1. 安装 GitLab Runner

```bash
# 下载 GitLab Runner
curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash

# 注册 Runner
sudo gitlab-runner register \
  --url https://gitlab.com/ \
  --registration-token <token> \
  --executor docker \
  --docker-image docker:24.0.7 \
  --description "docker-runner"
```

### 2. 验证 YAML 语法

```bash
# 使用 gitlab-runner 本地执行（需要 Docker）
gitlab-runner exec docker test:backend

# 或使用yamllint检查语法
pip install yamllint
yamllint .gitlab-ci.yml
```

### 3. 本地模拟流水线

```bash
# 创建 .env 文件
cat > .env << EOF
DOCKER_REGISTRY=registry.gitlab.com
DOCKER_IMAGE_PREFIX=ai-chat
K8S_NAMESPACE_STAGING=ai-chat-staging
K8S_NAMESPACE_PRODUCTION=ai-chat-production
EOF

# 运行本地测试
docker run --rm -v $(pwd):/workspace node:20-alpine sh -c "
  cd /workspace/backend && npm ci && npm test
"
```

## 环境矩阵

| 环境 | 集群 | Namespace | 域名 |
|------|------|-----------|------|
| Staging | staging-cluster | ai-chat-staging | staging.chat.toy |
| Production | production-cluster | ai-chat-production | chat.toy |

## 常见问题

### 1. Runner 没有 dind 标签

```bash
# 查看 Runner 标签
gitlab-runner list

# 添加标签
gitlab-runner tags edit <runner-name> --tags docker,dind
```

### 2. Docker build 失败

```bash
# 检查 Docker-in-Docker 配置
docker info | grep "Docker Root Dir"

# 确认 dind 服务已启动
docker ps | grep docker:dind
```

### 3. Kubernetes 部署失败

```bash
# 验证 kubectl 配置
kubectl config current-context

# 检查权限
kubectl auth can-i create deployment --as=system:serviceaccount:default:default
```

## 相关文档

- [.gitlab-ci.yml 详解](./gitlab-ci-reference.md)
- [部署流程](./DEPLOYMENT.md)
- [模块划分](./MODULES.md)