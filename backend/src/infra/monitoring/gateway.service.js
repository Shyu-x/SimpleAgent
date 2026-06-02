/**
 * 网关服务 - 自动降级策略实现
 * @description 监控错误率和延迟，自动触发降级和恢复
 *
 * 功能特性：
 * - 错误率阈值检测（默认 > 50%）
 * - 延迟阈值检测（默认 > 2s）
 * - 降级状态管理
 * - 5分钟后自动恢复
 * - 降级策略执行
 *
 * @author AI Chat 玩具团队
 * @date 2026-05-13
 */

const EventEmitter = require('events');
const { createLogger } = require('../logger/AgentLogger');

const logger = createLogger('gatewayService');

/**
 * 降级级别枚举
 */
const DegradationLevel = {
  NONE: 'none',           // 无降级
  LIGHT: 'light',         // 轻度降级（禁用非核心功能）
  MODERATE: 'moderate',   // 中度降级（禁用部分高消耗功能）
  HEAVY: 'heavy',         // 重度降级（仅保留核心聊天功能）
  CRITICAL: 'critical',   // 临界降级（只允许读取操作）
};

/**
 * 降级原因枚举
 */
const DegradationReason = {
  HIGH_ERROR_RATE: 'high_error_rate',
  HIGH_LATENCY: 'high_latency',
  CIRCUIT_BREAKER_OPEN: 'circuit_breaker_open',
  RESOURCE_EXHAUSTION: 'resource_exhaustion',
  MANUAL_TRIGGER: 'manual_trigger',
};

/**
 * 网关服务 - 自动降级和恢复
 */
class GatewayService extends EventEmitter {
  constructor(options = {}) {
    super();

    // 降级阈值配置
    this.errorRateThreshold = options.errorRateThreshold ?? 0.5;     // 50% 错误率
    this.latencyThreshold = options.latencyThreshold ?? 2000;          // 2s 延迟
    this.recoveryTimeout = options.recoveryTimeout ?? 300000;        // 5分钟自动恢复
    this.checkInterval = options.checkInterval ?? 10000;               // 10秒检查一次

    // 熔断器状态阈值
    this.circuitBreakerOpenThreshold = options.circuitBreakerOpenThreshold ?? 3;

    // 当前状态
    this._currentLevel = DegradationLevel.NONE;
    this._degradationReason = null;
    this._degradationStartTime = null;
    this._lastCheckTime = null;

    // 降级决策历史
    this._decisionHistory = [];
    this._maxHistorySize = 100;

    // 降级策略
    this._strategies = new Map();

    // 定时器
    this._checkTimer = null;
    this._recoveryTimer = null;

    // 指标收集器引用
    this._metricsCollector = null;

    // 初始化默认策略
    this._initDefaultStrategies();

    // 开始检查循环
    this._startCheckLoop();
  }

  /**
   * 初始化默认降级策略
   * @private
   */
  _initDefaultStrategies() {
    // 轻度降级策略
    this.registerStrategy(DegradationLevel.LIGHT, {
      disableFeatures: ['image_generation', 'voice_synthesis'],
      reduceRetries: true,
      increaseTimeout: 1.5,
    });

    // 中度降级策略
    this.registerStrategy(DegradationLevel.MODERATE, {
      disableFeatures: ['image_generation', 'voice_synthesis', 'long_context'],
      reduceRetries: true,
      increaseTimeout: 2,
      enableFallback: true,
    });

    // 重度降级策略
    this.registerStrategy(DegradationLevel.HEAVY, {
      disableFeatures: ['image_generation', 'voice_synthesis', 'long_context', 'advanced_rag'],
      reduceRetries: false,
      increaseTimeout: 3,
      enableFallback: true,
      maxTokens: 4000,
    });

    // 临界降级策略
    this.registerStrategy(DegradationLevel.CRITICAL, {
      disableFeatures: ['*'],
      readOnlyMode: true,
      maxTokens: 1000,
      timeout: 5000,
    });
  }

  /**
   * 注册降级策略
   * @param {string} level - 降级级别
   * @param {Object} strategy - 策略配置
   */
  registerStrategy(level, strategy) {
    this._strategies.set(level, {
      ...strategy,
      level,
      registeredAt: new Date().toISOString(),
    });
  }

  /**
   * 设置指标收集器
   * @param {Object} metricsCollector - 指标采集器实例
   */
  setMetricsCollector(metricsCollector) {
    this._metricsCollector = metricsCollector;
  }

  /**
   * 手动触发降级
   * @param {string} level - 降级级别
   * @param {string} reason - 降级原因
   */
  triggerDegradation(level, reason = DegradationReason.MANUAL_TRIGGER) {
    this._applyDegradation(level, reason);
  }

