/**
 * 商业级限流中间件
 * 基于 rate-limiter-flexible + Redis 实现
 * 
 * 功能:
 * - 多层用户分级 (trial/registered/premium)
 * - Redis 分布式存储 (跨实例共享)
 * - AI 对话配额保护
 * - 标准 RateLimit 响应头
 */

const { RateLimiterRedis } = require('rate-limiter-flexible');
const Redis = require('ioredis');

// Redis 连接配置
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// 创建 Redis 客户端
let redisClient = null;
let redisConnectionLogged = false;

try {
  redisClient = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  
  redisClient.on('error', (err) => {
    // Only log once per connection cycle to avoid spam
    if (!redisConnectionLogged) {
      console.warn('[RateLimit] Redis error, will retry silently:', err.message.split('\n')[0]);
      redisConnectionLogged = true;
    }
  });
  
  redisClient.on('ready', () => {
    if (!redisConnectionLogged) {
      console.log('[RateLimit] Redis connected successfully');
      redisConnectionLogged = true;
    }
  });
  
  // 启动时尝试连接
  redisClient.connect().catch(() => {
    // 连接失败是正常的（Redis可能未启动），静默处理
  });
} catch (err) {
  console.warn('[RateLimit] Redis initialization skipped');
}

// 配置规格（三层用户）
const TIER_CONFIG = {
  trial: {
    perMinute: 60,
    perHour: 300,
    dailyAIConversations: 100,
    blockDuration: 30, // 秒
  },
  registered: {
    perMinute: 100,
    perHour: 500,
    dailyAIConversations: 1000,
    blockDuration: 60,
  },
  premium: {
    perMinute: 300,
    perHour: 1500,
    dailyAIConversations: 10000,
    blockDuration: 120,
  },
};

// 限流器实例缓存
const limiters = new Map();

/**
 * 获取指定类型的限流器
 */
function getLimiter(tier, type) {
  const key = `${tier}:${type}`;
  
  // 如果 Redis 未就绪，返回 null 触发降级模式
  if (!redisClient || redisClient.status !== 'ready') {
    return null;
  }
  
  if (limiters.has(key)) {
    return limiters.get(key);
  }

  const config = TIER_CONFIG[tier] || TIER_CONFIG.trial;
  let limiter;

  if (type === 'ai') {
    // AI 对话专用限流器（基于日期）
    limiter = new RateLimiterRedis({
      redisClient,
      keyPrefix: `ratelimit:ai:${tier}`,
      duration: 86400, // 1天
      points: config.dailyAIConversations,
      execEveryPeriod: true,
      // 用于同 IP 多用户场景，blockDuration 期间阻止访问
      blockDuration: config.blockDuration,
    });
  } else if (type === 'minute') {
    limiter = new RateLimiterRedis({
      redisClient,
      keyPrefix: `ratelimit:min:${tier}`,
      duration: 60,
      points: config.perMinute,
    });
  } else if (type === 'hour') {
    limiter = new RateLimiterRedis({
      redisClient,
      keyPrefix: `ratelimit:hr:${tier}`,
      duration: 3600,
      points: config.perHour,
    });
  }

  limiters.set(key, limiter);
  return limiter;
}

/**
 * 获取客户端真实 IP
 */
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return realIP;
  }
  return req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown';
}

/**
 * 获取用户层级（默认 trial）
 */
function getUserTier(req) {
  // 优先从 header 读取
  const userLevel = req.headers['x-user-level'];
  if (userLevel && TIER_CONFIG[userLevel]) {
    return userLevel;
  }
  
  // 检查 API Key
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  if (apiKey) {
    if (apiKey.startsWith('sk-prod')) {
      return 'premium';
    }
    return 'registered';
  }
  
  // 检查 session
  const session = req.headers['x-session-id'];
  if (session) {
    return 'registered';
  }
  
  return 'trial';
}

/**
 * 判断是否为 AI 对话端点
 */
