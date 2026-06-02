/**
 * 重试机制模块
 * 借鉴 MiniMax Mini-Agent 的优雅重试设计
 */

const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('retry');

/**
 * 重试配置
 */
const RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,      // 1秒
  maxDelay: 60000,          // 60秒
  exponentialBase: 2,
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED']
};

/**
 * 计算退避延迟
 * @param {number} attempt - 当前重试次数 (从0开始)
 * @returns {number} - 延迟毫秒数
 */
function calculateBackoffDelay(attempt) {
  const delay = RetryConfig.initialDelay * Math.pow(RetryConfig.exponentialBase, attempt);
  return Math.min(delay, RetryConfig.maxDelay);
}

/**
 * 检查是否可重试
 * @param {Error} error - 错误对象
 * @returns {boolean}
 */
function isRetryableError(error) {
  if (!error) return false;

  const errorCode = error.code || error.errno || '';
  const errorMessage = error.message || '';

  // 检查错误码
  if (RetryConfig.retryableErrors.includes(errorCode)) {
    return true;
  }

  // 检查HTTP状态码
  if (error.status) {
    return [408, 429, 500, 502, 503, 504].includes(error.status);
  }

  // 检查超时
  if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
    return true;
  }

  return false;
}

/**
 * 带重试的异步函数执行
 * @param {Function} fn - 要执行的异步函数
 * @param {Object} options - 配置选项
 * @param {number} options.maxRetries - 最大重试次数
 * @param {Function} options.onRetry - 重试回调 (error, attempt) => void
 * @param {Function} options.shouldRetry - 自定义重试判断 (error) => boolean
 * @returns {Promise} - 函数执行结果
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = RetryConfig.maxRetries,
    initialDelay = RetryConfig.initialDelay,
    maxDelay = RetryConfig.maxDelay,
    onRetry = null,
    shouldRetry = isRetryableError
  } = options;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 最后一次尝试失败
      if (attempt >= maxRetries) {
        break;
      }

      // 检查是否可重试
      if (!shouldRetry(error)) {
        throw error;
      }

      // 计算延迟
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);

      // 记录重试
      logger.warn('Attempt failed, retrying', { attempt: attempt + 1, error: error.message, delay });

      if (onRetry) {
        onRetry(error, attempt + 1);
      }

      // 等待后重试
      await sleep(delay);
    }
  }

  // 所有重试都失败
  const errorMsg = `Failed after ${maxRetries + 1} attempts. Last error: ${lastError?.message || 'Unknown'}`;
  const finalError = new Error(errorMsg);
  finalError.originalError = lastError;
  finalError.attempts = maxRetries + 1;
  throw finalError;
}

/**
 * 睡眠函数
 * @param {number} ms - 毫秒数
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 创建带超时的Promise
 * @param {Promise} promise - 原Promise
 * @param {number} timeoutMs - 超时毫秒数
 * @param {string} timeoutMessage - 超时错误消息
 * @returns {Promise}
 */
function withTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, timeout]);
}

/**
 * 超时配置
 */
const TimeoutConfig = {
  connect: 10000,      // 连接超时 10s
  execute: 60000,       // 执行超时 60s
  sseRead: 120000      // SSE读取超时 120s
};

module.exports = {
  RetryConfig,
  calculateBackoffDelay,
  isRetryableError,
  withRetry,
  sleep,
  withTimeout,
  TimeoutConfig
};
