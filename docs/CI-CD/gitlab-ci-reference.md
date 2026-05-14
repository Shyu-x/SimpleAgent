# .gitlab-ci.yml 详解

## 概述

本文档详细解释 `.gitlab-ci.yml` 配置文件的各个部分，帮助团队理解和维护 CI/CD 流水线。

## 配置结构

```yaml
# 全局变量
variables:
  ...

# 流水线触发规则
workflow:
  rules:
    ...

# 流水线阶段
stages:
  - lint
  - test
  - build
  - security
  - deploy-staging
  - deploy-production

# 默认配置
default:
  ...

# 各阶段 Job 定义
job-name:
  stage: ...
  ...
```

## 全局变量 (variables)

### 变量分类

| 类型 | 变量 | 说明 |
|------|------|------|
| Docker | `DOCKER_REGISTRY` | 镜像仓库地址 |
| Docker | `DOCKER_IMAGE_PREFIX` | 镜像前缀 |
| Docker | `DOCKER_TAG` | 镜像标签 ($CI_COMMIT_SHORT_SHA) |
| Kubernetes | `K8S_NAMESPACE_STAGING` | Staging 命名空间 |
| Kubernetes | `K8S_NAMESPACE_PRODUCTION` | Production 命名空间 |
| 测试 | `JEST_JUNIT_OUTPUT` | JUnit 报告路径 |
| 测试 | `JEST_COVERAGE_OUTPUT` | 覆盖率报告路径 |
| 测试 | `JEST_THRESHOLD_*` | 覆盖率阈值 |

### 变量引用

```yaml
# 引用全局变量
script:
  - docker build --tag ${DOCKER_REGISTRY}/${DOCKER_IMAGE_PREFIX}:${DOCKER_TAG}

# 覆盖 Job 级变量
job-name:
  variables:
    MODULE_NAME: backend
  script:
    - echo $MODULE_NAME  # 输出: backend
```

## workflow.rules (触发规则)

### 规则匹配优先级

1. **rules** 按照从上到下顺序匹配
2. 第一个匹配的规则决定是否触发
3. `when: never` 表示不触发

### 常用规则

```yaml
workflow:
  rules:
    # 指定分支触发
    - if: $CI_COMMIT_BRANCH == "main"

    # 分支模式匹配
    - if: $CI_COMMIT_BRANCH =~ /^develop.*$/

    # 事件源匹配
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

    # 手动触发
    - if: $CI_PIPELINE_SOURCE == "web"

    # 定时触发
    - if: $CI_PIPELINE_SOURCE == "schedule"

    # 默认不触发
    - when: never
```

### 分支模式

| 模式 | 匹配示例 |
|------|----------|
| `^feature.*` | feature/xxx |
| `^hotfix.*` | hotfix/xxx |
| `^release.*` | release/xxx |
| `.*` | 任意分支 |

## stages (阶段)

### 阶段顺序

```yaml
stages:
  - lint          # 1. 先运行代码检查
  - test          # 2. 然后运行测试
  - build         # 3. 构建镜像
  - security      # 4. 安全扫描
  - deploy-staging    # 5. 部署预发
  - deploy-production # 6. 部署生产
```

### 阶段并行

同一阶段的 job 并行执行：

```yaml
stages:
  - test  # test:backend, test:order, test:user, test:payment 并行
```

## default (默认配置)

### 常用配置

```yaml
default:
  # 超时时间
  timeout: "1h"

  # 重试策略
  retry:
    max: 2
    when:
      - runner_system_failure      # Runner 系统故障
      - stuck_or_timeout_failure   # 卡住或超时
      - api_failure                # API 调用失败

  # 默认镜像
  image: node:20-alpine

  # 默认标签
  tags:
    - docker
```

## Job 配置

### 完整 Job 结构

```yaml
job-name:
  # 阶段
  stage: test

  # 触发条件
  only:
    - main
    - develop
    - merge_request_event

  # 排除条件
  except:
    refs:
      - main

  # 文件变化检测
  only:
    changes:
      - backend/src/**/*.js

  # Docker 镜像
  image: node:20-alpine

  # 是否允许失败
  allow_failure: false

  # 前置脚本
  before_script:
    - echo "准备环境"
    - npm install

  # 主脚本
  script:
    - npm test

  # 后置脚本
  after_script:
    - echo "清理资源"

  # 依赖 Job (跨 stage 并行)
  needs:
    - test:backend

  # 制品
  artifacts:
    when: always
    expire_in: 7 days
    paths:
      - test-results/
    reports:
      junit: test-results/junit.xml

  # 缓存
  cache:
    key: ${CI_COMMIT_REF_SLUG}
    paths:
      - node_modules/
    policy: pull-push

  # 超时
  timeout: "30m"

  # 触发方式
  when: manual

  # 环境
  environment:
    name: production/backend
    url: https://chat.toy
    deployment_tier: production

  # 标签
  tags:
    - docker
```

