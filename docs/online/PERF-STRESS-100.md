# SimpleAgent 100 并发稳定性压测

**生成时间**: 2026-06-03T05:11:35.539Z
**目标**: http://localhost:30000/api/health
**并发**: 100 连接
**时长**: 60s
**前提**: DISABLE_RATE_LIMIT=true 必开（后端未配 trust proxy, 127.0.0.1 单 bucket）

## 结果

| 指标 | 数值 |
|------|------|
| 总请求数 | 238387 |
| 平均 RPS | 3973 |
| 错误数 | 0 |
| 超时数 | 0 |
| 非 2xx | 0 |
| 成功率 | 100.00% |
| P50 延迟 | 24ms |
| P90 延迟 | 28ms |
| P99 延迟 | 47ms |
| 最大延迟 | 113ms |
| 堆内存增长 | 8.1MB |

## 状态码分布

| 状态码 | 次数 |
|--------|------|
| 200 | [object Object] |

## 验收

- 错误率 < 1% (成功率 ≥ 99%): **PASS ✓** (100.00%)
- P99 < 3000ms: **PASS ✓** (47ms)
- 内存增长 < 100MB: **PASS ✓** (8.1MB)

**综合判定: PASS**

## 注

- 后端未配置 trust proxy, 所有请求 req.ip=127.0.0.1 → 同一 rate limit bucket
- 必须 DISABLE_RATE_LIMIT=true, 否则 100 req 在 1s 内全部 429
- 60s 测试足够验证稳定性, 生产建议跑 5min
- 用 /api/health (零依赖), 真实混合负载需用 perf-bench.js
