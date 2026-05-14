/**
 * API Gateway Controller
 * 功能: 动态路由到各模块服务、健康检查、错误处理
 */

const express = require('express');
const http = require('http');
const { URL } = require('url');

const router = express.Router();

// ================================================
// 服务配置
// ================================================
const SERVICE_CONFIG = {
  order: {
    url: process.env.ORDER_SERVICE_URL || 'http://order-service:30001',
    timeout: 30000,
    retries: 3,
  },
  user: {
    url: process.env.USER_SERVICE_URL || 'http://user-service:30002',
    timeout: 30000,
    retries: 3,
  },
  payment: {
    url: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:30003',
    timeout: 30000,
    retries: 3,
  },
};

// ================================================
// 日志工具
// ================================================
const logger = {
  info: (msg, meta = {}) => {
    console.log(JSON.stringify({ level: 'info', msg, ...meta, timestamp: new Date().toISOString() }));
  },
  error: (msg, meta = {}) => {
    console.error(JSON.stringify({ level: 'error', msg, ...meta, timestamp: new Date().toISOString() }));
  },
  warn: (msg, meta = {}) => {
    console.warn(JSON.stringify({ level: 'warn', msg, ...meta, timestamp: new Date().toISOString() }));
  },
};

// ================================================
// 路由映射表
// ================================================
const ROUTE_MAP = {
  '/api/orders': 'order',
  '/api/order': 'order',
  '/api/users': 'user',
  '/api/user': 'user',
  '/api/payments': 'payment',
  '/api/payment': 'payment',
};

// ================================================
// 辅助函数
// ================================================

/**
 * 根据路径获取目标服务
 */
function getTargetService(path) {
  for (const [prefix, service] of Object.entries(ROUTE_MAP)) {
    if (path.startsWith(prefix)) {
      return service;
    }
  }
  return null;
}

/**
 * 创建代理请求
 */
function createProxyRequest(targetService, req, res) {
  const config = SERVICE_CONFIG[targetService];
  if (!config) {
    return null;
  }

  const targetUrl = new URL(req.url, config.url);
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      'X-Forwarded-For': req.ip || req.connection.remoteAddress,
      'X-Forwarded-Proto': 'https',
      'X-Gateway-Service': targetService,
      'X-Request-Id': req.headers['x-request-id'] || generateRequestId(),
    },
    timeout: config.timeout,
  };

  return options;
}

/**
 * 生成请求ID
 */
