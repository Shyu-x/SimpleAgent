/**
 * Circuit Breaker Decorator - 熔断器装饰器
 */
import { CircuitBreakerService, CircuitOptions } from './circuit-breaker.service';

export function CircuitBreaker(options: CircuitOptions) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const circuitBreaker = options.name || `${target.constructor.name}.${propertyKey}`;
      const service = this.circuitBreakerService as CircuitBreakerService;

      return service.execute(
        circuitBreaker,
        () => originalMethod.apply(this, args),
        options,
      );
    };

    return descriptor;
  };
}
