/**
 * 多模型优先级路由与自动降级
 *
 * 功能：
 * - 支持多个模型按优先级调度
 * - 每个模型独立的熔断器保护
 * - 失败时自动降级到下一优先级模型
 * - 首包探测确保输出完整性
 *
 * 为什么要有多模型路由：
 * 1. MiniMax Token Plan 包含多个模型，需要按能力选择
 * 2. 高速版和标准版价格/速度不同，需要合理分配
 * 3. 某个模型故障时自动降级，保障服务可用性
 *
 * @module services/router/MultiModelRouter
 */

const EventEmitter = require('events');
const { breakerFactory } = require('../../common/CircuitBreaker');
const { ProbeBufferingCallback } = require('../../infra/sse/ProbeBufferingCallback');
const AppError = require('../../common/errors/AppError');

// ==================== 模型配置 ====================

/**
 * MiniMax 模型配置
 */
const MINIMAX_MODELS = {
  'MiniMax-M2.7': {
    id: 'MiniMax-M2.7',
    name: 'M2.7 高速版',
    provider: 'minimax',
    capabilities: ['text', 'vision', 'code', 'reasoning'],
    maxTokens: 100000,
    priority: 0,  // 优先级 0 最高
    enabled: true,
    apiType: 'chat'
  },
  'MiniMax-M2.7': {
    id: 'MiniMax-M2.7',
    name: 'M2.7 旗舰编程版',
    provider: 'minimax',
    capabilities: ['text', 'vision', 'code', 'reasoning'],
    maxTokens: 100000,
    priority: 1,
    enabled: true,
    apiType: 'chat'
  },
  'MiniMax-M2.5': {
    id: 'MiniMax-M2.5',
    name: 'M2.5 标准版',
    provider: 'minimax',
    capabilities: ['text', 'code', 'reasoning'],
    maxTokens: 100000,
    priority: 2,
    enabled: true,
    apiType: 'chat'
  },
  'MiniMax-VL-01': {
    id: 'MiniMax-VL-01',
    name: 'VL 多模态版',
    provider: 'minimax',
    capabilities: ['text', 'vision'],
    maxTokens: 32000,
    priority: 3,
    enabled: true,
    apiType: 'chat'
  },
  'MiniMax-Text-01': {
    id: 'MiniMax-Text-01',
    name: 'Text 长文本版',
    provider: 'minimax',
    capabilities: ['text'],
    maxTokens: 400000,
    priority: 4,
    enabled: true,
    apiType: 'chat'
  }
};

// ==================== 路由状态 ====================

/**
 * 路由状态枚举
 */
const RouterState = {
  IDLE: 'IDLE',           // 空闲
  ROUTING: 'ROUTING',     // 路由中
  FALLBACK: 'FALLBACK',   // 降级中
  COMPLETED: 'COMPLETED', // 完成
  FAILED: 'FAILED'        // 全部失败
};

/**
 * 降级原因
 */
const FallbackReason = {
  CIRCUIT_OPEN: 'circuit_open',           // 熔断器打开
  REQUEST_FAILED: 'request_failed',       // 请求失败
  TIMEOUT: 'timeout',                     // 超时
  MODEL_UNAVAILABLE: 'model_unavailable'  // 模型不可用
};

// ==================== 多模型路由器 ====================

class MultiModelRouter extends EventEmitter {
  /**
   * 创建多模型路由器
   * @param {Object} options - 配置选项
   * @param {Array} [options.models] - 自定义模型列表
   * @param {number} [options.failureThreshold=5] - 熔断失败阈值
   * @param {number} [options.successThreshold=3] - 熔断恢复阈值
   * @param {number} [options.resetTimeout=60000] - 熔断重置超时
   * @param {boolean} [options.enableFallback=true] - 是否启用降级
   * @param {boolean} [options.enableProbe=true] - 是否启用首包探测
   */
  constructor(options = {}) {
    super();

    // 合并模型配置
    this.models = new Map();
    this._initModels(options.models);

    // 熔断器配置
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 3;
    this.resetTimeout = options.resetTimeout ?? 60000;

    // 功能开关
    this.enableFallback = options.enableFallback ?? true;
    this.enableProbe = options.enableProbe ?? true;

    // 状态
    this.state = RouterState.IDLE;
    this.currentModel = null;
    this.fallbackChain = [];

    // 统计
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      fallbackCount: 0,
      modelSwitchCount: 0
    };

