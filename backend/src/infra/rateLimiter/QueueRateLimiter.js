/**
 * 队列式限流器 - 基于 Redis ZSET 实现
 * @desc 支持令牌桶、滑动窗口、固定窗口多种限流策略
 */

const { createClient } = require('./client');
const AppError = require('../../common/errors/AppError');
const { createLogger } = require('../logger/AgentLogger');

const logger = createLogger('queueRateLimiter');

class QueueRateLimiter {
  /**
   * 限流策略类型
   */
  static STRATEGIES = {
    FIXED_WINDOW: 'fixed_window',   // 固定窗口
    SLIDING_WINDOW: 'sliding_window', // 滑动窗口
    TOKEN_BUCKET: 'token_bucket',    // 令牌桶
  };

  /**
   * 默认配置
   */
  static DEFAULT_CONFIG = {
    strategy: QueueRateLimiter.STRATEGIES.SLIDING_WINDOW,
    maxRequests: 100,        // 窗口内最大请求数
    windowMs: 60000,         // 窗口大小 (毫秒)
    queueMaxSize: 0,        // 队列最大长度 (0=无限制)
    queueTimeoutMs: 30000,   // 队列等待超时
    minInterval: 0,          // 最小请求间隔 (毫秒, 0=不限制)
    burstCapacity: 0,        // 突发容量 (令牌桶用)
    keyPrefix: 'ratelimit:', // Redis key 前缀
  };

  /**
   * @param {object} config - 配置
   * @param {string} [config.redisUrl] - Redis URL
   * @param {string} [config.strategy] - 限流策略
   * @param {number} [config.maxRequests] - 最大请求数
   * @param {number} [config.windowMs] - 窗口大小
   * @param {number} [config.queueMaxSize] - 队列最大长度
   * @param {number} [config.queueTimeoutMs] - 队列等待超时
   * @param {number} [config.minInterval] - 最小请求间隔
   * @param {number} [config.burstCapacity] - 突发容量
   * @param {string} [config.keyPrefix] - Redis key 前缀
   */
  constructor(config = {}) {
    this.config = { ...QueueRateLimiter.DEFAULT_CONFIG, ...config };
    this.redis = null;
    this.initialized = false;
  }

  /**
   * 初始化 Redis 连接
   */
  async init() {
    if (this.initialized) return;

    try {
      this.redis = createClient(this.config.redisUrl);
      await this.redis.ping();
      this.initialized = true;
    } catch (error) {
      logger.error('Redis 连接失败', { error: error.message });
      // Redis 不可用时使用内存限流 (降级)
      this.redis = null;
      this.initialized = true;
    }
  }

  /**
   * 生成限流 key
   * @param {string} identifier - 标识符 (userId/ip/apiKey等)
   * @param {string} [scope] - 范围 (如 endpoint 路径)
   * @returns {string}
   */
  _getKey(identifier, scope = 'global') {
    return `${this.config.keyPrefix}${scope}:${identifier}`;
  }

  /**
   * 检查并获取令牌 (核心方法)
   * @param {string} identifier - 限流标识符
   * @param {string} [scope] - 限流范围
   * @returns {Promise<{allowed: boolean, remaining: number, retryAfterMs: number}>}
   */
  async acquire(identifier, scope = 'global') {
    await this.init();

    const key = this._getKey(identifier, scope);

    switch (this.config.strategy) {
      case QueueRateLimiter.STRATEGIES.FIXED_WINDOW:
        return this._acquireFixedWindow(key);
      case QueueRateLimiter.STRATEGIES.SLIDING_WINDOW:
        return this._acquireSlidingWindow(key);
      case QueueRateLimiter.STRATEGIES.TOKEN_BUCKET:
        return this._acquireTokenBucket(key);
      default:
        return this._acquireSlidingWindow(key);
    }
  }

