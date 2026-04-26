// Package redis 单元测试
package redis

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestConfigValidate 测试配置验证
func TestConfigValidate(t *testing.T) {
	tests := []struct {
		name    string
		config  Config
		wantErr bool
	}{
		{
			name: "有效配置",
			config: Config{
				Addr:     "localhost:6379",
				PoolSize: 10,
			},
			wantErr: false,
		},
		{
			name: "空地址",
			config: Config{
				Addr: "",
			},
			wantErr: true,
		},
		{
			name: "默认池大小",
			config: Config{
				Addr:     "localhost:6379",
				PoolSize: 0,
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.config.Validate()
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestConfigToRedisOptions 测试配置转换
func TestConfigToRedisOptions(t *testing.T) {
	cfg := Config{
		Addr:            "localhost:6379",
		Password:        "password",
		DB:              1,
		PoolSize:        50,
		MinIdleConns:    5,
		ConnectTimeout:  3000,
		ReadTimeout:     2000,
		WriteTimeout:    2000,
		KeepAlive:       30,
	}

	opts := cfg.ToRedisOptions()

	assert.Equal(t, "localhost:6379", opts.Addr)
	assert.Equal(t, "password", opts.Password)
	assert.Equal(t, 1, opts.DB)
	assert.Equal(t, 50, opts.PoolSize)
	assert.Equal(t, 5, opts.MinIdleConns)
	assert.Equal(t, 3*time.Second, opts.DialTimeout)
	assert.Equal(t, 2*time.Second, opts.ReadTimeout)
	assert.Equal(t, 2*time.Second, opts.WriteTimeout)
	assert.Equal(t, 30*time.Second, opts.KeepAlive)
}

// TestKeyHelpers 测试键辅助函数
func TestKeyHelpers(t *testing.T) {
	tests := []struct {
		name     string
		fn       func(string) string
		input    string
		expected string
	}{
		{
			name:     "SessionKey",
			fn:       SessionKey,
			input:    "abc123",
			expected: "session:abc123",
		},
		{
			name:     "RateLimitKey",
			fn:       func(k string) string { return RateLimitKey(k, "60") },
			input:    "user1",
			expected: "ratelimit:user1:60",
		},
		{
			name:     "LockKey",
			fn:       LockKey,
			input:    "resource1",
			expected: "lock:resource1",
		},
		{
			name:     "CacheKey",
			fn:       CacheKey,
			input:    "data1",
			expected: "cache:data1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.fn(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestRateLimitConfig 测试限流配置
func TestRateLimitConfig(t *testing.T) {
	cfg := DefaultRateLimitConfig()

	assert.Equal(t, 100, cfg.Rate)
	assert.Equal(t, 60, cfg.Window)
	assert.Equal(t, 10, cfg.Burst)
	assert.True(t, cfg.Enabled)
}

// TestLockOptions 测试锁选项
func TestLockOptions(t *testing.T) {
	opts := DefaultLockOptions()

	assert.Equal(t, DefaultLockTTL, opts.TTL)
	assert.Equal(t, 3, opts.RetryCount)
	assert.Equal(t, 100*time.Millisecond, opts.RetryDelay)
	assert.False(t, opts.Fair)
	assert.Equal(t, 10*time.Second, opts.ExtendTTL)
}

// TestWithTTL 测试TTL选项
func TestWithTTL(t *testing.T) {
	opts := DefaultLockOptions()
	WithTTL(5 * time.Second)(&opts)

	assert.Equal(t, 5*time.Second, opts.TTL)
}

// TestWithRetry 测试重试选项
func TestWithRetry(t *testing.T) {
	opts := DefaultLockOptions()
	WithRetry(5, 200*time.Millisecond)(&opts)

	assert.Equal(t, 5, opts.RetryCount)
	assert.Equal(t, 200*time.Millisecond, opts.RetryDelay)
}

// TestCircuitBreakerConfig 测试熔断器配置
func TestCircuitBreakerConfig(t *testing.T) {
	cfg := CircuitBreakerConfig{
		FailureThreshold: 10,
		SuccessThreshold: 5,
		RecoveryTimeout:  60,
	}

	assert.Equal(t, 10, cfg.FailureThreshold)
	assert.Equal(t, 5, cfg.SuccessThreshold)
	assert.Equal(t, 60, cfg.RecoveryTimeout)
}

// TestConfigString 测试配置字符串表示
func TestConfigString(t *testing.T) {
	cfg := Config{
		Addr:     "localhost:6379",
		DB:       0,
		PoolSize: 100,
	}

	str := cfg.String()
	assert.Contains(t, str, "localhost:6379")
	assert.Contains(t, str, "0")
	assert.Contains(t, str, "100")
}

// TestLoadConfigFromViper 测试从Viper加载配置
func TestLoadConfigFromViper(t *testing.T) {
	// 创建一个简单的测试,验证默认配置
	cfg := LoadConfigFromViper(nil)

	assert.Equal(t, "localhost:6379", cfg.Addr)
	assert.Equal(t, "", cfg.Password)
	assert.Equal(t, 0, cfg.DB)
	assert.Equal(t, 100, cfg.PoolSize)
	assert.Equal(t, 10, cfg.MinIdleConns)
}

// TestCircuitBreakerMetrics 测试熔断器指标结构
func TestCircuitBreakerMetrics(t *testing.T) {
	metrics := CircuitBreakerMetrics{
		SuccessCount:      100,
		FailureCount:      5,
		TotalRequestCount: 105,
		RejectionCount:    2,
		State:             "closed",
	}

	assert.Equal(t, uint64(100), metrics.SuccessCount)
	assert.Equal(t, uint64(5), metrics.FailureCount)
	assert.Equal(t, uint64(105), metrics.TotalRequestCount)
	assert.Equal(t, uint64(2), metrics.RejectionCount)
	assert.Equal(t, "closed", metrics.State)
}

// TestSessionData 测试会话数据结构
func TestSessionData(t *testing.T) {
	now := time.Now()
	session := SessionData{
		SessionId: "sess123",
		UserId:    "user456",
		Messages: []SessionMessage{
			{Role: "user", Content: "hello", Time: now.Unix()},
		},
		Context:   map[string]interface{}{"key": "value"},
		Metadata:  map[string]string{"env": "test"},
		CreatedAt: now,
		UpdatedAt: now,
		ExpiresAt: now.Add(DefaultSessionTTL),
		Version:   1,
	}

	assert.Equal(t, "sess123", session.SessionId)
	assert.Equal(t, "user456", session.UserId)
	assert.Len(t, session.Messages, 1)
	assert.Equal(t, "user", session.Messages[0].Role)
	assert.Equal(t, "hello", session.Messages[0].Content)
	assert.Equal(t, "value", session.Context["key"])
	assert.Equal(t, "test", session.Metadata["env"])
	assert.Equal(t, int64(1), session.Version)
}

// TestTokenBucketLimiterCreation 测试令牌桶限流器创建
func TestTokenBucketLimiterCreation(t *testing.T) {
	client := &Client{}
	limiter := NewTokenBucketLimiter(client, "test", 100, 10)

	assert.NotNil(t, limiter)
	assert.Equal(t, int64(100), limiter.capacity)
	assert.Equal(t, int64(10), limiter.refillRate)
	assert.Contains(t, limiter.key, "token_bucket:test")
}

// TestSlidingWindowLogLimiterCreation 测试滑动窗口日志限流器创建
func TestSlidingWindowLogLimiterCreation(t *testing.T) {
	client := &Client{}
	limiter := NewSlidingWindowLogLimiter(client, "test", 100, time.Minute)

	assert.NotNil(t, limiter)
	assert.Equal(t, int64(100), limiter.limit)
	assert.Equal(t, time.Minute, limiter.window)
	assert.Contains(t, limiter.key, "swl:test")
}

// TestNewRateLimiter 测试限流器创建
func TestNewRateLimiter(t *testing.T) {
	client := &Client{}
	config := RateLimitConfig{
		Rate:    50,
		Window:  30,
		Burst:   5,
		Enabled: true,
	}

	limiter := NewRateLimiter(client, config)

	assert.NotNil(t, limiter)
	assert.Equal(t, 50, limiter.config.Rate)
	assert.Equal(t, 30, limiter.config.Window)
	assert.Equal(t, 5, limiter.config.Burst)
	assert.True(t, limiter.config.Enabled)
}

// TestNewRateLimiterDefaultWindow 测试限流器默认窗口
func TestNewRateLimiterDefaultWindow(t *testing.T) {
	client := &Client{}
	config := RateLimitConfig{
		Rate:   50,
		Window: 0, // 无效窗口
	}

	limiter := NewRateLimiter(client, config)

	assert.Equal(t, 60, limiter.config.Window) // 应该使用默认值
}

// TestNewDistributedLock 测试分布式锁创建
func TestNewDistributedLock(t *testing.T) {
	client := &Client{}
	lock := NewDistributedLock(client, "resource1")

	assert.NotNil(t, lock)
	assert.Contains(t, lock.key, "lock:resource1")
	assert.NotEmpty(t, lock.value) // UUID应该被生成
}

// TestNewFairLock 测试公平锁创建
func TestNewFairLock(t *testing.T) {
	client := &Client{}
	lock := NewFairLock(client, "resource1")

	assert.NotNil(t, lock)
	assert.Contains(t, lock.key, "fairlock:resource1")
	assert.NotEmpty(t, lock.value)
	assert.True(t, lock.opts.Fair)
}

// TestNewReadWriteLock 测试读写锁创建
func TestNewReadWriteLock(t *testing.T) {
	client := &Client{}
	rwlock := NewReadWriteLock(client, "resource1")

	assert.NotNil(t, rwlock)
	assert.Contains(t, rwlock.key, "rwlock:resource1")
}

// TestLockGuard 测试锁守卫
func TestLockGuard(t *testing.T) {
	lock := &DistributedLock{
		key:   "test:lock",
		value: "test-value",
	}
	guard := &LockGuard{
		lock: lock,
		ctx:  context.Background(),
	}

	assert.Equal(t, lock, guard.lock)
	assert.Equal(t, context.Background(), guard.ctx)
}

// MockClientForTesting 用于测试的模拟客户端
type MockClient struct {
	*Client
}

func TestConfigValidation(t *testing.T) {
	tests := []struct {
		name    string
		config  Config
		wantErr bool
	}{
		{
			name: "有效配置",
			config: Config{
				Addr:     "localhost:6379",
				PoolSize: 10,
			},
			wantErr: false,
		},
		{
			name: "空地址",
			config: Config{
				Addr: "",
			},
			wantErr: true,
		},
		{
			name: "负池大小",
			config: Config{
				Addr:     "localhost:6379",
				PoolSize: -1,
			},
			wantErr: false, // Validate会修正为默认值
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.config.Validate()
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