    // 每个模型的熔断器
    this.circuitBreakers = new Map();
    this._initCircuitBreakers();

    // 首包探测回调（流式输出时使用）
    this.probeCallback = null;
  }

  // ==================== 初始化 ====================

  /**
   * 初始化模型列表
   * @private
   */
  _initModels(customModels) {
    // 先添加 MiniMax 模型
    for (const [id, config] of Object.entries(MINIMAX_MODELS)) {
      this.models.set(id, { ...config });
    }

    // 如果有自定义模型，覆盖或添加
    if (customModels && Array.isArray(customModels)) {
      for (const model of customModels) {
        if (model.id && this.models.has(model.id)) {
          // 更新现有模型配置
          const existing = this.models.get(model.id);
          this.models.set(model.id, { ...existing, ...model });
        } else if (model.id) {
          // 添加新模型
          this.models.set(model.id, { ...model });
        }
      }
    }
  }

  /**
   * 初始化熔断器
   * @private
   */
  _initCircuitBreakers() {
    for (const [id, config] of this.models.entries()) {
      const breaker = breakerFactory.get(`multi_model_${id}`, {
        name: `model_${id}`,
        failureThreshold: this.failureThreshold,
        successThreshold: this.successThreshold,
        timeout: this.resetTimeout
      });

      // 监听熔断器事件
      breaker.on('stateChange', (data) => {
        this.emit('circuit:stateChange', { modelId: id, ...data });
      });

      breaker.on('rejected', (data) => {
        this.emit('circuit:rejected', { modelId: id, ...data });
      });

      this.circuitBreakers.set(id, breaker);
    }
  }

  // ==================== 核心方法 ====================

  /**
   * 获取下一个可用模型
   * @param {string} [currentModelId] - 当前模型 ID，用于避免重复
   * @returns {Object|null} 可用模型配置或 null
   *
   * 选择逻辑：
   * 1. 按 priority 排序（数字越小优先级越高）
   * 2. 检查模型是否启用 (enabled)
   * 3. 检查熔断器状态是否为 CLOSED 或 HALF_OPEN
   * 4. 返回第一个满足条件的模型
   */
  async getNextAvailableModel(currentModelId = null) {
    // 按优先级排序
    const sortedModels = Array.from(this.models.values())
      .filter(m => m.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const model of sortedModels) {
      // 跳过当前模型（避免重复）
      if (currentModelId && model.id === currentModelId) {
        continue;
      }

      // 获取熔断器
      const breaker = this.circuitBreakers.get(model.id);
      if (!breaker) {
        continue;
      }

      // 检查熔断器状态
      if (breaker.canExecute()) {
        return model;
      }

      // 记录熔断状态
      this.emit('model:skipped', {
        modelId: model.id,
        reason: 'circuit_open',
        circuitState: breaker.state
      });
    }

    return null;
  }

  /**
   * 执行带降级的路由请求
   * @param {Object} request - 请求配置
   * @param {Array} request.messages - 消息列表
   * @param {string} [request.preferredModel] - 偏好模型
   * @param {boolean} [request.stream=false] - 是否流式输出
   * @param {Object} [request.options] - 其他选项
   * @returns {Promise<Object>} 响应结果
   *
   * 降级流程：
   * 1. 获取最高优先级的可用模型
   * 2. 执行请求
   * 3. 如果失败，记录失败信息
   * 4. 尝试下一个可用模型
   * 5. 直到所有模型都失败或成功
   */
  async routeWithFallback(request) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    this.stats.totalRequests++;
    this.state = RouterState.ROUTING;
    this.fallbackChain = [];

    const { messages, preferredModel, stream = false, options = {} } = request;

    // 确定初始模型
    let currentModelId = preferredModel || this._getHighestPriorityModel();

    this.emit('route:start', { requestId, initialModel: currentModelId });

    // 最多尝试所有模型
    const maxAttempts = this.models.size;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      const model = await this.getNextAvailableModel(currentModelId);

      if (!model) {
        // 没有可用模型
        this.state = RouterState.FAILED;
        this.emit('route:exhausted', {
          requestId,
          fallbackChain: this.fallbackChain
        });

        return this._createErrorResponse(
          requestId,
          'No available models',
          startTime,
          this.fallbackChain
        );
      }

      this.currentModel = model.id;
      this.emit('route:attempt', {
        requestId,
        model: model.id,
        attempt
      });

      try {
        // 执行请求
        const result = await this._executeWithModel(model, {
          messages,
          stream,
          options
        });

        if (result.success) {
          this.stats.successfulRequests++;
          this.state = RouterState.COMPLETED;
          this.emit('route:success', {
            requestId,
            model: model.id,
            latency: Date.now() - startTime
          });

          return {
            success: true,
            requestId,
            model: model.id,
            result: result.data,
            fallbackChain: this.fallbackChain,
            latency: Date.now() - startTime
          };
        } else {
          // 请求失败，记录到降级链
          this.fallbackChain.push({
            model: model.id,
            reason: result.error || 'Unknown error',
            latency: result.latency || 0
          });

          this.emit('route:fallback', {
            requestId,
            model: model.id,
            reason: result.error,
            nextModel: null
          });

          // 切换到下一个模型
          currentModelId = model.id;
        }
      } catch (error) {
        // 异常发生，记录到降级链
        this.fallbackChain.push({
          model: model.id,
          reason: error.message,
          latency: Date.now() - startTime
        });

        this.emit('route:error', {
          requestId,
          model: model.id,
          error: error.message
        });

        // 切换到下一个模型
        currentModelId = model.id;
      }
    }

    // 所有模型都失败
    this.stats.failedRequests++;
    this.state = RouterState.FAILED;

    this.emit('route:failed', {
      requestId,
      fallbackChain: this.fallbackChain,
      totalAttempts: attempt
    });

    return this._createErrorResponse(
      requestId,
      'All models failed',
      startTime,
      this.fallbackChain
    );
  }

  /**
   * 执行流式请求（带首包探测）
   * @param {Object} request - 请求配置
   * @returns {Promise<Object>} 响应结果
   */
  async routeWithStreaming(request) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    this.stats.totalRequests++;
    this.state = RouterState.ROUTING;
    this.fallbackChain = [];

    const { messages, preferredModel, options = {} } = request;

    // 确定初始模型
    let currentModelId = preferredModel || this._getHighestPriorityModel();

    this.emit('stream:start', { requestId, initialModel: currentModelId });

    // 创建首包探测回调
    if (this.enableProbe) {
      this.probeCallback = new ProbeBufferingCallback({
        firstByteTimeout: options.firstByteTimeout ?? 5000,
        totalTimeout: options.totalTimeout ?? 60000,
        onFirstByte: (latency) => {
          this.emit('stream:firstByte', { requestId, model: currentModelId, latency });
        },
        onComplete: (result) => {
          this.emit('stream:complete', { requestId, model: currentModelId, result: result.toSummary() });
        }
      });
    }

    // 尝试获取可用模型
    let model = await this.getNextAvailableModel(null);
    if (!model) {
      return this._createErrorResponse(requestId, 'No available models', startTime, []);
    }

    this.currentModel = model.id;

    // 执行流式请求
    try {
      const result = await this._executeStreamingWithModel(model, {
        messages,
        options
      });

      if (result.success) {
        this.stats.successfulRequests++;
        this.state = RouterState.COMPLETED;

        return {
          success: true,
          requestId,
          model: model.id,
          stream: result.stream,
          fallbackChain: this.fallbackChain,
          latency: Date.now() - startTime
        };
      } else {
        // 流式请求失败，尝试降级
        this.stats.fallbackCount++;
        this.state = RouterState.FALLBACK;

        // 记录失败
        this.fallbackChain.push({
          model: model.id,
          reason: result.error || 'Stream failed'
        });

        // 递归尝试降级（非流式）
        return this.routeWithFallback(request);
      }
    } catch (error) {
      this.emit('stream:error', { requestId, model: model.id, error: error.message });

      return this._createErrorResponse(
        requestId,
        error.message,
        startTime,
        this.fallbackChain
      );
    }
  }

  // ==================== 模型执行 ====================

  /**
   * 使用指定模型执行请求
   * @private
   */
  async _executeWithModel(model, request) {
    const startTime = Date.now();
    const breaker = this.circuitBreakers.get(model.id);

    if (!breaker) {
      return { success: false, error: 'Circuit breaker not found' };
    }

    try {
      let data;

      if (model.provider === 'minimax') {
        data = await breaker.execute(
          () => this._callMiniMaxAPI(model.id, request),
          () => this._createDegradedResponse()
        );
      } else {
        throw AppError.internalError(`Unknown provider: ${model.provider}`);
      }

      return {
        success: true,
        data,
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * 执行流式请求
   * @private
   */
  async _executeStreamingWithModel(model, request) {
    const breaker = this.circuitBreakers.get(model.id);

    if (!breaker) {
      return { success: false, error: 'Circuit breaker not found' };
    }

    try {
      let stream;

      if (model.provider === 'minimax') {
        stream = await breaker.execute(
          () => this._callMiniMaxAPIStream(model.id, request),
          () => null
        );
      } else {
        throw AppError.internalError(`Unknown provider: ${model.provider}`);
      }

      if (!stream) {
        return { success: false, error: 'Stream is null (circuit open)' };
      }

      return { success: true, stream };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 调用 MiniMax API
   * @private
   */
  async _callMiniMaxAPI(modelId, request) {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      throw AppError.internalError('MINIMAX_API_KEY not configured');
    }

    const baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic';

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages: request.messages,
        max_tokens: request.options.max_tokens || 8192,
        temperature: request.options.temperature || 0.7,
        stream: request.stream !== false,
        ...(request.options.reasoning_split && {
          thinking: {
            type: 'enabled',
            budget_tokens: request.options.thinking_budget || 4000
          }
        })
      }),
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
      const error = await response.text();
      throw AppError.internalError(`MiniMax API Error ${response.status}: ${error}`);
    }

    if (request.stream) {
      return response.body;
    }

    return await response.json();
  }

  /**
   * 调用 MiniMax 流式 API
   * @private
   */
  async _callMiniMaxAPIStream(modelId, request) {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      throw AppError.internalError('MINIMAX_API_KEY not configured');
    }

    const baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic';

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages: request.messages,
        max_tokens: request.options.max_tokens || 8192,
        temperature: request.options.temperature || 0.7,
        stream: true,
        ...(request.options.reasoning_split && {
          thinking: {
            type: 'enabled',
            budget_tokens: request.options.thinking_budget || 4000
          }
        })
      }),
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
      const error = await response.text();
      throw AppError.internalError(`MiniMax API Error ${response.status}: ${error}`);
    }

    return response.body;
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取最高优先级模型
   * @private
   */
  _getHighestPriorityModel() {
    const enabledModels = Array.from(this.models.values())
      .filter(m => m.enabled)
      .sort((a, b) => a.priority - b.priority);

    return enabledModels[0]?.id || null;
  }

  /**
   * 创建降级响应
   * @private
   */
  _createDegradedResponse() {
    return {
      degraded: true,
      error: 'Service temporarily unavailable due to high error rate',
      fallback: true
    };
  }

  /**
   * 创建错误响应
   * @private
   */
  _createErrorResponse(requestId, error, startTime, fallbackChain) {
    this.stats.failedRequests++;

    return {
      success: false,
      requestId,
      error,
      fallbackChain,
      latency: Date.now() - startTime
    };
  }

  // ==================== 公共接口 ====================

  /**
   * 获取路由器状态
   */
  getStatus() {
    const circuitStates = {};
    for (const [modelId, breaker] of this.circuitBreakers.entries()) {
      circuitStates[modelId] = breaker.getState();
    }

    return {
      state: this.state,
      currentModel: this.currentModel,
      enableFallback: this.enableFallback,
      enableProbe: this.enableProbe,
      stats: { ...this.stats },
      circuits: circuitStates
    };
  }

  /**
   * 获取所有模型列表
   */
  getModels() {
    return Array.from(this.models.values()).map(m => ({
      ...m,
      circuitState: this.circuitBreakers.get(m.id)?.state || 'unknown'
    }));
  }

  /**
   * 获取可用模型列表
   */
  getAvailableModels() {
    return Array.from(this.models.values())
      .filter(m => m.enabled)
      .map(m => ({
        ...m,
        circuitState: this.circuitBreakers.get(m.id)?.state || 'unknown',
        available: this.circuitBreakers.get(m.id)?.canExecute() || false
      }));
  }

  /**
   * 启用/禁用模型
   * @param {string} modelId - 模型 ID
   * @param {boolean} enabled - 是否启用
   */
  setModelEnabled(modelId, enabled) {
    const model = this.models.get(modelId);
    if (model) {
      model.enabled = enabled;
      this.emit('model:enabledChange', { modelId, enabled });
    }
  }

  /**
   * 手动重置所有熔断器
   */
  resetAllCircuits() {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
    this.emit('circuit:resetAll');
  }

  /**
   * 重置指定模型的熔断器
   * @param {string} modelId - 模型 ID
   */
  resetCircuit(modelId) {
    const breaker = this.circuitBreakers.get(modelId);
    if (breaker) {
      breaker.reset();
      this.emit('circuit:reset', { modelId });
    }
  }

  /**
   * 强制打开指定模型的熔断器
   * @param {string} modelId - 模型 ID
   */
  forceOpenCircuit(modelId) {
    const breaker = this.circuitBreakers.get(modelId);
    if (breaker) {
      breaker.forceOpen();
      this.emit('circuit:forceOpen', { modelId });
    }
  }

  /**
   * 更新配置
   * @param {Object} options - 新配置
   */
  updateConfig(options) {
    if (options.failureThreshold !== undefined) {
      this.failureThreshold = options.failureThreshold;
    }
    if (options.successThreshold !== undefined) {
      this.successThreshold = options.successThreshold;
    }
    if (options.resetTimeout !== undefined) {
      this.resetTimeout = options.resetTimeout;
    }
    if (options.enableFallback !== undefined) {
      this.enableFallback = options.enableFallback;
    }
    if (options.enableProbe !== undefined) {
      this.enableProbe = options.enableProbe;
    }

    this.emit('config:updated', options);
  }

  /**
   * 销毁路由器
   */
  destroy() {
    // 清除所有熔断器
    for (const breaker of this.circuitBreakers.values()) {
      breaker.destroy();
    }
    this.circuitBreakers.clear();

    // 清除首包探测回调
    if (this.probeCallback) {
      this.probeCallback.abort('router_destroyed');
      this.probeCallback = null;
    }

    this.state = RouterState.IDLE;
    this.emit('destroyed');
  }
}

// ==================== 导出 ====================

// 单例
let routerInstance = null;

function getMultiModelRouter(options = {}) {
  if (!routerInstance) {
    routerInstance = new MultiModelRouter(options);
  }
  return routerInstance;
}

function resetMultiModelRouter() {
  if (routerInstance) {
    routerInstance.destroy();
    routerInstance = null;
  }
}

module.exports = {
  MultiModelRouter,
  getMultiModelRouter,
  resetMultiModelRouter,
  MINIMAX_MODELS,
  RouterState,
  FallbackReason
};
