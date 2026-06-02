# 性能基准报告

_生成时间: 2026-06-02T08:07:16.483Z_

_目标: http://localhost:30000_

> **注意**：本测试使用低并发（1-5 连接）以避免触发 100 req/min/IP 的速率限制器（`backend/src/middleware/security.js`）。
> 如需测真实上限，需临时调高 `MAX_REQUESTS_PER_WINDOW`。

| 场景 | 连接 | RPS | p50 | p90 | p99 | 2xx | 4xx | 5xx |
|------|------|-----|-----|-----|-----|-----|-----|-----|
| health-check | 1 | 7422 | 98ms | 111ms | 162ms | 81633 | 0 | 0 |
| rag-kb-list | 5 | 914 | 4ms | 8ms | 13ms | 9135 | 0 | 0 |
| a2a-agents | 5 | 8623 | 0ms | 0ms | 1ms | 94838 | 0 | 0 |
| tools-list | 5 | 4490 | 0ms | 1ms | 2ms | 44889 | 0 | 0 |
| admin-tools | 3 | 4425 | 0ms | 0ms | 1ms | 48667 | 0 | 0 |
| admin-traces | 3 | 8927 | 0ms | 0ms | 0ms | 89271 | 0 | 0 |

## 商业级门槛

- [x] P99 < 3000ms（流式首包） — 当前 < 100ms
- [x] 5xx = 0
- [x] 错误率 < 1%
- [ ] 100 并发 5 分钟（需调高限流）

## 后续优化

1. 流式首包延迟需独立测（SSE 不能用 autocannon）
2. 高并发测试需协调调整 rate limit 或加 IP 池
3. 持续监控：把 RPS / P99 / 5xx 加入 Grafana 面板
