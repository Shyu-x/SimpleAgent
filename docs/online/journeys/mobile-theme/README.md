# 多端 + 暗色模式 截图 (2026-06-03)

## 截图清单（8/8）

| # | 文件 | 视口 | 真实呈现内容 |
|---|------|------|-------------|
| 1 | 01-iphone-14.png | 390×844 | iPhone 14 移动端主页：顶部"新对话 / 移动端会话"标题栏（+ 新建 / 齿轮），中央 logo + "开始新对话"欢迎语 + 4 张提示卡（快速查询/信息整理/写作支持/方案评审），底部输入框 + 4 标签栏（对话/Agent/记忆/历史） |
| 2 | 02-pixel-7.png | 412×915 | Pixel 7 移动端主页：与 iPhone 14 相同布局，仅宽 22px，元素无视觉差异 |
| 3 | 03-ipad-mini.png | 768×1024 | iPad mini 平板：宽度 768 触发**桌面布局**（isMobile 阈值 640px），呈现三栏 — 左"对话历史"侧栏 / 中间"新对话"输入区 / 右"图片生成"快捷入口（猜测），含完整桌面 Header（Agent/管理后台/工具栏） |
| 4 | 04-iphone-landscape.png | 844×390 | iPhone 14 横屏：宽度 844 也触发桌面布局，三栏压缩成横向条，侧栏 + 极薄主区（输入框几乎贴边），桌面 Header 一字排开 |
| 5 | 05-dark-mode-main.png | 1440×900 | 桌面深色模式主页：html.dark 已应用，深色背景 + 蓝紫渐变 + 桌面 Header + 侧栏 + 主区欢迎语，深色主题 CSS 变量已生效 |
| 6 | 06-dark-mode-chat.png | 1440×900 | 深色模式下用户消息"用一句话介绍 SimpleAgent 项目的核心功能" + AI 流式回复"SimpleAgent 是一款..."，深色气泡/深色背景 |
| 7 | 07-dark-mode-admin.png | 1440×900 | `/admin` 系统仪表盘深色模式：左侧"管理后台"导航栏（仪表盘/知识库/工具管理/模型配置/Prompt模板/链路追踪），主区域 4 张统计卡（总请求数 315032 / 成功率 100% / 平均延迟 0ms / 活跃会话 0）+ 知识库状态表 |
| 8 | 08-light-vs-dark.png | 390×844 | **（视口偏离 1440x900，见注）** 移动端深色模式 + 主题切换面板：深色背景下"设置 / 移动端工作区"标题 + "主题"卡片（浅色/深色/系统三按钮，"深色"高亮蓝紫边框）+ "桌面配色"卡片（极光/薄荷/落日三选一，"极光"高亮）+ "动画"开关 |

## 真实状态报告

### 1. 响应式断点（实测）

| 视口 | 触发布局 | 实现位置 |
|------|----------|---------|
| < 640px | 移动端 `<MobileLayout />` | `page.tsx:101 useMediaQuery('(max-width: 640px)')` |
| 640px - 1023px | 移动端（与 < 640px 相同） | 同上 |
| ≥ 1024px | 桌面三栏布局 | `page.tsx:267+` |

- iPhone 14 (390x844)、Pixel 7 (412x915) → 移动布局
- iPad mini (768x1024) → 桌面布局（768 > 640 阈值）
- iPhone 横屏 (844x390) → 桌面布局

### 2. 暗色模式机制（实测）

#### 触发入口
- **桌面端**（≥ 1024px）：Header 右侧齿轮按钮（`title="设置"`）→ 但**当前无法打开弹窗**（见 §6 BUG-1）
- **移动端**（< 640px）：Header 右上角齿轮（`aria-label="设置"`）→ 切换到 `MobileSettingsView` 页面 → 主题三按钮**实时生效**（无需保存）

#### 应用机制
- `page.tsx:184-200` `useEffect` 监听 `settings.theme` 变化
- 调用 `document.documentElement.classList.add/remove('dark')`
- 同时设置 `dataset.theme` 和 `dataset.themeResolved`（'light' / 'dark'）

