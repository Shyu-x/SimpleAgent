# 旅程 10: HITL 人机协作确认

> **生成时间**: 2026-06-07 (骨架)
> **服务**: backend `:30000` ✅ / frontend `:3001` (运行 `--live` 时需要)
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-hitl.mjs`

## 用途
验证 Agent 在执行危险操作时是否弹出 HumanConfirmationDialog, 包含风险等级颜色、60s 倒计时、Y/N/C 键盘快捷键。

## 触发条件
- Agent 决定调用以下高危工具: `delete_file` / `format_disk` / `drop_table` / 外部 HTTP POST
- 后端 `POST /api/hitl/request` 创建确认请求
- 前端通过 SSE 订阅 `subscribe/:sessionId` 收到推送

## 期望看到的状态
- 对话框 modal 居中, 标题红/黄 (高/中风险)
- 倒计时进度条 (60s → 0)
- 三个按钮: 确认(Y) / 取消(N) / 详情(C)
- 风险描述清晰 (操作 + 影响范围)

## 真实截图需求 (待主会话/真实用户补)
- [ ] `01-confirm-dialog.png` — 弹出确认对话框 (高危红)
- [ ] `02-countdown-running.png` — 倒计时过半
- [ ] `03-confirmed.png` — 用户按 Y 后的执行结果
- [ ] `04-cancelled.png` — 用户按 N 后的取消结果

## 跑通方式
```bash
node scripts/journey-hitl.mjs --live
# 在主聊天页输入: "删除 /tmp/test.txt 文件"
```

## 失败时常见错
- 倒计时跑完自动取消 — 用户来不及反应, 检查后端 timeout
- SSE 不推送 — 确认 `subscribe/:sessionId` 路由已注册
- 11 个端点缺一 — 参考 `routes/hitl.js` 对照
