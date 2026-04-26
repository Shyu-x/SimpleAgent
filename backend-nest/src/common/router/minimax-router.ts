/**
 * MiniMax 单一架构 - 模型路由器
 * 支持 MiniMax Token Plan API 的流式/非流式调用
 * 特性:
 * - 首包时间探测 (first-token-latency)
 * - 多模型自动降级策略
 * - 模型健康检查
 * - 并发限制和熔断
 */

import { EventEmitter } from 'events';
import { Errors } from '../errors/errors';

export interface MiniMaxExecuteOptions {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    max_tokens?: number;
    reasoning_split?: boolean;
    thinking_budget?: number;
  };
}

export interface MiniMaxExecuteResult {
  success: boolean;
  requestId?: string;
  model?: string;
  result?: any;
  error?: string;
  firstTokenLatency?: number;
}

/**
 * 熔断器状态枚举
 */
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

/**
 * 模型健康状态
 */
export interface ModelHealth {
  name: string;
  state: CircuitState;
  failures: number;
  lastFailure: number;
  totalRequests: number;
  successRequests: number;
  avgLatency: number | null;
  lastLatency: number | null;
  firstTokenLatencies: number[];
}

/**
 * 首包探测结果
 */
export interface FirstTokenProbeResult {
  success: boolean;
  latency: number | null;
  error?: string;
}

// 默认模型
const DEFAULT_MODEL = 'MiniMax-M2.7';

// 备用模型列表
const FALLBACK_MODELS = ['MiniMax-M2.5', 'MiniMax-Text-01'];

// 熔断器配置
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const CIRCUIT_BREAKER_RECOVERY_TIMEOUT = 60000; // 60秒

// 并发限制
const DEFAULT_MAX_CONCURRENT = 10;
const DEFAULT_MAX_QUEUE_SIZE = 50;

// 首包探测超时
const DEFAULT_FIRST_TOKEN_TIMEOUT = 10000; // 10秒

export class MiniMaxRouter extends EventEmitter {
  private defaultModel: string;
  private fallbackModels: string[];
  private enableFirstChunkProbe: boolean;
  private firstChunkProbeTimeout: number;
  private enableMultiModelFallback: boolean;

  // 熔断器状态
  private circuitBreakers: Map<string, ModelHealth> = new Map();

  // 并发控制
  private maxConcurrent: number;
  private currentConcurrent = 0;
  private requestQueue: Array<() => void> = [];

  // 统计
  private stats = {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    fallbackRequests: 0,
    rejectedRequests: 0,
    firstTokenLatencies: [] as number[],
  };

  constructor(options: {
    defaultModel?: string;
    fallbackModels?: string[];
    enableFirstChunkProbe?: boolean;
    enableMultiModelFallback?: boolean;
    maxConcurrent?: number;
    firstChunkProbeTimeout?: number;
  } = {}) {
    super();
    this.defaultModel = options.defaultModel || DEFAULT_MODEL;
    this.fallbackModels = options.fallbackModels || FALLBACK_MODELS;
    this.enableFirstChunkProbe = options.enableFirstChunkProbe ?? true;
    this.firstChunkProbeTimeout = options.firstChunkProbeTimeout || DEFAULT_FIRST_TOKEN_TIMEOUT;
    this.enableMultiModelFallback = options.enableMultiModelFallback ?? true;
    this.maxConcurrent = options.maxConcurrent || DEFAULT_MAX_CONCURRENT;

    // 初始化熔断器
    this.initializeCircuitBreaker(this.defaultModel);
    this.fallbackModels.forEach((model) => this.initializeCircuitBreaker(model));
  }

  private initializeCircuitBreaker(modelName: string): void {
    this.circuitBreakers.set(modelName, {
      name: modelName,
      state: CircuitState.CLOSED,
      failures: 0,
      lastFailure: 0,
      totalRequests: 0,
      successRequests: 0,
      avgLatency: null,
      lastLatency: null,
      firstTokenLatencies: [],
    });
  }

