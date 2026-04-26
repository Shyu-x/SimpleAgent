/**
 * 日志拦截器
 * 记录请求和响应的详细信息
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const traceId = (request.headers['x-trace-id'] || request.headers['x-request-id'] || uuidv4()) as string;
    const { method, url, ip } = request;
    const userAgent = request.headers['user-agent'] || '';
    const startTime = Date.now();

    // 设置响应 trace ID
    response.setHeader('X-Trace-Id', traceId);

    // 附加 trace ID 到请求对象
    (request as Request & { traceId?: string }).traceId = traceId;

    this.logger.log(`--> ${method} ${url} [${traceId}] - IP: ${ip} - UA: ${userAgent}`);

    const now = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - now;
          const { statusCode } = response;
          this.logger.log(`<-- ${method} ${url} ${statusCode} [${traceId}] - ${duration}ms`);
        },
        error: (error: Error) => {
          const duration = Date.now() - now;
          this.logger.error(`<-- ${method} ${url} ERROR [${traceId}] - ${duration}ms - ${error.message}`);
        },
      }),
    );
  }
}
