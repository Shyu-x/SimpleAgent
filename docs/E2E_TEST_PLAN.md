# 全界面自动化测试方案

> AI Chat 玩具 - 端到端测试文档
> 更新日期: 2026-03-19

## 概述

本测试方案采用 Playwright 进行浏览器自动化测试，结合 Minimax Vision MCP 进行截图分析，实现全界面自动化测试。

## 测试架构

```
┌─────────────────────────────────────────────────────────────┐
│                    测试运行器 (Test Runner)                   │
│                      full-interface-test.js                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│   Playwright  │ │ Vision   │ │   Test      │
│   浏览器控制  │ │ Analyzer │ │   Reporter  │
│              │ │ (MCP)   │ │             │
└──────────────┘ └──────────┘ └──────────────┘
        │             │             │
        ▼             ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│  Chromium    │ │ Minimax  │ │ HTML/JSON   │
│  Firefox     │ │ Vision   │ │ 测试报告    │
│  Webkit      │ │ API      │ │             │
└──────────────┘ └──────────┘ └──────────────┘
```

## 测试类型

### 1. 功能测试
- [x] 页面加载
- [x] 聊天功能
- [x] 侧边栏
- [x] 设置面板
- [x] 记忆面板
- [x] 知识库

### 2. 高级功能测试
- [x] Agent 模式
- [x] 专注模式
- [x] 多窗口
- [x] 思维链可视化
- [x] 联网搜索

### 3. 界面测试
- [x] 响应式布局
- [x] 控制台错误
- [x] 截图分析
- [x] 快捷键

### 4. 移动端测试
- [x] 移动端适配
- [x] 触摸交互
- [x] 底部导航

## 测试用例清单

| 编号 | 测试用例 | 优先级 | 状态 |
|------|---------|--------|------|
| 1 | 页面加载测试 | P0 | ✅ |
| 2 | 侧边栏测试 | P0 | ✅ |
| 3 | 聊天功能测试 | P0 | ✅ |
| 4 | 多窗口测试 | P1 | ✅ |
| 5 | 专注模式测试 | P1 | ✅ |
| 6 | 设置面板测试 | P1 | ✅ |
| 7 | 记忆面板测试 | P2 | ✅ |
| 8 | Agent 模式测试 | P1 | ✅ |
| 9 | 知识库测试 | P2 | ✅ |
| 10 | 移动端适配测试 | P1 | ✅ |
| 11 | 联网搜索测试 | P2 | ✅ |
| 12 | 思维链可视化测试 | P2 | ✅ |
| 13 | 快捷键测试 | P2 | ✅ |
| 14 | 响应式布局测试 | P1 | ✅ |
| 15 | 控制台错误检测 | P1 | ✅ |

## 运行方式

### 方式一: 自定义测试运行器 (推荐)

```bash
# 安装依赖
npm install playwright

# 配置环境变量
export MINIMAX_API_KEY=your_api_key  # 可选，用于视觉分析
export TEST_BASE_URL=http://localhost:5173
export TEST_BACKEND_URL=http://localhost:30000
export BROWSER=chromium  # chromium, firefox, webkit

# 运行测试
node tests/e2e/full-interface-test.js
```

### 方式二: Playwright Test

```bash
# 安装 Playwright 浏览器
npx playwright install chromium

# 运行所有测试
npx playwright test

# 运行特定测试文件
npx playwright test tests/e2e/chat.spec.ts

# UI 模式运行
npx playwright test --ui

# 有头模式 (显示浏览器)
npx playwright test --headed

# 移动端测试
npx playwright test --project="Mobile Chrome"
```

### 方式三: Docker 运行

```bash
# 启动测试容器
docker-compose -f docker-compose.test.yml up

# 查看测试报告
open test-results/html/index.html
```

## 测试报告

### 输出格式

1. **JSON 报告**: `test-results/test-report-{timestamp}.json`
2. **HTML 报告**: `test-results/test-report-{timestamp}.html`
3. **截图**: `test-results/screenshots/*.png`
4. **视频**: `test-results/videos/*.webm` (失败时)

### 报告内容

```json
{
  "summary": {
    "total": 15,
    "passed": 12,
    "failed": 2,
    "warnings": 1,
    "duration": "120s"
  },
  "results": [
    {
      "name": "页面加载",
      "status": "passed",
      "screenshot": "test-results/screenshots/page-load-xxx.png",
      "analysis": {
        "status": "pass",
        "anomalies": []
      }
    }
  ]
}
```

## Minimax Vision MCP 集成

### 配置

```bash
export MINIMAX_API_KEY=your_api_key
```

### 分析内容

视觉分析检测以下异常类型：

1. **布局问题**
   - 元素重叠
   - 错位
   - 溢出
   - 缺失

2. **样式问题**
   - 颜色异常
   - 字体问题
   - 动画卡顿

3. **交互问题**
   - 按钮不可点击
   - 输入框无法输入

4. **内容问题**
   - 文字乱码
   - 图标缺失
   - 显示异常

5. **错误提示**
   - 控制台错误
   - 网络请求失败
   - API 异常

### 返回格式

