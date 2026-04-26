import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateModelDto } from './dto';

interface ModelConfig {
  id: string;
  name: string;
  model: string;
  maxTokens: number;
  timeout: number;
  priority: number;
  maxConcurrent: number;
}

interface ModelStats {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  avgLatency: number;
  p50Latency: number;
  p99Latency: number;
  totalTokens: number;
}

interface CircuitBreakerState {
  state: string;
  failureCount: number;
  lastFailure: number | null;
  successCount: number;
}

const MINIMAX_MODELS: Record<string, ModelConfig> = {
  'MiniMax-M2.7': {
    id: 'MiniMax-M2.7',
    name: 'MiniMax-M2.7 旗舰编程版',
    model: 'MiniMax-M2.7',
    maxTokens: 100000,
    timeout: 30000,
    priority: 10,
    maxConcurrent: 10,
  },
  'MiniMax-M2.5': {
    id: 'MiniMax-M2.5',
    name: 'MiniMax-M2.5 标准版',
    model: 'MiniMax-M2.5',
    maxTokens: 100000,
    timeout: 30000,
    priority: 8,
    maxConcurrent: 10,
  },
  'MiniMax-VL-01': {
    id: 'MiniMax-VL-01',
    name: 'MiniMax-VL-01 多模态版',
    model: 'MiniMax-VL-01',
    maxTokens: 32000,
    timeout: 30000,
    priority: 6,
    maxConcurrent: 5,
  },
  'MiniMax-Text-01': {
    id: 'MiniMax-Text-01',
    name: 'MiniMax-Text-01 长文本版',
    model: 'MiniMax-Text-01',
    maxTokens: 400000,
    timeout: 60000,
    priority: 4,
    maxConcurrent: 3,
  },
};

@Injectable()
export class ModelService {
  private defaultModel = 'MiniMax-M2.7';
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private stats: Map<string, ModelStats> = new Map();

  constructor() {
    // 初始化熔断器状态
    for (const modelId of Object.keys(MINIMAX_MODELS)) {
      this.circuitBreakers.set(modelId, {
        state: 'closed',
        failureCount: 0,
        lastFailure: null,
        successCount: 0,
      });
      this.stats.set(modelId, {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        avgLatency: 0,
        p50Latency: 0,
        p99Latency: 0,
        totalTokens: 0,
      });
    }
  }

  getAvailableModels(): ModelConfig[] {
    return Object.values(MINIMAX_MODELS);
  }

  listModels(): any {
    const models = this.getAvailableModels();

    const modelsWithStats = models.map(model => ({
      id: model.id,
      name: model.name,
      provider: 'minimax',
      model: model.model,
      enabled: true,
      priority: model.priority || 0,
      maxTokens: model.maxTokens || 100000,
      timeout: model.timeout || 30000,
      maxConcurrent: model.maxConcurrent || 10,
      healthStatus: 'unknown',
      stats: {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        avgLatency: 0,
        p50Latency: 0,
        p99Latency: 0,
        totalTokens: 0,
      },
      circuitBreaker: {
        state: 'closed',
        failureCount: 0,
        lastFailure: null,
        recoveryTimeout: 30000,
      },
    }));

    return {
      models: modelsWithStats,
      total: modelsWithStats.length,
      defaultModel: this.defaultModel,
    };
  }

  getStats(): any {
    const stats = this.stats.get(this.defaultModel) || {
      totalCalls: 0,
      successCalls: 0,
      totalTokens: 0,
      avgLatency: 0,
    };

    return {
      totalRequests: stats.totalCalls,
      totalTokens: stats.totalTokens,
      avgLatency: stats.avgLatency,
      successRate: stats.totalCalls > 0
        ? ((stats.successCalls / stats.totalCalls) * 100).toFixed(2) + '%'
        : '0%',
      topModels: [],
    };
  }

  getCircuitBreakerStates(): Record<string, CircuitBreakerState> {
    const result: Record<string, CircuitBreakerState> = {};
    for (const [modelId, state] of this.circuitBreakers) {
      result[modelId] = state;
    }
    return result;
  }

  getModel(name: string): any {
    const modelConfig = MINIMAX_MODELS[name];
    if (!modelConfig) {
      throw new NotFoundException(`模型 ${name} 不存在`);
    }

    const breaker = this.circuitBreakers.get(name);
    const model = MINIMAX_MODELS[name];

    return {
      id: name,
      name: model?.name || name,
      model: model?.model || name,
      provider: 'minimax',
      enabled: true,
      priority: model?.priority || 0,
      maxTokens: model?.maxTokens || 100000,
      timeout: model?.timeout || 30000,
      maxConcurrent: model?.maxConcurrent || 10,
      circuitBreaker: {
        state: breaker?.state || 'closed',
        failures: breaker?.failureCount || 0,
        successes: breaker?.successCount || 0,
        lastFailure: breaker?.lastFailure || null,
      },
    };
  }

  updateModel(name: string, dto: UpdateModelDto): any {
    if (!MINIMAX_MODELS[name]) {
      throw new NotFoundException(`模型 ${name} 不存在`);
    }

    if (dto.defaultModel !== undefined && MINIMAX_MODELS[dto.defaultModel]) {
      this.defaultModel = dto.defaultModel;
    }

    if (dto.resetCircuit) {
      const breaker = this.circuitBreakers.get(name);
      if (breaker) {
        breaker.state = 'closed';
        breaker.failureCount = 0;
        breaker.successCount = 0;
        breaker.lastFailure = null;
      }
    }

    return {
      id: name,
      updated: {
        defaultModel: this.defaultModel,
        resetCircuit: !!dto.resetCircuit,
      },
    };
  }

  patchModel(name: string, dto: { enabled?: boolean }): any {
    if (!MINIMAX_MODELS[name]) {
      throw new NotFoundException(`模型 ${name} 不存在`);
    }

    return {
      id: name,
      enabled: dto.enabled !== undefined ? dto.enabled : true,
    };
  }

  resetCircuitBreaker(name: string): any {
    if (!MINIMAX_MODELS[name]) {
      throw new NotFoundException(`模型 ${name} 不存在`);
    }

    const breaker = this.circuitBreakers.get(name);
    if (breaker) {
      breaker.state = 'closed';
      breaker.failureCount = 0;
    }

    return {
      id: name,
      circuitBreaker: {
        state: 'closed',
        failureCount: 0,
      },
    };
  }

  async healthCheck(name: string): Promise<any> {
    if (!MINIMAX_MODELS[name]) {
      throw new NotFoundException(`模型 ${name} 不存在`);
    }

    const startTime = Date.now();

    // 模拟健康检查
    let healthy = true;
    let error = null;
    let latency = Date.now() - startTime;

    // 模拟检查逻辑
    const modelCheck = MINIMAX_MODELS[name];
    if (modelCheck && modelCheck.id === name) {
      healthy = true;
    } else {
      healthy = false;
      error = 'Model not available';
    }

    return {
      model: name,
      healthy,
      latency,
      error,
      timestamp: new Date().toISOString(),
    };
  }

  async healthCheckAll(): Promise<any> {
    const results = [];
    const startTime = Date.now();

    for (const [modelId, config] of Object.entries(MINIMAX_MODELS)) {
      const modelStart = Date.now();

      let healthy = true;
      let error = null;

      // 模拟健康检查
      if (config && config.id === modelId) {
        healthy = true;
      } else {
        healthy = false;
        error = 'Model not available';
      }

      results.push({
        model: modelId,
        name: config.name,
        healthy,
        latency: Date.now() - modelStart,
        error,
      });
    }

    return {
      results,
      totalLatency: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}
