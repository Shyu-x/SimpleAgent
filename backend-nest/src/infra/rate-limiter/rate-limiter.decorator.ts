/**
 * Rate Limiter Decorator - 限流器装饰器
 */
import { RateLimiterService, RateLimiterConfig } from './rate-limiter.service';

export function RateLimiter(config: RateLimiterConfig & { identifier?: string }) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const rateLimiter = this.rateLimiterService as RateLimiterService;
      const identifier = config.identifier || `${target.constructor.name}.${propertyKey}`;

      const result = await rateLimiter.acquire(identifier);

      if (!result.allowed) {
        throw new Error(`Rate limit exceeded. Retry after ${result.retryAfterMs}ms`);
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
