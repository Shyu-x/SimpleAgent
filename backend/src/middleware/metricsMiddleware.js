/**
 * 指标收集中间件
 * 追踪 HTTP 请求的性能指标并上报到 MetricsCollector 和 PrometheusService
 *
 * 功能：
 * - 请求计数 (http_requests_total)
 * - 请求延迟直方图 (http_request_duration_seconds)
 * - 请求开始/结束追踪
 * - 错误率自动上报
 * - 网关降级状态联动
 */

const { getMetricsCollector } = require('../infra/metrics');
const { normalizePath } = require('../utils/pathUtils');

let prometheusService = null;
let gatewayService = null;

/**
 * 设置 Prometheus 服务引用
 * @param {Object} promService - PrometheusService 实例
 */
function setPrometheusService(promService) {
  prometheusService = promService;
}

/**
 * 设置网关服务引用
 * @param {Object} gwService - GatewayService 实例
 */
function setGatewayService(gwService) {
  gatewayService = gwService;
}

/**
 * 请求指标收集中间件
 * 使用方式: app.use(requestMetricsMiddleware());
 */
function requestMetricsMiddleware() {
  return (req, res, next) => {
    const collector = getMetricsCollector();
    if (!collector) {
      return next();
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    const module = req.headers['x-module'] || 'unknown';

    // 记录请求开始
    collector.startRequest(requestId, {
      method: req.method,
      endpoint: req.path || req.url.split('?')[0],
    });

    // 拦截响应完成
    const originalEnd = res.end;
    res.end = function(...args) {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode || 200;
      const normalizedPath = normalizePath(req.path || req.url.split('?')[0]);

      // 记录直方图（延迟）
      collector.recordHistogram('http_request_duration_seconds', duration / 1000, {
        method: req.method,
        endpoint: normalizedPath,
      });

      // 记录请求结束
      collector.endRequest(requestId, statusCode);

      // 上报到 Prometheus 服务
      if (prometheusService) {
        prometheusService.recordHttpRequest({
          method: req.method,
          path: normalizedPath,
          status: statusCode,
          duration,
          module,
        });
      }

      // 上报错误到网关服务
      if (gatewayService && statusCode >= 500) {
        collector.incGauge('module_errors_total', 1, {
          module,
          type: 'server_error',
        });
      }

      // 调用原始 end 方法
      return originalEnd.apply(this, args);
    };

    // 检查网关降级状态 - 如果是只读模式且请求为写操作
    if (gatewayService) {
      const isWriteOperation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
      if (gatewayService.isReadOnlyMode() && isWriteOperation) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'DEGRADED-001',
            message: '服务降级中，仅支持读取操作',
          },
          degradation: gatewayService.getStatus(),
          timestamp: new Date().toISOString(),
        });
      }

      // 检查特定功能是否被降级禁用
      const feature = extractFeature(req.path);
      if (feature && !gatewayService.isFeatureEnabled(feature)) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'DEGRADED-002',
            message: `功能 "${feature}" 因服务降级暂时不可用`,
          },
          degradation: gatewayService.getStatus(),
          timestamp: new Date().toISOString(),
        });
      }

      // 应用超时倍数
      const timeoutMultiplier = gatewayService.getTimeoutMultiplier();
      if (timeoutMultiplier > 1) {
        req.setTimeout(req.timeout * timeoutMultiplier);
      }
    }

    next();
  };
}

/**
 * 从请求路径提取功能标识
 * @param {string} path - 请求路径
 * @returns {string|null}
 */
function extractFeature(path) {
  const featureMap = {
    '/api/chat': 'chat',
    '/api/search': 'search',
    '/api/rag': 'advanced_rag',
    '/api/qdrant': 'advanced_rag',
    '/api/browser': 'browser_automation',
    '/api/mcp': 'mcp_tools',
    '/api/a2a': 'multi_agent',
    '/api/multiagent': 'multi_agent',
    '/api/agents': 'multi_agent',
    '/api/minimax/image': 'image_generation',
    '/api/minimax/tts': 'voice_synthesis',
    '/api/minimax': 'minimax_api',
    '/api/memory': 'memory',
    '/api/memories': 'memory',
  };

  // 优化：按长度降序排列，前缀长的优先匹配
  const sortedEntries = Object.entries(featureMap).sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, feature] of sortedEntries) {
    if (path.startsWith(prefix)) {
      return feature;
    }
  }
  return null;
}

module.exports = {
  requestMetricsMiddleware,
  setPrometheusService,
  setGatewayService,
};