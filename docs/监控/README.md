# 监控告警与故障自愈系统

## 概述

本系统提供企业级的监控、告警和故障自愈能力，确保 AI Chat 玩具平台的稳定运行。

## 目录结构

```
backend/src/infra/monitoring/
├── index.js              # 模块导出
├── health.controller.js  # 健康检查控制器
├── prometheus.service.js # Prometheus 指标服务
└── gateway.service.js     # 网关服务（自动降级）

docs/监控/
└── alerting-rules.yml    # Prometheus 告警规则配置
```

## 核心组件

### 1. Sentry 前端监控 (frontend/src/lib/sentry.ts)

前端错误追踪和性能监控集成。

**主要功能：**
- 模块名 tags 自动标记（FRONTEND_MODULES 枚举）
- ErrorBoundary 错误边界集成
- tracesSampleRate 采样率配置
- Source Map 上传配置
- Session 追踪

**使用方式：**
```typescript
import { initSentry, FRONTEND_MODULES, captureModuleError } from '@/lib/sentry';

// 初始化
initSentry({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: 'production',
  errorSampleRate: 1.0,
  tracesSampleRate: 0.1,
});

// 捕获模块错误
captureModuleError(FRONTEND_MODULES.CHAT, error, { context: 'user action' });
```

### 2. 健康检查控制器 (health.controller.js)

提供 `/health` 总体状态和 `/health/:module` 独立模块检查。

**端点：**
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 获取总体健康状态 |
| GET | `/health/modules` | 获取所有模块列表 |
| GET | `/health/:module` | 获取指定模块健康状态 |
| GET | `/health/:module/history` | 获取健康检查历史 |
| GET | `/health/ready` | Kubernetes readiness probe |
| GET | `/health/live` | Kubernetes liveness probe |
| POST | `/health/modules` | 注册新健康检查模块 |
| DELETE | `/health/modules/:name` | 注销健康检查模块 |

**内置模块：**
- `system` - 系统基础资源
- `minimax` - MiniMax API 连接
- `qdrant` - Qdrant 向量数据库
- `circuit_breaker` - 熔断器状态
- `tool_executor` - 工具执行器
- `sse` - SSE 连接
- `rag` - RAG 服务
- `agent` - Agent 执行引擎
- `metrics` - 指标采集器
- `alert` - 告警管理器

### 3. Prometheus 指标服务 (prometheus.service.js)

提供符合 Prometheus 格式的指标收集和导出。

**核心指标：**
| 指标名 | 类型 | 说明 |
|--------|------|------|
| `http_requests_total` | Counter | HTTP 请求总数 |
| `http_request_duration_seconds` | Histogram | HTTP 请求延迟 |
| `module_errors_total` | Gauge | 各模块错误数 |
| `circuit_breaker_state` | Gauge | 熔断器状态 |
| `http_requests_active` | Gauge | 活跃请求数 |
| `model_requests_total` | Counter | 模型请求总数 |
| `model_tokens_total` | Counter | Token 总数 |
| `tool_calls_total` | Counter | 工具调用总数 |
| `agent_executions_total` | Counter | Agent 执行总数 |

**端点：**
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/metrics` | Prometheus 抓取端点 |
| GET | `/metrics/json` | JSON 格式指标 |
| GET | `/metrics/summary` | 摘要指标 |

### 4. 网关服务 (gateway.service.js)

自动降级策略实现，监控错误率和延迟。

**降级级别：**
| 级别 | 说明 | 策略 |
|------|------|------|
| `none` | 无降级 | 正常运行 |
| `light` | 轻度降级 | 禁用图片生成、语音合成 |
| `moderate` | 中度降级 | 增加超时、启用 fallback |
| `heavy` | 重度降级 | 限制 Token、禁用高级 RAG |
| `critical` | 临界降级 | 只读模式、极短超时 |

**触发条件：**
- 错误率 > 50%
- P95 延迟 > 2s
- 熔断器打开数 >= 3

**自动恢复：**
- 5分钟后自动检查
- 指标恢复正常后自动恢复

## 告警规则 (alerting-rules.yml)

Prometheus 告警规则配置，支持多级别告警。

**告警级别：**
- `critical` - 严重告警，立即处理
- `warning` - 警告告警，关注处理
- `info` - 信息告警，供参考

**主要告警规则：**
1. 错误率 > 50% (严重)
2. P95 延迟 > 2s (严重)
3. 熔断器打开告警 (严重)
4. 模块错误数突增 (警告)
5. CPU/内存使用率超限 (警告)

## 集成指南

### 1. 初始化监控模块

```javascript
const { healthCheckManager, getPrometheusService, getGatewayService } = require('./infra/monitoring');

