import { Injectable } from '@nestjs/common';
import { HealthCheckerService, HealthStatus } from './health-checker.service';

/**
 * 路由策略枚举
 */
export enum RouterStrategy {
  PRIORITY = 'priority',
  ROUND_ROBIN = 'round_robin',
  WEIGHTED_RANDOM = 'weighted_random',
  LATENCY_BASED = 'latency_based',
}

/**
 * 路由事件枚举
 */
export enum RouterEvent {
  MODEL_SELECTED = 'router:model_selected',
  MODEL_FAILED = 'router:model_failed',
  MODEL_RECOVERED = 'router:model_recovered',
  ALL_MODELS_UNAVAILABLE = 'router:all_unavailable',
  ROUTE_ATTEMPT = 'router:attempt',
}

/**
 * 熔断器状态
 */
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

/**
 * 模型配置接口
 */
export interface ModelConfig {
  id: string;
  name: string;
  callFn: (prompt: string, options?: any) => Promise<any>;
  priority: number;
  weight: number;
  enabled: boolean;
}

/**
 * 模型状态接口
 */
export interface ModelStatus {
  name: string;
  enabled: boolean;
  priority: number;
  weight: number;
  circuitState: CircuitState;
  healthStatus: HealthStatus;
  usage: number;
  avgLatency: string | null;
}

/**
 * 路由统计接口
 */
export interface RouterStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  fallbackRequests: number;
  modelUsage: Record<string, number>;
  successRate: string;
  fallbackRate: string;
}

/**
 * 模型路由器服务
 * 支持多模型接入、主备路由、健康检查和故障转移
 */
