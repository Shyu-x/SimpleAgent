/**
 * 速率限制中间件
 * 基于IP的请求限流
 */

package middleware

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimitConfig 限流配置
type RateLimitConfig struct {
	RequestsPerMinute int
	RequestsPerHour   int
	RequestsPerDay    int
	BurstSize         int // 突发容量
}

// DefaultRateLimitConfig 默认限流配置
func DefaultRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		RequestsPerMinute: 60,
		RequestsPerHour:   1000,
		RequestsPerDay:    10000,
		BurstSize:         10,
	}
}

// clientTracking 客户端追踪信息
type clientTracking struct {
	MinuteCount int
	HourCount   int
	DayCount    int
	LastMinute  time.Time
	LastHour    time.Time
	LastDay     time.Time
	mu          sync.Mutex
}

// RateLimiter 速率限制器
type RateLimiter struct {
	config          RateLimitConfig
	clients         sync.Map
	cleanupInterval time.Duration
	stopCleanup     chan struct{}
}

// NewRateLimiter 创建速率限制器
func NewRateLimiter(config RateLimitConfig) *RateLimiter {
	rl := &RateLimiter{
		config:          config,
		cleanupInterval: time.Hour,
		stopCleanup:     make(chan struct{}),
	}

	// 启动清理goroutine
	go rl.cleanup()

	return rl
}

// cleanup 定期清理过期数据
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(rl.cleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			now := time.Now()
			rl.clients.Range(func(key, value interface{}) bool {
				tracking := value.(*clientTracking)
				tracking.mu.Lock()
				// 清理超过1天的数据
				if now.Sub(tracking.LastDay) > 24*time.Hour {
					rl.clients.Delete(key)
				}
				tracking.mu.Unlock()
				return true
			})
		case <-rl.stopCleanup:
			return
		}
	}
}

// Stop 停止限流器
func (rl *RateLimiter) Stop() {
	close(rl.stopCleanup)
}

// getOrCreateTracking 获取或创建客户端追踪信息
func (rl *RateLimiter) getOrCreateTracking(ip string) *clientTracking {
	tracked, ok := rl.clients.Load(ip)
	if ok {
		return tracked.(*clientTracking)
	}

	tracking := &clientTracking{
		LastMinute: time.Now().Truncate(time.Minute),
		LastHour:   time.Now().Truncate(time.Hour),
		LastDay:    time.Now().Truncate(24 * time.Hour),
	}
	rl.clients.Store(ip, tracking)
	return tracking
}

// Allow 检查是否允许请求
func (rl *RateLimiter) Allow(ip string) (allowed bool, remaining int, resetTime time.Time) {
	tracking := rl.getOrCreateTracking(ip)
	now := time.Now()

	tracking.mu.Lock()
	defer tracking.mu.Unlock()

	// 重置计数器
	currentMinute := now.Truncate(time.Minute)
	currentHour := now.Truncate(time.Hour)
	currentDay := now.Truncate(24 * time.Hour)

	if currentMinute.After(tracking.LastMinute) {
		tracking.MinuteCount = 0
		tracking.LastMinute = currentMinute
	}
	if currentHour.After(tracking.LastHour) {
		tracking.HourCount = 0
		tracking.LastHour = currentHour
	}
	if currentDay.After(tracking.LastDay) {
		tracking.DayCount = 0
		tracking.LastDay = currentDay
	}

	// 检查各层级限制
	if tracking.MinuteCount >= rl.config.RequestsPerMinute {
		return false, 0, tracking.LastMinute.Add(time.Minute)
	}
	if tracking.HourCount >= rl.config.RequestsPerHour {
		return false, 0, tracking.LastHour.Add(time.Hour)
	}
	if tracking.DayCount >= rl.config.RequestsPerDay {
		return false, 0, tracking.LastDay.Add(24 * time.Hour)
	}

	// 增加计数
	tracking.MinuteCount++
	tracking.HourCount++
	tracking.DayCount++

	// 计算剩余配额
	remaining = rl.config.RequestsPerMinute - tracking.MinuteCount
	if remaining < 0 {
		remaining = 0
	}

	return true, remaining, tracking.LastMinute.Add(time.Minute)
}

// IPBasedRateLimit 基于IP的限流中间件
func IPBasedRateLimit(limiter *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := getClientIP(c)

		allowed, remaining, resetTime := limiter.Allow(ip)

		// 设置响应头
		c.Header("X-RateLimit-Limit-Minute", strconv.Itoa(limiter.config.RequestsPerMinute))
		c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))
		c.Header("X-RateLimit-Reset", strconv.FormatInt(resetTime.Unix(), 10))

		if !allowed {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": gin.H{
					"message": "请求过于频繁，请稍后再试",
					"type":    "rate_limit_error",
					"detail":  "已达到每分钟请求上限",
				},
			})
			return
		}

		c.Next()
	}
}

// RateLimitByEndpoint 按端点限流
type EndpointRateLimit struct {
	limiter  *RateLimiter
	endpoint string
}

// NewEndpointRateLimit 创建端点限流器
func NewEndpointRateLimit(endpoint string, config RateLimitConfig) *EndpointRateLimit {
	return &EndpointRateLimit{
		limiter:  NewRateLimiter(config),
		endpoint: endpoint,
	}
}

// Middleware 返回中间件
func (e *EndpointRateLimit) Middleware() gin.HandlerFunc {
	return IPBasedRateLimit(e.limiter)
}
