# SimpleAgent 测试策略与质量标准

> 制定日期: 2026-05-23
> 版本: v1.0
> 负责人: QA Team

---

## 一、项目测试现状

### 1.1 现有测试资产

| 类型 | 数量 | 位置 | 说明 |
|------|------|------|------|
| 后端单元测试 | 31 个 | `backend/tests/unit/` | ~11950 行，覆盖核心服务 |
| 后端集成测试 | 17 个 | `backend/tests/integration/` | API 端点、功能链路 |
| 后端压力测试 | 3 类 | `backend/tests/pressure/` | 限流、熔断、并发 |
| 后端压力测试 | 4 类 | `backend/tests/stress-test/` | SSE、向量、工具 |
| 前端单元测试 | 6 个 | `frontend/src/__tests__/` | 组件、状态管理 |
| 前端 E2E 测试 | 1 套 | `frontend/tests/e2e/` | Playwright 用户故事 |
| E2E 自动化运行器 | 3 个 | `tests/e2e/` | 全界面自动化 |
| 综合测试 | 4 类 | `backend/tests/` | API/RAG/工具/SSE |

### 1.2 当前覆盖情况

| 模块 | 单元测试 | 集成测试 | E2E 测试 |
|------|---------|---------|---------|
| 聊天核心 (`/api/chat`) | 部分 | 完整 | 完整 |
| SSE 流式响应 | 部分 | 完整 | 完整 |
| Agent 执行引擎 | 完整 | 完整 | 完整 |
| 工具系统 (30+ 工具) | 部分 | 部分 | 部分 |
| HITL 人机协作 | 完整 | 完整 | 部分 |
| A2A 协议 | 完整 | 完整 | 无 |
| RAG 检索 | 完整 | 完整 | 部分 |
| 管理后台 API | 部分 | 完整 | 无 |
| 前端组件 | 部分 | 无 | 完整 |
| 前端状态管理 | 部分 | 无 | 无 |

### 1.3 当前 CI 配置

- **Lint**: `pnpm -r lint` (每次 push/PR 自动运行)
- **测试**: `pnpm -r test` (调用 Jest，覆盖率阈值 60%)
- **触发条件**: push/PR 到 master 和 release 分支
- **覆盖率阈值**: branches/functions/lines/statements 均为 60%

---

## 二、测试优先级定义

### 2.1 P0 - Critical (致命级别)

直接影响核心业务，系统不可用的缺陷。

| 优先级 | 功能模块 | 测试类型 | 通过标准 |
|--------|---------|---------|---------|
| P0 | SSE 流式响应 | 集成+E2E | 100% 通过，延迟 < 3s |
| P0 | 聊天核心 (`/api/chat`) | 单元+集成 | 100% 通过 |
| P0 | 身份验证与 API Key 安全 | 安全测试 | 100% 通过，无泄漏 |
| P0 | 限流中间件 | 集成+压力 | 100% 通过 |
| P0 | 熔断器状态转换 | 单元+集成 | 100% 通过 |
| P0 | 取消机制 (asyncio.Event 风格) | 单元 | 100% 通过 |
| P0 | 数据持久化 (会话笔记) | 集成 | 100% 通过 |

**通过规则**: 任一 P0 测试失败，阻塞代码合并。

### 2.2 P1 - High (高级别)

影响主要功能，但有 workaround 或降级方案。

| 优先级 | 功能模块 | 测试类型 | 通过标准 |
|--------|---------|---------|---------|
| P1 | Agent 模式 (ReAct 执行循环) | 单元+集成 | >= 90% 通过 |
| P1 | 工具调用 (注册/执行/超时) | 单元+集成 | >= 90% 通过 |
| P1 | 意图识别与路由 | 单元+集成 | >= 90% 通过 |
| P1 | HITL 确认流程 | 单元+集成 | >= 90% 通过 |
| P1 | RAG 多路检索与重排序 | 单元+集成 | >= 90% 通过 |
| P1 | 前端状态管理 (Zustand) | 单元 | >= 80% 通过 |
| P1 | A2A Agent 协作协议 | 单元+集成 | >= 80% 通过 |
| P1 | MiniMax 模型路由 | 单元+集成 | >= 80% 通过 |
| P1 | 管理后台 API (CRUD) | 集成 | >= 80% 通过 |

**通过规则**: P1 测试允许少量失败（< 10%），但需在 24h 内修复并记录。

