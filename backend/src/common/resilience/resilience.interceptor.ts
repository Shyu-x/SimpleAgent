/**
 * Resilience Interceptor - 熔断器响应拦截器
 * 用于配合熔断器处理服务调用的响应
 *
 * 功能：
 * - 包装服务调用，自动处理熔断器打开的情况
 * - 提供降级响应的统一处理
 * - 记录熔断器事件到日志
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CircuitBreaker, CircuitOpenError, CircuitState } from '../resilience';

/**
 * Resilience Interceptor Options - 拦截器配置
 */
export interface ResilienceInterceptorOptions {
  /** 熔断器实例 */
  circuitBreaker?: CircuitBreaker;
  /** 降级响应数据或函数 */
  fallbackData?: any;
  /** 降级响应函数 */
  fallbackFn?: (error: Error, context: ExecutionContext) => any;
  /** 是否记录熔断器事件 */
  logEvents?: boolean;
  /** 错误过滤器：返回 true 表示该错误应由熔断器处理 */
  errorFilter?: (error: Error) => boolean;
}

/**
 * ResilienceInterceptor - 弹性/resilience拦截器
 *
 * 使用示例：
 * ```typescript
 * @Injectable()
 * export class ChatService {
 *   @UseInterceptors(new ResilienceInterceptor({
 *     circuitBreaker: userServiceCircuitBreaker,
 *     fallbackData: { users: [], degraded: true },
 *   }))
 *   async getUsers() {
 *     return this.userService.fetchUsers();
 *   }
 * }
 * ```
 */
@Injectable()
export class ResilienceInterceptor implements NestInterceptor {
  private readonly logger = new Logger('ResilienceInterceptor');
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly fallbackData?: any;
  private readonly fallbackFn?: (error: Error, context: ExecutionContext) => any;
  private readonly logEvents: boolean;
  private readonly errorFilter?: (error: Error) => boolean;

  constructor(options: ResilienceInterceptorOptions = {}) {
    this.circuitBreaker = options.circuitBreaker;
    this.fallbackData = options.fallbackData;
    this.fallbackFn = options.fallbackFn;
    this.logEvents = options.logEvents ?? true;
    this.errorFilter = options.errorFilter;

    // 注册熔断器事件监听
    if (this.circuitBreaker && this.logEvents) {
      this.setupEventLogging();
    }
  }

  /**
   * 设置熔断器事件日志
   */
  private setupEventLogging(): void {
    // 状态变化日志
    this.circuitBreaker!.onStateChange = (from: CircuitState, to: CircuitState, reason?: string) => {
      this.logger.warn(
        `Circuit '${this.circuitBreaker!.name}' state changed: ${from} -> ${to}${reason ? ` (${reason})` : ''}`,
      );
    };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // 如果没有配置熔断器，直接执行
    if (!this.circuitBreaker) {
      return next.handle().pipe(
        catchError((error) => this.handleError(error, context)),
      );
    }

    // 使用熔断器执行
    const handler = async () => {
      const response = context.switchToHttp().getResponse();
      const result = await this.circuitBreaker!.execute(
        () => this.executeHandler(next),
        () => this.executeFallback(context),
      );

      // 设置熔断器状态响应头
      response.setHeader('X-Circuit-State', this.circuitBreaker!.state);

      return result;
    };

    return handler().pipe(
      catchError((error) => {
        // CircuitOpenError 由熔断器抛出，需要特殊处理
        if (error instanceof CircuitOpenError) {
          return this.handleCircuitOpenError(error, context);
        }
        return this.handleError(error, context);
      }),
    );
  }

  /**
   * 执行原处理器
   */
  private async executeHandler(next: CallHandler): Promise<any> {
    const result = next.handle();
    // 处理 Observable
    if (result.toPromise) {
      return result.toPromise();
    }
    return result;
  }

  /**
   * 执行降级逻辑
   */
  private async executeFallback(context: ExecutionContext): Promise<any> {
    const response = context.switchToHttp().getResponse();

    if (this.fallbackFn) {
      const result = this.fallbackFn(new Error('Circuit breaker fallback'), context);
      response.setHeader('X-Fallback', 'true');
      return result;
    }

    if (this.fallbackData !== undefined) {
      response.setHeader('X-Fallback', 'true');
      return this.fallbackData;
    }

    throw new HttpException(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Service temporarily unavailable',
        error: '降级服务：下游服务暂时不可用',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  /**
   * 处理熔断器打开错误
   */
  private handleCircuitOpenError(error: CircuitOpenError, context: ExecutionContext): Observable<any> {
    const response = context.switchToHttp().getResponse();

    response.setHeader('X-Circuit-State', CircuitState.OPEN);
    response.setHeader('Retry-After', Math.ceil(error.retryAfter / 1000));

    if (this.logEvents) {
      this.logger.warn(
        `Circuit '${error.circuitName}' is OPEN, retry after ${error.retryAfter}ms`,
      );
    }

    return throwError(() =>
      new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Service temporarily unavailable',
          error: `熔断器打开，请 ${Math.ceil(error.retryAfter / 1000)} 秒后重试`,
          retryAfter: error.retryAfter,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      ),
    );
  }

  /**
   * 处理一般错误
   */
  private handleError(error: Error, context: ExecutionContext): Observable<any> {
    // 如果配置了错误过滤器，检查是否应该继续处理
    if (this.errorFilter && !this.errorFilter(error)) {
      return throwError(() => error);
    }

    if (this.logEvents) {
      this.logger.error(`Request error: ${error.message}`, error.stack);
    }

    return throwError(() => error);
  }
}

/**
 * 创建工厂函数生成带配置的拦截器
 */
export function createResilienceInterceptor(options: ResilienceInterceptorOptions) {
  return new ResilienceInterceptor(options);
}
