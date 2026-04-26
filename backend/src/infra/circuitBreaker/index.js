/**
 * 熔断器模块导出
 * @description 企业级熔断器实现，支持三态转换、健康检查和故障转移
 */

const {
  CircuitBreaker,
  CircuitOpenError,
  TimeoutError,
  CircuitState,
  CircuitEvent
} = require('./CircuitBreaker');

const {
  CircuitBreakerFactory,
  Presets,
  defaultFactory
} = require('./CircuitBreakerFactory');

module.exports = {
  // 核心类
  CircuitBreaker,
  CircuitBreakerFactory,

  // 错误类
  CircuitOpenError,
  TimeoutError,

  // 枚举
  CircuitState,
  CircuitEvent,
  Presets,

  // 默认工厂实例
  defaultFactory
};
