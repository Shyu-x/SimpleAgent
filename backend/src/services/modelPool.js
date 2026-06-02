/**
 * 模型候选池
 * 支持多个模型自动切换、故障转移、健康检查
 */

const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('modelPool');

class ModelPool {
  constructor(options = {}) {
    this.models = new Map();           // 模型配置
    this.healthStatus = new Map();     // 健康状态: healthy, degraded, down
    this.requestCount = new Map();     // 请求计数
    this.failureCount = new Map();     // 失败计数
    this.successCount = new Map();     // 成功计数
    this.latencies = new Map();        // 延迟记录
    this.maxRetries = options.maxRetries || 3;
    this.healthCheckInterval = options.healthCheckInterval || 30000;
    this.cooldownPeriod = options.cooldownPeriod || 60000; // 冷却期 1分钟
    this.lastHealthCheck = new Map();  // 上次健康检查时间

    // 健康检查定时器
    this.healthCheckTimer = null;
    this.autoHealthCheck = options.autoHealthCheck !== false;

    // 事件发射器
    this.listeners = new Map();
  }

  /**
   * 注册模型
   */
  registerModel(id, config) {
    this.models.set(id, {
      name: config.name || id,
      provider: config.provider,
      priority: config.priority || 5,
      enabled: config.enabled !== false,
      capabilities: config.capabilities || [],
      maxTokens: config.maxTokens || 8192,
      costPer1kTokens: config.costPer1kTokens || { input: 0.001, output: 0.002 },
      avgLatency: config.avgLatency || 1000,
      ...config
    });

    this.healthStatus.set(id, 'healthy');
    this.requestCount.set(id, 0);
    this.failureCount.set(id, 0);
    this.successCount.set(id, 0);
    this.latencies.set(id, []);

    this.emit('model:registered', { modelId: id, config: this.models.get(id) });

    return this;
  }

  /**
   * 批量注册模型
   */
  registerModels(models) {
    for (const [id, config] of Object.entries(models)) {
      this.registerModel(id, config);
    }
    return this;
  }

  /**
   * 移除模型
   */
  removeModel(id) {
    this.models.delete(id);
    this.healthStatus.delete(id);
    this.requestCount.delete(id);
    this.failureCount.delete(id);
    this.successCount.delete(id);
    this.latencies.delete(id);
    this.lastHealthCheck.delete(id);

    this.emit('model:removed', { modelId: id });

    return this;
  }

  /**
   * 选择最佳模型
   */
  selectModel(criteria = {}) {
    const { capabilities, complexity, preferredProvider } = criteria;

    // 过滤可用模型
    const available = Array.from(this.models.entries())
      .filter(([id, config]) => {
        if (!config.enabled) return false;
        if (this.healthStatus.get(id) === 'down') return false;

        // 检查冷却期
        const lastCheck = this.lastHealthCheck.get(id) || 0;
        if (this.healthStatus.get(id) === 'down' &&
            Date.now() - lastCheck < this.cooldownPeriod) {
          return false;
        }

        // 检查能力匹配
        if (capabilities && capabilities.length > 0) {
          const hasCapability = capabilities.some(cap =>
            config.capabilities.includes(cap)
          );
          if (!hasCapability) return false;
        }

        // 偏好提供商
        if (preferredProvider && config.provider !== preferredProvider) {
          return false;
        }

        return true;
      })
      .map(([id, config]) => ({
        id,
        config,
        healthScore: this.getHealthScore(id),
        priority: config.priority
      }));

    if (available.length === 0) {
      return null;
    }

    // 排序：先按优先级，再按健康分数
    available.sort((a, b) => {
      // 优先级数字越小越优先
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // 健康分数越高越优先
      return b.healthScore - a.healthScore;
    });

    return available[0].id;
  }

  /**
   * 标记请求开始
   */
  markRequest(modelId) {
    const count = (this.requestCount.get(modelId) || 0) + 1;
    this.requestCount.set(modelId, count);
    return this;
  }

