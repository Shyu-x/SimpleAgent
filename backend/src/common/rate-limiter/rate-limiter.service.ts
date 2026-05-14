/**
 * Rate Limiter Service - 时间窗口限流服务
 * 实现固定窗口、滑动窗口、令牌桶三种限流策略
 *
 * 设计理念：
 * - 无外部依赖（Redis），使用内存存储
 * - 支持可配置的 keyGenerator
 * - 返回 remaining 和 retryAfter 信息
 */
import {
  RateLimiterConfig,
  RateLimitStrategy,
  AcquireResult,
  RequestContext,
  KeyGenerator,
} from './rate-limiter.types';

export interface RateLimiterOptions {
  /** 限流策略（默认：滑动窗口） */
  strategy?: RateLimitStrategy;
  /** 时间窗口内最大请求数 */
  maxRequests?: number;
  /** 时间窗口大小（毫秒） */
  windowMs?: number;
  /** 令牌桶容量 */
  burstCapacity?: number;
  /** 令牌补充速率（请求/秒） */
  refillRate?: number;
  /** 缓存 key 前缀 */
  keyPrefix?: string;
  /** 自定义 key 生成器 */
  keyGenerator?: KeyGenerator;
  /** 默认 scope */
  defaultScope?: string;
}

/**
 * 滑动窗口记录条目
 */
interface WindowEntry {
  timestamp: number;
  id: string;
}

/**
 * 令牌桶状态
 */
interface BucketState {
  tokens: number;
  lastRefill: number;
}

/**
 * RateLimiterService - 时间窗口限流服务
 *
 * 使用示例：
 * ```typescript
 * // 创建限流器（每分钟最多 100 请求）
 * const limiter = new RateLimiterService({
 *   maxRequests: 100,
 *   windowMs: 60000,
 * });
 *
 * // 检查请求是否允许
 * const result = await limiter.acquire({ ip: '192.168.1.1' });
 * if (!result.allowed) {
 *   return res.status(429).json({
 *     error: 'Too Many Requests',
 *     retryAfter: result.retryAfterMs,
 *   });
 * }
 * ```
 */
export class RateLimiterService {
  private readonly strategy: RateLimitStrategy;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly burstCapacity: number;
  private readonly refillRate: number;
  private readonly keyPrefix: string;
  private readonly keyGenerator: KeyGenerator;
  private readonly defaultScope: string;

  // 存储结构
  private readonly slidingWindowStore = new Map<string, WindowEntry[]>();
  private readonly fixedWindowStore = new Map<string, number>();
  private readonly tokenBucketStore = new Map<string, BucketState>();

  private static readonly DEFAULT_OPTIONS = {
    strategy: RateLimitStrategy.SLIDING_WINDOW,
    maxRequests: 100,
    windowMs: 60000,
    burstCapacity: 100,
    refillRate: 100 / 60000, // 每毫秒补充的令牌数
    keyPrefix: 'ratelimit:',
    defaultScope: 'global',
  };

  constructor(options: RateLimiterOptions = {}) {
    this.strategy = options.strategy ?? RateLimiterService.DEFAULT_OPTIONS.strategy;
    this.maxRequests = options.maxRequests ?? RateLimiterService.DEFAULT_OPTIONS.maxRequests;
    this.windowMs = options.windowMs ?? RateLimiterService.DEFAULT_OPTIONS.windowMs;
    this.burstCapacity = options.burstCapacity ?? RateLimiterService.DEFAULT_OPTIONS.burstCapacity;
    this.refillRate = options.refillRate ?? RateLimiterService.DEFAULT_OPTIONS.refillRate;
    this.keyPrefix = options.keyPrefix ?? RateLimiterService.DEFAULT_OPTIONS.keyPrefix;
    this.defaultScope = options.defaultScope ?? 'global';
    this.keyGenerator = options.keyGenerator ?? this.defaultKeyGenerator;
  }

  /**
   * 默认 key 生成器
   * 使用 IP 地址作为限流标识
   */
  private defaultKeyGenerator: KeyGenerator = (context: RequestContext): string => {
    return context.ip || context.identifier || 'anonymous';
  };

  /**
   * 获取限流 key
   */
  private getKey(identifier: string, scope?: string): string {
    return `${this.keyPrefix}${scope || this.defaultScope}:${identifier}`;
  }

  /**
   * 获取存储 key（不含前缀）
   */
  private getIdentifier(context: RequestContext): string {
    return this.keyGenerator(context);
  }

