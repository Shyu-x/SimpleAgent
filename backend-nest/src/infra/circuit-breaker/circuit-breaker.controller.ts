/**
 * Circuit Breaker Controller - 熔断器管理端点
 */
import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { CircuitBreakerService, CircuitOptions } from './circuit-breaker.service';
import { CircuitState } from './enum/circuit-state.enum';

@Controller('api/circuit-breaker')
export class CircuitBreakerController {
  constructor(private readonly circuitBreakerService: CircuitBreakerService) {}

  @Get('state/:key')
  getState(@Param('key') key: string) {
    return {
      key,
      state: this.circuitBreakerService.getState(key),
    };
  }

  @Get('stats/:key')
  getStats(@Param('key') key: string) {
    return this.circuitBreakerService.getStats(key);
  }

  @Post('reset/:key')
  reset(@Param('key') key: string) {
    this.circuitBreakerService.reset(key);
    return { success: true };
  }

  @Post('force-open/:key')
  forceOpen(@Param('key') key: string, @Body() body: { reason?: string }) {
    this.circuitBreakerService.forceOpen(key, body.reason);
    return { success: true };
  }

  @Post('execute/:key')
  async execute(
    @Param('key') key: string,
    @Body() body: { fn: string; options?: CircuitOptions },
  ) {
    try {
      const result = await this.circuitBreakerService.execute(
        key,
        eval(`(${body.fn})`), // eslint-disable-line no-eval
        body.options,
      );
      return { success: true, result };
    } catch (error: any) {
      if (error.name === 'CircuitOpenError') {
        return { success: false, error: error.message, retryAfter: error.retryAfter };
      }
      throw error;
    }
  }
}
