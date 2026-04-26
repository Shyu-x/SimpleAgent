/**
 * 安全中间件
 * 提供请求验证、XSS防护、速率限制、API Key验证和角色权限控制等安全功能
 */

const rateLimit = new Map();

// IP 速率限制 (简单的内存实现)
const RATE_LIMIT_WINDOW = 60 * 1000; // 1分钟
const MAX_REQUESTS_PER_WINDOW = 100;

// API Key 配置
const API_KEYS = new Map();
// 角色权限配置
const ROLES = {
  admin: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  user: ['GET', 'POST'],
  guest: ['GET'],
};

// 默认角色
const DEFAULT_ROLE = process.env.DEFAULT_ROLE || 'guest';
// 必需 API Key 的路径
const PROTECTED_PATHS = [
  '/api/qdrant/collections',
  '/api/qdrant/documents',
  '/api/admin',
];

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

/**
 * API Key 验证中间件
 * 检查 X-API-Key 头并验证权限
 */
function apiKeyMiddleware(req, res, next) {
  // 检查是否需要 API Key
  const path = req.path;
  const needsApiKey = PROTECTED_PATHS.some(p => path.startsWith(p));

  if (!needsApiKey) {
    return next();
  }

  const apiKey = req.headers['x-api-key'];

  // 如果没有 API Key 且未配置则放行 (开发模式)
  if (!apiKey && API_KEYS.size === 0) {
    req.role = DEFAULT_ROLE;
    return next();
  }

  // 检查 API Key 是否有效
  if (!apiKey) {
    return res.status(401).json({
      error: 'Unauthorized: Missing API Key',
      code: 'MISSING_API_KEY',
      hint: '请在请求头中添加 X-API-Key',
    });
  }

  const keyInfo = API_KEYS.get(apiKey);
  if (!keyInfo) {
    return res.status(403).json({
      error: 'Forbidden: Invalid API Key',
      code: 'INVALID_API_KEY',
    });
  }

  // 检查 API Key 是否过期
  if (keyInfo.expires && Date.now() > keyInfo.expires) {
    return res.status(403).json({
      error: 'Forbidden: API Key expired',
      code: 'API_KEY_EXPIRED',
    });
  }

  // 设置角色信息
  req.role = keyInfo.role;
  req.apiKeyId = keyInfo.id;
  next();
}

/**
 * 角色权限中间件
 * 基于角色的访问控制 (RBAC)
 *
 * @param {string[]} allowedRoles - 允许访问的角色列表
 */
function roleMiddleware(allowedRoles) {
  return (req, res, next) => {
    const userRole = req.role || DEFAULT_ROLE;

    // admin 角色拥有所有权限
    if (userRole === 'admin' || allowedRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      error: 'Forbidden: Insufficient permissions',
      code: 'INSUFFICIENT_ROLE',
      required: allowedRoles,
      current: userRole,
    });
  };
}

/**
 * 速率限制配置化中间件
 * 根据路径和角色应用不同的限流策略
 */
function configurableRateLimitMiddleware(req, res, next) {
  const path = req.path;
  const role = req.role || DEFAULT_ROLE;

  // 根据路径确定限流参数
  let maxRequests, windowMs;

  if (path.startsWith('/api/qdrant/collections') && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // 管理接口: 10请求/分钟
    maxRequests = 10;
    windowMs = 60 * 1000;
  } else if (path.startsWith('/api/qdrant/documents/batch')) {
    // 批量操作: 5请求/分钟
    maxRequests = 5;
    windowMs = 60 * 1000;
  } else if (path.startsWith('/api/qdrant/search') || path.startsWith('/api/qdrant/documents')) {
    // 检索接口: 60请求/分钟
    maxRequests = role === 'admin' ? 200 : (role === 'user' ? 120 : 60);
    windowMs = 60 * 1000;
  } else if (path.startsWith('/api/admin')) {
    // 管理后台: 30请求/分钟
    maxRequests = 30;
    windowMs = 60 * 1000;
  } else {
    // 默认: 100请求/分钟
    maxRequests = MAX_REQUESTS_PER_WINDOW;
    windowMs = RATE_LIMIT_WINDOW;
  }

  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const key = `${ip}:${path}`;

  if (!rateLimit.has(key)) {
    rateLimit.set(key, { count: 1, windowStart: now });
    return next();
  }

  const record = rateLimit.get(key);

  // 重置窗口
  if (now - record.windowStart > windowMs) {
    record.count = 1;
    record.windowStart = now;
    return next();
  }

  // 检查限制
  if (record.count >= maxRequests) {
    return res.status(429).json({
      error: '请求过于频繁，请稍后再试',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((record.windowStart + windowMs - now) / 1000),
      limit: maxRequests,
      window: windowMs / 1000,
    });
  }

  record.count++;
  next();
}

/**
 * 注册 API Key
 * @param {string} key - API Key
 * @param {string} role - 角色 (admin/user/guest)
 * @param {number} expiresIn - 过期时间(毫秒), 0 表示永不过期
 */
function registerApiKey(key, role = 'user', expiresIn = 0) {
  const id = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  API_KEYS.set(key, {
    id,
    role,
    created: Date.now(),
    expires: expiresIn > 0 ? Date.now() + expiresIn : null,
  });
  return id;
}

/**
 * 移除 API Key
 */
function removeApiKey(key) {
  return API_KEYS.delete(key);
}

/**
 * 获取所有 API Key 信息 (不包含密钥本身)
 */
function listApiKeys() {
  const keys = [];
  for (const [key, info] of API_KEYS.entries()) {
    keys.push({
      id: info.id,
      role: info.role,
      created: info.created,
      expires: info.expires,
      active: !info.expires || Date.now() < info.expires,
    });
  }
  return keys;
}

// 初始化默认 API Key (仅在设置了环境变量时)
if (process.env.QDRANT_API_KEY) {
  registerApiKey(process.env.QDRANT_API_KEY, 'admin');
}

module.exports = {
  rateLimitMiddleware,
  inputLimitMiddleware,
  corsMiddleware,
  securityHeadersMiddleware,
  apiKeyMiddleware,
  roleMiddleware,
  configurableRateLimitMiddleware,
  registerApiKey,
  removeApiKey,
  listApiKeys,
  ROLES,
};