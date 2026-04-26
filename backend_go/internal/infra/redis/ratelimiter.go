// Package redis Redis基础设施层
// 提供分布式限流服务 - 滑动窗口算法实现
package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/ai-chat/backend_go/internal/common/errors"
)

// RateLimitConfig 限流配置
type RateLimitConfig struct {
	// 速率 (请求数/时间单位)
	Rate int
	// 时间窗口 (秒)
	Window int
	// 突发容量
	Burst int
	// 是否启用
	Enabled bool
}

// DefaultRateLimitConfig 默认配置
func DefaultRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		Rate:    100,
		Window:  60,
		Burst:   10,
		Enabled: true,
	}
}

// RateLimiter 分布式限流器
// 使用滑动窗口算法实现精确限流
type RateLimiter struct {
	client *Client
	config RateLimitConfig
}

// NewRateLimiter 创建限流器
func NewRateLimiter(client *Client, config RateLimitConfig) *RateLimiter {
	if config.Window <= 0 {
		config.Window = 60
	}
	if config.Rate <= 0 {
		config.Rate = 100
	}
	return &RateLimiter{
		client: client,
		config: config,
	}
}

// Allow 检查是否允许请求
func (r *RateLimiter) Allow(ctx context.Context, key string) (bool, error) {
	return r.AllowWithLimit(ctx, key, r.config.Rate, r.config.Window)
}

// AllowWithLimit 使用自定义速率检查限流
func (r *RateLimiter) AllowWithLimit(ctx context.Context, key string, rate int, windowSec int) (bool, error) {
	if !r.config.Enabled {
		return true, nil
	}

	rateKey := RateLimitKey(key, fmt.Sprintf("%d", windowSec))

	now := time.Now().Unix()
	windowStart := now - int64(windowSec)

	err := r.client.ExecuteWithCircuitBreaker(ctx, func() error {
		pipe := r.client.rdb.Pipeline()

		// 移除窗口外的记录
		pipe.ZRemRangeByScore(ctx, rateKey, "0", fmt.Sprintf("%d", windowStart))

		// 添加当前请求
		pipe.ZAdd(ctx, rateKey, redis.Z{
			Score:  float64(now),
			Member: fmt.Sprintf("%d", now*1000000+time.Now().UnixNano()%1000000), // 唯一成员
		})

		// 设置过期时间
		pipe.Expire(ctx, rateKey, time.Duration(windowSec)*time.Second)

		// 计算窗口内请求数
		pipe.ZCard(ctx, rateKey)

		_, err := pipe.Exec(ctx)
		return err
	})
	if err != nil {
		log.Error().Err(err).Str("key", key).Msg("RateLimiter.Allow失败")
		return false, errors.ErrRedis("限流检查失败", err)
	}

	// 获取当前请求数
	count, err := r.client.rdb.ZCard(ctx, rateKey).Result()
	if err != nil {
		log.Error().Err(err).Str("key", key).Msg("RateLimiter.Allow获取计数失败")
		return false, errors.ErrRedis("获取限流计数失败", err)
	}

	allowed := int(count) <= rate
	if !allowed {
		log.Warn().
			Str("key", key).
			Int("count", int(count)).
			Int("rate", rate).
			Msg("RateLimiter限流触发")
	}

	return allowed, nil
}

// AllowWithBurst 使用突发容量检查限流
func (r *RateLimiter) AllowWithBurst(ctx context.Context, key string, burst int) (bool, error) {
	if !r.config.Enabled {
		return true, nil
	}

	rateKey := RateLimitKey(key, fmt.Sprintf("%d", r.config.Window))

	now := time.Now().Unix()
	windowStart := now - int64(r.config.Window)

	err := r.client.ExecuteWithCircuitBreaker(ctx, func() error {
		pipe := r.client.rdb.Pipeline()

		// 移除窗口外的记录
		pipe.ZRemRangeByScore(ctx, rateKey, "0", fmt.Sprintf("%d", windowStart))

		// 添加当前请求
		pipe.ZAdd(ctx, rateKey, redis.Z{
			Score:  float64(now),
			Member: fmt.Sprintf("%d", now*1000000+time.Now().UnixNano()%1000000),
		})

		// 设置过期时间
		pipe.Expire(ctx, rateKey, time.Duration(r.config.Window)*time.Second)

		_, err := pipe.Exec(ctx)
		return err
	})
	if err != nil {
		log.Error().Err(err).Str("key", key).Msg("RateLimiter.AllowWithBurst失败")
		return false, errors.ErrRedis("限流检查失败", err)
	}

	count, err := r.client.rdb.ZCard(ctx, rateKey).Result()
	if err != nil {
		return false, errors.ErrRedis("获取限流计数失败", err)
	}

	// 突发容量 = rate + burst
	allowed := int(count) <= r.config.Rate+burst
	return allowed, nil
}

