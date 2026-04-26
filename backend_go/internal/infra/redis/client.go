// Package redis Redis基础设施层
// 提供Redis客户端封装，带熔断器保护
package redis

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"github.com/sony/gobreaker"

	"github.com/ai-chat/backend_go/internal/common/errors"
)

// Client Redis客户端封装
// 支持连接池管理、熔断器保护、上下文超时控制
type Client struct {
	config Config
	rdb    *redis.Client
	cb     *CircuitBreaker
	mu     sync.RWMutex
}

// CircuitBreaker 熔断器封装
type CircuitBreaker struct {
	name   string
	cb     *gobreaker.CircuitBreaker
	mu     sync.RWMutex
	closed bool
}

// CircuitBreakerMetrics 熔断器指标
type CircuitBreakerMetrics struct {
	SuccessCount     uint64
	FailureCount     uint64
	TotalRequestCount uint64
	RejectionCount   uint64
	State            string
}

// NewClient 创建Redis客户端
func NewClient(cfg Config) (*Client, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	rdb := redis.NewClient(cfg.ToRedisOptions())

	// 创建熔断器
	cb, err := NewCircuitBreaker("redis", cfg.CircuitBreaker)
	if err != nil {
		rdb.Close()
		return nil, err
	}

	client := &Client{
		config: cfg,
		rdb:    rdb,
		cb:     cb,
	}

	return client, nil
}

// NewCircuitBreaker 创建熔断器
func NewCircuitBreaker(name string, cfg CircuitBreakerConfig) (*CircuitBreaker, error) {
	settings := gobreaker.Settings{
		Name:        name,
		MaxRequests: uint32(cfg.SuccessThreshold),
		Interval:    0,
		Timeout:     time.Duration(cfg.RecoveryTimeout) * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			return counts.ConsecutiveFailures >= uint32(cfg.FailureThreshold)
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			log.Info().
				Str("name", name).
				Str("from", from.String()).
				Str("to", to.String()).
				Msg("Redis熔断器状态变更")
		},
	}

	return &CircuitBreaker{
		name:   name,
		cb:     gobreaker.NewCircuitBreaker(settings),
		closed: true,
	}, nil
}

// Ping 检查连接
func (c *Client) Ping(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, time.Duration(c.config.ConnectTimeout)*time.Millisecond)
	defer cancel()

	return c.ExecuteWithCircuitBreaker(ctx, func() error {
		return c.rdb.Ping(ctx).Err()
	})
}

// ExecuteWithCircuitBreaker 带熔断器的执行
func (c *Client) ExecuteWithCircuitBreaker(ctx context.Context, fn func() error) error {
	result, err := c.cb.cb.Execute(func() (interface{}, error) {
		return nil, fn()
	})
	if err != nil {
		// 检查是否为熔断器开启错误
		if err == gobreaker.ErrOpenState {
			return errors.ErrCircuitOpen
		}
		return err
	}
	_ = result
	return nil
}

// ExecuteWithResult 带熔断器的执行并返回结果
func (c *Client) ExecuteWithResult(ctx context.Context, fn func() (interface{}, error)) (interface{}, error) {
	return c.cb.cb.Execute(fn)
}

// GetClient 获取原生redis.Client
func (c *Client) GetClient() *redis.Client {
	return c.rdb
}

// Close 关闭连接
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.rdb != nil {
		return c.rdb.Close()
	}
	return nil
}

// GetCircuitBreakerState 获取熔断器状态
func (c *Client) GetCircuitBreakerState() string {
	state := c.cb.cb.State()
	switch state {
	case gobreaker.StateClosed:
		return "closed"
	case gobreaker.StateOpen:
		return "open"
	case gobreaker.StateHalfOpen:
		return "half-open"
	default:
		return "unknown"
	}
}

