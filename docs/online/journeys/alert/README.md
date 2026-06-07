# 旅程 15: 告警链路 (MetricsCollector → AlertManager → SSE) (US-007)

> **生成时间**: 2026-06-07 (已验证)
> **服务**: backend `:30000` ✅ / frontend `:3001` ✅
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-alert.mjs`
> **验证日期**: 2026-06-07

## 用途
验证告警全链路: 指标采集 → 阈值检测 → 告警触发 → SSE 推送 → 前端展示 → 用户确认 → 恢复。

## 验证结果: ⚠️ PARTIAL (2026-06-07)

### API 端点
| 端点 | 方法 | 实测 | 状态 |
|------|------|------|------|
| `/api/alerts` | GET | 200 `{success:true, data:[]}` | ✅ |
| `/api/alerts/critical` | GET | 200 `{data:[]}` | ✅ |
| `/api/alerts/warning` | GET | 200 `{data:[]}` | ✅ |
| `/api/alerts/:id` | DELETE | 200 (解决告警) | ✅ |
| `/api/alerts` | DELETE | 200 (清除已解决) | ✅ |
| `/api/admin/stats` | GET | 200 (2694 请求, 100% 成功率) | ✅ |
| `/metrics` | GET | 200 (Prometheus 格式) | ✅ |

### 关键发现: 默认告警规则未注册 ⚠️

**问题**: `MetricsCollector` 内部实现了完整的告警规则管理 (registerAlertRule / _checkAlerts / _createAlert), **但后端启动时未注册任何默认规则**.

**证据**:
- `grep -r "registerAlertRule" backend/src/` 命中 0 处 (除 MetricsCollector 自身定义)
- `grep -r "registerRule" backend/src/` 命中 0 处
- `GET /api/alerts` 永远返回 `data: []`
- 实际 dashboard 显示 "当前无活跃告警 - 系统未注册告警规则, 需要在 backend/src/infra/metrics/MetricsCollector.js 中调用 registerAlertRule() 注册"

**影响**:
- 用户故事 US-007 验收标准 "Prometheus 告警规则命中" 无法自动达成
- US-008 故障注入产生的高错误率不会自动触发告警
- 告警中心 UI 永远是空状态

**推荐修复** (P1, 独立 commit):
```javascript
// 在 backend/src/index.js (getMetricsCollector() 之后) 添加:
const { getAlertManager } = require('./infra/alert');
const alertManager = getAlertManager();
alertManager.attachMetricsCollector(metricsCollector);

// 注册 5 条默认告警规则
metricsCollector.registerAlertRule({
  id: 'high-error-rate-critical',
  name: 'High Error Rate (Critical)',
  description: 'HTTP 5xx 错误率超过 20%',
  level: 'critical',
  metric: 'http_requests_total',
  condition: '>',
  threshold: 100,  // 简单版本: 5xx 数量 > 100 触发
  duration: 60000,
  labels: { status: '5xx' }
});
metricsCollector.registerAlertRule({
  id: 'high-error-rate-warning',
  name: 'High Error Rate (Warning)',
  description: 'HTTP 5xx 错误率超过 5%',
  level: 'warning',
  metric: 'http_requests_total',
  condition: '>',
  threshold: 50,
  duration: 30000,
  labels: { status: '5xx' }
});
// ... 慢响应 / 高并发 / 队列堆积等
```

### 关键组件
| 组件 | 文件 | 状态 |
|------|------|------|
| MetricsCollector | `infra/metrics/MetricsCollector.js` (1436行) | ✅ 实现完整 |
| AlertManager | `infra/alert/AlertManager.js` (999行) | ✅ 实现完整, 但未注入 |
| 告警 API | `routes/alerts.js` (117行) | ✅ 5 个端点 |
| Prometheus | `infra/monitoring/prometheus.service.js` | ✅ 工作中 |
| 默认规则注入 | (缺失) | ❌ 启动时未注册 |

### UI 截图 (2 张)
| 文件 | 大小 | 内容 |
|------|------|------|
| `01-metrics-prom.png` | 301KB | Prometheus 原始指标文本 |
| `02-metrics-dashboard.png` | 230KB | 业务指标可视化 (QPS, 错误率, 告警) |

Dashboard 显示真实数据:
- 总请求数 2,694 / 成功率 100% / 平均延迟 0.0ms
- API 端点 QPS Top 8 (含 /api/admin/tools/categories 589, /api/admin/knowledge/stats 227, /api/chat 61 等)
- 错误率分布: 161 HTTP 200 + 913 HTTP 304
- 活跃告警: **OK 当前无活跃告警** + 提示"系统未注册告警规则"

## 跑通方式
```bash
node scripts/journey-alert.mjs --live
# 拉取 /metrics, /api/admin/stats, /api/alerts 渲染 dashboard
```

## 失败时常见错
- 告警不弹出 — 检查 SSE 连接 + AlertManager 是否注入到 app.locals
- 告警不消失 — 阈值检测未跑, 检查定时任务
- 颜色错乱 — 检查 critical/warning token (Tailwind)
