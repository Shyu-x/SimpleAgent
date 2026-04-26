/**
 * Circuit Breaker Service - 企业级熔断器服务
 * @description 实现三态熔断器（CLOSED/OPEN/HALF_OPEN），用于保护服务调用链
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { CircuitState } from './enum/circuit-state.enum';
import { CircuitEvent } from './enum/circuit-event.enum';

export interface CircuitOptions {
  name?: string;
  failureThreshold?: number;
  successThreshold?: number;
  resetTimeout?: number;
  halfOpenProbeTimeout?: number;
  onStateChange?: (fromState: CircuitState, toState: CircuitState, reason?: string) => void;
  onEvent?: (event: CircuitEvent, data: any) => void;
}

export interface CircuitStats {
  name: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalSuccesses: number;
  totalFailures: number;
  totalProbes: number;
  totalStateChanges: number;
  lastFailureTime: number | null;
  uptime: number;
}

export class CircuitOpenError extends Error {
  constructor(
    public circuitName: string,
    public state: CircuitState,
    public retryAfter: number,
  ) {
    super(`Circuit '${circuitName}' is ${state}`);
    this.name = 'CircuitOpenError';
  }
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

@Injectable()
export class CircuitBreakerService implements OnModuleDestroy {
  private circuits = new Map<string, {
    name: string;
    failureThreshold: number;
    successThreshold: number;
    resetTimeout: number;
    halfOpenProbeTimeout: number;
    onStateChange: (fromState: CircuitState, toState: CircuitState, reason?: string) => void;
    onEvent: (event: CircuitEvent, data: any) => void;
    _state: CircuitState;
    _failureCount: number;
    _successCount: number;
    _lastFailureTime: number | null;
    _lastStateChangeTime: number;
    _probeRequestId: number;
    _totalSuccesses: number;
    _totalFailures: number;
    _totalProbes: number;
    _totalStateChanges: number;
    _probeQueue: any[];
    _stateTransitionTimer: NodeJS.Timeout | null;
  }>();

  onModuleDestroy() {
    for (const circuit of this.circuits.values()) {
      if (circuit._stateTransitionTimer) {
        clearTimeout(circuit._stateTransitionTimer);
      }
    }
    this.circuits.clear();
  }

  private getOrCreate(options: CircuitOptions) {
    const name = options.name || 'default';

    if (!this.circuits.has(name)) {
      this.circuits.set(name, {
        name,
        failureThreshold: options.failureThreshold ?? 5,
        successThreshold: options.successThreshold ?? 3,
        resetTimeout: options.resetTimeout ?? 60000,
        halfOpenProbeTimeout: options.halfOpenProbeTimeout ?? 10000,
        onStateChange: options.onStateChange || (() => {}),
        onEvent: options.onEvent || (() => {}),
        _state: CircuitState.CLOSED,
        _failureCount: 0,
        _successCount: 0,
        _lastFailureTime: null,
        _lastStateChangeTime: Date.now(),
        _probeRequestId: 0,
        _totalSuccesses: 0,
        _totalFailures: 0,
        _totalProbes: 0,
        _totalStateChanges: 0,
        _probeQueue: [],
        _stateTransitionTimer: null,
      });
    }

    return this.circuits.get(name)!;
  }

  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    options?: CircuitOptions,
    fallback?: () => Promise<T>,
  ): Promise<T> {
    const circuit = this.getOrCreate(options || { name: key });

    if (!this.canExecute(circuit)) {
      this.emitEvent(circuit, CircuitEvent.FAILURE, { reason: 'circuit_open', state: circuit._state });

      if (fallback) {
        return fallback();
      }

      throw new CircuitOpenError(circuit.name, circuit._state, this.getTimeUntilRetry(circuit));
    }

    const isProbe = circuit._state === CircuitState.HALF_OPEN;
    const probeId = isProbe ? ++circuit._probeRequestId : null;

    try {
      const result = await this.executeWithTimeout(circuit, fn);
      this.onSuccess(circuit, isProbe, probeId);
      return result;
    } catch (error) {
      this.onFailure(circuit, error as Error, isProbe, probeId);

      if (fallback && !this.isTimeoutError(error as Error)) {
        return fallback();
      }

      throw error;
    }
  }

  private canExecute(circuit: any): boolean {
    switch (circuit._state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        if (this.shouldTransitionToHalfOpen(circuit)) {
          this.transitionTo(circuit, CircuitState.HALF_OPEN);
          return true;
        }
        return false;

      case CircuitState.HALF_OPEN:
        return circuit._probeQueue.length === 0;

      default:
        return true;
    }
  }

  getState(key: string): CircuitState {
    const circuit = this.circuits.get(key);
    return circuit ? circuit._state : CircuitState.CLOSED;
  }

  getStats(key: string): CircuitStats | null {
    const circuit = this.circuits.get(key);
    if (!circuit) return null;

    return {
      name: circuit.name,
      state: circuit._state,
      failureCount: circuit._failureCount,
      successCount: circuit._successCount,
      totalSuccesses: circuit._totalSuccesses,
      totalFailures: circuit._totalFailures,
      totalProbes: circuit._totalProbes,
      totalStateChanges: circuit._totalStateChanges,
      lastFailureTime: circuit._lastFailureTime,
      uptime: Date.now() - circuit._lastStateChangeTime,
    };
  }

  reset(key: string): void {
    const circuit = this.circuits.get(key);
    if (!circuit) return;

    this.clearTimers(circuit);
    circuit._failureCount = 0;
    circuit._successCount = 0;
    circuit._lastFailureTime = null;
    circuit._probeQueue = [];
    this.transitionTo(circuit, CircuitState.CLOSED);
  }

  forceOpen(key: string, reason = 'manual'): void {
    const circuit = this.circuits.get(key);
    if (!circuit) return;

    this.clearTimers(circuit);
    this.transitionTo(circuit, CircuitState.OPEN, reason);
  }

  private executeWithTimeout(circuit: any, operation: () => Promise<any>): Promise<any> {
    const timeout = circuit._state === CircuitState.HALF_OPEN ? circuit.halfOpenProbeTimeout : 0;

    if (!timeout) {
      return operation();
    }

    return this.timeoutPromise(operation(), timeout);
  }

  private timeoutPromise<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError(`Operation timed out after ${ms}ms`));
      }, ms);

      promise.then(resolve).catch(reject).finally(() => clearTimeout(timer));
    });
  }

  private onSuccess(circuit: any, isProbe: boolean, probeId: number | null): void {
    circuit._totalSuccesses++;

    if (isProbe) {
      circuit._successCount++;
      this.emitEvent(circuit, CircuitEvent.PROBE_SUCCESS, { probeId });

      if (circuit._successCount >= circuit.successThreshold) {
        this.transitionTo(circuit, CircuitState.CLOSED);
      }
    } else {
      circuit._failureCount = 0;
      this.emitEvent(circuit, CircuitEvent.SUCCESS);
    }
  }

  private onFailure(circuit: any, error: Error, isProbe: boolean, probeId: number | null): void {
    circuit._totalFailures++;
    circuit._lastFailureTime = Date.now();

    if (isProbe) {
      this.emitEvent(circuit, CircuitEvent.PROBE_FAILURE, { probeId, error: error.message });
      this.transitionTo(circuit, CircuitState.OPEN, `probe_failed: ${error.message}`);
    } else {
      circuit._failureCount++;
      this.emitEvent(circuit, CircuitEvent.FAILURE, {
        failureCount: circuit._failureCount,
        threshold: circuit.failureThreshold,
        error: error.message,
      });

      if (circuit._failureCount >= circuit.failureThreshold) {
        this.transitionTo(circuit, CircuitState.OPEN, `threshold_exceeded: ${circuit._failureCount} failures`);
      }
    }
  }

  private transitionTo(circuit: any, newState: CircuitState, reason?: string): void {
    if (circuit._state === newState) {
      return;
    }

    const oldState = circuit._state;
    circuit._lastStateChangeTime = Date.now();
    circuit._state = newState;

    if (newState === CircuitState.CLOSED) {
      circuit._failureCount = 0;
      circuit._successCount = 0;
      circuit._probeQueue = [];
    } else if (newState === CircuitState.HALF_OPEN) {
      circuit._successCount = 0;
    }

    this.clearTimers(circuit);

    if (newState === CircuitState.OPEN) {
      circuit._stateTransitionTimer = setTimeout(() => {
        if (circuit._state === CircuitState.OPEN) {
          this.transitionTo(circuit, CircuitState.HALF_OPEN, 'timeout_expired');
        }
      }, circuit.resetTimeout);
    }

    circuit._totalStateChanges++;

    circuit.onStateChange(oldState, newState, reason);
    this.emitEvent(circuit, this.getTransitionEvent(newState), { from: oldState, to: newState, reason });
  }

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

  private shouldTransitionToHalfOpen(circuit: any): boolean {
    if (!circuit._lastFailureTime) {
      return true;
    }
    return Date.now() - circuit._lastFailureTime >= circuit.resetTimeout;
  }

  private getTimeUntilRetry(circuit: any): number {
    if (!circuit._lastFailureTime || circuit._state !== CircuitState.OPEN) {
      return 0;
    }
    const elapsed = Date.now() - circuit._lastFailureTime;
    return Math.max(0, circuit.resetTimeout - elapsed);
  }

  private isTimeoutError(error: Error): boolean {
    return error instanceof TimeoutError;
  }

  private emitEvent(circuit: any, event: CircuitEvent, data: any = {}): void {
    circuit.onEvent(event, { ...data, circuit: circuit.name, timestamp: Date.now() });
  }

  private clearTimers(circuit: any): void {
    if (circuit._stateTransitionTimer) {
      clearTimeout(circuit._stateTransitionTimer);
      circuit._stateTransitionTimer = null;
    }
  }

  destroy(key?: string): void {
    if (key) {
      const circuit = this.circuits.get(key);
      if (circuit) {
        this.clearTimers(circuit);
        this.circuits.delete(key);
      }
    } else {
      for (const circuit of this.circuits.values()) {
        this.clearTimers(circuit);
      }
      this.circuits.clear();
    }
  }
}
