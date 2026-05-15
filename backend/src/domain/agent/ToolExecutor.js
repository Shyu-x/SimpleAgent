/**
 * 工具执行器抽象
 * 统一管理工具执行的生命周期、超时控制、错误分类和重试策略
 *
 * 设计目标：
 * 1. 统一的工具执行接口
 * 2. 超时控制和错误分类
 * 3. 支持并行/串行执行
 * 4. 结构化结果构建
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

const { AppError } = require('../../common/errors');
const { withTimeout, withRetry, TimeoutConfig } = require('../../utils/retry');
const createLogger = require('../../../common/logger');
const logger = createLogger('ToolExecutor');

/**
 * 工具执行错误类型
 */
const ToolErrorType = {
  NOT_FOUND: 'not_found',         // 工具不存在
  VALIDATION: 'validation',       // 参数验证失败
  TIMEOUT: 'timeout',             // 执行超时
  NETWORK: 'network',             // 网络错误
  PERMISSION: 'permission',       // 权限错误
  RATE_LIMIT: 'rate_limit',       // 限流错误
  EXECUTION: 'execution',         // 执行异常
  CANCELLED: 'cancelled',         // 执行被取消
  UNKNOWN: 'unknown'              // 未知错误
};

/**
 * 工具调用结构
 * @typedef {Object} ToolCall
 * @property {string} id - 调用唯一标识
 * @property {string} name - 工具名称
 * @property {Object} parameters - 工具参数
 * @property {Object} options - 执行选项
 */

/**
 * 工具执行结果结构
 * @typedef {Object} ToolResult
 * @property {boolean} success - 是否成功
 * @property {string} tool - 工具名称
 * @property {string} callId - 调用ID
 * @property {*} result - 执行结果
 * @property {string} error - 错误信息
 * @property {string} errorType - 错误类型
 * @property {number} executionTime - 执行耗时(ms)
 */

/**
 * 执行上下文
 * @typedef {Object} ExecutionContext
 * @property {string} sessionId - 会话ID
 * @property {Object} user - 用户信息
 * @property {Object} messages - 消息历史
 * @property {string} traceId - 追踪ID
 * @property {AbortSignal} signal - 取消信号
 */

/**
 * 工具执行器
 * 统一的工具执行接口，支持超时、重试、取消
 */
class ToolExecutor {
  constructor(options = {}) {
    this.name = options.name || 'ToolExecutor';
    // 默认超时配置
    this.defaultTimeout = options.defaultTimeout || TimeoutConfig.DEFAULT_TIMEOUT;
    // 工具注册表（可选，由外部注入）
    this.registry = options.registry || null;
    // 取消标志
    this._cancelled = false;
    // 执行中标志
    this._activeCalls = new Map();
  }

  /**
   * 执行单个工具调用
   * @param {ToolCall} toolCall - 工具调用
   * @param {ExecutionContext} context - 执行上下文
   * @returns {Promise<ToolResult>} 执行结果
   */
  async execute(toolCall, context = {}) {
    const startTime = Date.now();
    const callId = toolCall.id || this._generateCallId();

    try {
      // 验证工具调用
      const validation = this.validateToolCall(toolCall);
      if (!validation.valid) {
        return this.buildToolResult({
          success: false,
          tool: toolCall.name,
          callId,
          error: 'Tool call validation failed',
          errorType: ToolErrorType.VALIDATION,
          validationErrors: validation.errors,
          executionTime: Date.now() - startTime
        });
      }

      // 检查取消状态
      if (this._cancelled || (context.signal && context.signal.aborted)) {
        return this.buildToolResult({
          success: false,
          tool: toolCall.name,
          callId,
          error: 'Tool execution cancelled',
          errorType: ToolErrorType.CANCELLED,
          executionTime: Date.now() - startTime
        });
      }

      // 记录执行
      this._activeCalls.set(callId, {
        tool: toolCall.name,
        startTime,
        context
      });

      // 获取工具执行函数
      const toolFn = await this._getToolFunction(toolCall.name, context);
      if (!toolFn) {
        return this.buildToolResult({
          success: false,
          tool: toolCall.name,
          callId,
          error: `Tool not found: ${toolCall.name}`,
          errorType: ToolErrorType.NOT_FOUND,
          executionTime: Date.now() - startTime
        });
      }

      // 获取超时时间
      const timeout = this._getToolTimeout(toolCall.name, toolCall.options);

      // 执行工具（带超时和重试）
      const result = await this._executeWithRetryAndTimeout(
        toolFn,
        toolCall.parameters,
        timeout,
        toolCall.options
      );

      // 构建成功结果
      return this.buildToolResult({
        success: true,
        tool: toolCall.name,
        callId,
        result,
        executionTime: Date.now() - startTime
      });

    } catch (error) {
      return this._handleExecutionError(error, toolCall, callId, startTime);
    } finally {
      this._activeCalls.delete(callId);
    }
  }