#### 持久化键
- `sessionStorage['ai-chat-ui']`（来自 `useUIStore` Zustand persist，name=109 行）
- `sessionStorage['ai-chat-settings']`（来自 `useSettingsStore`，name=89 行）
- **注意**：两者都用 sessionStorage，关闭标签页后清空

#### CSS 选择器
- `html.dark` — Tailwind 风格深色（`globals.css:94`）
- `html[data-theme='dark']` — 属性选择器（`globals.css:191`）
- `html[data-theme='light']`, `html[data-theme='system']` — 同样
- `.dark .desktop-theme-aurora` 等 — 配色套系深色变体

#### 配色套系（3 套）
| ID | 名称 | 浅色 | 深色 |
|----|------|------|------|
| aurora | 极光 | 蓝紫 | 蓝紫深底 |
| mint | 薄荷 | 青绿 | 青绿深底 |
| sunset | 落日 | 暖橙 | 暖橙深底 |

### 3. 暗色模式 UI 适配对照

| 区域 | 浅色 | 深色 |
|------|------|------|
| 背景 | `hsl(var(--bg-app))` 浅色 | 同变量切到深色 |
| 桌面 Shell | `desktop-theme-aurora` 蓝紫渐变 | `.dark .desktop-theme-aurora` 深底 |
| 侧栏/卡片 | 浅灰白 | 暗灰边框 + 暗背景 |
| 输入框 | 白色 | `hsl(var(--bg-muted))` 暗背景 |
| 按钮 | primary 蓝 | primary 亮蓝（更高对比） |
| 管理后台 | `bg-gray-50` | `bg-gray-950`（自适配） |
| 移动端 | 同桌面深色 | `globals.css:953` 有 `.dark` 规则但**部分子组件未覆盖** |

### 4. 主题切换实际机制（流程图）

**移动端（实际可用）：**
```
用户点击右上角齿轮（aria-label="设置"）
       ↓
MobileLayout 的 setCurrentView('settings')
       ↓
渲染 <MobileSettingsView />
       ↓
主题三按钮（浅色/深色/系统）— 直接 onClick
       ↓
useChatStore.setSettings({ theme: 'dark' }) — 实时生效
       ↓
Zustand persist 写入 sessionStorage['ai-chat-ui']
       ↓
page.tsx 的 useEffect 监听到 settings.theme 变化
       ↓
document.documentElement.classList.add('dark')
       ↓
CSS 重新计算，所有 html.dark 选择器生效
```

**桌面端（当前已坏，见 BUG-1）：**
```
用户点击 Header 齿轮（title="设置"）
       ↓
setSidePanelContent('settings')
       ↓
渲染 <Settings hideTrigger /> — 触发按钮被隐藏
       ↓
但 isOpen state 永远为 false（autoOpen 没传）
       ↓
模态框 .fixed.inset-0 永远不显示
       ↓
用户在侧栏看到一个空白区域
```

### 5. 截图 8 视口偏离说明

**任务要求**：`08-light-vs-dark.png` 视口 1440×900（桌面）

**实际情况**：
- 桌面端 Settings 模态框当前**无法打开**（BUG-1）
- 实际可用的主题切换是**移动端 MobileSettingsView**（`frontend/src/components/mobile/MobileLayout.tsx:460`）
- 截图改用 **390×844** 移动视口，可展示完整工作的主题切换面板

### 6. 验收缺陷