  /**
   * 固定窗口限流
   * @param {string} key
   * @returns {Promise<object>}
   */
  async _acquireFixedWindow(key) {
    const now = Date.now();
    const windowStart = Math.floor(now / this.config.windowMs) * this.config.windowMs;
    const windowKey = `${key}:${windowStart}`;

    if (this.redis) {
      const count = await this.redis.incr(windowKey);
      await this.redis.expire(windowKey, Math.ceil(this.config.windowMs / 1000) + 1);

      if (count > this.config.maxRequests) {
        const retryAfterMs = this.config.windowMs - (now - windowStart);
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs,
          total: this.config.maxRequests,
          current: count,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, this.config.maxRequests - count),
        retryAfterMs: 0,
        total: this.config.maxRequests,
        current: count,
      };
    }

    // 内存降级 (简化实现)
    return this._memoryFallback();
  }

  /**
   * 滑动窗口限流 (使用 Redis ZSET)
   * @param {string} key
   * @returns {Promise<object>}
   */
  async _acquireSlidingWindow(key) {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    if (this.redis) {
      // 使用 Redis 事务保证原子性
      const multi = this.redis.multi();

      // 移除窗口外的旧记录
      multi.zremrangebyscore(key, 0, windowStart);

      // 获取当前窗口内请求数
      multi.zcard(key);

      // 添加当前请求
      multi.zadd(key, now, `${now}-${Math.random()}`);

      // 设置过期时间
      multi.expire(key, Math.ceil(this.config.windowMs / 1000) + 1);

      const results = await multi.exec();
      const currentCount = results[1]; // zcard 结果

      if (currentCount >= this.config.maxRequests) {
        // 计算需要等待的时间
        const oldestEntries = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
        const oldestTime = oldestEntries.length >= 2 ? parseInt(oldestEntries[1]) : now;
        const retryAfterMs = Math.max(0, oldestTime + this.config.windowMs - now);

        return {
          allowed: false,
          remaining: 0,
          retryAfterMs,
          total: this.config.maxRequests,
          current: currentCount,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, this.config.maxRequests - currentCount - 1),
        retryAfterMs: 0,
        total: this.config.maxRequests,
        current: currentCount + 1,
      };
    }

    return this._memoryFallback();
  }

  /**
   * 令牌桶限流
   * @param {string} key
   * @returns {Promise<object>}
   */
  async _acquireTokenBucket(key) {
    const now = Date.now();
    const bucketKey = `${key}:bucket`;
    const rate = this.config.maxRequests / this.config.windowMs; // 每毫秒添加的令牌数

    if (this.redis) {
      const bucket = await this.redis.hgetall(bucketKey);
      let tokens = parseFloat(bucket.tokens) || this.config.burstCapacity || this.config.maxRequests;
      let lastRefill = parseInt(bucket.lastRefill) || now;

      // 计算应该添加的令牌数
      const elapsed = now - lastRefill;
      const newTokens = Math.floor(elapsed * rate);
      tokens = Math.min(this.config.burstCapacity || this.config.maxRequests, tokens + newTokens);
      lastRefill = now;

      if (tokens < 1) {
        const waitTime = Math.ceil((1 - tokens) / rate);
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: waitTime,
          total: this.config.burstCapacity || this.config.maxRequests,
          current: 0,
        };
      }

      // 消耗一个令牌
      tokens -= 1;

      // 更新 bucket
      await this.redis.hmset(bucketKey, {
        tokens: tokens.toString(),
        lastRefill: lastRefill.toString(),
      });
      await this.redis.expire(bucketKey, Math.ceil(this.config.windowMs / 1000) + 1);

      return {
        allowed: true,
        remaining: Math.floor(tokens),
        retryAfterMs: 0,
        total: this.config.burstCapacity || this.config.maxRequests,
        current: Math.floor(this.config.burstCapacity || this.config.maxRequests - tokens),
      };
    }

    return this._memoryFallback();
  }

  /**
   * 内存降级实现 (Redis 不可用时)
   * @returns {Promise<object>}
   */
  async _memoryFallback() {
    // 简单固定窗口实现
    const now = Date.now();
    const windowStart = Math.floor(now / this.config.windowMs) * this.config.windowMs;
    const windowKey = `memory:${windowStart}`;

    if (!this._memoryStore) {
      this._memoryStore = new Map();
    }

    const count = (this._memoryStore.get(windowKey) || 0) + 1;
    this._memoryStore.set(windowKey, count);

    // 清理过期数据
    if (count === 1) {
      setTimeout(() => {
        this._memoryStore.delete(windowKey);
      }, this.config.windowMs * 2);
    }

    if (count > this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: this.config.windowMs - (now - windowStart),
        total: this.config.maxRequests,
        current: count,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, this.config.maxRequests - count),
      retryAfterMs: 0,
      total: this.config.maxRequests,
      current: count,
    };
  }

  /**
   * 进入队列等待
   * @param {string} identifier - 限流标识符
   * @param {string} [scope] - 范围
   * @returns {Promise<object>}
   */
  async enqueue(identifier, scope = 'global') {
    if (this.config.queueMaxSize === 0) {
      // 无队列限制，直接检查
      return this.acquire(identifier, scope);
    }

    await this.init();

    const queueKey = `${this._getKey(identifier, scope)}:queue`;
    const now = Date.now();

    if (this.redis) {
      // 获取队列长度
      const queueSize = await this.redis.zcard(queueKey);

      if (queueSize >= this.config.queueMaxSize) {
        throw AppError.rateLimit(`请求队列已满 (最大 ${this.config.queueMaxSize})`);
      }

      // 加入队列
      const position = await this.redis.zadd(queueKey, now, `${now}-${Math.random()}`);

      try {
        // 尝试获取令牌
        const result = await this.acquire(identifier, scope);

        if (result.allowed) {
          // 从队列移除
          await this.redis.zremrangebyscore(queueKey, now - 1, now);
          return result;
        }

        // 等待令牌
        if (result.retryAfterMs > this.config.queueTimeoutMs) {
          await this.redis.zremrangebyscore(queueKey, now - 1, now);
          throw AppError.rateLimit(`队列等待超时 (${this.config.queueTimeoutMs}ms)`);
        }

        // 返回排队信息
        return {
          ...result,
          queued: true,
          position,
          queueSize: queueSize + 1,
          estimatedWaitMs: result.retryAfterMs * position,
        };
      } catch (error) {
        // 异常时从队列移除
        await this.redis.zremrangebyscore(queueKey, now - 1, now);
        throw error;
      }
    }

    // 内存降级
    return this.acquire(identifier, scope);
  }

  /**
   * 获取当前限流状态
   * @param {string} identifier
   * @param {string} [scope]
   * @returns {Promise<object>}
   */
  async getStatus(identifier, scope = 'global') {
    await this.init();

    const key = this._getKey(identifier, scope);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    if (this.redis) {
      const [currentCount, oldestTime] = await Promise.all([
        this.redis.zcount(key, windowStart, now),
        this.redis.zrange(key, 0, 0, 'WITHSCORES'),
      ]);

      return {
        allowed: currentCount < this.config.maxRequests,
        remaining: Math.max(0, this.config.maxRequests - currentCount),
        total: this.config.maxRequests,
        current: currentCount,
        resetAt: oldestTime.length >= 2
          ? parseInt(oldestTime[1]) + this.config.windowMs
          : now + this.config.windowMs,
        strategy: this.config.strategy,
      };
    }

    return {
      allowed: true,
      remaining: this.config.maxRequests,
      total: this.config.maxRequests,
      current: 0,
      resetAt: now + this.config.windowMs,
      strategy: this.config.strategy,
    };
  }

  /**
   * 重置限流状态
   * @param {string} identifier
   * @param {string} [scope]
   */
  async reset(identifier, scope = 'global') {
    await this.init();

    const key = this._getKey(identifier, scope);

    if (this.redis) {
      await this.redis.del(key, `${key}:bucket`, `${key}:queue`);
    }
  }

  /**
   * 清理资源
   */
  async destroy() {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.initialized = false;
    }
  }
}

module.exports = QueueRateLimiter;