  /**
   * 手动恢复
   */
  recover() {
    this._applyDegradation(DegradationLevel.NONE, null);
  }

  /**
   * 执行检查循环
   * @private
   */
  _startCheckLoop() {
    if (this._checkTimer) {
      clearInterval(this._checkTimer);
    }

    this._checkTimer = setInterval(() => {
      this._performCheck();
    }, this.checkInterval);
  }

  /**
   * 执行检查
   * @private
   */
  async _performCheck() {
    this._lastCheckTime = new Date().toISOString();

    if (!this._metricsCollector) {
      return;
    }

    try {
      // 获取当前指标
      const errorRate = this._metricsCollector.calculateErrorRate();
      const latency = this._metricsCollector.extractLatencyMetrics();

      // 检查是否需要降级
      const shouldDegrade = this._shouldDegrade(errorRate, latency.p95);

      if (shouldDegrade && this._currentLevel === DegradationLevel.NONE) {
        // 触发降级
        const newLevel = this._calculateDegradationLevel(errorRate, latency.p95);
        this._applyDegradation(newLevel, shouldDegrade.reason);
      } else if (!shouldDegrade && this._currentLevel !== DegradationLevel.NONE) {
        // 检查是否应该恢复
        this._checkRecovery();
      }

      // 记录检查结果
      this._recordDecision({
        timestamp: this._lastCheckTime,
        errorRate,
        latencyP95: latency.p95,
        shouldDegrade,
        currentLevel: this._currentLevel,
      });
    } catch (error) {
      logger.error('检查失败', { error: error.message });
    }
  }

  /**
   * 判断是否应该降级
   * @param {number} errorRate - 错误率
   * @param {number} latencyP95 - P95 延迟
   * @returns {Object|false} 降级原因或 false
   * @private
   */
  _shouldDegrade(errorRate, latencyP95) {
    // 检查错误率
    if (errorRate > this.errorRateThreshold) {
      return {
        reason: DegradationReason.HIGH_ERROR_RATE,
        errorRate,
        threshold: this.errorRateThreshold,
      };
    }

    // 检查延迟
    if (latencyP95 > this.latencyThreshold) {
      return {
        reason: DegradationReason.HIGH_LATENCY,
        latencyP95,
        threshold: this.latencyThreshold,
      };
    }

    // 检查熔断器状态
    const openCircuits = this._getOpenCircuitBreakersCount();
    if (openCircuits >= this.circuitBreakerOpenThreshold) {
      return {
        reason: DegradationReason.CIRCUIT_BREAKER_OPEN,
        openCircuits,
        threshold: this.circuitBreakerOpenThreshold,
      };
    }

    return false;
  }

  /**
   * 获取打开的熔断器数量
   * @returns {number}
   * @private
   */
  _getOpenCircuitBreakersCount() {
    try {
      const CircuitBreakerFactory = require('../infra/circuitBreaker/CircuitBreakerFactory');
      const circuits = CircuitBreakerFactory?.getAllCircuits?.() || [];
      return circuits.filter(c => c.state === 'OPEN' || c.state === 'open').length;
    } catch {
      return 0;
    }
  }

  /**
   * 计算降级级别
   * @param {number} errorRate - 错误率
   * @param {number} latencyP95 - P95 延迟
   * @returns {string} 降级级别
   * @private
   */
  _calculateDegradationLevel(errorRate, latencyP95) {
    if (errorRate > 0.8 || latencyP95 > 10000) {
      return DegradationLevel.CRITICAL;
    }
    if (errorRate > 0.6 || latencyP95 > 5000) {
      return DegradationLevel.HEAVY;
    }
    if (errorRate > 0.5 || latencyP95 > 2000) {
      return DegradationLevel.MODERATE;
    }
    return DegradationLevel.LIGHT;
  }

  /**
   * 应用降级
   * @param {string} level - 降级级别
   * @param {string} reason - 降级原因
   * @private
   */
  _applyDegradation(level, reason) {
    const previousLevel = this._currentLevel;
    this._currentLevel = level;
    this._degradationReason = reason;

    if (level === DegradationLevel.NONE) {
      this._degradationStartTime = null;
      this._clearRecoveryTimer();
    } else {
      this._degradationStartTime = new Date().toISOString();
    }

    // 清除现有的恢复定时器
    this._clearRecoveryTimer();

    // 获取策略
    const strategy = this._strategies.get(level);

    // 触发事件
    this.emit('degradation', {
      previousLevel,
      currentLevel: level,
      reason,
      strategy,
      timestamp: new Date().toISOString(),
    });

    // 如果是降级，设置恢复定时器
    if (level !== DegradationLevel.NONE) {
      this._startRecoveryTimer();
    }

    // 记录决策
    this._recordDecision({
      timestamp: new Date().toISOString(),
      action: 'apply_degradation',
      previousLevel,
      newLevel: level,
      reason,
    });

    logger.info('降级状态变更', { previousLevel, level, reason, strategy });
  }

