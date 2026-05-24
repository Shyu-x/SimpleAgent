/**
 * 工具执行器 - ToolExecutor
 *
 * 为什么需要独立的执行器：
 * 企业级Agent需要：失败降级、结果合并、超时控制、并行执行
 * 如果把工具调用写在业务逻辑里，会非常混乱且难以维护。
 *
 * 设计模式：
 * - 策略模式：不同工具执行策略
 * - 责任链模式：执行器链
 * - 观察者模式：执行事件通知
 */

const EventEmitter = require('events');
const AppError = require('../../common/errors/AppError');
const { sleep, calculateBackoffDelay } = require('../../utils/retry');

// 指标采集器（延迟初始化）
let _metricsCollector = null;
function getCollector() {
  if (!_metricsCollector) {
    try {
      const { getMetricsCollector } = require('../../infra/metrics');
      _metricsCollector = getMetricsCollector();
    } catch (e) {
      // 指标采集器未初始化
    }
  }
  return _metricsCollector;
}

/**
 * 工具执行结果
 */
class ToolResult {
  constructor(toolName, success, result, error, duration) {
    this.toolName = toolName;
    this.success = success;
    this.result = result;
    this.error = error;
    this.duration = duration;
    this.timestamp = Date.now();
  }

  toJSON() {
    return {
      toolName: this.toolName,
      success: this.success,
      result: this.result,
      error: this.error?.message || this.error,
      duration: this.duration,
      timestamp: this.timestamp
    };
  }
}

/**
 * 工具执行器
 */
class ToolExecutor extends EventEmitter {
  constructor(options = {}) {
    super();

    // 工具注册表
    this.toolRegistry = options.toolRegistry || new Map();

    // 执行配置
    this.defaultTimeout = options.defaultTimeout || 60000;  // 60秒
    this.maxRetries = options.maxRetries || 0;
    this.retryDelay = options.retryDelay || 1000;

    // 并发控制
    this.maxConcurrent = options.maxConcurrent || 5;
    this.runningCount = 0;
    this.pendingQueue = [];

    // 执行策略
    this.strategy = options.strategy || 'sequential'; // sequential | parallel | auto
  }

  /**
   * 注册工具
   */
  registerTool(tool) {
    this.toolRegistry.set(tool.name, tool);
    return this;
  }

  /**
   * 注册多个工具
   */
  registerTools(tools) {
    for (const tool of tools) {
      this.registerTool(tool);
    }
    return this;
  }