function generateRequestId() {
  return `gw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 代理请求到目标服务
 */
function proxyRequest(req, res, targetService) {
  return new Promise((resolve, reject) => {
    const options = createProxyRequest(targetService, req, res);
    if (!options) {
      reject(new Error('No target service configured'));
      return;
    }

    const proxyReq = http.request(options, (proxyRes) => {
      // 处理重定向
      if ([301, 302, 307, 308].includes(proxyRes.statusCode)) {
        res.setHeader('Location', proxyRes.headers.location);
        res.status(proxyRes.statusCode).end();
        resolve();
        return;
      }

      // 设置代理响应头
      res.setHeader('X-Response-From', targetService);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');

      // 流式传输响应
      res.status(proxyRes.statusCode);
      proxyRes.pipe(res);
      resolve();
    });

    // 超时处理
    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      logger.warn('Proxy request timeout', { targetService, path: req.url });
      if (!res.headersSent) {
        res.status(504).json({
          error: 'Gateway Timeout',
          message: `Service ${targetService} did not respond in time`,
          code: 'GATEWAY_TIMEOUT',
        });
      }
      reject(new Error('Request timeout'));
    });

    // 错误处理
    proxyReq.on('error', (err) => {
      logger.error('Proxy request error', {
        targetService,
        path: req.url,
        error: err.message,
      });
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Bad Gateway',
          message: `Failed to connect to ${targetService} service`,
          code: 'BAD_GATEWAY',
          details: err.message,
        });
      }
      reject(err);
    });

    // 发送请求体
    if (req.body && Object.keys(req.body).length > 0) {
      proxyReq.write(JSON.stringify(req.body));
    }

    proxyReq.end();
  });
}

// ================================================
// 中间件
// ================================================

/**
 * 请求日志中间件
 */
function requestLogger(req, res, next) {
  const requestId = generateRequestId();
  req.headers['x-request-id'] = requestId;

  const startTime = Date.now();
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.url,
    ip: req.ip,
  });

  res.on('finish', () => {
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.url,
      statusCode: res.statusCode,
      duration: Date.now() - startTime,
    });
  });

  next();
}

/**
 * CORS 中间件
 */
function corsMiddleware(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  next();
}

// ================================================
// 路由处理
// ================================================

/**
 * GET /health - 健康检查端点
 * 返回网关和各服务的健康状态
 */
router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    gateway: {
      status: 'up',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
    services: {},
  };

  // 检查各服务健康状态
  const serviceChecks = Object.entries(SERVICE_CONFIG).map(async ([name, config]) => {
    try {
      const response = await fetch(`${config.url}/health`, {
        method: 'GET',
        timeout: 5000,
      });
      health.services[name] = {
        status: response.ok ? 'up' : 'down',
        url: config.url,
      };
    } catch (err) {
      health.services[name] = {
        status: 'down',
        url: config.url,
        error: err.message,
      };
      health.status = 'degraded';
    }
  });

  await Promise.all(serviceChecks);

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /health/live - 存活探针 (Kubernetes)
 */
router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

/**
 * GET /health/ready - 就绪探针 (Kubernetes)
 */
router.get('/health/ready', async (req, res) => {
  const ready = Object.keys(SERVICE_CONFIG).every(async (name) => {
    const config = SERVICE_CONFIG[name];
    try {
      const response = await fetch(`${config.url}/health`, {
        method: 'GET',
        timeout: 3000,
      });
      return response.ok;
    } catch {
      return false;
    }
  });

  if (ready) {
    res.status(200).json({ status: 'ready' });
  } else {
    res.status(503).json({ status: 'not ready' });
  }
});

/**
 * GET /metrics - Prometheus 指标端点
 */
router.get('/metrics', (req, res) => {
  const metrics = [
    `# HELP gateway_requests_total Total number of requests`,
    `# TYPE gateway_requests_total counter`,
    `gateway_requests_total ${global.requestCount || 0}`,
    `# HELP gateway_uptime Gateway uptime in seconds`,
    `# TYPE gateway_uptime gauge`,
    `gateway_uptime ${process.uptime()}`,
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain');
  res.send(metrics);
});

/**
 * GET /routes - 查看所有路由配置
 */
router.get('/routes', (req, res) => {
  res.json({
    routes: ROUTE_MAP,
    services: Object.entries(SERVICE_CONFIG).map(([name, config]) => ({
      name,
      url: config.url,
      timeout: config.timeout,
    })),
  });
});

// ================================================
// 动态路由 - 代理到各微服务
// ================================================

/**
 * 动态代理中间件
 */
function dynamicProxy(req, res, next) {
  const targetService = getTargetService(req.path);

  if (!targetService) {
    next();
    return;
  }

  logger.info('Proxying request', {
    targetService,
    method: req.method,
    path: req.path,
  });

  proxyRequest(req, res, targetService).catch((err) => {
    logger.error('Proxy failed', { targetService, error: err.message });
  });
}

// ================================================
// 错误处理
// ================================================

/**
 * 404 处理
 */
router.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    code: 'ROUTE_NOT_FOUND',
    availableRoutes: Object.keys(ROUTE_MAP),
  });
});

/**
 * 全局错误处理
 */
router.use((err, req, res, next) => {
  logger.error('Gateway error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(err.status || 500).json({
    error: 'Internal Gateway Error',
    message: err.message,
    code: 'GATEWAY_ERROR',
  });
});

// ================================================
// 模块导出
// ================================================
module.exports = {
  router,
  requestLogger,
  corsMiddleware,
  dynamicProxy,
  SERVICE_CONFIG,
  ROUTE_MAP,
};
