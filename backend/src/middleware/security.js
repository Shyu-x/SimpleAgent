/**
 * 安全中间件
 * 提供请求验证、XSS防护、速率限制等安全功能
 */

const rateLimit = new Map();

// IP 速率限制 (简单的内存实现)
const RATE_LIMIT_WINDOW = 60 * 1000; // 1分钟
const MAX_REQUESTS_PER_WINDOW = 100;

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, { count: 1, windowStart: now });
    return next();
  }

  const record = rateLimit.get(ip);

  // 重置窗口
  if (now - record.windowStart > RATE_LIMIT_WINDOW) {
    record.count = 1;
    record.windowStart = now;
    return next();
  }

  // 检查限制
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: '请求过于频繁，请稍后再试',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((record.windowStart + RATE_LIMIT_WINDOW - now) / 1000),
    });
  }

  record.count++;
  next();
}

// 清理过期记录 (每5分钟)
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimit.entries()) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW * 2) {
      rateLimit.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// 输入长度限制
function inputLimitMiddleware(req, res, next) {
  const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);

  if (contentLength > MAX_BODY_SIZE) {
    return res.status(413).json({
      error: '请求体过大',
      code: 'PAYLOAD_TOO_LARGE',
      maxSize: '10MB',
    });
  }

  next();
}

// CORS 配置
function corsMiddleware(req, res, next) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:5173'];
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin) || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
}

// 安全响应头
function securityHeadersMiddleware(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.removeHeader('X-Powered-By');
  next();
}

module.exports = {
  rateLimitMiddleware,
  inputLimitMiddleware,
  corsMiddleware,
  securityHeadersMiddleware,
};