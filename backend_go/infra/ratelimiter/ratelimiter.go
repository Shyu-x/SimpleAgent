package ratelimiter

import (
	"sync"
	"time"
)

// 限流器接口
type RateLimiter interface {
	// Allow 检查是否允许请求
	Allow() bool
	// AllowN 检查是否允许N个请求
	AllowN(n int) bool
	// GetMetrics 获取指标
	GetMetrics() Metrics
	// Reset 重置
	Reset()
}

// Metrics 限流器指标
type Metrics struct {
	TotalRequests  int64 // 总请求数
	AllowedCount  int64 // 允许次数
	RejectedCount int64 // 拒绝次数
}

// tokenBucket 令牌桶实现
type tokenBucket struct {
	capacity    int           // 桶容量
	tokens      int           // 当前令牌数
	refillRate  int           // 每秒补充令牌数
	lastRefill  time.Time     // 上次补充时间
	mu          sync.Mutex    // 保护tokens
	metrics     Metrics
}

// Config 限流器配置
type Config struct {
	Capacity   int // 桶容量
	RefillRate int // 每秒补充令牌数
}

// NewTokenBucket 创建令牌桶限流器
func NewTokenBucket(cfg Config) RateLimiter {
	if cfg.Capacity <= 0 {
		cfg.Capacity = 100
	}
	if cfg.RefillRate <= 0 {
		cfg.RefillRate = 10
	}

	return &tokenBucket{
		capacity:   cfg.Capacity,
		tokens:     cfg.Capacity,
		refillRate: cfg.RefillRate,
		lastRefill: time.Now(),
	}
}

// Allow 检查是否允许请求
func (tb *tokenBucket) Allow() bool {
	return tb.AllowN(1)
}

// AllowN 检查是否允许N个请求
func (tb *tokenBucket) AllowN(n int) bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	// 补充令牌
	tb.refill()

	// 检查令牌是否足够
	if tb.tokens >= n {
		tb.tokens -= n
		tb.metrics.AllowedCount++
		tb.metrics.TotalRequests++
		return true
	}

	tb.metrics.RejectedCount++
	tb.metrics.TotalRequests++
	return false
}

// GetMetrics 获取指标
func (tb *tokenBucket) GetMetrics() Metrics {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	return tb.metrics
}

// Reset 重置
func (tb *tokenBucket) Reset() {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	tb.tokens = tb.capacity
	tb.metrics = Metrics{}
}

// refill 补充令牌
func (tb *tokenBucket) refill() {
	now := time.Now()
	elapsed := now.Sub(tb.lastRefill).Seconds()
	tb.lastRefill = now

	// 计算应补充的令牌数
	add := int(elapsed * float64(tb.refillRate))
	if add > 0 {
		tb.tokens = min(tb.capacity, tb.tokens+add)
	}
}

// slidingWindow 滑动窗口限流器
type slidingWindow struct {
	windowSize  time.Duration // 窗口大小
	maxRequests int           // 窗口内最大请求数
	requests    []time.Time   // 请求时间记录
	mu          sync.Mutex
	metrics     Metrics
}

// NewSlidingWindow 创建滑动窗口限流器
func NewSlidingWindow(windowSize time.Duration, maxRequests int) RateLimiter {
	if windowSize <= 0 {
		windowSize = time.Minute
	}
	if maxRequests <= 0 {
		maxRequests = 60
	}

	sw := &slidingWindow{
		windowSize:  windowSize,
		maxRequests: maxRequests,
		requests:    make([]time.Time, 0),
	}

	// 启动清理协程
	go sw.cleanup()

	return sw
}

// Allow 检查是否允许请求
func (sw *slidingWindow) Allow() bool {
	return sw.AllowN(1)
}

// AllowN 检查是否允许N个请求
func (sw *slidingWindow) AllowN(n int) bool {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	now := time.Now()
	windowStart := now.Add(-sw.windowSize)

	// 清理窗口外的请求
	sw.requests = sw.filterRequests(windowStart)

	// 检查是否允许
	if len(sw.requests)+n <= sw.maxRequests {
		for i := 0; i < n; i++ {
			sw.requests = append(sw.requests, now)
		}
		sw.metrics.AllowedCount++
		sw.metrics.TotalRequests++
		return true
	}

	sw.metrics.RejectedCount++
	sw.metrics.TotalRequests++
	return false
}

// GetMetrics 获取指标
func (sw *slidingWindow) GetMetrics() Metrics {
	sw.mu.Lock()
	defer sw.mu.Unlock()
	return sw.metrics
}

// Reset 重置
func (sw *slidingWindow) Reset() {
	sw.mu.Lock()
	defer sw.mu.Unlock()
	sw.requests = sw.requests[:0]
	sw.metrics = Metrics{}
}

// filterRequests 过滤出窗口内的请求
func (sw *slidingWindow) filterRequests(windowStart time.Time) []time.Time {
	result := make([]time.Time, 0, len(sw.requests))
	for _, t := range sw.requests {
		if t.After(windowStart) {
			result = append(result, t)
		}
	}
	return result
}

// cleanup 定期清理过期请求
func (sw *slidingWindow) cleanup() {
	ticker := time.NewTicker(sw.windowSize)
	for range ticker.C {
		sw.mu.Lock()
		windowStart := time.Now().Add(-sw.windowSize)
		sw.requests = sw.filterRequests(windowStart)
		sw.mu.Unlock()
	}
}
