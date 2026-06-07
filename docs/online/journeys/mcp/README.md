# 旅程 14: MCP 工具市场

> **生成时间**: 2026-06-07 (骨架)
> **服务**: backend `:30000` ✅ / frontend `:3001` (运行 `--live` 时需要)
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-mcp.mjs`

## 用途
验证 ToolMarketplace 组件: 展示已连接/可连接的 MCP 工具, 用户启用/禁用/配置工具。

## 当前完成度: 40%
- ✅ MCP 连接 (`POST /api/minimax/connect`)
- ✅ 连接状态展示 (`GET /api/minimax/status`)
- ❌ 工具增删改查后端 (TODO: 待补)
- ❌ 工具启用/禁用持久化 (TODO: 待补)

## 触发条件
- 侧边栏 → 工具市场
- 或 `http://localhost:3001/admin/tools`

## 期望看到的状态
- 工具卡片: 名称 / 描述 / MCP server URL / 状态徽章
- 启用 toggle (已连接 = 绿, 未连接 = 灰)
- 详情弹窗: 参数 schema + 描述

## 真实截图需求 (待主会话/真实用户补)
- [ ] `01-marketplace-list.png` — 工具列表
- [ ] `02-tool-detail.png` — 工具详情
- [ ] `03-toggle-enable.png` — 启用 toggle
- [ ] `04-mcp-status.png` — MCP 连接状态

## 跑通方式
```bash
node scripts/journey-mcp.mjs --live
```

## 失败时常见错
- 工具列表为空 — MCP server 未连, 跑 `connect` 端点
- toggle 操作无响应 — 后端 API 缺失 (40% 完成度, 这是预期)
