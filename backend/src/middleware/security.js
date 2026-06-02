/**
 * 安全中间件
 * 提供请求验证、XSS防护、速率限制、API Key验证和角色权限控制等安全功能
 */

const crypto = require('crypto');

// IP 速率限制 (简单的内存实现)
const RATE_LIMIT_WINDOW = 60 * 1000; // 1分钟
const MAX_REQUESTS_PER_WINDOW = parseInt(
  process.env.RATE_LIMIT_MAX || '100',
  10
);
// 完全禁用速率限制（仅在性能测试 / 内网部署时使用）
const RATE_LIMIT_DISABLED =
  process.env.DISABLE_RATE_LIMIT === 'true' ||
  process.env.DISABLE_RATE_LIMIT === '1';

// CSRF Token 配置
const CSRF_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_HEADER_HEADER = 'x-csrf-header';

// 请求签名配置
const SIGNATURE_HEADER = 'x-request-signature';
const SIGNATURE_ALGORITHM = 'sha256';
const SIGNATURE_EXPIRES_MS = 5 * 60 * 1000; // 5分钟

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

// 不需要 CSRF 验证的路径
const CSRF_EXEMPT_PATHS = [
  '/api/chat',
  '/api/search',
  '/api/a2a/subscribe',
  '/api/hitl/subscribe',
  '/health',
  '/favicon.ico'
];

// 速率限制存储
const rateLimit = new Map();

function rateLimitMiddleware(req, res, next) {
  if (RATE_LIMIT_DISABLED) return next();
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

/**
 * CSRF 防护中间件
 * 使用双重提交 Cookie 模式防止 CSRF 攻击
 */
function csrfMiddleware(req, res, next) {
  // 检查是否豁免
  const path = req.path;
  if (CSRF_EXEMPT_PATHS.some(p => path.startsWith(p))) {
    return next();
  }

  // 只对状态修改请求进行 CSRF 检查
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // 获取 Cookie 中的 CSRF Token
  const cookieToken = req.cookies?.csrf_token;
  // 获取请求头中的 CSRF Token
  const headerToken = req.headers[CSRF_TOKEN_HEADER];

  // 验证 Token 存在且匹配
  if (!cookieToken || !headerToken) {
    return res.status(403).json({
      error: 'CSRF token missing',
      code: 'CSRF_TOKEN_MISSING',
    });
  }

  if (cookieToken !== headerToken) {
    return res.status(403).json({
      error: 'CSRF token mismatch',
      code: 'CSRF_TOKEN_MISMATCH',
    });
  }

  next();
}

/**
 * CSRF Token 生成中间件
 * 为 GET 请求生成并设置 CSRF Token 到 Cookie
 */
function csrfTokenGenerator(req, res, next) {
  // 只对 GET 请求生成 Token
  if (req.method !== 'GET') {
    return next();
  }

  // 检查是否豁免
  const path = req.path;
  if (CSRF_EXEMPT_PATHS.some(p => path.startsWith(p))) {
    return next();
  }

  // 生成安全的随机 Token
  const token = crypto.randomBytes(32).toString('hex');

  // 设置 HttpOnly Cookie（前端 JavaScript 无法访问）
  res.cookie('csrf_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  });

  // 同时在响应头中返回 Token（供前端读取）
  res.setHeader(CSRF_TOKEN_HEADER, token);

  next();
}

/**
 * 请求签名验证中间件
 * 防止请求篡改和重放攻击
 */
function requestSignatureMiddleware(req, res, next) {
  // 检查是否豁免
  const path = req.path;
  if (CSRF_EXEMPT_PATHS.some(p => path.startsWith(p))) {
    return next();
  }

  const signature = req.headers[SIGNATURE_HEADER];
  if (!signature) {
    // 无签名头时跳过（向后兼容）
    return next();
  }

  try {
    // 签名格式: timestamp.signature
    const parts = signature.split('.');
    if (parts.length !== 2) {
      return res.status(401).json({
        error: 'Invalid signature format',
        code: 'INVALID_SIGNATURE_FORMAT',
      });
    }

    const [timestampStr, sig] = parts;
    const timestamp = parseInt(timestampStr, 10);

    // 检查时间戳有效性（防止重放攻击）
    if (Date.now() - timestamp > SIGNATURE_EXPIRES_MS) {
      return res.status(401).json({
        error: 'Signature expired',
        code: 'SIGNATURE_EXPIRED',
      });
    }

    // 重建签名内容
    const method = req.method;
    const url = req.originalUrl;
    const body = req.body ? JSON.stringify(req.body) : '';

    const signatureContent = `${method}:${url}:${body}:${timestampStr}`;
    const expectedSignature = crypto
      .createHmac(SIGNATURE_ALGORITHM, CSRF_SECRET)
      .update(signatureContent)
      .digest('hex');

    // 常数时间比较，防止时序攻击
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSignature))) {
      return res.status(401).json({
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE',
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Signature verification failed',
      code: 'SIGNATURE_VERIFICATION_FAILED',
    });
  }
}

/**
 * 生成请求签名（客户端使用）
 */
function generateRequestSignature(method, url, body = {}) {
  const timestamp = Date.now().toString();
  const bodyStr = Object.keys(body).length > 0 ? JSON.stringify(body) : '';
  const content = `${method}:${url}:${bodyStr}:${timestamp}`;

  const signature = crypto
    .createHmac(SIGNATURE_ALGORITHM, CSRF_SECRET)
    .update(content)
    .digest('hex');

  return `${timestamp}.${signature}`;
}

module.exports = {
  rateLimitMiddleware,
  inputLimitMiddleware,
  corsMiddleware,
  securityHeadersMiddleware,
  apiKeyMiddleware,
  roleMiddleware,
  configurableRateLimitMiddleware,
  csrfMiddleware,
  csrfTokenGenerator,
  requestSignatureMiddleware,
  generateRequestSignature,
  registerApiKey,
  removeApiKey,
  listApiKeys,
  ROLES,
};