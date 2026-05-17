---
phase: "02"
plan: "04"
subsystem: opossum-circuit-breaker
tags: [circuit-breaker, opossum, fault-tolerance, production]
dependency-graph:
  requires:
    - "MiniMax API integration"
    - "Health monitoring infrastructure"
  provides:
    - "Opossum circuit breaker for MiniMax API"
    - "Circuit breaker health check API"
tech-stack:
  added:
    - "opossum: ^8.0.0"
  patterns:
    - "Circuit Breaker pattern"
    - "Fallback with graceful degradation"
    - "Prometheus metric events"
key-files:
  created:
    - "backend/src/middleware/circuitBreaker.js"
  modified:
    - "backend/src/services/router/modelRouter.js"
    - "backend/src/infra/monitoring/health.controller.js"
decisions:
  - |
    选择 opossum 而非自实现熔断器：生产级验证、支持 volume threshold、提供 Prometheus 指标事件
  - |
    使用 50% 失败率阈值、10s 超时、30s 恢复时间，符合生产习惯值
  - |
    Fallback 返回结构化错误 `fallback: true`，方便调用方区分
metrics:
  duration: "~15 minutes"
  completed-date: "2026-05-17"
---

# Phase 2 Plan 4: Opossum Circuit Breaker 集成

## 一行总结

MiniMax API 调用层集成 `opossum` 熔断器，故障时快速失败并返回友好错误。

## 交付成果

### 1. Opossum Circuit Breaker 包装器

**文件**: `backend/src/middleware/circuitBreaker.js`

```javascript
// 导出函数
createCircuitBreaker(fn, options)  // 工厂函数
getAllBreakersStatus()            // 获取所有熔断器状态
getBreakerStatus(name)           // 获取特定熔断器状态
resetAllBreakers()                // 重置所有熔断器
CB_STATES                         // CLOSED/OPEN/HALF_OPEN
DEFAULT_OPTIONS                  // 默认配置
```

**配置**:
```javascript
{
  timeout: 10000,                   // 10秒超时
  errorThresholdPercentage: 50,    // 50% 失败率触发熔断
  resetTimeout: 30000,             // 30秒后尝试恢复
  minimumNumberOfCalls: 10,        // 至少10次调用才计算
  volumeThreshold: 5                // 需要5次调用开始计算
}
```

### 2. MiniMax Router 集成

**文件**: `backend/src/services/router/modelRouter.js`

- `callAPI()` 方法使用 `createCircuitBreaker()` 包装
- 熔断打开时返回友好的 fallback 响应:
  ```json
  {
    "error": "MiniMax API 暂时不可用，请稍后重试",
    "fallback": true,
    "circuitBreaker": "minimax_MiniMax-M2.7",
    "degraded": true
  }
  ```

### 3. 健康检查 API

**端点**: `GET /health/circuit_breaker`

**响应示例**:
```json
{
  "name": "circuit_breaker",
  "status": "healthy",
  "healthy": true,
  "message": "所有熔断器正常",
  "metadata": {
    "customCircuits": { "total": 0, "open": 0 },
    "opossumBreakers": {
      "total": 1,
      "open": 0,
      "breakers": [{
        "name": "minimax_MiniMax-M2.7",
        "state": "CLOSED",
        "failures": 0,
        "successes": 0,
        "fallbacks": 0,
        "rejections": 0
      }]
    }
  }
}
```

## 验证命令

```bash
# 健康检查熔断器状态
curl http://localhost:30000/health/circuit_breaker

# 总体健康检查（包含熔断器）
curl http://localhost:30000/health
```

## 验证输出

```json
{
  "name": "circuit_breaker",
  "description": "熔断器状态健康检查",
  "status": "healthy",
  "healthy": true,
  "message": "所有熔断器正常",
  "metadata": {
    "customCircuits": { "total": 0, "open": 0 },
    "opossumBreakers": { "total": 0, "open": 0, "breakers": [] }
  }
}
```

## 修改的文件

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `backend/src/middleware/circuitBreaker.js` | 新增 | Opossum 熔断器包装器 |
| `backend/src/services/router/modelRouter.js` | 修改 | 集成 opossum 熔断器 |
| `backend/src/infra/monitoring/health.controller.js` | 修改 | 健康检查器支持 opossum |

## 发现的问题和解决方案

### 问题 1: Opossum API 与预期不同
- **现象**: `CircuitBreaker(fn, options)` 构造函数方式与我们习惯的不同
- **解决**: 将用户传入的 fn 作为 `breaker.execute(fn, fallback)` 内部执行

### 问题 2: Health Controller 原引用 `getMiniMaxRouter()`
- **现象**: `MiniMaxRouter.getMiniMaxRouter()` 方法不存在
- **解决**: 改用 `modelRouter.router` 单例直接访问

## 熔断行为说明

```
正常请求流程:
  CLOSED → (失败率 ≥ 50%) → OPEN
  OPEN → (30秒后) → HALF_OPEN (允许1个测试请求)
  HALF_OPEN → (成功 ≥ 3次) → CLOSED
  HALF_OPEN → (失败) → OPEN (再等30秒)
```

## 相关 Commit

- `b3db768` - feat(opossum): integrate opossum circuit breaker for MiniMax API