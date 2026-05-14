/**
 * Circuit Options - 熔断器配置选项
 * 用于配置熔断器的行为参数
 */
export interface CircuitOptions {
  /** 熔断器名称，用于标识不同的熔断器实例 */
  name?: string;
  /** 失败阈值：达到此数量后熔断器打开（默认值：5） */
  failureThreshold?: number;
  /** 成功阈值：半开状态下连续成功次数达到此数量后熔断器闭合（默认值：3） */
  successThreshold?: number;
  /** 重置超时：熔断器打开后等待多久尝试恢复（默认值：60000ms） */
  resetTimeout?: number;
  /** 半开探测超时：半开状态下单次探测的超时时间（默认值：10000ms） */
  halfOpenProbeTimeout?: number;
  /** 状态变化回调：当熔断器状态发生变化时调用 */
  onStateChange?: (fromState: string, toState: string, reason?: string) => void;
  /** 事件回调：当熔断器发生事件时调用 */
  onEvent?: (event: string, data: any) => void;
}

/**
 * Circuit Stats - 熔断器统计信息
 * 记录熔断器的运行状态和统计数据
 */
export interface CircuitStats {
  /** 熔断器名称 */
  name: string;
  /** 当前状态 */
  state: string;
  /** 当前失败计数 */
  failureCount: number;
  /** 当前成功计数（半开状态） */
  successCount: number;
  /** 历史总成功次数 */
  totalSuccesses: number;
  /** 历史总失败次数 */
  totalFailures: number;
  /** 历史总探测次数 */
  totalProbes: number;
  /** 历史总状态变化次数 */
  totalStateChanges: number;
  /** 最后失败时间戳 */
  lastFailureTime: number | null;
  /** 熔断器运行时长（从上次状态变化开始） */
  uptime: number;
}

/**
 * Circuit Breaker - 企业级熔断器实现
 *
 * 三态机制：
 * 1. CLOSED（闭合）：正常运行，统计失败次数
 * 2. OPEN（打开）：故障状态，拒绝所有请求
 * 3. HALF_OPEN（半开）：探测恢复，允许一个请求尝试
 *
 * 使用场景：
 * - 保护下游服务不被雪崩效应拖垮
 * - 快速失败，避免资源耗尽
 * - 自动恢复，无需人工干预
 */
export class CircuitBreaker {
  private _state: CircuitState;
  private _failureCount: number;
  private _successCount: number;
  private _lastFailureTime: number | null;
  private _lastStateChangeTime: number;
  private _probeRequestId: number;
  private _totalSuccesses: number;
  private _totalFailures: number;
  private _totalProbes: number;
  private _totalStateChanges: number;
  private _stateTransitionTimer: NodeJS.Timeout | null;

  // 配置参数
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly resetTimeout: number;
  private readonly halfOpenProbeTimeout: number;
  private readonly onStateChange?: (fromState: CircuitState, toState: CircuitState, reason?: string) => void;
  private readonly onEvent?: (event: CircuitEvent, data: any) => void;

  constructor(options: CircuitOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 3;
    this.resetTimeout = options.resetTimeout ?? 60000;
    this.halfOpenProbeTimeout = options.halfOpenProbeTimeout ?? 10000;
    this.onStateChange = options.onStateChange;
    this.onEvent = options.onEvent;

    this._state = CircuitState.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = null;
    this._lastStateChangeTime = Date.now();
    this._probeRequestId = 0;
    this._totalSuccesses = 0;
    this._totalFailures = 0;
    this._totalProbes = 0;
    this._totalStateChanges = 0;
    this._stateTransitionTimer = null;
  }

  /**
   * 获取当前状态
   */
  get state(): CircuitState {
    return this._state;
  }

  /**
   * 获取熔断器名称
   */
  get name(): string {
    return this['_name'] || 'default';
  }

  /**
   * 执行受保护的操作
   * @param fn 要执行的操作函数
   * @param fallback 降级回调函数（可选）
   * @returns 操作结果
   * @throws CircuitOpenError 当熔断器打开时
   */
  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      this.emitEvent(CircuitEvent.FAILURE, { reason: 'circuit_open', state: this._state });

      if (fallback) {
        return fallback();
      }

