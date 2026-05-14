/**
 * Rate Limiter Module - 限流模块导出
 * 导出限流相关的类和函数
 */
export {
  RateLimitStrategy,
  RateLimiterConfig,
  AcquireResult,
  RequestContext,
  KeyGenerator,
} from './rate-limiter.types';

export {
  RateLimiterService,
  RateLimiterOptions,
} from './rate-limiter.service';

export {
  createRateLimiterMiddleware,
  rateLimiterMiddleware,
  strictRateLimiterMiddleware,
  relaxedRateLimiterMiddleware,
  RateLimiterMiddlewareOptions,
} from './rate-limiter.middleware';

export {
  ModuleRateLimitGuard,
  createRateLimitGuard,
  StrictRateLimitGuard,
  RelaxedRateLimitGuard,
  LoginRateLimitGuard,
  SearchRateLimitGuard,
} from './rate-limiter.guard';
