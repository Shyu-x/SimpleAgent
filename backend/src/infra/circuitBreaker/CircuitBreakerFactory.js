/**
 * 熔断器工厂
 * @description 统一管理和创建熔断器实例，支持命名熔断器和配置管理
 *
 * @author AI Chat 玩具团队
 * @date 2026-03-21
 */

const { CircuitBreaker } = require('./CircuitBreaker');
const { CircuitState } = require('./CircuitState');

/**
 * 熔断器配置预设
 * @description 针对不同服务类型预设的配置参数
 */
const Presets = {
  /**
   * 高速服务（如缓存）：失败阈值低，恢复快
   */
  HIGH_SPEED: {
    failureThreshold: 3,
    successThreshold: 2,
    resetTimeout: 10000,     // 10秒
    halfOpenProbeTimeout: 5000
  },

  /**
   * 标准服务（如 API 调用）：平衡配置
   */
  STANDARD: {
    failureThreshold: 5,
    successThreshold: 3,
    resetTimeout: 60000,     // 1分钟
    halfOpenProbeTimeout: 10000
  },

  /**
   * 慢速服务（如文件处理）：失败阈值高，恢复慢
   */
  SLOW: {
    failureThreshold: 10,
    successThreshold: 5,
    resetTimeout: 120000,    // 2分钟
    halfOpenProbeTimeout: 30000
  },

  /**
   * 严格模式（如支付）：失败阈值低，恢复慢
   */
  STRICT: {
    failureThreshold: 2,
    successThreshold: 3,
    resetTimeout: 180000,    // 3分钟
    halfOpenProbeTimeout: 15000
  }
};

class CircuitBreakerFactory {
  /**
   * 创建工厂实例
   * @param {Object} options - 工厂配置
   * @param {Object} [options.defaultConfig] - 默认熔断器配置
   * @param {Function} [options.logger] - 日志函数
   */
  constructor(options = {}) {
    // 熔断器注册表
    this._breakers = new Map();

    // 默认配置
    this._defaultConfig = {
      ...options.defaultConfig,
      onStateChange: (from, to, reason) => {
        this._log('info', `Circuit '${name}' state changed: ${from} -> ${to}`, { reason });
      },
      onEvent: (event, data) => {
        this._log('debug', `Circuit event: ${event}`, data);
      }
    };

    // 日志函数
    this._logger = options.logger || (() => {});

    // 全局限流配置
    this._globalFailureThreshold = options.globalFailureThreshold || 50;
    this._globalFailureCount = 0;
  }

  // ==================== 公共接口 ====================

  /**
   * 获取或创建命名熔断器
   * @param {string} name - 熔断器名称
   * @param {Object} [config] - 熔断器配置，会与默认配置合并
   * @returns {CircuitBreaker} 熔断器实例
   *
   * @example
   * const breaker = factory.get('minimax-api');
   * const result = await breaker.execute(
   *   () => callMiniMax(),
   *   () => getFallback()
   * );
   */
  get(name, config = {}) {
    if (!this._breakers.has(name)) {
      const fullConfig = this._mergeConfig(this._defaultConfig, config);
      const breaker = new CircuitBreaker({ ...fullConfig, name });
      this._breakers.set(name, breaker);
      this._log('info', `Created circuit breaker: ${name}`);
    }

    return this._breakers.get(name);
  }

  /**
   * 使用预设配置获取熔断器
   * @param {string} name - 熔断器名称
   * @param {string} preset - 预设名称 ('HIGH_SPEED' | 'STANDARD' | 'SLOW' | 'STRICT')
   * @param {Object} [overrides] - 配置覆盖
   * @returns {CircuitBreaker} 熔断器实例
   *
   * @example
   * const breaker = factory.getWithPreset('cache', 'HIGH_SPEED');
   */
  getWithPreset(name, preset, overrides = {}) {
    const presetConfig = Presets[preset];
    if (!presetConfig) {
      throw new Error(`Unknown preset: ${preset}. Available: ${Object.keys(Presets).join(', ')}`);
    }

    return this.get(name, this._mergeConfig(presetConfig, overrides));
  }