### 2.3 P2 - Medium (中级别)

增强功能、边缘情况，不影响核心使用。

| 优先级 | 功能模块 | 测试类型 | 通过标准 |
|--------|---------|---------|---------|
| P2 | 响应式布局 (< 640px / 1024px / 1440px) | E2E | >= 70% 通过 |
| P2 | 多窗口模式 | E2E | >= 70% 通过 |
| P2 | 思维链可视化 | 集成+E2E | >= 70% 通过 |
| P2 | 前端 UI 组件渲染 | 单元+E2E | >= 70% 通过 |
| P2 | 性能基准 (QPS / P50-P99 延迟) | 压力测试 | 建议性 |
| P2 | MCP 协议集成 | 单元 | >= 70% 通过 |
| P2 | 持续学习定时任务 | 集成 | 建议性 |
| P2 | 文档 ETL Pipeline | 单元+集成 | >= 70% 通过 |

**通过规则**: P2 测试为建议性，失败不影响合并，但需记录到 Release Notes。

---

## 三、测试覆盖率目标

### 3.1 覆盖率指标

| 指标 | 当前值 | 目标值 | 说明 |
|------|-------|-------|------|
| 单元测试行覆盖率 | ~60% | **>= 80%** | 后端核心服务 |
| 单元测试分支覆盖率 | ~60% | **>= 75%** | 条件分支 |
| 集成测试 API 覆盖率 | ~70% | **>= 85%** | 所有 API 端点 |
| E2E 用户路径覆盖率 | ~60% | **>= 90%** | 关键路径 |
| 前端组件覆盖率 | ~40% | **>= 60%** | 交互组件 |

### 3.2 覆盖率计算规则

```
已覆盖 = 有对应测试用例的关键功能点
覆盖率 = 已覆盖功能点 / 关键功能点总数 × 100%
```

**关键功能点定义** (按优先级排序):
1. P0 功能点: 必须 100% 覆盖
2. P1 功能点: 必须 >= 90% 覆盖
3. P2 功能点: 建议覆盖

### 3.3 各模块覆盖率目标

| 模块 | 单元测试行覆盖率 | 集成测试 API 覆盖率 | E2E 路径覆盖率 |
|------|----------------|-------------------|--------------|
| `services/agentEngine.js` | 85% | - | - |
| `services/router/modelRouter.js` | 85% | 90% | - |
| `services/sseService.js` | 80% | 100% | 100% |
| `services/ragService.js` | 80% | 90% | 70% |
| `routes/chat.js` | 80% | 100% | 100% |
| `routes/hitl.js` | 85% | 100% | 90% |
| `routes/a2a.js` | 80% | 90% | - |
| `routes/admin/*.js` | 70% | 85% | - |
| `infra/circuitBreaker/` | 90% | 90% | - |
| `infra/rateLimiter/` | 90% | 90% | - |
| `frontend/ChatArea.tsx` | 70% | - | 90% |
| `frontend/ChatInput.tsx` | 70% | - | 90% |
| `frontend/store/chatStore.ts` | 80% | - | - |

---

## 四、测试通过标准

### 4.1 标准定义

| 等级 | 描述 | 条件 |
|------|------|------|
| **A - 通过** | 可发布 | 所有 P0 测试通过，P1 测试 >= 90% 通过 |
| **B - 条件通过** | 可发布（有记录） | 所有 P0 测试通过，P1 测试 >= 80% 通过 |
| **C - 不通过** | 阻塞发布 | 存在 P0 测试失败 |

### 4.2 质量门槛

```
质量分 = (P0通过率 × 0.4) + (P1通过率 × 0.35) + (P2通过率 × 0.25)
```

| 质量分 | 等级 | 操作 |
|--------|------|------|
| >= 90 | A | 可合并 |
| 80-89 | B | 可合并，需记录 |
| < 80 | C | 阻塞，修复后重跑 |

### 4.3 测试报告要求

每次测试必须生成包含以下内容的报告:

```json
{
  "timestamp": "ISO 8601 时间戳",
  "duration": "测试耗时 (ms)",
  "summary": {
    "total": "测试总数",
    "passed": "通过数",
    "failed": "失败数",
    "skipped": "跳过数"
  },
  "byPriority": {
    "P0": { "total": 0, "passed": 0, "failed": 0 },
    "P1": { "total": 0, "passed": 0, "failed": 0 },
    "P2": { "total": 0, "passed": 0, "failed": 0 }
  },
  "coverage": {
    "lines": 0,
    "branches": 0,
    "functions": 0
  },
  "qualityScore": 0,
  "grade": "A|B|C"
}
```