@Injectable()
export class ModelRouterService {
  private models: ModelConfig[] = [];
  private circuitBreakers: Map<string, { state: CircuitState; failures: number; lastFailure: number }> = new Map();
  private healthCheckers: Map<string, HealthStatus> = new Map();
  private stats: RouterStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    fallbackRequests: 0,
    modelUsage: {},
    successRate: '0%',
    fallbackRate: '0%',
  };
  private roundRobinIndex = 0;
  private latencies: Map<string, number[]> = new Map();
  private strategy: RouterStrategy = RouterStrategy.PRIORITY;
  private eventHandlers: Map<string, (data: any) => void> = new Map();
  private failureThreshold = 5;
  private recoveryTimeout = 60000;

  constructor(private readonly healthCheckerService: HealthCheckerService) {
    this.initializeCircuitBreakers();
  }

  private initializeCircuitBreakers(): void {
    for (const model of this.models) {
      this.circuitBreakers.set(model.name, {
        state: CircuitState.CLOSED,
        failures: 0,
        lastFailure: 0,
      });
      this.stats.modelUsage[model.name] = 0;
      this.latencies.set(model.name, []);
    }
  }

  /**
   * 注册模型
   */
  registerModel(config: ModelConfig): void {
    this.models.push({
      ...config,
      enabled: config.enabled !== false,
      priority: config.priority ?? 1,
      weight: config.weight ?? 1,
    });

    this.circuitBreakers.set(config.name, {
      state: CircuitState.CLOSED,
      failures: 0,
      lastFailure: 0,
    });

    this.stats.modelUsage[config.name] = 0;
    this.latencies.set(config.name, []);
  }

  /**
   * 执行路由调用
   */
  async route(params: {
    prompt: string;
    options?: any;
    fallbackFn?: () => Promise<any>;
  }): Promise<any> {
    const { prompt, options = {}, fallbackFn = null } = params;
    this.stats.totalRequests++;

    const candidates = this.getCandidateModels();
    if (candidates.length === 0) {
      this.emitEvent(RouterEvent.ALL_MODELS_UNAVAILABLE, { prompt });
      if (fallbackFn) {
        this.stats.fallbackRequests++;
        return await fallbackFn();
      }
      throw new Error('All models are unavailable');
    }

    const sortedCandidates = this.sortCandidates(candidates);
    let lastError: Error | null = null;

    for (const model of sortedCandidates) {
      this.emitEvent(RouterEvent.ROUTE_ATTEMPT, {
        model: model.name,
        attempt: this.stats.totalRequests,
      });

      try {
        const startTime = Date.now();
        const breaker = this.circuitBreakers.get(model.name);

        if (breaker && breaker.state === CircuitState.OPEN) {
          // 检查是否应该转换到 HALF_OPEN
          if (Date.now() - breaker.lastFailure > this.recoveryTimeout) {
            breaker.state = CircuitState.HALF_OPEN;
          } else {
            continue;
          }
        }

        const result = await model.callFn(prompt, options);
        const latency = Date.now() - startTime;

        this.recordLatency(model.name, latency);
        this.stats.successfulRequests++;
        this.stats.modelUsage[model.name]++;

        // 重置熔断器状态
        if (breaker) {
          breaker.failures = 0;
          breaker.state = CircuitState.CLOSED;
        }

        this.emitEvent(RouterEvent.MODEL_SELECTED, {
          model: model.name,
          latency,
          attempt: this.stats.totalRequests,
        });

        return result;
      } catch (error) {
        lastError = error;
        this.stats.failedRequests++;

        const breaker = this.circuitBreakers.get(model.name);
        if (breaker) {
          breaker.failures++;
          breaker.lastFailure = Date.now();
          if (breaker.failures >= this.failureThreshold) {
            breaker.state = CircuitState.OPEN;
          }
        }

        this.emitEvent(RouterEvent.MODEL_FAILED, {
          model: model.name,
          error: error.message,
          attempt: this.stats.totalRequests,
        });

        continue;
      }
    }

    this.emitEvent(RouterEvent.ALL_MODELS_UNAVAILABLE, {
      prompt,
      lastError: lastError?.message,
    });

    if (fallbackFn) {
      this.stats.fallbackRequests++;
      return await fallbackFn();
    }

    throw lastError || new Error('All models failed');
  }

  /**
   * 直接调用指定模型
   */
  async callDirect(modelName: string, prompt: string, options: any = {}): Promise<any> {
    const model = this.models.find((m) => m.name === modelName);
    if (!model) {
      throw new Error(`Model not found: ${modelName}`);
    }

    return await model.callFn(prompt, options);
  }

  /**
   * 获取候选模型列表
   */
  private getCandidateModels(): ModelConfig[] {
    return this.models.filter((model) => {
      if (!model.enabled) return false;

      const breaker = this.circuitBreakers.get(model.name);
      return breaker && breaker.state !== CircuitState.OPEN;
    });
  }

  /**
   * 按策略排序候选模型
   */
  private sortCandidates(candidates: ModelConfig[]): ModelConfig[] {
    switch (this.strategy) {
      case RouterStrategy.PRIORITY:
        return [...candidates].sort((a, b) => b.priority - a.priority);
      case RouterStrategy.ROUND_ROBIN:
        return this.roundRobinSort(candidates);
      case RouterStrategy.WEIGHTED_RANDOM:
        return this.weightedRandomSort(candidates);
      case RouterStrategy.LATENCY_BASED:
        return this.latencyBasedSort(candidates);
      default:
        return candidates;
    }
  }

  private roundRobinSort(candidates: ModelConfig[]): ModelConfig[] {
    if (candidates.length === 0) return candidates;

    const sorted: ModelConfig[] = [];
    const startIndex = this.roundRobinIndex % candidates.length;

    for (let i = 0; i < candidates.length; i++) {
      const index = (startIndex + i) % candidates.length;
      sorted.push(candidates[index]);
    }

    this.roundRobinIndex++;
    return sorted;
  }

  private weightedRandomSort(candidates: ModelConfig[]): ModelConfig[] {
    const totalWeight = candidates.reduce((sum, m) => sum + m.weight, 0);
    let random = Math.random() * totalWeight;

    const sorted: ModelConfig[] = [];
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

  private latencyBasedSort(candidates: ModelConfig[]): ModelConfig[] {
    return [...candidates].sort((a, b) => {
      const avgA = this.calculateAvgLatency(a.name);
      const avgB = this.calculateAvgLatency(b.name);
      return (avgA || Infinity) - (avgB || Infinity);
    });
  }

  private recordLatency(modelName: string, latency: number): void {
    const latencies = this.latencies.get(modelName);
    if (latencies) {
      latencies.push(latency);
      if (latencies.length > 100) {
        latencies.shift();
      }
    }
  }

  private calculateAvgLatency(modelName: string): number | null {
    const latencies = this.latencies.get(modelName);
    if (!latencies || latencies.length === 0) {
      return null;
    }
    const sum = latencies.reduce((a, b) => a + b, 0);
    return sum / latencies.length;
  }

  /**
   * 获取模型状态
   */
  getModelStatuses(): ModelStatus[] {
    return this.models.map((model) => {
      const breaker = this.circuitBreakers.get(model.name);
      const healthChecker = this.healthCheckers.get(model.name);

      return {
        name: model.name,
        enabled: model.enabled,
        priority: model.priority,
        weight: model.weight,
        circuitState: breaker?.state || CircuitState.CLOSED,
        healthStatus: healthChecker || HealthStatus.UNKNOWN,
        usage: this.stats.modelUsage[model.name] || 0,
        avgLatency: this.calculateAvgLatency(model.name)
          ? `${this.calculateAvgLatency(model.name)}ms`
          : null,
      };
    });
  }

  /**
   * 获取路由统计
   */
  getStats(): RouterStats {
    return {
      ...this.stats,
      successRate:
        this.stats.totalRequests > 0
          ? ((this.stats.successfulRequests / this.stats.totalRequests) * 100).toFixed(2) + '%'
          : 'N/A',
      fallbackRate:
        this.stats.totalRequests > 0
          ? ((this.stats.fallbackRequests / this.stats.totalRequests) * 100).toFixed(2) + '%'
          : 'N/A',
    };
  }

  /**
   * 设置路由策略
   */
  setStrategy(strategy: RouterStrategy): void {
    this.strategy = strategy;
  }

  /**
   * 启用/禁用模型
   */
  setModelEnabled(modelName: string, enabled: boolean): void {
    const model = this.models.find((m) => m.name === modelName);
    if (model) {
      model.enabled = enabled;
    }
  }

  /**
   * 启动健康检查
   */
  startHealthCheck(modelName: string, healthCheckFn: () => Promise<boolean>): void {
    const checker = this.healthCheckerService.createHealthChecker(modelName, healthCheckFn, {
      onStatusChange: (from, to) => {
        console.log(`[ModelRouter:${modelName}] Health: ${from} -> ${to}`);
        this.healthCheckers.set(modelName, to as HealthStatus);
      },
    });
    checker.start();
  }

  /**
   * 停止所有健康检查
   */
  stopAllHealthChecks(): void {
    this.healthCheckerService.stopAll();
    this.healthCheckers.clear();
  }

  /**
   * 注册事件处理器
   */
  onEvent(event: RouterEvent, handler: (data: any) => void): void {
    this.eventHandlers.set(event, handler);
  }

  private emitEvent(event: RouterEvent, data: any): void {
    const handler = this.eventHandlers.get(event);
    if (handler) {
      handler({ ...data, router: 'default', timestamp: Date.now() });
    }
  }
}
