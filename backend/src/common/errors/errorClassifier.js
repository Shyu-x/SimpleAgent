/**
 * 错误分类工具
 * 提供统一的错误分类和重试配置逻辑
 *
 * @author AI Chat 团队
 * @date 2026-05-25
 */

/**
 * 错误分类常量
 */
const ERROR_CLASSIFICATION = {
  AUTHENTICATION: 'auth',        // 认证错误，不应重试
  PARAMETER: 'parameter',        // 参数错误，不应重试
  RATE_LIMIT: 'rate_limit',      // 限流错误，可重试但需退避
  TRANSIENT: 'transient',        // 临时错误（网络超时等），可重试
  RESOURCE: 'resource',          // 资源错误（内存不足等），可重试但需降级
  UNKNOWN: 'unknown'             // 未知错误，根据情况判断
};

/**
 * 重试策略配置
 */
const RETRY_STRATEGY = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
  // 不同错误类型的重试配置
  errorTypes: {
    [ERROR_CLASSIFICATION.TRANSIENT]: { maxRetries: 3, backoffMultiplier: 1 },
    [ERROR_CLASSIFICATION.RESOURCE]: { maxRetries: 2, backoffMultiplier: 1.5 },
    [ERROR_CLASSIFICATION.RATE_LIMIT]: { maxRetries: 5, backoffMultiplier: 2 }
  }
};

/**
 * 将错误分类为可重试类型
 * @param {Error|string|Object} error - 错误对象或错误消息
 * @returns {string} 错误分类 (ERROR_CLASSIFICATION 中的值)
 */
function classifyRetryableError(error) {
  if (!error) return ERROR_CLASSIFICATION.UNKNOWN;

  const errorMsg = typeof error === 'string' ? error : error.message || '';
  const errorCode = typeof error === 'object' ? (error.code || error.errno || '') : '';
  const statusCode = typeof error === 'object' ? (error.status || error.statusCode || '') : '';

  // 认证相关错误 - 不应重试
  if (errorMsg.includes('401') || errorMsg.includes('403') ||
      errorMsg.includes('unauthorized') || errorMsg.includes('forbidden') ||
      errorMsg.includes('authentication') || errorMsg.includes('api key')) {
    return ERROR_CLASSIFICATION.AUTHENTICATION;
  }

  // 参数错误 - 不应重试
  if (errorMsg.includes('invalid') || errorMsg.includes('parameter') ||
      errorMsg.includes('argument') || errorMsg.includes('schema') ||
      errorMsg.includes('validation')) {
    return ERROR_CLASSIFICATION.PARAMETER;
  }

  // 限流错误 - 可重试但需要更长退避
  if (statusCode === 429 || errorMsg.includes('rate limit') ||
      errorMsg.includes('too many requests') || errorMsg.includes('quota')) {
    return ERROR_CLASSIFICATION.RATE_LIMIT;
  }

  // 网络临时错误 - 可重试
  if (errorCode === 'ECONNRESET' || errorCode === 'ETIMEDOUT' ||
      errorCode === 'ENOTFOUND' || errorCode === 'ECONNREFUSED' ||
      errorMsg.includes('timeout') || errorMsg.includes('network') ||
      errorMsg.includes('ECONNREFUSED')) {
    return ERROR_CLASSIFICATION.TRANSIENT;
  }

  // 资源错误 - 可重试但可能需要降级
  if (errorMsg.includes('memory') || errorMsg.includes('disk') ||
      errorMsg.includes('storage') || errorMsg.includes('resource')) {
    return ERROR_CLASSIFICATION.RESOURCE;
  }

  // 500/502/503/504 服务器错误 - 临时错误
  if (statusCode >= 500 && statusCode < 600) {
    return ERROR_CLASSIFICATION.TRANSIENT;
  }

  return ERROR_CLASSIFICATION.UNKNOWN;
}

/**
 * 根据错误类型获取重试配置
 * @param {string} errorType - 错误分类
 * @returns {Object} 重试配置 { maxRetries, delayMs, backoffMultiplier }
 */
function getRetryConfig(errorType) {
  const defaultConfig = {
    maxRetries: RETRY_STRATEGY.maxRetries,
    delayMs: RETRY_STRATEGY.initialDelayMs,
    backoffMultiplier: 1
  };

  const errorConfig = RETRY_STRATEGY.errorTypes[errorType];
  if (!errorConfig) {
    // UNKNOWN 或 PARAMETER/AUTH 类型使用默认配置
    if (errorType === ERROR_CLASSIFICATION.UNKNOWN) {
      return { maxRetries: 1, delayMs: 1000, backoffMultiplier: 1 };
    }
    return defaultConfig;
  }

  return {
    maxRetries: errorConfig.maxRetries,
    delayMs: RETRY_STRATEGY.initialDelayMs,
    backoffMultiplier: errorConfig.backoffMultiplier
  };
}

/**
 * 计算退避延迟
 * @param {number} attempt - 当前重试次数
 * @param {number} baseDelay - 基础延迟
 * @param {number} multiplier - 退避倍数
 * @returns {number} 延迟毫秒数
 */
function calculateBackoffDelay(attempt, baseDelay, multiplier) {
  const delay = baseDelay * Math.pow(multiplier, attempt);
  return Math.min(delay, RETRY_STRATEGY.maxDelayMs);
}

module.exports = {
  ERROR_CLASSIFICATION,
  RETRY_STRATEGY,
  classifyRetryableError,
  getRetryConfig,
  calculateBackoffDelay
};