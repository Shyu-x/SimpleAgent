/**
 * 模块化架构 - Common 导出
 * ========================
 *
 * 统一导出 common 目录下的所有公共基础设施
 *
 * @module common/index
 * @version 1.0.0
 */

// 统一错误处理
const errors = require('./errors');

// 事件总线
const eventBus = require('./event-bus');

// Resilience 模块 (熔断器)
let ResilienceModule = {};
try {
  ResilienceModule = require('./resilience');
} catch (e) {
  // Resilience 模块未安装
}

// Rate Limiter 模块 (限流器)
let RateLimiterModule = {};
try {
  RateLimiterModule = require('./rate-limiter');
} catch (e) {
  // Rate Limiter 模块未安装
}

module.exports = {
  // 错误处理 (统一错误码 1000-9999)
  ErrorCode: errors.ErrorCode,
  AppError: errors.AppError,
  Errors: errors.Errors,
  createError: errors.createError,
  isAppError: errors.isAppError,
  safeAsync: errors.safeAsync,

  // 事件总线
  EventBusService: eventBus.EventBusService,
  UserEvents: eventBus.UserEvents,
  OrderEvents: eventBus.OrderEvents,
  PaymentEvents: eventBus.PaymentEvents,
  InventoryEvents: eventBus.InventoryEvents,

  // 事件总线单例
  eventBus,

  // Resilience 模块 (TypeScript)
  ...ResilienceModule,

  // Rate Limiter 模块 (TypeScript)
  ...RateLimiterModule,
};