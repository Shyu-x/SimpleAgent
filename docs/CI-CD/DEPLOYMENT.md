# 部署流程说明

## 概述

本文档详细说明 GitLab CI/CD 流水线的部署流程，包括各阶段的任务、触发条件和回滚操作。

## 部署流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                     部署流程总览                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  代码提交 ──▶ Lint ──▶ Test ──▶ Build ──▶ Security              │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                         │
│                    │  deploy:staging  │  (自动/手动)             │
│                    └─────────────────┘                         │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                         │
│                    │ healthcheck     │  (自动验证)              │
│                    └─────────────────┘                         │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                         │
│                    │ deploy:canary   │  (10% -> 50% -> 100%)   │
│                    └─────────────────┘                         │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                         │
│                    │ healthcheck      │  (最终验证)              │
│                    └─────────────────┘                         │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                         │
│                    │ ✓ 部署完成      │                         │
│                    └─────────────────┘                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 阶段 1: Lint (代码检查)

### 执行内容

1. **Commitlint** - 校验提交信息格式
2. **ESLint** - 代码规范检查
3. **JSON Schema** - package.json 语法校验

### 触发条件

- 所有分支的 push 和 MR 事件
- 文件变化检测: `backend/**`

### 失败处理

```
失败 ──▶ 不进入 Test 阶段 ──▶ 通知开发者 ──▶ 修复后重新提交
```

## 阶段 2: Test (测试)

### 执行内容

1. **Jest 单元测试** - 按模块隔离
2. **覆盖率收集** - 生成 lcov 报告
3. **JUnit 报告** - 生成 XML 报告

### 模块级并行测试

