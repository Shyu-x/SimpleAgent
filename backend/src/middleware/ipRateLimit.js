/**
 * IP 限流中间件 - 体验用户保护
 *
 * 功能:
 * - 按 IP 限流 (每分钟/每小时/每天)
 * - 每日请求配额保护 (防止 token 烧干)
 * - 请求日志记录
 * - 体验用户分级
 */

const { getMetricsCollector } = require('../infra/metrics');

// 限流配置
// 说明: 严格限制 AI 对话配额防烧干，但放宽普通请求限制让用户体验流畅
const RATE_LIMIT_CONFIG = {
  // 体验用户限制 (未登录/游客)
  trial: {
    perMinute: 60,        // 每分钟最大请求 (放宽)
    perHour: 300,         // 每小时最大请求 (放宽)
    perDay: 1000,         // 每天最大请求 (放宽)
    dailyQuota: 100,     // 每日 AI 对话配额 (核心防护，仍严格)
  },
  // 注册用户限制
  registered: {
    perMinute: 100,
    perHour: 800,
    perDay: 5000,
    dailyQuota: 1000,
  },
  // 付费用户限制
  premium: {
    perMinute: 300,
    perHour: 5000,
    perDay: 50000,
    dailyQuota: 10000,
  },
};

// 日志存储 (生产环境应使用数据库)
const requestLog = new Map();
const dailyStats = new Map();
const ipLastRequest = new Map();

// 配额计数器
let dailyResetTime = getNextDailyReset();
let dailyRequestCount = new Map();

/**
 * 获取次日凌晨重置时间
 */
function getNextDailyReset() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

/**
 * 获取客户端真实 IP
 */
function getClientIP(req) {
  // 优先使用 X-Forwarded-For (反向代理)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  // 使用 X-Real-IP
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return realIP;
  }
  // 降级使用连接地址
  return req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown';
}

/**
 * 获取用户类型
 */
function getUserTier(req) {
  // 检查 API Key 或 Token
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  if (apiKey) {
    // 简单检查是否为正式用户 (实际应验证)
    if (apiKey.startsWith('sk-prod')) {
      return 'premium';
    }
    return 'registered';
  }

  // 检查会话
  const session = req.headers['x-session-id'];
  if (session) {
    return 'registered';
  }

  return 'trial';
}

/**
 * 记录请求日志
 */
function logRequest(ip, path, method, userTier, responseTime) {
  const now = Date.now();
  const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // 初始化日期统计
  if (!dailyStats.has(dateKey)) {
    dailyStats.set(dateKey, {
      totalRequests: 0,
      uniqueIPs: new Set(),
      blockedRequests: 0,
      aiCalls: 0,
      tokensUsed: 0,
    });
  }

  const stats = dailyStats.get(dateKey);
  stats.totalRequests++;
  stats.uniqueIPs.add(ip);

  // 记录 IP 请求日志
  if (!requestLog.has(ip)) {
    requestLog.set(ip, []);
  }

  const ipLogs = requestLog.get(ip);
  ipLogs.push({
    timestamp: now,
    path,
    method,
    userTier,
    responseTime,
  });

  // 保持最近 1000 条日志
  if (ipLogs.length > 1000) {
    ipLogs.shift();
  }

  // 每小时清理旧 IP 日志
  const lastCleanup = ipLastRequest.get('__lastCleanup__') || 0;
  if (now - lastCleanup > 3600000) {
    cleanupOldLogs(now);
    ipLastRequest.set('__lastCleanup__', now);
  }
}

/**
 * 清理旧日志
 */
function cleanupOldLogs(now) {
  const maxAge = 7 * 24 * 3600000; // 7 天
  for (const [ip, logs] of requestLog.entries()) {
    const validLogs = logs.filter(log => now - log.timestamp < maxAge);
    if (validLogs.length === 0) {
      requestLog.delete(ip);
    } else {
      requestLog.set(ip, validLogs);
    }
  }

  // 清理旧日期统计
  for (const [date, stats] of dailyStats.entries()) {
    const dateTime = new Date(date).getTime();
    if (now - dateTime > maxAge) {
      dailyStats.delete(date);
    }
  }
}

/**
 * 检查配额限制
 */