      throw new CircuitOpenError(this.name, this._state, this.getTimeUntilRetry());
    }

    const isProbe = this._state === CircuitState.HALF_OPEN;
    const probeId = isProbe ? ++this._probeRequestId : null;

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess(isProbe, probeId);
      return result;
    } catch (error) {
      this.onFailure(error as Error, isProbe, probeId);

      if (fallback && !this.isTimeoutError(error as Error)) {
        return fallback();
      }

      throw error;
    }
  }

  /**
   * 检查当前是否可以执行请求
   */
  private canExecute(): boolean {
    switch (this._state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        if (this.shouldTransitionToHalfOpen()) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return true;
        }
        return false;

      case CircuitState.HALF_OPEN:
        return true; // 半开状态允许一个探测请求

      default:
        return true;
    }
  }

  /**
   * 获取熔断器统计信息
   */
  getStats(): CircuitStats {
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
      uptime: Date.now() - this._lastStateChangeTime,
    };
  }

  /**
   * 重置熔断器到闭合状态
   */
  reset(): void {
    this.clearTimers();
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = null;
    this.transitionTo(CircuitState.CLOSED, 'manual_reset');
  }

  /**
   * 强制打开熔断器
   * @param reason 打开原因
   */
  forceOpen(reason = 'manual'): void {
    this.clearTimers();
    this.transitionTo(CircuitState.OPEN, reason);
  }

  /**
   * 销毁熔断器，清理所有定时器
   */
  destroy(): void {
    this.clearTimers();
  }

  /**
   * 带超时执行操作
   */
  private executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    const timeout = this._state === CircuitState.HALF_OPEN ? this.halfOpenProbeTimeout : 0;

    if (!timeout) {
      return operation();
    }

    return this.timeoutPromise(operation(), timeout);
  }

  /**
   * Promise 超时包装
   */
  private timeoutPromise<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError(`Operation timed out after ${ms}ms`));
      }, ms);

      promise.then(resolve).catch(reject).finally(() => clearTimeout(timer));
    });
  }

  /**
   * 处理成功回调
   */
  private onSuccess(isProbe: boolean, probeId: number | null): void {
    this._totalSuccesses++;

    if (isProbe) {
      this._successCount++;
      this._totalProbes++;
      this.emitEvent(CircuitEvent.PROBE_SUCCESS, { probeId });

      // 半开状态下连续成功达到阈值，闭合熔断器
      if (this._successCount >= this.successThreshold) {
        this.transitionTo(CircuitState.CLOSED, 'probe_success_threshold_reached');
      }
    } else {
      // 成功后重置失败计数
      this._failureCount = 0;
      this.emitEvent(CircuitEvent.SUCCESS);
    }
  }

  /**
   * 处理失败回调
   */
  private onFailure(error: Error, isProbe: boolean, probeId: number | null): void {
    this._totalFailures++;
    this._lastFailureTime = Date.now();

    if (isProbe) {
      this._totalProbes++;
      this.emitEvent(CircuitEvent.PROBE_FAILURE, { probeId, error: error.message });
      // 探测失败，重新打开熔断器
      this.transitionTo(CircuitState.OPEN, `probe_failed: ${error.message}`);
    } else {
      this._failureCount++;
      this.emitEvent(CircuitEvent.FAILURE, {
        failureCount: this._failureCount,
        threshold: this.failureThreshold,
        error: error.message,
      });

      // 失败次数达到阈值，打开熔断器
      if (this._failureCount >= this.failureThreshold) {
        this.transitionTo(CircuitState.OPEN, `threshold_exceeded: ${this._failureCount} failures`);
      }
    }
  }

  /**
   * 状态转换
   */
  private transitionTo(newState: CircuitState, reason?: string): void {
    if (this._state === newState) {
      return;
    }

    const oldState = this._state;
    this._lastStateChangeTime = Date.now();
    this._state = newState;

    if (newState === CircuitState.CLOSED) {
      // 闭合时重置计数器
      this._failureCount = 0;
      this._successCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      // 半开时重置成功计数
      this._successCount = 0;
    }

    this.clearTimers();

    // OPEN 状态时设置定时器，自动转换到 HALF_OPEN
    if (newState === CircuitState.OPEN) {
      this._stateTransitionTimer = setTimeout(() => {
        if (this._state === CircuitState.OPEN) {
          this.transitionTo(CircuitState.HALF_OPEN, 'timeout_expired');
        }
      }, this.resetTimeout);
    }

    this._totalStateChanges++;

    // 触发回调
    this.onStateChange?.(oldState, newState, reason);
    this.emitEvent(this.getTransitionEvent(newState), { from: oldState, to: newState, reason });
  }

  /**
   * 获取状态转换对应的事件
   */
  private getTransitionEvent(state: CircuitState): CircuitEvent {
    switch (state) {
      case CircuitState.CLOSED:
        return CircuitEvent.CLOSE;
      case CircuitState.OPEN:
        return CircuitEvent.OPEN;
      case CircuitState.HALF_OPEN:
        return CircuitEvent.HALF_OPEN;
      default:
        return CircuitEvent.CLOSE;
    }
  }

  /**
   * 检查是否应该转换到半开状态
   */
  private shouldTransitionToHalfOpen(): boolean {
    if (!this._lastFailureTime) {
      return true;
    }
    return Date.now() - this._lastFailureTime >= this.resetTimeout;
  }

  /**
   * 获取距离可以重试的剩余时间
   */
  private getTimeUntilRetry(): number {
    if (!this._lastFailureTime || this._state !== CircuitState.OPEN) {
      return 0;
    }
    const elapsed = Date.now() - this._lastFailureTime;
    return Math.max(0, this.resetTimeout - elapsed);
  }

  /**
   * 检查是否为超时错误
   */
  private isTimeoutError(error: Error): boolean {
    return error instanceof TimeoutError;
  }

  /**
   * 发送事件
   */
  private emitEvent(event: CircuitEvent, data: any = {}): void {
    this.onEvent?.(event, { ...data, circuit: this.name, timestamp: Date.now() });
  }

  /**
   * 清理定时器
   */
  private clearTimers(): void {
    if (this._stateTransitionTimer) {
      clearTimeout(this._stateTransitionTimer);
      this._stateTransitionTimer = null;
    }
  }
}
