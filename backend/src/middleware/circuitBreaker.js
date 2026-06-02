/**
 * Opossum Circuit Breaker 包装器
 * 
 * 为什么用 opossum：
 * 1. 生产级熔断器实现，经过大规模验证
 * 2. 内置统计：失败率、超时、Half-Open 状态
 * 3. 支持 volume threshold，防止误触发
 * 4. 提供 Prometheus 指标事件
 * 
 * 配置说明：
 * - errorThresholdPercentage: 50% 失败率触发熔断
 * - timeout: 10秒，操作超时即算失败
 * - resetTimeout: 30秒后尝试恢复（HALF_OPEN）
 * - minimumNumberOfCalls: 10，至少10次调用才计算失败率
 * - volumeThreshold: 5，需要5次调用才开始计算
 */

const CircuitBreaker = require('opossum');
const { getMetricsCollector } = require('../infra/metrics');
const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('circuitBreaker');

// 熔断器状态常量
const CB_STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

// 默认配置（生产习惯值）
const DEFAULT_OPTIONS = {
  timeout: 10000,                    // 10秒超时
  errorThresholdPercentage: 50,       // 50% 失败率
  resetTimeout: 30000,               // 30秒后尝试恢复
  minimumNumberOfCalls: 10,          // 至少10次调用
  volumeThreshold: 5                 // 需要5次调用开始计算
};

// 全局熔断器缓存
const breakers = new Map();

/**
 * 创建或获取 opossum 熔断器
 * @param {string} name - 熔断器名称
 * @param {Object} options - opossum 配置
 * @returns {CircuitBreaker}
 */
function getOpossumBreaker(name, options = {}) {
  if (breakers.has(name)) {
    return breakers.get(name);
  }

  const fullOptions = { ...DEFAULT_OPTIONS, ...options };
  
  // 创建不含 fallback 的熔断器，我们自己处理
  const breaker = new CircuitBreaker(async (fn, fallback) => {
    try {
      return await fn();
    } catch (error) {
      if (fallback) {
        return fallback();
      }
      throw error;
    }
  }, fullOptions);

  // 配置事件
  breaker.on('open', (data) => {
    logger.info('熔断器 OPENED', { name, data });
    emitCircuitMetric(name, 'open');
  });

  breaker.on('halfOpen', (data) => {
    logger.info('熔断器 HALF_OPEN', { name, data });
    emitCircuitMetric(name, 'halfOpen');
  });

  breaker.on('close', (data) => {
    logger.info('熔断器 CLOSED', { name, data });
    emitCircuitMetric(name, 'close');
  });

  breaker.on('fallback', (data) => {
    logger.info('熔断器 FALLBACK triggered', { name });
    emitCircuitMetric(name, 'fallback');
  });

  breaker.on('timeout', (data) => {
    logger.info('熔断器 TIMEOUT', { name, data });
    emitCircuitMetric(name, 'timeout');
  });

  breakers.set(name, breaker);
  return breaker;
}

/**
 * 发送熔断器指标到采集器
 * @param {string} name - 熔断器名称
 * @param {string} event - 事件类型
 */
function emitCircuitMetric(name, event) {
  try {
    const collector = getMetricsCollector();
    if (collector) {
      collector.incrementCounter('circuit_breaker_events_total', { name, event });
    }
  } catch (e) {
    // 指标采集器未初始化
  }
}

/**
 * 创建电路熔断器包装函数
 * @param {Function} fn - 要包装的函数
 * @param {Object} options - opossum 配置
 * @returns {Promise<any>}
 */
async function createCircuitBreaker(fn, options = {}) {
  const name = options.name || `cb_${Date.now()}`;
  const breaker = getOpossumBreaker(name, options);

  const {
    fallback = null,  // 熔断打开时的降级回调
    timeout = 10000,
    errorThresholdPercentage = 50,
    resetTimeout = 30000,
    minimumNumberOfCalls = 10,
    volumeThreshold = 5
  } = options;

  const fullOptions = {
    timeout,
    errorThresholdPercentage,
    resetTimeout,
    minimumNumberOfCalls,
    volumeThreshold
  };

  // 使用 opossum 包装执行
  const wrappedFn = async () => {
    return breaker.execute(fn, fallback);
  };

  try {
    return await wrappedFn();
  } catch (error) {
    // 熔断器拒绝时
    if (breaker.status?.stats) {
      // 返回友好错误
      return {
        error: 'MiniMax API 暂时不可用，请稍后重试',
        fallback: true,
        circuitBreaker: name,
        state: breaker.status.state
      };
    }
    throw error;
  }
}

/**
 * 获取所有熔断器状态
 * @returns {Array<Object>}
 */
function getAllBreakersStatus() {
  const result = [];
  for (const [name, breaker] of breakers) {
    const stats = breaker.status?.stats || {};
    result.push({
      name,
      state: breaker.status?.state || CB_STATES.CLOSED,
      failures: stats.failures || 0,
      successes: stats.successes || 0,
      fallbacks: stats.fallbacks || 0,
      rejections: stats.rejections || 0,
      timeout: stats.timeout || 0,
      cacheHits: stats.cacheHits || 0,
      cacheMisses: stats.cacheMisses || 0
    });
  }
  return result;
}

/**
 * 获取特定熔断器状态
 * @param {string} name - 熔断器名称
 * @returns {Object|null}
 */
function getBreakerStatus(name) {
  const breaker = breakers.get(name);
  if (!breaker) {
    return null;
  }
  return getAllBreakersStatus().find(b => b.name === name);
}

/**
 * 重置所有熔断器
 */
function resetAllBreakers() {
  for (const breaker of breakers.values()) {
    breaker.shutdown();
  }
  breakers.clear();
}

/**
 * 获取 opossum 熔断器实例（用于直接操作）
 * @param {string} name - 熔断器名称
 * @returns {CircuitBreaker|null}
 */
function getBreaker(name) {
  return breakers.get(name) || null;
}

module.exports = {
  createCircuitBreaker,
  getOpossumBreaker,
  getAllBreakersStatus,
  getBreakerStatus,
  resetAllBreakers,
  getBreaker,
  CB_STATES,
  DEFAULT_OPTIONS
};