  /**
   * 检查是否应该恢复
   * @private
   */
  _checkRecovery() {
    if (!this._degradationStartTime) {
      // 如果没有开始时间，直接恢复
      this._applyDegradation(DegradationLevel.NONE, null);
      return;
    }

    const elapsed = Date.now() - new Date(this._degradationStartTime).getTime();

    if (elapsed >= this.recoveryTimeout) {
      // 超时恢复
      this._applyDegradation(DegradationLevel.NONE, 'recovery_timeout');
    }
  }

  /**
   * 启动恢复定时器
   * @private
   */
  _startRecoveryTimer() {
    this._clearRecoveryTimer();

    this._recoveryTimer = setTimeout(() => {
      logger.info('恢复定时器触发，开始健康检查...');

      // 执行一次检查
      this._performCheck().then(() => {
        // 如果检查通过，恢复
        if (this._currentLevel !== DegradationLevel.NONE) {
          const shouldDegrade = this._shouldDegrade(
            this._metricsCollector?.calculateErrorRate() || 0,
            this._metricsCollector?.extractLatencyMetrics()?.p95 || 0
          );

          if (!shouldDegrade) {
            this._applyDegradation(DegradationLevel.NONE, 'auto_recovery');
          }
        }
      });
    }, this.recoveryTimeout);
  }

  /**
   * 清除恢复定时器
   * @private
   */
  _clearRecoveryTimer() {
    if (this._recoveryTimer) {
      clearTimeout(this._recoveryTimer);
      this._recoveryTimer = null;
    }
  }

  /**
   * 记录决策
   * @param {Object} decision - 决策信息
   * @private
   */
  _recordDecision(decision) {
    this._decisionHistory.push(decision);

    if (this._decisionHistory.length > this._maxHistorySize) {
      this._decisionHistory = this._decisionHistory.slice(-this._maxHistorySize);
    }
  }

  /**
   * 获取当前降级状态
   * @returns {Object}
   */
  getStatus() {
    return {
      level: this._currentLevel,
      reason: this._degradationReason,
      startTime: this._degradationStartTime,
      strategy: this._strategies.get(this._currentLevel),
      uptime: this._degradationStartTime
        ? Date.now() - new Date(this._degradationStartTime).getTime()
        : 0,
      isDegraded: this._currentLevel !== DegradationLevel.NONE,
    };
  }

  /**
   * 获取决策历史
   * @param {number} limit - 返回数量限制
   * @returns {Array}
   */
  getHistory(limit = 20) {
    return this._decisionHistory.slice(-limit);
  }

  /**
   * 检查功能是否可用
   * @param {string} feature - 功能名称
   * @returns {boolean}
   */
  isFeatureEnabled(feature) {
    if (this._currentLevel === DegradationLevel.NONE) {
      return true;
    }

    const strategy = this._strategies.get(this._currentLevel);
    if (!strategy) {
      return true;
    }

    const disabledFeatures = strategy.disableFeatures || [];

    // 检查是否完全禁用
    if (disabledFeatures.includes('*')) {
      return false;
    }

    // 检查特定功能
    return !disabledFeatures.includes(feature);
  }

  /**
   * 获取超时倍数
   * @returns {number}
   */
  getTimeoutMultiplier() {
    const strategy = this._strategies.get(this._currentLevel);
    return strategy?.increaseTimeout || 1;
  }

  /**
   * 是否启用降级方案
   * @returns {boolean}
   */
  isFallbackEnabled() {
    const strategy = this._strategies.get(this._currentLevel);
    return strategy?.enableFallback || false;
  }

  /**
   * 是否只读模式
   * @returns {boolean}
   */
  isReadOnlyMode() {
    const strategy = this._strategies.get(this._currentLevel);
    return strategy?.readOnlyMode || false;
  }

  /**
   * 获取最大 Token 限制
   * @returns {number|null}
   */
  getMaxTokens() {
    const strategy = this._strategies.get(this._currentLevel);
    return strategy?.maxTokens || null;
  }

  /**
   * 关闭网关服务
   */
  shutdown() {
    if (this._checkTimer) {
      clearInterval(this._checkTimer);
      this._checkTimer = null;
    }

    this._clearRecoveryTimer();
    this.removeAllListeners();
  }
}

// 创建单例
let instance = null;

/**
 * 获取网关服务实例
 * @param {Object} options - 配置选项
 * @returns {GatewayService}
 */
function getGatewayService(options) {
  if (!instance) {
    instance = new GatewayService(options);
  }
  return instance;
}

module.exports = {
  GatewayService,
  getGatewayService,
  DegradationLevel,
  DegradationReason,
};