  /**
   * 为模型创建熔断器
   * @param {string} modelName - 模型名称
   * @param {Object} [config] - 可选的配置覆盖
   * @returns {CircuitBreaker} 熔断器实例
   *
   * @example
   * const breaker = factory.getForModel('MiniMax-M2.7');
   */
  getForModel(modelName, config = {}) {
    return this.getWithPreset(`model:${modelName}`, 'STANDARD', config);
  }

  /**
   * 获取所有熔断器
   * @returns {Map<string, CircuitBreaker>} 熔断器注册表
   */
  getAll() {
    return new Map(this._breakers);
  }

  /**
   * 获取所有熔断器的状态摘要
   * @returns {Object[]} 状态摘要列表
   */
  getStatusSummary() {
    const summary = [];
    for (const [name, breaker] of this._breakers) {
      summary.push({
        name,
        ...breaker.stats
      });
    }
    return summary;
  }

  /**
   * 检查是否有任何熔断器处于 OPEN 状态
   * @returns {boolean}
   */
  hasOpenCircuits() {
    for (const breaker of this._breakers.values()) {
      if (breaker.isOpen) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取处于 OPEN 状态的熔断器列表
   * @returns {CircuitBreaker[]} OPEN 状态的熔断器
   */
  getOpenCircuits() {
    const open = [];
    for (const breaker of this._breakers.values()) {
      if (breaker.isOpen) {
        open.push(breaker);
      }
    }
    return open;
  }

  /**
   * 重置所有熔断器
   */
  resetAll() {
    for (const breaker of this._breakers.values()) {
      breaker.reset();
    }
    this._log('info', 'All circuit breakers reset');
  }

  /**
   * 移除熔断器
   * @param {string} name - 熔断器名称
   */
  remove(name) {
    const breaker = this._breakers.get(name);
    if (breaker) {
      breaker.destroy();
      this._breakers.delete(name);
      this._log('info', `Removed circuit breaker: ${name}`);
    }
  }

  /**
   * 清空所有熔断器
   */
  clear() {
    for (const breaker of this._breakers.values()) {
      breaker.destroy();
    }
    this._breakers.clear();
    this._log('info', 'All circuit breakers cleared');
  }

  // ==================== 全局限流 ====================

  /**
   * 检查全局是否允许请求
   * @description 基于全局失败计数进行限流
   * @returns {boolean}
   */
  canExecuteGlobally() {
    if (this._globalFailureCount >= this._globalFailureThreshold) {
      return false;
    }
    return true;
  }

  /**
   * 记录全局失败
   */
  recordGlobalFailure() {
    this._globalFailureCount++;
    this._log('warn', `Global failure count: ${this._globalFailureCount}`);
  }

  /**
   * 重置全局失败计数
   */
  resetGlobalFailureCount() {
    this._globalFailureCount = 0;
  }

  // ==================== 私有方法 ====================

  /**
   * 合并配置
   * @private
   */
  _mergeConfig(defaultConfig, overrides) {
    return {
      ...defaultConfig,
      ...overrides,
      onStateChange: overrides.onStateChange || defaultConfig.onStateChange,
      onEvent: overrides.onEvent || defaultConfig.onEvent
    };
  }

  /**
   * 日志记录
   * @private
   */
  _log(level, message, data = {}) {
    this._logger(level, `[CircuitBreakerFactory] ${message}`, data);
  }
}

// 创建全局默认工厂实例
const defaultFactory = new CircuitBreakerFactory({
  logger: (level, msg) => {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    const current = levels[process.env.CIRCUIT_LOG_LEVEL] ?? 2;
    if (levels[level] <= current) {
      console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](msg);
    }
  }
});

module.exports = {
  CircuitBreakerFactory,
  CircuitBreakerFactory: CircuitBreakerFactory,
  Presets,
  defaultFactory
};

// 导出预设常量
module.exports.Presets = Presets;
