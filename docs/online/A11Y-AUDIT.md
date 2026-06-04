# A11y 审计报告 (WCAG 2.2 AA)

**工具**: axe-core 4.11.4 + Playwright 1.60
**日期**: 2026-06-04
**目标**: 5 核心页面 · 81 违规节点

## 页面违规统计

| 页面 | URL | 规则 | 节点 |
|------|-----|------|------|
| 主聊天 | `/` | 4 | 16 |
| 管理后台 | `/admin` | 3 | 6 |
| 工具管理 | `/admin/tools` | 3 | 4 |
| 知识库 | `/admin/kb` | 3 | 5 |
| Agent 模式 | `/agent` | 4 | **50** |
| **合计** | - | **8** | **81** |

**严重度**: critical=7, serious=32, moderate=42, minor=0

## Top 8 违规 (按严重度+节点数)

| # | 级别 | 规则 | 节点 | 页数 | 描述 |
|---|------|------|------|------|------|
| 1 | CRITICAL | `button-name` | 4 | 4 | 按钮缺少可识别文字/aria-label |
| 2 | CRITICAL | `select-name` | 3 | 2 | select 元素缺少可访问名 |
| 3 | SERIOUS | `color-contrast` | **30** | 5 | 颜色对比度不达标 (text-slate-500/yellow-600/primary-10) |
| 4 | SERIOUS | `nested-interactive` | 1 | 1 | 交互控件嵌套 (主聊天) |
| 5 | SERIOUS | `scrollable-region-focusable` | 1 | 1 | 滚动区不可键盘聚焦 |
| 6 | MODERATE | `region` | **40** | 2 | 内容未包裹在 landmark 内 |
| 7 | MODERATE | `landmark-one-main` | 1 | 1 | 缺少 `<main>` 元素 |
| 8 | MODERATE | `page-has-heading-one` | 1 | 1 | 缺少 `<h1>` 标题 |

## Top 3 高 ROI 修复

### 1. Agent 页面结构补全 (修 42 节点, ~30 行代码)
`/agent/page.tsx` 缺少 `<main>` 与 `<h1>`, 导致 40 个 region + 1 landmark + 1 h1 违规。
```tsx
<main>
  <h1 className="sr-only">Agent 控制台</h1>
  <MissionControl ... />
</main>
```

### 2. 全局颜色对比度修复 (30 节点, 1 个 Tailwind 配置)
`text-slate-500` / `text-yellow-600` / `bg-primary/10` 在浅色背景对比度 < 4.5:1。
在 `tailwind.config.ts` 调暗这些 token (`slate-500` → `slate-700`, `yellow-600` → `yellow-800`)。

### 3. 图标按钮 + Select 加 label (7 critical, 1 次扫描)
为 `Menu/X/Settings` 等图标按钮添加 `aria-label`, 为 admin 表格的 select 包裹 `<label>` 或加 `aria-label`。
涉及: `app/page.tsx`、各 admin 页面 table 组件。

## 完整审计脚本
`scripts/a11y-audit.mjs` — 可重复运行 `node scripts/a11y-audit.mjs`。
