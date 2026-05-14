/**
 * Common - 公共基础设施
 * =======================
 *
 * 包含所有模块共用的装饰器、过滤器、拦截器
 *
 * 目录结构：
 * common/
 * ├── decorators/     # 自定义装饰器
 * │   ├── current-user.decorator.ts
 * │   ├── rate-limit.decorator.ts
 * │   └── module-feature.decorator.ts
 * ├── filters/        # 异常过滤器
 * │   └── http-exception.filter.ts
 * └── interceptors/   # 拦截器
 *     ├── logging.interceptor.ts
 *     └── transform.interceptor.ts
 */

// ========== 1. 装饰器 (Decorators) ==========

/**
 * 获取当前登录用户
 * 用法：@CurrentUser() user: UserEntity
 */
export function CurrentUser() {
  // 实现从请求上下文获取当前用户
}

/**
 * 限制请求速率
 * 用法：@RateLimit(100, 60000)
 */
export function RateLimit(maxRequests: number, windowMs: number) {
  // 实现限流装饰器
}

/**
 * 模块特性开关
 * 用法：@ModuleFeature('payment', 'refund')
 */
export function ModuleFeature(module: string, feature: string) {
  // 实现特性开关装饰器
}

/**
 * 模块间 RPC 调用
 * 用法：@RpcCall('module-order', 'OrderService', 'findOne')
 */
export function RpcCall(module: string, service: string, method: string) {
  // 实现 RPC 调用装饰器
}

// ========== 2. 异常过滤器 (Filters) ==========

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * HTTP 异常过滤器
 *
 * 统一处理所有异常，返回标准格式的响应
 *
 * 响应格式：
 * {
 *   statusCode: number,
 *   message: string,
 *   error: string,
 *   timestamp: string,
 *   path: string,
 *   traceId?: string
 * }
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let error: string;

    if (exception instanceof HttpException) {
      // HTTP 异常
      status = exception.getStatus();
      const responseBody = exception.getResponse() as any;
      message = responseBody.message || exception.message;
      error = responseBody.error || 'HTTP Error';
    } else if (exception instanceof Error) {
      // 通用错误
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = exception.message;
      error = 'Internal Server Error';

      // 记录错误堆栈
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    } else {
      // 未知错误
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unknown error occurred';
      error = 'Unknown Error';
    }

    const errorResponse = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      traceId: request.headers['x-trace-id'],
    };

    response.status(status).json(errorResponse);
  }
}

// ========== 3. 拦截器 (Interceptors) ==========

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * 日志拦截器
 *
 * 记录每个请求的：
 * - 请求路径和方法
 * - 请求参数
 * - 响应状态
 * - 响应时间
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body } = request;
    const now = Date.now();

    this.logger.log(`[请求] ${method} ${url}`);
    if (body && Object.keys(body).length > 0) {
      this.logger.debug(`[请求体] ${JSON.stringify(body)}`);
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const responseTime = Date.now() - now;
          this.logger.log(`[响应] ${method} ${url} - ${responseTime}ms`);
        },
        error: (error) => {
          const responseTime = Date.now() - now;
          this.logger.error(`[错误] ${method} ${url} - ${responseTime}ms - ${error.message}`);
        },
      }),
    );
  }
}

/**
 * 响应转换拦截器
 *
 * 统一响应格式：
 * {
 *   success: boolean,
 *   data: any,
 *   timestamp: string,
 *   traceId?: string
 * }
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap((data) => {
        // 如果响应已经是标准格式，则不处理
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        // 返回统一格式的响应
        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
          traceId: request.headers['x-trace-id'],
        };
      }),
    );
  }
}

// ========== 公共导出 ==========

export { GlobalExceptionFilter } from './filters/http-exception.filter';
export { LoggingInterceptor, TransformInterceptor } from './interceptors';