  /**
   * 执行单个工具
   * @param {string} toolName - 工具名称
   * @param {Object} params - 工具参数
   * @param {Object} options - 执行选项
   */
  async executeTool(toolName, params, options = {}) {
    const tool = this.toolRegistry.get(toolName);
    if (!tool) {
      return new ToolResult(toolName, false, null, new Error(`Tool not found: ${toolName}`), 0);
    }

    const timeout = options.timeout || tool.timeout || this.defaultTimeout;
    const retries = options.retries !== undefined ? options.retries : this.maxRetries;

    let lastError;
    const startTime = Date.now();

    // 重试循环
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.emit('tool:start', { toolName, params, attempt });

        // 执行工具
        const result = await this._executeWithTimeout(tool, params, timeout);

        const duration = Date.now() - startTime;

        // 记录工具执行指标
        const collector = getCollector();
        if (collector) {
          collector.recordHistogram('tool_duration_seconds', duration / 1000, { tool: toolName });
          collector.incrementCounter('tool_calls_total', { tool: toolName, success: 'true' });
        }

        this.emit('tool:success', { toolName, duration, attempt });

        return new ToolResult(toolName, true, result, null, duration);
      } catch (error) {
        lastError = error;

        // 记录工具错误指标
        const collector = getCollector();
        if (collector) {
          collector.incrementCounter('tool_errors_total', { tool: toolName, error_type: error.name || 'unknown' });
        }

        this.emit('tool:error', { toolName, error, attempt });

        // 如果不是最后一次尝试，等待后重试
        if (attempt < retries) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          await sleep(delay); // 指数退避
        }
      }
    }

    // 所有重试都失败
    const duration = Date.now() - startTime;
    return new ToolResult(toolName, false, null, lastError, duration);
  }

  /**
   * 执行多个工具（根据策略）
   * @param {Array} toolCalls - [{toolName, params}, ...]
   * @param {Object} options - 执行选项
   */
  async executeTools(toolCalls, options = {}) {
    const strategy = options.strategy || this.strategy;

    switch (strategy) {
      case 'parallel':
        return this._executeParallel(toolCalls, options);
      case 'sequential':
        return this._executeSequential(toolCalls, options);
      case 'auto':
        // 根据工具是否有依赖关系自动选择
        return this._executeAuto(toolCalls, options);
      default:
        return this._executeSequential(toolCalls, options);
    }
  }

  /**
   * 串行执行
   */
  async _executeSequential(toolCalls, options = {}) {
    const results = [];
    for (const { toolName, params } of toolCalls) {
      // 检查并发控制
      await this._waitForSlot();
      const result = await this.executeTool(toolName, params, options);
      results.push(result);
    }
    return results;
  }

  /**
   * 并行执行
   */
  async _executeParallel(toolCalls, options = {}) {
    // 限制并发数
    const batchSize = options.batchSize || this.maxConcurrent;
    const results = [];

    for (let i = 0; i < toolCalls.length; i += batchSize) {
      const batch = toolCalls.slice(i, i + batchSize);
      const batchPromises = batch.map(({ toolName, params }) =>
        this.executeTool(toolName, params, options)
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 自动执行（根据依赖关系）
   */
  async _executeAuto(toolCalls, options = {}) {
    // 分析依赖关系
    const { independent, dependent } = this._analyzeDependencies(toolCalls);

    const results = [];

    // 先执行独立任务（并行）
    if (independent.length > 0) {
      const independentResults = await this._executeParallel(independent, options);
      results.push(...independentResults);
    }

    // 再执行有依赖的任务（串行）
    for (const { toolName, params, dependsOn } of dependent) {
      // 等待依赖完成
      if (dependsOn) {
        await this._waitForDependency(dependsOn, results);
      }
      const result = await this.executeTool(toolName, params, options);
      results.push(result);
    }

    return results;
  }

  /**
   * 分析依赖关系
   */
  _analyzeDependencies(toolCalls) {
    const independent = [];
    const dependent = [];

    for (const call of toolCalls) {
      // 简单检测：如果参数中引用了其他工具的结果，则有依赖
      const paramsStr = JSON.stringify(call.params);
      const hasDependency = toolCalls.some(other =>
        other !== call &&
        other.toolName !== call.toolName &&
        paramsStr.includes(`$${other.toolName}`)
      );

      if (hasDependency) {
        dependent.push({
          ...call,
          dependsOn: toolCalls.find(other =>
            other !== call && paramsStr.includes(`$${other.toolName}`)
          )?.toolName
        });
      } else {
        independent.push(call);
      }
    }

    return { independent, dependent };
  }

  /**
   * 等待依赖完成
   */
  async _waitForDependency(dependency, results) {
    const maxWait = 30000; // 最多等30秒
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const depResult = results.find(r => r.toolName === dependency);
      if (depResult && depResult.success) {
        return;
      }
      await sleep(100);
    }

    throw AppError.internalError(`Dependency ${dependency} did not complete successfully`);
  }

  /**
   * 等待并发槽位
   */
  async _waitForSlot() {
    while (this.runningCount >= this.maxConcurrent) {
      await sleep(100);
    }
    this.runningCount++;
  }

  /**
   * 带超时执行
   */
  _executeWithTimeout(tool, params, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool ${tool.name} execution timeout after ${timeout}ms`));
      }, timeout);

      tool.execute(params)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 合并多个工具的结果
   */
  mergeResults(results) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      results: results.map(r => r.toJSON()),
      // 成功结果的合并
      mergedContent: successful
        .map(r => {
          if (typeof r.result === 'string') return r.result;
          if (r.result && r.result.content) return r.result.content;
          return JSON.stringify(r.result);
        })
        .join('\n\n'),
      // 错误汇总
      errors: failed.map(r => ({
        tool: r.toolName,
        error: r.error?.message || r.error
      }))
    };
  }
}

/**
 * 工具执行器工厂
 */
class ToolExecutorFactory {
  constructor() {
    this.executors = new Map();
  }

  /**
   * 获取或创建执行器
   */
  get(name = 'default', options) {
    if (!this.executors.has(name)) {
      this.executors.set(name, new ToolExecutor(options));
    }
    return this.executors.get(name);
  }

  /**
   * 创建配置好的执行器
   */
  createConfigured(config) {
    const executor = this.get(config.name || 'default');

    // 配置执行策略
    executor.strategy = config.strategy || 'sequential';
    executor.defaultTimeout = config.timeout || 60000;
    executor.maxRetries = config.retries || 0;
    executor.maxConcurrent = config.maxConcurrent || 5;

    return executor;
  }
}

// 全局工厂
const executorFactory = new ToolExecutorFactory();

module.exports = {
  ToolExecutor,
  ToolResult,
  ToolExecutorFactory,
  executorFactory
};