---

## 五、测试类型与策略

### 5.1 单元测试

**目标**: 验证每个函数/模块的逻辑正确性

**策略**:
- 使用 Jest 作为测试框架 (后端已有配置)
- 每个导出函数必须有对应的测试文件
- 测试命名: `[模块名].test.js`
- 覆盖: 正常路径 + 边界值 + 异常路径
- Mock 外部依赖 (MiniMax API、Qdrant)

**执行频率**: 每次代码变更后自动运行

**文件位置**: `backend/tests/unit/`

**示例测试结构**:
```javascript
/**
 * [模块名] 单元测试
 * 优先级: P0/P1/P2
 */
const assert = require('assert');

function test(name, fn) { /* ... */ }

// P0: 核心功能
test('should [正常行为]', () => { /* ... */ });
test('should [边界条件]', () => { /* ... */ });

// P1: 次要功能
test('should [降级行为]', () => { /* ... */ });

// P2: 边缘情况
test('should [异常输入]', () => { /* ... */ });
```

### 5.2 集成测试

**目标**: 验证 API 端点和服务间协作

**策略**:
- 启动真实后端服务 (端口 30000)
- 测试 HTTP 请求/响应
- 覆盖: 成功路径 + 参数校验 + 错误处理
- 使用自定义测试运行器 `integration/runner.js`

**执行频率**: 每日完整测试套件 + PR 触发

**文件位置**: `backend/tests/integration/`

**测试分组**:
| 分组 | 覆盖范围 | 运行时间 |
|------|---------|---------|
| chat | `/api/chat`, SSE 流 | ~30s |
| admin | 管理后台所有 API | ~60s |
| metrics | Metrics API | ~10s |
| hitl | HITL 确认流程 | ~20s |
| mission | MissionControl API | ~20s |
| memory | 记忆 API | ~20s |
| a2a | A2A 协作协议 | ~30s |
| search | 搜索/RAG API | ~30s |

### 5.3 E2E 测试

**目标**: 验证真实用户操作路径

**策略**:
- 使用 Playwright 自动化浏览器
- 覆盖: 页面加载 -> 输入 -> 发送 -> 响应 -> 交互
- 支持多浏览器: Chromium (默认)
- 移动端视图测试 (375px / 768px / 1440px)
- 截图分析 (Playwright + MiniMax Vision)

**执行频率**:
- PR 触发: 关键路径 (P0 + P1)
- 每日: 完整套件

**文件位置**: `frontend/tests/e2e/user-stories/`

**关键用户路径**:
```
P0 路径:
  1. 页面加载 -> 显示欢迎界面 ✓
  2. 输入消息 -> 发送 -> SSE 响应 ✓
  3. 侧边栏 -> 新建对话 -> 发送消息 ✓

P1 路径:
  4. Agent 模式 -> 工具调用 -> 结果展示
  5. 知识库面板 -> 搜索 -> 结果展示
  6. 设置面板 -> API Key 配置 -> 保存
  7. HITL 确认 -> 批准/拒绝 -> 结果

P2 路径:
  8. 多窗口模式 -> 拖拽 -> 布局保存
  9. 移动端适配 -> 触摸交互 -> 响应式
  10. 思维链可视化 -> 展开/折叠
```

### 5.4 压力测试

**目标**: 验证系统在高负载下的稳定性

**策略**:
- 渐进式并发 (10 -> 50 -> 100 -> 200 用户)
- 测量: QPS、延迟 P50/P95/P99、错误率
- 监控: 熔断触发、限流拒绝、资源使用

**执行频率**: 每周一次完整压测

**文件位置**: `backend/tests/pressure/`, `backend/tests/stress-test/`

### 5.5 安全测试

**目标**: 确保系统安全可靠

**覆盖**:
| 测试项 | 方法 | 优先级 |
|--------|------|--------|
| API Key 泄漏 | 代码扫描 + 环境变量检查 | P0 |
| XSS 注入 | 特殊字符输入测试 | P0 |
| SQL 注入 | 参数化查询验证 | P0 |
| 限流绕过 | 并发请求测试 | P1 |
| CORS 配置 | 跨域请求测试 | P1 |
| 速率限制 | 阈值触发测试 | P1 |
| 安全头 | 响应头检查 | P2 |

