/**
 * 限流器集成模块 - Express/JS 适配层
 * 将 TypeScript 限流器模块桥接到现有 CommonJS Express 后端
 *
 * 使用示例：
 * ```js
 * const { rateLimiter, chatRateLimiter } = require('./common/rate-limiter/integration');
 *
 * // 在路由中应用限流
 * app.use('/api/chat', chatRateLimiter);
 * ```
 */

// ============ 内存限流器实现 ============

class MemoryRateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 60000;
    this.keyPrefix = options.keyPrefix || 'ratelimit:';
    this._store = new Map();
  }

  _getKey(identifier, scope = 'global') {
    return `${this.keyPrefix}${scope}:${identifier}`;
  }

  _cleanup(key, now) {
    const entries = this._store.get(key);
    if (!entries) return [];
    const windowStart = now - this.windowMs;
    const valid = entries.filter(t => t > windowStart);
    this._store.set(key, valid);
    return valid;
  }

  async acquire(identifier, scope = 'global') {
    const now = Date.now();
    const key = this._getKey(identifier, scope);
    const entries = this._cleanup(key, now);

    if (entries.length >= this.maxRequests) {
      const oldest = entries[0];
      const retryAfterMs = Math.max(0, oldest + this.windowMs - now);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs,
        total: this.maxRequests,
        current: entries.length,
      };
    }

    entries.push(now);
    this._store.set(key, entries);

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - entries.length),
      retryAfterMs: 0,
      total: this.maxRequests,
      current: entries.length,
    };
  }

  async getStatus(identifier, scope = 'global') {
    const now = Date.now();
    const key = this._getKey(identifier, scope);
    const entries = this._cleanup(key, now);
    return {
      allowed: entries.length < this.maxRequests,
      remaining: Math.max(0, this.maxRequests - entries.length),
      total: this.maxRequests,
      current: entries.length,
      resetAt: now + this.windowMs,
    };
  }

  async reset(identifier, scope = 'global') {
    const key = this._getKey(identifier, scope);
    this._store.delete(key);
  }

  clear() {
    this._store.clear();
  }
}

// ============ 限流器预设 ============

const RATE_LIMIT_PRESETS = {
  // 全局限流：每分钟 100 请求
  global: { maxRequests: 100, windowMs: 60000 },
  // 聊天 API：每分钟 60 请求
  chat: { maxRequests: 60, windowMs: 60000 },
  // 搜索 API：每分钟 30 请求
  search: { maxRequests: 30, windowMs: 60000 },
  // 管理 API：每分钟 200 请求
  admin: { maxRequests: 200, windowMs: 60000 },
  // 登录：每分钟 10 请求
  login: { maxRequests: 10, windowMs: 60000 },
  // 严格限流：每分钟 20 请求
  strict: { maxRequests: 20, windowMs: 60000 },
  // 宽松限流：每分钟 500 请求
  relaxed: { maxRequests: 500, windowMs: 60000 },
};

// 限流器实例缓存
const _limiters = new Map();

/**
 * 获取或创建限流器
 * @param {string} name - 限流器名称或预设名
 * @param {object} [options] - 自定义配置
 * @returns {MemoryRateLimiter}
 */
function getLimiter(name, options = null) {
  if (!_limiters.has(name)) {
    const config = options || RATE_LIMIT_PRESETS[name];
    if (!config) {
      throw new Error(`限流器 "${name}" 不存在，可用预设: ${Object.keys(RATE_LIMIT_PRESETS).join(', ')}`);
    }
    _limiters.set(name, new MemoryRateLimiter(config));
  }
  return _limiters.get(name);
}

// ============ Express 中间件 ============

/**
 * 创建限流中间件
 * @param {object} [options] - 配置选项
 * @param {number} [options.maxRequests=100] - 最大请求数
 * @param {number} [options.windowMs=60000] - 时间窗口（毫秒）
 * @param {Function} [options.keyGenerator] - 自定义 key 生成函数 (req) => string
 * @param {Function} [options.onLimitReached] - 超限自定义处理 (req, res, retryAfterMs) => void
 * @param {string} [options.scope] - 限流范围
 * @returns {Function} Express 中间件
 */
function createRateLimiterMiddleware(options = {}) {
  const limiter = new MemoryRateLimiter({
    maxRequests: options.maxRequests || 100,
    windowMs: options.windowMs || 60000,
    keyPrefix: options.keyPrefix || 'express:',
  });

  const keyGenerator = options.keyGenerator || ((req) => {
    return req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'anonymous';
  });

  const scope = options.scope || 'global';

  return async (req, res, next) => {
    try {
      const identifier = keyGenerator(req);
      const result = await limiter.acquire(identifier, scope);

      // 设置限流响应头
      res.setHeader('X-RateLimit-Limit', result.total);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + result.retryAfterMs) / 1000));

      if (!result.allowed) {
        res.setHeader('Retry-After', Math.ceil(result.retryAfterMs / 1000));

        if (options.onLimitReached) {
          return options.onLimitReached(req, res, result.retryAfterMs);
        }

        return res.status(429).json({
          success: false,
          error: {
            type: 'rate_limit_exceeded',
            message: '请求频率超限，请稍后重试',
            retryAfterMs: result.retryAfterMs,
            retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
          },
        });
      }

      next();
    } catch (error) {
      // 限流器出错不应阻止请求
      console.error('[RateLimiter] 限流检查失败:', error.message);
      next();
    }
  };
}

// ============ 预设中间件 ============

/** 全局限流中间件 */
const globalRateLimiter = createRateLimiterMiddleware(RATE_LIMIT_PRESETS.global);

/** 聊天限流中间件 */
const chatRateLimiter = createRateLimiterMiddleware(RATE_LIMIT_PRESETS.chat);

/** 搜索限流中间件 */
const searchRateLimiter = createRateLimiterMiddleware(RATE_LIMIT_PRESETS.search);

/** 管理后台限流中间件 */
const adminRateLimiter = createRateLimiterMiddleware(RATE_LIMIT_PRESETS.admin);

/** 严格限流中间件 */
const strictRateLimiter = createRateLimiterMiddleware(RATE_LIMIT_PRESETS.strict);

module.exports = {
  MemoryRateLimiter,
  RATE_LIMIT_PRESETS,
  getLimiter,
  createRateLimiterMiddleware,
  globalRateLimiter,
  chatRateLimiter,
  searchRateLimiter,
  adminRateLimiter,
  strictRateLimiter,
};