function checkDailyQuota(ip, userTier) {
  const config = RATE_LIMIT_CONFIG[userTier] || RATE_LIMIT_CONFIG.trial;
  const now = Date.now();

  // 检查是否需要重置
  if (now >= dailyResetTime) {
    dailyResetTime = getNextDailyReset();
    dailyRequestCount.clear();
  }

  // 获取 IP 今日请求数
  const key = `${ip}:${userTier}`;
  const count = dailyRequestCount.get(key) || 0;

  if (count >= config.dailyQuota) {
    return {
      allowed: false,
      reason: 'daily_quota_exceeded',
      quota: config.dailyQuota,
      used: count,
      resetAt: dailyResetTime,
    };
  }

  // 增加计数
  dailyRequestCount.set(key, count + 1);

  return {
    allowed: true,
    quota: config.dailyQuota,
    used: count + 1,
    remaining: config.dailyQuota - count - 1,
  };
}

/**
 * 检查速率限制
 */
function checkRateLimit(ip, userTier) {
  const config = RATE_LIMIT_CONFIG[userTier] || RATE_LIMIT_CONFIG.trial;
  const now = Date.now();
  const minuteKey = `min:${ip}:${userTier}`;
  const hourKey = `hour:${ip}:${userTier}`;

  // 获取当前分钟/小时计数
  const minuteCount = (ipLastRequest.get(minuteKey) || { count: 0, resetAt: 0 }).count;
  const hourCount = (ipLastRequest.get(hourKey) || { count: 0, resetAt: 0 }).count;

  // 检查分钟限制
  if (minuteCount >= config.perMinute) {
    return {
      allowed: false,
      reason: 'minute_rate_exceeded',
      limit: config.perMinute,
      remaining: 0,
    };
  }

  // 检查小时限制
  if (hourCount >= config.perHour) {
    return {
      allowed: false,
      reason: 'hour_rate_exceeded',
      limit: config.perHour,
      remaining: 0,
    };
  }

  // 更新计数
  const minuteReset = Math.floor(now / 60000) * 60000 + 60000;
  const hourReset = Math.floor(now / 3600000) * 3600000 + 3600000;

  ipLastRequest.set(minuteKey, {
    count: minuteCount + 1,
    resetAt: minuteReset
  });
  ipLastRequest.set(hourKey, {
    count: hourCount + 1,
    resetAt: hourReset
  });

  return {
    allowed: true,
    minuteLimit: config.perMinute,
    minuteRemaining: config.perMinute - minuteCount - 1,
    hourLimit: config.perHour,
    hourRemaining: config.perHour - hourCount - 1,
  };
}

/**
 * 限流中间件
 */
