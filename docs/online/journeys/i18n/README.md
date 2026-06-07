# 旅程 13: i18n 中英切换

> **生成时间**: 2026-06-07 (骨架)
> **服务**: backend `:30000` ✅ / frontend `:3001` (运行 `--live` 时需要)
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-i18n.mjs`

## 用途
验证 Wave 8.2 后国际化支持: 用户在右上角切换 zh-CN / en-US, 主聊天页 + 侧边栏 + 设置面板文案全部跟随。

## 触发条件
- 右上角语言切换器 (`aria-label="language switcher"`)
- 选择目标语言后, React Context 触发 re-render
- 偏好持久化到 localStorage (`simpleagent.locale`)

## 期望看到的状态
- 切换瞬间无白屏 (无 hydration mismatch)
- 所有可见文案都跟随 (无硬编码 "新建对话" / "New Chat" 残漏)
- 数字/日期格式本地化 (千分位 / 12h/24h)

## 真实截图需求 (待主会话/真实用户补)
- [ ] `01-zh-main.png` — 中文主聊天页
- [ ] `02-zh-sidebar.png` — 中文侧边栏
- [ ] `03-en-main.png` — 英文主聊天页
- [ ] `04-en-settings.png` — 英文设置面板
- [ ] `05-zh-admin.png` — 中文管理后台 (若支持)

## 跑通方式
```bash
node scripts/journey-i18n.mjs --live
# 切换器: 点击右上角地球图标 -> 选择 English
```

## 失败时常见错
- 切换后部分文案没变 — 找硬编码: `grep -r '新建对话' frontend/src/`
- 报 hydration mismatch — 检查 `useTranslation` 是否在 SSR-safe 位置调用
- 语言切换不持久化 — 检查 localStorage key
