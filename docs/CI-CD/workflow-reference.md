# .github/workflows/ci-cd.yml 详解

## 概述

本文档详细解释 `.github/workflows/ci-cd.yml` 配置文件的各个部分，帮助团队理解和维护 CI/CD 流水线。

## 配置结构

```yaml
# 触发条件
on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]

# 全局环境变量
env:
  NODE_VERSION: '20.x'
  PM2_VERSION: 'latest'

# Jobs 定义
jobs:
  job-name:
    name: Display Name
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Step Name
        run: command
```

## on (触发条件)

### 触发类型

| 触发器 | 说明 |
|--------|------|
| `push` | 推送代码到分支 |
| `pull_request` | 打开/更新 PR |
| `schedule` | 定时执行 (cron) |
| `workflow_dispatch` | 手动触发 |
| `repository_dispatch` | API 触发 |

### 分支过滤

```yaml
# 触发所有分支
on: push

# 只触发 master 和 main
on:
  push:
    branches: [master, main]

# 排除某些分支
on:
  push:
    branches-ignore: [experimental, 'release/*']
```

### 路径过滤

```yaml
on:
  push:
    paths:
      - 'backend/**'      # 后端变化
      - 'frontend/**'     # 前端变化
      - '!.github/**'     # 排除 .github 目录
```

## env (环境变量)

### 全局变量

```yaml
env:
  NODE_VERSION: '20.x'
  PM2_VERSION: 'latest'
```

### Job 级变量

```yaml
jobs:
  backend-test:
    env:
      NODE_ENV: test
      API_URL: http://localhost:30000
```

### Step 级变量

```yaml
- name: Build
  run: npm run build
  env:
    NEXT_TELEMETRY_DISABLED: '1'
```

## jobs (任务)

### 基本结构

```yaml
jobs:
  job-name:
    name: Job Display Name
    runs-on: ubuntu-latest  # 运行平台

    defaults:                 # 默认工作目录
      run:
        working-directory: backend

    steps:                   # 执行步骤
      - uses: actions/checkout@v4
      - name: Setup
        run: npm ci
```

### 条件执行

```yaml
jobs:
  deploy:
    if: github.ref == 'refs/heads/main'  # 条件判断
    runs-on: ubuntu-latest
```

## needs (依赖关系)

### 串行执行

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest

  test:
    needs: lint          # 等待 lint 完成
    runs-on: ubuntu-latest

  build:
    needs: test          # 等待 test 完成
    runs-on: ubuntu-latest
```

### 并行依赖

```yaml
jobs:
  backend-test:
    runs-on: ubuntu-latest

  frontend-test:
    runs-on: ubuntu-latest

  build:
    needs: [backend-test, frontend-test]  # 等待所有测试
    runs-on: ubuntu-latest
```

### 选择性依赖

```yaml
jobs:
  test:
    runs-on: ubuntu-latest

  build:
    needs: [test]
    if: always() || needs.test.result == 'success'  # 允许失败
    runs-on: ubuntu-latest
```

## uses (Action 引用)

### 官方 Action

```yaml
steps:
  # 检出代码
  - uses: actions/checkout@v4

  # 设置 Node.js
  - uses: actions/setup-node@v4
    with:
      node-version: '20.x'
      cache: 'npm'
      cache-dependency-path: backend/package-lock.json

  # SSH Agent
  - uses: webfactory/ssh-agent@v0.8.0
    with:
      ssh-private-key: ${{ secrets.STAGING_SSH_KEY }}
```

### 第三方 Action

```yaml
steps:
  # GitHub Release
  - uses: softprops/action-gh-release@v1

  # 上传构件
  - uses: actions/upload-artifact@v4
    with:
      name: backend-build
      path: backend/dist/
      retention-days: 7

  # 下载构件
  - uses: actions/download-artifact@v4
    with:
      name: backend-build
      path: ./build
