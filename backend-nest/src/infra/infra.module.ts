import { Module } from '@nestjs/common';
import { MetricsModule } from './metrics/metrics.module';
import { AlertModule } from './alert/alert.module';
import { ConfigModule } from './config/config.module';
import { QueueModule } from './queue/queue.module';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';
import { RateLimiterModule } from './rate-limiter/rate-limiter.module';

@Module({
  imports: [
    MetricsModule,
    AlertModule,
    ConfigModule,
    QueueModule,
    CircuitBreakerModule,
    RateLimiterModule,
  ],
  exports: [
    MetricsModule,
    AlertModule,
    ConfigModule,
    QueueModule,
    CircuitBreakerModule,
    RateLimiterModule,
  ],
})
export class InfraModule {}
