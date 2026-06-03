# SimpleAgent SSE 流式性能报告

**生成时间**: 2026-06-03T05:09:19.392Z
**目标**: http://localhost:30000
**模型**: MiniMax-M2.7 (通过 Token Plan)

## 结果

| 场景 | 样本 | TTFB P50 | TTFB P95 | TTFB P99 | 总时长 P50 | 总时长 P95 | Token rate |
|------|------|----------|----------|----------|------------|------------|------------|
| 短消息 (自我介绍) | 5 | 3ms | 3ms | 3ms | 1705ms | 1717ms | 7.4 tok/s |
| 长消息 (五言绝句) | 5 | 2ms | 3ms | 3ms | 10285ms | 14594ms | 1.6 tok/s |

## 验收

- TTFB P95 < 800ms: **PASS ✓**
- 总时长 P95 < 30s: **PASS ✓**

## 注

- TTFB = Time To First Byte (从发送到收到首个字节)
- Token rate = chunks/秒 粗略估计 (SSE event 数 / 总时长)
- 跑 5 次取中位数, P95/P99 是 trial 间分布
- DISABLE_RATE_LIMIT=true 时跑 (避免限流影响流式测试)
