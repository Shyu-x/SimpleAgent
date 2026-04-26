// Package ratelimiter 限流器实现
// 支持内存存储和Redis存储，支持Token Bucket和滑动窗口日志算法
package ratelimiter

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/redis/go-redis/v9"

	appErrors "github.com/ai-chat/backend_go/internal/common/errors"
)

// 算法类型
type AlgorithmType int

const (
	AlgorithmTokenBucket AlgorithmType = iota // Token Bucket (令牌桶)
	AlgorithmSlidingWindow                    // Sliding Window Log (滑动窗口日志)
)

// Level 限流级别
type Level int

const (
	LevelGlobal Level = iota // 全局限流
	LevelUser               // 用户级限流
	LevelEndpoint           // 接口级限流
)

// Config 限流器配置
type Config struct {
	// 速率 (如 "100/s", "1000/m", "100/h")
	Rate string
	// 并发数限制 (0表示不限制)
	Concurrent int
	// 突发大小
	Burst int
	// 是否使用Redis
	UseRedis bool
	// Redis地址 (UseRedis为true时有效)
	RedisAddr string
	// Redis密码
	RedisPassword string
	// Redis数据库
	RedisDB int
	// 算法类型
	Algorithm AlgorithmType
	// 限流级别
	Level Level
	// 窗口大小(秒)，滑动窗口算法使用
	WindowSize int
	// Redis key前缀
	KeyPrefix string
}

// MultiLevelConfig 多级限流配置
type MultiLevelConfig struct {
	Global  Config // 全局限流
	User    Config // 用户级限流
	Endpoint Config // 接口级限流
}

// RateLimitResult 限流结果
type RateLimitResult struct {
	Allowed   bool    `json:"allowed"`
	Remaining int64   `json:"remaining"`   // 剩余令牌数
	RetryIn   float64 `json:"retry_in"`    // 重试需要等待的秒数
	Limit     int64   `json:"limit"`       // 限流上限
	Level     Level   `json:"level"`        // 触发限流的级别
}

// limiterItem 单个限流器实例
type limiterItem struct {
	tokens         float64
	lastRefill     time.Time
	rate           float64 // 每秒补充令牌数
	capacity       float64
	concurrentSem  chan struct{}
	concurrentMu   sync.RWMutex
	config         Config
	windowLog      []int64 // 滑动窗口日志 (时间戳列表)
	windowLogMu    sync.Mutex
}

// RateLimiter 限流器管理器
type RateLimiter struct {
	limiters map[string]*limiterItem
	mu       sync.RWMutex
	config   Config
	ctx      context.Context
	cancel   context.CancelFunc
	redis    *redis.Client
	multiCfg *MultiLevelConfig
}

// 全局限流器注册表和指标
var (
	rateLimiters   = make(map[string]*RateLimiter)
	rateLimitersMu sync.RWMutex

	// Prometheus指标
	rateLimitAllowedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ratelimit_allowed_total",
		Help: "Total number of allowed requests",
	}, []string{"level", "key"})

	rateLimitRejectedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ratelimit_rejected_total",
		Help: "Total number of rejected requests",
	}, []string{"level", "key"})

	rateLimitRemainingGauge = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ratelimit_remaining",
		Help: "Remaining tokens in rate limiter",
	}, []string{"level", "key"})

	rateLimitLatencyHistogram = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "ratelimit_check_duration_seconds",
		Help:    "Rate limit check latency",
		Buckets: []float64{0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05},
	}, []string{"level"})
)

// New 创建限流器
func New(cfg Config) (*RateLimiter, error) {
	ctx, cancel := context.WithCancel(context.Background())

	rl := &RateLimiter{
		limiters: make(map[string]*limiterItem),
		config:   cfg,
		ctx:      ctx,
		cancel:   cancel,
	}

	if cfg.UseRedis {
		rl.redis = redis.NewClient(&redis.Options{
			Addr:     cfg.RedisAddr,
			Password: cfg.RedisPassword,
			DB:       cfg.RedisDB,
		})
	}

	// 启动清理协程
	go rl.cleanup()

	return rl, nil
}

// NewWithMultiLevel 创建支持多级限流的限流器
func NewWithMultiLevel(multiCfg MultiLevelConfig) (*RateLimiter, error) {
	ctx, cancel := context.WithCancel(context.Background())

	rl := &RateLimiter{
		limiters: make(map[string]*limiterItem),
		config:   multiCfg.Global,
		ctx:      ctx,
		cancel:   cancel,
		multiCfg: &multiCfg,
	}

	if multiCfg.Global.UseRedis {
		rl.redis = redis.NewClient(&redis.Options{
			Addr:     multiCfg.Global.RedisAddr,
			Password: multiCfg.Global.RedisPassword,
			DB:       multiCfg.Global.RedisDB,
		})
	}

	go rl.cleanup()

	return rl, nil
}

