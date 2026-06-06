# 旅程 16: 故障注入演练 (Incident Drill)

> **生成时间**: 2026-06-07 (骨架)
> **服务**: backend `:30000` ✅ / frontend `:3001` (运行 `--live` 时需要)
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-incident.mjs`

## 用途
演练生产故障: kill backend → 前端 SSE 断流 → 降级 UI (本地缓存 + 错误横幅) → 重启后端 → 自动重连。

## 演练步骤
1. 打开主聊天页, 发送一条消息 (确认正常)
2. 在另一个 shell 杀掉 backend: `pkill -f node.*backend` 或 `pm2 stop ai-chat-backend`
3. 观察前端: SSE 应在 5s 内断流, 顶部出现 "连接已断开" 横幅
4. 验证降级: 历史消息仍可滚动, 工具按钮禁用
5. 重启 backend: `pm2 start ai-chat-backend`
6. 观察前端: 自动重连 + "已恢复" 提示

## 期望看到的状态
- 断流时: 灰色横幅 + 重连 spinner + 禁用输入
- 降级时: 消息历史可读, 工具调用入口置灰
- 重连后: 横幅消失, 输入恢复, 可发新消息

## 真实截图需求 (待主会话/真实用户补)
- [ ] `01-before.png` — 故障前正常
- [ ] `02-disconnected.png` — SSE 断流
- [ ] `03-degraded.png` — 降级 UI
- [ ] `04-reconnected.png` — 重连中
- [ ] `05-recovered.png` — 完全恢复

## 跑通方式
```bash
# Terminal 1
node scripts/journey-incident.mjs --live

# Terminal 2 (演练中)
pkill -f 'node.*backend' && sleep 30 && pm2 start ai-chat-backend
```

## 失败时常见错
- SSE 断流前端不感知 — 检查 `EventSource` onerror 处理
- 重连风暴 — 检查 retry 退避策略 (1s/2s/4s/8s)
- 降级 UI 没出 — ErrorBoundary 未挂载, 检查根布局
- 重启后消息丢失 — localStorage 备份未启用
