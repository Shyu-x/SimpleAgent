# 旅程 9: 登录 / API Key 入口

> **生成时间**: 2026-06-07 (骨架)
> **服务**: backend `:30000` ✅ / frontend `:3001` (运行 `--live` 时需要)
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-login.mjs`

## 用途
验证主聊天页是否暴露 API Key 输入框 / 登录入口, 以及无 Key 时是否给出友好引导。

## 触发条件
- 首次访问 `http://localhost:3001` (无 localStorage 中的 `apiKey`)
- 用户点击右上角齿轮 → 设置 → API Key

## 期望看到的状态
- 输入框可见且 placeholder 提示 MiniMax / Anthropic
- "保存" 按钮可点, 写入后页面自动 reload 或显示已登录态
- 无 Key 时欢迎指南 (WelcomeGuide) 给出引导

## 真实截图需求 (待主会话/真实用户补)
- [ ] `01-first-visit.png` — 首次访问 (无 Key)
- [ ] `02-settings-panel.png` — 设置面板中的 Key 输入
- [ ] `03-key-saved.png` — 保存后状态

## 跑通方式
```bash
# 仅占位 (frontend 可不在线)
node scripts/journey-login.mjs

# 真实截图 (需 frontend :3001)
node scripts/journey-login.mjs --live
```

## 失败时常见错
- `ERR_CONNECTION_REFUSED :3001` — frontend 没启, 用 dry-run
- 输入框 selector 找不到 — 检查 frontend 是否升级过 settings 组件
