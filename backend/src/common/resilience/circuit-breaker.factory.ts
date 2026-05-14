/**
 * Circuit Breaker Factory - 熔断器工厂
 * 使用工厂模式创建和管理服务级熔断器实例
 *
 * 设计理念：
 * - 每个下游服务模块对应一个熔断器实例
 * - 支持按名称获取已存在的熔断器
 * - 支持配置全局默认值和单例熔断器
 */
import { CircuitBreaker, CircuitOptions, CircuitStats } from './circuit-breaker';
import { CircuitState } from './circuit-state.enum';

export interface FactoryOptions {
  /** 默认失败阈值 */
  failureThreshold?: number;
  /** 默认成功阈值 */
  successThreshold?: number;
  /** 默认重置超时（毫秒） */
  resetTimeout?: number;
  /** 默认半开探测超时（毫秒） */
  halfOpenProbeTimeout?: number;
}

/**
 * CircuitBreakerFactory - 熔断器工厂类
 *
 * 使用示例：
 * ```typescript
 * const factory = new CircuitBreakerFactory();
 *
 * // 为不同服务创建熔断器
 * const userServiceBreaker = factory.get('user-service');
 * const orderServiceBreaker = factory.get('order-service', { failureThreshold: 10 });
 *
 * // 使用熔断器保护服务调用
 * const result = await userServiceBreaker.execute(
 *   () => userService.fetchUser(id),
 *   () => userService.getCachedUser(id)
 * );
 * ```
 */
export class CircuitBreakerFactory {
  private circuits = new Map<string, CircuitBreaker>();
  private defaultOptions: Required<FactoryOptions>;

  constructor(options: FactoryOptions = {}) {
    this.defaultOptions = {
      failureThreshold: options.failureThreshold ?? 5,
      successThreshold: options.successThreshold ?? 3,
      resetTimeout: options.resetTimeout ?? 60000,
      halfOpenProbeTimeout: options.halfOpenProbeTimeout ?? 10000,
    };
  }

  /**
   * 获取或创建熔断器实例
   * @param name 熔断器名称（通常对应下游服务名）
   * @param options 熔断器配置（可选，会与全局默认配置合并）
   * @returns 熔断器实例
   */
  get(name: string, options?: CircuitOptions): CircuitBreaker {
    if (!this.circuits.has(name)) {
      const circuitOptions: CircuitOptions = {
        name,
        failureThreshold: options?.failureThreshold ?? this.defaultOptions.failureThreshold,
        successThreshold: options?.successThreshold ?? this.defaultOptions.successThreshold,
        resetTimeout: options?.resetTimeout ?? this.defaultOptions.resetTimeout,
        halfOpenProbeTimeout: options?.halfOpenProbeTimeout ?? this.defaultOptions.halfOpenProbeTimeout,
        ...options,
      };

      const circuit = new CircuitBreaker(circuitOptions);
      this.circuits.set(name, circuit);
    }

    return this.circuits.get(name)!;
  }

  /**
   * 获取熔断器实例（如果不存在则创建）
   * @param name 熔断器名称
   * @param options 熔断器配置
   */
  getOrCreate(name: string, options?: CircuitOptions): CircuitBreaker {
    return this.get(name, options);
  }

  /**
   * 检查熔断器是否存在
   * @param name 熔断器名称
   */
  has(name: string): boolean {
    return this.circuits.has(name);
  }

  /**
   * 获取熔断器当前状态
   * @param name 熔断器名称
   */
  getState(name: string): CircuitState | null {
    const circuit = this.circuits.get(name);
    return circuit ? circuit.state : null;
  }

  /**
   * 获取熔断器统计信息
   * @param name 熔断器名称
   */
  getStats(name: string): CircuitStats | null {
    const circuit = this.circuits.get(name);
    return circuit ? circuit.getStats() : null;
  }

  /**
   * 获取所有熔断器的统计信息
   */
  getAllStats(): Map<string, CircuitStats> {
    const stats = new Map<string, CircuitStats>();
    for (const [name, circuit] of this.circuits.entries()) {
      stats.set(name, circuit.getStats());
    }
    return stats;
  }

  /**
   * 重置指定熔断器
   * @param name 熔断器名称
   */
  reset(name: string): void {
    const circuit = this.circuits.get(name);
    circuit?.reset();
  }

  /**
   * 重置所有熔断器
   */
  resetAll(): void {
    for (const circuit of this.circuits.values()) {
      circuit.reset();
    }
  }

  /**
   * 强制打开指定熔断器
   * @param name 熔断器名称
   * @param reason 打开原因
   */
  forceOpen(name: string, reason?: string): void {
    const circuit = this.circuits.get(name);
    circuit?.forceOpen(reason);
  }

  /**
   * 销毁指定熔断器
   * @param name 熔断器名称
   */
  destroy(name: string): void {
    const circuit = this.circuits.get(name);
    if (circuit) {
      circuit.destroy();
      this.circuits.delete(name);
    }
  }

  /**
   * 销毁所有熔断器
   */
  destroyAll(): void {
    for (const circuit of this.circuits.values()) {
      circuit.destroy();
    }
    this.circuits.clear();
  }

  /**
   * 获取所有熔断器名称列表
   */
  getNames(): string[] {
    return Array.from(this.circuits.keys());
  }

  /**
   * 获取熔断器数量
   */
  size(): number {
    return this.circuits.size;
  }
}

/**
 * 全局熔断器工厂单例
 * 用于整个应用范围内共享熔断器实例
 */
let globalFactory: CircuitBreakerFactory | null = null;

/**
 * 获取全局熔断器工厂实例
 */
export function getGlobalCircuitBreakerFactory(): CircuitBreakerFactory {
  if (!globalFactory) {
    globalFactory = new CircuitBreakerFactory();
  }
  return globalFactory;
}

/**
 * 重置全局熔断器工厂
 */
export function resetGlobalCircuitBreakerFactory(): void {
  if (globalFactory) {
    globalFactory.destroyAll();
    globalFactory = null;
  }
}
