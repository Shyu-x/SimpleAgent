/**
 * Alert Service - 企业级告警管理服务
 * @description 支持多级别告警 (critical/warning/info)、规则注册、webhook 通知
 */
import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import * as url from 'url';

export enum AlertLevel {
  CRITICAL = 'critical',
  WARNING = 'warning',
  INFO = 'info',
}

export enum AlertStatus {
  FIRING = 'firing',
  RESOLVED = 'resolved',
  ACKNOWLEDGED = 'acknowledged',
  SUPPRESSED = 'suppressed',
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  level: AlertLevel;
  source: 'metrics' | 'custom';
  metric?: string;
  labels?: Record<string, string>;
  condition: '>' | '<' | '>=' | '<=' | '==';
  threshold: number;
  duration?: number;
  cooldown?: number;
  metadata?: Record<string, any>;
  check?: (metrics: any) => boolean;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  description: string;
  level: AlertLevel;
  source: string;
  metric?: string;
  labels?: Record<string, string>;
  value: number;
  threshold: number;
  condition: string;
  duration?: number;
  metadata?: Record<string, any>;
  status: AlertStatus;
  firedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface Webhooks {
  critical?: string;
  warning?: string;
  info?: string;
  all?: string;
}

@Injectable()
export class AlertService implements OnModuleInit, OnModuleDestroy {
  private readonly RETENTION_DAYS = 30;
  private readonly webhooks: Webhooks;
  private readonly onAlertCallback: (alert: Alert) => void;
  private readonly onResolveCallback: (alert: Alert) => void;

  // 内部存储
  private readonly _rules = new Map<string, AlertRule>();
  private readonly _alerts = new Map<string, Alert>();
  private readonly _alertHistory: Alert[] = [];
  private readonly _silenceRules = new Map<string, any>();

  // 健康检查定时器
  private _healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(options: {
    webhooks?: Webhooks;
    onAlert?: (alert: Alert) => void;
    onResolve?: (alert: Alert) => void;
  } = {}) {
    this.webhooks = options.webhooks || {};
    this.onAlertCallback = options.onAlert || (() => {});
    this.onResolveCallback = options.onResolve || (() => {});
  }

  async onModuleInit() {
    this.startHealthCheck();
  }

  async onModuleDestroy() {
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = null;
    }
  }

  // ==================== 规则管理 ====================

  registerRule(rule: AlertRule): boolean {
    if (!rule.id || !rule.name || !rule.level || !rule.source) {
      console.error('[AlertService] 规则注册失败：缺少必需字段', rule);
      return false;
    }

    if (!Object.values(AlertLevel).includes(rule.level)) {
      console.error('[AlertService] 规则注册失败：无效的告警级别', rule.level);
      return false;
    }

    const fullRule = {
      enabled: true,
      duration: 0,
      cooldown: 300000,
      labels: {} as Record<string, string>,
      metadata: {} as Record<string, any>,
      ...rule,
    } as AlertRule & { enabled: boolean };

    this._rules.set(rule.id, fullRule);
    console.log(`[AlertService] 规则注册成功: ${rule.id} (${rule.level})`);
    return true;
  }

  registerRules(rules: AlertRule[]): { success: number; failed: number } {
    const result = { success: 0, failed: 0 };
    for (const rule of rules) {
      if (this.registerRule(rule)) {
        result.success++;
      } else {
        result.failed++;
      }
    }
    return result;
  }

  removeRule(ruleId: string): boolean {
    const deleted = this._rules.delete(ruleId);
    if (deleted) {
      console.log(`[AlertService] 规则已移除: ${ruleId}`);
    }
    return deleted;
  }

