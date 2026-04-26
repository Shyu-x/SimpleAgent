/**
 * 限流器工厂 - 创建和 管理不同类型的限流器
 * @desc 支持用户级、全局限流、端点级限流
 */

const QueueRateLimiter = require('./QueueRateLimiter');
const AppError = require('../../common/errors/AppError');

class RateLimiterFactory {
  /**
   * 内置限流器配置
   */
  static PRESETS = {
    // 宽松限流 (开发/测试用)
    lenient: {
      strategy: QueueRateLimiter.STRATEGIES.SLIDING_WINDOW,
      maxRequests: 1000,
      windowMs: 60000,
    },
    // 正常限流 (一般 API)
    normal: {
      strategy: QueueRateLimiter.STRATEGIES.SLIDING_WINDOW,
      maxRequests: 100,
      windowMs: 60000,
    },
    // 严格限流 (敏感操作)
    strict: {
      strategy: QueueRateLimiter.STRATEGIES.SLIDING_WINDOW,
      maxRequests: 20,
      windowMs: 60000,
    },
    // 登录限流 (防暴力破解)
    login: {
      strategy: QueueRateLimiter.STRATEGIES.TOKEN_BUCKET,
      maxRequests: 5,
      windowMs: 300000, // 5分钟内最多5次
      burstCapacity: 5,
    },
    // 搜索限流
    search: {
      strategy: QueueRateLimiter.STRATEGIES.SLIDING_WINDOW,
      maxRequests: 30,
      windowMs: 60000,
      minInterval: 1000, // 每秒最多1次
    },
    // 聊天限流
    chat: {
      strategy: QueueRateLimiter.STRATEGIES.SLIDING_WINDOW,
      maxRequests: 60,
      windowMs: 60000,
    },
    // 管理员限流
    admin: {
      strategy: QueueRateLimiter.STRATEGIES.SLIDING_WINDOW,
      maxRequests: 500,
      windowMs: 60000,
    },
  };

  // 存储已创建的限流器实例
  static _instances = new Map();

  // 全局限流器
  static _globalLimiter = null;

  /**
   * 获取或创建限流器
   * @param {string} name - 限流器名称
   * @param {object} [config] - 配置 (可选, 使用预设)
   * @returns {QueueRateLimiter}
   */
  static get(name, config = null) {
    const cacheKey = config ? `${name}:${JSON.stringify(config)}` : name;

    if (!RateLimiterFactory._instances.has(cacheKey)) {
      const preset = RateLimiterFactory.PRESETS[name];
      const finalConfig = config || preset;

      if (!finalConfig) {
        throw new Error(`限流器 "${name}" 不存在, 可用预设: ${Object.keys(RateLimiterFactory.PRESETS).join(', ')}`);
      }

      RateLimiterFactory._instances.set(cacheKey, new QueueRateLimiter(finalConfig));
    }

    return RateLimiterFactory._instances.get(cacheKey);
  }

  /**
   * 获取内嵌预设的限流器
   * @param {string} presetName - 预设名称
   * @returns {QueueRateLimiter}
   */
  static fromPreset(presetName) {
    return RateLimiterFactory.get(presetName);
  }

  /**
   * 获取全局限流器
   * @param {object} [config]
   * @returns {QueueRateLimiter}
   */
  static getGlobal(config = null) {
    if (!RateLimiterFactory._globalLimiter) {
      RateLimiterFactory._globalLimiter = RateLimiterFactory.get('global', {
        strategy: QueueRateLimiter.STRATEGIES.SLIDING_WINDOW,
        maxRequests: config?.maxRequests || 1000,
        windowMs: config?.windowMs || 60000,
        keyPrefix: 'ratelimit:global:',
      });
    }
    return RateLimiterFactory._globalLimiter;
  }

  /**
   * 创建用户级限流器
   * @param {string} userId
   * @param {string} [preset]
   * @returns {QueueRateLimiter}
   */
  static forUser(userId, preset = 'normal') {
    const limiter = RateLimiterFactory.fromPreset(preset);
    return {
      acquire: (scope = 'user') => limiter.acquire(userId, scope),
      enqueue: (scope = 'user') => limiter.enqueue(userId, scope),
      getStatus: (scope = 'user') => limiter.getStatus(userId, scope),
      reset: (scope = 'user') => limiter.reset(userId, scope),
      getConfig: () => limiter.config,
    };
  }

  /**
   * 创建 IP 级限流器
   * @param {string} ip
   * @param {string} [preset]
   * @returns {object}
   */
  static forIP(ip, preset = 'normal') {
    const limiter = RateLimiterFactory.fromPreset(preset);
    return {
      acquire: (scope = 'ip') => limiter.acquire(ip, scope),
      enqueue: (scope = 'ip') => limiter.enqueue(ip, scope),
      getStatus: (scope = 'ip') => limiter.getStatus(ip, scope),
      reset: (scope = 'ip') => limiter.reset(ip, scope),
      getConfig: () => limiter.config,
    };
  }

