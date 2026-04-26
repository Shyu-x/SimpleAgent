/**
 * 健康检查器
 * @description 对模型服务进行健康检查，支持多种检查策略
 *
 * @author AI Chat 玩具团队
 * @date 2026-03-21
 */

const { TimeoutError } = require('../../infra/circuitBreaker/CircuitBreaker');

/**
 * 健康状态枚举
 */
const HealthStatus = {
  HEALTHY: 'HEALTHY',       // 健康
  DEGRADED: 'DEGRADED',     // 降级（部分可用）
  UNHEALTHY: 'UNHEALTHY',   // 不健康
  UNKNOWN: 'UNKNOWN'         // 未知
};

/**
 * 健康检查策略类型
 */
const CheckStrategy = {
  PING: 'ping',             // Ping 检查（简单探测）
  FULL: 'full',             // 完整检查（实际请求）
  HISTORICAL: 'historical'  // 基于历史数据分析
};

class HealthChecker {
  /**
   * 创建健康检查器
   * @param {Object} options - 配置选项
   * @param {Function} options.healthCheckFn - 健康检查函数，返回 Promise<boolean>
   * @param {number} [options.interval=30000] - 检查间隔（毫秒）
   * @param {number} [options.timeout=5000] - 检查超时（毫秒）
   * @param {number} [options.unhealthyThreshold=3] - 连续失败次数达到此值视为不健康
   * @param {number} [options.healthyThreshold=2] - 连续成功次数达到此值视为健康
   * @param {Function} [options.onStatusChange] - 状态变更回调
   */
  constructor(options = {}) {
    if (!options.healthCheckFn) {
      throw new Error('healthCheckFn is required');
    }

    this.healthCheckFn = options.healthCheckFn;
    this.interval = options.interval ?? 30000;
    this.timeout = options.timeout ?? 5000;
    this.unhealthyThreshold = options.unhealthyThreshold ?? 3;
    this.healthyThreshold = options.healthyThreshold ?? 2;
    this.onStatusChange = options.onStatusChange || (() => {});

    // 健康状态
    this._status = HealthStatus.UNKNOWN;
    this._consecutiveFailures = 0;
    this._consecutiveSuccesses = 0;
    this._lastCheckTime = null;
    this._lastCheckResult = null;
    this._lastCheckDuration = null;

    // 检查历史（用于 DEGRADED 状态判断）
    this._checkHistory = [];
    this._maxHistorySize = 10;

    // 定时器
    this._timer = null;
    this._isRunning = false;

    // 统计数据
    this._totalChecks = 0;
    this._totalSuccesses = 0;
    this._totalFailures = 0;
  }

  // ==================== 属性访问 ====================

  /**
   * 获取当前健康状态
   */
  get status() {
    return this._status;
  }

  /**
   * 获取健康状态详情
   */
  get details() {
    return {
      status: this._status,
      consecutiveFailures: this._consecutiveFailures,
      consecutiveSuccesses: this._consecutiveSuccesses,
      lastCheckTime: this._lastCheckTime,
      lastCheckResult: this._lastCheckResult,
      lastCheckDuration: this._lastCheckDuration,
      totalChecks: this._totalChecks,
      totalSuccesses: this._totalSuccesses,
      totalFailures: this._totalFailures,
      successRate: this._totalChecks > 0
        ? (this._totalSuccesses / this._totalChecks * 100).toFixed(2) + '%'
        : 'N/A'
    };
  }

  // ==================== 健康检查操作 ====================

  /**
   * 执行一次健康检查
   * @returns {Promise<Object>} 检查结果
   *
   * @example
   * const result = await healthChecker.check();
   * console.log(result.status); // 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY'
   */
  async check() {
    const startTime = Date.now();
    let isHealthy = false;
    let error = null;

    try {
      // 设置超时
      isHealthy = await this._timeoutPromise(
        this.healthCheckFn(),
        this.timeout
      );
    } catch (err) {
      isHealthy = false;
      error = err instanceof TimeoutError ? 'timeout' : err.message;
    }

    const duration = Date.now() - startTime;

    // 记录历史
    this._recordHistory({
      timestamp: startTime,
      isHealthy,
      duration,
      error
    });

    // 更新统计
    this._totalChecks++;
    this._lastCheckResult = isHealthy;
    this._lastCheckDuration = duration;
    this._lastCheckTime = startTime;

    if (isHealthy) {
      this._totalSuccesses++;
      this._consecutiveSuccesses++;
      this._consecutiveFailures = 0;
    } else {
      this._totalFailures++;
      this._consecutiveFailures++;
      this._consecutiveSuccesses = 0;
    }

    // 更新状态
    this._updateStatus();

    return {
      status: this._status,
      isHealthy,
      duration,
      error,
      details: this.details
    };
  }

  /**
   * 启动定时健康检查
   */
  start() {
    if (this._isRunning) {
      return;
    }

    this._isRunning = true;

    // 立即执行一次检查
    this.check().catch(() => {});

    // 设置定时器
    this._timer = setInterval(async () => {
      try {
        await this.check();
      } catch (err) {
        console.error('Health check error:', err);
      }
    }, this.interval);

    console.log(`[HealthChecker] Started with interval: ${this.interval}ms`);
  }