// GetLimiter 获取指定key的限流器
func (rl *RateLimiter) GetLimiter(key string) (*limiterItem, error) {
	rl.mu.RLock()
	item, exists := rl.limiters[key]
	rl.mu.RUnlock()

	if exists {
		return item, nil
	}

	rl.mu.Lock()
	defer rl.mu.Unlock()

	// 双重检查
	if item, exists = rl.limiters[key]; exists {
		return item, nil
	}

	// 解析速率
	rate, capacity, err := rl.parseRate(rl.config.Rate)
	if err != nil {
		return nil, appErrors.ErrInvalidParameter("无效的速率配置: " + err.Error())
	}

	windowSize := rl.config.WindowSize
	if windowSize <= 0 {
		windowSize = 60 // 默认60秒窗口
	}

	item = &limiterItem{
		tokens:      capacity,
		lastRefill:  time.Now(),
		rate:        rate,
		capacity:    capacity,
		config:      rl.config,
		windowLog:   make([]int64, 0, windowSize),
	}

	if rl.config.Concurrent > 0 {
		item.concurrentSem = make(chan struct{}, rl.config.Concurrent)
	}

	rl.limiters[key] = item

	return item, nil
}

// parseRate 解析速率字符串
func (rl *RateLimiter) parseRate(rateStr string) (rate float64, capacity float64, err error) {
	// 简单解析: "100/s" -> rate=100, capacity=100
	var count int
	var unit string
	_, err = parseRateString(rateStr, &count, &unit)
	if err != nil {
		return 0, 0, err
	}
	return float64(count), float64(count), nil
}

// parseRateString 解析速率字符串
func parseRateString(s string, count *int, unit *string) (string, error) {
	var numStr string
	for i, c := range s {
		if c >= '0' && c <= '9' {
			numStr += string(c)
		} else if c == '/' {
			*unit = s[i+1:]
			break
		}
	}
	if numStr == "" || *unit == "" {
		return "", appErrors.ErrInvalidParameter("无效的速率格式")
	}
	*count = 0
	for _, c := range numStr {
		*count = *count*10 + int(c-'0')
	}
	return "", nil
}

// Allow 检查是否允许请求
func (rl *RateLimiter) Allow(key string) (bool, error) {
	item, err := rl.GetLimiter(key)
	if err != nil {
		return false, err
	}

	if rl.config.Algorithm == AlgorithmSlidingWindow {
		return rl.allowSlidingWindow(item), nil
	}
	return item.Allow(), nil
}

// AllowWithContext 带上下文的检查
func (rl *RateLimiter) AllowWithContext(ctx context.Context, key string) (bool, error) {
	start := time.Now()
	allowed, err := rl.Allow(key)
	duration := time.Since(start)
	rateLimitLatencyHistogram.WithLabelValues(rl.config.Level.String()).Observe(duration.Seconds())

	if allowed {
		rateLimitAllowedTotal.WithLabelValues(rl.config.Level.String(), key).Inc()
	} else {
		rateLimitRejectedTotal.WithLabelValues(rl.config.Level.String(), key).Inc()
	}

	return allowed, err
}

// AllowByLevel 按级别检查限流
func (rl *RateLimiter) AllowByLevel(ctx context.Context, userID, endpoint string) *RateLimitResult {
	start := time.Now()
	result := &RateLimitResult{Limit: -1}

	// 检查全局限流
	if rl.multiCfg != nil && rl.multiCfg.Global.Rate != "" {
		result = rl.checkLevel(rl.multiCfg.Global, "global:"+endpoint)
		if !result.Allowed {
			result.Level = LevelGlobal
			rateLimitLatencyHistogram.WithLabelValues("global").Observe(time.Since(start).Seconds())
			return result
		}
	}

	// 检查用户级限流
	if rl.multiCfg != nil && rl.multiCfg.User.Rate != "" && userID != "" {
		result = rl.checkLevel(rl.multiCfg.User, "user:"+userID)
		if !result.Allowed {
			result.Level = LevelUser
			rateLimitLatencyHistogram.WithLabelValues("user").Observe(time.Since(start).Seconds())
			return result
		}
	}

	// 检查接口级限流
	if rl.multiCfg != nil && rl.multiCfg.Endpoint.Rate != "" && endpoint != "" {
		result = rl.checkLevel(rl.multiCfg.Endpoint, "endpoint:"+endpoint)
		if !result.Allowed {
			result.Level = LevelEndpoint
			rateLimitLatencyHistogram.WithLabelValues("endpoint").Observe(time.Since(start).Seconds())
			return result
		}
	}

	result.Allowed = true
	result.Remaining = result.Limit - 1
	if result.Limit < 0 {
		result.Limit = -1
		result.Remaining = -1
	}
	rateLimitLatencyHistogram.WithLabelValues("global").Observe(time.Since(start).Seconds())
	return result
}

