/**
 * Alert Controller - 告警管理端点
 */
import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { AlertService, AlertLevel, AlertStatus } from './alert.service';

@Controller('api/alerts')
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get('rules')
  getRules() {
    return this.alertService.getRule();
  }

  @Post('rules')
  registerRule(@Body() rule: any) {
    return this.alertService.registerRule(rule);
  }

  @Delete('rules/:id')
  removeRule(@Param('id') id: string) {
    return this.alertService.removeRule(id);
  }

  @Get('active')
  getActiveAlerts(@Query() filter: { level?: AlertLevel; status?: AlertStatus; ruleId?: string }) {
    return this.alertService.getActiveAlerts(filter);
  }

  @Get('counts')
  getAlertCounts() {
    return this.alertService.getAlertCounts();
  }

  @Post(':id/acknowledge')
  acknowledgeAlert(@Param('id') id: string, @Body() body: { acknowledgedBy?: string }) {
    return this.alertService.acknowledgeAlert(id, body.acknowledgedBy);
  }

  @Post(':id/resolve')
  resolveAlert(@Param('id') id: string, @Body() body: { resolvedBy?: string; reason?: string }) {
    return this.alertService.resolveAlert(id, body.resolvedBy, body.reason);
  }

  @Get('history')
  getAlertHistory(@Query() query: { limit?: number; level?: AlertLevel; ruleId?: string; startTime?: string; endTime?: string }) {
    return this.alertService.getAlertHistory(query);
  }

  @Get('report')
  getReport(@Query('hours') hours?: number) {
    return this.alertService.generateReport(hours);
  }

  @Get('silences')
  getActiveSilences() {
    return this.alertService.getActiveSilences();
  }

  @Post('silences')
  addSilenceRule(@Body() rule: any) {
    return this.alertService.addSilenceRule(rule);
  }

  @Delete('silences/:id')
  removeSilenceRule(@Param('id') id: string) {
    return this.alertService.removeSilenceRule(id);
  }
}