function ipRateLimitMiddleware(req, res, next) {
  const ip = getClientIP(req);
  const userTier = getUserTier(req);
  const path = req.path;
  const startTime = Date.now();
  
  // 判断是否为 AI 对话类请求 (需要严格配额限制)
  const isAIRequest = path.startsWith('/api/chat') || 
                      path.startsWith('/api/agent') ||
                      path.startsWith('/api/completion');
  
  // 非 AI 请求：先检查速率限制
  if (!isAIRequest) {
    const rateCheck = checkRateLimit(ip, userTier);
    if (!rateCheck.allowed) {
      logRequest(ip, path, req.method, userTier, 0);
      // 记录限流指标
      try {
        const collector = getMetricsCollector();
        collector.recordRateLimitExceeded(path, userTier);
      } catch (e) {
        // 忽略指标记录错误
      }
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `请求过于频繁，请稍后再试`,
          limit: rateCheck.limit,
          reason: rateCheck.reason,
        },
        retryAfter: 60,
      });
    }
    
    res.set({
      'X-RateLimit-Minute': `${rateCheck.minuteRemaining}/${rateCheck.minuteLimit}`,
      'X-RateLimit-Hour': `${rateCheck.hourRemaining}/${rateCheck.hourLimit}`,
      'X-RateLimit-IP': ip,
    });
    
    res.on('finish', () => {
      logRequest(ip, path, req.method, userTier, Date.now() - startTime);
    });
    
    return next();
  }
  
  // AI 请求：先检查每日配额
  const quotaCheck = checkDailyQuota(ip, userTier);
  if (!quotaCheck.allowed) {
    logRequest(ip, path, req.method, userTier, 0);
    // 记录限流指标
    try {
      const collector = getMetricsCollector();
      collector.recordRateLimitExceeded(path, userTier);
      collector.updateRateLimitQuota(userTier, quotaCheck.used, quotaCheck.quota);
    } catch (e) {
      // 忽略指标记录错误
    }
    return res.status(429).json({
      success: false,
      error: {
        code: 'DAILY_QUOTA_EXCEEDED',
        message: `今日 AI 对话配额已用完（${quotaCheck.used}/${quotaCheck.quota}次），请明天再来`,
        quota: quotaCheck.quota,
        used: quotaCheck.used,
        remaining: 0,
        resetAt: new Date(quotaCheck.resetAt).toISOString(),
      },
      retryAfter: Math.ceil((quotaCheck.resetAt - Date.now()) / 1000),
    });
  }

  // 再检查速率限制
  const rateCheck = checkRateLimit(ip, userTier);
  if (!rateCheck.allowed) {
    logRequest(ip, path, req.method, userTier, 0);
    // 记录限流指标
    try {
      const collector = getMetricsCollector();
      collector.recordRateLimitExceeded(path, userTier);
    } catch (e) {
      // 忽略指标记录错误
    }
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `请求过于频繁，请稍后再试`,
        limit: rateCheck.limit,
        reason: rateCheck.reason,
      },
      retryAfter: 60,
    });
  }
  
  // 记录响应时间
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    logRequest(ip, path, req.method, userTier, responseTime);
  });
  
  // 添加限流头信息
  res.set({
    'X-RateLimit-Minute': `${rateCheck.minuteRemaining}/${rateCheck.minuteLimit}`,
    'X-RateLimit-Hour': `${rateCheck.hourRemaining}/${rateCheck.hourLimit}`,
    'X-RateLimit-Daily': `${quotaCheck.remaining}/${quotaCheck.quota}`,
    'X-RateLimit-IP': ip,
  });
  
  next();
}

/**
 * 获取 IP 统计信息
 */
function getIPStats(ip) {
  const logs = requestLog.get(ip) || [];
  const today = new Date().toISOString().split('T')[0];

  const todayLogs = logs.filter(log => {
    const logDate = new Date(log.timestamp).toISOString().split('T')[0];
    return logDate === today;
  });

  return {
    totalRequests: logs.length,
    todayRequests: todayLogs.length,
    userAgents: [...new Set(logs.map(l => l.path))],
  };
}

/**
 * 获取全局统计
 */
function getGlobalStats() {
  const dateKey = new Date().toISOString().split('T')[0];
  const stats = dailyStats.get(dateKey) || {
    totalRequests: 0,
    uniqueIPs: new Set(),
    blockedRequests: 0,
  };

  return {
    date: dateKey,
    totalRequests: stats.totalRequests,
    uniqueIPs: stats.uniqueIPs.size,
    blockedRequests: stats.blockedRequests,
    nextResetAt: dailyResetTime,
  };
}

/**
 * AI 调用计数器 (防止 token 烧干)
 */
let dailyAICalls = new Map();
let dailyTokenUsage = new Map();

function trackAICall(ip, tokensUsed, model) {
  const now = Date.now();
  const dateKey = new Date().toISOString().split('T')[0];
  const key = `${ip}:${dateKey}`;

  // 重置
  if (now >= dailyResetTime) {
    dailyResetTime = getNextDailyReset();
    dailyAICalls.clear();
    dailyTokenUsage.clear();
  }

  // 更新计数
  dailyAICalls.set(key, (dailyAICalls.get(key) || 0) + 1);
  dailyTokenUsage.set(key, (dailyTokenUsage.get(key) || 0) + tokensUsed);

  return {
    calls: dailyAICalls.get(key),
    tokens: dailyTokenUsage.get(key),
  };
}

/**
 * 获取 IP 的 AI 使用统计
 */
function getAIUsageByIP(ip) {
  const dateKey = new Date().toISOString().split('T')[0];
  const key = `${ip}:${dateKey}`;

  return {
    calls: dailyAICalls.get(key) || 0,
    tokens: dailyTokenUsage.get(key) || 0,
    quota: RATE_LIMIT_CONFIG.trial.dailyQuota,
  };
}

module.exports = {
  ipRateLimitMiddleware,
  getIPStats,
  getGlobalStats,
  trackAICall,
  getAIUsageByIP,
  getClientIP,
};