/**
 * Rate Limiter Strategy - 限流策略枚举
 * 定义可用的限流算法策略
 */
export enum RateLimitStrategy {
  /** 固定窗口：每个时间窗口独立计算请求数 */
  FIXED_WINDOW = 'fixed_window',
  /** 滑动窗口：基于时间滑动平滑计算请求数 */
  SLIDING_WINDOW = 'sliding_window',
  /** 令牌桶：支持突发流量，令牌以固定速率补充 */
  TOKEN_BUCKET = 'token_bucket',
}

/**
 * Rate Limiter Config - 限流器配置接口
 */
export interface RateLimiterConfig {
  /** 限流策略（默认：滑动窗口） */
  strategy?: RateLimitStrategy;
  /** 时间窗口内最大请求数（默认：100） */
  maxRequests?: number;
  /** 时间窗口大小（毫秒，默认：60000） */
  windowMs?: number;
  /** 令牌桶容量/突发容量（默认：maxRequests） */
  burstCapacity?: number;
  /** 令牌补充速率（请求/毫秒） */
  refillRate?: number;
  /** 缓存 key 前缀 */
  keyPrefix?: string;
}

/**
 * Acquire Result - 获取令牌结果
 * 描述请求是否被允许以及相关统计信息
 */
export interface AcquireResult {
  /** 是否允许请求通过 */
  allowed: boolean;
  /** 剩余可用请求数 */
  remaining: number;
  /** 重试等待时间（毫秒） */
  retryAfterMs: number;
  /** 时间窗口内总配额 */
  total: number;
  /** 当前请求计数 */
  current: number;
}

/**
 * Rate Limiter Key Generator - Key 生成器类型
 * 用于从请求上下文中提取限流标识
 */
export type KeyGenerator = (context: RequestContext) => string;

/**
 * Request Context - 请求上下文
 * 用于生成限流 key 的上下文信息
 */
export interface RequestContext {
  /** 用户 ID（如果有） */
  userId?: string;
  /** IP 地址 */
  ip?: string;
  /** 请求路径 */
  path?: string;
  /** 请求方法 */
  method?: string;
  /** 自定义标识 */
  identifier?: string;
  /** 请求头 */
  headers?: Record<string, string>;
}
