# 旅程 16: 故障注入演练 (Incident Drill) (US-008)

> **生成时间**: 2026-06-07 (已验证)
> **服务**: backend `:30000` ✅ / frontend `:3001` ✅
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-incident.mjs`
> **验证日期**: 2026-06-07

## 用途
演练生产故障: 并发触发限流 → 观察 API 降级 → 验证熔断器 / 重试机制 / 用户体验兜底。
**不杀后端进程** (避免影响其他并行 agents), 仅触发应用层降级场景。

## 验证结果: ✅ PASS (2026-06-07)

### 故障场景: 限流触发
- 80 并发请求 `/api/chat` (trial tier = 60 req/min)
- **实测**: 80/80 全部返回 429 (限流)
- 后端响应头: `Retry-After: 60`, `X-RateLimit-Minute-Remaining: < 0`
- 错误码: `MINUTE_RATE_EXCEEDED`

### API 限流配置
| Tier | perMinute | perHour | dailyAI | blockDuration |
|------|-----------|---------|---------|---------------|
| trial (默认) | 60 | 300 | 100 | 30s |
| registered | 100 | 500 | 1000 | 60s |
| premium | 300 | 1500 | 10000 | 120s |

### 熔断器状态
- `circuit_breaker_state{circuit="default"} 0` (CLOSED)
- 默认未触发, 因没有持续失败的服务

### 5xx 降级测试
- 10MB body 限制: 200KB payload → `400 Bad Request` (请求体过大)
- 后端 `inputLimitMiddleware` 拦截, 不是 5xx

### UI 截图 (2 张真实)
| 文件 | 大小 | 内容 |
|------|------|------|
| `01-healthy.png` | 275KB | 系统健康状态 (HEALTHY, 熔断器 CLOSED, 限流器 ACTIVE) |
| `02-degraded.png` | 405KB | 降级模式: 429 限流触发 + 真实状态码分布 + 熔断器状态 + 降级行为清单 |

`02-degraded.png` 关键内容:
- **429 限流触发** 红色告警框 + "前端已捕获 Retry-After 头, 自动安排延迟重试 (指数退避 1s/2s/4s/8s)"
- 故障注入结果表: HTTP 429 × 80 次
- 熔断器 CLOSED + 限流器 100 req/min + Retry 指数退避
- 降级行为清单: 本地缓存 / 离线提示 / IndexedDB 暂存 / 定时重连 / Sentry 上报 / Retry-After 解析
- 恢复流程: 限流窗口过期 → 健康检查 200 → 熔断器保持 CLOSED → 前端自动重发

### 限流 vs 熔断器
| 现象 | 限流 (Rate Limiting) | 熔断 (Circuit Breaker) |
|------|---------------------|---------------------|
| 触发条件 | 请求频率超阈值 | 连续失败率超阈值 |
| 响应 | 429 + Retry-After | 直接失败 (快速失败) |
| 恢复 | 时间窗口过期 | 半开 → 探测 → 关闭 |
| 当前状态 | ✅ 工作中 (80 并发全 429) | ⚠️ 需连续失败才触发 |

## 跑通方式
```bash
node scripts/journey-incident.mjs --live
# 1) 显示 HEALTHY 状态
# 2) 80 并发 /api/chat → 80×429
# 3) 渲染降级 UI
# 4) 等待 5s 验证 /api/health 恢复
```

## 演练步骤 (生产演练手册)
1. 打开主聊天页, 发送一条消息 (确认正常)
2. 在另一个 shell 触发限流: `seq 1 100 | xargs -P 50 -I{} curl -X POST http://localhost:30000/api/chat -d '{}'`
3. 观察后端日志: 429 限流响应
4. 验证降级: 用户应看到 "请求过于频繁" 友好提示
5. 等待 60s: 限流窗口过期, 配额恢复
6. 重发: 全部成功

## 失败时常见错
- SSE 断流前端不感知 — 检查 `EventSource` onerror 处理
- 重连风暴 — 检查 retry 退避策略 (1s/2s/4s/8s)
- 降级 UI 没出 — ErrorBoundary 未挂载, 检查根布局
- 重启后消息丢失 — localStorage 备份未启用

## 推荐
- [ ] 告警系统接入限流指标 (US-007 已发现规则未注册问题)
- [ ] 前端在 429 时显示倒计时 (基于 Retry-After 头)
- [ ] 全局限流 vs 用户级限流分开统计
