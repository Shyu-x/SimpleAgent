/**
 * Rate Limiter Controller - 限流管理端点
 */
import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { RateLimiterService, RateLimiterConfig } from './rate-limiter.service';

@Controller('api/rate-limiter')
export class RateLimiterController {
  constructor(private readonly rateLimiterService: RateLimiterService) {}

  @Post('acquire/:identifier')
  async acquire(
    @Param('identifier') identifier: string,
    @Query('scope') scope?: string,
  ) {
    return this.rateLimiterService.acquire(identifier, scope);
  }

  @Get('status/:identifier')
  async getStatus(
    @Param('identifier') identifier: string,
    @Query('scope') scope?: string,
  ) {
    return this.rateLimiterService.getStatus(identifier, scope);
  }

  @Delete('reset/:identifier')
  async reset(
    @Param('identifier') identifier: string,
    @Query('scope') scope?: string,
  ) {
    await this.rateLimiterService.reset(identifier, scope);
    return { success: true };
  }

  @Post('enqueue/:identifier')
  async enqueue(
    @Param('identifier') identifier: string,
    @Query('scope') scope?: string,
  ) {
    return this.rateLimiterService.enqueue(identifier, scope);
  }
}