func (rl *RateLimiter) checkLevel(cfg Config, key string) *RateLimitResult {
	result := &RateLimitResult{Level: cfg.Level}

	if rl.redis != nil && cfg.UseRedis {
		return rl.checkRedis(cfg, key)
	}

	item, err := rl.GetLimiter(key)
	if err != nil {
		result.Allowed = false
		return result
	}

	result.Limit = int64(item.capacity)

	if cfg.Algorithm == AlgorithmSlidingWindow {
		result.Allowed = rl.allowSlidingWindow(item)
	} else {
		result.Allowed = item.Allow()
	}

	if result.Allowed {
		result.Remaining = int64(item.getTokens())
	} else {
		result.RetryIn = item.getRetryIn()
	}

	return result
}

// checkRedis 使用Redis检查限流
func (rl *RateLimiter) checkRedis(cfg Config, key string) *RateLimitResult {
	ctx := context.Background()
	result := &RateLimitResult{Level: cfg.Level}

	rate, capacity, _ := rl.parseRate(cfg.Rate)
	result.Limit = int64(capacity)

	if cfg.Algorithm == AlgorithmSlidingWindow {
		// Redis滑动窗口实现
		now := time.Now().Unix()
		windowStart := now - int64(cfg.WindowSize)
		redisKey := cfg.KeyPrefix + key

		// 移除窗口外的记录
		rl.redis.ZRemRangeByScore(ctx, redisKey, "0", strconv.FormatInt(windowStart, 10))

		// 获取当前窗口内的请求数
		count, err := rl.redis.ZCard(ctx, redisKey).Result()
		if err != nil {
			result.Allowed = false
			return result
		}

		if int64(count) >= int64(capacity) {
			result.Allowed = false
			// 获取最旧记录的时间计算重试时间
			oldest, err := rl.redis.ZRangeWithScores(ctx, redisKey, 0, 0).Result()
			if err == nil && len(oldest) > 0 {
				result.RetryIn = float64(windowStart + int64(cfg.WindowSize) - int64(oldest[0].Score))
			}
			rateLimitRemainingGauge.WithLabelValues(cfg.Level.String(), key).Set(0)
			return result
		}

		// 添加当前请求
		rl.redis.ZAdd(ctx, redisKey, redis.Z{Score: float64(now), Member: fmt.Sprintf("%d-%d", now, time.Now().UnixNano())})
		rl.redis.Expire(ctx, redisKey, time.Duration(cfg.WindowSize*2)*time.Second)

		result.Allowed = true
		result.Remaining = int64(capacity) - int64(count) - 1
		rateLimitRemainingGauge.WithLabelValues(cfg.Level.String(), key).Set(float64(result.Remaining))
	} else {
		// Redis Token Bucket实现
		redisKey := cfg.KeyPrefix + key
		luaScript := `
			local key = KEYS[1]
			local capacity = tonumber(ARGV[1])
			local rate = tonumber(ARGV[2])
			local now = tonumber(ARGV[3])
			local requested = 1

			local tokens = tonumber(redis.call('GET', key) or capacity)
			local last_refill = tonumber(redis.call('GET', key .. ':last') or now)

			local elapsed = now - last_refill
			local add = elapsed * rate
			if add > 0 then
				tokens = math.min(capacity, tokens + add)
				redis.call('SET', key .. ':last', now)
			end

			if tokens >= requested then
				tokens = tokens - requested
				redis.call('SET', key, tokens)
				return {1, tokens}
			else
				return {0, tokens}
			end
		`

		res, err := rl.redis.Eval(ctx, luaScript, []string{redisKey},
			capacity, rate, float64(time.Now().Unix())).Result()
		if err != nil {
			result.Allowed = false
			return result
		}

		parts := res.([]interface{})
		allowed := parts[0].(int64) == 1
		remaining := int64(parts[1].(float64))

		result.Allowed = allowed
		result.Remaining = remaining

		if !allowed {
			result.RetryIn = (1 - float64(remaining)/rate)
			if result.RetryIn < 0 {
				result.RetryIn = 1.0 / rate
			}
		}
		rateLimitRemainingGauge.WithLabelValues(cfg.Level.String(), key).Set(float64(result.Remaining))
	}

	return result
}

