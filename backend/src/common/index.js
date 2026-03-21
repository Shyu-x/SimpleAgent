/**
 * 通用基础能力导出
 */

const { ErrorCode, AppError, createError, isAppError, safeAsync } = require('./errors');
const { CircuitBreaker, CircuitBreakerFactory, CircuitState, breakerFactory } = require('./CircuitBreaker');

module.exports = {
  // 错误处理
  ErrorCode,
  AppError,
  createError,
  isAppError,
  safeAsync,

  // 熔断器
  CircuitBreaker,
  CircuitBreakerFactory,
  CircuitState,
  breakerFactory
};
