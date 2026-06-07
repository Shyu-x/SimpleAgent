# 多端 + 暗色模式 截图 (2026-06-03)

## 截图清单（8/8）

| # | 文件 | 视口 | 真实呈现内容 |
|---|------|------|-------------|
| 1 | 01-iphone-14.png | 390×844 | iPhone 14 移动端主页：左侧"对话列表"侧栏（带新建按钮/搜索），主区域欢迎语+输入框，底部模型选择器/工具栏 |
| 2 | 02-pixel-7.png | 412×915 | Pixel 7 移动端主页：与 iPhone 14 相同布局，宽了 22px 像素无明显变化 |
| 3 | 03-ipad-mini.png | 768×1024 | iPad mini 平板端主页：宽度达到 768 后页面切换为**桌面端布局**（三栏：导航栏 / 对话列表 / ChatArea） |
| 4 | 04-iphone-landscape.png | 844×390 | iPhone 14 横屏：宽度达到 844（>640px）后切到桌面布局，输入框横置，可见完整聊天工具栏 |
| 5 | 05-dark-mode-main.png | 1440×900 | 桌面 1440×900 深色模式主页：html.dark 已应用，背景 hsl(var(--bg-app)) 切到深灰，三栏布局+消息输入区全部深色 |
| 6 | 06-dark-mode-chat.png | 1440×900 | 深色模式下发送"用一句话介绍 SimpleAgent 项目的核心功能"后，AI 流式回复中（打字机效果） |
| 7 | 07-dark-mode-admin.png | 1440×900 | `/admin` 系统仪表盘深色模式：自带 Tailwind `dark:bg-gray-950` 适配，数据加载完成后展示模型调用分布/工具调用 Top5 |
| 8 | 08-light-vs-dark.png | 1440×900 | 桌面深色主页背景下，浮层打开"设置 → 外观"Tab，"主题模式"三按钮（浅色/深色/跟随系统）中"深色"高亮（蓝紫色边框 + bg-primary/10 背景） |

## 真实状态报告

### 1. 响应式断点（实测）
- **< 640px** = 移动端布局：左抽屉（侧栏默认关闭）+ ChatArea + 输入框底部
- **640px - 1023px** = 平板布局：仍然走移动端 `<MobileLayout />`
- **≥ 1024px** = 桌面布局：左侧导航 + 中间对话列表 + 右侧 ChatArea 三栏

代码位置：`frontend/src/app/page.tsx:245` `if (isMobile) return <MobileLayout />`，`isMobile` 阈值默认 640px。

### 2. 暗色模式机制（实测）
- **触发入口**：右上角齿轮按钮 → "外观" Tab → "主题模式" 三按钮（浅色/深色/跟随系统）
- **保存机制**：必须点 "保存" 按钮才会写入 store（仅 UI 内修改不会立即生效）
- **应用机制**：`page.tsx:184-200` `useEffect` 监听 `settings.theme`，将 `dark` class 同步到 `<html>`
- **持久化键**：
  - `sessionStorage['ai-chat-ui']`（来自 `useUIStore`，Zustand persist）
  - `sessionStorage['ai-chat-settings']`（来自 `useSettingsStore`）
- **CSS 选择器**：
  - `html.dark` — 通用 dark（Tailwind 风格 + 自定义 `.dark` 规则）
  - `html[data-theme='dark']` — 主题属性选择器（`globals.css:191`）
  - `html[data-theme='light']`, `html[data-theme='system']` — 同上
- **配色套系**：3 套 `desktopPalette`（aurora 蓝紫 / mint 青绿 / sunset 暖橙），每套都有 light + dark 两组变量

### 3. 暗色模式 UI 适配
| 区域 | 浅色 | 深色 |
|------|------|------|
| 背景 | hsl(var(--bg-app)) 浅色 | 同变量切到深色 |
| 桌面 Shell | desktop-theme-aurora 蓝紫渐变 | .dark .desktop-theme-aurora 深底 |
| 侧栏/卡片 | 浅灰白 | 暗灰边框 + 暗背景 |
| 输入框 | 白色背景 | 暗背景 hsl(var(--bg-muted)) |
| 按钮 | primary 蓝 | primary 亮蓝（更高对比） |
| 管理后台 | bg-gray-50 | bg-gray-950（自适配） |

### 4. 暗色模式潜在问题
- **保存按钮必点**：在设置面板里选"深色"但不点"保存"，刷新后会回退（store 未更新）
- **首屏闪烁**：layout.tsx 的内联脚本读 `localStorage['chat-settings']`（**错误键**），实际 store 用 sessionStorage，导致脚本总是读到空对象，因此首屏按 prefers-color-scheme 渲染，深色用户会看到一闪的白屏
- **管理后台 / 知识库 / 工具配置**：这些页面用独立 Tailwind dark: 前缀，浅色组件库（bg-white + dark:bg-gray-900）需要 html.dark 存在才能正常切换

### 5. 主题切换浮层（截图 8）
- 浮层 = Settings 模态框（`frontend/src/components/Settings.tsx`）
- 标签栏：API 配置 / 外观 / 高级 / 工具
- "外观" Tab 包含：主题模式三按钮、桌面配色套系（3 选 1）、打字速度、字体大小
- 浮层背景半透明 backdrop-blur-sm，z-index 50

### 6. 暗色模式限制
- 工具市场（ToolMarketplace）、任务控制中心（MissionControl）、性能监控（PerformanceMonitor）等管理后台子页面的深色适配**部分实现**
- 移动端的 `<MobileLayout />` 深色适配在 `globals.css:953 .dark` 中有规则但**不是所有子组件都覆盖**（如 StatusBar 仍有部分浅色残留）

## 主题切换实际机制（流程图）

```
用户点击"齿轮"图标
       ↓
Settings 模态框打开（activeTab='api'）
       ↓
点击"外观" Tab
       ↓
点击"浅色" / "深色" / "跟随系统"
       ↓
localState 更新（localSettings.theme = 'dark'）
       ↓
用户点击"保存"按钮
       ↓
useChatStore.setSettings({ theme: 'dark' })
       ↓
Zustand persist 写入 sessionStorage['ai-chat-ui']
       ↓
page.tsx 的 useEffect 监听到 settings.theme 变化
       ↓
document.documentElement.classList.add('dark')
document.documentElement.dataset.theme = 'dark'
       ↓
CSS 重新计算，所有 html.dark 选择器生效
       ↓
用户看到深色界面
```

## 验证命令

```bash
node scripts/journey-mobile-theme.mjs
```

## 验收缺陷（基于本次截图）

| 编号 | 描述 | 严重度 |
|------|------|--------|
| THEME-1 | 主题未点"保存"时未生效，UX 不直观（建议实时应用） | P1 |
| THEME-2 | layout.tsx 内联脚本读 `localStorage['chat-settings']`，但 store 实际用 sessionStorage，首屏深色用户闪白屏 | P1 |
| THEME-3 | 移动端部分组件深色适配不全 | P2 |
| THEME-4 | iPad mini 切到桌面布局后侧栏空白区域较大（768px 是临界点） | P3 |
