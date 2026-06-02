/**
 * Prometheus 指标服务 - 提供符合 Prometheus 格式的指标收集和导出
 */

const express = require('express');
const MetricsCollector = require('../metrics/MetricsCollector');
const { normalizePath: utilsNormalizePath } = require('../../utils/pathUtils');
const { getStateValue } = require('../../utils/circuitStateUtils');
const { createLogger } = require('../logger/AgentLogger');

const logger = createLogger('prometheusService');

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

    logger.info('初始化完成');
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
   * 格式化标签字符串
   * @param {string} labels - 原始标签字符串
   * @returns {string} 格式化后的标签字符串
   * @private
   */
  _formatLabels(labels) {
    return labels === '{}' ? '' : `{${labels}}`;
  }

  /**
   * 输出 Counter 指标
   * @param {string} name - 指标名称
   * @param {string} help - 帮助文本
   * @param {Object} data - 指标数据
   * @private
   */
  _outputCounter(name, help, data) {
    const lines = [];
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} counter`);
    const counterData = data || {};
    for (const [labels, value] of Object.entries(counterData)) {
      lines.push(`${name}${this._formatLabels(labels)} ${value}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  /**
   * 输出 Histogram 指标
   * @param {string} name - 指标名称
   * @param {string} help - 帮助文本
   * @param {Object} data - 指标数据
   * @private
   */
  _outputHistogram(name, help, data) {
    const lines = [];
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} histogram`);
    const histogramData = data || {};
    for (const [labels, histogram] of Object.entries(histogramData)) {
      const labelStr = this._formatLabels(labels);
      lines.push(`${name}_count${labelStr} ${histogram.count}`);
      lines.push(`${name}_sum${labelStr} ${histogram.sum.toFixed(3)}`);
      const buckets = histogram.buckets || {};
      for (const [bucket, count] of Object.entries(buckets)) {
        const bucketLabel = labelStr ? `${labelStr},le="${bucket}"}` : `{le="${bucket}"}`;
        lines.push(`${name}_bucket${bucketLabel} ${count}`);
      }
    }
    lines.push('');
    return lines.join('\n');
  }

  /**
   * 输出 Gauge 指标
   * @param {string} name - 指标名称
   * @param {string} help - 帮助文本
   * @param {Object} data - 指标数据
   * @private
   */
  _outputGauge(name, help, data) {
    const lines = [];
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} gauge`);
    const gaugeData = data || {};
    for (const [labels, value] of Object.entries(gaugeData)) {
      const formattedValue = typeof value === 'object' ? JSON.stringify(value) : value;
      lines.push(`${name}${this._formatLabels(labels)} ${formattedValue}`);
    }
    lines.push('');
    return lines.join('\n');
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

    logger.info('HTTP 指标已注册');
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

    logger.info('业务指标已注册');
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
        path: utilsNormalizePath(req.path),
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
          path: utilsNormalizePath(req.path),
          status: res.statusCode.toString(),
        });
      });

      next();
    };
  }

  /**
   * 记录 HTTP 请求
   * @param {Object} info - 请求信息
   */
  recordHttpRequest(info) {
    if (!this._initialized) return;

    const { method, path, status, duration, module } = info;
    const normalizedPath = utilsNormalizePath(path);

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

    const metrics = this._metricsCollector.getMetrics();
    const lines = [];

    // Header
    lines.push(`# Prometheus metrics for AI Chat`);
    lines.push(`# Generated at: ${new Date().toISOString()}`);
    lines.push('');

    // HTTP 请求
    lines.push(this._outputCounter('http_requests_total', 'Total number of HTTP requests',
      metrics.counters?.http_requests_total));

    // HTTP 延迟直方图
    lines.push(this._outputHistogram('http_request_duration_seconds',
      'HTTP request duration in seconds',
      metrics.histograms?.http_request_duration_seconds));

    // 模块错误
    lines.push(this._outputGauge('module_errors_total', 'Number of errors by module',
      metrics.gauges?.module_errors_total));

    // 熔断器状态
    lines.push(this._outputGauge('circuit_breaker_state',
      'Circuit breaker state (0=closed, 1=open, 2=half_open)',
      metrics.gauges?.circuit_breaker_state));

    // 熔断器调用计数
    lines.push(this._outputCounter('circuit_breaker_calls_total',
      'Total number of circuit breaker calls',
      metrics.counters?.circuit_breaker_calls_total));

    // 限流指标
    lines.push(this._outputCounter('rate_limit_exceeded_total',
      'Total number of rate limit exceeded',
      metrics.counters?.rate_limit_exceeded_total));

    // 限流配额
    lines.push(this._outputGauge('rate_limit_current_quota',
      'Current rate limit quota usage',
      metrics.gauges?.rate_limit_current_quota));

    // Node.js 运行时指标
    lines.push(`# HELP nodejs_active_handles Number of active handles`);
    lines.push(`# TYPE nodejs_active_handles gauge`);
    lines.push(`nodejs_active_handles ${this._extractGaugeValue(metrics.gauges?.nodejs_active_handles)}`);
    lines.push('');

    lines.push(`# HELP nodejs_active_requests Number of active requests`);
    lines.push(`# TYPE nodejs_active_requests gauge`);
    lines.push(`nodejs_active_requests ${this._extractGaugeValue(metrics.gauges?.nodejs_active_requests)}`);
    lines.push('');

    lines.push(`# HELP http_requests_active Number of active HTTP requests`);
    lines.push(`# TYPE http_requests_active gauge`);
    lines.push(`http_requests_active ${this._extractGaugeValue(metrics.gauges?.http_requests_active)}`);
    lines.push('');

    // 模型指标
    lines.push(this._outputCounter('model_requests_total', 'Total number of model requests',
      metrics.counters?.model_requests_total));

    lines.push(`# HELP model_tokens_total Total number of tokens processed`);
    lines.push(`# TYPE model_tokens_total counter`);
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

    lines.push(`# HELP model_errors_total Total number of model errors`);
    lines.push(`# TYPE model_errors_total gauge`);
    lines.push(`model_errors_total ${this._extractGaugeValue(metrics.gauges?.model_errors_total)}`);
    lines.push('');

    // 工具指标
    lines.push(this._outputCounter('tool_calls_total', 'Total number of tool calls',
      metrics.counters?.tool_calls_total));

    lines.push(this._outputGauge('tool_errors_total', 'Total number of tool errors',
      metrics.gauges?.tool_errors_total));

    // Agent 指标
    lines.push(this._outputCounter('agent_executions_total', 'Total number of agent executions',
      metrics.counters?.agent_executions_total));

    lines.push(`# HELP agent_iterations_total Total number of agent iterations`);
    lines.push(`# TYPE agent_iterations_total counter`);
    lines.push(`agent_iterations_total ${metrics.counters?.agent_iterations_total || 0}`);
    lines.push('');

    // 队列指标
    lines.push(`# HELP queue_length Current queue length`);
    lines.push(`# TYPE queue_length gauge`);
    lines.push(`queue_length ${this._extractGaugeValue(metrics.gauges?.queue_length)}`);
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
      logger.info('指标采集', {
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