/**
 * 模型路由器
 * @description 支持多模型接入、主备路由、健康检查和故障转移
 *
 * @author AI Chat 玩具团队
 * @date 2026-03-21
 */

const { CircuitBreaker, CircuitState } = require('../../infra/circuitBreaker/CircuitBreaker');
const { CircuitBreakerFactory, Presets } = require('../../infra/circuitBreaker/CircuitBreakerFactory');
const { HealthChecker, HealthStatus } = require('./HealthChecker');
const AppError = require('../../common/errors/AppError');
const createLogger = require('../../common/logger');
const logger = createLogger('ModelRouter');

/**
 * 路由策略枚举
 */
const RouterStrategy = {
  /** 优先级策略：按优先级顺序选择第一个健康的模型 */
  PRIORITY: 'priority',
  /** 轮询策略：均匀分配负载 */
  ROUND_ROBIN: 'round_robin',
  /** 加权随机策略：根据权重随机选择 */
  WEIGHTED_RANDOM: 'weighted_random',
  /** 性能优先策略：选择延迟最低的模型 */
  LATENCY_BASED: 'latency_based'
};

/**
 * 路由事件枚举
 */
const RouterEvent = {
  MODEL_SELECTED: 'router:model_selected',
  MODEL_FAILED: 'router:model_failed',
  MODEL_RECOVERED: 'router:model_recovered',
  ALL_MODELS_UNAVAILABLE: 'router:all_unavailable',
  ROUTE_ATTEMPT: 'router:attempt'
};

class ModelRouter {
  /**
   * 创建模型路由器
   * @param {Object} options - 配置选项
   * @param {Array} options.models - 模型配置列表
   * @param {string} options.models[].name - 模型名称
   * @param {Function} options.models[].callFn - 模型调用函数
   * @param {number} [options.models[].priority=1] - 优先级（数字越大优先级越高）
   * @param {number} [options.models[].weight=1] - 权重（用于加权随机策略）
   * @param {string} [options.strategy='priority'] - 路由策略
   * @param {CircuitBreakerFactory} [options.circuitBreakerFactory] - 熔断器工厂
   * @param {Function} [options.onEvent] - 事件回调
   *
   * @example
   * const router = new ModelRouter({
   *   models: [
   *     { name: 'MiniMax-M2.7', callFn: callM27, priority: 3 },
   *     { name: 'MiniMax-M2.5', callFn: callM25, priority: 2 },
   *     { name: 'MiniMax-VL-01', callFn: callVL, priority: 1 }
   *   ],
   *   strategy: 'priority'
   * });
   *
   * const result = await router.route(prompt);
   */
  constructor(options = {}) {
    if (!options.models || options.models.length === 0) {
      throw AppError.internalError('At least one model is required');
    }

    this._models = options.models.map((m, index) => ({
      id: m.name,
      name: m.name,
      callFn: m.callFn,
      priority: m.priority ?? 1,
      weight: m.weight ?? 1,
      enabled: m.enabled !== false,
      index
    }));

    this._strategy = options.strategy ?? RouterStrategy.PRIORITY;
    this._onEvent = options.onEvent || (() => {});

    // 熔断器工厂
    this._cbFactory = options.circuitBreakerFactory || new CircuitBreakerFactory();

    // 为每个模型创建熔断器
    this._circuitBreakers = new Map();
    for (const model of this._models) {
      const breaker = this._cbFactory.getForModel(model.name);
      this._circuitBreakers.set(model.name, breaker);

      // 监听熔断器状态变化
      breaker.onStateChange = (from, to, reason) => {
        this._onCircuitStateChange(model.name, from, to, reason);
      };
    }

    // 健康检查器映射
    this._healthCheckers = new Map();

    // 统计数据
    this._stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      fallbackRequests: 0,
      modelUsage: {}  // 每个模型的使用次数
    };

    // 初始化模型使用统计
    for (const model of this._models) {
      this._stats.modelUsage[model.name] = 0;
    }