// allowSlidingWindow 滑动窗口算法
func (rl *RateLimiter) allowSlidingWindow(item *limiterItem) bool {
	now := time.Now().Unix()
	windowSize := int64(rl.config.WindowSize)
	if windowSize <= 0 {
		windowSize = 60
	}
	windowStart := now - windowSize

	item.windowLogMu.Lock()
	defer item.windowLogMu.Unlock()

	// 移除窗口外的记录
	newLog := make([]int64, 0, len(item.windowLog))
	for _, ts := range item.windowLog {
		if ts > windowStart {
			newLog = append(newLog, ts)
		}
	}
	item.windowLog = newLog

	// 检查是否超过容量
	if int64(len(item.windowLog)) >= int64(item.capacity) {
		return false
	}

	// 添加当前请求
	item.windowLog = append(item.windowLog, now)
	return true
}

// AcquireConcurrent 获取并发信号量
func (rl *RateLimiter) AcquireConcurrent(key string) (bool, error) {
	item, err := rl.GetLimiter(key)
	if err != nil {
		return false, err
	}

	item.concurrentMu.RLock()
	defer item.concurrentMu.RUnlock()

	if item.concurrentSem == nil {
		return true, nil
	}

	select {
	case item.concurrentSem <- struct{}{}:
		return true, nil
	default:
		return false, nil
	}
}

// ReleaseConcurrent 释放并发信号量
func (rl *RateLimiter) ReleaseConcurrent(key string) {
	item, err := rl.GetLimiter(key)
	if err != nil {
		return
	}

	item.concurrentMu.RLock()
	defer item.concurrentMu.RUnlock()

	if item.concurrentSem == nil {
		return
	}

	select {
	case <-item.concurrentSem:
	default:
	}
}

// GetMetrics 获取限流器指标
func (rl *RateLimiter) GetMetrics() map[string]interface{} {
	rl.mu.RLock()
	defer rl.mu.RUnlock()

	metrics := make(map[string]interface{})
	for key, item := range rl.limiters {
		metrics[key] = map[string]interface{}{
			"rate":      item.rate,
			"capacity":  item.capacity,
			"tokens":    item.getTokens(),
			"concurrent": item.config.Concurrent,
		}
	}

	return metrics
}

// cleanup 定期清理过期数据
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			rl.mu.Lock()
			// 清理滑动窗口日志
			now := time.Now().Unix()
			for _, item := range rl.limiters {
				item.windowLogMu.Lock()
				windowSize := int64(item.config.WindowSize)
				if windowSize <= 0 {
					windowSize = 60
				}
				windowStart := now - windowSize
				newLog := make([]int64, 0, len(item.windowLog))
				for _, ts := range item.windowLog {
					if ts > windowStart {
						newLog = append(newLog, ts)
					}
				}
				item.windowLog = newLog
				item.windowLogMu.Unlock()
			}
			rl.mu.Unlock()
		case <-rl.ctx.Done():
			return
		}
	}
}

// Close 关闭限流器
func (rl *RateLimiter) Close() error {
	rl.cancel()
	if rl.redis != nil {
		return rl.redis.Close()
	}
	return nil
}

// Allow 检查是否允许请求
func (item *limiterItem) Allow() bool {
	item.refill()
	if item.tokens >= 1 {
		item.tokens--
		return true
	}
	return false
}

// getTokens 获取当前令牌数
func (item *limiterItem) getTokens() float64 {
	item.refill()
	return item.tokens
}

// getRetryIn 获取需要等待的时间(秒)
func (item *limiterItem) getRetryIn() float64 {
	if item.tokens >= 1 {
		return 0
	}
	return (1 - item.tokens) / item.rate
}

// refill 补充令牌
func (item *limiterItem) refill() {
	now := time.Now()
	elapsed := now.Sub(item.lastRefill).Seconds()
	item.lastRefill = now

	add := elapsed * item.rate
	if add > 0 {
		item.tokens = min(item.capacity, item.tokens+add)
	}
}

// Level String方法
func (l Level) String() string {
	switch l {
	case LevelGlobal:
		return "global"
	case LevelUser:
		return "user"
	case LevelEndpoint:
		return "endpoint"
	default:
		return "unknown"
	}
}

// ErrRateLimited 请求被限流错误
var ErrRateLimited = errors.New("rate limit exceeded")

// NewRateLimitedError 创建限流错误
func NewRateLimitedError(retryIn float64) error {
	return fmt.Errorf("rate limit exceeded, retry in %.2fs: %w", retryIn, ErrRateLimited)
}
