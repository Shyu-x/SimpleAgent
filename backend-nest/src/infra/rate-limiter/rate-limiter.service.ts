/**
 * Rate Limiter Service - 队列式限流服务
 * @description 支持令牌桶、滑动窗口、固定窗口多种限流策略
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';

export enum RateLimitStrategy {
  FIXED_WINDOW = 'fixed_window',
  SLIDING_WINDOW = 'sliding_window',
  TOKEN_BUCKET = 'token_bucket',
}

export interface RateLimiterConfig {
  strategy?: RateLimitStrategy;
  maxRequests?: number;
  windowMs?: number;
  queueMaxSize?: number;
  queueTimeoutMs?: number;
  minInterval?: number;
  burstCapacity?: number;
  keyPrefix?: string;
}

export interface AcquireResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  total: number;
  current: number;
  queued?: boolean;
  position?: number;
  queueSize?: number;
  estimatedWaitMs?: number;
}

@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private config: Required<RateLimiterConfig>;
  private redis: any = null;
  private initialized = false;
  private memoryStore = new Map<string, number>();

  private static readonly DEFAULT_CONFIG: Required<RateLimiterConfig> = {
    strategy: RateLimitStrategy.SLIDING_WINDOW,
    maxRequests: 100,
    windowMs: 60000,
    queueMaxSize: 0,
    queueTimeoutMs: 30000,
    minInterval: 0,
    burstCapacity: 0,
    keyPrefix: 'ratelimit:',
  };

  constructor(config: RateLimiterConfig = {}) {
    this.config = { ...RateLimiterService.DEFAULT_CONFIG, ...config };
  }

  async onModuleDestroy() {
    await this.destroy();
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  private getKey(identifier: string, scope = 'global'): string {
    return `${this.config.keyPrefix}${scope}:${identifier}`;
  }

  async acquire(identifier: string, scope = 'global'): Promise<AcquireResult> {
    await this.init();
    const key = this.getKey(identifier, scope);

    switch (this.config.strategy) {
      case RateLimitStrategy.FIXED_WINDOW:
        return this.acquireFixedWindow(key);
      case RateLimitStrategy.SLIDING_WINDOW:
        return this.acquireSlidingWindow(key);
      case RateLimitStrategy.TOKEN_BUCKET:
        return this.acquireTokenBucket(key);
      default:
        return this.acquireSlidingWindow(key);
    }
  }

  private async acquireFixedWindow(key: string): Promise<AcquireResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / this.config.windowMs) * this.config.windowMs;
    const windowKey = `${key}:${windowStart}`;

    const count = await this.increment(windowKey);
    await this.expire(windowKey, Math.ceil(this.config.windowMs / 1000) + 1);

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

  private async acquireSlidingWindow(key: string): Promise<AcquireResult> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    await this.zremrangebyscore(key, 0, windowStart);
    const currentCount = await this.zcard(key);
    await this.zadd(key, now, `${now}-${Math.random()}`);
    await this.expire(key, Math.ceil(this.config.windowMs / 1000) + 1);

    if (currentCount >= this.config.maxRequests) {
      const oldestEntries = await this.zrange(key, 0, 0, true);
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

  private async acquireTokenBucket(key: string): Promise<AcquireResult> {
    const now = Date.now();
    const bucketKey = `${key}:bucket`;
    const rate = this.config.maxRequests / this.config.windowMs;

    let tokens = this.config.burstCapacity || this.config.maxRequests;
    let lastRefill = now;

    if (this.redis) {
      const bucket = await this.redis.hgetall(bucketKey);
      tokens = parseFloat(bucket.tokens) || this.config.burstCapacity || this.config.maxRequests;
      lastRefill = parseInt(bucket.lastRefill) || now;
    }

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

    tokens -= 1;

    if (this.redis) {
      await this.redis.hmset(bucketKey, {
        tokens: tokens.toString(),
        lastRefill: lastRefill.toString(),
      });
      await this.expire(bucketKey, Math.ceil(this.config.windowMs / 1000) + 1);
    }

    return {
      allowed: true,
      remaining: Math.floor(tokens),
      retryAfterMs: 0,
      total: this.config.burstCapacity || this.config.maxRequests,
      current: Math.floor((this.config.burstCapacity || this.config.maxRequests) - tokens),
    };
  }

  private async memoryFallback(): Promise<AcquireResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / this.config.windowMs) * this.config.windowMs;
    const windowKey = `memory:${windowStart}`;

    const count = (this.memoryStore.get(windowKey) || 0) + 1;
    this.memoryStore.set(windowKey, count);

    if (count === 1) {
      setTimeout(() => {
        this.memoryStore.delete(windowKey);
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

  async enqueue(identifier: string, scope = 'global'): Promise<AcquireResult> {
    if (this.config.queueMaxSize === 0) {
      return this.acquire(identifier, scope);
    }

    await this.init();
    const queueKey = `${this.getKey(identifier, scope)}:queue`;
    const now = Date.now();

    const queueSize = this.redis ? await this.zcard(queueKey) : 0;

    if (queueSize >= this.config.queueMaxSize) {
      throw new Error(`请求队列已满 (最大 ${this.config.queueMaxSize})`);
    }

    const position = this.redis ? await this.zadd(queueKey, now, `${now}-${Math.random()}`) : 1;

    try {
      const result = await this.acquire(identifier, scope);

      if (result.allowed) {
        await this.zremrangebyscore(queueKey, now - 1, now);
        return result;
      }

      if (result.retryAfterMs > this.config.queueTimeoutMs) {
        await this.zremrangebyscore(queueKey, now - 1, now);
        throw new Error(`队列等待超时 (${this.config.queueTimeoutMs}ms)`);
      }

      return {
        ...result,
        queued: true,
        position,
        queueSize: queueSize + 1,
        estimatedWaitMs: result.retryAfterMs * position,
      };
    } catch (error) {
      await this.zremrangebyscore(queueKey, now - 1, now);
      throw error;
    }
  }

  async getStatus(identifier: string, scope = 'global'): Promise<{
    allowed: boolean;
    remaining: number;
    total: number;
    current: number;
    resetAt: number;
    strategy: RateLimitStrategy;
  }> {
    await this.init();

    const key = this.getKey(identifier, scope);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    if (this.redis) {
      const [currentCount, oldestEntries] = await Promise.all([
        this.zcount(key, windowStart, now),
        this.zrange(key, 0, 0, true),
      ]);

      return {
        allowed: currentCount < this.config.maxRequests,
        remaining: Math.max(0, this.config.maxRequests - currentCount),
        total: this.config.maxRequests,
        current: currentCount,
        resetAt: oldestEntries.length >= 2
          ? parseInt(oldestEntries[1]) + this.config.windowMs
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

  async reset(identifier: string, scope = 'global'): Promise<void> {
    await this.init();
    const key = this.getKey(identifier, scope);

    if (this.redis) {
      await this.redis.del(key, `${key}:bucket`, `${key}:queue`);
    }
  }

  private async increment(key: string): Promise<number> {
    if (!this.redis) {
      return (this.memoryStore.get(key) || 0) + 1;
    }
    return this.redis.incr(key);
  }

  private async expire(key: string, seconds: number): Promise<void> {
    if (!this.redis) return;
    await this.redis.expire(key, seconds);
  }

  private async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.redis) return 1;
    return this.redis.zadd(key, score, member);
  }

  private async zcard(key: string): Promise<number> {
    if (!this.redis) return 0;
    return this.redis.zcard(key);
  }

  private async zcount(key: string, min: number, max: number): Promise<number> {
    if (!this.redis) return 0;
    return this.redis.zcount(key, min, max);
  }

  private async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[]> {
    if (!this.redis) return [];
    return this.redis.zrange(key, start, stop, withScores ? 'WITHSCORES' : undefined);
  }

  private async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    if (!this.redis) return 0;
    return this.redis.zremrangebyscore(key, min, max);
  }

  async destroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.initialized = false;
    }
  }
}
