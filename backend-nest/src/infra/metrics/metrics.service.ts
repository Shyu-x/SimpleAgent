/**
 * Metrics Service - Prometheus 指标采集服务
 * @description 企业级全链路指标采集，支持 Counter/Gauge/Histogram/Summary 四种指标类型
 */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export enum AlertLevel {
  CRITICAL = 'critical',
  WARNING = 'warning',
  INFO = 'info',
}

export interface MetricLabels {
  [key: string]: string;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  level: AlertLevel;
  metric: string;
  condition: '>' | '<' | '>=' | '<=' | '==';
  threshold: number;
  duration?: number;
  labels?: MetricLabels;
  callback?: (alert: any) => void;
}

export interface Alert {
  id: string;
  ruleId: string;
  name: string;
  description: string;
  level: AlertLevel;
  metric: string;
  value: number;
  threshold: number;
  condition: string;
  timestamp: string;
  status: 'firing' | 'resolved';
}

export interface CircuitOptions {
  failureThreshold?: number;
  successThreshold?: number;
  resetTimeout?: number;
  halfOpenProbeTimeout?: number;
}

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly RETENTION_DAYS = 7;
  private readonly PERSIST_INTERVAL = 60000;
  private readonly PERSIST_PATH = path.join(process.cwd(), 'data', 'metrics');
  private readonly BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  private readonly QUANTILES = [0.5, 0.9, 0.95, 0.99];

  // 指标存储
  private readonly _counters = new Map<string, Map<string, number>>();
  private readonly _gauges = new Map<string, Map<string, number>>();
  private readonly _histograms = new Map<string, Map<string, { count: number; sum: number; buckets: Record<number, number>; values: number[] }>>();
  private readonly _summaries = new Map<string, Map<string, { count: number; sum: number; values: number[] }>>();

  // 活跃请求追踪
  private _activeRequests = 0;
  private readonly _requestStartTimes = new Map<string, { startTime: number; labels: MetricLabels }>();

  // 定时器
  private _persistTimer: NodeJS.Timeout | null = null;
  private _cleanupTimer: NodeJS.Timeout | null = null;

  // 告警规则
  private readonly _alertRules = new Map<string, AlertRule>();
  private readonly _activeAlerts = new Map<string, Alert>();
  private _onAlertCallback: ((alert: Alert) => void) | null = null;

  async onModuleInit() {
    this.ensurePersistDir();
    this.startPersistTimer();
    this.startCleanupTimer();
    this.registerDefaultMetrics();
  }

  async onModuleDestroy() {
    this.stopTimers();
    await this.persist();
  }

  private ensurePersistDir() {
    if (!fs.existsSync(this.PERSIST_PATH)) {
      fs.mkdirSync(this.PERSIST_PATH, { recursive: true });
    }
  }

  private startPersistTimer() {
    this._persistTimer = setInterval(() => {
      this.persist();
    }, this.PERSIST_INTERVAL);
  }

  private startCleanupTimer() {
    this._cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 3600000);
  }

  private stopTimers() {
    if (this._persistTimer) {
      clearInterval(this._persistTimer);
      this._persistTimer = null;
    }
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  private registerDefaultMetrics() {
    this.setGauge('process_cpu_seconds_total', 0);
    this.setGauge('process_memory_bytes', 0);
    this.setGauge('process_open_handles', 0);
    this.setGauge('http_requests_active', 0);
    this.setGauge('http_requests_total', 0);
    this.setGauge('http_request_duration_seconds', 0);
    this.setGauge('model_tokens_total', 0);
    this.setGauge('model_requests_total', 0);
    this.setGauge('model_errors_total', 0);
    this.setGauge('tool_calls_total', 0);
    this.setGauge('tool_errors_total', 0);
    this.setGauge('tool_duration_seconds', 0);
    this.setGauge('queue_length', 0);
    this.setGauge('queue_capacity', 0);
  }

  // ==================== Counter 操作 ====================

  incrementCounter(name: string, labels: MetricLabels = {}, value = 1) {
    const labelKey = this.labelsToKey(labels);
    if (!this._counters.has(name)) {
      this._counters.set(name, new Map());
    }
    const counter = this._counters.get(name)!;
    const current = counter.get(labelKey) || 0;
    counter.set(labelKey, current + value);
  }

  getCounter(name: string, labels: MetricLabels = {}): number {
    const labelKey = this.labelsToKey(labels);
    const counter = this._counters.get(name);
    return counter ? counter.get(labelKey) || 0 : 0;
  }

  // ==================== Gauge 操作 ====================

  setGauge(name: string, value: number, labels: MetricLabels = {}) {
    const labelKey = this.labelsToKey(labels);
    if (!this._gauges.has(name)) {
      this._gauges.set(name, new Map());
    }
    this._gauges.get(name)!.set(labelKey, value);
  }

  incGauge(name: string, value = 1, labels: MetricLabels = {}) {
    const current = this.getGauge(name, labels);
    this.setGauge(name, current + value, labels);
  }

  decGauge(name: string, value = 1, labels: MetricLabels = {}) {
    const current = this.getGauge(name, labels);
    this.setGauge(name, current - value, labels);
  }

  getGauge(name: string, labels: MetricLabels = {}): number {
    const labelKey = this.labelsToKey(labels);
    const gauge = this._gauges.get(name);
    return gauge ? gauge.get(labelKey) || 0 : 0;
  }

  // ==================== Histogram 操作 ====================

  recordHistogram(name: string, value: number, labels: MetricLabels = {}) {
    const labelKey = this.labelsToKey(labels);
    if (!this._histograms.has(name)) {
      this._histograms.set(name, new Map());
    }

    const histogram = this._histograms.get(name)!;
    let data = histogram.get(labelKey);

    if (!data) {
      const buckets: Record<number, number> = {};
      for (const bucket of this.BUCKETS) {
        buckets[bucket] = 0;
      }
      data = { count: 0, sum: 0, buckets, values: [] };
      histogram.set(labelKey, data);
    }

    data.count++;
    data.sum += value;
    data.values.push(value);

    for (const bucket of this.BUCKETS) {
      if (value <= bucket) {
        data.buckets[bucket]++;
      }
    }

    if (data.values.length > 10000) {
      data.values = data.values.slice(-5000);
    }
  }

  getHistogram(name: string, labels: MetricLabels = {}) {
    const labelKey = this.labelsToKey(labels);
    const histogram = this._histograms.get(name);
    if (!histogram) return null;

    const data = histogram.get(labelKey);
    if (!data) return null;

    return {
      count: data.count,
      sum: data.sum,
      mean: data.count > 0 ? data.sum / data.count : 0,
      min: data.values.length > 0 ? Math.min(...data.values.slice(-100)) : 0,
      max: data.values.length > 0 ? Math.max(...data.values.slice(-100)) : 0,
      buckets: { ...data.buckets },
    };
  }

  // ==================== Summary 操作 ====================

  recordSummary(name: string, value: number, labels: MetricLabels = {}) {
    const labelKey = this.labelsToKey(labels);
    if (!this._summaries.has(name)) {
      this._summaries.set(name, new Map());
    }

    const summary = this._summaries.get(name)!;
    let data = summary.get(labelKey);

    if (!data) {
      data = { count: 0, sum: 0, values: [] };
      summary.set(labelKey, data);
    }

    data.count++;
    data.sum += value;
    data.values.push(value);

    if (data.values.length > 10000) {
      data.values = data.values.slice(-5000);
    }
  }

  getSummary(name: string, labels: MetricLabels = {}) {
    const labelKey = this.labelsToKey(labels);
    const summary = this._summaries.get(name);
    if (!summary) return null;

    const data = summary.get(labelKey);
    if (!data) return null;

    const quantiles: Record<number, number> = {};
    for (const q of this.QUANTILES) {
      quantiles[q] = this.calculateQuantile(data.values, q);
    }

    return {
      count: data.count,
      sum: data.sum,
      mean: data.count > 0 ? data.sum / data.count : 0,
      quantiles,
    };
  }

  private calculateQuantile(values: number[], quantile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor(quantile * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)];
  }

  // ==================== 活跃请求追踪 ====================

  startRequest(requestId: string, labels: MetricLabels = {}) {
    this._activeRequests++;
    this._requestStartTimes.set(requestId, {
      startTime: Date.now(),
      labels,
    });
    this.setGauge('http_requests_active', this._activeRequests);
  }

  endRequest(requestId: string, statusCode = 200) {
    const startData = this._requestStartTimes.get(requestId);
    if (!startData) return null;

    const duration = (Date.now() - startData.startTime) / 1000;
    this._activeRequests = Math.max(0, this._activeRequests - 1);
    this._requestStartTimes.delete(requestId);

    this.setGauge('http_requests_active', this._activeRequests);
    this.incrementCounter('http_requests_total', { ...startData.labels, status: String(statusCode) });
    this.recordHistogram('http_request_duration_seconds', duration, startData.labels);

    this.checkAlerts();

    return { duration, statusCode, labels: startData.labels };
  }

  // ==================== 标签处理 ====================

  private labelsToKey(labels: MetricLabels): string {
    if (!labels || Object.keys(labels).length === 0) return '';
    return Object.keys(labels)
      .sort()
      .map((k) => `${k}="${labels[k]}"`)
      .join(',');
  }

  private keyToLabels(key: string): MetricLabels {
    if (!key) return {};
    const labels: MetricLabels = {};
    const matches = key.matchAll(/(\w+)="([^"]*)"/g);
    for (const match of matches) {
      labels[match[1]] = match[2];
    }
    return labels;
  }

  // ==================== 指标获取 ====================

  getMetrics() {
    return {
      timestamp: new Date().toISOString(),
      counters: this.serializeCounters(),
      gauges: this.serializeGauges(),
      histograms: this.serializeHistograms(),
      summaries: this.serializeSummaries(),
      activeRequests: this._activeRequests,
    };
  }

  private serializeCounters() {
    const result: Record<string, Record<string, number>> = {};
    for (const [name, data] of this._counters) {
      result[name] = {};
      for (const [key, value] of data) {
        result[name][key || '{}'] = value;
      }
    }
    return result;
  }

  private serializeGauges() {
    const result: Record<string, Record<string, number>> = {};
    for (const [name, data] of this._gauges) {
      result[name] = {};
      for (const [key, value] of data) {
        result[name][key || '{}'] = value;
      }
    }
    return result;
  }

  private serializeHistograms() {
    const result: Record<string, Record<string, any>> = {};
    for (const [name, data] of this._histograms) {
      result[name] = {};
      for (const [key, histogram] of data) {
        result[name][key || '{}'] = {
          count: histogram.count,
          sum: histogram.sum,
          mean: histogram.count > 0 ? histogram.sum / histogram.count : 0,
          buckets: histogram.buckets,
        };
      }
    }
    return result;
  }

  private serializeSummaries() {
    const result: Record<string, Record<string, any>> = {};
    for (const [name, data] of this._summaries) {
      result[name] = {};
      for (const [key, summary] of data) {
        const quantiles: Record<number, number> = {};
        for (const q of this.QUANTILES) {
          quantiles[q] = this.calculateQuantile(summary.values, q);
        }
        result[name][key || '{}'] = {
          count: summary.count,
          sum: summary.sum,
          mean: summary.count > 0 ? summary.sum / summary.count : 0,
          quantiles,
        };
      }
    }
    return result;
  }

  // ==================== Prometheus 格式导出 ====================

  toPrometheusFormat(): string {
    const lines: string[] = [];
    const metrics = this.getMetrics();

    // 导出计数器
    for (const [name, data] of Object.entries(metrics.counters)) {
      for (const [key, value] of Object.entries(data)) {
        const labels = key === '{}' ? '' : `{${key}}`;
        lines.push(`${name}${labels} ${value}`);
      }
    }

    // 导出瞬时值
    for (const [name, data] of Object.entries(metrics.gauges)) {
      for (const [key, value] of Object.entries(data)) {
        const labels = key === '{}' ? '' : `{${key}}`;
        lines.push(`${name}${labels} ${value}`);
      }
    }

    // 导出直方图
    for (const [name, data] of Object.entries(metrics.histograms)) {
      for (const [key, histogram] of Object.entries(data)) {
        const labels = key === '{}' ? '' : `{${key}}`;
        lines.push(`${name}_count${labels} ${histogram.count}`);
        lines.push(`${name}_sum${labels} ${histogram.sum}`);
        for (const [bucket, count] of Object.entries(histogram.buckets)) {
          const bucketLabels = key === '{}' ? `{le="${bucket}"}` : `{${key},le="${bucket}"}`;
          lines.push(`${name}_bucket${bucketLabels} ${count}`);
        }
      }
    }

    // 导出摘要
    for (const [name, data] of Object.entries(metrics.summaries)) {
      for (const [key, summary] of Object.entries(data)) {
        const labels = key === '{}' ? '' : `{${key}}`;
        lines.push(`${name}_count${labels} ${summary.count}`);
        lines.push(`${name}_sum${labels} ${summary.sum}`);
        for (const [q, value] of Object.entries(summary.quantiles)) {
          const qLabels = key === '{}' ? `{quantile="${q}"}` : `{${key},quantile="${q}"}`;
          lines.push(`${name}${qLabels} ${value}`);
        }
      }
    }

    return lines.join('\n');
  }

  // ==================== 持久化 ====================

  async persist() {
    try {
      const metrics = this.getMetrics();
      const filename = `metrics_${Date.now()}.json`;
      const filepath = path.join(this.PERSIST_PATH, filename);

      await fs.promises.writeFile(filepath, JSON.stringify(metrics, null, 2));

      const latestPath = path.join(this.PERSIST_PATH, 'metrics_latest.json');
      await fs.promises.writeFile(latestPath, JSON.stringify(metrics, null, 2));
    } catch (error) {
      console.error('[MetricsService] 持久化失败:', error);
    }
  }

  async loadLatest(): Promise<any | null> {
    const latestPath = path.join(this.PERSIST_PATH, 'metrics_latest.json');
    try {
      const data = await fs.promises.readFile(latestPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async cleanup() {
    try {
      const files = await fs.promises.readdir(this.PERSIST_PATH);
      const cutoffTime = Date.now() - this.RETENTION_DAYS * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (file === 'metrics_latest.json') continue;
        const filepath = path.join(this.PERSIST_PATH, file);
        const stat = await fs.promises.stat(filepath);
        if (stat.mtimeMs < cutoffTime) {
          await fs.promises.unlink(filepath);
        }
      }
    } catch (error) {
      console.error('[MetricsService] 清理失败:', error);
    }
  }

  // ==================== 告警规则 ====================

  registerAlertRule(rule: AlertRule) {
    this._alertRules.set(rule.id, {
      ...rule,
      duration: rule.duration || 0,
    });
  }

  removeAlertRule(ruleId: string): boolean {
    return this._alertRules.delete(ruleId);
  }

  set onAlert(callback: (alert: Alert) => void) {
    this._onAlertCallback = callback;
  }

  private checkAlerts() {
    const metrics = this.getMetrics();

    for (const [ruleId, rule] of this._alertRules) {
      let metricValue: number | null = null;
      const labels = rule.labels || {};

      if (metrics.counters[rule.metric]) {
        const key = Object.keys(metrics.counters[rule.metric]).find(
          (k) => k === '{}' || this.matchLabels(k, labels),
        );
        if (key) metricValue = metrics.counters[rule.metric][key];
      } else if (metrics.gauges[rule.metric]) {
        const key = Object.keys(metrics.gauges[rule.metric]).find(
          (k) => k === '{}' || this.matchLabels(k, labels),
        );
        if (key) metricValue = metrics.gauges[rule.metric][key];
      }

      if (metricValue === null) continue;

      let triggered = false;
      switch (rule.condition) {
        case '>': triggered = metricValue > rule.threshold; break;
        case '<': triggered = metricValue < rule.threshold; break;
        case '>=': triggered = metricValue >= rule.threshold; break;
        case '<=': triggered = metricValue <= rule.threshold; break;
        case '==': triggered = metricValue === rule.threshold; break;
      }

      if (triggered) {
        const alert: Alert = {
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          ruleId: rule.id,
          name: rule.name,
          description: rule.description,
          level: rule.level,
          metric: rule.metric,
          value: metricValue,
          threshold: rule.threshold,
          condition: rule.condition,
          timestamp: new Date().toISOString(),
          status: 'firing',
        };
        this._activeAlerts.set(alert.id, alert);
        if (this._onAlertCallback) {
          this._onAlertCallback(alert);
        }
      }
    }
  }

  private matchLabels(key: string, filter: MetricLabels): boolean {
    const labels = this.keyToLabels(key);
    for (const [k, v] of Object.entries(filter)) {
      if (labels[k] !== v) return false;
    }
    return true;
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this._activeAlerts.values());
  }

  getAlertsByLevel(level: AlertLevel): Alert[] {
    return this.getActiveAlerts().filter((alert) => alert.level === level);
  }

  resolveAlert(alertId: string): boolean {
    const alert = this._activeAlerts.get(alertId);
    if (!alert) return false;
    alert.status = 'resolved';
    this._activeAlerts.delete(alertId);
    return true;
  }

  // ==================== 生命周期 ====================

  reset() {
    this._counters.clear();
    this._gauges.clear();
    this._histograms.clear();
    this._summaries.clear();
    this._activeAlerts.clear();
    this.registerDefaultMetrics();
  }
}
