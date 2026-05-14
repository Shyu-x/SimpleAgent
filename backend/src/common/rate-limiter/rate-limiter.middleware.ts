/**
 * Rate Limiter Middleware - 限流中间件
 * 用于 Express 路由的限流保护
 *
 * 使用示例：
 * ```typescript
 * import { rateLimiterMiddleware } from './rate-limiter.middleware';
 *
 * app.use('/api/', rateLimiterMiddleware({
 *   maxRequests: 100,
 *   windowMs: 60000,
 * }));
 * ```
 */
import { Request, Response, NextFunction } from 'express';
import { RateLimiterService, RateLimiterOptions } from './rate-limiter.service';
import { RequestContext } from './rate-limiter.types';

/**
 * 限流中间件选项
 */
export interface RateLimiterMiddlewareOptions extends RateLimiterOptions {
  /** 自定义 key 生成函数 */
  keyGenerator?: (req: Request) => string;
  /** 超出限流时的处理函数 */
  onLimitReached?: (req: Request, res: Response, retryAfter: number) => void;
  /** 限流范围的来源（从请求中提取） */
  scopeKey?: (req: Request) => string;
}

/**
 * 从 Express Request 创建 RequestContext
 */
function createContext(req: Request): RequestContext {
  return {
    ip: req.ip || req.socket.remoteAddress,
    path: req.path,
    method: req.method,
    identifier: req.headers['x-user-id'] as string,
    headers: req.headers as Record<string, string>,
  };
}

/**
 * 创建限流中间件
 */
export function createRateLimiterMiddleware(options: RateLimiterMiddlewareOptions = {}) {
  const limiter = new RateLimiterService(options);

  return async (req: Request, res: Response, next: NextFunction) => {
    // 获取自定义 key（如果配置了）
    const context = createContext(req);

    if (options.keyGenerator) {
      context.identifier = options.keyGenerator(req);
    }

    // 获取 scope
    const scope = options.scopeKey?.(req);

    // 检查限流
    const result = await limiter.acquire(context, scope);

    // 设置标准限流响应头
    res.setHeader('X-RateLimit-Limit', result.total);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + result.retryAfterMs) / 1000));

    if (!result.allowed) {
      // 设置 429 响应头
      res.setHeader('Retry-After', Math.ceil(result.retryAfterMs / 1000));

      // 调用自定义处理或返回默认 429 响应
      if (options.onLimitReached) {
        options.onLimitReached(req, res, result.retryAfterMs);
      } else {
        res.status(429).json({
          error: 'Too Many Requests',
          message: '请求频率超限，请稍后重试',
          retryAfter: result.retryAfterMs,
          retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
        });
      }
      return;
    }

    next();
  };
}

/**
 * 默认限流中间件（全局，每分钟 100 请求）
 */
export const rateLimiterMiddleware = createRateLimiterMiddleware({
  maxRequests: 100,
  windowMs: 60000,
});

/**
 * 严格限流中间件（每分钟 20 请求）
 */
export const strictRateLimiterMiddleware = createRateLimiterMiddleware({
  maxRequests: 20,
  windowMs: 60000,
});

/**
 * 宽松限流中间件（每分钟 500 请求）
 */
export const relaxedRateLimiterMiddleware = createRateLimiterMiddleware({
  maxRequests: 500,
  windowMs: 60000,
});