  /**
   * 并行执行多个工具调用
   * @param {ToolCall[]} toolCalls - 工具调用列表
   * @param {ExecutionContext} context - 执行上下文
   * @returns {Promise<ToolResult[]>} 结果列表
   */
  async executeParallel(toolCalls, context = {}) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return [];
    }

    // 设置并发限制
    const concurrency = toolCalls.options?.concurrency || toolCalls.length;
    const results = [];

    // 使用信号量控制并发
    const chunks = this._chunkArray(toolCalls, concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(toolCall => this.execute(toolCall, context))
      );
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * 串行执行多个工具调用
   * @param {ToolCall[]} toolCalls - 工具调用列表
   * @param {ExecutionContext} context - 执行上下文
   * @returns {Promise<ToolResult[]>} 结果列表
   */
  async executeSequential(toolCalls, context = {}) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return [];
    }

    const results = [];

    for (const toolCall of toolCalls) {
      // 检查是否已取消
      if (this._cancelled || (context.signal && context.signal.aborted)) {
        results.push(this.buildToolResult({
          success: false,
          tool: toolCall.name,
          callId: toolCall.id,
          error: 'Execution cancelled',
          errorType: ToolErrorType.CANCELLED
        }));
        break;
      }

      const result = await this.execute(toolCall, context);
      results.push(result);

      // 如果执行失败且不允许继续，则停止
      if (!result.success && toolCall.options?.stopOnError) {
        break;
      }
    }

    return results;
  }

  /**
   * 验证工具调用
   * @param {ToolCall} toolCall - 工具调用
   * @returns {{valid: boolean, errors: Array}}
   */
  validateToolCall(toolCall) {
    const errors = [];

    // 检查工具名称
    if (!toolCall || typeof toolCall.name !== 'string') {
      errors.push({
        field: 'name',
        message: 'Tool name is required and must be a string'
      });
    }

    // 检查参数类型
    if (toolCall.parameters !== undefined && typeof toolCall.parameters !== 'object') {
      errors.push({
        field: 'parameters',
        message: 'Tool parameters must be an object'
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 构建工具结果
   * @param {Partial<ToolResult>} data - 结果数据
   * @returns {ToolResult} 工具结果
   */
  buildToolResult(data) {
    return {
      success: data.success ?? false,
      tool: data.tool || 'unknown',
      callId: data.callId || this._generateCallId(),
      result: data.result !== undefined ? data.result : null,
      error: data.error || null,
      errorType: data.errorType || (data.success ? null : ToolErrorType.UNKNOWN),
      validationErrors: data.validationErrors || null,
      executionTime: data.executionTime || 0,
      timestamp: Date.now()
    };
  }

  /**
   * 取消所有执行
   */
  cancel() {
    this._cancelled = true;

    // 触发所有活跃调用的取消
    for (const [callId, call] of this._activeCalls) {
      if (call.context?.signal) {
        call.context.signal.abort();
      }
    }

    this._activeCalls.clear();
  }

  /**
   * 重置取消状态
   */
  reset() {
    this._cancelled = false;
  }

  /**
   * 获取工具超时时间
   * @private
   */
  _getToolTimeout(toolName, options = {}) {
    if (options.timeout !== undefined) {
      return options.timeout;
    }

    // 从注册表获取工具超时配置
    if (this.registry) {
      const tool = this.registry.get(toolName);
      if (tool?.timeout) {
        return tool.timeout;
      }
    }

    return this.defaultTimeout;
  }

  /**
   * 获取工具执行函数
   * @private
   */
  async _getToolFunction(toolName, context = {}) {
    // 优先从注册表获取
    if (this.registry) {
      const tool = this.registry.get(toolName);
      if (tool && typeof tool.execute === 'function') {
        return tool.execute.bind(tool);
      }
    }

    // 从上下文中获取工具映射
    if (context.tools && context.tools[toolName]) {
      const tool = context.tools[toolName];
      if (typeof tool === 'function') {
        return tool;
      }
      if (typeof tool.execute === 'function') {
        return tool.execute.bind(tool);
      }
    }

    // 动态导入（基于工具名称约定）
    try {
      const toolPath = this._resolveToolPath(toolName);
      const ToolClass = require(toolPath);
      const instance = new ToolClass();
      return instance.execute.bind(instance);
    } catch {
      return null;
    }
  }

  /**
   * 解析工具路径
   * @private
   */
  _resolveToolPath(toolName) {
    // 工具名称格式: tool_name -> toolName
    const camelName = toolName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return `../../services/tools/${camelName}`;
  }

  /**
   * 带重试和超时的执行
   * @private
   */
  async _executeWithRetryAndTimeout(fn, params, timeout, options = {}) {
    const maxRetries = options.maxRetries ?? 0;
    const retryDelay = options.retryDelay ?? 1000;

    const executeFn = async () => {
      if (typeof fn === 'function') {
        return await fn(params);
      }
      throw AppError.validationError('function', 'Invalid tool function');
    };

    if (maxRetries > 0) {
      return await withTimeout(
        withRetry(executeFn, {
          maxRetries,
          retryDelay,
          onRetry: (err, attempt) => {
            logger.warn(`Tool execution retry ${attempt}`, { error: err.message });
          }
        }),
        timeout
      );
    }

    return await withTimeout(executeFn, timeout);
  }

  /**
   * 处理执行错误
   * @private
   */
  _handleExecutionError(error, toolCall, callId, startTime) {
    let errorType = ToolErrorType.UNKNOWN;
    let errorMessage = error.message || 'Unknown error';

    // 错误类型分类
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      errorType = ToolErrorType.TIMEOUT;
      errorMessage = `Tool "${toolCall.name}" execution timeout`;
    } else if (error.name === 'AbortError' || error.message?.includes('cancelled')) {
      errorType = ToolErrorType.CANCELLED;
    } else if (error.message?.includes('not found') || error.message?.includes('Not Found')) {
      errorType = ToolErrorType.NOT_FOUND;
    } else if (error.message?.includes('validation') || error.message?.includes('invalid')) {
      errorType = ToolErrorType.VALIDATION;
    } else if (error.message?.includes('permission') || error.message?.includes('denied')) {
      errorType = ToolErrorType.PERMISSION;
    } else if (error.message?.includes('rate limit') || error.message?.includes('429')) {
      errorType = ToolErrorType.RATE_LIMIT;
    } else if (error.message?.includes('network') || error.code?.startsWith('ECONN')) {
      errorType = ToolErrorType.NETWORK;
    } else {
      errorType = ToolErrorType.EXECUTION;
    }

    return this.buildToolResult({
      success: false,
      tool: toolCall.name,
      callId,
      error: errorMessage,
      errorType,
      stack: error.stack,
      executionTime: Date.now() - startTime
    });
  }

  /**
   * 生成分调用ID
   * @private
   */
  _generateCallId() {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 将数组分块
   * @private
   */
  _chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 获取活跃调用统计
   */
  getActiveCallsCount() {
    return this._activeCalls.size;
  }
}

/**
 * 创建工具执行器实例
 * @param {Object} options - 配置选项
 * @returns {ToolExecutor}
 */
function createToolExecutor(options = {}) {
  return new ToolExecutor(options);
}

module.exports = {
  ToolExecutor,
  ToolErrorType,
  createToolExecutor
};