---

## 六、回归测试计划

### 6.1 触发机制

| 触发条件 | 运行范围 | 目标时间 |
|---------|---------|---------|
| 每次代码 push | 单元测试 (changed files) | < 2min |
| 每次 PR | P0 + P1 核心测试 | < 5min |
| 每日凌晨 2:00 | 完整测试套件 | < 30min |
| 每周日 | 压力测试 + 性能基准 | < 60min |
| 手动触发 | 自定义范围 | 可配置 |

### 6.2 回归范围决策

```
代码变更影响分析:
  ↓
  分析变更文件所属模块
  ↓
  确定影响的 API / 功能
  ↓
  选择最小回归集:
    - 变更模块的单元测试
    - 受影响 API 的集成测试
    - P0 用户路径 E2E
```

**快速回归集** (push 时运行):
- 变更文件对应的单元测试
- 相关集成测试
- 耗时 < 5min

**标准回归集** (PR 时运行):
- 所有 P0 + P1 测试
- 相关模块的完整测试
- 耗时 < 15min

**完整回归集** (每日/发布前运行):
- 所有测试
- 覆盖率报告
- 耗时 < 30min

### 6.3 回归测试通过条件

| 测试集 | 通过条件 | 失败处理 |
|--------|---------|---------|
| 快速回归 | 100% 通过 | 阻塞 push |
| 标准回归 | 全部 P0 通过，P1 >= 90% | 阻塞 PR |
| 完整回归 | 质量分 >= 80 | 记录，次日修复 |

---

## 七、CI/CD 集成

### 7.1 GitHub Actions 配置

**当前 CI 工作流** (`.github/workflows/ci.yml`):

```yaml
触发条件:
  - push: master, release/**
  - pull_request: master, release/**

Jobs:
  lint:     # 已完成
  test:     # 当前仅运行 jest，覆盖率阈值 60%
  build:    # 已完成
```

**改进建议** (待实施):

```yaml
# 新增 test 策略配置
test:
  strategy:
    fail-fast: false
    matrix:
      include:
        - name: "单元测试 (后端)"
          command: "cd backend && pnpm test"
          coverage: true
        - name: "集成测试 (chat)"
          command: "cd backend && node tests/integration/runner.js chat"
        - name: "集成测试 (hitl)"
          command: "cd backend && node tests/integration/runner.js hitl"
        - name: "集成测试 (admin)"
          command: "cd backend && node tests/integration/runner.js admin"
        - name: "E2E 测试 (P0+P1)"
          command: "cd frontend && pnpm test:e2e:playwright"

  post-test:
    - name: "生成覆盖率报告"
      if: always()
      run: find . -name "coverage" -type d -exec cat {}/coverage.json 2>/dev/null \; > test-results/coverage.json

    - name: "上传测试结果"
      uses: actions/upload-artifact@v4
      if: always()
      with:
        name: test-results
        path: |
          docs/test-results/*.json
          backend/coverage/
          frontend/playwright-report/
```

### 7.2 自动化测试触发条件

```yaml
# 完整触发矩阵
on:
  push:
    branches: [master, release/**]
    paths:
      - 'backend/src/**'
      - 'frontend/src/**'

  pull_request:
    branches: [master, release/**]
    paths:
      - 'backend/src/**'
      - 'frontend/src/**'

  schedule:
    # 每日凌晨 2:00 (UTC+8 = 18:00 UTC)
    - cron: '0 18 * * *'

  workflow_dispatch:
    inputs:
      test_scope:
        description: '测试范围 (quick|standard|full)'
        required: true
        default: 'standard'
      test_modules:
        description: '指定模块 (逗号分隔)'
        required: false
```

### 7.3 测试报告自动生成

```yaml
- name: "生成 HTML 测试报告"
  run: |
    node backend/tests/comprehensive-test.js
    node tests/e2e/full-interface-test.js

- name: "上传测试报告"
  uses: actions/upload-artifact@v4
  with:
    name: test-report-${{ github.run_id }}
    path: |
      docs/test-results/
      frontend/test-results/

- name: "生成覆盖率徽章"
  uses: dkershner6/coverage-badge-action@v1
  with:
    coverage: ${{ fromJson(steps.coverage.outputs.coverage) }}
   -badge-name: coverage

- name: "失败通知"
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "❌ 测试失败: ${{ github.run_id }}",
        "attachments": [{
          "color": "#ff0000",
          "fields": [
            { "title": "分支", "value": "${{ github.ref }}" },
            { "title": "失败 Job", "value": "${{ matrix.job }}" }
          ]
        }]
      }
```