// GetCurrentCount 获取当前时间窗口内的请求数
func (r *RateLimiter) GetCurrentCount(ctx context.Context, key string) (int64, error) {
	rateKey := RateLimitKey(key, fmt.Sprintf("%d", r.config.Window))

	now := time.Now().Unix()
	windowStart := now - int64(r.config.Window)

	var count int64
	err := r.client.ExecuteWithCircuitBreaker(ctx, func() error {
		// 先清理过期的
		r.client.rdb.ZRemRangeByScore(ctx, rateKey, "0", fmt.Sprintf("%d", windowStart))

		var err error
		count, err = r.client.rdb.ZCard(ctx, rateKey).Result()
		return err
	})
	if err != nil {
		return 0, errors.ErrRedis("获取请求计数失败", err)
	}
	return count, nil
}

// GetRemaining 获取剩余可用请求数
func (r *RateLimiter) GetRemaining(ctx context.Context, key string) (int64, error) {
	count, err := r.GetCurrentCount(ctx, key)
	if err != nil {
		return 0, err
	}
	remaining := int64(r.config.Rate) - count
	if remaining < 0 {
		return 0, nil
	}
	return remaining, nil
}

// Reset 重置限流计数器
func (r *RateLimiter) Reset(ctx context.Context, key string) error {
	rateKey := RateLimitKey(key, fmt.Sprintf("%d", r.config.Window))

	err := r.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return r.client.rdb.Del(ctx, rateKey).Err()
	})
	if err != nil {
		return errors.ErrRedis("重置限流失败", err)
	}
	return nil
}

// MultiAllow 批量检查限流
func (r *RateLimiter) MultiAllow(ctx context.Context, keys []string) ([]bool, error) {
	results := make([]bool, len(keys))
	for i, key := range keys {
		allowed, err := r.Allow(ctx, key)
		if err != nil {
			return nil, err
		}
		results[i] = allowed
	}
	return results, nil
}

// TokenBucketLimiter 令牌桶限流器
// 基于Redis实现的令牌桶算法,支持分布式
type TokenBucketLimiter struct {
	client     *Client
	key        string
	capacity   int64  // 桶容量
	refillRate int64  // 每秒补充令牌数
	lastRefill int64  // 上次补充时间
	mu         int64  // 互斥锁(简化实现)
}

// NewTokenBucketLimiter 创建令牌桶限流器
func NewTokenBucketLimiter(client *Client, key string, capacity, refillRate int64) *TokenBucketLimiter {
	return &TokenBucketLimiter{
		client:     client,
		key:        fmt.Sprintf("token_bucket:%s", key),
		capacity:   capacity,
		refillRate: refillRate,
		lastRefill: time.Now().Unix(),
	}
}

// Allow 请求一个令牌
func (tb *TokenBucketLimiter) Allow(ctx context.Context) (bool, error) {
	return tb.AllowN(ctx, 1)
}

// AllowN 请求n个令牌
func (tb *TokenBucketLimiter) AllowN(ctx context.Context, n int64) (bool, error) {
	key := tb.key

	err := tb.client.ExecuteWithCircuitBreaker(ctx, func() error {
		luaScript := `
			local key = KEYS[1]
			local capacity = tonumber(ARGV[1])
			local refill_rate = tonumber(ARGV[2])
			local now = tonumber(ARGV[3])
			local requested = tonumber(ARGV[4])

			-- 获取当前状态
			local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
			local tokens = tonumber(bucket[1]) or capacity
			local last_refill = tonumber(bucket[2]) or now

			-- 计算应该补充的令牌
			local elapsed = now - last_refill
			local added = elapsed * refill_rate
			tokens = math.min(capacity, tokens + added)

			-- 检查是否足够
			local allowed = 0
			if tokens >= requested then
				tokens = tokens - requested
				allowed = 1
			end

			-- 更新状态
			redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
			redis.call('EXPIRE', key, 60)

			return {allowed, tokens}
		`

		now := time.Now().Unix()
		result, err := tb.client.rdb.Eval(ctx, luaScript, []string{key},
			tb.capacity, tb.refillRate, now, n).Slice()
		if err != nil {
			return err
		}

		allowed := result[0].(int64)
		if allowed == 0 {
			return fmt.Errorf("令牌不足")
		}
		return nil
	})
	if err != nil {
		return false, errors.ErrRedis("令牌桶限流失败", err)
	}
	return true, nil
}

