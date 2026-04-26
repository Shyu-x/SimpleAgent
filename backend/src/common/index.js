/**
 * 通用基础能力导出
 * 统一错误码体系 v2.0 (2026-04-06)
 */

const errors = require('./errors');
const { CircuitBreaker, CircuitBreakerFactory, CircuitState, breakerFactory } = require('./CircuitBreaker');

module.exports = {
  // 错误处理 (统一错误码 1000-9999)
  ErrorCode: errors.ErrorCode,
  AppError: errors.AppError,
  Errors: errors.Errors,
  createError: errors.createError,
  isAppError: errors.isAppError,
  safeAsync: errors.safeAsync,

  // 熔断器
  CircuitBreaker,
  CircuitBreakerFactory,
  CircuitState,
  breakerFactory
};
