/**
 * Qdrant 向量数据库性能监控
 * @description 监控 Qdrant 查询延迟、连接池、错误率等核心指标
 *
 * 核心指标：
 * - QdrantQueryLatency histogram - 查询延迟分布
 * - QdrantConnectionPool gauge - 连接池使用率
 * - QdrantErrorRate counter - 错误率计数
 * - QdrantHealthStatus gauge - 健康状态 (0=unhealthy, 1=healthy, 2=degraded)
 * - QdrantDegradedToMemory counter - 降级到内存存储的次数
 *
 * @author AI Chat 玩具团队
 * @date 2026-05-13
 */

const MetricsCollector = require('../metrics/MetricsCollector');

/**
 * Qdrant 监控指标名称
 */
const METRICS = {
  // 查询延迟 (Histogram) - 秒
  QUERY_LATENCY: 'qdrant_query_latency_seconds',
  QUERY_LATENCY_COUNT: 'qdrant_query_latency_seconds_count',
  QUERY_LATENCY_SUM: 'qdrant_query_latency_seconds_sum',
  QUERY_LATENCY_BUCKET: 'qdrant_query_latency_seconds_bucket',

  // 连接池使用 (Gauge)
  CONNECTION_POOL_ACTIVE: 'qdrant_connection_pool_active',
  CONNECTION_POOL_IDLE: 'qdrant_connection_pool_idle',
  CONNECTION_POOL_TOTAL: 'qdrant_connection_pool_total',

  // 错误率 (Counter)
  ERRORS_TOTAL: 'qdrant_errors_total',
  ERRORS_CONNECTION: 'qdrant_errors_connection_total',
  ERRORS_TIMEOUT: 'qdrant_errors_timeout_total',
  ERRORS_VALIDATION: 'qdrant_errors_validation_total',

  // 健康状态 (Gauge)
  HEALTH_STATUS: 'qdrant_health_status',
  HEALTH_LATENCY: 'qdrant_health_check_latency_seconds',

  // 降级事件 (Counter)
  DEGRADED_TO_MEMORY: 'qdrant_degraded_to_memory_total',

  // 操作计数 (Counter)
  OPERATIONS_TOTAL: 'qdrant_operations_total',
  SEARCH_OPERATIONS: 'qdrant_search_operations_total',
  INSERT_OPERATIONS: 'qdrant_insert_operations_total',
  DELETE_OPERATIONS: 'qdrant_delete_operations_total',

  // 集合指标 (Gauge)
  COLLECTION_COUNT: 'qdrant_collections_count',
  POINTS_COUNT: 'qdrant_points_total',

  // 响应大小 (Histogram)
  RESPONSE_SIZE: 'qdrant_response_size_bytes',
};

/**
 * 健康状态枚举
 */
const HEALTH_STATUS = {
  UNHEALTHY: 0,
  HEALTHY: 1,
  DEGRADED: 2,
};

/**
 * 操作类型
 */
const OPERATION_TYPE = {
  SEARCH: 'search',
  INSERT: 'insert',
  UPSERT: 'upsert',
  DELETE: 'delete',
  GET: 'get',
  RETRIEVE: 'retrieve',
};

/**
 * 错误类型
 */
const ERROR_TYPE = {
  CONNECTION: 'connection',
  TIMEOUT: 'timeout',
  VALIDATION: 'validation',
  NOT_FOUND: 'not_found',
  SERVER: 'server',
  UNKNOWN: 'unknown',
};

/**
 * 延迟桶配置 (秒)
 */
const LATENCY_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * Qdrant 监控器类
 */
class QdrantMonitor {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.metricsCollector = options.metricsCollector || null;
    this.serviceName = options.serviceName || 'qdrant';