// GetTokens 获取当前令牌数
func (tb *TokenBucketLimiter) GetTokens(ctx context.Context) (int64, error) {
	key := tb.key

	var tokens int64
	err := tb.client.ExecuteWithCircuitBreaker(ctx, func() error {
		result, err := tb.client.rdb.HMGet(ctx, key, "tokens").Result()
		if err != nil {
			return err
		}
		if result[0] != nil {
			tokens = int64(result[0].(float64))
		} else {
			tokens = tb.capacity
		}
		return nil
	})
	if err != nil {
		return 0, errors.ErrRedis("获取令牌数失败", err)
	}
	return tokens, nil
}

// Refill 手动补充令牌
func (tb *TokenBucketLimiter) Refill(ctx context.Context, tokens int64) error {
	key := tb.key

	err := tb.client.ExecuteWithCircuitBreaker(ctx, func() error {
		luaScript := `
			local key = KEYS[1]
			local capacity = tonumber(ARGV[1])
			local add_tokens = tonumber(ARGV[2])
			local now = tonumber(ARGV[3])

			local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
			local current_tokens = tonumber(bucket[1]) or capacity
			local last_refill = tonumber(bucket[2]) or now

			local elapsed = now - last_refill
			local added = elapsed * tonumber(ARGV[4])
			current_tokens = math.min(capacity, current_tokens + added)
			current_tokens = math.min(capacity, current_tokens + add_tokens)

			redis.call('HMSET', key, 'tokens', current_tokens, 'last_refill', now)
			redis.call('EXPIRE', key, 60)

			return current_tokens
		`

		now := time.Now().Unix()
		_, err := tb.client.rdb.Eval(ctx, luaScript, []string{key},
			tb.capacity, tokens, now, tb.refillRate).Result()
		return err
	})
	if err != nil {
		return errors.ErrRedis("补充令牌失败", err)
	}
	return nil
}

// SlidingWindowLogLimiter 滑动窗口日志限流器
// 使用有序集合实现精确的滑动窗口限流
type SlidingWindowLogLimiter struct {
	client *Client
	key    string
	limit  int64
	window time.Duration
}

// NewSlidingWindowLogLimiter 创建滑动窗口日志限流器
func NewSlidingWindowLogLimiter(client *Client, key string, limit int64, window time.Duration) *SlidingWindowLogLimiter {
	return &SlidingWindowLogLimiter{
		client: client,
		key:    fmt.Sprintf("swl:%s", key),
		limit:  limit,
		window: window,
	}
}

// Allow 检查是否允许
func (sw *SlidingWindowLogLimiter) Allow(ctx context.Context) (bool, error) {
	now := time.Now()
	windowStart := now.Add(-sw.window).UnixMilli()
	member := fmt.Sprintf("%d-%d", now.UnixNano(), now.UnixMicro())

	err := sw.client.ExecuteWithCircuitBreaker(ctx, func() error {
		pipe := sw.client.rdb.Pipeline()

		// 移除窗口外的记录
		pipe.ZRemRangeByScore(ctx, sw.key, "0", fmt.Sprintf("%d", windowStart))

		// 添加当前请求
		pipe.ZAdd(ctx, sw.key, redis.Z{
			Score:  float64(now.UnixMilli()),
			Member: member,
		})

		// 获取当前计数
		pipe.ZCard(ctx, sw.key)

		// 设置过期
		pipe.Expire(ctx, sw.key, sw.window+time.Second)

		_, err := pipe.Exec(ctx)
		return err
	})
	if err != nil {
		return false, errors.ErrRedis("滑动窗口限流失败", err)
	}

	count, err := sw.client.rdb.ZCard(ctx, sw.key).Result()
	if err != nil {
		return false, errors.ErrRedis("获取计数失败", err)
	}

	return count <= sw.limit, nil
}

// GetCount 获取当前窗口内的请求数
func (sw *SlidingWindowLogLimiter) GetCount(ctx context.Context) (int64, error) {
	now := time.Now()
	windowStart := now.Add(-sw.window).UnixMilli()

	var count int64
	err := sw.client.ExecuteWithCircuitBreaker(ctx, func() error {
		// 先清理
		sw.client.rdb.ZRemRangeByScore(ctx, sw.key, "0", fmt.Sprintf("%d", windowStart))
		var err error
		count, err = sw.client.rdb.ZCard(ctx, sw.key).Result()
		return err
	})
	if err != nil {
		return 0, errors.ErrRedis("获取计数失败", err)
	}
	return count, nil
}