  /**
   * 标记失败
   */
  markFailure(modelId, errorType = 'unknown') {
    const count = (this.failureCount.get(modelId) || 0) + 1;
    this.failureCount.set(modelId, count);

    const requests = this.requestCount.get(modelId) || 1;
    const failureRate = count / requests;

    // 根据失败率更新健康状态
    if (failureRate >= 0.5 || count >= this.maxRetries) {
      this.healthStatus.set(modelId, 'down');
      this.lastHealthCheck.set(modelId, Date.now());
      this.emit('model:down', { modelId, failureCount: count, errorType });
    } else if (failureRate >= 0.3) {
      this.healthStatus.set(modelId, 'degraded');
      this.emit('model:degraded', { modelId, failureCount: count });
    }

    return this;
  }

  /**
   * 标记成功
   */
  markSuccess(modelId, latency = null) {
    const count = (this.successCount.get(modelId) || 0) + 1;
    this.successCount.set(modelId, count);

    // 重置失败计数
    this.failureCount.set(modelId, 0);

    // 更新延迟记录
    if (latency !== null) {
      const latencies = this.latencies.get(modelId) || [];
      latencies.push(latency);
      // 保留最近20条记录
      if (latencies.length > 20) {
        latencies.shift();
      }
      this.latencies.set(modelId, latencies);
    }

    // 恢复健康状态
    const currentStatus = this.healthStatus.get(modelId);
    if (currentStatus === 'degraded') {
      this.healthStatus.set(modelId, 'healthy');
      this.emit('model:recovered', { modelId });
    }

    return this;
  }

  /**
   * 获取健康分数 (0-1)
   */
  getHealthScore(modelId) {
    const failures = this.failureCount.get(modelId) || 0;
    const successes = this.successCount.get(modelId) || 0;
    const total = failures + successes;

    if (total === 0) return 1; // 无记录默认为健康

    const successRate = successes / total;

    // 考虑延迟因素
    const latencies = this.latencies.get(modelId) || [];
    let latencyScore = 1;
    if (latencies.length > 0) {
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const model = this.models.get(modelId);
      const expectedLatency = model?.avgLatency || 1000;
      // 延迟越低分数越高
      latencyScore = Math.max(0, 1 - (avgLatency - expectedLatency) / expectedLatency);
    }

    // 综合评分：成功率权重0.7，延迟权重0.3
    return successRate * 0.7 + latencyScore * 0.3;
  }

  /**
   * 获取平均延迟
   */
  getAverageLatency(modelId) {
    const latencies = this.latencies.get(modelId) || [];
    if (latencies.length === 0) return null;
    return latencies.reduce((a, b) => a + b, 0) / latencies.length;
  }

  /**
   * 健康检查
   */
  async healthCheck(validator) {
    const results = {};

    for (const [id, config] of this.models) {
      if (!config.enabled) continue;

      try {
        const isHealthy = await validator(id, config);
        if (isHealthy) {
          this.healthStatus.set(id, 'healthy');
          this.failureCount.set(id, 0);
        } else {
          this.healthStatus.set(id, 'down');
        }
        results[id] = isHealthy ? 'healthy' : 'down';
      } catch (error) {
        this.healthStatus.set(id, 'down');
        results[id] = 'down';
      }

      this.lastHealthCheck.set(id, Date.now());
    }

    this.emit('health:check', { results });
    return results;
  }

