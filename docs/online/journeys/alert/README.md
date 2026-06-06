# 旅程 15: 告警链路 (MetricsCollector → AlertManager → SSE)

> **生成时间**: 2026-06-07 (骨架)
> **服务**: backend `:30000` ✅ / frontend `:3001` (运行 `--live` 时需要)
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-alert.mjs`

## 用途
验证告警全链路: 指标采集 → 阈值检测 → 告警触发 → SSE 推送 → 前端展示 → 用户确认 → 恢复。

## 关键组件
| 组件 | 文件 | 职责 |
|------|------|------|
| MetricsCollector | `infra/metrics/MetricsCollector.js` | Prometheus 格式指标 |
| AlertManager | `infra/alert/AlertManager.js` | critical/warning/info 三级告警 |
| Alert SSE | `/api/alerts/subscribe/:id` | 实时推送给前端 |

## 触发条件
- 错误率 > 5% (warning) / > 20% (critical)
- P99 延迟 > 3000ms
- 队列堆积 > 1000
- 手动触发: `POST /api/alerts/test`

## 期望看到的状态
- 顶部红色横幅 (critical) / 黄色 (warning)
- 弹窗详情: 触发指标 / 阈值 / 持续时间 / 建议操作
- 告警列表 (历史 + 当前活跃)
- 指标恢复后自动消失

## 真实截图需求 (待主会话/真实用户补)
- [ ] `01-metrics-normal.png` — 正常指标
- [ ] `02-alert-triggered.png` — critical 告警弹出
- [ ] `03-alert-ack.png` — 用户确认
- [ ] `04-alert-recovered.png` — 指标恢复

## 跑通方式
```bash
node scripts/journey-alert.mjs --live
# 触发: curl -X POST http://localhost:30000/api/alerts/test
```

## 失败时常见错
- 告警不弹出 — 检查 SSE 连接 + AlertManager 是否注入到 app.locals
- 告警不消失 — 阈值检测未跑, 检查定时任务
- 颜色错乱 — 检查 critical/warning token (Tailwind)
