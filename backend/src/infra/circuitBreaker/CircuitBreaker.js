/**
 * 企业级熔断器实现
 * @description 实现三态熔断器（CLOSED/OPEN/HALF_OPEN），用于保护服务调用链
 *
 * 状态转换规则：
 * - CLOSED -> OPEN: 失败次数超过 threshold 或错误率超过 limit
 * - OPEN -> HALF_OPEN: 等待时间超过 resetTimeout
 * - HALF_OPEN -> CLOSED: 探测请求成功
 * - HALF_OPEN -> OPEN: 探测请求失败
 *
 * @author AI Chat 玩具团队
 * @date 2026-03-21
 */

const { CircuitState } = require('./CircuitState');
const { CircuitEvent } = require('./CircuitEvent');

class CircuitBreaker {
  /**
   * 创建熔断器实例
   * @param {Object} options - 配置选项
   * @param {string} options.name - 熔断器名称，用于标识和日志
   * @param {number} [options.failureThreshold=5] - 触发熔断的连续失败次数
   * @param {number} [options.successThreshold=3] - 半开状态下成功次数才关闭熔断
   * @param {number} [options.resetTimeout=60000] - OPEN 状态持续时间（毫秒），之后进入 HALF_OPEN
   * @param {number} [options.halfOpenProbeTimeout=10000] - 半开探测超时时间（毫秒）
   * @param {Function} [options.onStateChange] - 状态变更回调 (fromState, toState) => void
   * @param {Function} [options.onEvent] - 事件回调 (event, data) => void
   */
  constructor(options = {}) {
    this.name = options.name || 'default';

    // 失败阈值配置
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 3;

    // 超时配置
    this.resetTimeout = options.resetTimeout ?? 60000;
    this.halfOpenProbeTimeout = options.halfOpenProbeTimeout ?? 10000;

    // 回调配置
    this.onStateChange = options.onStateChange || (() => {});
    this.onEvent = options.onEvent || (() => {});

    // 内部状态
    this._state = CircuitState.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = null;
    this._lastStateChangeTime = Date.now();

    // 探测请求 ID，用于半开状态的单一探测
    this._probeRequestId = 0;

    // 历史统计
    this._totalSuccesses = 0;
    this._totalFailures = 0;
    this._totalProbes = 0;
    this._totalStateChanges = 0;

    // 半开探测队列
    this._probeQueue = [];

    // 定时器引用
    this._stateTransitionTimer = null;
  }

  // ==================== 状态访问 ====================

  /**
   * 获取当前熔断器状态
   * @returns {string} 当前状态
   */
  get state() {
    return this._state;
  }

  /**
   * 检查熔断器是否处于关闭状态
   * @returns {boolean}
   */
  get isClosed() {
    return this._state === CircuitState.CLOSED;
  }

  /**
   * 检查熔断器是否处于打开状态
   * @returns {boolean}
   */
  get isOpen() {
    return this._state === CircuitState.OPEN;
  }

  /**
   * 检查熔断器是否处于半开状态
   * @returns {boolean}
   */
  get isHalfOpen() {
    return this._state === CircuitState.HALF_OPEN;
  }

  /**
   * 获取熔断器统计数据
   * @returns {Object} 统计信息
   */
  get stats() {
    return {
      name: this.name,
      state: this._state,
      failureCount: this._failureCount,
      successCount: this._successCount,
      totalSuccesses: this._totalSuccesses,
      totalFailures: this._totalFailures,
      totalProbes: this._totalProbes,
      totalStateChanges: this._totalStateChanges,
      lastFailureTime: this._lastFailureTime,
      uptime: Date.now() - this._lastStateChangeTime
    };
  }

  // ==================== 核心操作 ====================

  /**
   * 执行受保护的操作
   * @description 根据熔断器状态决定是否执行操作
   * @param {Function} operation - 要执行的操作，返回 Promise
   * @param {Function} [fallback] - 熔断打开时的降级操作
   * @returns {Promise<any>} 操作结果
   *
   * @example
   * const result = await circuitBreaker.execute(
   *   () => callMiniMaxAPI(),
   *   () => getCachedResult()
   * );
   */
  async execute(operation, fallback = null) {
    // 检查是否允许执行
    if (!this.canExecute()) {
      this._emitEvent(CircuitEvent.FAILURE, { reason: 'circuit_open', state: this._state });

      if (fallback) {
        return await fallback();
      }

      throw new CircuitOpenError(this.name, this._state, this._getTimeUntilRetry());
    }

    // 标记为探测请求（如果是半开状态）
    const isProbe = this._state === CircuitState.HALF_OPEN;
    const probeId = isProbe ? ++this._probeRequestId : null;

    try {
      // 执行操作，设置超时
      const result = await this._executeWithTimeout(operation);

      // 处理成功结果
      this._onSuccess(isProbe, probeId);
      return result;

    } catch (error) {
      // 处理失败结果
      this._onFailure(error, isProbe, probeId);

      // 如果有降级操作且不是超时导致的失败
      if (fallback && !this._isTimeoutError(error)) {
        return await fallback();
      }

      throw error;
    }
  }

  /**
   * 检查当前是否允许执行请求
   * @returns {boolean}
   */
  canExecute() {
    switch (this._state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        // 检查是否应该转换到半开状态
        if (this._shouldTransitionToHalfOpen()) {
          this._transitionTo(CircuitState.HALF_OPEN);
          return true;
        }
        return false;

      case CircuitState.HALF_OPEN:
        // 半开状态只允许一个探测请求
        return this._probeQueue.length === 0;

      default:
        return true;
    }
  }

  /**
   * 手动重置熔断器到关闭状态
   */
  reset() {
    this._clearTimers();
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = null;
    this._probeQueue = [];
    this._transitionTo(CircuitState.CLOSED);
  }

