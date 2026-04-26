/**
 * Queue Controller - 队列管理端点
 */
import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { QueueService, Priority } from './queue.service';

@Controller('api/queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get('stats')
  getStats() {
    return this.queueService.getStats();
  }

  @Get('status/:id')
  getStatus(@Param('id') id: string) {
    return this.queueService.getStatus(id);
  }

  @Post('enqueue')
  enqueue(@Body() body: { request: any; priority?: Priority; timeout?: number; maxRetries?: number }) {
    const id = this.queueService.enqueue(body.request, {
      priority: body.priority,
      timeout: body.timeout,
      maxRetries: body.maxRetries,
    });
    return { id };
  }

  @Delete('cancel/:id')
  cancel(@Param('id') id: string) {
    return this.queueService.cancel(id);
  }

  @Delete('clear/:priority?')
  clear(@Param('priority') priority?: string) {
    const priorityMap: Record<string, Priority> = {
      critical: Priority.CRITICAL,
      high: Priority.HIGH,
      normal: Priority.NORMAL,
      low: Priority.LOW,
      background: Priority.BACKGROUND,
    };
    return this.queueService.clear(priority ? priorityMap[priority] : undefined);
  }

  @Get('peek')
  peek() {
    return this.queueService.peek();
  }

  @Get('size/:priority?')
  size(@Param('priority') priority?: string) {
    const priorityMap: Record<string, Priority> = {
      critical: Priority.CRITICAL,
      high: Priority.HIGH,
      normal: Priority.NORMAL,
      low: Priority.LOW,
      background: Priority.BACKGROUND,
    };
    return this.queueService.size(priority ? priorityMap[priority] : undefined);
  }
}