  getRule(ruleId?: string): AlertRule | AlertRule[] | undefined {
    if (ruleId) {
      return this._rules.get(ruleId);
    }
    return Array.from(this._rules.values());
  }

  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this._rules.get(ruleId);
    if (!rule) return false;
    (rule as any).enabled = enabled;
    console.log(`[AlertService] 规则${enabled ? '启用' : '禁用'}: ${ruleId}`);
    return true;
  }

  // ==================== 告警触发 ====================

  checkMetrics(metrics: any): Alert[] {
    const firedAlerts: Alert[] = [];

    for (const [ruleId, rule] of this._rules) {
      if (!(rule as any).enabled) continue;
      if (this.isSilenced(rule)) continue;

      let triggered = false;
      let currentValue: number | null = null;

      if (rule.source === 'metrics' && rule.metric) {
        const result = this.checkMetricCondition(rule, metrics);
        triggered = result.triggered;
        currentValue = result.value;
      } else if (rule.source === 'custom' && typeof rule.check === 'function') {
        triggered = rule.check(metrics);
        currentValue = triggered ? 1 : 0;
      }

      if (triggered) {
        const alert = this.createAlert(rule, currentValue!);
        this._alerts.set(alert.id, alert);
        this._alertHistory.push(alert);
        firedAlerts.push(alert);
        this.sendAlert(alert);
        console.log(
          `[AlertService] 告警触发: ${rule.name} (${rule.level}) value=${currentValue} threshold=${rule.threshold}`,
        );
      }
    }

    return firedAlerts;
  }

  private checkMetricCondition(rule: AlertRule, metrics: any): { triggered: boolean; value: number | null } {
    let metricValue: number | null = null;
    const labels = rule.labels || {};

    if (metrics.counters && metrics.counters[rule.metric!]) {
      const counterData = metrics.counters[rule.metric!];
      const key = Object.keys(counterData).find(
        (k) => k === '{}' || this.matchLabels(k, labels),
      );
      if (key) metricValue = counterData[key];
    } else if (metrics.gauges && metrics.gauges[rule.metric!]) {
      const gaugeData = metrics.gauges[rule.metric!];
      const key = Object.keys(gaugeData).find(
        (k) => k === '{}' || this.matchLabels(k, labels),
      );
      if (key) metricValue = gaugeData[key];
    } else if (metrics.histograms && metrics.histograms[rule.metric!]) {
      const histogramData = metrics.histograms[rule.metric!];
      const key = Object.keys(histogramData).find(
        (k) => k === '{}' || this.matchLabels(k, labels),
      );
      if (key) metricValue = histogramData[key].mean || histogramData[key].count;
    }

    if (metricValue === null) {
      return { triggered: false, value: null };
    }

    let triggered = false;
    switch (rule.condition) {
      case '>': triggered = metricValue > rule.threshold; break;
      case '<': triggered = metricValue < rule.threshold; break;
      case '>=': triggered = metricValue >= rule.threshold; break;
      case '<=': triggered = metricValue <= rule.threshold; break;
      case '==': triggered = metricValue === rule.threshold; break;
    }

    return { triggered, value: metricValue };
  }

  private matchLabels(key: string, filter: Record<string, string>): boolean {
    if (!filter || Object.keys(filter).length === 0) return true;
    const labels = this.parseLabels(key);
    for (const [k, v] of Object.entries(filter)) {
      if (labels[k] !== v) return false;
    }
    return true;
  }

  private parseLabels(key: string): Record<string, string> {
    if (!key || key === '{}') return {};
    const labels: Record<string, string> = {};
    const matches = key.matchAll(/(\w+)="([^"]*)"/g);
    for (const match of matches) {
      labels[match[1]] = match[2];
    }
    return labels;
  }

  private createAlert(rule: AlertRule, value: number): Alert {
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      description: rule.description,
      level: rule.level,
      source: rule.source,
      metric: rule.metric,
      labels: rule.labels,
      value,
      threshold: rule.threshold,
      condition: rule.condition,
      duration: rule.duration,
      metadata: rule.metadata,
      status: AlertStatus.FIRING,
      firedAt: new Date().toISOString(),
    };
  }

  // ==================== 告警处理 ====================

  async sendAlert(alert: Alert): Promise<void> {
    this.onAlertCallback(alert);
    await this.sendWebhooks(alert);
  }

  private async sendWebhooks(alert: Alert): Promise<void> {
    const webhookUrls: string[] = [];

    if (this.webhooks[alert.level]) {
      webhookUrls.push(this.webhooks[alert.level]!);
    }
    if (this.webhooks.all) {
      webhookUrls.push(this.webhooks.all);
    }

    for (const webhookUrl of webhookUrls) {
      try {
        await this.sendWebhook(webhookUrl, alert);
      } catch (error) {
        console.error(`[AlertService] Webhook 发送失败: ${webhookUrl}`, error);
      }
    }
  }

  private sendWebhook(webhookUrl: string, payload: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const parsed = url.parse(webhookUrl);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AlertService/1.0',
        },
        timeout: 10000,
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode! >= 200 && res.statusCode! < 300) {
            console.log(`[AlertService] Webhook 发送成功: ${webhookUrl}`);
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Webhook 请求超时'));
      });

      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  getActiveAlerts(filter: { level?: AlertLevel; status?: AlertStatus; ruleId?: string } = {}): Alert[] {
    let alerts = Array.from(this._alerts.values());

    if (filter.level) {
      alerts = alerts.filter((a) => a.level === filter.level);
    }
    if (filter.status) {
      alerts = alerts.filter((a) => a.status === filter.status);
    }
    if (filter.ruleId) {
      alerts = alerts.filter((a) => a.ruleId === filter.ruleId);
    }

    return alerts;
  }

  getAlertCounts() {
    const counts = {
      total: this._alerts.size,
      byLevel: {
        [AlertLevel.CRITICAL]: 0,
        [AlertLevel.WARNING]: 0,
        [AlertLevel.INFO]: 0,
      },
      byStatus: {
        [AlertStatus.FIRING]: 0,
        [AlertStatus.ACKNOWLEDGED]: 0,
      },
    };

    for (const alert of this._alerts.values()) {
      counts.byLevel[alert.level]++;
      if (alert.status === AlertStatus.FIRING) {
        counts.byStatus[AlertStatus.FIRING]++;
      } else if (alert.status === AlertStatus.ACKNOWLEDGED) {
        counts.byStatus[AlertStatus.ACKNOWLEDGED]++;
      }
    }

    return counts;
  }

  acknowledgeAlert(alertId: string, acknowledgedBy = 'system'): boolean {
    const alert = this._alerts.get(alertId);
    if (!alert) return false;

    alert.status = AlertStatus.ACKNOWLEDGED;
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = acknowledgedBy;

    console.log(`[AlertService] 告警已确认: ${alertId} by ${acknowledgedBy}`);
    return true;
  }

  resolveAlert(alertId: string, resolvedBy = 'system', reason = ''): boolean {
    const alert = this._alerts.get(alertId);
    if (!alert) return false;

    alert.status = AlertStatus.RESOLVED;
    alert.resolvedAt = new Date().toISOString();
    alert.resolvedBy = resolvedBy;

    this._alerts.delete(alertId);
    this.onResolveCallback(alert);

    console.log(`[AlertService] 告警已解决: ${alertId} by ${resolvedBy}`);
    return true;
  }

  resolveByRule(ruleId: string, resolvedBy = 'system'): number {
    let count = 0;
    for (const [alertId, alert] of this._alerts) {
      if (alert.ruleId === ruleId) {
        this.resolveAlert(alertId, resolvedBy);
        count++;
      }
    }
    return count;
  }

  // ==================== 静默规则 ====================

  addSilenceRule(silenceRule: {
    id: string;
    ruleId?: string;
    level?: AlertLevel;
    startsAt: string;
    endsAt: string;
    createdBy?: string;
    reason?: string;
  }): boolean {
    if (!silenceRule.id || !silenceRule.startsAt || !silenceRule.endsAt) {
      return false;
    }

    this._silenceRules.set(silenceRule.id, {
      ...silenceRule,
      createdAt: new Date().toISOString(),
    });

    console.log(`[AlertService] 静默规则已添加: ${silenceRule.id}`);
    return true;
  }

  removeSilenceRule(silenceId: string): boolean {
    return this._silenceRules.delete(silenceId);
  }

  private isSilenced(rule: AlertRule): boolean {
    const now = Date.now();

    for (const silence of this._silenceRules.values()) {
      const startsAt = new Date(silence.startsAt).getTime();
      const endsAt = new Date(silence.endsAt).getTime();

      if (now < startsAt || now > endsAt) continue;
      if (silence.ruleId && silence.ruleId !== rule.id) continue;
      if (silence.level && silence.level !== rule.level) continue;

      return true;
    }

    return false;
  }

  getActiveSilences() {
    const now = Date.now();
    const active: any[] = [];

    for (const silence of this._silenceRules.values()) {
      const startsAt = new Date(silence.startsAt).getTime();
      const endsAt = new Date(silence.endsAt).getTime();

      if (now >= startsAt && now <= endsAt) {
        active.push(silence);
      }
    }

    return active;
  }

  // ==================== 健康检查 ====================

  private startHealthCheck() {
    this._healthCheckTimer = setInterval(() => {
      this.healthCheck();
    }, 60000);
  }

  private healthCheck() {
    const now = Date.now();

    // 清理过期的静默规则
    for (const [id, silence] of this._silenceRules) {
      const endsAt = new Date(silence.endsAt).getTime();
      if (now > endsAt) {
        this._silenceRules.delete(id);
      }
    }

    // 清理过期的告警历史
    const cutoffTime = now - this.RETENTION_DAYS * 24 * 60 * 60 * 1000;
    this._alertHistory.splice(
      0,
      this._alertHistory.length,
      ...this._alertHistory.filter((alert) => new Date(alert.firedAt).getTime() > cutoffTime),
    );
  }

  // ==================== 统计和报告 ====================

  getStats() {
    return {
      totalFired: this._alertHistory.filter((a) => a.status === AlertStatus.FIRING).length,
      totalResolved: this._alertHistory.filter((a) => a.status === AlertStatus.RESOLVED).length,
      activeAlerts: this.getAlertCounts(),
      rulesCount: this._rules.size,
      enabledRulesCount: Array.from(this._rules.values()).filter((r) => (r as any).enabled).length,
    };
  }

  getAlertHistory(options: {
    limit?: number;
    level?: AlertLevel;
    ruleId?: string;
    startTime?: string;
    endTime?: string;
  } = {}): Alert[] {
    let history = [...this._alertHistory];

    if (options.level) {
      history = history.filter((a) => a.level === options.level);
    }
    if (options.ruleId) {
      history = history.filter((a) => a.ruleId === options.ruleId);
    }
    if (options.startTime) {
      const start = new Date(options.startTime!).getTime();
      history = history.filter((a) => new Date(a.firedAt).getTime() >= start);
    }
    if (options.endTime) {
      const end = new Date(options.endTime!).getTime();
      history = history.filter((a) => new Date(a.firedAt).getTime() <= end);
    }

    history.sort((a, b) => new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime());

    if (options.limit) {
      history = history.slice(0, options.limit);
    }

    return history;
  }

  generateReport(hours = 24) {
    const startTime = Date.now() - hours * 60 * 60 * 1000;
    const relevantAlerts = this._alertHistory.filter(
      (a) => new Date(a.firedAt).getTime() >= startTime,
    );

    return {
      period: {
        start: new Date(startTime).toISOString(),
        end: new Date().toISOString(),
        hours,
      },
      summary: {
        total: relevantAlerts.length,
        byLevel: {
          critical: relevantAlerts.filter((a) => a.level === AlertLevel.CRITICAL).length,
          warning: relevantAlerts.filter((a) => a.level === AlertLevel.WARNING).length,
          info: relevantAlerts.filter((a) => a.level === AlertLevel.INFO).length,
        },
        resolved: relevantAlerts.filter((a) => a.status === AlertStatus.RESOLVED).length,
        firing: relevantAlerts.filter((a) => a.status === AlertStatus.FIRING).length,
      },
      stats: this.getStats(),
    };
  }
}
