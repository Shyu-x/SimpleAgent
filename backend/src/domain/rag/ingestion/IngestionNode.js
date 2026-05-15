/**
 * IngestionNode - 摄取节点基类
 *
 * 设计模式：模板方法模式 + 责任链模式
 * - 所有节点继承此基类，统一生命周期管理
 * - 支持节点级错误处理、重试、日志记录
 * - 每个节点独立可观测（输入/输出/耗时）
 *
 * @abstract
 */
class IngestionNode {
  constructor(name, options = {}) {
    this.name = name;
    this.AppError = require('../../common/errors/AppError');
    this.options = {
      retryCount: 3,
      retryDelay: 1000,
      timeout: 30000,
      ...options,
    };
    this.logger = options.logger || console;
  }

  /**
   * 执行节点处理（模板方法）
   * @param {Object} context - 流水线上下文
   * @returns {Promise<Object>} 更新后的上下文
   */
  async execute(context) {
    const startTime = Date.now();
    const traceId = context.traceId || `node-${this.name}-${Date.now()}`;

    this.logger.info(`[${this.name}] 开始处理`, {
      traceId,
      inputSize: this._estimateSize(context),
    });

    try {
      // 1. 前置检查
      await this._preCheck(context);

      // 2. 执行核心逻辑
      const result = await this._executeWithTimeout(context);

      // 3. 后置验证
      await this._postValidate(result, context);

      // 4. 记录成功日志
      const duration = Date.now() - startTime;
      this.logger.info(`[${this.name}] 处理完成`, {
        traceId,
        duration,
        outputSize: this._estimateSize(result),
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`[${this.name}] 处理失败`, {
        traceId,
        duration,
        error: error.message,
        stack: error.stack,
      });

      // 节点级错误转换
      throw new NodeExecutionError(this.name, error, { traceId, duration });
    }
  }

  /**
   * 前置检查 - 子类可覆盖
   * @param {Object} context
   */
  async _preCheck(context) {
    // 默认实现：检查必要字段
    if (this.requiredFields) {
      for (const field of this.requiredFields) {
        if (!this._getNestedValue(context, field)) {
          throw new ValidationError(this.name, `缺少必要字段: ${field}`);
        }
      }
    }
  }

  /**
   * 核心执行逻辑 - 子类必须实现
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async _process(context) {
    throw this.AppError.internalError(`${this.name} 必须实现 _process 方法`);
  }

  /**
   * 后置验证 - 子类可覆盖
   * @param {Object} result
   * @param {Object} context
   */
  async _postValidate(result, context) {
    // 默认实现：无验证
  }

  /**
   * 超时包装执行
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async _executeWithTimeout(context) {
    return this._withRetry(() => this._process(context));
  }

  /**
   * 重试机制（指数退避）
   * @param {Function} fn
   * @returns {Promise<any>}
   */
  async _withRetry(fn) {
    let lastError;

    for (let attempt = 0; attempt <= this.options.retryCount; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // 最后一次尝试不等待
        if (attempt < this.options.retryCount) {
          const delay = this.options.retryDelay * Math.pow(2, attempt);
          this.logger.warn(`[${this.name}] 重试 ${attempt + 1}/${this.options.retryCount}`, {
            error: error.message,
            nextRetryIn: delay,
          });
          await this._sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * 工具方法：安全获取嵌套属性
   * @param {Object} obj
   * @param {string} path
   * @returns {any}
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * 工具方法：估算数据大小（用于日志）
   * @param {any} data
   * @returns {number}
   */
  _estimateSize(data) {
    if (!data) return 0;
    try {
      return JSON.stringify(data).length;
    } catch {
      return 0;
    }
  }

  /**
   * 工具方法：延迟
   * @param {number} ms
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 节点执行错误
 */
class NodeExecutionError extends Error {
  constructor(nodeName, cause, metadata = {}) {
    super(`[${nodeName}] 执行失败: ${cause.message}`);
    this.name = 'NodeExecutionError';
    this.nodeName = nodeName;
    this.cause = cause;
    this.metadata = metadata;
  }
}

/**
 * 验证错误
 */
class ValidationError extends Error {
  constructor(nodeName, message) {
    super(`[${nodeName}] 验证失败: ${message}`);
    this.name = 'ValidationError';
    this.nodeName = nodeName;
  }
}

module.exports = {
  IngestionNode,
  NodeExecutionError,
  ValidationError,
};
