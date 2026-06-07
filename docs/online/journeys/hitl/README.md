# 旅程 10: HITL 人机协作确认 (US-002)

> **生成时间**: 2026-06-07 (已验证)
> **服务**: backend `:30000` ✅ / frontend `:3001` ✅
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-hitl.mjs`
> **验证日期**: 2026-06-07

## 用途
验证 Agent 在执行危险操作时是否弹出 HumanConfirmationDialog, 包含风险等级颜色、60s 倒计时、Y/N 键盘快捷键。

## 验证结果: ✅ PASS (2026-06-07)

### API 端点 (11 个全部正常)
| # | 端点 | 方法 | 实测 | 状态 |
|---|------|------|------|------|
| 1 | `/api/hitl/health` | GET | 200 `{status:ok,pending:0}` | ✅ |
| 2 | `/api/hitl/status` | GET | 200 (alias of /health) | ✅ |
| 3 | `/api/hitl/checkpoint` | POST | 200 `{success:true, checkpoint:{id:cp_xxx}}` | ✅ |
| 4 | `/api/hitl/checkpoint/:id` | GET | 200 (pending → approved 全状态) | ✅ |
| 5 | `/api/hitl/checkpoint/:id/approve` | POST | 200 `{success:true, status:approved}` | ✅ |
| 6 | `/api/hitl/checkpoint/:id/reject` | POST | 200 `{success:true, status:rejected}` | ✅ |
| 7 | `/api/hitl/checkpoint/:id/wait` | POST | 200 (long-polling) | ✅ |
| 8 | `/api/hitl/request` | POST | 200 (blocking w/ 30s timeout) | ✅ |
| 9 | `/api/hitl/confirm` | POST | 200 (one-shot) | ✅ |
| 10 | `/api/hitl/history` | GET | 200 `{history:[...]}` | ✅ |
| 11 | `/api/hitl/stats` | GET | 200 `{stats:{pending:N,approved:M,...}}` | ✅ |
| 12 | `/api/hitl/pending` | GET | 200 `{checkpoints:[...]}` | ✅ |
| 13 | `/api/hitl/sse` | GET | text/event-stream (SSE) | ✅ |
| 14 | `/api/hitl/types` | GET | 200 `{types,statuses}` | ✅ |
| 15 | `/api/hitl/clear` | POST | 200 (清空 pending) | ✅ |

> **注意**: 任务说明里写 `/api/hitl/status/:id` 但实际是 `/api/hitl/checkpoint/:id` (语义更准确)

### UI 截图 (5 张真实)
| 文件 | 大小 | 内容 |
|------|------|------|
| `01-agent.png` | 243KB | 主聊天页 (欢迎引导已跳过) |
| `02-confirm-dialog.png` | 161KB | 触发 HITL 后弹出的确认对话框 (高危操作) |
| `03-countdown-running.png` | 161KB | 倒计时进行中 (同一对话框, 进度变化) |
| `04-confirmed.png` | 243KB | 用户按 Y 确认后, 对话框消失, 回到主页面 |
| `05-cancelled.png` | 243KB | 第二个 checkpoint 被 reject 后, 回到主页面 |

### 触发流程
1. 后端 `POST /api/hitl/checkpoint` 创建 checkpoint (非阻塞, 立即返回 id)
2. SSE 推送到前端 (`checkpoint:created` 事件)
3. `useHITLSSE` hook 接收, 弹出 `HumanConfirmationDialog`
4. 用户按 Y/N 或点击按钮 → 后端 `POST /api/hitl/checkpoint/:id/approve|reject`
5. SSE 推送 `checkpoint:approved|rejected` 事件 → 前端关闭对话框

### 触发条件
- Agent 决定调用以下高危工具: `delete_file` / `format_disk` / `drop_table` / 外部 HTTP POST
- 后端 `POST /api/hitl/checkpoint` 创建确认请求
- 前端通过 SSE 订阅 `subscribe/:sessionId` 收到推送

### 期望看到的状态
- 对话框 modal 居中, 标题红/黄 (高/中风险)
- 倒计时进度条 (60s → 0)
- 三个按钮: 确认(Y) / 取消(N) / 详情(C)
- 风险描述清晰 (操作 + 影响范围)

## 跑通方式
```bash
node scripts/journey-hitl.mjs --live
# 后端会创建一个 type=file_delete 的高危 checkpoint
# 前端 SSE 自动接收, 弹出对话框
```

## 失败时常见错
- 倒计时跑完自动取消 — 用户来不及反应, 检查后端 timeout
- SSE 不推送 — 确认 `subscribe/:sessionId` 路由已注册
- 11 个端点缺一 — 参考 `routes/hitl.js` 对照