  /**
   * 创建端点级限流器
   * @param {string} endpoint
   * @param {string} [preset]
   * @returns {QueueRateLimiter}
   */
  static forEndpoint(endpoint, preset = 'normal') {
    const limiter = RateLimiterFactory.fromPreset(preset);
    return {
      acquire: (scope = 'endpoint') => limiter.acquire(endpoint, scope),
      enqueue: (scope = 'endpoint') => limiter.enqueue(endpoint, scope),
      getStatus: (scope = 'endpoint') => limiter.getStatus(endpoint, scope),
      reset: (scope = 'endpoint') => limiter.reset(endpoint, scope),
      getConfig: () => limiter.config,
    };
  }

  /**
   * 创建复合限流器 (同时检查多个维度)
   * @param {string} userId - 用户ID
   * @param {string} ip - IP 地址
   * @param {string} endpoint - 端点
   * @param {object} [presets] - 各维度预设
   * @returns {object}
   */
  static createComposite(userId, ip, endpoint, presets = {}) {
    const userLimiter = RateLimiterFactory.forUser(userId, presets.user || 'normal');
    const ipLimiter = RateLimiterFactory.forIP(ip, presets.ip || 'normal');
    const endpointLimiter = RateLimiterFactory.forEndpoint(endpoint, presets.endpoint || 'normal');

    return {
      /**
       * 检查所有限流器
       * @returns {Promise<{allowed: boolean, reasons: string[]}>}
       */
      async checkAll() {
        const results = await Promise.allSettled([
          userLimiter.acquire(),
          ipLimiter.acquire(),
          endpointLimiter.acquire(),
        ]);

        const reasons = [];
        let allowed = true;

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            if (!result.value.allowed) {
              allowed = false;
              const names = ['用户', 'IP', '端点'];
              reasons.push(`${names[index]}限流: ${result.value.retryAfterMs}ms后可重试`);
            }
          }
        });

        return { allowed, reasons, results };
      },

      /**
       * 获取组合状态
       * @returns {Promise<object>}
       */
      async getStatus() {
        const [userStatus, ipStatus, endpointStatus] = await Promise.all([
          userLimiter.getStatus(),
          ipLimiter.getStatus(),
          endpointLimiter.getStatus(),
        ]);

        return {
          user: userStatus,
          ip: ipStatus,
          endpoint: endpointStatus,
        };
      },

      /**
       * 重置所有限流器
       */
      async resetAll() {
        await Promise.all([
          userLimiter.reset(),
          ipLimiter.reset(),
          endpointLimiter.reset(),
        ]);
      },
    };
  }

  /**
   * Express 中间件工厂
   * @param {string|object} limiterOrPreset - 限流器或预设名
   * @param {Function} [identifierResolver] - 从请求解析标识符的函数
   * @returns {Function} Express 中间件
   */
  static middleware(limiterOrPreset, identifierResolver = null) {
    let limiter;

    if (typeof limiterOrPreset === 'string') {
      limiter = RateLimiterFactory.fromPreset(limiterOrPreset);
    } else if (limiterOrPreset instanceof QueueRateLimiter) {
      limiter = limiterOrPreset;
    } else {
      throw new Error('limiterOrPreset 必须是预设名称或 QueueRateLimiter 实例');
    }

    // 默认标识符解析器
    const resolveIdentifier = identifierResolver || ((req) => {
      // 优先使用用户ID, 其次IP
      return (req.user?.id) || (req.ip) || ('anonymous');
    });

    return async (req, res, next) => {
      try {
        const identifier = resolveIdentifier(req);
        const scope = req.path || 'default';

        const result = await limiter.acquire(identifier, scope);

        // 设置限流相关响应头
        res.set({
          'X-RateLimit-Limit': result.total,
          'X-RateLimit-Remaining': result.remaining,
          'X-RateLimit-Reset': Math.floor((Date.now() + result.retryAfterMs) / 1000),
        });

        if (!result.allowed) {
          res.set('Retry-After', Math.ceil(result.retryAfterMs / 1000));
          throw AppError.rateLimit(`${result.retryAfterMs}ms后可重试`);
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * 清除所有缓存的限流器实例
   */
  static clearCache() {
    RateLimiterFactory._instances.clear();
    RateLimiterFactory._globalLimiter = null;
  }

  /**
   * 获取所有注册的限流器信息
   * @returns {Array<object>}
   */
  static getRegistered() {
    return Array.from(RateLimiterFactory._instances.entries()).map(([name, limiter]) => ({
      name,
      config: limiter.config,
    }));
  }
}

module.exports = RateLimiterFactory;
