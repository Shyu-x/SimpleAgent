# 监控告警系统文档

## 概述

AI Chat 玩具项目监控告警系统基于 Prometheus 生态，提供全链路指标采集、健康检查、自动降级和告警功能。

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      Express Server                         │
├─────────────────────────────────────────────────────────────┤
│  MetricsMiddleware  ──►  PrometheusService  ──►  MetricsCollector │
│          │                    │                    │          │
│          ▼                    ▼                    ▼          │
│  GatewayService ◄───────── AlertManager ─────► AlertManager │
│          │                                               │
│          ▼                                               │
│   Auto-Degradation                                       │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   /health       │     │   /metrics      │     │  /api/gateway   │
│   健康检查端点    │     │  Prometheus端点  │     │   降级控制API    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 核心组件

### 1. MetricsCollector (`src/infra/metrics/MetricsCollector.js`)

全链路指标采集器，支持四种指标类型：

| 类型 | 说明 | 示例 |
|------|------|------|
| Counter | 计数器，只增不减 | http_requests_total |
| Gauge | 瞬时值，可增可减 | http_requests_active |
| Histogram | 直方图，记录分布 | http_request_duration_seconds |
| Summary | 摘要，统计分位数 | - |

**主要指标：**

```javascript
// HTTP 指标
http_requests_total{...}           // 请求总数
http_request_duration_seconds{...}  // 请求延迟分布
http_requests_active{}             // 活跃请求数

// 模型指标
model_requests_total{}             // 模型请求总数
model_tokens_total{}               // Token消耗总数
model_errors_total{}               // 模型错误数

// 工具指标
tool_calls_total{}                 // 工具调用总数
tool_errors_total{}               // 工具错误数

// Agent指标
agent_executions_total{}           // Agent执行总数
agent_iterations_total{}           // Agent迭代总数

// 系统指标
system_cpu_usage{}                 // CPU使用率
system_memory_usage{}             // 内存使用率
queue_length{}                    // 队列长度
```

### 2. PrometheusService (`src/infra/monitoring/prometheus.service.js`)

Prometheus 指标服务，提供标准 Prometheus 格式输出。

**端点：**
- `GET /metrics` - Prometheus 抓取端点
- `GET /metrics/json` - JSON 格式指标
- `GET /metrics/summary` - 指标摘要

**输出示例：**

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="POST",path="/api/chat",status="200"} 1523

# HELP http_request_duration_seconds HTTP request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1"} 1200
http_request_duration_seconds_bucket{le="0.5"} 1450
http_request_duration_seconds_bucket{le="+Inf"} 1523
http_request_duration_seconds_count 1523
http_request_duration_seconds_sum 256.789
```

### 3. HealthCheckManager (`src/infra/monitoring/health.controller.js`)

模块化健康检查管理器。

**端点：**

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 总体健康状态 |
| `/health/:module` | GET | 指定模块健康检查 |
| `/health/modules` | GET | 所有模块列表 |
| `/health/ready` | GET | K8s readiness probe |
| `/health/live` | GET | K8s liveness probe |
| `/health/history` | GET | 健康历史记录 |

**内置健康检查模块：**

| 模块 | 说明 | 阈值 |
|------|------|------|
| system | 系统资源 (CPU/内存) | CPU<10, Memory<90% |
| minimax | MiniMax API 连接 | - |
| qdrant | Qdrant 向量数据库 | 5s超时 |
| circuit_breaker | 熔断器状态 | 无OPEN |
| tool_executor | 工具执行器 | - |
| sse | SSE连接数 | <1000 |
| rag | RAG服务 | - |
| agent | Agent引擎 | - |
| metrics | 指标采集器 | - |
| alert | 告警管理器 | 无critical |

**响应示例：**

```json
{
  "timestamp": "2026-05-13T10:30:00.000Z",
  "status": "healthy",
  "summary": {
    "total": 10,
    "healthy": 10,
    "unhealthy": 0
  },
  "modules": [
    {
      "name": "system",
      "status": "healthy",
      "message": "CPU: 0.45, Memory: 67.3%",
      "metadata": {...}
    }
  ]
}
```

### 4. GatewayService (`src/infra/monitoring/gateway.service.js`)

自动降级服务，监控错误率和延迟，自动触发降级策略。

**降级级别：**

| 级别 | 说明 | 禁用功能 |
|------|------|----------|
| none | 正常 | - |
| light | 轻度 | image_generation, voice_synthesis |
| moderate | 中度 | + long_context, 启用fallback |
| heavy | 重度 | + advanced_rag, 限制maxTokens=4000 |
| critical | 临界 | 全部禁用, 只读模式, maxTokens=1000 |

**降级原因：**

| 原因 | 触发条件 |
|------|----------|
| high_error_rate | 错误率 > 50% |
| high_latency | P95延迟 > 2s |
| circuit_breaker_open | OPEN熔断器 >= 3 |
| resource_exhaustion | 系统资源耗尽 |
| manual_trigger | 手动触发 |

**控制API：**

```bash
# 查询降级状态
GET /api/gateway/status

# 手动降级
POST /api/gateway/degrade
Body: { "level": "moderate", "reason": "manual_trigger" }

