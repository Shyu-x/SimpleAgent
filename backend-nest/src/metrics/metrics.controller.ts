import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@ApiBearerAuth()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @ApiOperation({ summary: '获取Prometheus格式的指标' })
  async getMetrics(@Res() res: Response) {
    res.set('Content-Type', 'text/plain');
    res.send(await this.metricsService.getPrometheusMetrics());
  }

  @Get('summary')
  @ApiOperation({ summary: '获取JSON格式的指标摘要' })
  async getSummary() {
    return this.metricsService.getSummaryMetrics();
  }

  @Get('realtime')
  @ApiOperation({ summary: '获取实时性能监控数据' })
  async getRealtime() {
    return this.metricsService.getRealtimeMetrics();
  }
}