### 7.4 质量门槛 Gate

```yaml
# 在 CI 中强制执行质量门槛
- name: "质量门槛检查"
  run: |
    COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
    QUALITY_SCORE=$(cat test-results/latest/summary.json | jq '.qualityScore')

    if (( $(echo "$COVERAGE < 80" | bc -l) )); then
      echo "❌ 行覆盖率 ${COVERAGE}% < 80%"
      exit 1
    fi

    if (( $(echo "$QUALITY_SCORE < 80" | bc -l) )); then
      echo "❌ 质量分 ${QUALITY_SCORE} < 80%"
      exit 2
    fi

    echo "✅ 测试通过 - 覆盖率 ${COVERAGE}% / 质量分 ${QUALITY_SCORE}"
```

---

## 八、测试环境管理

### 8.1 环境级别

| 环境 | 用途 | 数据 | API 端点 |
|------|------|------|---------|
| `test:local` | 本地开发调试 | Mock 数据 | `localhost:30000` |
| `test:dev` | 开发分支测试 | 真实 API (限额) | `dev.simpleagent.local` |
| `test:staging` | 发布前测试 | 真实数据副本 | `staging.simpleagent.com` |
| `test:prod` | 生产监控 | 真实数据 | `api.simpleagent.com` |

### 8.2 测试数据管理

```
测试数据目录: backend/tests/fixtures/
  ├── chat/           # 聊天消息 fixture
  ├── knowledge/      # 知识库文档 fixture
  ├── tools/          # 工具定义 fixture
  ├── agents/         # Agent 配置 fixture
  └── admin/          # 管理后台 fixture
```

**数据原则**:
- 单元测试使用 Mock 数据，不依赖外部服务
- 集成测试使用真实 API Key (测试账号)
- E2E 测试使用独立的测试会话
- 禁止在测试中使用生产数据

### 8.3 环境隔离

```yaml
# test:dev 环境配置
MINIMAX_API_KEY=test_key_dev     # 独立测试 Key
RAG_TOP_K=3                      # 减少检索量
QDRANT_HOST=test-qdrant:6333     # 测试数据库
LOG_LEVEL=error                  # 减少日志
```

---

## 九、测试用例管理

### 9.1 用例组织结构

```
backend/tests/
├── unit/                    # 单元测试 (~31 个)
│   ├── CircuitBreaker.test.js      # P0: 熔断器
│   ├── agentEngine.test.js          # P0: Agent 引擎
│   ├── hitl.test.js                 # P0: HITL
│   ├── QueueRateLimiter.test.js     # P0: 限流器
│   ├── modelRouter.test.js          # P1: 模型路由
│   ├── IntentClassifier.test.js     # P1: 意图分类
│   ├── ToolExecutor.test.js          # P1: 工具执行
│   ├── QueryRewriteService.test.js  # P1: 问题重写
│   └── ...
│
├── integration/              # 集成测试 (~17 个)
│   ├── runner.js                   # 统一运行器
│   ├── chatApi.test.js             # P0: 聊天 API
│   ├── hitlApi.test.js             # P1: HITL API
│   ├── adminApi.test.js            # P1: 管理后台 API
│   └── ...
│
├── pressure/                 # 压力测试
│   ├── chat-pressure.js             # P2: 聊天压测
│   ├── admin-pressure.js           # P2: 管理后台压测
│   └── concurrent-users.js         # P2: 并发用户
│
└── stress-test/              # 压力测试
    ├── sse-stream-test.js          # P1: SSE 压测
    ├── qdrant-load-test.js         # P2: 向量库压测
    └── tool-system-test.js         # P1: 工具系统压测

frontend/tests/
├── e2e/                      # E2E 测试
│   ├── full-interface-test.js      # 自动化运行器
│   ├── playwright.config.ts        # Playwright 配置
│   └── user-stories/               # 用户故事测试
│       ├── chat.spec.ts            # P0: 聊天流程
│       ├── agent-mode.spec.ts      # P1: Agent 模式
│       ├── sidebar.spec.ts         # P0: 侧边栏
│       └── ...
```

### 9.2 用例命名规范

