/**
 * 指标收集中间件
 * 追踪 HTTP 请求的性能指标并上报到 MetricsCollector
 */

const { getMetricsCollector } = require('../infra/metrics');

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

      // 记录直方图（延迟）
      collector.recordHistogram('http_request_duration_seconds', duration / 1000, {
        method: req.method,
        endpoint: req.path || req.url.split('?')[0],
      });

      // 记录请求结束
      collector.endRequest(requestId, statusCode);

      // 调用原始 end 方法
      return originalEnd.apply(this, args);
    };

    next();
  };
}

module.exports = {
  requestMetricsMiddleware,
};