    // 配置
    this.config = {
      slowQueryThreshold: options.slowQueryThreshold ?? 0.5, // 500ms
      errorThreshold: options.errorThreshold ?? 0.05, // 5%
      healthCheckInterval: options.healthCheckInterval ?? 30000, // 30s
      maxConnectionPool: options.maxConnectionPool ?? 100,
    };

    // 状态
    this._isInitialized = false;
    this._healthCheckTimer = null;
    this._lastHealthStatus = HEALTH_STATUS.HEALTHY;
    this._slowQueryCount = 0;
    this._totalQueries = 0;

    // Qdrant 配置
    this._qdrantConfig = {
      host: options.qdrantHost || process.env.QDRANT_HOST || 'localhost',
      port: options.qdrantPort || process.env.QDRANT_PORT || 6333,
      timeout: options.timeout || 30000,
    };
  }

  /**
   * 初始化监控器
   * @param {Object} metricsCollector - 指标采集器实例
   */
  initialize(metricsCollector) {
    if (this._isInitialized) {
      console.warn('[QdrantMonitor] 已初始化，跳过');
      return;
    }

    this.metricsCollector = metricsCollector;

    // 注册 Qdrant 指标
    this._registerMetrics();

    // 启动健康检查
    this._startHealthCheck();

    this._isInitialized = true;
    console.log('[QdrantMonitor] 初始化完成');
  }

  /**
   * 注册所有 Qdrant 指标
   * @private
   */
  _registerMetrics() {
    if (!this.metricsCollector) return;

    // 设置初始值
    this.metricsCollector.setGauge(METRICS.HEALTH_STATUS, HEALTH_STATUS.HEALTHY, { instance: this.serviceName });
    this.metricsCollector.setGauge(METRICS.CONNECTION_POOL_ACTIVE, 0, { instance: this.serviceName });
    this.metricsCollector.setGauge(METRICS.CONNECTION_POOL_IDLE, this.config.maxConnectionPool, { instance: this.serviceName });
    this.metricsCollector.setGauge(METRICS.CONNECTION_POOL_TOTAL, this.config.maxConnectionPool, { instance: this.serviceName });
    this.metricsCollector.setGauge(METRICS.COLLECTION_COUNT, 0, { instance: this.serviceName });
    this.metricsCollector.setGauge(METRICS.POINTS_COUNT, 0, { instance: this.serviceName });
  }

  /**
   * 启动定时健康检查
   * @private
   */
  _startHealthCheck() {
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
    }

    this._healthCheckTimer = setInterval(async () => {
      await this.checkHealth();
    }, this.config.healthCheckInterval);

    // 立即执行一次
    this.checkHealth();
  }

  /**
   * 检查 Qdrant 健康状态
   * @returns {Promise<Object>} 健康状态
   */
  async checkHealth() {
    const startTime = Date.now();

    try {
      const response = await fetch(`http://${this._qdrantConfig.host}:${this._qdrantConfig.port}/collections`, {
        method: 'GET',
        signal: AbortSignal.timeout(this._qdrantConfig.timeout),
      });

      const latency = (Date.now() - startTime) / 1000;

      // 记录健康检查延迟
      if (this.metricsCollector) {
        this.metricsCollector.recordHistogram(METRICS.HEALTH_LATENCY, latency);
      }

      if (response.ok) {
        const data = await response.json();
        const collectionCount = data.result?.collections?.length || 0;

        // 更新集合数量
        if (this.metricsCollector) {
          this.metricsCollector.setGauge(METRICS.HEALTH_STATUS, HEALTH_STATUS.HEALTHY, { instance: this.serviceName });
          this.metricsCollector.setGauge(METRICS.COLLECTION_COUNT, collectionCount, { instance: this.serviceName });
        }

        this._lastHealthStatus = HEALTH_STATUS.HEALTHY;
        return { status: 'healthy', latency, collectionCount };
      } else {
        this._updateHealthStatus(HEALTH_STATUS.UNHEALTHY);
        return { status: 'unhealthy', latency, code: response.status };
      }
    } catch (error) {
      const latency = (Date.now() - startTime) / 1000;
      this._updateHealthStatus(HEALTH_STATUS.UNHEALTHY);

      // 记录连接错误
      if (this.metricsCollector) {
        this.metricsCollector.incrementCounter(METRICS.ERRORS_TOTAL, { type: ERROR_TYPE.CONNECTION, instance: this.serviceName });
        this.metricsCollector.incrementCounter(METRICS.ERRORS_CONNECTION, { instance: this.serviceName });
        this.metricsCollector.recordHistogram(METRICS.HEALTH_LATENCY, latency);
      }

      return { status: 'unhealthy', latency, error: error.message };
    }
  }

  /**
   * 更新健康状态
   * @param {number} status - 健康状态
   * @private
   */
  _updateHealthStatus(status) {
    if (status !== this._lastHealthStatus) {
      this._lastHealthStatus = status;
      if (this.metricsCollector) {
        this.metricsCollector.setGauge(METRICS.HEALTH_STATUS, status, { instance: this.serviceName });
      }
    }
  }

  /**
   * 记录查询延迟
   * @param {Object} options - 查询选项
   * @param {string} options.operation - 操作类型
   * @param {number} options.latency - 延迟（毫秒）
   * @param {string} [options.collection] - 集合名称
   * @param {boolean} [options.hitCache] - 是否命中缓存
   * @param {number} [options.topK] - 返回结果数
   */
  recordQueryLatency(options) {
    if (!this.enabled || !this.metricsCollector) return;

    const { operation, latency, collection = 'default', hitCache = false, topK = 0 } = options;
    const latencySeconds = latency / 1000;

    // 记录直方图
    this.metricsCollector.recordHistogram(METRICS.QUERY_LATENCY, latencySeconds, {
      operation,
      collection,
      cached: hitCache ? 'true' : 'false',
    });

    // 记录操作计数
    this.metricsCollector.incrementCounter(METRICS.OPERATIONS_TOTAL, { operation, collection, instance: this.serviceName });

    // 记录操作类型计数
    const operationCounterMap = {
      [OPERATION_TYPE.SEARCH]: METRICS.SEARCH_OPERATIONS,
      [OPERATION_TYPE.INSERT]: METRICS.INSERT_OPERATIONS,
      [OPERATION_TYPE.UPSERT]: METRICS.INSERT_OPERATIONS,
      [OPERATION_TYPE.DELETE]: METRICS.DELETE_OPERATIONS,
    };

    const counterName = operationCounterMap[operation];
    if (counterName) {
      this.metricsCollector.incrementCounter(counterName, { collection, instance: this.serviceName });
    }

    // 更新慢查询统计
    this._totalQueries++;
    if (latency > this.config.slowQueryThreshold * 1000) {
      this._slowQueryCount++;
    }
  }

  /**
   * 记录错误
   * @param {Object} options - 错误选项
   * @param {string} options.type - 错误类型
   * @param {string} [options.operation] - 操作类型
   * @param {string} [options.collection] - 集合名称
   * @param {string} [options.message] - 错误消息
   */
  recordError(options) {
    if (!this.enabled || !this.metricsCollector) return;

    const { type, operation = 'unknown', collection = 'default', message = '' } = options;

    this.metricsCollector.incrementCounter(METRICS.ERRORS_TOTAL, {
      type,
      operation,
      collection,
      instance: this.serviceName,
    });

    // 根据类型分别计数
    switch (type) {
      case ERROR_TYPE.CONNECTION:
        this.metricsCollector.incrementCounter(METRICS.ERRORS_CONNECTION, { collection, instance: this.serviceName });
        break;
      case ERROR_TYPE.TIMEOUT:
        this.metricsCollector.incrementCounter(METRICS.ERRORS_TIMEOUT, { collection, instance: this.serviceName });
        break;
      case ERROR_TYPE.VALIDATION:
        this.metricsCollector.incrementCounter(METRICS.ERRORS_VALIDATION, { collection, instance: this.serviceName });
        break;
    }

    console.error(`[QdrantMonitor] 错误: type=${type}, operation=${operation}, collection=${collection}, message=${message}`);
  }

  /**
   * 更新连接池状态
   * @param {Object} poolStatus - 连接池状态
   */
  updateConnectionPool(poolStatus) {
    if (!this.enabled || !this.metricsCollector) return;

    const { active = 0, idle = 0, total = this.config.maxConnectionPool } = poolStatus;

    this.metricsCollector.setGauge(METRICS.CONNECTION_POOL_ACTIVE, active, { instance: this.serviceName });
    this.metricsCollector.setGauge(METRICS.CONNECTION_POOL_IDLE, idle, { instance: this.serviceName });
    this.metricsCollector.setGauge(METRICS.CONNECTION_POOL_TOTAL, total, { instance: this.serviceName });
  }

  /**
   * 记录降级事件
   * @param {string} reason - 降级原因
   */
  recordDegradedToMemory(reason = 'unknown') {
    if (!this.enabled || !this.metricsCollector) return;

    this.metricsCollector.incrementCounter(METRICS.DEGRADED_TO_MEMORY, { reason, instance: this.serviceName });
    this._updateHealthStatus(HEALTH_STATUS.DEGRADED);

    console.warn(`[QdrantMonitor] 降级到内存存储: reason=${reason}`);
  }

  /**
   * 记录响应大小
   * @param {number} sizeBytes - 响应大小（字节）
   * @param {string} [operation] - 操作类型
   */
  recordResponseSize(sizeBytes, operation = 'unknown') {
    if (!this.enabled || !this.metricsCollector) return;

    this.metricsCollector.recordHistogram(METRICS.RESPONSE_SIZE, sizeBytes, {
      operation,
      instance: this.serviceName,
    });
  }

  /**
   * 更新向量点数统计
   * @param {string} collection - 集合名称
   * @param {number} pointsCount - 向量点数
   */
  updatePointsCount(collection, pointsCount) {
    if (!this.enabled || !this.metricsCollector) return;

    this.metricsCollector.setGauge(METRICS.POINTS_COUNT, pointsCount, { collection, instance: this.serviceName });
  }

  /**
   * 创建查询监控装饰器
   * @param {string} collection - 集合名称
   * @param {string} operation - 操作类型
   * @returns {Function} 装饰器函数
   */
  createQueryMonitor(collection, operation) {
    const monitor = this;

    return (target, propertyKey, descriptor) => {
      const originalMethod = descriptor.value;

      descriptor.value = async function (...args) {
        const startTime = Date.now();

        try {
          const result = await originalMethod.apply(this, args);
          const latency = Date.now() - startTime;

          monitor.recordQueryLatency({
            operation,
            latency,
            collection,
          });

          return result;
        } catch (error) {
          const latency = Date.now() - startTime;

          // 根据错误类型判断
          let errorType = ERROR_TYPE.UNKNOWN;
          if (error.message?.includes('timeout')) {
            errorType = ERROR_TYPE.TIMEOUT;
          } else if (error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch failed')) {
            errorType = ERROR_TYPE.CONNECTION;
          } else if (error.message?.includes('validation')) {
            errorType = ERROR_TYPE.VALIDATION;
          }

          monitor.recordError({
            type: errorType,
            operation,
            collection,
            message: error.message,
          });

          throw error;
        }
      };

      return descriptor;
    };
  }

  /**
   * 获取监控统计
   * @returns {Object} 监控统计
   */
  getStats() {
    const healthLabels = { instance: this.serviceName };
    const healthStatus = this.metricsCollector?.getGauge(METRICS.HEALTH_STATUS, healthLabels) ?? HEALTH_STATUS.UNHEALTHY;

    return {
      enabled: this.enabled,
      serviceName: this.serviceName,
      health: {
        status: this._lastHealthStatus,
        statusText: this._getHealthStatusText(this._lastHealthStatus),
      },
      queries: {
        total: this._totalQueries,
        slowCount: this._slowQueryCount,
        slowRate: this._totalQueries > 0 ? (this._slowQueryCount / this._totalQueries * 100).toFixed(2) + '%' : '0%',
      },
      connectionPool: {
        active: this.metricsCollector?.getGauge(METRICS.CONNECTION_POOL_ACTIVE, healthLabels) ?? 0,
        idle: this.metricsCollector?.getGauge(METRICS.CONNECTION_POOL_IDLE, healthLabels) ?? 0,
        total: this.metricsCollector?.getGauge(METRICS.CONNECTION_POOL_TOTAL, healthLabels) ?? this.config.maxConnectionPool,
        usagePercent: this._calculatePoolUsage(),
      },
      errors: {
        total: this.metricsCollector?.getCounterSum(METRICS.ERRORS_TOTAL) ?? 0,
        connection: this.metricsCollector?.getCounter(METRICS.ERRORS_CONNECTION, healthLabels) ?? 0,
        timeout: this.metricsCollector?.getCounter(METRICS.ERRORS_TIMEOUT, healthLabels) ?? 0,
      },
      degradedToMemory: this.metricsCollector?.getCounter(METRICS.DEGRADED_TO_MEMORY, healthLabels) ?? 0,
      collections: {
        count: this.metricsCollector?.getGauge(METRICS.COLLECTION_COUNT, healthLabels) ?? 0,
      },
      config: this.config,
    };
  }

  /**
   * 获取健康状态文本
   * @param {number} status - 健康状态码
   * @returns {string}
   * @private
   */
  _getHealthStatusText(status) {
    switch (status) {
      case HEALTH_STATUS.HEALTHY:
        return 'healthy';
      case HEALTH_STATUS.DEGRADED:
        return 'degraded';
      case HEALTH_STATUS.UNHEALTHY:
      default:
        return 'unhealthy';
    }
  }

  /**
   * 计算连接池使用率
   * @returns {number} 使用率百分比
   * @private
   */
  _calculatePoolUsage() {
    const active = this.metricsCollector?.getGauge(METRICS.CONNECTION_POOL_ACTIVE, { instance: this.serviceName }) ?? 0;
    const total = this.metricsCollector?.getGauge(METRICS.CONNECTION_POOL_TOTAL, { instance: this.serviceName }) ?? this.config.maxConnectionPool;

    if (total === 0) return 0;
    return ((active / total) * 100).toFixed(2) + '%';
  }

  /**
   * 生成 Prometheus 格式的 Qdrant 指标
   * @returns {string} Prometheus 格式文本
   */
  generatePrometheusOutput() {
    if (!this.metricsCollector) {
      return '# No Qdrant metrics available\n';
    }

    const lines = [];
    const metrics = this.metricsCollector.getMetrics();

    // 查询延迟
    lines.push('# HELP qdrant_query_latency_seconds Qdrant query latency in seconds');
    lines.push('# TYPE qdrant_query_latency_seconds histogram');

    const queryLatency = metrics.histograms?.[METRICS.QUERY_LATENCY] || {};
    for (const [labels, data] of Object.entries(queryLatency)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`qdrant_query_latency_seconds_count${labelStr} ${data.count}`);
      lines.push(`qdrant_query_latency_seconds_sum${labelStr} ${data.sum.toFixed(3)}`);
      for (const [bucket, count] of Object.entries(data.buckets)) {
        const bucketLabel = labelStr ? `${labelStr},le="${bucket}"}` : `{le="${bucket}"}`;
        lines.push(`qdrant_query_latency_seconds_bucket${bucketLabel} ${count}`);
      }
    }
    lines.push('');

    // 健康状态
    lines.push('# HELP qdrant_health_status Qdrant health status (0=unhealthy, 1=healthy, 2=degraded)');
    lines.push('# TYPE qdrant_health_status gauge');

    const healthStatus = metrics.gauges?.[METRICS.HEALTH_STATUS] || {};
    for (const [labels, value] of Object.entries(healthStatus)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`qdrant_health_status${labelStr} ${value}`);
    }
    lines.push('');

    // 连接池
    lines.push('# HELP qdrant_connection_pool_active Active connections in pool');
    lines.push('# TYPE qdrant_connection_pool_active gauge');
    const activePool = metrics.gauges?.[METRICS.CONNECTION_POOL_ACTIVE] || {};
    for (const [labels, value] of Object.entries(activePool)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`qdrant_connection_pool_active${labelStr} ${value}`);
    }

    lines.push('# HELP qdrant_connection_pool_idle Idle connections in pool');
    lines.push('# TYPE qdrant_connection_pool_idle gauge');
    const idlePool = metrics.gauges?.[METRICS.CONNECTION_POOL_IDLE] || {};
    for (const [labels, value] of Object.entries(idlePool)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`qdrant_connection_pool_idle${labelStr} ${value}`);
    }
    lines.push('');

    // 错误数
    lines.push('# HELP qdrant_errors_total Total number of Qdrant errors');
    lines.push('# TYPE qdrant_errors_total counter');
    const errors = metrics.counters?.[METRICS.ERRORS_TOTAL] || {};
    for (const [labels, value] of Object.entries(errors)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`qdrant_errors_total${labelStr} ${value}`);
    }
    lines.push('');

    // 降级次数
    lines.push('# HELP qdrant_degraded_to_memory_total Number of times degraded to memory storage');
    lines.push('# TYPE qdrant_degraded_to_memory_total counter');
    const degraded = metrics.counters?.[METRICS.DEGRADED_TO_MEMORY] || {};
    for (const [labels, value] of Object.entries(degraded)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`qdrant_degraded_to_memory_total${labelStr} ${value}`);
    }
    lines.push('');

    // 操作计数
    lines.push('# HELP qdrant_operations_total Total number of Qdrant operations');
    lines.push('# TYPE qdrant_operations_total counter');
    const operations = metrics.counters?.[METRICS.OPERATIONS_TOTAL] || {};
    for (const [labels, value] of Object.entries(operations)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`qdrant_operations_total${labelStr} ${value}`);
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 获取查询延迟分位数
   * @param {string} operation - 操作类型
   * @returns {Object} { p50, p90, p99, avg }
   */
  getQueryLatencyPercentiles(operation = 'search') {
    if (!this.metricsCollector) {
      return { p50: 0, p90: 0, p99: 0, avg: 0 };
    }

    const histogram = this.metricsCollector.getHistogram(METRICS.QUERY_LATENCY, { operation });
    if (!histogram) {
      return { p50: 0, p90: 0, p99: 0, avg: 0 };
    }

    // 计算分位数
    const values = histogram.values || [];
    if (values.length === 0) {
      return { p50: 0, p90: 0, p99: 0, avg: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const avg = histogram.sum / histogram.count;

    return { p50, p90, p99, avg };
  }

  /**
   * 关闭监控器
   */
  async shutdown() {
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = null;
    }

    console.log('[QdrantMonitor] 已关闭');
  }
}

// 创建单例
let instance = null;

/**
 * 获取 Qdrant 监控器实例
 * @param {Object} options - 配置选项
 * @returns {QdrantMonitor}
 */
function getQdrantMonitor(options) {
  if (!instance) {
    instance = new QdrantMonitor(options);
  }
  return instance;
}

module.exports = {
  QdrantMonitor,
  getQdrantMonitor,
  METRICS,
  HEALTH_STATUS,
  OPERATION_TYPE,
  ERROR_TYPE,
};