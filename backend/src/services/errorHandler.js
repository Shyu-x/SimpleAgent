/**
 * Agent 错误处理模块
 * 提供结构化错误类型、错误恢复和重试机制
 */

/**
 * 错误代码枚举
 */
const ErrorCodes = {
  // 工具相关错误
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  TOOL_PERMISSION_DENIED: 'TOOL_PERMISSION_DENIED',
  INVALID_TOOL_INPUT: 'INVALID_TOOL_INPUT',

  // 执行相关错误
  MAX_ITERATIONS_REACHED: 'MAX_ITERATIONS_REACHED',
  EXECUTION_TIMEOUT: 'EXECUTION_TIMEOUT',
  EXECUTION_CANCELLED: 'EXECUTION_CANCELLED',
  EXECUTION_PAUSED: 'EXECUTION_PAUSED',

  // 状态相关错误
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  CHECKPOINT_NOT_FOUND: 'CHECKPOINT_NOT_FOUND',
  STATE_CORRUPTED: 'STATE_CORRUPTED',

  // LLM相关错误
  LLM_RATE_LIMIT: 'LLM_RATE_LIMIT',
  LLM_CONTEXT_TOO_LONG: 'LLM_CONTEXT_TOO_LONG',
  LLM_API_ERROR: 'LLM_API_ERROR',

  // 内部错误
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Agent 错误类
 */
class AgentError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
    this.recoverable = this.isRecoverable(code);
    this.retryable = this.isRetryable(code);
  }

  /**
   * 判断错误是否可恢复
   */
  isRecoverable(code) {
    const recoverableCodes = [
      ErrorCodes.TOOL_EXECUTION_FAILED,
      ErrorCodes.TOOL_TIMEOUT,
      ErrorCodes.EXECUTION_TIMEOUT,
      ErrorCodes.LLM_RATE_LIMIT,
      ErrorCodes.LLM_API_ERROR
    ];
    return recoverableCodes.includes(code);
  }

  /**
   * 判断错误是否可重试
   */
  isRetryable(code) {
    const retryableCodes = [
      ErrorCodes.TOOL_EXECUTION_FAILED,
      ErrorCodes.TOOL_TIMEOUT,
      ErrorCodes.LLM_RATE_LIMIT,
      ErrorCodes.LLM_API_ERROR,
      ErrorCodes.EXECUTION_TIMEOUT
    ];
    return retryableCodes.includes(code);
  }

  /**
   * 转换为JSON
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
      retryable: this.retryable,
      stack: this.stack
    };
  }
}

/**
 * 重试策略
 */
class RetryStrategy {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.strategy = options.strategy || 'exponential'; // linear, exponential, fixed
    this.jitter = options.jitter || true; // 添加随机抖动避免雷群效应
  }

  /**
   * 计算延迟时间
   */
  calculateDelay(attempt) {
    let delay;

    switch (this.strategy) {
      case 'exponential':
        delay = this.baseDelay * Math.pow(2, attempt - 1);
        break;
      case 'linear':
        delay = this.baseDelay * attempt;
        break;
      case 'fixed':
      default:
        delay = this.baseDelay;
    }

    // 限制最大延迟
    delay = Math.min(delay, this.maxDelay);

    // 添加抖动
    if (this.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * 执行带重试的操作
   */
  async execute(operation, errorChecker = null) {
    let lastError;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const result = await operation(attempt);
        return result;
      } catch (error) {
        lastError = error;

        // 检查是否应该重试
        if (errorChecker && !errorChecker(error)) {
          throw error;
        }

        // 如果是 AgentError，检查是否可重试
        if (error instanceof AgentError && !error.retryable) {
          throw error;
        }

        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          console.log(`[RetryStrategy] Attempt ${attempt} failed, retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    // 所有尝试都失败
    throw lastError;
  }

  /**
   * 睡眠函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 错误恢复管理器
 */
class RecoveryManager {
  constructor() {
    this.recoveryHandlers = new Map();
    this.registerDefaultHandlers();
  }

  /**
   * 注册默认恢复处理器
   */
  registerDefaultHandlers() {
    // 工具执行失败恢复
    this.registerRecoveryHandler(ErrorCodes.TOOL_EXECUTION_FAILED, async (error, context) => {
      console.log(`[Recovery] Attempting recovery for tool execution failure`);
      // 可以尝试替代工具或简化操作
      return { action: 'retry', modifications: { simplified: true } };
    });

    // 超时恢复
    this.registerRecoveryHandler(ErrorCodes.EXECUTION_TIMEOUT, async (error, context) => {
      console.log(`[Recovery] Attempting recovery for timeout`);
      return { action: 'checkpoint_and_retry', timeout: context.timeout * 1.5 };
    });

    // LLM 速率限制恢复
    this.registerRecoveryHandler(ErrorCodes.LLM_RATE_LIMIT, async (error, context) => {
      console.log(`[Recovery] Attempting recovery for rate limit`);
      return { action: 'wait_and_retry', delay: 60000 }; // 等待60秒
    });
  }

  /**
   * 注册恢复处理器
   */
  registerRecoveryHandler(errorCode, handler) {
    this.recoveryHandlers.set(errorCode, handler);
  }

  /**
   * 尝试恢复
   */
  async attemptRecovery(error, context = {}) {
    const handler = this.recoveryHandlers.get(error.code);

    if (!handler) {
      return { action: 'fail', reason: 'No recovery handler found' };
    }

    try {
      const result = await handler(error, context);
      return result;
    } catch (recoveryError) {
      console.error(`[Recovery] Recovery handler failed:`, recoveryError);
      return { action: 'fail', reason: recoveryError.message };
    }
  }

  /**
   * 检查是否有恢复处理器
   */
  hasRecoveryHandler(errorCode) {
    return this.recoveryHandlers.has(errorCode);
  }
}

/**
 * 全局错误处理器
 */
class GlobalErrorHandler {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.onUncaughtError = options.onUncaughtError || null;
    this.setupGlobalHandlers();
  }

  /**
   * 设置全局错误处理器
   */
  setupGlobalHandlers() {
    process.on('uncaughtException', (error) => {
      this.handleError(error, 'Uncaught Exception');
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.handleError(reason, 'Unhandled Rejection');
    });
  }

  /**
   * 处理错误
   */
  handleError(error, source = 'Unknown') {
    const errorInfo = {
      source,
      message: error.message || String(error),
      code: error.code || ErrorCodes.UNKNOWN_ERROR,
      timestamp: Date.now(),
      stack: error.stack
    };

    this.logger.error(`[${source}]`, errorInfo);

    if (this.onUncaughtError) {
      this.onUncaughtError(errorInfo);
    }
  }

  /**
   * 创建错误边界包装器
   */
  createErrorBoundary(fn, fallback = null) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.logger.error('Error boundary caught:', error);

        if (fallback) {
          return fallback(error, ...args);
        }

        throw error instanceof AgentError
          ? error
          : new AgentError(error.message, ErrorCodes.INTERNAL_ERROR, { originalError: error });
      }
    };
  }
}

// 创建全局实例
const globalErrorHandler = new GlobalErrorHandler();
const recoveryManager = new RecoveryManager();

module.exports = {
  ErrorCodes,
  AgentError,
  RetryStrategy,
  RecoveryManager,
  GlobalErrorHandler,
  globalErrorHandler,
  recoveryManager
};