// GetCircuitBreakerMetrics 获取熔断器指标
func (c *Client) GetCircuitBreakerMetrics() CircuitBreakerMetrics {
	counts := c.cb.cb.Counts()
	state := c.cb.cb.State()

	return CircuitBreakerMetrics{
		SuccessCount:      uint64(counts.Requests),
		FailureCount:      uint64(counts.TotalFailures),
		TotalRequestCount: uint64(counts.Requests),
		RejectionCount:    uint64(counts.TotalFailures),
		State:             state.String(),
	}
}

// HealthCheck 健康检查
func (c *Client) HealthCheck(ctx context.Context) map[string]interface{} {
	result := map[string]interface{}{
		"redis":    "unknown",
		"circuit_breaker": map[string]interface{}{
			"state": c.GetCircuitBreakerState(),
			"name":  c.cb.name,
		},
	}

	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	if err := c.Ping(ctx); err != nil {
		result["redis"] = "unhealthy"
		result["error"] = err.Error()
	} else {
		result["redis"] = "healthy"
	}

	return result
}

// ClientWithContext 带上下文的Redis客户端
// 用于需要超时控制的场景
type ClientWithContext struct {
	client *Client
	ctx    context.Context
	cancel context.CancelFunc
}

// WithContext 创建带上下文的客户端
func (c *Client) WithContext(ctx context.Context) (*ClientWithContext, context.CancelFunc) {
	childCtx, cancel := context.WithTimeout(ctx, time.Duration(c.config.ReadTimeout)*time.Millisecond)
	return &ClientWithContext{
		client: c,
		ctx:    childCtx,
		cancel: cancel,
	}, cancel
}

// Get 获取值
func (c *ClientWithContext) Get(key string) (string, error) {
	return c.client.rdb.Get(c.ctx, key).Result()
}

// Set 设置值
func (c *ClientWithContext) Set(key string, value interface{}, expiration time.Duration) error {
	return c.client.rdb.Set(c.ctx, key, value, expiration).Err()
}

// Delete 删除键
func (c *ClientWithContext) Delete(keys ...string) (int64, error) {
	return c.client.rdb.Del(c.ctx, keys...).Result()
}

// Exists 检查键是否存在
func (c *ClientWithContext) Exists(keys ...string) (int64, error) {
	return c.client.rdb.Exists(c.ctx, keys...).Result()
}

// Expire 设置过期时间
func (c *ClientWithContext) Expire(key string, expiration time.Duration) (bool, error) {
	return c.client.rdb.Expire(c.ctx, key, expiration).Result()
}

// TTL 获取剩余生存时间
func (c *ClientWithContext) TTL(key string) (time.Duration, error) {
	return c.client.rdb.TTL(c.ctx, key).Result()
}

// 辅助函数

// formatKey 格式化Redis键
func formatKey(parts ...string) string {
	if len(parts) == 0 {
		return ""
	}
	result := parts[0]
	for i := 1; i < len(parts); i++ {
		result += ":" + parts[i]
	}
	return result
}

// KeyPrefix Redis键前缀常量
const (
	SessionKeyPrefix   = "session"      // 会话: session:{sessionId}
	RateLimitKeyPrefix = "ratelimit"    // 限流: ratelimit:{userId}:{window}
	LockKeyPrefix      = "lock"         // 锁: lock:{resource}
	CacheKeyPrefix      = "cache"        // 缓存: cache:{key}
)

// SessionKey 生成会话键
func SessionKey(sessionId string) string {
	return fmt.Sprintf("%s:%s", SessionKeyPrefix, sessionId)
}

// RateLimitKey 生成限流键
func RateLimitKey(userId string, window string) string {
	return fmt.Sprintf("%s:%s:%s", RateLimitKeyPrefix, userId, window)
}

// LockKey 生成锁键
func LockKey(resource string) string {
	return fmt.Sprintf("%s:%s", LockKeyPrefix, resource)
}

// CacheKey 生成缓存键
func CacheKey(key string) string {
	return fmt.Sprintf("%s:%s", CacheKeyPrefix, key)
}
