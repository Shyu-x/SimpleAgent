/**
 * Module Rate Limit Guard - NestJS 限流守卫
 * 实现 CanActivate 接口，用于路由守卫
 *
 * 使用示例：
 * ```typescript
 * @Injectable()
 * @UseGuards(new ModuleRateLimitGuard({ maxRequests: 100 }))
 * export class ChatController {}
 * ```
 */
import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { RateLimiterService, RateLimiterOptions } from './rate-limiter.service';
import { RateLimitStrategy } from './rate-limiter.types';

/**
 * ModuleRateLimitGuard - 模块级限流守卫
 *
 * 功能：
 * - 基于 IP 地址进行限流
 * - 支持配置限流参数
 * - 返回标准的 429 Too Many Requests 响应
 */
@Injectable()
export class ModuleRateLimitGuard implements CanActivate {
  private readonly limiter: RateLimiterService;

  constructor(options: RateLimiterOptions = {}) {
    // 设置默认 keyGenerator 使用 IP
    this.limiter = new RateLimiterService({
      strategy: RateLimitStrategy.SLIDING_WINDOW,
      maxRequests: 100,
      windowMs: 60000,
      keyPrefix: 'nest-module:',
      ...options,
    });
  }

  /**
   * 实现 CanActivate 接口
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // 从请求中提取 IP
    const ip = request.ip || (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || request.socket.remoteAddress
      || 'anonymous';

    const context_ = {
      ip,
      path: request.path,
      method: request.method,
      headers: request.headers as Record<string, string>,
    };

    const result = await this.limiter.acquire(context_);

    // 将限流信息附加到响应对象
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', result.total);
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + result.retryAfterMs) / 1000));

    if (!result.allowed) {
      response.setHeader('Retry-After', Math.ceil(result.retryAfterMs / 1000));

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too Many Requests',
          error: '请求频率超限，请稍后重试',
          retryAfter: result.retryAfterMs,
          retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}

/**
 * 创建工厂函数生成带配置的限流守卫
 */
export function createRateLimitGuard(options: RateLimiterOptions) {
  return new ModuleRateLimitGuard(options);
}

/**
 * 预设：严格限流守卫（每分钟 20 请求）
 */
@Injectable()
export class StrictRateLimitGuard extends ModuleRateLimitGuard {
  constructor() {
    super({
      maxRequests: 20,
      windowMs: 60000,
    });
  }
}

/**
 * 预设：宽松限流守卫（每分钟 500 请求）
 */
@Injectable()
export class RelaxedRateLimitGuard extends ModuleRateLimitGuard {
  constructor() {
    super({
      maxRequests: 500,
      windowMs: 60000,
    });
  }
}

/**
 * 预设：登录限流守卫（每分钟 10 请求）
 */
@Injectable()
export class LoginRateLimitGuard extends ModuleRateLimitGuard {
  constructor() {
    super({
      maxRequests: 10,
      windowMs: 60000,
    });
  }
}

/**
 * 预设：搜索限流守卫（每分钟 60 请求）
 */
@Injectable()
export class SearchRateLimitGuard extends ModuleRateLimitGuard {
  constructor() {
    super({
      maxRequests: 60,
      windowMs: 60000,
    });
  }
}
