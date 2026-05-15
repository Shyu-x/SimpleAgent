# 部署流程说明

## 概述

本文档详细说明 GitHub Actions 流水线的部署流程，包括各阶段的任务、触发条件和回滚操作。

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
│                    │  deploy-staging │  (自动)                  │
│                    └─────────────────┘                         │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                         │
│                    │     release     │  (自动)                  │
│                    │ (创建 GitHub Release + Docker)            │
│                    └─────────────────┘                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 阶段 1: Lint (代码检查)

### 执行内容

1. **ESLint** - JavaScript 代码规范检查
2. **Prettier** - 代码格式检查
3. **TypeScript Check** - 前端类型检查
4. **Commit Message** - 提交信息格式校验

### 触发条件

- 所有分支的 push 和 PR 事件
- 文件变化检测: `backend/**`, `frontend/**`

### 失败处理

```
失败 ──▶ 不进入 Test 阶段 ──▶ 通知开发者 ──▶ 修复后重新提交
```

## 阶段 2: Test (测试)

### 执行内容

1. **Jest 单元测试** - 后端测试
2. **架构测试** - 后端架构检查
3. **综合 API 测试** - 后端 API 验证

### 并行测试

| Job | 触发条件 | 独立执行 |
|-----|----------|----------|
| `backend-test` | backend/src/** 变化 | 是 |
| `frontend-typecheck` | frontend/src/** 变化 | 是 |
| `e2e-test` | (已禁用) 需要服务运行 | - |

### 失败处理

```
测试失败 ──▶ 不进入 Build 阶段 ──▶ 通知开发者 ──▶ 修复测试后重新触发
```

## 阶段 3: Build (构建)

### 执行内容

1. **Backend 构建验证** - 语法检查 + PM2 安装
2. **Frontend Next.js 构建** - npm run build
3. **Artifact 上传** - 保存构建产物

### 模块级构建

| Job | 说明 | 产物 |
|-----|------|------|
| `backend-build` | 后端代码验证 + 打包 | backend-build artifact |
| `frontend-build` | 前端 Next.js 构建 | frontend-build artifact |

### 构建产物

```
backend-build/
  └── src/
  └── package.json
  └── ecosystem.config.js

frontend-build/
  └── .next/
  └── public/
```

### 失败处理

```
构建失败 ──▶ 不进入 Deploy 阶段 ──▶ 通知开发者 ──▶ 修复后重新触发
```

## 阶段 4: Security (安全扫描)

### 执行内容

1. **npm audit** - 依赖安全扫描
2. **Secrets 检查** - 代码中敏感信息检测

### 扫描配置

```yaml
- name: Install audit
  run: npx audit --audit-level=moderate || echo "安全扫描完成"

- name: Check for secrets
  run: grep -r "password\|secret\|api_key" --include="*.js" backend/src/
```

### 失败处理

```
发现漏洞 ──▶ allow_failure: true ──▶ 记录但不阻塞 ──▶ 通知安全团队
```

## 阶段 5: Deploy Staging (部署预发)

### 部署配置

```yaml
deploy-staging:
  needs: [backend-build, frontend-build]
  if: github.ref == 'refs/heads/master' || github.ref == 'refs/heads/main'
  environment:
    name: staging
    url: https://staging.simpleagent.example.com
```

### SSH 部署步骤

```bash
# 1. 配置 SSH Agent
- uses: webfactory/ssh-agent@v0.8.0
  with:
    ssh-private-key: ${{ secrets.STAGING_SSH_KEY }}

# 2. 部署到服务器
- name: Deploy to staging
  run: |
    # 复制文件到服务器
    scp -r backend/ user@staging:/opt/ai-chat/backend/
    scp -r frontend/.next/ user@staging:/opt/ai-chat/frontend/

    # 重启服务
    ssh user@staging "pm2 restart all"
```

### 健康检查

```bash
# 验证健康端点
curl -f https://staging.simpleagent.example.com/health
```

### 失败处理

```
部署失败 ──▶ 记录错误 ──▶ 通知开发者 ──▶ 修复后重新触发
```

## 阶段 6: Release (发布)

### 自动创建 Release

触发条件: 合并到 master/main 分支

```yaml
release:
  needs: [backend-build, frontend-build]
  if: github.ref == 'refs/heads/master' || github.ref == 'refs/heads/main'
  permissions:
    contents: write
```

### Release 内容

- **版本号**: `YYYY.MM.DD-<short-sha>` (如 `2026.05.15-abc1234`)
- **Changelog**: 最近 15 条 commit 记录
- **Tag**: `v<version>`

### Docker 镜像构建 (已配置待启用)

```bash
# 构建后端镜像
docker build -t ghcr.io/username/backend:$VERSION ./backend

# 构建前端镜像
docker build -t ghcr.io/username/frontend:$VERSION ./frontend

# 推送镜像
docker push ghcr.io/username/backend:$VERSION
docker push ghcr.io/username/frontend:$VERSION
```

## 回滚操作

### PM2 回滚

```bash
# SSH 到服务器后
pm2 list                      # 查看所有进程
pm2 logs <app-id>             # 查看最近日志
pm2 rollback <app-id>         # 回滚到上一版本
pm2 rollback <app-id> <version>  # 回滚到指定版本
```

### 手动部署恢复

```bash
# 从 Git 拉取并重新部署
ssh user@staging-server << 'EOF'
  cd /opt/ai-chat
  git checkout <previous-tag-or-commit>
  npm ci --production
  pm2 restart all
EOF
```

### 回滚检查清单

- [ ] 确认回滚版本
- [ ] 通知相关人员
- [ ] 验证服务启动
- [ ] 检查健康端点
- [ ] 确认日志无异常

## 环境矩阵

| 环境 | 触发条件 | URL | 说明 |
|------|----------|-----|------|
| Staging | master/main push | staging.simpleagent.example.com | 自动部署 |
| Production | 手动 | chat.toy | 需手动部署 |

## 发布检查清单

### 发布前检查

- [ ] 所有测试通过
- [ ] 代码审查已通过
- [ ] 安全扫描无高危漏洞
- [ ] Staging 环境验证通过
- [ ] 回滚方案已确认

### 发布后检查

- [ ] 健康检查通过
- [ ] 业务指标正常
- [ ] 错误率在正常范围
- [ ] 响应时间正常
- [ ] 日志无异常

## 通知配置

### GitHub Actions 内置通知

- PR 状态自动更新
- Actions 页面显示状态
- Email 通知 (可配置)

### Slack 集成 (可选)

```yaml
- name: Notify Slack
  if: failure()
  run: |
    curl -X POST $SLACK_WEBHOOK_URL \
      -H 'Content-type: application/json' \
      --data '{"text": "Workflow Failed: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"}'
```

## 常见问题

### 1. 构建缓存失效

```bash
# 强制清除缓存重新构建
# 在 workflow 中添加
- name: Clear npm cache
  run: npm cache clean --force
```

### 2. 部署超时

```bash
# 检查服务器状态
ssh user@staging "pm2 status"

# 查看错误日志
ssh user@staging "pm2 logs --lines 100"
```

### 3. 健康检查失败

```bash
# 手动检查健康端点
curl -v https://staging.simpleagent.example.com/health

# 检查 PM2 配置
ssh user@staging "pm2 list"
ssh user@staging "pm2 show backend"
```

## 相关文档

- [.github/workflows/ci-cd.yml](./workflow-reference.md)
- [模块划分说明](./MODULES.md)
- [环境变量配置](./ENVIRONMENT.md)