| Job | 触发条件 | 独立执行 |
|-----|----------|----------|
| `test:backend` | backend/src/** 变化 | 是 |
| `test:frontend:unit` | frontend/src/** 变化 | 是 |
| `test:frontend:e2e` | main/develop/MR | 是 |
| `test:integration` | main/develop/MR | 是 |

### 覆盖率要求

```yaml
coverage:
  line: 70%    # 代码行覆盖率
  branch: 60%   # 分支覆盖率
```

### 失败处理

```
测试失败 ──▶ 不进入 Build 阶段 ──▶ 通知开发者 ──▶ 修复测试后重新触发
```

## 阶段 3: Build (构建)

### 执行内容

1. **Docker 镜像构建** - 使用 BuildKit
2. **缓存优化** - 使用 --cache-from
3. **镜像推送** - 推送到 GitLab Registry

### 模块级构建

| Job | Docker 镜像 | 标签 |
|-----|-------------|------|
| `build:backend` | `registry.gitlab.com/ai-chat-backend/backend` | SHA, latest |
| `build:order` | `registry.gitlab.com/ai-chat-backend/order` | SHA, latest |
| `build:user` | `registry.gitlab.com/ai-chat-backend/user` | SHA, latest |
| `build:payment` | `registry.gitlab.com/ai-chat-backend/payment` | SHA, latest |

### 构建缓存策略

```dockerfile
# 使用多阶段构建
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --cache /tmp/.npm
COPY . .
RUN npm run build

# 生产镜像
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 30000
CMD ["node", "dist/index.js"]
```

### 失败处理

```
构建失败 ──▶ 不进入 Deploy 阶段 ──▶ 通知开发者 ──▶ 修复后重新触发
```

## 阶段 4: Security (安全扫描)

### 执行内容

1. **Trivy 容器扫描** - 镜像漏洞检测
2. **npm audit** - 依赖安全扫描
3. **SAST** - 静态代码安全分析

### 扫描配置

```yaml
severity:
  - HIGH
  - CRITICAL
```

### 失败处理

```
发现漏洞 ──▶ allow_failure: true ──▶ 记录但不阻塞 ──▶ 通知安全团队
```

## 阶段 5: Deploy Staging (部署预发)

### 部署策略

```yaml
deploy:staging:
  when: manual  # 可配置为 automatic
  environment:
    name: staging/backend
    url: https://staging.chat.toy
```

### Kubernetes 滚动更新

```bash
# 滚动更新命令
kubectl set image deployment/ai-chat-backend backend=<new-image> -n ai-chat-staging

# 等待滚动完成
kubectl rollout status deployment/ai-chat-backend -n ai-chat-staging --timeout=10m
```

### 健康检查

```bash
# 验证健康端点
curl -f https://staging.chat.toy/health
```

### 失败处理

```
部署失败 ──▶ 自动回滚 ──▶ 通知开发者 ──▶ 修复后重新触发
```

## 阶段 6: Deploy Production (生产部署)

### 灰度发布策略

```
┌────────────────────────────────────────────────────────┐
│                   灰度发布流程                         │
├────────────────────────────────────────────────────────┤
│                                                         │
│  阶段 1: 10% 流量                                       │
│  ├── 更新 10% Pod                                       │
│  ├── 等待 60 秒                                         │
│  ├── 健康检查                                           │
│  └── 验证业务指标                                       │
│                        │                                │
│                        ▼                                │
│  阶段 2: 50% 流量                                       │
│  ├── 更新 50% Pod                                       │
│  ├── 等待 60 秒                                         │
│  ├── 健康检查                                           │
│  └── 验证业务指标                                       │
│                        │                                │
│                        ▼                                │
│  阶段 3: 100% 流量                                      │
│  ├── 更新 100% Pod                                      │
│  ├── 健康检查                                           │
│  └── 验证业务指标                                       │
│                                                         │
└────────────────────────────────────────────────────────┘
```

### 手动触发

```yaml
deploy:production:
  when: manual  # 必须手动触发
```

### 回滚策略

```bash
# 回滚到上一个版本
kubectl rollout undo deployment/ai-chat-backend -n ai-chat-production

# 回滚到指定版本
kubectl rollout undo deployment/ai-chat-backend -n ai-chat-production --to-revision=3
```

## 回滚流水线

### 回滚 job

| Job | 环境 | 触发方式 |
|-----|------|----------|
| `rollback:staging` | Staging | 手动 |
| `rollback:production` | Production | 手动 |
| `rollback:staging:order` | Staging | 手动 |
| `rollback:staging:user` | Staging | 手动 |
| `rollback:staging:payment` | Staging | 手动 |

### 回滚流程

```
发现问题 ──▶ 人工确认 ──▶ 触发回滚 Job ──▶ 自动回滚到上一版本 ──▶ 验证 ──▶ 完成
```

### 自动回滚触发条件

1. **健康检查失败** - 连续 3 次健康检查失败
2. **错误率超标** - 5 分钟内错误率 > 5%
3. **响应延迟** - P99 响应时间 > 5s

## 环境矩阵

| 环境 | 集群 | Namespace | 域名 |
|------|------|-----------|------|
| Staging | staging-cluster | ai-chat-staging | staging.chat.toy |
| Production | production-cluster | ai-chat-production | chat.toy |

## 发布检查清单

### 发布前检查

- [ ] 所有测试通过
- [ ] 代码审查已通过
- [ ] 安全扫描无高危漏洞
- [ ] Staging 环境验证通过
- [ ] 备份已创建
- [ ] 回滚方案已确认

### 发布后检查

- [ ] 健康检查通过
- [ ] 业务指标正常
- [ ] 错误率在正常范围
- [ ] 响应时间正常
- [ ] 日志无异常

## 通知配置

### Slack 通知

```yaml
notify:pipeline:failure:
  script:
    - curl -X POST $SLACK_WEBHOOK_URL \
        -H 'Content-type: application/json' \
        --data '{"text": "Pipeline Failed: '${CI_PIPELINE_URL}'"}'
```

### 通知触发条件

| 事件 | 通知方式 |
|------|----------|
| 流水线失败 | Slack |
| 部署成功 | Slack |
| 健康检查失败 | Slack + Email |
| 安全扫描发现高危 | 安全团队邮件 |

## 常见问题

### 1. 构建缓存失效

```bash
# 清除缓存重新构建
docker build --no-cache -t <image> .
```

### 2. 部署超时

```bash
# 检查 Pod 状态
kubectl get pods -n ai-chat-staging
kubectl describe pod <pod-name> -n ai-chat-staging

# 查看日志
kubectl logs <pod-name> -n ai-chat-staging
```

### 3. 健康检查失败

```bash
# 手动检查健康端点
curl -v https://staging.chat.toy/health

# 检查 Pod 健康探针配置
kubectl get deployment ai-chat-backend -n ai-chat-staging -o yaml | grep -A 20 readinessProbe
```

## 相关文档

- [.gitlab-ci.yml 详解](./gitlab-ci-reference.md)
- [模块划分说明](./MODULES.md)
