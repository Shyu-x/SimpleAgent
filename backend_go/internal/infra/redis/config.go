// Package redis Redis基础设施层
// 提供Redis客户端、缓存、会话存储、分布式限流、分布式锁功能
package redis

import (
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/spf13/viper"

	"github.com/ai-chat/backend_go/internal/common/errors"
)

// Config Redis配置
type Config struct {
	// Redis地址 (host:port)
	Addr string
	// Redis密码
	Password string
	// Redis数据库 (0-15)
	DB int
	// 连接池大小
	PoolSize int
	// 最小空闲连接数
	MinIdleConns int
	// 连接超时(毫秒)
	ConnectTimeout int
	// 读超时(毫秒)
	ReadTimeout int
	// 写超时(毫秒)
	WriteTimeout int
	// 心跳周期(秒)
	KeepAlive int
	// 熔断器配置
	CircuitBreaker CircuitBreakerConfig
}

// CircuitBreakerConfig 熔断器配置
type CircuitBreakerConfig struct {
	FailureThreshold int // 失败阈值
	SuccessThreshold int // 成功阈值
	RecoveryTimeout int  // 恢复超时(秒)
}

// DefaultConfig 默认配置
func DefaultConfig() Config {
	return Config{
		Addr:            "localhost:6380",
		Password:        "",
		DB:              0,
		PoolSize:        100,
		MinIdleConns:    10,
		ConnectTimeout:  5000,
		ReadTimeout:     3000,
		WriteTimeout:    3000,
		KeepAlive:       60,
		CircuitBreaker: CircuitBreakerConfig{
			FailureThreshold: 5,
			SuccessThreshold: 3,
			RecoveryTimeout:  30,
		},
	}
}

// LoadConfigFromViper 从Viper加载配置
func LoadConfigFromViper(v *viper.Viper) Config {
	cfg := DefaultConfig()

	if v == nil {
		return cfg
	}

	if addr := v.GetString("redis.addr"); addr != "" {
		cfg.Addr = addr
	}
	if password := v.GetString("redis.password"); password != "" {
		cfg.Password = password
	}
	if db := v.GetInt("redis.db"); db >= 0 {
		cfg.DB = db
	}
	if poolSize := v.GetInt("redis.pool_size"); poolSize > 0 {
		cfg.PoolSize = poolSize
	}
	if minIdle := v.GetInt("redis.min_idle_conns"); minIdle >= 0 {
		cfg.MinIdleConns = minIdle
	}
	if connectTimeout := v.GetInt("redis.connect_timeout"); connectTimeout > 0 {
		cfg.ConnectTimeout = connectTimeout
	}
	if readTimeout := v.GetInt("redis.read_timeout"); readTimeout > 0 {
		cfg.ReadTimeout = readTimeout
	}
	if writeTimeout := v.GetInt("redis.write_timeout"); writeTimeout > 0 {
		cfg.WriteTimeout = writeTimeout
	}
	if keepAlive := v.GetInt("redis.keep_alive"); keepAlive > 0 {
		cfg.KeepAlive = keepAlive
	}

	// 熔断器配置
	if cb := v.Get("redis.circuit_breaker"); cb != nil {
		if m, ok := cb.(map[string]interface{}); ok {
			if ft, ok := m["failure_threshold"].(int); ok {
				cfg.CircuitBreaker.FailureThreshold = ft
			}
			if st, ok := m["success_threshold"].(int); ok {
				cfg.CircuitBreaker.SuccessThreshold = st
			}
			if rt, ok := m["recovery_timeout"].(int); ok {
				cfg.CircuitBreaker.RecoveryTimeout = rt
			}
		}
	}

	return cfg
}

// Validate 验证配置
func (c *Config) Validate() error {
	if c.Addr == "" {
		return errors.ErrInvalidParameter("redis addr is required")
	}
	if c.PoolSize <= 0 {
		c.PoolSize = 100
	}
	if c.ConnectTimeout <= 0 {
		c.ConnectTimeout = 5000
	}
	if c.ReadTimeout <= 0 {
		c.ReadTimeout = 3000
	}
	if c.WriteTimeout <= 0 {
		c.WriteTimeout = 3000
	}
	return nil
}

// ToRedisOptions 转换为go-redis.Options
func (c *Config) ToRedisOptions() *redis.Options {
	return &redis.Options{
		Addr:         c.Addr,
		Password:     c.Password,
		DB:           c.DB,
		PoolSize:     c.PoolSize,
		MinIdleConns: c.MinIdleConns,
		DialTimeout:  time.Duration(c.ConnectTimeout) * time.Millisecond,
		ReadTimeout:  time.Duration(c.ReadTimeout) * time.Millisecond,
		WriteTimeout: time.Duration(c.WriteTimeout) * time.Millisecond,
	}
}

// String 实现fmt.Stringer
func (c *Config) String() string {
	return fmt.Sprintf("Redis{addr=%s, db=%d, pool_size=%d}", c.Addr, c.DB, c.PoolSize)
}