  /**
   * 启动自动健康检查
   */
  startHealthCheck(validator) {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.healthCheck(validator);
    }, this.healthCheckInterval);

    return this;
  }

  /**
   * 停止自动健康检查
   */
  stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    return this;
  }

  /**
   * 获取模型信息
   */
  getModelInfo(modelId) {
    const config = this.models.get(modelId);
    if (!config) return null;

    return {
      ...config,
      healthStatus: this.healthStatus.get(modelId),
      requestCount: this.requestCount.get(modelId) || 0,
      failureCount: this.failureCount.get(modelId) || 0,
      successCount: this.successCount.get(modelId) || 0,
      healthScore: this.getHealthScore(modelId),
      averageLatency: this.getAverageLatency(modelId)
    };
  }

  /**
   * 获取所有模型信息
   */
  getAllModels() {
    return Array.from(this.models.keys()).map(id => ({
      id,
      ...this.getModelInfo(id)
    }));
  }

  /**
   * 获取健康状态概览
   */
  getHealthOverview() {
    const overview = { healthy: 0, degraded: 0, down: 0, disabled: 0 };

    for (const [id, config] of this.models) {
      if (!config.enabled) {
        overview.disabled++;
        continue;
      }
      const status = this.healthStatus.get(id);
      overview[status] = (overview[status] || 0) + 1;
    }

    return overview;
  }

  /**
   * 获取下一个备用模型
   */
  getFallbackModel(excludeModelId) {
    const candidates = Array.from(this.models.entries())
      .filter(([id, config]) => {
        if (id === excludeModelId) return false;
        if (!config.enabled) return false;
        const status = this.healthStatus.get(id);
        return status === 'healthy' || status === 'degraded';
      })
      .map(([id, config]) => ({
        id,
        healthScore: this.getHealthScore(id),
        priority: config.priority
      }))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.healthScore - a.healthScore;
      });

    return candidates[0]?.id || null;
  }

  /**
   * 启用模型
   */
  enableModel(modelId) {
    const model = this.models.get(modelId);
    if (model) {
      model.enabled = true;
      this.emit('model:enabled', { modelId });
    }
    return this;
  }

  /**
   * 禁用模型
   */
  disableModel(modelId) {
    const model = this.models.get(modelId);
    if (model) {
      model.enabled = false;
      this.emit('model:disabled', { modelId });
    }
    return this;
  }

  /**
   * 更新模型配置
   */
  updateModel(modelId, updates) {
    const model = this.models.get(modelId);
    if (model) {
      Object.assign(model, updates);
      this.emit('model:updated', { modelId, updates });
    }
    return this;
  }

  /**
   * 重置模型统计
   */
  resetStats(modelId) {
    this.requestCount.set(modelId, 0);
    this.failureCount.set(modelId, 0);
    this.successCount.set(modelId, 0);
    this.latencies.set(modelId, []);
    return this;
  }

  /**
   * 重置所有统计
   */
  resetAllStats() {
    for (const id of this.models.keys()) {
      this.resetStats(id);
    }
    return this;
  }

  /**
   * 事件监听
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return this;
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    for (const callback of callbacks) {
      try {
        callback(data);
      } catch (error) {
        logger.error('Error in event listener', { event, error: error.message });
      }
    }
    return this;
  }

  /**
   * 移除事件监听
   */
  off(event, callback) {
    if (callback) {
      const callbacks = this.listeners.get(event) || [];
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    } else {
      this.listeners.delete(event);
    }
    return this;
  }

  /**
   * 导出配置
   */
  exportConfig() {
    const config = {};
    for (const [id, model] of this.models) {
      config[id] = {
        ...model,
        healthStatus: this.healthStatus.get(id),
        stats: {
          requestCount: this.requestCount.get(id) || 0,
          failureCount: this.failureCount.get(id) || 0,
          successCount: this.successCount.get(id) || 0
        }
      };
    }
    return config;
  }

  /**
   * 销毁
   */
  destroy() {
    this.stopHealthCheck();
    this.models.clear();
    this.healthStatus.clear();
    this.requestCount.clear();
    this.failureCount.clear();
    this.successCount.clear();
    this.latencies.clear();
    this.lastHealthCheck.clear();
    this.listeners.clear();
  }
}

module.exports = { ModelPool };