```json
{
  "status": "pass" | "warning" | "fail",
  "anomalies": [
    {
      "type": "layout" | "style" | "interaction" | "content" | "error",
      "severity": "critical" | "major" | "minor",
      "description": "问题描述",
      "location": "元素位置描述",
      "suggestion": "修复建议"
    }
  ],
  "overall": "整体评价"
}
```

## 测试环境要求

### 前置条件

1. **Node.js** >= 18.x
2. **npm** >= 9.x
3. **Playwright** 最新版
4. **服务运行**:
   - 前端: `http://localhost:5173`
   - 后端: `http://localhost:30000`

### 可选

1. **Minimax API Key** - 用于视觉分析
2. **PostgreSQL** - 用于数据持久化测试
3. **Redis** - 用于缓存测试

## 测试覆盖

### 页面结构

```
┌──────────────────────────────────────────────────────────┐
│ Header                                                   │
│ [菜单] [标题] [布局] [模式] [专注] [面板按钮组]          │
├──────────┬───────────────────────────────────────────────┤
│ Sidebar │ Main Content                                  │
│          │                                               │
│ [对话1] │  ┌─────────────────────────────────────────┐  │
│ [对话2] │  │                                         │  │
│ [对话3] │  │         ChatArea / AgentWorkspace       │  │
│          │  │                                         │  │
│          │  │  ┌─────────────────────────────────┐   │  │
│          │  │  │        ThinkingChain            │   │  │
│          │  │  └─────────────────────────────────┘   │  │
│          │  │                                         │  │
│          │  └─────────────────────────────────────────┘  │
│          │                                               │
│          │  ┌─────────────────────────────────────────┐  │
│          │  │            ChatInput                    │  │
│          │  └─────────────────────────────────────────┘  │
└──────────┴───────────────────────────────────────────────┘
```

### 测试点

| 区域 | 测试点 | 方法 |
|------|--------|------|
| Header | 标题显示 | 文本断言 |
| Header | 模式切换 | 点击 + 截图分析 |
| Header | 专注模式 | 截图对比 |
| Sidebar | 对话列表 | 数量断言 |
| Sidebar | 新建对话 | 点击 + 状态检查 |
| Sidebar | 切换对话 | 点击 + 内容检查 |
| ChatArea | 消息显示 | 选择器检查 |
| ChatArea | Markdown | 代码块检查 |
| ChatArea | 思维链 | 元素存在检查 |
| ChatInput | 输入功能 | 填充 + 值断言 |
| ChatInput | 发送功能 | 点击 + 等待回复 |
| Settings | 面板打开 | 可见性断言 |
| Settings | 配置项 | 数量检查 |
| Agent | 工作区 | Tab 检查 |
| Agent | 执行面板 | 元素检查 |
| Focus | 全屏 | 截图分析 |
| Responsive | 多视口 | 布局检查 |

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

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Start services
        run: |
          docker-compose up -d
          sleep 10

      - name: Run tests
        run: npx playwright test

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: test-results/
```

### 本地 CI

```bash
# 运行完整测试
make test-e2e

# 生成报告
make test-report
```

## 故障排查

### 常见问题

1. **页面加载超时**
   - 检查服务是否运行: `curl http://localhost:5173`
   - 增加超时时间

2. **元素未找到**
   - 使用 `page.pause()` 调试
   - 检查选择器是否正确

3. **截图失败**
   - 检查目录权限
   - 确保路径存在

4. **视觉分析失败**
   - 检查 API Key 配置
   - 查看网络请求

### 调试模式

```bash
# 暂停模式
DEBUG=pw:* npx playwright test

# 逐步执行
npx playwright test --ui

# 保留失败截图
npx playwright test --screenshot=always
```

## 持续改进

### 添加新测试

1. 在 `tests/e2e/` 创建新的 `.spec.ts` 文件
2. 使用 `test()` 和 `expect()` 编写测试
3. 更新本文档的测试用例清单

### 优化截图分析

1. 调整 Minimax Vision 提示词
2. 自定义异常检测规则
3. 添加特定场景的分析

## 附录

### 选择器参考

```typescript
// 常见选择器
page.locator('button:has-text("发送")')
page.locator('[class*="sidebar"]')
page.locator('aside')
page.locator('header')
page.locator('[role="tab"]')
page.locator('textarea')
page.locator('input[type="text"]')
```

### 等待策略

```typescript
// 等待元素可见
await expect(locator).toBeVisible()

// 等待元素消失
await expect(locator).toBeHidden()

// 等待元素包含文本
await expect(locator).toContainText('Hello')

// 等待元素有值
await expect(locator).toHaveValue('text')

// 等待网络空闲
await page.waitForLoadState('networkidle')
```

### 测试数据

```typescript
const TEST_MESSAGES = [
  '你好',
  '请介绍一下自己',
  '写一首关于春天的诗',
  '分析一下为什么人工智能很重要',
];

const TEST_INTENTS = [
  { text: '搜索今天天气', intent: 'search' },
  { text: '帮我写代码', intent: 'tool_use' },
  { text: '解释什么是机器学习', intent: 'knowledge' },
];
```