```

## with (参数传递)

### 常用参数

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0        # 完整历史 (用于 commitlint)
    lfs: true             # 下载 LFS 文件
    submodules: true      # 下载子模块

- uses: actions/setup-node@v4
  with:
    node-version: '20.x'
    cache: 'npm'
    cache-dependency-path: '**/package-lock.json'
```

## run (命令执行)

### 单行命令

```yaml
- name: Install dependencies
  run: npm ci

- name: Run tests
  run: npm test
```

### 多行命令

```yaml
- name: Deploy
  run: |
    echo "部署开始..."
    scp -r ./dist user@server:/opt/app/
    ssh user@server "pm2 restart app"
    echo "部署完成"
```

### 条件命令

```yaml
- name: Check commit message
  run: |
    if [ "${{ github.event_name }}" == "push" ]; then
      COMMIT_MSG=$(git log --format=%B -n 1 HEAD)
      if ! echo "$COMMIT_MSG" | grep -qE "^(feat|fix|docs)"; then
        echo "Warning: Commit message format invalid"
      fi
    fi
```

## permissions (权限)

### Release Job 权限

```yaml
release:
  needs: [backend-build, frontend-build]
  permissions:
    contents: write       # 写入 release 和 tag
    statuses: write       # 更新 commit 状态

  steps:
    - uses: actions/checkout@v4

    - name: Create GitHub Release
      uses: softprops/action-gh-release@v1
```

### 默认权限

```yaml
permissions:
  contents: read          # 读取仓库内容 (默认)
  pull-requests: write    # 写入 PR 评论
```

## environment (环境配置)

### 环境定义

```yaml
deploy-staging:
  needs: [backend-build, frontend-build]
  environment:
    name: staging
    url: https://staging.example.com

deploy-production:
  needs: [deploy-staging]
  environment:
    name: production
    url: https://example.com
```

### 环境保护

在 GitHub 仓库 `Settings > Environments` 中可以配置：
- 必需审批者
- 部署分支规则
- 等待计时器

## outputs (输出)

### Job 输出

```yaml
jobs:
  get-version:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.ver.outputs.version }}
      tag: ${{ steps.ver.outputs.tag }}

    steps:
      - id: ver
        run: |
          VERSION=$(date +'%Y.%m.%d')-$(git rev-parse --short HEAD)
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "tag=v${VERSION}" >> $GITHUB_OUTPUT

  release:
    needs: get-version
    steps:
      - name: Use version
        run: echo ${{ needs.get-version.outputs.version }}
```

### 多行输出

```yaml
- id: changelog
  run: |
    CHANGELOG=$(git log --oneline -10 --format="- %s")
    echo "changelog<<EOF" >> $GITHUB_OUTPUT
    echo "$CHANGELOG" >> $GITHUB_OUTPUT
    echo "EOF" >> $GITHUB_OUTPUT
```

## secrets (敏感信息)

### 引用方式

```yaml
steps:
  - name: Deploy
    run: |
      ssh -i ${{ secrets.STAGING_SSH_KEY }} user@server "echo deploy"
    # 正确: 使用 secrets.X

  # 错误写法:
  # run: echo $STAGING_SSH_KEY  # 这是环境变量，不是 secrets
```

### 自定义 Secrets

在 `Settings > Secrets and variables > Actions` 中添加：

| Secret | 用途 |
|--------|------|
| `STAGING_SSH_KEY` | SSH 部署密钥 |
| `DOCKER_REGISTRY` | Docker 镜像仓库 |
| `SLACK_WEBHOOK_URL` | Slack 通知 |

## if (条件判断)

### 分支条件

```yaml
deploy:
  if: github.ref == 'refs/heads/main'
  # 或
  if: github.ref == 'refs/heads/master'
```

### 事件条件

```yaml
# 仅 PR 评论触发
on: issue_comment

deploy:
  if: github.event.issue.comments[0].body == '/deploy'
```

### 状态条件

