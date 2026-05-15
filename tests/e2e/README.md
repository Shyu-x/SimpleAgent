# E2E 测试目录

## 目录结构

```
tests/
├── e2e/                          # 端到端测试
│   ├── full-interface-test.js    # 主测试运行器
│   ├── playwright.config.js     # Playwright 配置
│   ├── run-tests.js             # 测试启动脚本
│   ├── page.spec.ts            # 页面测试
│   ├── chat.spec.ts            # 聊天测试
│   ├── sidebar.spec.ts          # 侧边栏测试
│   ├── settings.spec.ts         # 设置测试
│   ├── agent.spec.ts           # Agent 测试
│   ├── focus-mode.spec.ts       # 专注模式测试
│   ├── responsive.spec.ts       # 响应式测试
│   └── README.md               # 本文件
│
├── 量化测试_runner.js           # 后端量化测试
├── 压测_runner.js              # 压力测试
├── 参数评估_runner.js           # 参数评估
├── 测试报告_可视化.html         # 测试报告可视化
├── NLP测试语料集.md            # NLP测试语料
└── 超大规模NLP测试语料集.md     # 大规模测试语料
```

## 快速开始

### 1. 安装依赖

```bash
# 在 frontend 目录安装 Playwright
cd frontend
npm install
npx playwright install chromium
```

### 2. 配置环境变量 (可选)

```bash
export MINIMAX_API_KEY=your_api_key  # 用于视觉分析
export TEST_BASE_URL=http://localhost:3001
export TEST_BACKEND_URL=http://localhost:30000
```

### 3. 启动服务

```bash
# 终端 1: 启动前端
cd frontend && npm run dev

# 终端 2: 启动后端
cd backend && npm run dev
```

### 4. 运行测试

```bash
# 方式一: 自定义测试运行器 (推荐)
node tests/e2e/full-interface-test.js

# 方式二: Playwright Test
cd frontend && npx playwright test

# 方式三: Docker 测试
docker-compose -f docker-compose.test.yml up
```

## 测试覆盖

### 功能测试
- [x] 页面加载
- [x] 聊天功能 (发送消息、接收回复)
- [x] 侧边栏 (对话列表、新建对话)
- [x] 设置面板
- [x] 记忆面板
- [x] 知识库

### 高级功能测试
- [x] Agent 模式 (工作区、Tab 导航)
- [x] 专注模式 (全屏、隐藏侧边栏)
- [x] 多窗口布局
- [x] 思维链可视化
- [x] 联网搜索

### 界面测试
- [x] 响应式布局 (桌面/平板/移动)
- [x] 控制台错误检测
- [x] 截图异常分析 (Minimax Vision)
- [x] 快捷键功能

## 输出报告

### 截图
```
test-results/screenshots/
├── page-load-xxx.png
├── chat-xxx.png
├── sidebar-xxx.png
└── ...
```

### 测试报告
```
test-results/
├── test-report-xxx.json    # JSON 报告
├── test-report-xxx.html    # HTML 报告
├── html/
│   └── index.html          # Playwright 报告
└── screenshots/
    └── *.png              # 截图文件
```

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

## 故障排查

### 服务未启动
```bash
# 检查前端
curl http://localhost:3001

# 检查后端
curl http://localhost:30000/api/health
```

### 浏览器安装失败
```bash
npx playwright install chromium --with-deps
```

### 测试超时
```bash
# 增加超时时间
export PLAYWRIGHT_TIMEOUT=120000
node tests/e2e/full-interface-test.js
```

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

### 自定义分析
编辑 `full-interface-test.js` 中的 `VisionAnalyzer` 类。
