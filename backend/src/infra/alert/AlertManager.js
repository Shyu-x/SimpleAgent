/**
 * 告警管理器 - 企业级告警规则管理和触发
 * @description 支持多级别告警 (critical/warning/info)、规则注册、webhook 通知
 *
 * 告警级别说明：
 * - critical: 严重告警，需要立即处理（如服务宕机）
 * - warning: 警告告警，需要关注（如性能下降）
 * - info: 信息告警，仅供参考（如配置变更）
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

const https = require('https');
const http = require('http');
const url = require('url');
const { createLogger } = require('../logger/AgentLogger');

const logger = createLogger('alertManager');

class AlertManager {
  /**
   * 告警级别定义
   */
  static LEVELS = {
    CRITICAL: 'critical',
    WARNING: 'warning',
    INFO: 'info',
  };

  /**
   * 告警状态定义
   */
  static STATUS = {
    FIRING: 'firing',
    RESOLVED: 'resolved',
    ACKNOWLEDGED: 'acknowledged',
    SUPPRESSED: 'suppressed',
  };

  /**
   * 告警级别优先级（数值越大优先级越高）
   */
  static LEVEL_PRIORITY = {
    [AlertManager.LEVELS.INFO]: 1,
    [AlertManager.LEVELS.WARNING]: 2,
    [AlertManager.LEVELS.CRITICAL]: 3,
  };

  /**
   * 创建告警管理器实例
   * @param {Object} options - 配置选项
   * @param {number} [options.retentionDays=30] - 告警保留天数
   * @param {Object} [options.webhooks] - webhook 配置
   * @param {string} [options.webhooks.critical] - 严重告警 webhook URL
   * @param {string} [options.webhooks.warning] - 警告告警 webhook URL
   * @param {string} [options.webhooks.info] - 信息告警 webhook URL
   * @param {string} [options.webhooks.all] - 所有告警 webhook URL
   * @param {Function} [options.onAlert] - 告警回调 (alert) => void
   * @param {Function} [options.onResolve] - 解决回调 (alert) => void
   */
  constructor(options = {}) {
    // 配置
    this.retentionDays = options.retentionDays ?? 30;
    this.webhooks = options.webhooks || {};
    this.onAlert = options.onAlert || (() => {});
    this.onResolve = options.onResolve || (() => {});

    // 内部存储
    this._rules = new Map();           // 告警规则: { ruleId: rule }
    this._alerts = new Map();          // 活跃告警: { alertId: alert }
    this._alertHistory = [];           // 告警历史
    this._metricsCollector = null;     // 关联的指标采集器

    // 静默规则
    this._silenceRules = new Map();    // 静默规则: { id: silenceRule }

    // 抑制规则
    this._inhibitionRules = [];       // 抑制规则列表

    // 统计
    this._stats = {
      totalFired: 0,
      totalResolved: 0,
      byLevel: {
        [AlertManager.LEVELS.CRITICAL]: { fired: 0, resolved: 0 },
        [AlertManager.LEVELS.WARNING]: { fired: 0, resolved: 0 },
        [AlertManager.LEVELS.INFO]: { fired: 0, resolved: 0 },
      },
    };

    // 健康检查定时器
    this._healthCheckTimer = null;
    this._startHealthCheck();
  }

  // ==================== 规则管理 ====================

  /**
   * 注册告警规则
   * @param {Object} rule - 告警规则
   * @param {string} rule.id - 规则ID（唯一标识）
   * @param {string} rule.name - 规则名称
   * @param {string} rule.description - 规则描述
   * @param {string} rule.level - 告警级别 (critical/warning/info)
   * @param {string} rule.source - 数据源类型 (metrics/custom)
   * @param {string} [rule.metric] - 监控的指标名称（当 source=metrics 时）
   * @param {Object} [rule.labels] - 标签过滤器
   * @param {string} rule.condition - 比较条件 (>, <, >=, <=, ==, !=)
   * @param {number} rule.threshold - 阈值
   * @param {number} [rule.duration=0] - 持续时间（毫秒），0 表示立即触发
   * @param {number} [rule.cooldown=300000] - 冷却时间（毫秒），告警解决后再次触发的最小间隔
   * @param {Object} [rule.metadata] - 额外元数据
   * @param {Function} [rule.check] - 自定义检查函数 (metrics) => boolean（当 source=custom 时）
   * @returns {boolean} 是否注册成功
   */
  registerRule(rule) {
    if (!rule.id || !rule.name || !rule.level || !rule.source) {
      logger.error('规则注册失败：缺少必需字段', { rule });
      return false;
    }

    if (!AlertManager.LEVELS[rule.level.toUpperCase()]) {
      logger.error('规则注册失败：无效的告警级别', { level: rule.level });
      return false;
    }

    if (this._rules.has(rule.id)) {
      logger.warn('规则已存在，将被覆盖', { ruleId: rule.id });
    }

    // 合并默认配置
    const fullRule = {
      enabled: true,
      duration: 0,
      cooldown: 300000, // 5分钟
      labels: {},
      metadata: {},
      ...rule,
    };

    this._rules.set(rule.id, {
      ...fullRule,
      createdAt: new Date().toISOString(),
      lastTriggered: null,
      lastResolved: null,
      triggerCount: 0,
      currentState: 'ok', // ok/firing/pending
      pendingSince: null,
    });

    // 规则注册成功 - operational info
    return true;
  }

  /**
   * 批量注册规则
   * @param {Object[]} rules - 告警规则数组
   * @returns {Object} 注册结果 { success: number, failed: number }
   */
  registerRules(rules) {
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

  /**
   * 移除告警规则
   * @param {string} ruleId - 规则ID
   * @returns {boolean} 是否移除成功
   */
  removeRule(ruleId) {
    const deleted = this._rules.delete(ruleId);
    if (deleted) {
      // 规则已移除 - operational info
    }
    return deleted;
  }

  /**
   * 获取规则
   * @param {string} [ruleId] - 规则ID，不传则返回所有规则
   * @returns {Object|Map}
   */
  getRule(ruleId) {
    if (ruleId) {
      return this._rules.get(ruleId);
    }
    return Array.from(this._rules.values());
  }

  /**
   * 启用/禁用规则
   * @param {string} ruleId - 规则ID
   * @param {boolean} enabled - 是否启用
   * @returns {boolean}
   */
  setRuleEnabled(ruleId, enabled) {
    const rule = this._rules.get(ruleId);
    if (!rule) return false;

    rule.enabled = enabled;
    // 规则启用/禁用 - operational info
    return true;
  }

  // ==================== 告警触发 ====================

  /**
   * 检查指标是否触发告警
   * @param {Object} metrics - 指标数据
   * @returns {Object[]} 触发的告警列表
   */
  checkMetrics(metrics) {
    const firedAlerts = [];

    for (const [ruleId, rule] of this._rules) {
      if (!rule.enabled) continue;

      // 检查静默规则
      if (this._isSilenced(rule)) continue;

      // 根据数据源检查
      let triggered = false;
      let currentValue = null;

      if (rule.source === 'metrics' && rule.metric) {
        const result = this._checkMetricCondition(rule, metrics);
        triggered = result.triggered;
        currentValue = result.value;
      } else if (rule.source === 'custom' && typeof rule.check === 'function') {
        triggered = rule.check(metrics);
        currentValue = triggered ? 1 : 0;
      }

      // 更新规则状态
      this._updateRuleState(rule, triggered);

      // 如果触发且状态为 pending 或 firing，创建告警
      // pending 状态表示已达到持续时间要求
      // 但如果规则已经有活跃告警，不再创建新的（避免重复触发）
      if (triggered && (rule.currentState === 'pending' || rule.currentState === 'firing')) {
        // 检查冷却时间
        if (rule.lastResolved && Date.now() - rule.lastResolved < rule.cooldown) {
          continue;
        }

        // 检查是否已经有该规则的活跃告警
        const hasActiveAlert = Array.from(this._alerts.values()).some(
          (a) => a.ruleId === rule.id && a.status === AlertManager.STATUS.FIRING
        );
        if (hasActiveAlert && rule.currentState === 'firing') {
          // 已有活跃告警且状态为 firing，不再创建新的
          continue;
        }

        const alert = this._createAlert(rule, currentValue);
        this._alerts.set(alert.id, alert);
        this._alertHistory.push(alert);

        // 更新统计
        this._stats.totalFired++;
        this._stats.byLevel[rule.level].fired++;

        firedAlerts.push(alert);

        // 发送通知
        this.sendAlert(alert);

        // 告警触发 - operational info
      }
    }

    return firedAlerts;
  }

  /**
   * 检查指标条件
   * @param {Object} rule - 告警规则
   * @param {Object} metrics - 指标数据
   * @returns {Object} { triggered: boolean, value: number }
   * @private
   */
  _checkMetricCondition(rule, metrics) {
    // 获取指标值
    let metricValue = null;
    const labels = rule.labels || {};

    // 支持嵌套指标路径，如 "http_requests_total{method="GET"}"
    if (metrics.counters && metrics.counters[rule.metric]) {
      const counterData = metrics.counters[rule.metric];
      const key = Object.keys(counterData).find(
        (k) => k === '{}' || this._matchLabels(k, labels)
      );
      if (key) {
        metricValue = counterData[key];
      }
    } else if (metrics.gauges && metrics.gauges[rule.metric]) {
      const gaugeData = metrics.gauges[rule.metric];
      const key = Object.keys(gaugeData).find(
        (k) => k === '{}' || this._matchLabels(k, labels)
      );
      if (key) {
        metricValue = gaugeData[key];
      }
    } else if (metrics.histograms && metrics.histograms[rule.metric]) {
      const histogramData = metrics.histograms[rule.metric];
      const key = Object.keys(histogramData).find(
        (k) => k === '{}' || this._matchLabels(k, labels)
      );
      if (key) {
        metricValue = histogramData[key].mean || histogramData[key].count;
      }
    }

    if (metricValue === null) {
      return { triggered: false, value: null };
    }

    // 比较条件
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
      case '!=':
        triggered = metricValue !== rule.threshold;
        break;
    }

    return { triggered, value: metricValue };
  }

  /**
   * 匹配标签
   * @param {string} key - 标签键
   * @param {Object} filter - 过滤器标签
   * @returns {boolean}
   * @private
   */
  _matchLabels(key, filter) {
    if (!filter || Object.keys(filter).length === 0) return true;

    const labels = this._parseLabels(key);
    for (const [k, v] of Object.entries(filter)) {
      if (labels[k] !== v) return false;
    }
    return true;
  }

  /**
   * 解析标签字符串
   * @param {string} key - 标签键 (如 'method="GET",status="200"')
   * @returns {Object}
   * @private
   */
  _parseLabels(key) {
    if (!key || key === '{}') return {};
    const labels = {};
    const matches = key.matchAll(/(\w+)="([^"]*)"/g);
    for (const match of matches) {
      labels[match[1]] = match[2];
    }
    return labels;
  }

  /**
   * 更新规则状态
   * @param {Object} rule - 告警规则
   * @param {boolean} triggered - 是否触发
   * @private
   */
  _updateRuleState(rule, triggered) {
    if (triggered) {
      if (rule.currentState === 'ok') {
        rule.currentState = 'pending';
        rule.pendingSince = Date.now();
      } else if (rule.currentState === 'pending') {
        // 检查持续时间
        if (Date.now() - rule.pendingSince >= rule.duration) {
          rule.currentState = 'firing';
        }
      }
      rule.lastTriggered = Date.now();
    } else {
      rule.currentState = 'ok';
      rule.pendingSince = null;
    }
  }

  /**
   * 创建告警对象
   * @param {Object} rule - 告警规则
   * @param {number} value - 当前值
   * @returns {Object}
   * @private
   */
  _createAlert(rule, value) {
    // 获取该规则已创建的告警数量（用于避免重复触发）
    const ruleAlertCount = Array.from(this._alerts.values()).filter(a => a.ruleId === rule.id && a.status === AlertManager.STATUS.FIRING).length;

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
      status: AlertManager.STATUS.FIRING,
      firedAt: new Date().toISOString(),
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      resolvedBy: null,
      // 标记该告警是第几次触发（用于避免重复触发）
      _ruleAlertCount: ruleAlertCount,
    };
  }

  // ==================== 告警处理 ====================

  /**
   * 发送告警通知
   * @param {Object} alert - 告警对象
   * @returns {Promise<void>}
   */
  async sendAlert(alert) {
    // 调用回调
    this.onAlert(alert);

    // 发送 webhook
    await this._sendWebhooks(alert);
  }

  /**
   * 发送 webhook 通知
   * @param {Object} alert - 告警对象
   * @private
   */
  async _sendWebhooks(alert) {
    const webhookUrls = [];

    // 根据级别获取 webhook
    if (this.webhooks[alert.level]) {
      webhookUrls.push(this.webhooks[alert.level]);
    }

    // 添加通用 webhook
    if (this.webhooks.all) {
      webhookUrls.push(this.webhooks.all);
    }

    for (const webhookUrl of webhookUrls) {
      try {
        await this._sendWebhook(webhookUrl, alert);
      } catch (error) {
        logger.error('Webhook 发送失败', { url: webhookUrl, error: error.message });
      }
    }
  }

  /**
   * 发送 HTTP webhook 请求
   * @param {string} webhookUrl - webhook URL
   * @param {Object} payload - 请求体
   * @returns {Promise<void>}
   * @private
   */
  _sendWebhook(webhookUrl, payload) {
    return new Promise((resolve, reject) => {
      const parsed = url.parse(webhookUrl);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AlertManager/1.0',
        },
        timeout: 10000,
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Webhook 发送成功 - operational info
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

  /**
   * 获取活跃告警列表
   * @param {Object} [filter] - 过滤器
   * @param {string} [filter.level] - 按级别过滤
   * @param {string} [filter.status] - 按状态过滤
   * @param {string} [filter.ruleId] - 按规则ID过滤
   * @returns {Object[]}
   */
  getActiveAlerts(filter = {}) {
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

    // 按优先级和触发时间排序
    alerts.sort((a, b) => {
      const priorityDiff = AlertManager.LEVEL_PRIORITY[b.level] - AlertManager.LEVEL_PRIORITY[a.level];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.firedAt) - new Date(b.firedAt);
    });

    return alerts;
  }

  /**
   * 获取指定级别的告警数量
   * @returns {Object}
   */
  getAlertCounts() {
    const counts = {
      total: this._alerts.size,
      byLevel: {
        [AlertManager.LEVELS.CRITICAL]: 0,
        [AlertManager.LEVELS.WARNING]: 0,
        [AlertManager.LEVELS.INFO]: 0,
      },
      byStatus: {
        [AlertManager.STATUS.FIRING]: 0,
        [AlertManager.STATUS.ACKNOWLEDGED]: 0,
      },
    };

    for (const alert of this._alerts.values()) {
      counts.byLevel[alert.level]++;
      if (alert.status === AlertManager.STATUS.FIRING) {
        counts.byStatus[AlertManager.STATUS.FIRING]++;
      } else if (alert.status === AlertManager.STATUS.ACKNOWLEDGED) {
        counts.byStatus[AlertManager.STATUS.ACKNOWLEDGED]++;
      }
    }

    return counts;
  }

  /**
   * 确认告警
   * @param {string} alertId - 告警ID
   * @param {string} [acknowledgedBy='system'] - 确认人
   * @returns {boolean}
   */
  acknowledgeAlert(alertId, acknowledgedBy = 'system') {
    const alert = this._alerts.get(alertId);
    if (!alert) return false;

    alert.status = AlertManager.STATUS.ACKNOWLEDGED;
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = acknowledgedBy;

    // 告警已确认 - operational info
    return true;
  }

  /**
   * 解决告警
   * @param {string} alertId - 告警ID
   * @param {string} [resolvedBy='system'] - 解决人
   * @param {string} [reason] - 解决原因
   * @returns {boolean}
   */
  resolveAlert(alertId, resolvedBy = 'system', reason = '') {
    const alert = this._alerts.get(alertId);
    if (!alert) return false;

    alert.status = AlertManager.STATUS.RESOLVED;
    alert.resolvedAt = new Date().toISOString();
    alert.resolvedBy = resolvedBy;
    alert.resolutionReason = reason;

    // 从活跃告警中移除
    this._alerts.delete(alertId);

    // 更新规则状态
    const rule = this._rules.get(alert.ruleId);
    if (rule) {
      rule.lastResolved = Date.now();
      rule.currentState = 'ok';
      rule.triggerCount++;
    }

    // 更新统计
    this._stats.totalResolved++;
    this._stats.byLevel[alert.level].resolved++;

    // 调用回调
    this.onResolve(alert);

    // 告警已解决 - operational info
    return true;
  }

  /**
   * 解决指定规则的所有告警
   * @param {string} ruleId - 规则ID
   * @param {string} [resolvedBy='system'] - 解决人
   * @returns {number} 解决的告警数量
   */
  resolveByRule(ruleId, resolvedBy = 'system') {
    let count = 0;
    for (const [alertId, alert] of this._alerts) {
      if (alert.ruleId === ruleId) {
        this.resolveAlert(alertId, resolvedBy);
        count++;
      }
    }
    return count;
  }

  /**
   * 根据条件自动解决告警
   * @param {Object} metrics - 当前指标
   * @returns {Object[]} 已解决的告警列表
   */
  autoResolve(metrics) {
    const resolved = [];

    for (const [alertId, alert] of this._alerts) {
      const rule = this._rules.get(alert.ruleId);
      if (!rule) continue;

      // 检查条件是否仍然满足
      let stillTriggered = false;

      if (rule.source === 'metrics' && rule.metric) {
        const result = this._checkMetricCondition(rule, metrics);
        stillTriggered = result.triggered;
      } else if (rule.source === 'custom' && typeof rule.check === 'function') {
        stillTriggered = rule.check(metrics);
      }

      // 如果条件不再满足，自动解决
      if (!stillTriggered) {
        this.resolveAlert(alertId, 'auto', '条件不再满足');
        resolved.push(alert);
      }
    }

    return resolved;
  }

  // ==================== 静默规则 ====================

  /**
   * 添加静默规则
   * @param {Object} silenceRule - 静默规则
   * @param {string} silenceRule.id - 规则ID
   * @param {string} [silenceRule.ruleId] - 要静默的告警规则ID（空表示所有）
   * @param {string} [silenceRule.level] - 要静默的告警级别
   * @param {string} silenceRule.startsAt - 开始时间 (ISO 8601)
   * @param {string} silenceRule.endsAt - 结束时间 (ISO 8601)
   * @param {string} [silenceRule.createdBy='system'] - 创建人
   * @param {string} [silenceRule.reason] - 静默原因
   * @returns {boolean}
   */
  addSilenceRule(silenceRule) {
    if (!silenceRule.id || !silenceRule.startsAt || !silenceRule.endsAt) {
      return false;
    }

    this._silenceRules.set(silenceRule.id, {
      ...silenceRule,
      createdAt: new Date().toISOString(),
    });

    // 静默规则已添加 - operational info
    return true;
  }

  /**
   * 移除静默规则
   * @param {string} silenceId - 静默规则ID
   * @returns {boolean}
   */
  removeSilenceRule(silenceId) {
    return this._silenceRules.delete(silenceId);
  }

  /**
   * 检查规则是否被静默
   * @param {Object} rule - 告警规则
   * @returns {boolean}
   * @private
   */
  _isSilenced(rule) {
    const now = Date.now();

    for (const silence of this._silenceRules.values()) {
      const startsAt = new Date(silence.startsAt).getTime();
      const endsAt = new Date(silence.endsAt).getTime();

      // 检查时间范围
      if (now < startsAt || now > endsAt) continue;

      // 检查规则ID
      if (silence.ruleId && silence.ruleId !== rule.id) continue;

      // 检查级别
      if (silence.level && silence.level !== rule.level) continue;

      // 被静默
      return true;
    }

    return false;
  }

  /**
   * 获取活跃静默规则
   * @returns {Object[]}
   */
  getActiveSilences() {
    const now = Date.now();
    const active = [];

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

  /**
   * 启动健康检查定时器
   * @private
   */
  _startHealthCheck() {
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
    }

    // 每分钟检查一次
    this._healthCheckTimer = setInterval(() => {
      this._healthCheck();
    }, 60000);
  }

  /**
   * 执行健康检查
   * @private
   */
  _healthCheck() {
    // 清理过期的静默规则
    const now = Date.now();
    for (const [id, silence] of this._silenceRules) {
      const endsAt = new Date(silence.endsAt).getTime();
      if (now > endsAt) {
        this._silenceRules.delete(id);
      }
    }

    // 清理过期的告警历史
    const cutoffTime = now - this.retentionDays * 24 * 60 * 60 * 1000;
    this._alertHistory = this._alertHistory.filter(
      (alert) => new Date(alert.firedAt).getTime() > cutoffTime
    );
  }

  // ==================== 统计和报告 ====================

  /**
   * 获取告警统计
   * @returns {Object}
   */
  getStats() {
    return {
      ...this._stats,
      activeAlerts: this.getAlertCounts(),
      rulesCount: this._rules.size,
      enabledRulesCount: Array.from(this._rules.values()).filter((r) => r.enabled).length,
    };
  }

  /**
   * 获取告警历史
   * @param {Object} [options] - 查询选项
   * @param {number} [options.limit=100] - 返回数量限制
   * @param {string} [options.level] - 按级别过滤
   * @param {string} [options.ruleId] - 按规则ID过滤
   * @param {string} [options.startTime] - 开始时间
   * @param {string} [options.endTime] - 结束时间
   * @returns {Object[]}
   */
  getAlertHistory(options = {}) {
    let history = [...this._alertHistory];

    if (options.level) {
      history = history.filter((a) => a.level === options.level);
    }
    if (options.ruleId) {
      history = history.filter((a) => a.ruleId === options.ruleId);
    }
    if (options.startTime) {
      const start = new Date(options.startTime).getTime();
      history = history.filter((a) => new Date(a.firedAt).getTime() >= start);
    }
    if (options.endTime) {
      const end = new Date(options.endTime).getTime();
      history = history.filter((a) => new Date(a.firedAt).getTime() <= end);
    }

    // 按时间倒序
    history.sort((a, b) => new Date(b.firedAt) - new Date(a.firedAt));

    // 限制数量
    if (options.limit) {
      history = history.slice(0, options.limit);
    }

    return history;
  }

  /**
   * 生成告警报告
   * @param {number} [hours=24] - 报告时间范围（小时）
   * @returns {Object}
   */
  generateReport(hours = 24) {
    const startTime = Date.now() - hours * 60 * 60 * 1000;
    const relevantAlerts = this._alertHistory.filter(
      (a) => new Date(a.firedAt).getTime() >= startTime
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
          critical: relevantAlerts.filter((a) => a.level === AlertManager.LEVELS.CRITICAL).length,
          warning: relevantAlerts.filter((a) => a.level === AlertManager.LEVELS.WARNING).length,
          info: relevantAlerts.filter((a) => a.level === AlertManager.LEVELS.INFO).length,
        },
        resolved: relevantAlerts.filter((a) => a.status === AlertManager.STATUS.RESOLVED).length,
        firing: relevantAlerts.filter((a) => a.status === AlertManager.STATUS.FIRING).length,
      },
      topRules: this._getTopFiringRules(relevantAlerts, 10),
      stats: this.getStats(),
    };
  }

  /**
   * 获取触发最多的规则
   * @param {Object[]} alerts - 告警列表
   * @param {number} limit - 返回数量
   * @returns {Object[]}
   * @private
   */
  _getTopFiringRules(alerts, limit) {
    const ruleCounts = {};

    for (const alert of alerts) {
      if (!ruleCounts[alert.ruleId]) {
        ruleCounts[alert.ruleId] = {
          ruleId: alert.ruleId,
          ruleName: alert.ruleName,
          count: 0,
        };
      }
      ruleCounts[alert.ruleId].count++;
    }

    return Object.values(ruleCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // ==================== 关联指标采集器 ====================

  /**
   * 关联指标采集器
   * @param {Object} metricsCollector - MetricsCollector 实例
   */
  attachMetricsCollector(metricsCollector) {
    this._metricsCollector = metricsCollector;

    // 设置告警回调
    metricsCollector.onAlert = (metricAlert) => {
      // 将指标告警转换为系统告警
      // 收到指标告警 - operational info
    };
  }

  /**
   * 执行检查（由外部定时调用）
   * @returns {Object[]} 触发的告警列表
   */
  check() {
    if (!this._metricsCollector) {
      return [];
    }

    const metrics = this._metricsCollector.getMetrics();
    return this.checkMetrics(metrics);
  }

  // ==================== 生命周期 ====================

  /**
   * 关闭告警管理器
   */
  shutdown() {
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = null;
    }

    // AlertManager 已关闭 - operational info
  }
}

// 创建单例
let instance = null;

/**
 * 获取告警管理器实例
 * @param {Object} [options] - 配置选项
 * @returns {AlertManager}
 */
function getAlertManager(options) {
  if (!instance) {
    instance = new AlertManager(options);
  }
  return instance;
}

module.exports = {
  AlertManager,
  getAlertManager,
};
