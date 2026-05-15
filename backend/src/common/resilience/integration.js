/**
 * 熔断器集成模块 - Express/JS 适配层
 * 将 TypeScript 熔断器模块桥接到现有 CommonJS 后端
 *
 * 使用示例：
 * ```js
 * const { getBreaker, executeWithBreaker } = require('./common/resilience/integration');
 *
 * // 方式1：直接使用熔断器
 * const breaker = getBreaker('minimax-api');
 * const result = await breaker.execute(() => callMiniMax());
 *
 * // 方式2：使用便捷函数
 * const result = await executeWithBreaker('minimax-api', () => callMiniMax(), () => getCached());
 * ```
 */

const { CircuitBreaker: InfraCircuitBreaker } = require('../../infra/circuitBreaker/CircuitBreaker');
const AppError = require('../../common/errors/AppError');

// 预设配置
const PRESETS = {
  // 高速服务（缓存）：快速恢复
  HIGH_SPEED: {
    failureThreshold: 3,
    successThreshold: 2,
    resetTimeout: 10000,
    halfOpenProbeTimeout: 5000,
  },
  // 标准服务（API 调用）
  STANDARD: {
    failureThreshold: 5,
    successThreshold: 3,
    resetTimeout: 60000,
    halfOpenProbeTimeout: 10000,
  },
  // 慢速服务（文件处理）
  SLOW: {
    failureThreshold: 10,
    successThreshold: 5,
    resetTimeout: 120000,
    halfOpenProbeTimeout: 30000,
  },
  // 严格模式（支付）
  STRICT: {
    failureThreshold: 2,
    successThreshold: 3,
    resetTimeout: 180000,
    halfOpenProbeTimeout: 15000,
  },
};

// 全局熔断器注册表
const _breakers = new Map();

/**
 * 获取或创建熔断器
 * @param {string} name - 熔断器名称
 * @param {object} [options] - 配置（可选，使用预设）
 * @returns {InfraCircuitBreaker}
 */
function getBreaker(name, options = {}) {
  if (!_breakers.has(name)) {
    const config = { name, ...options };
    _breakers.set(name, new InfraCircuitBreaker(config));
  }
  return _breakers.get(name);
}

/**
 * 使用预设配置获取熔断器
 * @param {string} name - 熔断器名称
 * @param {string} preset - 预设名称
 * @param {object} [overrides] - 覆盖配置
 * @returns {InfraCircuitBreaker}
 */
function getBreakerWithPreset(name, preset, overrides = {}) {
  const presetConfig = PRESETS[preset];
  if (!presetConfig) {
    throw AppError.validationError('preset', `未知预设: ${preset}，可用预设: ${Object.keys(PRESETS).join(', ')}`);
  }
  return getBreaker(name, { ...presetConfig, ...overrides });
}

/**
 * 便捷函数：使用熔断器执行操作
 * @param {string} name - 熔断器名称
 * @param {Function} operation - 要执行的操作
 * @param {Function} [fallback] - 降级操作
 * @param {object} [options] - 熔断器配置
 * @returns {Promise<any>}
 */
async function executeWithBreaker(name, operation, fallback = null, options = {}) {
  const breaker = getBreaker(name, options);
  return breaker.execute(operation, fallback);
}

/**
 * 获取所有熔断器状态
 * @returns {Array<object>}
 */
function getAllBreakerStats() {
  const stats = [];
  for (const [name, breaker] of _breakers) {
    stats.push({
      name,
      ...breaker.stats,
    });
  }
  return stats;
}

/**
 * 重置所有熔断器
 */
function resetAllBreakers() {
  for (const breaker of _breakers.values()) {
    breaker.reset();
  }
}

/**
 * 销毁所有熔断器
 */
function destroyAllBreakers() {
  for (const breaker of _breakers.values()) {
    breaker.destroy();
  }
  _breakers.clear();
}

module.exports = {
  getBreaker,
  getBreakerWithPreset,
  executeWithBreaker,
  getAllBreakerStats,
  resetAllBreakers,
  destroyAllBreakers,
  PRESETS,
  // 直接导出类供高级使用
  CircuitBreaker: InfraCircuitBreaker,
};