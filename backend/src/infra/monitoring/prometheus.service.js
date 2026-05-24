/**
 * Prometheus 指标服务
 * @description 提供符合 Prometheus 格式的指标收集和导出
 *
 * 核心指标：
 * - http_requests_total (Counter) - HTTP 请求总数
 * - http_request_duration_seconds (Histogram) - HTTP 请求延迟
 * - module_errors_total (Gauge) - 各模块错误数
 * - circuit_breaker_state (Gauge) - 熔断器状态
 *
 * @author AI Chat 玩具团队
 * @date 2026-05-13
 */

const express = require('express');
const MetricsCollector = require('../metrics/MetricsCollector');
const { normalizePath: utilsNormalizePath } = require('../../utils/pathUtils');
const { getStateValue } = require('../../utils/circuitStateUtils');

/**
 * Prometheus 指标服务
 */
class PrometheusService {
  constructor(options = {}) {
    this.port = options.port || 9090;
    this.path = options.path || '/metrics';
    this._metricsCollector = null;
    this._server = null;
    this._initialized = false;
  }

  /**
   * 初始化指标服务
   * @param {Object} metricsCollector - 指标采集器实例
   */
  initialize(metricsCollector) {
    this._metricsCollector = metricsCollector;
    this._initialized = true;

    // 注册 HTTP 相关指标
    this._registerHttpMetrics();

    // 注册业务相关指标
    this._registerBusinessMetrics();

    console.log('[PrometheusService] 初始化完成');
  }

  /**
   * 提取 Gauge 值（兼容对象和数字格式）
   * @param {*} gauge - Gauge 值
   * @returns {number}
   * @private
   */
  _extractGaugeValue(gauge) {
    if (typeof gauge === 'object' && gauge !== null) {
      const vals = Object.values(gauge);
      return vals[0] || 0;
    }
    return typeof gauge === 'number' ? gauge : 0;
  }

  /**
   * 注册 HTTP 指标
   * @private
   */
  _registerHttpMetrics() {
    if (!this._metricsCollector) return;

    // HTTP 请求总数 - Counter
    // 标签: method, path, status, module

    // HTTP 请求延迟 - Histogram
    // 标签: method, path, module

    // 活跃请求数 - Gauge
    // 标签: module

    console.log('[PrometheusService] HTTP 指标已注册');
  }

  /**
   * 注册业务指标
   * @private
   */
  _registerBusinessMetrics() {
    if (!this._metricsCollector) return;

    // 模型错误数 - Gauge
    this._metricsCollector.setGauge('model_errors_total', 0, { model: 'minimax' });

    // 工具错误数 - Gauge
    this._metricsCollector.setGauge('tool_errors_total', 0, { tool: 'unknown' });

    // 熔断器状态 - Gauge
    this._metricsCollector.setGauge('circuit_breaker_state', 0, { circuit: 'default' });

    console.log('[PrometheusService] 业务指标已注册');
  }

  /**
   * 创建 Express 中间件
   * @returns {Function} Express 中间件
   */
  createMiddleware() {
    return (req, res, next) => {
      if (!this._initialized) {
        return next();
      }

      const startTime = Date.now();
      const requestId = req.headers['x-request-id'] || `req-${Date.now()}`;

      // 记录请求开始
      this._metricsCollector.startRequest(requestId, {
        method: req.method,
        path: this._normalizePath(req.path),
        module: req.headers['x-module'] || 'unknown',
      });

      // 使用 response finish 事件记录请求完成
      res.on('finish', () => {
        const duration = (Date.now() - startTime) / 1000;

        // 记录请求结束
        this._metricsCollector.endRequest(requestId, res.statusCode);

        // 记录延迟直方图
        this._metricsCollector.recordHistogram('http_request_duration_seconds', duration, {
          method: req.method,
          path: this._normalizePath(req.path),
          status: res.statusCode.toString(),
        });
      });

      next();
    };
  }