## YAML Anchor (模板复用)

### 定义模板

```yaml
# 使用 & 定义模板
.test-template: &test-template
  stage: test
  image: node:20-alpine
  script:
    - npm test
```

### 使用模板

```yaml
# 使用 <<: * 合并模板
test:backend:
  <<: *test-template
  variables:
    MODULE_NAME: backend

test:order:
  <<: *test-template
  variables:
    MODULE_NAME: order
```

### 完整模板示例

```yaml
# 通用测试模板
.test-template: &test-template
  stage: test
  image: node:20-alpine
  allow_failure: false
  before_script:
    - cd backend
    - npm ci
  script:
    - npx jest --coverage --coverageReporters=jest-junit
  after_script:
    - echo "测试完成"
  artifacts:
    when: always
    reports:
      junit: test-results/junit.xml
  cache:
    key: eslint-node-modules
    paths:
      - node_modules/
    policy: pull-push
  retry:
    max: 2
    when:
      - runner_system_failure
      - stuck_or_timeout_failure
  timeout: "30m"

# Backend 测试
test:backend:
  <<: *test-template
  only:
    changes:
      - backend/src/**/*.js
      - backend/package.json
```

## only.changes (文件变化检测)

### 语法

```yaml
job-name:
  only:
    changes:
      - path/to/file
      - path/to/folder/**/*
      - "*.js"
```

### 多文件模式

```yaml
# 监听多种文件变化
eslint:
  only:
    changes:
      - backend/src/**/*.js
      - backend/src/**/*.jsx
      - "*.ts"
      - "*.tsx"
```

### 路径匹配规则

| 模式 | 匹配 |
|------|------|
| `**/*.js` | 任意目录下的 .js 文件 |
| `src/**/*.js` | src 目录下的 .js 文件 |
| `!src/test/**` | 排除 test 目录 |
| `*.json` | 根目录的 JSON 文件 |

### MR 场景

在 MR 中，`only: changes` 会比较源分支和目标分支的差异：

```
feature-branch vs main
  ↓ 比较差异
  ↓ 仅当差异文件匹配时才触发
  ↓ pipeline 运行
```

## dependencies (依赖 Job)

### 基本用法

```yaml
# job1 执行后才执行 job2
job2:
  dependencies:
    - job1
```

### 跨 Stage 依赖

```yaml
# 即使 build 在 test 之后 stage，也可以用 needs 实现并行
test:backend:
  stage: test

build:backend:
  stage: build
  needs:
    - test:backend  # 等待 test 完成后再 build
```

### 传递制品

```yaml
build:
  needs:
    - test:backend
    - job: test:order
      artifacts: false  # 不下载制品
```

## artifacts (制品)

### 基本配置

```yaml
artifacts:
  when: always  # always / on_success / on_failure
  expire_in: 7 days
  paths:
    - test-results/
    - build/
```

### 报告配置

```yaml
artifacts:
  reports:
    # JUnit 测试报告
    junit: test-results/junit.xml

    # 覆盖率报告
    coverage_report:
      coverage_format: cobertura
      path: coverage/cobertura-coverage.xml

    # SAST 报告
    sast: sast-report.json
```

### GitLab UI 集成

配置 reports 后，GitLab 会自动在 MR 页面显示：

- 测试结果
- 覆盖率趋势图
- 安全扫描结果

## cache (缓存)

### 缓存策略

| 策略 | 说明 |
|------|------|
| `pull` | 只下载缓存 |
| `pull-push` | 下载并上传缓存 (默认) |
| `push` | 只上传缓存 |

### 缓存 Key

```yaml
# 按分支缓存
cache:
  key: ${CI_COMMIT_REF_SLUG}

# 按分支 + 文件变化缓存
cache:
  key: ${CI_COMMIT_REF_SLUG}-${CI_COMMIT_SHA}

# 共享缓存
cache:
  key: shared-node-modules
```

### 常见缓存配置

```yaml
cache:
  key: ${CI_PROJECT_NAME}-node-modules
  paths:
    - backend/node_modules/
    - .npm/
  policy: pull-push
```

## environment (环境)

### 环境配置

```yaml
deploy:production:
  environment:
    name: production/backend
    url: https://chat.toy
    deployment_tier: production
```

### 环境操作

```yaml
rollback:production:
  environment:
    name: production/backend
    action: rollback  # stop / rollback / access
```

### GitLab 环境页面

配置 environment 后，可以在 GitLab 的 `Deployments > Environments` 页面：

- 查看部署历史
- 一键回滚
- 查看实时日志

## when (触发方式)

### 触发方式选项