  /**
   * 停止定时健康检查
   */
  stop() {
    if (!this._isRunning) {
      return;
    }

    this._isRunning = false;

    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }

    console.log('[HealthChecker] Stopped');
  }

  /**
   * 手动标记为健康
   */
  markHealthy() {
    this._consecutiveSuccesses = this._healthyThreshold;
    this._consecutiveFailures = 0;
    this._updateStatus();
  }

  /**
   * 手动标记为不健康
   */
  markUnhealthy(reason = 'manual') {
    this._consecutiveFailures = this._unhealthyThreshold;
    this._consecutiveSuccesses = 0;
    this._recordHistory({
      timestamp: Date.now(),
      isHealthy: false,
      error: reason
    });
    this._updateStatus();
  }

  /**
   * 重置健康检查器
   */
  reset() {
    this._status = HealthStatus.UNKNOWN;
    this._consecutiveFailures = 0;
    this._consecutiveSuccesses = 0;
    this._checkHistory = [];
    this._totalChecks = 0;
    this._totalSuccesses = 0;
    this._totalFailures = 0;
    this._lastCheckTime = null;
    this._lastCheckResult = null;
  }

  // ==================== 私有方法 ====================

  /**
   * 更新健康状态
   * @private
   */
  _updateStatus() {
    const previousStatus = this._status;
    let newStatus = HealthStatus.UNKNOWN;

    if (this._consecutiveFailures >= this.unhealthyThreshold) {
      newStatus = HealthStatus.UNHEALTHY;
    } else if (this._consecutiveSuccesses >= this.healthyThreshold) {
      // 检查历史成功率来决定是 HEALTHY 还是 DEGRADED
      const successRate = this._calculateHistoricalSuccessRate();
      if (successRate >= 0.8) {
        newStatus = HealthStatus.HEALTHY;
      } else if (successRate >= 0.5) {
        newStatus = HealthStatus.DEGRADED;
      } else {
        newStatus = HealthStatus.UNHEALTHY;
      }
    } else if (this._totalChecks > 0) {
      // 有检查记录但不满足任何阈值
      newStatus = HealthStatus.DEGRADED;
    }

    if (newStatus !== previousStatus) {
      this._status = newStatus;
      this.onStatusChange(previousStatus, newStatus, this.details);
    }
  }

  /**
   * 计算历史成功率
   * @private
   */
  _calculateHistoricalSuccessRate() {
    if (this._checkHistory.length === 0) {
      return 1.0;
    }

    const recentChecks = this._checkHistory.slice(-this._maxHistorySize);
    const successCount = recentChecks.filter(c => c.isHealthy).length;
    return successCount / recentChecks.length;
  }

  /**
   * 记录检查历史
   * @private
   */
  _recordHistory(record) {
    this._checkHistory.push(record);

    // 保持历史记录在限制内
    if (this._checkHistory.length > this._maxHistorySize * 2) {
      this._checkHistory = this._checkHistory.slice(-this._maxHistorySize);
    }
  }

  /**
   * 超时 Promise 封装
   * @private
   */
  _timeoutPromise(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError(`Health check timed out after ${ms}ms`));
      }, ms);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }
}

/**
 * 模型健康检查器工厂
 * @description 为模型创建专门的健康检查器
 */
class ModelHealthCheckerFactory {
  /**
   * 创建模型健康检查器
   * @param {Object} options - 配置选项
   * @param {Function} options.callModelFn - 调用模型的函数
   * @param {string} options.modelName - 模型名称
   * @param {Object} [options.checkOptions] - 健康检查器配置
   * @returns {HealthChecker} 健康检查器实例
   *
   * @example
   * const factory = new ModelHealthCheckerFactory({
   *   callModelFn: async (prompt) => callMiniMax(prompt),
   *   modelName: 'MiniMax-M2.7'
   * });
   *
   * const checker = factory.create({
   *   interval: 60000,
   *   unhealthyThreshold: 5
   * });
   *
   * checker.start();
   */
  create(options = {}) {
    const callModelFn = options.callModelFn || this.callModelFn;
    const modelName = options.modelName || 'default';

    // 创建一个简单的 ping 检查
    const healthCheckFn = async () => {
      try {
        // 使用一个简单的请求来检查模型是否可用
        const result = await callModelFn('ping');
        return result !== null && result !== undefined;
      } catch (err) {
        return false;
      }
    };

    return new HealthChecker({
      healthCheckFn,
      ...options.checkOptions,
      onStatusChange: (from, to, details) => {
        console.log(`[ModelHealthChecker:${modelName}] ${from} -> ${to}`);
        options.onStatusChange?.(from, to, details);
      }
    });
  }
}

module.exports = {
  HealthChecker,
  ModelHealthCheckerFactory,
  HealthStatus,
  CheckStrategy
};
