/**
 * MiniMax 单一架构 - 模型路由器
 * 支持 MiniMax Token Plan API 模型路由
 *
 * 首包探测机制：
 * 在模型切换时，启用首包探测可以确保接收到完整的 SSE 事件后再开始发送数据，
 * 避免用户收到不完整的流式数据。
 */

const EventEmitter = require('events');
const { createCircuitBreaker, getAllBreakersStatus, CB_STATES } = require('../../middleware/circuitBreaker');
const { createSSEFirstChunkProbe, SSEProbeState } = require('../../infra/sse/ProbeBufferingCallback');
const {
  MultiModelRouter,
  getMultiModelRouter,
  MINIMAX_MODELS
} = require('./MultiModelRouter');
const AppError = require('../../common/errors/AppError');

// 使用 MultiModelRouter 中导出的 MINIMAX_MODELS
// 默认模型
const DEFAULT_MODEL = 'MiniMax-M2.7';

class MiniMaxRouter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.models = new Map(Object.entries(MINIMAX_MODELS));
    this.defaultModel = options.defaultModel || DEFAULT_MODEL;
    this.enableFirstChunkProbe = options.enableFirstChunkProbe ?? true;  // 默认启用首包探测
    this.firstChunkProbeTimeout = options.firstChunkProbeTimeout ?? 5000; // 5秒超时
    this.enableMultiModelFallback = options.enableMultiModelFallback ?? true; // 默认启用多模型降级
    this.stats = {
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      probeSuccesses: 0,
      probeFailures: 0,
      fallbackRequests: 0  // 降级请求计数
    };

    // 多模型路由器（延迟初始化）
    this._multiModelRouter = null;
  }

  /**
   * 获取多模型路由器实例
   * @returns {MultiModelRouter}
   */
  getMultiModelRouter() {
    if (!this._multiModelRouter) {
      this._multiModelRouter = new MultiModelRouter({
        failureThreshold: 5,
        successThreshold: 3,
        resetTimeout: 60000,
        enableFallback: this.enableMultiModelFallback,
        enableProbe: this.enableFirstChunkProbe
      });

      // 监听多模型路由器事件
      this._multiModelRouter.on('route:fallback', (data) => {
        this.stats.fallbackRequests++;
        this.emit('fallback:model', data);
      });

      this._multiModelRouter.on('circuit:stateChange', (data) => {
        this.emit('circuit:stateChange', data);
      });
    }
    return this._multiModelRouter;
  }

  /**
   * 获取路由信息
   */
  route(preferredModel) {
    const modelId = preferredModel || this.defaultModel;
    const model = this.models.get(modelId);

    if (!model) {
      return { model: this.defaultModel };
    }

    return { model: modelId };
  }

  /**
   * 执行请求
   * @param {Object} request - 请求参数
   * @param {boolean} [request.enableProbe] - 是否启用首包探测，默认使用实例配置
   * @returns {Promise<Object>} 执行结果
   */
  async execute(request) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    this.stats.totalRequests++;

    const {
      messages,
      model: preferredModel,
      stream = false,
      options = {},
      enableProbe,  // 可选，覆盖默认配置
      useMultiModelFallback = false  // 是否使用多模型降级
    } = request;

    // 决定是否启用首包探测
    const shouldProbe = enableProbe !== undefined ? enableProbe : this.enableFirstChunkProbe;

    // 如果启用多模型降级且非流式请求，使用多模型路由器
    if (useMultiModelFallback && this.enableMultiModelFallback && !stream) {
      return this._executeWithMultiModelFallback(request, requestId, startTime);
    }

    try {
      const routing = this.route(preferredModel || this.defaultModel);
      this._currentModel = routing.model;  // 记录当前模型，用于探测日志

      const apiResult = await this.callAPI(routing.model, {
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 8192,
        stream,
        reasoning_split: options.reasoning_split,
        thinking_budget: options.thinking_budget
      });

      // 如果是流式请求且启用了首包探测，包装响应流
      let result = apiResult;
      let probeInfo = null;

      // 检测是否为浏览器 ReadableStream（Node.js stream 需要特殊处理）
      const isBrowserReadableStream = stream && shouldProbe &&
        typeof apiResult?.getReader === 'function' &&
        typeof apiResult?.pipe !== 'function';

      if (stream && shouldProbe && isBrowserReadableStream) {
        const probeResult = await this._probeStream(apiResult, requestId);
        result = probeResult.stream;
        probeInfo = probeResult.probeResult;

        if (probeResult.success) {
          this.stats.probeSuccesses++;
        } else {
          this.stats.probeFailures++;
        }
      }

      this.stats.successRequests++;
      return {
        success: true,
        requestId,
        model: routing.model,
        result,
        probeInfo  // 首包探测结果（如果有）
      };
    } catch (error) {
      this.stats.failedRequests++;
      this.emit('request:failed', { requestId, error: error.message });
      return {
        success: false,
        requestId,
        error: error.message
      };
    }
  }

  /**
   * 使用多模型降级执行请求
   * @private
   */
  async _executeWithMultiModelFallback(request, requestId, startTime) {
    const multiRouter = this.getMultiModelRouter();

    try {
      const result = await multiRouter.routeWithFallback({
        messages: request.messages,
        preferredModel: request.model,
        stream: false,
        options: request.options
      });

      if (result.success) {
        this.stats.successRequests++;
        this.emit('request:success', {
          requestId,
          model: result.model,
          fallbackChain: result.fallbackChain
        });

        return {
          success: true,
          requestId,
          model: result.model,
          result: result.result,
          fallbackChain: result.fallbackChain,
          usedFallback: result.fallbackChain.length > 0
        };
      } else {
        this.stats.failedRequests++;
        this.emit('request:failed', {
          requestId,
          error: result.error,
          fallbackChain: result.fallbackChain
        });

        return {
          success: false,
          requestId,
          error: result.error,
          fallbackChain: result.fallbackChain
        };
      }
    } catch (error) {
      this.stats.failedRequests++;
      this.emit('request:failed', { requestId, error: error.message });

      return {
        success: false,
        requestId,
        error: error.message
      };
    }
  }

  /**
   * 执行流式请求（支持多模型降级）
   * @param {Object} request - 请求参数
   * @returns {Promise<Object>} 执行结果
   */
  async executeStream(request) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    this.stats.totalRequests++;

    const {
      messages,
      model: preferredModel,
      options = {},
      enableProbe
    } = request;

    const shouldProbe = enableProbe !== undefined ? enableProbe : this.enableFirstChunkProbe;

    try {
      const routing = this.route(preferredModel || this.defaultModel);
      this._currentModel = routing.model;

      const apiResult = await this.callAPI(routing.model, {
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 8192,
        stream: true,
        reasoning_split: options.reasoning_split,
        thinking_budget: options.thinking_budget
      });

      // 如果启用了首包探测且是浏览器 ReadableStream，包装响应流
      let result = apiResult;
      let probeInfo = null;

      // 检测是否为浏览器 ReadableStream
      const isBrowserReadableStream = shouldProbe &&
        typeof apiResult?.getReader === 'function' &&
        typeof apiResult?.pipe !== 'function';

      if (isBrowserReadableStream) {
        const probeResult = await this._probeStream(apiResult, requestId);
        result = probeResult.stream;
        probeInfo = probeResult.probeResult;

        if (probeResult.success) {
          this.stats.probeSuccesses++;
        } else {
          this.stats.probeFailures++;
        }
      }

      this.stats.successRequests++;
      return {
        success: true,
        requestId,
        model: routing.model,
        stream: result,
        probeInfo
      };
    } catch (error) {
      // 流式请求失败时，尝试多模型降级（非流式）
      if (this.enableMultiModelFallback) {
        this.emit('stream:fallback', { requestId, error: error.message });
        return this._executeWithMultiModelFallback({ ...request, stream: false }, requestId, startTime);
      }

      this.stats.failedRequests++;
      this.emit('request:failed', { requestId, error: error.message });

      return {
        success: false,
        requestId,
        error: error.message
      };
    }
  }

  /**
   * 对流式响应进行首包探测
   * @param {ReadableStream} stream - 原始响应流
   * @param {string} requestId - 请求ID
   * @returns {Promise<Object>} 包含探测结果的流
   * @private
   */
  async _probeStream(stream, requestId) {
    return new Promise((resolve) => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let firstChunkTime = null;
      let probeCompleted = false;
      let pendingData = '';  // 探测完成后的待发送数据

      // 创建首包探测器
      const probe = createSSEFirstChunkProbe({
        firstEventTimeout: this.firstChunkProbeTimeout,
        onFirstEvent: (result) => {
          // 首包探测成功
          probeCompleted = true;
          this.emit('probe:success', {
            requestId,
            latency: result.firstEventLatency,
            model: this._currentModel
          });
        },
        onError: (error) => {
          // 首包探测失败
          probeCompleted = true;
          this.emit('probe:error', {
            requestId,
            error: error.message,
            model: this._currentModel
          });
        },
        onData: (eventName, data) => {
          // 探测期间不发送数据，等待探测完成
        }
      });

      // 超时控制
      const timeout = setTimeout(() => {
        if (!probeCompleted) {
          probeCompleted = true;
          this.emit('probe:timeout', { requestId, model: this._currentModel });
        }
      }, this.firstChunkProbeTimeout);

      // 创建新的可读流，带有首包探测
      const probedStream = new ReadableStream({
        async start(controller) {
          // 定期检查是否有待发送的数据
          const checkInterval = setInterval(() => {
            if (probeCompleted && pendingData.length > 0) {
              try {
                controller.enqueue(new TextEncoder().encode(pendingData));
                pendingData = '';
              } catch (e) {
                // 流可能已关闭
              }
            }
          }, 10);
        },
        async pull(controller) {
          const { done, value } = await reader.read();

          if (done) {
            clearTimeout(timeout);
            if (!probeCompleted && pendingData.length > 0) {
              try {
                controller.enqueue(new TextEncoder().encode(pendingData));
              } catch (e) {
                // 忽略
              }
            }
            controller.close();
            return;
          }

          const chunk = decoder.decode(value, { stream: true });

          if (firstChunkTime === null) {
            firstChunkTime = Date.now();
          }

          if (probeCompleted) {
            // 探测已完成，直接发送数据
            pendingData += chunk;
          } else {
            // 还在探测中，喂给探测器
            probe.handleSSE(chunk);

            // 如果数据中有完整事件且探测已完成
            if (probeCompleted) {
              pendingData += chunk;
            }
          }
        },
        cancel() {
          clearTimeout(timeout);
          reader.cancel();
        }
      });

      resolve({
        success: true,
        stream: probedStream,
        probeResult: {
          state: probe.getState(),
          isReady: probe.isReady()
        }
      });
    });
  }

  /**
   * 调用 MiniMax API
   * @param {string} modelId - 模型ID
   * @param {Object} request - 请求参数
   * @returns {Promise<Object>}
   */
  async callAPI(modelId, request) {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      throw AppError.internalError('MINIMAX_API_KEY not configured');
    }

    const baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic';
    const startTime = Date.now();

    // 获取指标采集器
    let collector = null;
    try {
      const { getMetricsCollector } = require('../infra/metrics');
      collector = getMetricsCollector();
    } catch (e) {
      // 指标采集器未初始化
    }

    // Opossum 熔断器配置
    const breakerName = `minimax_${modelId}`;
    const breakerOptions = {
      name: breakerName,
      timeout: 10000,                    // 10秒超时
      errorThresholdPercentage: 50,       // 50% 失败率
      resetTimeout: 30000,                // 30秒后尝试恢复
      minimumNumberOfCalls: 10,           // 至少10次调用
      volumeThreshold: 5                   // 需要5次调用开始计算
    };

    // Fallback 函数：熔断打开时返回友好错误
    const fallback = () => ({
      error: 'MiniMax API 暂时不可用，请稍后重试',
      fallback: true,
      circuitBreaker: breakerName,
      degraded: true
    });

    // 执行请求，受 Opossum 熔断器保护
    return await createCircuitBreaker(async () => {
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
          max_tokens: request.max_tokens,
          temperature: request.temperature,
          stream: request.stream !== false,
          ...(request.reasoning_split && {
            thinking: {
              type: 'enabled',
              budget_tokens: request.thinking_budget || 4000
            }
          })
        }),
        signal: AbortSignal.timeout(120000)
      });

      // 记录模型 API 耗时
      const apiLatency = Date.now() - startTime;
      if (collector) {
        collector.recordHistogram('model_api_duration_seconds', apiLatency / 1000, { model: modelId });
        collector.incrementCounter('model_requests_total', { model: modelId, status: response.status });
      }

      if (!response.ok) {
        if (collector) {
          collector.incrementCounter('model_errors_total', { model: modelId, status: response.status });
        }
        let errorText = await response.text();
        let errorMessage = `MiniMax API Error ${response.status}`;

        // 尝试解析错误 JSON
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.error?.type || errorMessage;
        } catch (e) {
          // 如果不是 JSON，使用原始文本（如果较短）
          if (errorText && errorText.length < 200) {
            errorMessage = errorText;
          }
        }

        // 根据状态码添加上下文
        if (response.status === 400) {
          errorMessage = `请求参数错误: ${errorMessage}`;
        } else if (response.status === 401 || response.status === 403) {
          errorMessage = `认证失败: ${errorMessage}`;
        } else if (response.status === 429) {
          errorMessage = `请求过于频繁(限流): ${errorMessage}`;
        } else if (response.status >= 500) {
          errorMessage = `MiniMax服务错误: ${errorMessage}`;
        }

        throw AppError.internalError(errorMessage);
      }

      if (request.stream) {
        return response.body;
      }

      const result = await response.json();

      // 记录 token 消耗（非流式响应）
      if (result && collector) {
        const inputTokens = result.usage?.input_tokens || 0;
        const outputTokens = result.usage?.output_tokens || 0;
        const totalTokens = inputTokens + outputTokens;
        if (totalTokens > 0) {
          collector.incrementCounter('model_tokens_total', { model: modelId }, totalTokens);
          collector.recordHistogram('model_tokens_per_request', totalTokens, { model: modelId });
        }
      }

      return result;
    }, breakerOptions).then(result => {
      // 如果返回 fallback 结果，添加熔断器信息
      if (result && result.fallback && result.circuitBreaker) {
        return result;
      }
      return result;
    }).catch(error => {
      // 捕获熔断器拒绝的错误
      this.emit('circuit:rejected', { model: modelId, error: error.message });
      return {
        error: 'MiniMax API 暂时不可用，请稍后重试',
        fallback: true,
        circuitBreaker: breakerName,
        degraded: true
      };
    });
  }

  /**
   * 获取统计
   */
  getStats() {
    const stats = {
      ...this.stats,
      models: Object.fromEntries(this.models),
      defaultModel: this.defaultModel,
      probeEnabled: this.enableFirstChunkProbe,
      probeTimeout: this.firstChunkProbeTimeout,
      multiModelEnabled: this.enableMultiModelFallback
    };

    // 如果多模型路由器已初始化，添加其状态
    if (this._multiModelRouter) {
      stats.multiModelStatus = this._multiModelRouter.getStatus();
    }

    return stats;
  }

  /**
   * 启用/禁用首包探测
   * @param {boolean} enabled - 是否启用
   */
  setProbeEnabled(enabled) {
    this.enableFirstChunkProbe = enabled;
    this.emit('config:changed', { probeEnabled: enabled });
  }

  /**
   * 设置首包探测超时时间
   * @param {number} timeout - 超时时间（毫秒）
   */
  setProbeTimeout(timeout) {
    this.firstChunkProbeTimeout = timeout;
    this.emit('config:changed', { probeTimeout: timeout });
  }

  /**
   * 启用/禁用多模型降级
   * @param {boolean} enabled - 是否启用
   */
  setMultiModelFallbackEnabled(enabled) {
    this.enableMultiModelFallback = enabled;
    this.emit('config:changed', { multiModelFallbackEnabled: enabled });
  }

  /**
   * 获取可用模型列表
   */
  getAvailableModels() {
    return Array.from(this.models.entries()).map(([id, config]) => ({
      id,
      ...config
    }));
  }

  /**
   * 获取所有模型列表（包括多模型路由器的模型）
   */
  getAllModels() {
    if (this._multiModelRouter) {
      return this._multiModelRouter.getModels();
    }
    return this.getAvailableModels();
  }

  /**
   * 获取可用模型列表（考虑熔断器状态）
   */
  getAvailableModelsWithHealth() {
    if (this._multiModelRouter) {
      return this._multiModelRouter.getAvailableModels();
    }
    return this.getAvailableModels();
  }

  /**
   * 重置所有熔断器
   */
  resetAllCircuits() {
    // 重置当前路由器的熔断器
    breakerFactory.resetAll();

    // 重置多模型路由器的熔断器
    if (this._multiModelRouter) {
      this._multiModelRouter.resetAllCircuits();
    }

    this.emit('circuits:reset');
  }

  /**
   * 销毁路由器
   */
  destroy() {
    if (this._multiModelRouter) {
      this._multiModelRouter.destroy();
      this._multiModelRouter = null;
    }
    this.emit('destroyed');
  }
}

// 单例
const router = new MiniMaxRouter();

module.exports = {
  MiniMaxRouter,
  router,
  MINIMAX_MODELS,
  DEFAULT_MODEL,
  // 多模型路由
  MultiModelRouter,
  getMultiModelRouter,
  MINIMAX_MODELS
};