  /**
   * 标准化路径（去除动态参数）
   * @param {string} path - 请求路径
   * @returns {string} 标准化后的路径
   */
  _normalizePath(path) {
    return utilsNormalizePath(path);
  }

  /**
   * 记录 HTTP 请求
   * @param {Object} info - 请求信息
   */
  recordHttpRequest(info) {
    if (!this._initialized) return;

    const { method, path, status, duration, module } = info;
    const normalizedPath = this._normalizePath(path);

    // 增加请求计数器
    this._metricsCollector.incrementCounter('http_requests_total', {
      method,
      path: normalizedPath,
      status: status.toString(),
      module: module || 'unknown',
    });

    // 记录延迟
    this._metricsCollector.recordHistogram('http_request_duration_seconds', duration / 1000, {
      method,
      path: normalizedPath,
    });

    // 记录错误
    if (status >= 400) {
      this._metricsCollector.incGauge('module_errors_total', 1, {
        module: module || 'unknown',
        type: 'http_error',
      });
    }
  }

  /**
   * 记录模块错误
   * @param {string} module - 模块名
   * @param {string} type - 错误类型
   */
  recordModuleError(module, type = 'general') {
    if (!this._initialized) return;

    this._metricsCollector.incGauge('module_errors_total', 1, {
      module,
      type,
    });
  }

  /**
   * 更新熔断器状态
   * @param {string} circuitName - 熔断器名称
   * @param {string} state - 状态 (closed=0, open=1, half_open=2)
   */
  updateCircuitBreakerState(circuitName, state) {
    if (!this._initialized) return;

    const stateValue = getStateValue(state);

    this._metricsCollector.setGauge('circuit_breaker_state', stateValue, {
      circuit: circuitName,
    });
  }

  /**
   * 生成 Prometheus 格式输出
   * @returns {string} Prometheus 文本格式
   */
  generatePrometheusOutput() {
    if (!this._metricsCollector) {
      return this._generateEmptyMetrics();
    }

    const lines = [];
    const metrics = this._metricsCollector.getMetrics();

    // 添加时间戳注释
    lines.push(`# Prometheus metrics for AI Chat 玩具`);
    lines.push(`# Generated at: ${new Date().toISOString()}`);
    lines.push('');

    // ==================== HTTP 请求总数 (Counter) ====================
    lines.push('# HELP http_requests_total Total number of HTTP requests');
    lines.push('# TYPE http_requests_total counter');

    const httpRequestsTotal = metrics.counters?.http_requests_total || {};
    for (const [labels, value] of Object.entries(httpRequestsTotal)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`http_requests_total${labelStr} ${value}`);
    }
    lines.push('');

    // ==================== HTTP 请求延迟 (Histogram) ====================
    lines.push('# HELP http_request_duration_seconds HTTP request duration in seconds');
    lines.push('# TYPE http_request_duration_seconds histogram');

    const httpDuration = metrics.histograms?.http_request_duration_seconds || {};
    for (const [labels, data] of Object.entries(httpDuration)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`http_request_duration_seconds_count${labelStr} ${data.count}`);
      lines.push(`http_request_duration_seconds_sum${labelStr} ${data.sum.toFixed(3)}`);