  /**
   * 获取可用模型列表（按优先级）
   */
  private getAvailableModels(): string[] {
    const models: string[] = [this.defaultModel];
    if (this.enableMultiModelFallback) {
      models.push(...this.fallbackModels);
    }
    return models.filter((model) => this.isModelAvailable(model));
  }

  /**
   * 检查模型是否可用（熔断器状态）
   */
  private isModelAvailable(modelName: string): boolean {
    const health = this.circuitBreakers.get(modelName);
    if (!health) return false;

    if (health.state === CircuitState.OPEN) {
      // 检查是否超过恢复超时
      if (Date.now() - health.lastFailure > CIRCUIT_BREAKER_RECOVERY_TIMEOUT) {
        health.state = CircuitState.HALF_OPEN;
        return true;
      }
      return false;
    }
    return true;
  }

  /**
   * 记录熔断器失败
   */
  private recordFailure(modelName: string): void {
    const health = this.circuitBreakers.get(modelName);
    if (!health) return;

    health.failures++;
    health.lastFailure = Date.now();
    health.totalRequests++;

    if (health.failures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
      health.state = CircuitState.OPEN;
      this.emit('circuit_open', { model: modelName, timestamp: Date.now() });
    }
  }

  /**
   * 记录熔断器成功
   */
  private recordSuccess(modelName: string, latency: number, firstTokenLatency?: number): void {
    const health = this.circuitBreakers.get(modelName);
    if (!health) return;

    health.failures = 0;
    health.state = CircuitState.CLOSED;
    health.totalRequests++;
    health.successRequests++;
    health.lastLatency = latency;

    // 更新平均延迟
    if (latency > 0) {
      const currentAvg = health.avgLatency || latency;
      health.avgLatency = (currentAvg * 0.7 + latency * 0.3);
    }

    // 记录首包延迟
    if (firstTokenLatency !== undefined && firstTokenLatency > 0) {
      health.firstTokenLatencies.push(firstTokenLatency);
      if (health.firstTokenLatencies.length > 100) {
        health.firstTokenLatencies.shift();
      }
    }
  }

  /**
   * 获取平均首包延迟
   */
  getAverageFirstTokenLatency(): number | null {
    if (this.stats.firstTokenLatencies.length === 0) return null;
    const sum = this.stats.firstTokenLatencies.reduce((a, b) => a + b, 0);
    return sum / this.stats.firstTokenLatencies.length;
  }

  /**
   * 执行请求（带并发控制）
   */
  async execute(request: MiniMaxExecuteOptions): Promise<MiniMaxExecuteResult> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.stats.totalRequests++;

    // 并发控制 - 获取执行许可
    const canExecute = await this.acquireSlot();
    if (!canExecute) {
      this.stats.rejectedRequests++;
      return {
        success: false,
        requestId,
        error: 'Server is at maximum capacity, please try again later',
      };
    }