  /**
   * 请求计数
   * @param context 请求上下文
   * @param scope 限流范围（如 'global', 'user', 'ip'）
   */
  async acquire(context: RequestContext, scope?: string): Promise<AcquireResult> {
    const identifier = this.getIdentifier(context);
    const key = this.getKey(identifier, scope);

    switch (this.strategy) {
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

  /**
   * 固定窗口策略
   * 将时间划分为固定大小的窗口，每窗口独立计数
   */
  private async acquireFixedWindow(key: string): Promise<AcquireResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const windowKey = `${key}:${windowStart}`;

    // 清理过期窗口
    this.cleanupExpiredFixedWindows(key, windowStart);

    // 获取当前计数
    let count = this.fixedWindowStore.get(windowKey) || 0;

    if (count >= this.maxRequests) {
      const retryAfterMs = this.windowMs - (now - windowStart);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs,
        total: this.maxRequests,
        current: count,
      };
    }

    // 增加计数
    this.fixedWindowStore.set(windowKey, count + 1);

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - count - 1),
      retryAfterMs: 0,
      total: this.maxRequests,
      current: count + 1,
    };
  }

  /**
   * 滑动窗口策略
   * 使用加权滑动窗口算法，平滑限流
   */
  private async acquireSlidingWindow(key: string): Promise<AcquireResult> {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // 获取当前窗口记录
    let entries = this.slidingWindowStore.get(key);
    if (!entries) {
      entries = [];
      this.slidingWindowStore.set(key, entries);
    }

    // 清理过期记录
    const validEntries = entries.filter((entry) => entry.timestamp > windowStart);

    // 检查是否超限
    if (validEntries.length >= this.maxRequests) {
      // 获取最旧的记录时间计算重试时间
      const oldestTimestamp = validEntries[0].timestamp;
      const retryAfterMs = Math.max(0, oldestTimestamp + this.windowMs - now);

      return {
        allowed: false,
        remaining: 0,
        retryAfterMs,
        total: this.maxRequests,
        current: validEntries.length,
      };
    }

    // 添加新记录
    validEntries.push({
      timestamp: now,
      id: `${now}-${Math.random().toString(36).substr(2, 9)}`,
    });

    this.slidingWindowStore.set(key, validEntries);

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - validEntries.length),
      retryAfterMs: 0,
      total: this.maxRequests,
      current: validEntries.length,
    };
  }

  /**
   * 令牌桶策略
   * 支持突发流量，令牌以固定速率补充
   */
  private async acquireTokenBucket(key: string): Promise<AcquireResult> {
    const now = Date.now();
    const bucketKey = `${key}:bucket`;

    // 获取或初始化桶状态
    let bucket = this.tokenBucketStore.get(bucketKey);
    if (!bucket) {
      bucket = {
        tokens: this.burstCapacity,
        lastRefill: now,
      };
      this.tokenBucketStore.set(bucketKey, bucket);
    }

    // 计算应该补充的令牌数
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    bucket.tokens = Math.min(this.burstCapacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // 检查是否有可用令牌
    if (bucket.tokens < 1) {
      const waitTimeMs = Math.ceil((1 - bucket.tokens) / this.refillRate);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: waitTimeMs,
        total: this.burstCapacity,
        current: Math.floor(this.burstCapacity - bucket.tokens),
      };
    }

    // 消耗一个令牌
    bucket.tokens -= 1;

    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      retryAfterMs: 0,
      total: this.burstCapacity,
      current: Math.floor(this.burstCapacity - bucket.tokens),
    };
  }

  /**
   * 清理过期的固定窗口数据
   */
  private cleanupExpiredFixedWindows(keyPrefix: string, currentWindowStart: number): void {
    const keysToDelete: string[] = [];

    this.fixedWindowStore.forEach((_, key) => {
      // 提取窗口开始时间
      const colonIndex = key.lastIndexOf(':');
      if (colonIndex > this.keyPrefix.length) {
        const windowStart = parseInt(key.substring(colonIndex + 1));
        // 清理超过两个窗口的旧数据
        if (windowStart < currentWindowStart - this.windowMs) {
          keysToDelete.push(key);
        }
      }
    });

    keysToDelete.forEach((key) => this.fixedWindowStore.delete(key));
  }

  /**
   * 获取限流状态
   * @param context 请求上下文
   * @param scope 限流范围
   */
  async getStatus(context: RequestContext, scope?: string): Promise<{
    allowed: boolean;
    remaining: number;
    total: number;
    current: number;
    resetAt: number;
    strategy: RateLimitStrategy;
  }> {
    const identifier = this.getIdentifier(context);
    const key = this.getKey(identifier, scope);
    const now = Date.now();

    let current: number;

    switch (this.strategy) {
      case RateLimitStrategy.SLIDING_WINDOW: {
        const entries = this.slidingWindowStore.get(key) || [];
        const windowStart = now - this.windowMs;
        current = entries.filter((e) => e.timestamp > windowStart).length;
        break;
      }
      case RateLimitStrategy.TOKEN_BUCKET: {
        const bucket = this.tokenBucketStore.get(`${key}:bucket`);
        current = bucket ? Math.floor(this.burstCapacity - bucket.tokens) : 0;
        break;
      }
      default: {
        const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
        current = this.fixedWindowStore.get(`${key}:${windowStart}`) || 0;
      }
    }

    return {
      allowed: current < this.maxRequests,
      remaining: Math.max(0, this.maxRequests - current),
      total: this.maxRequests,
      current,
      resetAt: now + this.windowMs,
      strategy: this.strategy,
    };
  }

  /**
   * 重置限流记录
   * @param context 请求上下文
   * @param scope 限流范围
   */
  async reset(context: RequestContext, scope?: string): Promise<void> {
    const identifier = this.getIdentifier(context);
    const key = this.getKey(identifier, scope);

    this.slidingWindowStore.delete(key);
    this.tokenBucketStore.delete(`${key}:bucket`);

    // 清理固定窗口
    const keysToDelete: string[] = [];
    this.fixedWindowStore.forEach((_, k) => {
      if (k.startsWith(key)) {
        keysToDelete.push(k);
      }
    });
    keysToDelete.forEach((k) => this.fixedWindowStore.delete(k));
  }

  /**
   * 清理所有限流记录
   */
  clear(): void {
    this.slidingWindowStore.clear();
    this.fixedWindowStore.clear();
    this.tokenBucketStore.clear();
  }

  /**
   * 获取存储统计信息
   */
  getStorageStats(): {
    slidingWindowEntries: number;
    fixedWindowEntries: number;
    tokenBucketEntries: number;
  } {
    let slidingWindowEntries = 0;
    this.slidingWindowStore.forEach((entries) => {
      slidingWindowEntries += entries.length;
    });

    return {
      slidingWindowEntries,
      fixedWindowEntries: this.fixedWindowStore.size,
      tokenBucketEntries: this.tokenBucketStore.size,
    };
  }
}
