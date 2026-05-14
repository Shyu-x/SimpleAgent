/**
 * Resilience & Rate Limiter Module - 弹性/resilience与限流模块
 *
 * 提供企业级服务保护能力：
 * - CircuitBreaker：熔断器，防止雪崩
 * - RateLimiter：限流器，保护资源
 * - Interceptor：配合熔断器的响应处理
 *
 * 使用示例：
 * ```typescript
 * // 熔断器使用
 * import { CircuitBreaker, CircuitBreakerFactory } from './common/resilience';
 *
 * const factory = new CircuitBreakerFactory();
 * const breaker = factory.get('user-service');
 *
 * const result = await breaker.execute(
 *   () => userService.call(),
 *   () => fallback()
 * );
 *
 * // 限流器使用
 * import { RateLimiterService } from './common/rate-limiter';
 *
 * const limiter = new RateLimiterService({ maxRequests: 100 });
 * const result = await limiter.acquire({ ip: '192.168.1.1' });
 * if (!result.allowed) {
 *   return res.status(429).json({ retryAfter: result.retryAfterMs });
 * }
 * ```
 */

// 熔断器导出
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

// 限流器导出
export {
  RateLimitStrategy,
  RateLimiterConfig,
  AcquireResult,
  RequestContext,
  KeyGenerator,
} from './rate-limiter/types';

export {
  RateLimiterService,
  RateLimiterOptions,
} from './rate-limiter/service';

export {
  createRateLimiterMiddleware,
  rateLimiterMiddleware,
  strictRateLimiterMiddleware,
  relaxedRateLimiterMiddleware,
  RateLimiterMiddlewareOptions,
} from './rate-limiter/middleware';

export {
  ModuleRateLimitGuard,
  createRateLimitGuard,
  StrictRateLimitGuard,
  RelaxedRateLimitGuard,
  LoginRateLimitGuard,
  SearchRateLimitGuard,
} from './rate-limiter/guard';

// 拦截器导出
export {
  ResilienceInterceptor,
  ResilienceInterceptorOptions,
  createResilienceInterceptor,
} from './resilience/interceptor';