```
[类型]_[模块]_[场景]_[预期].test.js

示例:
  unit_agentEngine_cancel机制_active.test.js
  unit_agentEngine_cancel机制_inactive.test.js
  unit_modelRouter_failover_primary.test.js
  unit_modelRouter_failover_secondary.test.js
  integration_chatApi_success_stream.test.js
  integration_chatApi_error_invalidKey.test.js
  e2e_chat_sendMessage_receiveResponse.spec.ts
```

### 9.3 用例评审流程

```
提交测试用例
    ↓
Code Review (检查测试逻辑)
    ↓
Review 通过后合并
    ↓
触发 CI 自动运行
    ↓
生成测试报告 (COVERAGE + PASS/FAIL)
    ↓
更新 docs/test-results/
```

---

## 十、性能测试标准

### 10.1 性能基准

| 指标 | 基准值 | 警告阈值 | 严重阈值 |
|------|-------|---------|---------|
| API 响应时间 P50 | < 500ms | > 1000ms | > 3000ms |
| API 响应时间 P95 | < 2000ms | > 5000ms | > 10000ms |
| SSE 首包时间 | < 1000ms | > 3000ms | > 5000ms |
| 并发 QPS (chat) | > 50 | 20-50 | < 20 |
| 错误率 | < 1% | 1-5% | > 5% |
| 内存使用 (backend) | < 512MB | > 768MB | > 1024MB |

### 10.2 压测场景

| 场景 | 并发用户 | 持续时间 | 预期结果 |
|------|---------|---------|---------|
| 基线测试 | 10 | 5min | QPS > 50, P95 < 2s |
| 峰值测试 | 50 | 3min | 无熔断，错误率 < 1% |
| 极限测试 | 100 | 1min | 熔断保护，优雅降级 |
| 恢复测试 | 50->10 | 2min | 熔断恢复，QPS 回升 |

---

## 十一、测试工具链

### 11.1 工具清单

| 工具 | 用途 | 版本 | 状态 |
|------|------|------|------|
| Jest | 后端单元测试 | 已配置 | ✅ 正常运行 |
| Playwright | 前端 E2E 测试 | 已配置 | ✅ 正常运行 |
| `node tests/integration/runner.js` | 后端集成测试运行器 | 自定义 | ✅ 正常运行 |
| `node tests/e2e/full-interface-test.js` | E2E 自动化运行器 | 自定义 | ✅ 正常运行 |
| MiniMax Vision | 截图异常分析 | MCP | ⚠️ 可选 |
| `node backend/tests/comprehensive-test.js` | 综合 API 测试 | 自定义 | ✅ 正常运行 |
| Artillery (可选) | 高级压测 | 待引入 | 🔲 待评估 |

### 11.2 运行命令速查

```bash
# 后端单元测试
cd backend && pnpm test                    # Jest
node tests/unit/hitl.test.js               # 单个文件

# 后端集成测试
node tests/integration/runner.js            # 全部
node tests/integration/runner.js chat      # 指定分组

# 后端综合测试
node tests/comprehensive-test.js            # API 端点测试

# 前端 E2E 测试
cd frontend && pnpm test:e2e                 # 自动化运行器
cd frontend && pnpm test:e2e:playwright     # Playwright CLI
cd frontend && pnpm test:e2e:headed         # 有头模式
cd frontend && pnpm test:e2e:ui             # UI 模式
cd frontend && pnpm test:e2e:mobile         # 移动端

# 压测
node tests/pressure/chat-pressure.js        # 聊天压测
node tests/stress-test/sse-stream-test.js   # SSE 压测

# 完整回归
node backend/tests/综合测试_运行器.js       # 后端综合测试
```

---

## 十二、测试路线图

### Phase 1: 完善基础测试 (2026-Q2)

- [ ] 将覆盖率阈值从 60% 提升到 80% (Jest config)
- [ ] 补全前端 Zustand store 的单元测试
- [ ] 为所有 P0 功能补充 E2E 测试用例
- [ ] 配置 GitHub Actions 集成测试报告上传
- [ ] 生成标准格式的测试报告模板

### Phase 2: 强化集成测试 (2026-Q3)

- [ ] 引入 API contract test
- [ ] 为所有管理后台 API 补充集成测试
- [ ] 补充 A2A 协议 E2E 测试
- [ ] 建立自动化性能基准对比
- [ ] 配置 Slack 失败通知

### Phase 3: 全链路质量保障 (2026-Q4)