# 手动恢复
POST /api/gateway/recover
```

### 5. AlertManager (`src/infra/alert/AlertManager.js`)

企业级告警管理器，支持多级别告警和webhook通知。

**告警级别：**

| 级别 | 说明 | 处理方式 |
|------|------|----------|
| critical | 严重告警 | 立即处理 |
| warning | 警告告警 | 关注处理 |
| info | 信息告警 | 参考信息 |

**告警状态：**

| 状态 | 说明 |
|------|------|
| firing | 触发中 |
| resolved | 已解决 |
| acknowledged | 已确认 |
| suppressed | 已抑制 |

## Prometheus 告警规则

告警规则定义在 `docs/监控/alerting-rules.yml`，包含以下分组：

- **ai-chat-http**: HTTP 相关告警
- **ai-chat-circuit-breaker**: 熔断器告警
- **ai-chat-model**: 模型相关告警
- **ai-chat-tool**: 工具相关告警
- **ai-chat-agent**: Agent 相关告警
- **ai-chat-system**: 系统资源告警
- **ai-chat-queue**: 队列告警
- **ai-chat-gateway**: 网关降级告警

**主要告警：**

| 告警名 | 条件 | 级别 |
|--------|------|------|
| HighHTTPErrorRate | 5xx占比>5% | critical |
| HighHTTPLatency | P95>2s | warning |
| CircuitBreakerOpen | 熔断器打开 | critical |
| HighModelErrorRate | 模型错误>1/s | critical |
| HighMemoryUsage | Memory>90% | critical |
| QueueBacklog | 队列>100 | warning |
| ServiceDegraded | 降级状态!=0 | warning |

## 集成方式

### 1. 中间件集成

```javascript
// src/index.js
const { requestMetricsMiddleware } = require('./middleware/metricsMiddleware');
app.use(requestMetricsMiddleware());
```

### 2. 路由挂载

```javascript
// src/index.js
const healthController = require('./infra/monitoring/health.controller');
const prometheusService = require('./infra/monitoring/prometheus.service').getPrometheusService();

app.use('/health', healthController);
app.use('/metrics', prometheusService.createRouter());
```

### 3. 自定义指标上报

```javascript
const { getMetricsCollector } = require('./infra/metrics');
const collector = getMetricsCollector();

// Counter
collector.incrementCounter('custom_requests_total', { type: 'search' });

// Gauge
collector.setGauge('custom_value', 42, { module: 'test' });

// Histogram
collector.recordHistogram('custom_duration', 0.5);
```

### 4. 自定义告警触发

```javascript
const { getAlertManager } = require('./infra/alert');
const alertManager = getAlertManager();

alertManager.fire({
  level: 'critical',
  title: 'Database Connection Failed',
  message: '无法连接到 PostgreSQL 数据库',
  metadata: { host: 'db.example.com', error: err.message }
});
```

## Prometheus 配置

在 `prometheus.yml` 中添加：

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'ai-chat-backend'
    static_configs:
      - targets: ['localhost:30000']
    metrics_path: '/metrics'
```

## Grafana 仪表盘

可导入的 Grafana 仪表盘 JSON 定义：

```json
{
  "dashboard": {
    "title": "AI Chat 玩具",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total[5m])) by (method)",
            "legendFormat": "{{method}}"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{status=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m]))",
            "legendFormat": "5xx Error Rate"
          }
        ]
      },
      {
        "title": "P95 Latency",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "P95 Latency"
          }
        ]
      },
      {
        "title": "Gateway Degradation",
        "type": "stat",
        "targets": [
          {
            "expr": "gateway_degradation_level",
            "legendFormat": "Level"
          }
        ]
      }
    ]
  }
}
```

## 监控最佳实践

1. **指标命名**：使用 `模块_指标类型` 格式，如 `http_requests_total`
2. **标签设计**：合理设计标签，避免标签值过多导致高基数问题
3. **告警阈值**：根据历史数据设置合理阈值，避免误报
4. **降级策略**：设计好降级策略，确保核心功能可用
5. **日志记录**：关键决策记录日志，便于问题排查

## 故障排查

### 问题：指标未采集

1. 检查 MetricsCollector 是否正确初始化
2. 检查中间件是否正确挂载
3. 查看控制台是否有 `[MetricsCollector]` 日志

### 问题：健康检查失败

1. 检查 `/health` 端点返回内容
2. 检查具体模块：`GET /health/:module`
3. 查看健康历史：`GET /health/history`

### 问题：告警未触发

1. 检查告警规则语法：`promtool check rules alerting-rules.yml`
2. 检查 Prometheus 是否加载规则
3. 查看 Alertmanager 是否正确配置

### 问题：降级未生效

1. 检查 GatewayService 是否初始化
2. 查看网关状态：`GET /api/gateway/status`
3. 检查指标收集是否正常

## 相关文件

| 文件 | 说明 |
|------|------|
| `src/infra/metrics/MetricsCollector.js` | 指标采集器 |
| `src/infra/monitoring/prometheus.service.js` | Prometheus服务 |
| `src/infra/monitoring/health.controller.js` | 健康检查控制器 |
| `src/infra/monitoring/gateway.service.js` | 网关降级服务 |
| `src/infra/alert/AlertManager.js` | 告警管理器 |
| `src/middleware/metricsMiddleware.js` | 指标收集中间件 |
| `src/routes/metrics.js` | 指标API路由 |
| `docs/监控/alerting-rules.yml` | Prometheus告警规则 |

## 更新日志

| 日期 | 说明 |
|------|------|
| 2026-05-13 | 初始版本，集成监控告警系统 |
