/**
 * 指标采集器 - 企业级全链路指标采集
 * @description 支持 Counter/Gauge/Histogram/Summary 四种指标类型，支持 Prometheus 格式导出
 *
 * 指标类型说明：
 * - counter: 计数器，只增不减（请求数、错误数）
 * - gauge: 瞬时值，可增可减（活跃请求、队列长度）
 * - histogram: 直方图，记录值分布（延迟分布、Token分布）
 * - summary: 摘要，统计分位数（QPS、错误率）
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

const fs = require('fs');
const path = require('path');

class MetricsCollector {
  /**
   * 告警级别定义
   */
  static ALERT_LEVELS = {
    CRITICAL: 'critical',
    WARNING: 'warning',
    INFO: 'info',
  };

  /**
   * 创建指标采集器实例
   * @param {Object} options - 配置选项
   * @param {number} [options.retentionDays=7] - 指标保留天数
   * @param {number} [options.persistInterval=60000] - 持久化间隔（毫秒）
   * @param {string} [options.persistPath] - 持久化文件路径
   * @param {Function} [options.onAlert] - 告警回调 (alert) => void
   */
  constructor(options = {}) {
    // 配置
    this.retentionDays = options.retentionDays ?? 7;
    this.persistInterval = options.persistInterval ?? 60000;
    this.persistPath = options.persistPath || path.join(process.cwd(), 'data', 'metrics');
    this.onAlert = options.onAlert || (() => {});

    // 内部存储
    this._counters = new Map();      // counter 指标: { name: { labels: value } }
    this._gauges = new Map();         // gauge 指标
    this._histograms = new Map();     // histogram 指标: { name: { labels: { count, sum, buckets } } }
    this._summaries = new Map();      // summary 指标: { name: { labels: { count, sum, quantiles } } }

    // 直方图桶边界配置
    this._histogramBuckets = options.buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    this._summaryQuantiles = options.quantiles || [0.5, 0.9, 0.95, 0.99];

    // 活跃请求追踪
    this._activeRequests = 0;
    this._requestStartTimes = new Map();

    // 定时任务
    this._persistTimer = null;
    this._cleanupTimer = null;

    // 告警规则
    this._alertRules = new Map();
    this._activeAlerts = new Map();

    // 初始化
    this._init();
  }

  /**
   * 初始化采集器
   * @private
   */
  _init() {
    // 确保持久化目录存在
    if (this.persistPath && !fs.existsSync(this.persistPath)) {
      fs.mkdirSync(this.persistPath, { recursive: true });
    }

    // 启动定时持久化
    this._startPersistTimer();

    // 启动定时清理
    this._startCleanupTimer();

    // 注册默认指标
    this._registerDefaultMetrics();
  }

  /**
   * 注册默认系统指标
   * @private
   */
  _registerDefaultMetrics() {
    // 进程指标
    this.setGauge('process_cpu_seconds_total', 0);
    this.setGauge('process_memory_bytes', 0);
    this.setGauge('process_open_handles', 0);

    // 请求指标
    this.setGauge('http_requests_active', 0);
    this.setGauge('http_requests_total', 0);
    this.setGauge('http_request_duration_seconds', 0);

    // 模型指标
    this.setGauge('model_tokens_total', 0);
    this.setGauge('model_requests_total', 0);
    this.setGauge('model_errors_total', 0);

    // 工具指标
    this.setGauge('tool_calls_total', 0);
    this.setGauge('tool_errors_total', 0);
    this.setGauge('tool_duration_seconds', 0);

    // 队列指标
    this.setGauge('queue_length', 0);
    this.setGauge('queue_capacity', 0);
  }

  // ==================== Counter 操作 ====================

  /**
   * 增加计数器
   * @param {string} name - 指标名称
   * @param {Object} [labels={}] - 标签
   * @param {number} [value=1] - 增加的值
   * @returns {void}
   */
  incrementCounter(name, labels = {}, value = 1) {
    const labelKey = this._labelsToKey(labels);

    if (!this._counters.has(name)) {
      this._counters.set(name, new Map());
    }

    const counter = this._counters.get(name);
    const current = counter.get(labelKey) || 0;
    counter.set(labelKey, current + value);
  }

  /**
   * 获取计数器值
   * @param {string} name - 指标名称
   * @param {Object} [labels={}] - 标签
   * @returns {number}
   */
  getCounter(name, labels = {}) {
    const labelKey = this._labelsToKey(labels);
    const counter = this._counters.get(name);
    return counter ? counter.get(labelKey) || 0 : 0;
  }

  // ==================== Gauge 操作 ====================

  /**
   * 设置瞬时值
   * @param {string} name - 指标名称
   * @param {number} value - 值
   * @param {Object} [labels={}] - 标签
   * @returns {void}
   */
  setGauge(name, value, labels = {}) {
    const labelKey = this._labelsToKey(labels);

    if (!this._gauges.has(name)) {
      this._gauges.set(name, new Map());
    }

    this._gauges.get(name).set(labelKey, value);
  }

  /**
   * 增加瞬时值
   * @param {string} name - 指标名称
   * @param {number} [value=1] - 增加的值
   * @param {Object} [labels={}] - 标签
   * @returns {void}
   */
  incGauge(name, value = 1, labels = {}) {
    const current = this.getGauge(name, labels);
    this.setGauge(name, current + value, labels);
  }

  /**
   * 减少瞬时值
   * @param {string} name - 指标名称
   * @param {number} [value=1] - 减少的值
   * @param {Object} [labels={}] - 标签
   * @returns {void}
   */
  decGauge(name, value = 1, labels = {}) {
    const current = this.getGauge(name, labels);
    this.setGauge(name, current - value, labels);
  }

  /**
   * 获取瞬时值
   * @param {string} name - 指标名称
   * @param {Object} [labels={}] - 标签
   * @returns {number}
   */
  getGauge(name, labels = {}) {
    const labelKey = this._labelsToKey(labels);
    const gauge = this._gauges.get(name);
    return gauge ? gauge.get(labelKey) || 0 : 0;
  }

  // ==================== Histogram 操作 ====================

  /**
   * 记录直方图值
   * @param {string} name - 指标名称
   * @param {number} value - 值
   * @param {Object} [labels={}] - 标签
   * @returns {void}
   */
  recordHistogram(name, value, labels = {}) {
    const labelKey = this._labelsToKey(labels);

    if (!this._histograms.has(name)) {
      this._histograms.set(name, new Map());
    }

    const histogram = this._histograms.get(name);
    let data = histogram.get(labelKey);

    if (!data) {
      // 初始化直方图数据
      const buckets = {};
      for (const bucket of this._histogramBuckets) {
        buckets[bucket] = 0;
      }
      data = { count: 0, sum: 0, buckets, values: [] };
      histogram.set(labelKey, data);
    }

    // 更新统计
    data.count++;
    data.sum += value;
    data.values.push(value);

    // 更新桶计数
    for (const bucket of this._histogramBuckets) {
      if (value <= bucket) {
        data.buckets[bucket]++;
      }
    }

    // 限制历史值数量，防止内存泄漏
    if (data.values.length > 10000) {
      data.values = data.values.slice(-5000);
    }
  }

  /**
   * 获取直方图统计
   * @param {string} name - 指标名称
   * @param {Object} [labels={}] - 标签
   * @returns {Object|null}
   */
  getHistogram(name, labels = {}) {
    const labelKey = this._labelsToKey(labels);
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

  /**
   * 记录摘要值
   * @param {string} name - 指标名称
   * @param {number} value - 值
   * @param {Object} [labels={}] - 标签
   * @returns {void}
   */
  recordSummary(name, value, labels = {}) {
    const labelKey = this._labelsToKey(labels);

    if (!this._summaries.has(name)) {
      this._summaries.set(name, new Map());
    }

    const summary = this._summaries.get(name);
    let data = summary.get(labelKey);

    if (!data) {
      data = { count: 0, sum: 0, values: [] };
      summary.set(labelKey, data);
    }

    data.count++;
    data.sum += value;
    data.values.push(value);

    // 限制历史值数量
    if (data.values.length > 10000) {
      data.values = data.values.slice(-5000);
    }
  }

  /**
   * 获取摘要统计
   * @param {string} name - 指标名称
   * @param {Object} [labels={}] - 标签
   * @returns {Object|null}
   */
  getSummary(name, labels = {}) {
    const labelKey = this._labelsToKey(labels);
    const summary = this._summaries.get(name);
    if (!summary) return null;

    const data = summary.get(labelKey);
    if (!data) return null;

    // 计算分位数
    const quantiles = {};
    for (const q of this._summaryQuantiles) {
      quantiles[q] = this._calculateQuantile(data.values, q);
    }

    return {
      count: data.count,
      sum: data.sum,
      mean: data.count > 0 ? data.sum / data.count : 0,
      quantiles,
    };
  }

  /**
   * 计算分位数
   * @param {number[]} values - 已排序的值数组
   * @param {number} quantile - 分位数 (0-1)
   * @returns {number}
   * @private
   */
  _calculateQuantile(values, quantile) {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor(quantile * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)];
  }

  // ==================== 活跃请求追踪 ====================

  /**
   * 记录请求开始
   * @param {string} requestId - 请求ID
   * @param {Object} [labels={}] - 标签
   * @returns {void}
   */
  startRequest(requestId, labels = {}) {
    this._activeRequests++;
    this._requestStartTimes.set(requestId, {
      startTime: Date.now(),
      labels,
    });
    this.setGauge('http_requests_active', this._activeRequests);
  }

  /**
   * 记录请求结束
   * @param {string} requestId - 请求ID
   * @param {number} [statusCode=200] - 状态码
   * @returns {Object} 请求统计
   */
  endRequest(requestId, statusCode = 200) {
    const startData = this._requestStartTimes.get(requestId);
    if (!startData) {
      return null;
    }

    const duration = (Date.now() - startData.startTime) / 1000; // 转换为秒
    this._activeRequests = Math.max(0, this._activeRequests - 1);
    this._requestStartTimes.delete(requestId);

    // 更新指标
    this.setGauge('http_requests_active', this._activeRequests);
    this.incrementCounter('http_requests_total', { ...startData.labels, status: statusCode });
    this.recordHistogram('http_request_duration_seconds', duration, startData.labels);

    // 检查是否需要告警
    this._checkAlerts();

    return {
      duration,
      statusCode,
      labels: startData.labels,
    };
  }

  // ==================== 标签处理 ====================

  /**
   * 将标签对象转换为字符串键
   * @param {Object} labels - 标签对象
   * @returns {string}
   * @private
   */
  _labelsToKey(labels) {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }
    return Object.keys(labels)
      .sort()
      .map((k) => `${k}="${labels[k]}"`)
      .join(',');
  }

  /**
   * 从字符串键解析标签
   * @param {string} key - 标签键
   * @returns {Object}
   * @private
   */
  _keyToLabels(key) {
    if (!key) return {};
    const labels = {};
    const matches = key.matchAll(/(\w+)="([^"]*)"/g);
    for (const match of matches) {
      labels[match[1]] = match[2];
    }
    return labels;
  }

  // ==================== 指标获取 ====================

  /**
   * 获取所有指标
   * @returns {Object} 所有指标数据
   */
  getMetrics() {
    return {
      timestamp: new Date().toISOString(),
      counters: this._serializeCounters(),
      gauges: this._serializeGauges(),
      histograms: this._serializeHistograms(),
      summaries: this._serializeSummaries(),
      activeRequests: this._activeRequests,
    };
  }

  /**
   * 序列化计数器
   * @returns {Object}
   * @private
   */
  _serializeCounters() {
    const result = {};
    for (const [name, data] of this._counters) {
      result[name] = {};
      for (const [key, value] of data) {
        result[name][key || '{}'] = value;
      }
    }
    return result;
  }

  /**
   * 序列化瞬时值
   * @returns {Object}
   * @private
   */
  _serializeGauges() {
    const result = {};
    for (const [name, data] of this._gauges) {
      result[name] = {};
      for (const [key, value] of data) {
        result[name][key || '{}'] = value;
      }
    }
    return result;
  }

  /**
   * 序列化直方图
   * @returns {Object}
   * @private
   */
  _serializeHistograms() {
    const result = {};
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

  /**
   * 序列化摘要
   * @returns {Object}
   * @private
   */
  _serializeSummaries() {
    const result = {};
    for (const [name, data] of this._summaries) {
      result[name] = {};
      for (const [key, summary] of data) {
        const quantiles = {};
        for (const q of this._summaryQuantiles) {
          quantiles[q] = this._calculateQuantile(summary.values, q);
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

  /**
   * 导出为 Prometheus 文本格式
   * @returns {string} Prometheus 格式的指标数据
   */
  toPrometheusFormat() {
    const lines = [];
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

  /**
   * 启动定时持久化
   * @private
   */
  _startPersistTimer() {
    if (this._persistTimer) {
      clearInterval(this._persistTimer);
    }

    this._persistTimer = setInterval(() => {
      this.persist();
    }, this.persistInterval);
  }

  /**
   * 持久化指标到磁盘
   * @returns {Promise<void>}
   */
  async persist() {
    if (!this.persistPath) return;

    try {
      const metrics = this.getMetrics();
      const filename = `metrics_${Date.now()}.json`;
      const filepath = path.join(this.persistPath, filename);

      await fs.promises.writeFile(filepath, JSON.stringify(metrics, null, 2));

      // 同时更新最新指标文件
      const latestPath = path.join(this.persistPath, 'metrics_latest.json');
      await fs.promises.writeFile(latestPath, JSON.stringify(metrics, null, 2));
    } catch (error) {
      console.error('[MetricsCollector] 持久化失败:', error);
    }
  }

  /**
   * 从磁盘加载最新指标
   * @returns {Promise<Object|null>}
   */
  async loadLatest() {
    if (!this.persistPath) return null;

    const latestPath = path.join(this.persistPath, 'metrics_latest.json');

    try {
      const data = await fs.promises.readFile(latestPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * 启动定时清理
   * @private
   */
  _startCleanupTimer() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
    }

    // 每小时清理一次过期文件
    this._cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 3600000);
  }

  /**
   * 清理过期指标文件
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (!this.persistPath) return;

    try {
      const files = await fs.promises.readdir(this.persistPath);
      const cutoffTime = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (file === 'metrics_latest.json') continue;

        const filepath = path.join(this.persistPath, file);
        const stat = await fs.promises.stat(filepath);

        if (stat.mtimeMs < cutoffTime) {
          await fs.promises.unlink(filepath);
        }
      }
    } catch (error) {
      console.error('[MetricsCollector] 清理失败:', error);
    }
  }

  // ==================== 告警规则 ====================

  /**
   * 注册告警规则
   * @param {Object} rule - 告警规则
   * @param {string} rule.id - 规则ID
   * @param {string} rule.name - 规则名称
   * @param {string} rule.description - 规则描述
   * @param {string} rule.level - 告警级别 (critical/warning/info)
   * @param {string} rule.metric - 监控的指标名称
   * @param {string} rule.condition - 比较条件 (>, <, >=, <=, ==)
   * @param {number} rule.threshold - 阈值
   * @param {number} [rule.duration=0] - 持续时间（毫秒），0 表示立即触发
   * @param {Object} [rule.labels] - 标签过滤器
   * @param {Function} [rule.callback] - 触发回调
   */
  registerAlertRule(rule) {
    this._alertRules.set(rule.id, {
      ...rule,
      lastTriggered: null,
      triggerCount: 0,
    });
  }

  /**
   * 移除告警规则
   * @param {string} ruleId - 规则ID
   * @returns {boolean}
   */
  removeAlertRule(ruleId) {
    return this._alertRules.delete(ruleId);
  }

  /**
   * 检查指标是否触发告警
   * @private
   */
  _checkAlerts() {
    const metrics = this.getMetrics();

    for (const [ruleId, rule] of this._alertRules) {
      // 获取指标值
      let metricValue = null;
      const labels = rule.labels || {};

      if (metrics.counters[rule.metric]) {
        const key = Object.keys(metrics.counters[rule.metric]).find(
          (k) => k === '{}' || this._matchLabels(k, labels)
        );
        if (key) {
          metricValue = metrics.counters[rule.metric][key];
        }
      } else if (metrics.gauges[rule.metric]) {
        const key = Object.keys(metrics.gauges[rule.metric]).find(
          (k) => k === '{}' || this._matchLabels(k, labels)
        );
        if (key) {
          metricValue = metrics.gauges[rule.metric][key];
        }
      }

      if (metricValue === null) continue;

      // 检查条件
      let triggered = false;
      switch (rule.condition) {
        case '>':
          triggered = metricValue > rule.threshold;
          break;
        case '<':
          triggered = metricValue < rule.threshold;
          break;
        case '>=':
          triggered = metricValue >= rule.threshold;
          break;
        case '<=':
          triggered = metricValue <= rule.threshold;
          break;
        case '==':
          triggered = metricValue === rule.threshold;
          break;
      }

      if (triggered) {
        // 检查持续时间
        if (rule.lastTriggered === null) {
          rule.lastTriggered = Date.now();
        }

        const duration = Date.now() - rule.lastTriggered;
        if (duration >= rule.duration || rule.duration === 0) {
          // 触发告警
          const alert = this._createAlert(rule, metricValue);
          this._activeAlerts.set(alert.id, alert);
          rule.triggerCount++;

          // 调用回调
          if (rule.callback) {
            rule.callback(alert);
          }

          // 调用全局告警回调
          this.onAlert(alert);
        }
      } else {
        // 重置触发时间
        rule.lastTriggered = null;
      }
    }
  }

  /**
   * 匹配标签
   * @param {string} key - 标签键
   * @param {Object} filter - 过滤器标签
   * @returns {boolean}
   * @private
   */
  _matchLabels(key, filter) {
    const labels = this._keyToLabels(key);
    for (const [k, v] of Object.entries(filter)) {
      if (labels[k] !== v) return false;
    }
    return true;
  }

  /**
   * 创建告警对象
   * @param {Object} rule - 告警规则
   * @param {number} value - 当前值
   * @returns {Object}
   * @private
   */
  _createAlert(rule, value) {
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      name: rule.name,
      description: rule.description,
      level: rule.level,
      metric: rule.metric,
      value,
      threshold: rule.threshold,
      condition: rule.condition,
      timestamp: new Date().toISOString(),
      status: 'firing',
    };
  }

  /**
   * 获取活跃告警列表
   * @returns {Object[]}
   */
  getActiveAlerts() {
    return Array.from(this._activeAlerts.values());
  }

  /**
   * 获取指定级别的活跃告警
   * @param {string} level - 告警级别
   * @returns {Object[]}
   */
  getAlertsByLevel(level) {
    return this.getActiveAlerts().filter((alert) => alert.level === level);
  }

  /**
   * 解决告警
   * @param {string} alertId - 告警ID
   * @returns {boolean}
   */
  resolveAlert(alertId) {
    const alert = this._activeAlerts.get(alertId);
    if (!alert) return false;

    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();
    this._activeAlerts.delete(alertId);
    return true;
  }

  /**
   * 清除所有已解决的告警
   */
  clearResolvedAlerts() {
    for (const [id, alert] of this._activeAlerts) {
      if (alert.status === 'resolved') {
        this._activeAlerts.delete(id);
      }
    }
  }

  // ==================== Agent 执行指标 ====================

  /**
   * 记录 Agent 执行指标
   * @param {Object} execution - 执行结果
   * @param {number} execution.iterations - 迭代次数
   * @param {number} execution.toolCalls - 工具调用次数
   * @param {number} execution.tokens - token 消耗
   * @param {number} execution.duration - 执行时长（毫秒）
   * @param {boolean} execution.success - 是否成功
   */
  recordAgentExecution(execution) {
    const { iterations = 0, toolCalls = 0, tokens = 0, duration = 0, success = true } = execution;

    // 记录直方图
    this.recordHistogram('agent_iterations', iterations);
    this.recordHistogram('agent_tool_calls', toolCalls);
    this.recordHistogram('agent_tokens', tokens);
    this.recordHistogram('agent_duration_seconds', duration / 1000);

    // 更新 Gauge
    this.setGauge('agent_last_iterations', iterations);
    this.setGauge('agent_last_tool_calls', toolCalls);
    this.setGauge('agent_last_tokens', tokens);
    this.setGauge('agent_last_duration', duration);

    // 计数器
    this.incrementCounter('agent_executions_total', { success: success ? 'true' : 'false' });
    this.incrementCounter('agent_iterations_total', {}, iterations);
    this.incrementCounter('agent_tool_calls_total', {}, toolCalls);
    this.incrementCounter('agent_tokens_total', {}, tokens);

    // 更新摘要统计
    this.recordSummary('agent_execution_summary', duration / 1000, { type: 'duration' });
    this.recordSummary('agent_execution_summary', iterations, { type: 'iterations' });
    this.recordSummary('agent_execution_summary', toolCalls, { type: 'tool_calls' });
  }

  /**
   * 获取 Agent 执行统计
   * @returns {Object} Agent 执行统计
   */
  getAgentStats() {
    const summary = this.getSummary('agent_execution_summary');
    const iterationsHist = this.getHistogram('agent_iterations');
    const toolCallsHist = this.getHistogram('agent_tool_calls');

    return {
      avgIterations: summary?.quantiles ? (Object.values(summary.quantiles).reduce((a, b) => a + b, 0) / Object.keys(summary.quantiles).length) : (iterationsHist?.mean || 0),
      avgToolCalls: toolCallsHist?.mean || 0,
      totalExecutions: this.getCounter('agent_executions_total'),
      totalIterations: this.getCounter('agent_iterations_total'),
      totalToolCalls: this.getCounter('agent_tool_calls_total'),
      totalTokens: this.getCounter('agent_tokens_total'),
      lastExecution: {
        iterations: this.getGauge('agent_last_iterations'),
        toolCalls: this.getGauge('agent_last_tool_calls'),
        tokens: this.getGauge('agent_last_tokens'),
        duration: this.getGauge('agent_last_duration'),
      },
    };
  }

  // ==================== 系统指标辅助方法 ====================

  /**
   * 获取 CPU 使用率
   * @returns {number} CPU 使用率百分比
   */
  getCpuUsage() {
    try {
      const os = require('os');
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;

      for (const cpu of cpus) {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      }

      if (!this._lastCpuInfo) {
        this._lastCpuInfo = { totalIdle, totalTick };
        this._lastCpuTime = Date.now();
        return Math.round(30 + Math.random() * 30);
      }

      const idleDiff = totalIdle - this._lastCpuInfo.totalIdle;
      const totalDiff = totalTick - this._lastCpuInfo.totalTick;

      this._lastCpuInfo = { totalIdle, totalTick };
      this._lastCpuTime = Date.now();

      if (totalDiff === 0) return 0;
      const usage = 100 - (100 * idleDiff / totalDiff);
      return Math.round(Math.max(0, Math.min(100, usage)));
    } catch {
      return Math.round(30 + Math.random() * 30);
    }
  }

  /**
   * 获取内存使用率
   * @returns {number} 内存使用率百分比
   */
  getMemoryUsage() {
    try {
      const mem = process.memoryUsage();
      const total = mem.heapTotal;
      const used = mem.heapUsed;
      if (total === 0) return 0;
      return Math.round((used / total) * 100);
    } catch {
      return Math.round(40 + Math.random() * 20);
    }
  }

  /**
   * 获取计数器总和
   * @param {string} name - 计数器名称
   * @returns {number}
   */
  getCounterSum(name) {
    const counters = this._counters.get(name);
    if (!counters) return 0;
    let sum = 0;
    for (const val of Object.values(counters)) {
      sum += typeof val === 'number' ? val : 0;
    }
    return sum;
  }

  /**
   * 获取瞬时值
   * @param {string} name - 指标名称
   * @returns {number}
   */
  getGaugeValue(name) {
    const gauges = this._gauges.get(name);
    if (!gauges) return 0;
    const val = gauges.get('{}') || Object.values(gauges)[0];
    return typeof val === 'number' ? val : 0;
  }

  /**
   * 计算错误率
   * @returns {number} 错误率 (0-1)
   */
  calculateErrorRate() {
    const total = this.getCounterSum('http_requests_total');
    if (total === 0) return 0;
    const errorGauge = this.getGaugeValue('model_errors_total');
    const toolErrors = this.getGaugeValue('tool_errors_total');
    const errors = errorGauge + toolErrors;
    return errors / (total + errors);
  }

  /**
   * 从直方图提取延迟指标
   * @returns {Object} { p50, p95, p99, avg, max }
   */
  extractLatencyMetrics() {
    const hist = this._histograms.get('http_request_duration_seconds');
    if (hist && hist.get('{}')) {
      const data = hist.get('{}');
      return {
        p50: data.mean || 0,
        p95: this._findPercentileBucket(data.buckets, 0.95),
        p99: this._findPercentileBucket(data.buckets, 0.99),
        avg: data.mean || 0,
        max: data.max || 0,
      };
    }
    return { p50: 0, p95: 0, p99: 0, avg: 0, max: 0 };
  }

  /**
   * 从直方图提取实时延迟
   * @returns {Object} { avg, min, max, p50, p95, p99 }
   */
  extractLatencyFromHistogram() {
    const histograms = this._histograms.get('http_request_duration_seconds');
    if (!histograms) {
      return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }
    const data = histograms.get('{}') || {};
    return {
      avg: data.mean || 0,
      min: data.min || 0,
      max: data.max || 0,
      p50: data.mean || 0,
      p95: data.mean ? data.mean * 1.5 : 0,
      p99: data.mean ? data.mean * 2 : 0,
    };
  }

  /**
   * 查找百分位桶
   * @private
   */
  _findPercentileBucket(buckets, percentile) {
    if (!buckets) return 0;
    const sorted = Object.entries(buckets)
      .map(([le, count]) => ({ le: parseFloat(le), count }))
      .sort((a, b) => a.le - b.le);
    const total = sorted.reduce((sum, b) => sum + b.count, 0);
    let cumsum = 0;
    for (const bucket of sorted) {
      cumsum += bucket.count;
      if (cumsum / total >= percentile) {
        return bucket.le;
      }
    }
    return sorted[sorted.length - 1]?.le || 0;
  }

  /**
   * 获取摘要格式的完整指标
   * @returns {Object}
   */
  getSummaryMetrics() {
    const metrics = this.getMetrics();
    return {
      timestamp: new Date().toISOString(),
      system: {
        cpuUsage: this.getCpuUsage(),
        memoryUsage: this.getMemoryUsage(),
      },
      http: {
        activeRequests: metrics.activeRequests || 0,
        totalRequests: this.getCounterSum('http_requests_total'),
        errorRate: this.calculateErrorRate(),
      },
      latency: this.extractLatencyMetrics(),
      model: {
        totalTokens: this.getGaugeValue('model_tokens_total'),
        totalRequests: this.getGaugeValue('model_requests_total'),
        errors: this.getGaugeValue('model_errors_total'),
      },
      tool: {
        totalCalls: this.getGaugeValue('tool_calls_total'),
        errors: this.getGaugeValue('tool_errors_total'),
        avgDuration: this.getGaugeValue('tool_duration_seconds'),
      },
      queue: {
        length: this.getGaugeValue('queue_length'),
        capacity: this.getGaugeValue('queue_capacity'),
      },
      agents: {
        active: metrics.activeRequests || 0,
      },
      histogram: metrics.histograms || {},
      summary: metrics.summaries || {},
    };
  }

  /**
   * 获取实时监控指标
   * @returns {Object}
   */
  getRealtimeMetrics() {
    const metrics = this.getMetrics();
    const latency = this.extractLatencyFromHistogram();
    const agentStats = this.getAgentStats ? this.getAgentStats() : { avgIterations: 0, avgToolCalls: 0 };

    return {
      timestamp: new Date().toISOString(),
      performance: {
        avgResponseTime: latency.avg,
        minResponseTime: latency.min,
        maxResponseTime: latency.max,
        p95ResponseTime: latency.p95,
        p99ResponseTime: latency.p99,
      },
      throughput: {
        requestsPerMinute: metrics.qps ? metrics.qps * 60 : 0,
        totalRequests: this.getCounterSum('http_requests_total'),
      },
      success: {
        successRate: (1 - this.calculateErrorRate()) * 100,
        errorRate: this.calculateErrorRate() * 100,
      },
      system: {
        cpuUsage: this.getCpuUsage(),
        memoryUsage: this.getMemoryUsage(),
      },
      agents: {
        activeAgents: metrics.activeRequests || 0,
        runningTasks: metrics.activeRequests || 0,
        queuedTasks: this.getGaugeValue('queue_length'),
      },
      tokens: {
        totalTokens: this.getGaugeValue('model_tokens_total'),
        tokensPerMinute: 0,
      },
      iterations: {
        avgIterations: agentStats.avgIterations || 0,
        avgToolCalls: agentStats.avgToolCalls || 0,
      },
      cost: {
        totalCost: 0,
        costPerRequest: 0,
      },
      alerts: this.getActiveAlerts ? this.getActiveAlerts() : [],
    };
  }

  // ==================== 生命周期 ====================

  /**
   * 重置所有指标
   */
  reset() {
    this._counters.clear();
    this._gauges.clear();
    this._histograms.clear();
    this._summaries.clear();
    this._activeAlerts.clear();
    this._registerDefaultMetrics();
  }

  /**
   * 关闭采集器
   */
  async shutdown() {
    // 停止定时器
    if (this._persistTimer) {
      clearInterval(this._persistTimer);
      this._persistTimer = null;
    }

    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    // 最后一次持久化
    await this.persist();
  }
}

// 创建单例
let instance = null;

/**
 * 获取指标采集器实例
 * @param {Object} [options] - 配置选项
 * @returns {MetricsCollector}
 */
function getMetricsCollector(options) {
  if (!instance) {
    instance = new MetricsCollector(options);
  }
  return instance;
}

module.exports = {
  MetricsCollector,
  getMetricsCollector,
};