// 获取 Prometheus 服务
const prometheus = getPrometheusService({ port: 9090 });
prometheus.initialize(metricsCollector);

// 创建健康检查中间件
app.use(prometheus.createMiddleware());

// 创建指标路由
app.use('/metrics', prometheus.createRouter());

// 创建健康检查路由
app.use('/health', require('./infra/monitoring/health.controller'));

// 获取网关服务
const gateway = getGatewayService({
  errorRateThreshold: 0.5,
  latencyThreshold: 2000,
  recoveryTimeout: 300000,
});
gateway.setMetricsCollector(metricsCollector);

// 监听降级事件
gateway.on('degradation', ({ currentLevel, reason }) => {
  console.log(`服务降级: ${reason} -> ${currentLevel}`);
});
```

### 2. 自定义健康检查模块

```javascript
const { ModuleHealthChecker, healthCheckManager } = require('./infra/monitoring');

class CustomModuleChecker extends ModuleHealthChecker {
  constructor() {
    super('custom_module', '自定义模块健康检查');
  }

  async performCheck() {
    // 实现检查逻辑
    return {
      healthy: true,
      message: 'OK',
      metadata: { /* ... */ },
    };
  }
}

// 注册
healthCheckManager.registerModule(new CustomModuleChecker());
```

### 3. 记录模块错误

```javascript
const prometheus = getPrometheusService();

// 记录模块错误
prometheus.recordModuleError('chat', 'message_error');
prometheus.recordModuleError('agent', 'execution_timeout');

// 更新熔断器状态
prometheus.updateCircuitBreakerState('minimax_api', 'open');
```

## 部署配置

### Kubernetes 健康检查

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 30000
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health/ready
    port: 30000
  initialDelaySeconds: 5
  periodSeconds: 10
```

### Prometheus 抓取配置

```yaml
scrape_configs:
  - job_name: 'ai-chat-backend'
    static_configs:
      - targets: ['backend:30000']
    metrics_path: /metrics
    scrape_interval: 15s

  - job_name: 'ai-chat-health'
    static_configs:
      - targets: ['backend:30000']
    metrics_path: /health
    scrape_interval: 30s
```

## 监控指标大盘

### 关键指标
1. **请求量** - `sum(rate(http_requests_total[5m]))`
2. **错误率** - `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))`
3. **P95 延迟** - `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))`
4. **熔断器状态** - `circuit_breaker_state`
5. **活跃请求** - `http_requests_active`

### 告警阈值建议

| 指标 | 警告 | 严重 |
|------|------|------|
| 错误率 | > 20% | > 50% |
| P95 延迟 | > 1s | > 2s |
| 熔断器打开 | >= 1 | >= 3 |
| 模块错误数 | > 10 | > 50 |

## 故障自愈流程

```
1. 监控系统检测到异常
   ↓
2. GatewayService 判断是否触发降级
   ↓
3. 应用降级策略（禁用功能、增加超时）
   ↓
4. 5分钟后开始健康检查
   ↓
5. 指标恢复正常 → 自动恢复
   ↓
6. 指标仍异常 → 保持降级并告警
```

## 故障排查

### 健康检查失败
```bash
# 检查模块状态
curl http://localhost:30000/health/modules

# 检查特定模块
curl http://localhost:30000/health/minimax

# 查看历史
curl http://localhost:30000/health/history?limit=10
```

### Prometheus 指标问题
```bash
# 查看指标输出
curl http://localhost:30000/metrics

# 查看 JSON 格式
curl http://localhost:30000/metrics/json
```

### 降级状态问题
```javascript
// 检查网关状态
const gateway = getGatewayService();
console.log(gateway.getStatus());

// 查看决策历史
console.log(gateway.getHistory());
```

## 更新日志

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-05-13 | 1.0.0 | 初始版本，实现监控告警与故障自愈系统 |