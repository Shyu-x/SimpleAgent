/**
 * 熔断器实现
 *
 * 为什么需要熔断器：
 * 企业里如果某个模型供应商挂了，如果还持续调用会：
 * 1. 浪费资源（大量超时请求）
 * 2. 用户体验差（长时间等待失败）
 * 3. 可能引发连锁故障
 *
 * 熔断器模式：失败率达到阈值后，"跳闸"快速失败，
 * 避免持续调用不健康的服务，给它恢复时间。
 *
 * 不用熔断器的问题：一个服务挂了，整个系统跟着挂。
 */

const EventEmitter = require('events');

// 熔断器状态
const CircuitState = {
  CLOSED: 'CLOSED',     // 正常，流量正常通过
  OPEN: 'OPEN',         // 熔断，所有请求快速失败
  HALF_OPEN: 'HALF_OPEN' // 半开，允许一个测试请求
};

class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();

    // 配置
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;      // 失败次数阈值
    this.successThreshold = options.successThreshold || 3;       // 成功后恢复阈值 (HALF_OPEN -> CLOSED)
    this.timeout = options.timeout || 60000;                    // 熔断持续时间 (ms)
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 1;      // 半开状态下允许的测试请求数

    // 状态
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;

    // 统计
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      stateChanges: []
    };
  }

  /**
   * 执行被保护的操作
   * @param {Function} operation - 要执行的操作
   * @param {Function} fallback - 降级方法 (可选)
   */
  async execute(operation, fallback) {
    this.stats.totalCalls++;

    // 检查是否可以执行
    if (!this.canExecute()) {
      this.stats.rejectedCalls++;
      this.emit('rejected', { circuit: this.name, state: this.state });

      if (fallback) {
        return fallback();
      }
      throw new Error(`CircuitBreaker [${this.name}] is ${this.state}`);
    }

    // 执行操作
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) {
        return fallback();
      }
      throw error;
    }
  }

  /**
   * 检查是否可以执行
   */
  canExecute() {
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        // 检查超时是否到期，到期则进入半开状态
        if (Date.now() - this.lastFailureTime >= this.timeout) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return true;
        }
        return false;

      case CircuitState.HALF_OPEN:
        // 半开状态下限制测试请求数
        return this.halfOpenCalls < this.halfOpenMaxCalls;

      default:
        return false;
    }
  }

  /**
   * 成功回调
   */
  onSuccess() {
    this.stats.successfulCalls++;

    switch (this.state) {
      case CircuitState.CLOSED:
        // 成功重置计数
        this.failureCount = 0;
        break;

      case CircuitState.HALF_OPEN:
        // 半开状态下成功，增加成功计数
        this.successCount++;
        this.halfOpenCalls++;

        // 达到成功阈值，关闭熔断器
        if (this.successCount >= this.successThreshold) {
          this.transitionTo(CircuitState.CLOSED);
        }
        break;
    }
  }

  /**
   * 失败回调
   */
  onFailure() {
    this.stats.failedCalls++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    switch (this.state) {
      case CircuitState.CLOSED:
        // 达到失败阈值，打开熔断器
        if (this.failureCount >= this.failureThreshold) {
          this.transitionTo(CircuitState.OPEN);
        }
        break;

      case CircuitState.HALF_OPEN:
        // 半开状态下任何失败都直接打开熔断器
        this.transitionTo(CircuitState.OPEN);
        break;
    }
  }

  /**
   * 状态转换
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;

    // 重置相关计数
    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      this.halfOpenCalls = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenCalls = 0;
      this.successCount = 0;
    }

    this.stats.stateChanges.push({
      from: oldState,
      to: newState,
      timestamp: Date.now()
    });

    this.emit('stateChange', { circuit: this.name, from: oldState, to: newState });
  }

  /**
   * 获取状态
   */
  getState() {
    return {
      circuit: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      stats: { ...this.stats }
    };
  }

  /**
   * 重置熔断器
   */
  reset() {
    this.transitionTo(CircuitState.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      stateChanges: []
    };
  }

  /**
   * 强制打开熔断器 (用于维护)
   */
  forceOpen() {
    this.transitionTo(CircuitState.OPEN);
  }
}

/**
 * 熔断器工厂
 */
class CircuitBreakerFactory {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * 获取或创建熔断器
   */
  get(name, options) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({ name, ...options }));
    }
    return this.breakers.get(name);
  }

  /**
   * 获取所有熔断器状态
   */
  getAllStates() {
    return Array.from(this.breakers.values()).map(b => b.getState());
  }

  /**
   * 重置所有熔断器
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// 全局熔断器工厂
const breakerFactory = new CircuitBreakerFactory();

module.exports = {
  CircuitBreaker,
  CircuitBreakerFactory,
  CircuitState,
  breakerFactory
};
