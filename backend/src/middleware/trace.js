/**
 * Trace ID 中间件
 * 为每个请求生成唯一 Trace ID，跟踪全链路
 */

const crypto = require('crypto');

/**
 * 生成短UUID
 */
function generateTraceId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Trace 中间件
 */
function traceMiddleware(options = {}) {
  const { headerName = 'X-Trace-Id', propagate = true } = options;

  return (req, res, next) => {
    // 获取或生成 trace ID
    const traceId = req.headers[headerName.toLowerCase()] || generateTraceId();

    // 设置响应头
    res.setHeader(headerName, traceId);

    // 附加到请求对象
    req.traceId = traceId;

    // 创建日志上下文
    req.logContext = {
      traceId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path
    };

    // 传播给下游服务
    if (propagate && req.headers['x-trace-id']) {
      req.options = req.options || {};
      req.options.headers = {
        ...req.options.headers,
        [headerName]: traceId
      };
    }

    next();
  };
}

/**
 * 创建带 trace 的 fetch 包装
 */
function createTracedFetch(traceId) {
  return function tracedFetch(url, options = {}) {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'X-Trace-Id': traceId
      }
    });
  };
}

module.exports = {
  traceMiddleware,
  createTracedFetch,
  generateTraceId
};
