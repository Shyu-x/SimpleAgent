/**
 * Resilience Module - 弹性/resilience模块导出
 * 包含熔断器相关的类和函数
 */
export {
  CircuitState,
  CircuitEvent,
  CircuitOpenError,
} from './circuit-state.enum';

export {
  CircuitBreaker,
  CircuitOptions,
  CircuitStats,
} from './circuit-breaker';

export {
  CircuitBreakerFactory,
  FactoryOptions,
  getGlobalCircuitBreakerFactory,
  resetGlobalCircuitBreakerFactory,
} from './circuit-breaker.factory';
