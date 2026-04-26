/**
 * Metrics Controller - Prometheus 指标端点
 */
import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from './metrics.service';

@Controller('api/metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  getMetrics() {
    return this.metricsService.getMetrics();
  }

  @Get('prometheus')
  getPrometheusMetrics(@Res() res: Response) {
    const metrics = this.metricsService.toPrometheusFormat();
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(metrics);
  }

  @Get('alerts')
  getAlerts() {
    return this.metricsService.getActiveAlerts();
  }
}
