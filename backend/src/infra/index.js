/**
 * 基础设施层 - Infrastructure 导出
 * ================================
 *
 * 统一导出 infra 目录下的所有基础设施服务
 *
 * @module infra/index
 * @version 1.0.0
 */

// 监控模块
const monitoring = require('./monitoring');

// 配置中心
let ConfigCenter = {};
try {
  ConfigCenter = require('./config/ConfigCenter');
} catch (e) {
  // ConfigCenter 模块未安装
}

// 熔断器
let CircuitBreaker = {};
try {
  CircuitBreaker = require('./circuitBreaker/CircuitBreaker');
} catch (e) {
  // CircuitBreaker 模块未安装
}

// 限流器
let RateLimiter = {};
try {
  RateLimiter = require('./rateLimiter/client');
} catch (e) {
  // RateLimiter 模块未安装
}

// 队列管理
let QueueManager = {};
try {
  QueueManager = require('./queue/QueueManager');
} catch (e) {
  // QueueManager 模块未安装
}

// 告警管理
let AlertManager = {};
try {
  AlertManager = require('./alert/AlertManager');
} catch (e) {
  // AlertManager 模块未安装
}

// 指标采集
let MetricsCollector = {};
try {
  MetricsCollector = require('./metrics/MetricsCollector');
} catch (e) {
  // MetricsCollector 模块未安装
}

// SSE 服务
let SSEService = {};
try {
  SSEService = require('./sse/sseService');
} catch (e) {
  // SSEService 模块未安装
}

module.exports = {
  // 监控模块
  ...monitoring,

  // 配置中心
  ConfigCenter: ConfigCenter.ConfigCenter || ConfigCenter,
  getConfigCenter: ConfigCenter.getConfigCenter,

  // 熔断器
  CircuitBreaker: CircuitBreaker.CircuitBreaker || CircuitBreaker,
  CircuitBreakerFactory: CircuitBreaker.CircuitBreakerFactory,

  // 限流器
  RateLimiter: RateLimiter.RateLimiter || RateLimiter,
  RateLimiterFactory: RateLimiter.RateLimiterFactory,

  // 队列管理器
  QueueManager: QueueManager.QueueManager || QueueManager,
  getQueueManager: QueueManager.getQueueManager,

  // 告警管理器
  AlertManager: AlertManager.AlertManager || AlertManager,
  getAlertManager: AlertManager.getAlertManager,

  // 指标采集器
  MetricsCollector: MetricsCollector.MetricsCollector || MetricsCollector,
  getMetricsCollector: MetricsCollector.getMetricsCollector,

  // SSE 服务
  SSEService: SSEService.SSEService || SSEService,
  getSSEService: SSEService.getSSEService,
};