      // 桶
      const buckets = data.buckets || {};
      for (const [bucket, count] of Object.entries(buckets)) {
        const bucketLabel = labelStr ? `${labelStr},le="${bucket}"}` : `{le="${bucket}"}`;
        lines.push(`http_request_duration_seconds_bucket${bucketLabel} ${count}`);
      }
    }
    lines.push('');

    // ==================== 模块错误数 (Gauge) ====================
    lines.push('# HELP module_errors_total Number of errors by module');
    lines.push('# TYPE module_errors_total gauge');

    const moduleErrors = metrics.gauges?.module_errors_total || {};
    for (const [labels, value] of Object.entries(moduleErrors)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`module_errors_total${labelStr} ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    }
    lines.push('');

    // ==================== 熔断器状态 (Gauge) ====================
    lines.push('# HELP circuit_breaker_state Circuit breaker state (0=closed, 1=open, 2=half_open)');
    lines.push('# TYPE circuit_breaker_state gauge');

    const circuitBreakerState = metrics.gauges?.circuit_breaker_state || {};
    for (const [labels, value] of Object.entries(circuitBreakerState)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`circuit_breaker_state${labelStr} ${value}`);
    }
    lines.push('');

    // ==================== 熔断器调用计数 (Counter) ====================
    lines.push('# HELP circuit_breaker_calls_total Total number of circuit breaker calls');
    lines.push('# TYPE circuit_breaker_calls_total counter');

    const circuitBreakerCalls = metrics.counters?.circuit_breaker_calls_total || {};
    for (const [labels, value] of Object.entries(circuitBreakerCalls)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`circuit_breaker_calls_total${labelStr} ${value}`);
    }
    lines.push('');

    // ==================== 限流指标 (Counter) ====================
    lines.push('# HELP rate_limit_exceeded_total Total number of rate limit exceeded');
    lines.push('# TYPE rate_limit_exceeded_total counter');

    const rateLimitExceeded = metrics.counters?.rate_limit_exceeded_total || {};
    for (const [labels, value] of Object.entries(rateLimitExceeded)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`rate_limit_exceeded_total${labelStr} ${value}`);
    }
    lines.push('');

    // ==================== 限流配额 (Gauge) ====================
    lines.push('# HELP rate_limit_current_quota Current rate limit quota usage');
    lines.push('# TYPE rate_limit_current_quota gauge');

    const rateLimitQuota = metrics.gauges?.rate_limit_current_quota || {};
    for (const [labels, value] of Object.entries(rateLimitQuota)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`rate_limit_current_quota${labelStr} ${value}`);
    }
    lines.push('');

    // ==================== Node.js 运行时指标 ====================
    lines.push('# HELP nodejs_active_handles Number of active handles');
    lines.push('# TYPE nodejs_active_handles gauge');
    const nodejsHandles = metrics.gauges?.nodejs_active_handles;
    lines.push(`nodejs_active_handles ${this._extractGaugeValue(nodejsHandles)}`);
    lines.push('');

    lines.push('# HELP nodejs_active_requests Number of active requests');
    lines.push('# TYPE nodejs_active_requests gauge');
    const nodejsRequests = metrics.gauges?.nodejs_active_requests;
    lines.push(`nodejs_active_requests ${this._extractGaugeValue(nodejsRequests)}`);
    lines.push('');

    // ==================== 活跃请求数 (Gauge) ====================
    lines.push('# HELP http_requests_active Number of active HTTP requests');
    lines.push('# TYPE http_requests_active gauge');
    const httpActive = metrics.gauges?.http_requests_active;
    lines.push(`http_requests_active ${this._extractGaugeValue(httpActive)}`);
    lines.push('');

    // ==================== 模型指标 ====================
    lines.push('# HELP model_requests_total Total number of model requests');
    lines.push('# TYPE model_requests_total counter');

    const modelRequests = metrics.counters?.model_requests_total || {};
    for (const [labels, value] of Object.entries(modelRequests)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`model_requests_total${labelStr} ${value}`);
    }
    lines.push('');

    lines.push('# HELP model_tokens_total Total number of tokens processed');
    lines.push('# TYPE model_tokens_total counter');
    // 尝试从 counter 获取实际 token 总数
    const modelTokensCounter = metrics.counters?.model_tokens_total;
    let modelTokensValue = 0;
    if (modelTokensCounter && typeof modelTokensCounter === 'object') {
      const vals = Object.values(modelTokensCounter);
      modelTokensValue = vals.reduce ? vals.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0) : (typeof vals[0] === 'number' ? vals[0] : 0);
    } else if (typeof modelTokensCounter === 'number') {
      modelTokensValue = modelTokensCounter;
    }
    lines.push(`model_tokens_total ${modelTokensValue}`);
    lines.push('');

    lines.push('# HELP model_errors_total Total number of model errors');
    lines.push('# TYPE model_errors_total gauge');
    const modelErrors = metrics.gauges?.model_errors_total;
    lines.push(`model_errors_total ${this._extractGaugeValue(modelErrors)}`);
    lines.push('');

    // ==================== 工具指标 ====================
    lines.push('# HELP tool_calls_total Total number of tool calls');
    lines.push('# TYPE tool_calls_total counter');

    const toolCalls = metrics.counters?.tool_calls_total || {};
    for (const [labels, value] of Object.entries(toolCalls)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`tool_calls_total${labelStr} ${value}`);
    }
    lines.push('');

    lines.push('# HELP tool_errors_total Total number of tool errors');
    lines.push('# TYPE tool_errors_total gauge');

    const toolErrors = metrics.gauges?.tool_errors_total || {};
    for (const [labels, value] of Object.entries(toolErrors)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`tool_errors_total${labelStr} ${value}`);
    }
    lines.push('');

    // ==================== Agent 指标 ====================
    lines.push('# HELP agent_executions_total Total number of agent executions');
    lines.push('# TYPE agent_executions_total counter');

    const agentExecutions = metrics.counters?.agent_executions_total || {};
    for (const [labels, value] of Object.entries(agentExecutions)) {
      const labelStr = labels === '{}' ? '' : `{${labels}}`;
      lines.push(`agent_executions_total${labelStr} ${value}`);
    }
    lines.push('');

    lines.push('# HELP agent_iterations_total Total number of agent iterations');
    lines.push('# TYPE agent_iterations_total counter');
    lines.push(`agent_iterations_total ${metrics.counters?.agent_iterations_total || 0}`);
    lines.push('');

    // ==================== 队列指标 ====================
    lines.push('# HELP queue_length Current queue length');
    lines.push('# TYPE queue_length gauge');
    const queueLen = metrics.gauges?.queue_length;
    lines.push(`queue_length ${this._extractGaugeValue(queueLen)}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 生成空指标
   * @private
   */
  _generateEmptyMetrics() {
    return `# No metrics available
# Timestamp: ${new Date().toISOString()}
`;
  }

  /**
   * 创建 Prometheus Express 路由
   * @returns {Router} Express 路由
   */
  createRouter() {
    const router = express.Router();

    // GET /metrics - Prometheus 抓取端点
    router.get('/', (req, res) => {
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(this.generatePrometheusOutput());
    });

    // GET /metrics/json - JSON 格式指标
    router.get('/json', (req, res) => {
      const metrics = this._metricsCollector?.getMetrics() || {};
      res.json({
        timestamp: new Date().toISOString(),
        metrics,
      });
    });

    // GET /metrics/summary - 摘要指标
    router.get('/summary', (req, res) => {
      const summary = this._metricsCollector?.getSummaryMetrics() || {};
      res.json(summary);
    });

    return router;
  }

  /**
   * 开始收集器自我收集（用于独立模式）
   * @param {http.Server} server - HTTP 服务器
   */
  startCollection(server) {
    // 启动 Prometheus 指标端点
    const metricsPath = this.path;
    server._prometheusRouter = this.createRouter();
    server._prometheusRouter(metricsPath, (req, res) => {
      // 已挂载
    });

    // 每分钟输出一次指标到日志
    setInterval(() => {
      console.log('[PrometheusService] 指标采集:', {
        timestamp: new Date().toISOString(),
        requests: this._metricsCollector?.getCounterSum('http_requests_total') || 0,
        errors: this._metricsCollector?.getGaugeValue('module_errors_total') || 0,
      });
    }, 60000);
  }

  /**
   * 获取指标采集器
   * @returns {MetricsCollector}
   */
  getMetricsCollector() {
    return this._metricsCollector;
  }
}

// 创建单例
let instance = null;

/**
 * 获取 Prometheus 服务实例
 * @param {Object} options - 配置选项
 * @returns {PrometheusService}
 */
function getPrometheusService(options) {
  if (!instance) {
    instance = new PrometheusService(options);
  }
  return instance;
}

module.exports = {
  PrometheusService,
  getPrometheusService,
};