- [ ] 引入安全扫描 (SAST) 到 CI
- [ ] 建立测试数据管理平台
- [ ] 自动化生成 Release Notes (基于测试结果)
- [ ] 引入 chaos testing (熔断/限流故障注入)
- [ ] 达到覆盖率目标: 单元 80% / 集成 85% / E2E 90%

---

## 附录 A: 测试优先级矩阵

| 模块 | P0 | P1 | P2 | 备注 |
|------|:--:|:--:|:--:|------|
| SSE 流式响应 | ✓ | | | 核心功能 |
| 聊天核心 API | ✓ | | | 核心功能 |
| 身份验证 | ✓ | | | 安全 |
| 限流中间件 | ✓ | | | 安全 |
| 熔断器 | ✓ | | | 容错 |
| 取消机制 | ✓ | | | 体验 |
| 会话持久化 | ✓ | | | 核心功能 |
| Agent 执行 | | ✓ | | 核心功能 |
| 工具系统 | | ✓ | | 核心功能 |
| 意图识别 | | ✓ | | 核心功能 |
| HITL | | ✓ | | 协作 |
| RAG 检索 | | ✓ | | 知识 |
| 状态管理 | | ✓ | | 前端 |
| A2A 协议 | | ✓ | | 协作 |
| 模型路由 | | ✓ | | 路由 |
| 管理后台 API | | ✓ | | 管理 |
| 响应式布局 | | | ✓ | UI |
| 多窗口模式 | | | ✓ | UI |
| 思维链可视化 | | | ✓ | UI |
| MCP 集成 | | | ✓ | 协议 |
| 性能基准 | | | ✓ | 运维 |
| 文档 ETL | | | ✓ | 知识 |

---

## 附录 B: 测试报告模板

```json
{
  "report": {
    "project": "SimpleAgent",
    "version": "2.5.0",
    "timestamp": "2026-05-23T10:00:00Z",
    "environment": "test:local",
    "duration": 120000,
    "trigger": "manual|scheduled|pr|push"
  },
  "summary": {
    "total": 150,
    "passed": 142,
    "failed": 5,
    "skipped": 3,
    "passRate": "94.7%"
  },
  "byPriority": {
    "P0": { "total": 20, "passed": 20, "failed": 0, "rate": "100%" },
    "P1": { "total": 80, "passed": 75, "failed": 3, "rate": "93.8%" },
    "P2": { "total": 50, "passed": 47, "failed": 2, "rate": "94.0%" }
  },
  "coverage": {
    "backend": {
      "lines": "82%",
      "branches": "76%",
      "functions": "84%"
    },
    "frontend": {
      "lines": "64%",
      "branches": "58%",
      "functions": "70%"
    }
  },
  "qualityGate": {
    "score": 91.3,
    "grade": "A",
    "blocksMerge": false
  },
  "failedTests": [
    {
      "id": "INT-CHAT-007",
      "name": "聊天 API - 流式响应超时",
      "priority": "P1",
      "error": "TimeoutError: SSE 响应超过 10s",
      " assignee": "@developer"
    }
  ],
  "attachments": [
    "docs/test-results/coverage-summary.json",
    "docs/test-results/test-report-20260523.json"
  ]
}
```

---

## 附录 C: 质量门槛配置

```javascript
// quality-gate.js
const THRESHOLDS = {
  // P0 必须全部通过
  P0_PASS_RATE: 1.0,

  // P1 允许少量失败
  P1_PASS_RATE: 0.90,

  // 覆盖率
  LINE_COVERAGE: 0.80,
  BRANCH_COVERAGE: 0.75,
  FUNCTION_COVERAGE: 0.80,

  // 性能
  P95_LATENCY_MS: 5000,
  ERROR_RATE: 0.05
};

function evaluateQualityGate(results) {
  const score = calculateQualityScore(results);

  if (results.P0.passRate < THRESHOLDS.P0_PASS_RATE) {
    return { pass: false, grade: 'C', reason: 'P0 tests failed' };
  }

  if (results.P1.passRate < THRESHOLDS.P1_PASS_RATE) {
    return { pass: false, grade: 'C', reason: 'P1 pass rate below threshold' };
  }

  if (score < 80) {
    return { pass: false, grade: 'C', reason: `Quality score ${score} < 80` };
  }

  return { pass: true, grade: score >= 90 ? 'A' : 'B', score };
}
```
