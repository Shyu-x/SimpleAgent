import { Module, Global } from '@nestjs/common';
import { RateLimiterService } from './rate-limiter.service';
import { RateLimiterController } from './rate-limiter.controller';

@Global()
@Module({
  providers: [
    {
      provide: RateLimiterService,
      useFactory: (): RateLimiterService => new RateLimiterService(),
    },
  ],
  controllers: [RateLimiterController],
  exports: [RateLimiterService],
})
export class RateLimiterModule {}