```yaml
# 允许前置 job 失败
build:
  needs: [test]
  if: always() || needs.test.result == 'success'
```

## 并行执行模式

### 后端/前端并行

```
backend-lint ──────▶ backend-test ──▶ backend-api-check ─┬─▶ backend-build ─┐
                                                             │
frontend-lint ─────▶ frontend-typecheck ───────────────────┴─▶ frontend-build

                                                                        │
                                                            deploy-staging
                                                                        │
                                                              release
```

### 配置示例

```yaml
jobs:
  # 后端流水线
  backend-lint:
    runs-on: ubuntu-latest

  backend-test:
    needs: backend-lint
    runs-on: ubuntu-latest

  backend-build:
    needs: [backend-test, backend-api-check]
    runs-on: ubuntu-latest

  # 前端流水线 (独立)
  frontend-lint:
    runs-on: ubuntu-latest

  frontend-typecheck:
    needs: frontend-lint
    runs-on: ubuntu-latest

  frontend-build:
    needs: [frontend-typecheck]
    runs-on: ubuntu-latest

  # 部署 (等待所有构建)
  deploy:
    needs: [backend-build, frontend-build]
    runs-on: ubuntu-latest
```

## 缓存策略

### npm 缓存

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20.x'
    cache: 'npm'
    cache-dependency-path: backend/package-lock.json
```

### 自定义缓存

```yaml
- name: Cache node_modules
  uses: actions/cache@v4
  with:
    path: |
      backend/node_modules
      frontend/node_modules
    key: ${{ runner.os }}-node-modules-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-modules-
```

## 常用 Actions 汇总

| Action | 用途 |
|--------|------|
| `actions/checkout@v4` | 检出代码 |
| `actions/setup-node@v4` | 设置 Node.js 环境 |
| `actions/upload-artifact@v4` | 上传构建产物 |
| `actions/download-artifact@v4` | 下载构建产物 |
| `webfactory/ssh-agent@v0.8.0` | SSH 连接 |
| `softprops/action-gh-release@v1` | 创建 GitHub Release |

## 最佳实践

### 1. 使用缓存加速

```yaml
- uses: actions/setup-node@v4
  with:
    cache: 'npm'
    cache-dependency-path: backend/package-lock.json
```

### 2. 限制并发

```yaml
jobs:
  deploy:
    concurrency:
      group: ${{ github.ref }}
      cancel-in-progress: true
```

### 3. 禁用不必要的 job

```yaml
e2e-test:
  if: false  # 禁用，需要服务运行
```

### 4. 设置超时

```yaml
jobs:
  long-running:
    timeout-minutes: 60
```

### 5. 正确使用工作目录

```yaml
jobs:
  backend-test:
    defaults:
      run:
        working-directory: backend
    steps:
      - run: npm ci  # 已在 backend 目录
```

## 调试技巧

### 1. 查看 workflow 日志

仓库 > Actions > 点击 Workflow run > 查看 Job 日志

### 2. 本地模拟

无法完全本地运行，但可以测试部分命令：

```bash
# 测试 node 命令
docker run --rm node:20 node --check src/index.js

# 测试 npm 命令
docker run --rm -v $(pwd):/app -w /app node:20 npm ci
```

### 3. 模拟触发

```bash
# 手动触发 workflow
gh workflow run ci-cd.yml --ref main
```

### 4. 查看 workflow 定义

```bash
# 列出所有 workflow
gh workflow list

# 查看 workflow YAML
cat .github/workflows/ci-cd.yml
```

## 相关文档

- [GitHub Actions 官方文档](https://docs.github.com/en/actions)
- [Workflow 语法参考](https://docs.github.com/en/actions/learn-github-actions/workflow-syntax-for-github-actions)
- [表达式语法](https://docs.github.com/en/actions/learn-github-actions/expressions)
- [Context 和 Secrets](https://docs.github.com/en/actions/learn-github-actions/contexts)