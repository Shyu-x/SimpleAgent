import { Injectable } from '@nestjs/common';

/**
 * 健康状态枚举
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

/**
 * 健康检查器服务
 * 用于检查模型服务的健康状态
 */
@Injectable()
export class HealthCheckerService {
  private checkers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * 创建健康检查器
   */
  createHealthChecker(
    name: string,
    healthCheckFn: () => Promise<boolean>,
    options: {
      interval?: number;
      onStatusChange?: (from: HealthStatus, to: HealthStatus) => void;
    } = {},
  ): { start: () => void; stop: () => void; getStatus: () => HealthStatus } {
    const interval = options.interval || 60000;
    let currentStatus = HealthStatus.UNKNOWN;

    const check = async () => {
      try {
        const isHealthy = await healthCheckFn();
        const newStatus = isHealthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY;

        if (newStatus !== currentStatus) {
          const oldStatus = currentStatus;
          currentStatus = newStatus;
          options.onStatusChange?.(oldStatus, newStatus);
        }
      } catch {
        if (currentStatus !== HealthStatus.UNHEALTHY) {
          currentStatus = HealthStatus.UNHEALTHY;
          options.onStatusChange?.(currentStatus, HealthStatus.UNHEALTHY);
        }
      }
    };

    return {
      start: () => {
        check();
        const timer = setInterval(check, interval);
        this.checkers.set(name, timer);
      },
      stop: () => {
        const timer = this.checkers.get(name);
        if (timer) {
          clearInterval(timer);
          this.checkers.delete(name);
        }
      },
      getStatus: () => currentStatus,
    };
  }

  /**
   * 停止所有健康检查
   */
  stopAll(): void {
    for (const [name, timer] of this.checkers.entries()) {
      clearInterval(timer);
      this.checkers.delete(name);
    }
  }
}