| 值 | 说明 |
|---|------|
| `on_success` | 上游 job 成功时执行 (默认) |
| `on_failure` | 上游 job 失败时执行 |
| `always` | 始终执行 |
| `manual` | 手动触发 |
| `delayed` | 延迟执行 |
| `never` | 从不执行 |

### 手动触发

```yaml
deploy:production:
  when: manual  # 需要手动点击 Play
  environment:
    name: production
```

### 延迟执行

```yaml
# 延迟 30 秒执行 (用于节流)
rate-limit-check:
  when: delayed
  delayed:
    seconds: 30
```

## tags (Runner 标签)

### 标签匹配

```yaml
# 只有带有 docker 和 dind 标签的 Runner 才能运行
build:
  tags:
    - docker
    - dind
```

### 常见 Runner 标签

| 标签 | 用途 |
|------|------|
| `docker` | Docker 执行器 |
| `dind` | Docker-in-Docker |
| `kubernetes` | K8s 执行器 |
| `shell` | Shell 执行器 |

## extends (继承)

### 基本用法

```yaml
# 定义基础 Job
.base:
  stage: test
  image: node:20-alpine

# 继承
test:
  extends: .base
  script:
    - npm test
```

### 与 Anchor 对比

```yaml
# Anchor: 合并内容
.test-template: &test-template
  script: test

job:
  <<: *test-template
  script: custom-test  # 覆盖

# extends: 完全替换
.base:
  script: test

job:
  extends: .base
  script: custom-test  # 替换
```

## rules (规则表达式)

### 条件判断

```yaml
job:
  rules:
    # 变量比较
    - if: $CI_COMMIT_BRANCH == "main"

    # 正则匹配
    - if: $CI_COMMIT_BRANCH =~ /^feature.*$/

    # 变量存在
    - if: $SLACK_WEBHOOK_URL

    # 变量不存在
    - if: $SLACK_WEBHOOK_URL == null

    # 多个条件 (AND)
    - if: $CI_COMMIT_BRANCH == "main" && $CI_PIPELINE_SOURCE == "push"
```

### 规则动作

```yaml
job:
  rules:
    # 触发
    - if: ...
      when: on_success

    # 不触发
    - if: ...
      when: never

    # 手动
    - if: ...
      when: manual
```

## 高级特性

### DAG 模式 (跨 Stage 并行)

```yaml
# 启用 DAG 模式
stages:
  - build
  - test
  - deploy

# 使用 needs 实现 DAG
test1:
  stage: test

test2:
  stage: test

deploy:
  stage: deploy
  needs:
    - test1
    - test2  # 等待所有测试完成
```

### 父子流水线

```yaml
# 触发父流水线
trigger-pipeline:
  trigger: project/path/to/parent-pipeline
  strategy: depend

# 使用 include 包含其他配置
include:
  - local: templates/docker.yml
  - local: templates/kubernetes.yml
  - remote: https://example.com/gitlab-ci.yml
```

### 合并请求测试

```yaml
merge_request_event:
  stage: test
  only:
    - merge_request_event
  script:
    - npm test
    - npm run e2e:mr  # MR 专属 E2E 测试
```

## 最佳实践

### 1. 使用 Anchor 减少重复

```yaml
# 避免重复代码
.test-template: &test-template
  stage: test
  image: node:20-alpine
  before_script:
    - npm ci
  after_script:
    - rm -rf .npm
```

### 2. 合理设置超时

```yaml
# 短时 job
quick-check:
  timeout: "5m"

# 长时 job
integration-test:
  timeout: "1h"
```

### 3. 缓存依赖

```yaml
cache:
  key: ${CI_PROJECT_NAME}-${副主编}
  paths:
    - node_modules/
  policy: pull-push
```

### 4. 制品及时清理

```yaml
artifacts:
  expire_in: 7 days  # 不要保留太久
```

### 5. 敏感变量保护

```yaml
variables:
  SECRET_KEY:
    value: default
    hidden: true  # 在日志中隐藏
```

## 调试技巧

### 1. 手动触发测试

```bash
# 通过 API 触发
curl --request POST \
  --header "PRIVATE-TOKEN: <token>" \
  --data "ref=main" \
  "https://gitlab.com/api/v4/projects/:id/trigger/pipeline"
```

### 2. 查看 Runner 日志

```bash
# 获取 job 日志
gitlab-runner list
gitlab-runner verify
```

### 3. 本地测试

```bash
# 使用 gitlab-runner 本地运行
gitlab-runner exec docker test:backend
```

## 相关文档

- [GitLab CI/CD 官方文档](https://docs.gitlab.com/ee/ci/)
- [.gitlab-ci.yml 完整参考](https://docs.gitlab.com/ee/ci/yaml/)
- [GitLab CI/CD 变量](https://docs.gitlab.com/ee/ci/variables/predefined_variables.html)