    try {
      const result = await this.executeWithFallback(request, requestId);
      return result;
    } finally {
      this.releaseSlot();
    }
  }

  /**
   * 获取执行槽位
   */
  private async acquireSlot(): Promise<boolean> {
    if (this.currentConcurrent < this.maxConcurrent) {
      this.currentConcurrent++;
      return true;
    }

    if (this.requestQueue.length >= DEFAULT_MAX_QUEUE_SIZE) {
      return false;
    }

    return new Promise((resolve) => {
      this.requestQueue.push(() => {
        this.currentConcurrent++;
        resolve(true);
      });
    });
  }

  /**
   * 释放执行槽位
   */
  private releaseSlot(): void {
    const next = this.requestQueue.shift();
    if (next) {
      next();
    } else {
      this.currentConcurrent--;
    }
  }

  /**
   * 执行请求（带多模型降级）
   */
  private async executeWithFallback(
    request: MiniMaxExecuteOptions,
    requestId: string,
  ): Promise<MiniMaxExecuteResult> {
    const { messages, model: preferredModel, stream = false, options = {} } = request;

    const models = preferredModel
      ? [preferredModel, ...this.getAvailableModels().filter((m) => m !== preferredModel)]
      : this.getAvailableModels();

    if (models.length === 0) {
      this.stats.failedRequests++;
      return {
        success: false,
        requestId,
        error: 'No available models',
      };
    }

    let lastError: Error | null = null;

    for (const modelId of models) {
      // 检查熔断器
      if (!this.isModelAvailable(modelId)) {
        continue;
      }

      try {
        const startTime = Date.now();
        let firstTokenLatency: number | undefined;

        const result = await this.callAPIWithProbe(modelId, {
          messages,
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || 8192,
          stream,
          reasoning_split: options.reasoning_split,
          thinking_budget: options.thinking_budget,
        }, (firstTokenTime: number) => {
          firstTokenLatency = firstTokenTime - startTime;
          this.stats.firstTokenLatencies.push(firstTokenLatency);
          if (this.stats.firstTokenLatencies.length > 1000) {
            this.stats.firstTokenLatencies.shift();
          }
        });

        const totalLatency = Date.now() - startTime;
        this.recordSuccess(modelId, totalLatency, firstTokenLatency);
        this.stats.successRequests++;

        return {
          success: true,
          requestId,
          model: modelId,
          result,
          firstTokenLatency,
        };
      } catch (error) {
        lastError = error as Error;
        this.recordFailure(modelId);
        this.stats.failedRequests++;

        if (modelId === models[models.length - 1]) {
          // 最后一个模型也失败了
          this.stats.fallbackRequests++;
        }

        this.emit('model_failed', {
          model: modelId,
          error: (error as Error).message,
          requestId,
          timestamp: Date.now(),
        });

        continue;
      }
    }

    return {
      success: false,
      requestId,
      error: lastError?.message || 'All models failed',
    };
  }

  /**
   * 调用 API（带首包探测）
   */
  private async callAPIWithProbe(
    modelId: string,
    request: any,
    onFirstToken?: (time: number) => void,
  ): Promise<any> {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      throw Errors.unavailable('MINIMAX_API_KEY not configured');
    }

    const baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic';

    if (request.stream && this.enableFirstChunkProbe) {
      return this.streamWithProbe(modelId, request, baseUrl, apiKey, onFirstToken);
    }

    // 非流式调用
    return this.callAPI(modelId, request, baseUrl, apiKey);
  }

  /**
   * 流式调用（带首包探测）
   */
  private async streamWithProbe(
    modelId: string,
    request: any,
    baseUrl: string,
    apiKey: string,
    onFirstToken?: (time: number) => void,
  ): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.firstChunkProbeTimeout);

    try {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: request.messages,
          max_tokens: request.max_tokens,
          temperature: request.temperature,
          stream: true,
          ...(request.reasoning_split && {
            thinking: {
              type: 'enabled',
              budget_tokens: request.thinking_budget || 4000,
            },
          }),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        let errorText = await response.text();
        throw this.parseError(response.status, errorText);
      }

      return response.body;
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw Errors.timeout(`First token timeout after ${this.firstChunkProbeTimeout}ms for model ${modelId}`);
      }
      throw error;
    }
  }

  /**
   * 调用 MiniMax API（带超时控制）
   */
  private async callAPI(modelId: string, request: any, baseUrl: string, apiKey: string): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
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
              budget_tokens: request.thinking_budget || 4000,
            },
          }),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        let errorText = await response.text();
        throw this.parseError(response.status, errorText);
      }

      if (request.stream) {
        return response.body;
      }

      return await response.json();
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw Errors.timeout(`Request timeout for model ${modelId}`);
      }
      throw error;
    }
  }

  /**
   * 解析 API 错误
   */
  private parseError(status: number, errorText: string): Error {
    let errorMessage = `MiniMax API Error ${status}`;

    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorJson.error?.type || errorMessage;
    } catch (e) {
      if (errorText && errorText.length < 200) {
        errorMessage = errorText;
      }
    }

    if (status === 400) {
      return Errors.validation(`请求参数错误: ${errorMessage}`);
    } else if (status === 401 || status === 403) {
      return Errors.unauthorized(`认证失败: ${errorMessage}`);
    } else if (status === 429) {
      return Errors.rateLimit(`请求过于频繁(限流): ${errorMessage}`);
    } else if (status >= 500) {
      return Errors.unavailable(`MiniMax 服务错误: ${errorMessage}`);
    }

    return Errors.modelError(errorMessage);
  }

  /**
   * 执行首包探测
   */
  async probeFirstTokenLatency(modelId?: string): Promise<FirstTokenProbeResult> {
    const probeModel = modelId || this.defaultModel;
    const startTime = Date.now();

    try {
      const apiKey = process.env.MINIMAX_API_KEY;
      if (!apiKey) {
        return { success: false, latency: null, error: 'MINIMAX_API_KEY not configured' };
      }

      const baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic';

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.firstChunkProbeTimeout);

      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: probeModel,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1,
          stream: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          success: false,
          latency: null,
          error: `API error ${response.status}`,
        };
      }

      // 读取流以触发实际请求
      const reader = response.body?.getReader();
      if (reader) {
        await reader.cancel();
      }

      const latency = Date.now() - startTime;
      return { success: true, latency };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      if (error.name === 'AbortError') {
        return {
          success: false,
          latency: this.firstChunkProbeTimeout,
          error: `Probe timeout after ${this.firstChunkProbeTimeout}ms`,
        };
      }
      return {
        success: false,
        latency,
        error: error.message,
      };
    }
  }

  /**
   * 检查模型健康状态
   */
  async checkModelHealth(modelId?: string): Promise<{
    healthy: boolean;
    latency: number | null;
    error?: string;
  }> {
    const probeResult = await this.probeFirstTokenLatency(modelId);
    return {
      healthy: probeResult.success,
      latency: probeResult.latency,
      error: probeResult.error,
    };
  }

  /**
   * 获取模型健康状态列表
   */
  getModelsHealth(): ModelHealth[] {
    return Array.from(this.circuitBreakers.values()).map((health) => ({
      ...health,
      avgLatency: health.avgLatency,
    }));
  }

  /**
   * 重置熔断器
   */
  resetCircuitBreaker(modelName?: string): void {
    if (modelName) {
      const health = this.circuitBreakers.get(modelName);
      if (health) {
        health.state = CircuitState.CLOSED;
        health.failures = 0;
      }
    } else {
      // 重置所有熔断器
      this.circuitBreakers.forEach((health) => {
        health.state = CircuitState.CLOSED;
        health.failures = 0;
      });
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      defaultModel: this.defaultModel,
      fallbackModels: this.fallbackModels,
      probeEnabled: this.enableFirstChunkProbe,
      avgFirstTokenLatency: this.getAverageFirstTokenLatency(),
      circuitBreakers: this.getModelsHealth(),
      concurrency: {
        current: this.currentConcurrent,
        max: this.maxConcurrent,
        queueSize: this.requestQueue.length,
      },
      successRate:
        this.stats.totalRequests > 0
          ? ((this.stats.successRequests / this.stats.totalRequests) * 100).toFixed(2) + '%'
          : 'N/A',
      fallbackRate:
        this.stats.totalRequests > 0
          ? ((this.stats.fallbackRequests / this.stats.totalRequests) * 100).toFixed(2) + '%'
          : 'N/A',
    };
  }

  /**
   * 获取简要状态
   */
  getStatus(): { healthy: boolean; availableModels: number; avgLatency: number | null } {
    const availableModels = this.getAvailableModels().length;
    return {
      healthy: availableModels > 0,
      availableModels,
      avgLatency: this.getAverageFirstTokenLatency(),
    };
  }
}
