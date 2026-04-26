# AI Chat 玩具 - 测试规范

**项目**: AI Chat 玩具 - 现代化AI对话平台
**位置**: `C:\Users\Xu\Desktop\chat玩具`
**更新**: 2026-04-26

---

## 测试框架概览

| 类型 | 框架 | 位置 | 说明 |
|------|------|------|------|
| E2E测试 | Playwright | `tests/e2e/` | 跨浏览器端到端测试 |
| 单元测试 | Jest | `backend/tests/unit/` | 后端单元测试 |
| 集成测试 | Jest | `backend/tests/integration/` | 后端集成测试 |
| 量化测试 | 自定义 | `tests/` | NLP/性能量化测试 |
| 综合测试 | 自定义 | `backend/tests/` | API端点测试 |

---

## E2E 测试 (Playwright)

### 配置

**文件**: `tests/e2e/playwright.config.js`

```javascript
module.exports = {
  testDir: './tests/e2e',
  timeout: 120000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'test-results/html' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } },
    {
      name: 'Mobile Chrome',
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
};
```

### 测试文件

| 文件 | 描述 |
|------|------|
| `page.spec.ts` | 页面加载测试 |
| `chat.spec.ts` | 聊天功能测试 |
| `sidebar.spec.ts` | 侧边栏测试 |
| `settings.spec.ts` | 设置面板测试 |
| `agent.spec.ts` | Agent模式测试 |
| `focus-mode.spec.ts` | 专注模式测试 |
| `responsive.spec.ts` | 响应式布局测试 |

### 运行命令

```bash
# 自定义测试运行器
node tests/e2e/full-interface-test.js

# Playwright Test
cd frontend && npx playwright test

# 有头模式
npm run test:e2e:headed

# UI模式
npm run test:e2e:ui

# 移动端测试
npm run test:e2e:mobile
```

### 测试报告

```
test-results/
├── html/index.html          # Playwright HTML报告
├── results.json             # JSON报告
└── screenshots/            # 失败截图
```

### 环境变量

```bash
MINIMAX_API_KEY=your_api_key      # 用于视觉分析
TEST_BASE_URL=http://localhost:5173
TEST_BACKEND_URL=http://localhost:30000
```

---

## 后端单元测试 (Jest)

### 配置

**文件**: `backend/jest.config.js`

```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js', '**/*.spec.js'],
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
};
```

### 设置文件

**文件**: `backend/jest.setup.js`

```javascript
process.env.NODE_ENV = 'test';
jest.setTimeout(30000);
```

### 测试文件

| 文件 | 描述 |
|------|------|
| `unit/hitl.test.js` | HITL检查点管理测试 |
| `unit/a2a.test.js` | A2A协议测试 |
| `unit/api.test.js` | API测试 |

### 自定义测试运行器

```javascript
function test(name, fn) {
  try {
    fn();
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } catch (e) {
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.log('    ' + e.message);
    process.exitCode = 1;
  }
}
```

---

## 综合测试

### 测试文件

| 文件 | 描述 |
|------|------|
| `backend/tests/comprehensive-test.js` | 综合API测试 (29/29通过) |
| `backend/tests/agent-evaluation-system.js` | Agent评价体系 (8维度34用例) |
| `backend/tests/dialogue-scenario-test.js` | 连续对话场景测试 (5场景15轮) |

### 运行命令

```bash
# 综合API测试
node backend/tests/comprehensive-test.js

# Agent评价体系
node backend/tests/agent-evaluation-system.js

# 对话场景测试
node backend/tests/dialogue-scenario-test.js
```

### 集成测试

| 文件 | 描述 |
|------|------|
| `integration/chatApi.test.js` | 聊天API集成 |
| `integration/agentApi.test.js` | Agent API集成 |
| `integration/chatOrchestrator.test.js` | 编排器集成 |
| `integration/agentOrchestrator.test.js` | Agent编排器集成 |

---

## 量化测试

### 测试脚本

| 文件 | 描述 |
|------|------|
| `tests/量化测试_runner.js` | 意图识别 (5000请求)、查询改写 (2000请求) |
| `tests/压测_runner.js` | 递增压测 (10/50/100/200并发) |
| `tests/参数评估_runner.js` | 熔断/限流/Token控制参数评估 |

### 测试输出

```
tests/
├── 量化测试结果/2026-03-17T19-10-56/
│   ├── 量化测试报告.json
│   └── 延迟数据.json
├── 压测结果/2026-03-17T18-38-42/
└── 参数评估结果/2026-03-17T18-41-43/
    ├── 参数评估报告.json
    └── 评估摘要.json
```

---

## 测试覆盖

### API 测试覆盖

| API | 测试项 |
|-----|-------|
| `/api/chat` | 消息验证、停止生成、异常处理、XSS防护 |
| `/api/search` | 查询验证、配置获取、健康检查 |
| `/api/agent` | Agent列表、心跳检测、SSE订阅 |
| `/api/rag` | 知识库CRUD、文档检索、统计信息 |
| `/api/config` | 渠道配置、API Key管理 |

### E2E 测试覆盖

| 功能 | 测试项 |
|------|--------|
| 页面 | 加载、控制台错误检测 |
| 聊天 | 发送消息、接收回复、流式响应 |
| 侧边栏 | 对话列表、新建对话 |
| 设置 | 配置面板、API Key管理 |
| Agent | 工作区、Tab导航、思维链可视化 |
| 响应式 | 桌面/平板/移动端布局 |

---

## 视觉分析

### 配置

```bash
export MINIMAX_API_KEY=your_api_key
```

### 分析内容

- 布局异常 (重叠、错位、溢出)
- 样式问题 (颜色、字体)
- 交互问题 (按钮不可点击)
- 内容问题 (乱码、缺失)

---

## CI/CD 集成

### GitHub Actions

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: docker-compose up -d
      - run: sleep 10
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: test-results/
```

---

## 故障排查

### 服务未启动

```bash
# 检查前端
curl http://localhost:5173

# 检查后端
curl http://localhost:30000/api/health
```

### 浏览器安装失败

```bash
npx playwright install chromium --with-deps
```

### 测试超时

```bash
export PLAYWRIGHT_TIMEOUT=120000
node tests/e2e/full-interface-test.js
```

---

## 添加新测试

### 1. 创建测试文件

```typescript
// tests/e2e/new-feature.spec.ts
const { test, expect } = require('@playwright/test');

test.describe('新功能', () => {
  test('功能测试', async ({ page }) => {
    await page.goto('/');
    // 测试代码...
  });
});
```

### 2. 运行测试

```bash
npx playwright test tests/e2e/new-feature.spec.ts
```

---

## 测试报告可视化

**文件**: `tests/测试报告_可视化.html`

打开浏览器查看量化测试、压测结果的图表分析。

---

## 前置条件

### 启动服务

```bash
# 终端 1: 启动前端
cd frontend && npm run dev

# 终端 2: 启动后端
cd backend && npm run dev
```

### 安装依赖

```bash
cd frontend
npm install
npx playwright install chromium
```