  /**
   * 手动强制打开熔断器
   * @param {string} [reason] - 打开原因
   */
  forceOpen(reason = 'manual') {
    this._clearTimers();
    this._transitionTo(CircuitState.OPEN, reason);
  }

  // ==================== 私有方法 ====================

  /**
   * 执行操作并设置超时
   * @private
   */
  async _executeWithTimeout(operation) {
    const timeout = this._state === CircuitState.HALF_OPEN
      ? this.halfOpenProbeTimeout
      : 0; // 正常状态不设置超时

    if (!timeout) {
      return await operation();
    }

    return this._timeoutPromise(operation(), timeout);
  }

  /**
   * 超时 Promise 封装
   * @private
   */
  _timeoutPromise(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError(`Operation timed out after ${ms}ms`));
      }, ms);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  /**
   * 处理成功结果
   * @private
   */
  _onSuccess(isProbe, probeId) {
    this._totalSuccesses++;

    if (isProbe) {
      this._successCount++;
      this._emitEvent(CircuitEvent.PROBE_SUCCESS, { probeId });

      // 半开状态：连续成功次数达到阈值，关闭熔断
      if (this._successCount >= this.successThreshold) {
        this._transitionTo(CircuitState.CLOSED);
      }
    } else {
      // 正常状态：重置失败计数
      this._failureCount = 0;
      this._emitEvent(CircuitEvent.SUCCESS);
    }
  }

  /**
   * 处理失败结果
   * @private
   */
  _onFailure(error, isProbe, probeId) {
    this._totalFailures++;
    this._lastFailureTime = Date.now();

    if (isProbe) {
      this._emitEvent(CircuitEvent.PROBE_FAILURE, { probeId, error: error.message });

      // 半开状态：探测失败，立即回到 OPEN
      this._transitionTo(CircuitState.OPEN, `probe_failed: ${error.message}`);

    } else {
      this._failureCount++;
      this._emitEvent(CircuitEvent.FAILURE, {
        failureCount: this._failureCount,
        threshold: this.failureThreshold,
        error: error.message
      });

      // 正常状态：失败次数达到阈值，打开熔断
      if (this._failureCount >= this.failureThreshold) {
        this._transitionTo(CircuitState.OPEN, `threshold_exceeded: ${this._failureCount} failures`);
      }
    }
  }

  /**
   * 状态转换
   * @private
   */
  _transitionTo(newState, reason = null) {
    if (this._state === newState) {
      return;
    }

    const oldState = this._state;
    this._lastStateChangeTime = Date.now();
    this._state = newState;

    // 重置计数器
    if (newState === CircuitState.CLOSED) {
      this._failureCount = 0;
      this._successCount = 0;
      this._probeQueue = [];
    } else if (newState === CircuitState.HALF_OPEN) {
      this._successCount = 0;
    }

    // 清除现有定时器
    this._clearTimers();

    // 如果是 OPEN 状态，设置定时器自动转换到 HALF_OPEN
    if (newState === CircuitState.OPEN) {
      this._stateTransitionTimer = setTimeout(() => {
        if (this._state === CircuitState.OPEN) {
          this._transitionTo(CircuitState.HALF_OPEN, 'timeout_expired');
        }
      }, this.resetTimeout);
    }

    this._totalStateChanges++;

    // 触发回调
    this.onStateChange(oldState, newState, reason);
    this._emitEvent(this._getTransitionEvent(newState), { from: oldState, to: newState, reason });
  }

  /**
   * 获取状态转换对应的事件
   * @private
   */
  _getTransitionEvent(state) {
    switch (state) {
      case CircuitState.CLOSED:
        return CircuitEvent.CLOSE;
      case CircuitState.OPEN:
        return CircuitEvent.OPEN;
      case CircuitState.HALF_OPEN:
        return CircuitEvent.HALF_OPEN;
      default:
        return 'circuit:unknown_transition';
    }
  }

  /**
   * 检查是否应该转换到半开状态
   * @private
   */
  _shouldTransitionToHalfOpen() {
    if (!this._lastFailureTime) {
      return true;
    }
    return Date.now() - this._lastFailureTime >= this.resetTimeout;
  }

  /**
   * 获取距离下次重试的时间
   * @private
   */
  _getTimeUntilRetry() {
    if (!this._lastFailureTime || this._state !== CircuitState.OPEN) {
      return 0;
    }
    const elapsed = Date.now() - this._lastFailureTime;
    return Math.max(0, this.resetTimeout - elapsed);
  }

  /**
   * 判断是否为超时错误
   * @private
   */
  _isTimeoutError(error) {
    return error instanceof TimeoutError;
  }

  /**
   * 触发事件
   * @private
   */
  _emitEvent(event, data = {}) {
    this.onEvent(event, { ...data, circuit: this.name, timestamp: Date.now() });
  }

  /**
   * 清除定时器
   * @private
   */
  _clearTimers() {
    if (this._stateTransitionTimer) {
      clearTimeout(this._stateTransitionTimer);
      this._stateTransitionTimer = null;
    }
  }

  /**
   * 销毁熔断器，清理资源
   */
  destroy() {
    this._clearTimers();
    this._probeQueue = [];
  }
}

/**
 * 熔断器打开错误
 */
class CircuitOpenError extends Error {
  constructor(circuitName, state, retryAfter = 0) {
    super(`Circuit '${circuitName}' is ${state}`);
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;
    this.state = state;
    this.retryAfter = retryAfter;
  }
}

/**
 * 超时错误
 */
class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

module.exports = {
  CircuitBreaker,
  CircuitOpenError,
  TimeoutError,
  CircuitState,
  CircuitEvent
};