    // 轮询索引（用于 ROUND_ROBIN 策略）
    this._roundRobinIndex = 0;

    // 延迟记录（用于 LATENCY_BASED 策略）
    this._latencies = new Map();
    for (const model of this._models) {
      this._latencies.set(model.name, []);
    }
  }

  // ==================== 公共接口 ====================

  /**
   * 执行路由调用
   * @param {Object} params - 调用参数
   * @param {string} params.prompt - 提示词
   * @param {Object} [params.options] - 模型调用选项
   * @param {Function} [params.fallbackFn] - 所有模型都失败时的兜底函数
   * @returns {Promise<any>} 调用结果
   *
   * @example
   * const result = await router.route({
   *   prompt: 'Hello, world!',
   *   options: { temperature: 0.7 },
   *   fallbackFn: () => getCachedResponse()
   * });
   */
  async route(params) {
    const { prompt, options = {}, fallbackFn = null } = params;

    this._stats.totalRequests++;

    // 尝试按策略选择模型
    const candidates = this._getCandidateModels();
    if (candidates.length === 0) {
      this._emitEvent(RouterEvent.ALL_MODELS_UNAVAILABLE, { prompt });
      if (fallbackFn) {
        this._stats.fallbackRequests++;
        return await fallbackFn();
      }
      throw AppError.internalError('All models are unavailable');
    }

    // 按策略排序候选模型
    const sortedCandidates = this._sortCandidates(candidates);

    // 尝试每个模型直到成功
    let lastError = null;
    for (const model of sortedCandidates) {
      this._emitEvent(RouterEvent.ROUTE_ATTEMPT, {
        model: model.name,
        attempt: this._stats.totalRequests
      });

      try {
        const startTime = Date.now();
        const breaker = this._circuitBreakers.get(model.name);

        const result = await breaker.execute(
          () => model.callFn(prompt, options),
          null  // 不使用降级函数，让熔断器处理
        );

        const latency = Date.now() - startTime;

        // 记录延迟
        this._recordLatency(model.name, latency);

        // 更新统计
        this._stats.successfulRequests++;
        this._stats.modelUsage[model.name]++;

        this._emitEvent(RouterEvent.MODEL_SELECTED, {
          model: model.name,
          latency,
          attempt: this._stats.totalRequests
        });

        return result;

      } catch (error) {
        lastError = error;
        this._stats.failedRequests++;

        this._emitEvent(RouterEvent.MODEL_FAILED, {
          model: model.name,
          error: error.message,
          attempt: this._stats.totalRequests
        });

        // 继续尝试下一个模型
        continue;
      }
    }

    // 所有模型都失败了
    this._emitEvent(RouterEvent.ALL_MODELS_UNAVAILABLE, {
      prompt,
      lastError: lastError?.message
    });

    if (fallbackFn) {
      this._stats.fallbackRequests++;
      return await fallbackFn();
    }

    throw lastError || new Error('All models failed');
  }

  /**
   * 直接调用指定模型（绕过路由策略）
   * @param {string} modelName - 模型名称
   * @param {string} prompt - 提示词
   * @param {Object} [options] - 调用选项
   * @returns {Promise<any>} 调用结果
   */
  async callDirect(modelName, prompt, options = {}) {
    const model = this._models.find(m => m.name === modelName);
    if (!model) {
      throw AppError.notFound(`Model ${modelName}`);
    }

    const breaker = this._circuitBreakers.get(modelName);
    return await breaker.execute(
      () => model.callFn(prompt, options),
      null
    );
  }

  /**
   * 获取模型状态
   * @returns {Array} 每个模型的状态信息
   */
  getModelStatuses() {
    return this._models.map(model => {
      const breaker = this._circuitBreakers.get(model.name);
      const healthChecker = this._healthCheckers.get(model.name);

      return {
        name: model.name,
        enabled: model.enabled,
        priority: model.priority,
        weight: model.weight,
        circuitState: breaker?.state || CircuitState.CLOSED,
        healthStatus: healthChecker?.status || HealthStatus.UNKNOWN,
        usage: this._stats.modelUsage[model.name],
        avgLatency: this._calculateAvgLatency(model.name)
      };
    });
  }

  /**
   * 获取路由器统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this._stats,
      successRate: this._stats.totalRequests > 0
        ? (this._stats.successfulRequests / this._stats.totalRequests * 100).toFixed(2) + '%'
        : 'N/A',
      fallbackRate: this._stats.totalRequests > 0
        ? (this._stats.fallbackRequests / this._stats.totalRequests * 100).toFixed(2) + '%'
        : 'N/A'
    };
  }

  /**
   * 获取当前策略
   * @returns {string}
   */
  getStrategy() {
    return this._strategy;
  }

  /**
   * 设置路由策略
   * @param {string} strategy - 新策略
   */
  setStrategy(strategy) {
    if (!Object.values(RouterStrategy).includes(strategy)) {
      throw AppError.validationError('strategy', `Invalid strategy: ${strategy}`);
    }
    this._strategy = strategy;
  }

  /**
   * 启用/禁用模型
   * @param {string} modelName - 模型名称
   * @param {boolean} enabled - 是否启用
   */
  setModelEnabled(modelName, enabled) {
    const model = this._models.find(m => m.name === modelName);
    if (model) {
      model.enabled = enabled;
    }
  }

  /**
   * 为模型启动健康检查
   * @param {string} modelName - 模型名称
   * @param {Object} [options] - 健康检查选项
   */
  startHealthCheck(modelName, options = {}) {
    const model = this._models.find(m => m.name === modelName);
    if (!model) {
      throw AppError.notFound(`Model ${modelName}`);
    }

    const checker = new HealthChecker({
      healthCheckFn: async () => {
        try {
          await model.callFn('health_check_ping', {});
          return true;
        } catch {
          return false;
        }
      },
      ...options,
      onStatusChange: (from, to, details) => {
        logger.debug(`模型 ${modelName} 健康状态变化: ${from} -> ${to}`, details);
      }
    });

    checker.start();
    this._healthCheckers.set(modelName, checker);
  }

  /**
   * 停止所有健康检查
   */
  stopAllHealthChecks() {
    for (const checker of this._healthCheckers.values()) {
      checker.stop();
    }
    this._healthCheckers.clear();
  }

  /**
   * 获取熔断器工厂（用于外部管理）
   * @returns {CircuitBreakerFactory}
   */
  getCircuitBreakerFactory() {
    return this._cbFactory;
  }

  /**
   * 获取指定模型的熔断器
   * @param {string} modelName - 模型名称
   * @returns {CircuitBreaker|undefined}
   */
  getCircuitBreaker(modelName) {
    return this._circuitBreakers.get(modelName);
  }

  // ==================== 私有方法 ====================

  /**
   * 获取候选模型列表
   * @private
   */
  _getCandidateModels() {
    return this._models.filter(model => {
      if (!model.enabled) return false;

      const breaker = this._circuitBreakers.get(model.name);
      return breaker && breaker.canExecute();
    });
  }

  /**
   * 按策略排序候选模型
   * @private
   */
  _sortCandidates(candidates) {
    switch (this._strategy) {
      case RouterStrategy.PRIORITY:
        return [...candidates].sort((a, b) => b.priority - a.priority);

      case RouterStrategy.ROUND_ROBIN:
        return this._roundRobinSort(candidates);

      case RouterStrategy.WEIGHTED_RANDOM:
        return this._weightedRandomSort(candidates);

      case RouterStrategy.LATENCY_BASED:
        return this._latencyBasedSort(candidates);

      default:
        return candidates;
    }
  }

  /**
   * 轮询排序
   * @private
   */
  _roundRobinSort(candidates) {
    if (candidates.length === 0) return candidates;

    const sorted = [];
    const startIndex = this._roundRobinIndex % candidates.length;

    for (let i = 0; i < candidates.length; i++) {
      const index = (startIndex + i) % candidates.length;
      sorted.push(candidates[index]);
    }

    this._roundRobinIndex++;
    return sorted;
  }

  /**
   * 加权随机排序
   * @private
   */
  _weightedRandomSort(candidates) {
    const totalWeight = candidates.reduce((sum, m) => sum + m.weight, 0);
    let random = Math.random() * totalWeight;

    const sorted = [];
    const remaining = [...candidates];

    while (remaining.length > 0) {
      for (let i = 0; i < remaining.length; i++) {
        random -= remaining[i].weight;
        if (random <= 0) {
          sorted.push(remaining.splice(i, 1)[0]);
          break;
        }
      }
    }

    return sorted;
  }

  /**
   * 基于延迟排序
   * @private
   */
  _latencyBasedSort(candidates) {
    return [...candidates].sort((a, b) => {
      const avgA = this._calculateAvgLatency(a.name);
      const avgB = this._calculateAvgLatency(b.name);
      return avgA - avgB;
    });
  }

  /**
   * 记录延迟
   * @private
   */
  _recordLatency(modelName, latency) {
    const latencies = this._latencies.get(modelName);
    if (latencies) {
      latencies.push(latency);
      // 保留最近 100 次记录
      if (latencies.length > 100) {
        latencies.shift();
      }
    }
  }

  /**
   * 计算平均延迟
   * @private
   */
  _calculateAvgLatency(modelName) {
    const latencies = this._latencies.get(modelName);
    if (!latencies || latencies.length === 0) {
      return null;
    }
    const sum = latencies.reduce((a, b) => a + b, 0);
    return (sum / latencies.length).toFixed(2) + 'ms';
  }

  /**
   * 熔断器状态变化处理
   * @private
   */
  _onCircuitStateChange(modelName, from, to, reason) {
    if (to === CircuitState.CLOSED && from !== CircuitState.CLOSED) {
      this._emitEvent(RouterEvent.MODEL_RECOVERED, { model: modelName, reason });
    }
  }

  /**
   * 触发事件
   * @private
   */
  _emitEvent(event, data = {}) {
    this._onEvent(event, { ...data, router: 'default', timestamp: Date.now() });
  }
}