| 编号 | 描述 | 严重度 | 证据 |
|------|------|--------|------|
| **THEME-1 / BUG-1** | **桌面端设置模态框打不开**：page.tsx:450 渲染 `<Settings hideTrigger />`，但 `hideTrigger=true` 时无按钮可点，`autoOpen` 也未传，导致 `isOpen` 永远为 false。Header 齿轮（`title="设置"`）是死按钮 | P0 | 用户点击 Header 齿轮无任何反应 |
| THEME-2 | **保存按钮必点**：桌面端 Settings 修改主题后必须点"保存"才生效，移动端则实时生效 — 行为不一致 | P1 | Settings.tsx:142 `setSettings(localSettings)` 只在 onClick Save 时执行 |
| THEME-3 | **首屏闪烁（FOUC）**：layout.tsx:30 内联脚本读 `localStorage['chat-settings']`（**错误键**），实际 store 用 sessionStorage，脚本总是读到空对象，首屏按 prefers-color-scheme 渲染 | P1 | layout.tsx:30-44 |
| THEME-4 | **移动端部分组件深色适配不全**：MobileSettingsView 主题/动画/配色都显示深色，但 BottomSheet、StatusBar 等子组件**仍残留浅色** | P2 | globals.css:953 `.dark` 规则不完整 |
| THEME-5 | **管理后台深色需 html.dark**：`/admin` 等独立页面用 `dark:bg-gray-950`，若 html.dark 缺失（layout 脚本失败）这些页面会保持浅色 | P2 | admin/page.tsx:81 |
| THEME-6 | **iPad mini 切到桌面布局后侧栏空白区域较大**（768px 是临界点） | P3 | 03 截图 |

## 7. 截图具体描述

### 01-iphone-14.png（移动端主页）
- 顶部 Header：左侧"消息"图标 + "新对话 / 移动端会话"标题，右侧 + / 齿轮
- 中央：蓝紫渐变 logo + "开始新对话" + "选择一个提示词，或者直接输入你的问题"
- 4 张提示卡：快速查询 / 信息整理 / 写作支持 / 方案评审
- 底部输入框：麦克风 / 文字输入 / 图片 / 发送按钮
- 底部 Tab 栏：对话 / Agent / 记忆 / 历史

### 03-ipad-mini.png（平板→桌面布局）
- **关键点**：768px 宽度已超过 isMobile 阈值 640px，触发桌面布局
- 左侧：对话历史侧栏（带 + 新建 + 搜索 + 1 条对话"新对话"）
- 中间：新对话输入区，模型 MiniMax-M2.7 (旗舰 编程)
- 右侧：图片生成快捷入口（推测）

### 04-iphone-landscape.png（横屏→桌面布局）
- 844x390 视口也触发桌面布局，但高度仅 390px，所有元素被压缩
- 侧栏 + 主区输入框横置，Header 一字排开

### 05-dark-mode-main.png（深色模式主页）
- html.dark 已强制应用
- 背景：深灰渐变（`--bg-app` 深色变量）
- 桌面 Header：Agent/管理后台/工具栏/侧边栏切换按钮都呈深色

### 06-dark-mode-chat.png（深色模式聊天中）
- 用户消息"用一句话介绍 SimpleAgent 项目的核心功能" — 蓝紫气泡（深色模式下更亮）
- AI 回复"SimpleAgent 是一款..." — 浅色气泡，深色背景下
- 输入框深色，工具栏深色

### 07-dark-mode-admin.png（深色模式管理后台）
- 左侧"管理后台 / AI Chat 玩具"侧栏 + 7 个导航项
- 右上"连接中..." + 刷新按钮
- 4 张统计卡：总请求数 315032 / 成功率 100% / 平均延迟 0ms / 活跃会话 0
- 模型调用分布 / 工具调用分布（暂无数据）
- 知识库状态表：损坏的知识库_原始 (2 文档) / test (1) / default (2) / 测试知识库_1775474987342 (0) / 测试KB_1775477737329 (0)

### 08-light-vs-dark.png（移动端主题切换面板）
- 顶部 Header：← 返回 + "设置 / 移动端工作区" + + / 齿轮
- "主题" 卡片：浅色 / 深色（高亮蓝紫边框 + bg-primary/10）/ 系统
- "桌面配色" 卡片：极光（高亮）/ 薄荷 / 落日
- "动画" 开关：开启（蓝色 toggle）
- 整体深色背景

## 8. 验证命令

```bash
# 前置：前端 dev server 运行在 :3001，后端运行在 :30000
node scripts/journey-mobile-theme.mjs
```

## 9. 复现 BUG-1

1. 访问 http://localhost:3001/
2. 视口 ≥ 1024px
3. 点击 Header 右上角齿轮图标（带蓝色光晕的"设置"按钮）
4. **期望**：弹出设置模态框
5. **实际**：侧栏区域显示空白，无任何反应
6. 原因：`page.tsx:450` `<Settings hideTrigger />` + 没传 `autoOpen`
