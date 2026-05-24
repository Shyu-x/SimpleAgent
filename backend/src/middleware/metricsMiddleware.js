/**
 * 指标收集中间件 - 追踪 HTTP 请求的性能指标并上报到 MetricsCollector 和 PrometheusService
 */

const { getMetricsCollector } = require('../infra/metrics');
const { normalizePath } = require('../utils/pathUtils');

// 功能路径映射（按路径长度降序排序，前缀长的优先匹配）
const FEATURE_MAP = {
  '/api/multiagent': 'multi_agent',
  '/api/agents': 'multi_agent',
  '/api/minimax/tts': 'voice_synthesis',
  '/api/minimax/image': 'image_generation',
  '/api/browser': 'browser_automation',
  '/api/qdrant': 'advanced_rag',
  '/api/chat': 'chat',
  '/api/search': 'search',
  '/api/rag': 'advanced_rag',
  '/api/mcp': 'mcp_tools',
  '/api/a2a': 'multi_agent',
  '/api/memory': 'memory',
  '/api/memories': 'memory',
};

const FEATURE_MAP_SORTED = Object.entries(FEATURE_MAP)
  .sort((a, b) => b[0].length - a[0].length);

const WRITE_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

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

    collector.startRequest(requestId, {
      method: req.method,
      endpoint: req.path || req.url.split('?')[0],
    });

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode || 200;
      const normalizedPath = normalizePath(req.path || req.url.split('?')[0]);

      collector.recordHistogram('http_request_duration_seconds', duration / 1000, {
        method: req.method,
        endpoint: normalizedPath,
      });

      collector.endRequest(requestId, statusCode);

      if (prometheusService) {
        prometheusService.recordHttpRequest({
          method: req.method,
          path: normalizedPath,
          status: statusCode,
          duration,
          module,
        });
      }

      if (gatewayService && statusCode >= 500) {
        collector.incGauge('module_errors_total', 1, {
          module,
          type: 'server_error',
        });
      }
    });

    // 检查网关降级状态
    if (gatewayService) {
      const isWriteOperation = WRITE_METHODS.includes(req.method);
      if (gatewayService.isReadOnlyMode() && isWriteOperation) {
        return sendDegradedResponse(res, 'DEGRADED-001', '服务降级中，仅支持读取操作', gatewayService);
      }

      const feature = extractFeature(req.path);
      if (feature && !gatewayService.isFeatureEnabled(feature)) {
        return sendDegradedResponse(res, 'DEGRADED-002', `功能 "${feature}" 因服务降级暂时不可用`, gatewayService);
      }

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
  for (const [prefix, feature] of FEATURE_MAP_SORTED) {
    if (path.startsWith(prefix)) {
      return feature;
    }
  }
  return null;
}

/**
 * 生成降级响应
 * @param {Object} res - Express response
 * @param {string} code - 错误码
 * @param {string} message - 错误消息
 * @param {Object} gatewayService - 网关服务
 */
function sendDegradedResponse(res, code, message, gatewayService) {
  return res.status(503).json({
    success: false,
    error: { code, message },
    degradation: gatewayService.getStatus(),
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  requestMetricsMiddleware,
  setPrometheusService,
  setGatewayService,
};