function isAIEndpoint(path) {
  return path.startsWith('/api/chat') || 
         path.startsWith('/api/agent') ||
         path.startsWith('/api/completion');
}

/**
 * 设置 RateLimit 响应头
 */
function setRateLimitHeaders(res, tier, type, remaining) {
  const config = TIER_CONFIG[tier];
  if (type === 'minute') {
    res.set('X-RateLimit-Minute-Remaining', remaining);
    res.set('X-RateLimit-Minute-Limit', config.perMinute);
  } else if (type === 'hour') {
    res.set('X-RateLimit-Hour-Remaining', remaining);
    res.set('X-RateLimit-Hour-Limit', config.perHour);
  } else if (type === 'ai') {
    res.set('X-RateLimit-Daily-Remaining', remaining);
    res.set('X-RateLimit-Daily-Limit', config.dailyAIConversations);
  }
  res.set('X-RateLimit-Tier', tier);
}

/**
 * 创建限流中间件
 */
function createRateLimitMiddleware(options = {}) {
  const { 
    // 是否是 AI 对话端点
    isAI = false,
    // 限流器类型: 'minute', 'hour', 'ai'
    limiterType = 'minute'
  } = options;

  return async (req, res, next) => {
    const ip = getClientIP(req);
    const tier = getUserTier(req);
    const path = req.path;
    const config = TIER_CONFIG[tier] || TIER_CONFIG.trial;

    // 如果没有 Redis 连接，降级到允许所有请求
    if (!redisClient || redisClient.status !== 'ready') {
      res.set('X-RateLimit-Status', 'fallback');
      res.set('X-RateLimit-Tier', tier);
      return next();
    }

    try {
      const ip = getClientIP(req);
      const tier = getUserTier(req);
      const path = req.path;
      const config = TIER_CONFIG[tier] || TIER_CONFIG.trial;
      const rateKey = `${ip}:${path}`;

      // AI 端点需要同时检查每日配额和速率限制
      if (isAI) {
        // 先检查 AI 对话配额
        const aiLimiter = getLimiter(tier, 'ai');
        if (!aiLimiter) {
          res.set('X-RateLimit-Status', 'fallback');
          return next();
        }
        
        const aiConsume = await aiLimiter.consume(rateKey).catch(() => null);
        
        if (aiConsume && aiConsume.consumedPoints > 0) {
          const remaining = aiConsume.remainingPoints;
          setRateLimitHeaders(res, tier, 'ai', remaining);
          
          if (remaining < 0) {
            // 配额用尽
            const retryAfter = config.blockDuration;
            res.set('Retry-After', retryAfter);
            res.set('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + retryAfter);
            
            return res.status(429).json({
              success: false,
              error: {
                code: 'DAILY_AI_QUOTA_EXCEEDED',
                message: `今日 AI 对话配额已用完（${config.dailyAIConversations}次），请明天再来`,
                tier,
                quota: config.dailyAIConversations,
                remaining: 0,
              },
              retryAfter,
            });
          }
        }
        
        // 再检查分钟速率
        const minLimiter = getLimiter(tier, 'minute');
        const minConsume = await minLimiter.consume(rateKey).catch(() => null);
        
        if (minConsume && minConsume.consumedPoints > 0) {
          const remaining = minConsume.remainingPoints;
          setRateLimitHeaders(res, tier, 'minute', remaining);
          
          if (remaining < 0) {
            const retryAfter = 60;
            res.set('Retry-After', retryAfter);
            res.set('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + retryAfter);
            
            return res.status(429).json({
              success: false,
              error: {
                code: 'MINUTE_RATE_EXCEEDED',
                message: `请求过于频繁，请稍后再试`,
                tier,
                limit: config.perMinute,
              },
              retryAfter,
            });
          }
        }
        
        // 检查小时速率
        const hrLimiter = getLimiter(tier, 'hour');
        const hrConsume = await hrLimiter.consume(rateKey).catch(() => null);
        
        if (hrConsume && hrConsume.consumedPoints > 0) {
          const remaining = hrConsume.remainingPoints;
          setRateLimitHeaders(res, tier, 'hour', remaining);
          
          if (remaining < 0) {
            const retryAfter = 3600;
            res.set('Retry-After', retryAfter);
            res.set('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + retryAfter);
            
            return res.status(429).json({
              success: false,
              error: {
                code: 'HOUR_RATE_EXCEEDED',
                message: `小时请求配额已用完，请稍后再试`,
                tier,
                limit: config.perHour,
              },
              retryAfter,
            });
          }
        }
        
      } else {
        // 非 AI 端点只检查速率限制
        const limiter = getLimiter(tier, limiterType);
        if (!limiter) {
          res.set('X-RateLimit-Status', 'fallback');
          return next();
        }
        
        const rateKey = `${ip}:${path}`;
        const consume = await limiter.consume(rateKey).catch(() => null);
        
        if (consume && consume.consumedPoints > 0) {
          const remaining = consume.remainingPoints;
          setRateLimitHeaders(res, tier, limiterType, remaining);
          
          if (remaining < 0) {
            const retryAfter = limiterType === 'hour' ? 3600 : 
                               limiterType === 'minute' ? 60 : 60;
            res.set('Retry-After', retryAfter);
            res.set('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + retryAfter);
            
            return res.status(429).json({
              success: false,
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: `请求过于频繁，请稍后再试`,
                tier,
                limit: limiterType === 'hour' ? config.perHour : config.perMinute,
              },
              retryAfter,
            });
          }
        }
      }

      res.set('X-RateLimit-Status', 'allowed');
      next();

    } catch (error) {
      // 限流器错误时降级为允许请求
      console.error('[RateLimit] Limiter error:', error.message);
      res.set('X-RateLimit-Status', 'error');
      next();
    }
  };
}

/**
 * AI 对话端点限流中间件
 */
const aiRateLimitMiddleware = createRateLimitMiddleware({ isAI: true, limiterType: 'minute' });

/**
 * 通用速率限制中间件（分钟）
 */
const minuteRateLimitMiddleware = createRateLimitMiddleware({ isAI: false, limiterType: 'minute' });

/**
 * 小时级限流中间件
 */
const hourRateLimitMiddleware = createRateLimitMiddleware({ isAI: false, limiterType: 'hour' });

/**
 * 获取限流统计信息
 */
async function getRateLimitStats(ip, tier) {
  if (!redisClient || redisClient.status !== 'ready') {
    return null;
  }

  try {
    const config = TIER_CONFIG[tier] || TIER_CONFIG.trial;
    
    // 获取各限流器的当前状态
    const aiLimiter = getLimiter(tier, 'ai');
    const minLimiter = getLimiter(tier, 'minute');
    const hrLimiter = getLimiter(tier, 'hour');

    const [aiStats, minStats, hrStats] = await Promise.all([
      aiLimiter.get(ip).catch(() => null),
      minLimiter.get(ip).catch(() => null),
      hrLimiter.get(ip).catch(() => null),
    ]);

    return {
      tier,
      ai: {
        remaining: aiStats?.remainingPoints ?? config.dailyAIConversations,
        limit: config.dailyAIConversations,
      },
      minute: {
        remaining: minStats?.remainingPoints ?? config.perMinute,
        limit: config.perMinute,
      },
      hour: {
        remaining: hrStats?.remainingPoints ?? config.perHour,
        limit: config.perHour,
      },
    };
  } catch (error) {
    console.error('[RateLimit] Stats error:', error.message);
    return null;
  }
}

/**
 * 清理 Redis 连接
 */
function closeRedis() {
  if (redisClient) {
    redisClient.quit();
    redisClient = null;
  }
}

module.exports = {
  aiRateLimitMiddleware,
  minuteRateLimitMiddleware,
  hourRateLimitMiddleware,
  createRateLimitMiddleware,
  getRateLimitStats,
  getClientIP,
  getUserTier,
  closeRedis,
  TIER_CONFIG,
};