/**
 * MiniMax 模型路由器
 * @description 专门为 MiniMax 模型创建的路由器
 */
class MiniMaxModelRouter extends ModelRouter {
  /**
   * 创建 MiniMax 模型路由器
   * @param {Object} options - 配置选项
   * @param {Function} options.callMiniMax - 调用 MiniMax 的函数
   * @param {Array} [options.modelNames] - 要使用的模型名称列表
   * @returns {MiniMaxModelRouter}
   *
   * @example
   * const router = MiniMaxModelRouter.create({
   *   callMiniMax: async (model, prompt, options) => callAPI(model, prompt, options)
   * });
   */
  static create(options) {
    const modelConfigs = [
      { name: 'MiniMax-M2.7', priority: 5, weight: 3 },
      { name: 'MiniMax-M2.7', priority: 4, weight: 3 },
      { name: 'MiniMax-M2.5', priority: 3, weight: 2 },
      { name: 'MiniMax-VL-01', priority: 2, weight: 1 },
      { name: 'MiniMax-Text-01', priority: 1, weight: 1 }
    ];

    // 过滤指定的模型
    const filteredModels = options.modelNames
      ? modelConfigs.filter(m => options.modelNames.includes(m.name))
      : modelConfigs;

    // 如果没有指定模型或过滤后为空，使用默认配置
    const models = filteredModels.length > 0 ? filteredModels : modelConfigs;

    return new MiniMaxModelRouter({
      models: models.map(m => ({
        name: m.name,
        priority: m.priority,
        weight: m.weight,
        callFn: (prompt, opts) => options.callMiniMax(m.name, prompt, opts)
      })),
      strategy: RouterStrategy.PRIORITY
    });
  }
}

module.exports = {
  ModelRouter,
  MiniMaxModelRouter,
  RouterStrategy,
  RouterEvent
};
