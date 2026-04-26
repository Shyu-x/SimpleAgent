// Package database PostgreSQL存储层
package database

import (
	"fmt"
	"time"

	"github.com/spf13/viper"
)

// DBConfig 数据库配置
type DBConfig struct {
	URL            string        // 数据库连接URL
	MaxConns       int           // 最大连接数
	MinConns       int           // 最小连接数
	MaxConnLifetime time.Duration // 最大连接生命周期
	MaxConnIdleTime time.Duration // 最大空闲时间
	HealthCheck    time.Duration // 健康检查间隔
}

// DefaultDBConfig 返回默认配置
func DefaultDBConfig() *DBConfig {
	return &DBConfig{
		MaxConns:       20,
		MinConns:       5,
		MaxConnLifetime: time.Hour,
		MaxConnIdleTime: 30 * time.Minute,
		HealthCheck:    time.Minute,
	}
}

// LoadDBConfig 从Viper加载数据库配置
func LoadDBConfig(v *viper.Viper) (*DBConfig, error) {
	cfg := DefaultDBConfig()

	// 从环境变量或配置文件加载
	if url := v.GetString("database.url"); url != "" {
		cfg.URL = url
	} else {
		// 构建连接字符串
		host := v.GetString("database.host")
		port := v.GetInt("database.port")
		user := v.GetString("database.user")
		password := v.GetString("database.password")
		dbname := v.GetString("database.name")
		sslmode := v.GetString("database.sslmode")

		if host == "" {
			host = "localhost"
		}
		if port == 0 {
			port = 5432
		}
		if sslmode == "" {
			sslmode = "disable"
		}

		cfg.URL = fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
			user, password, host, port, dbname, sslmode)
	}

	if maxConns := v.GetInt("database.max_conns"); maxConns > 0 {
		cfg.MaxConns = maxConns
	}
	if minConns := v.GetInt("database.min_conns"); minConns > 0 {
		cfg.MinConns = minConns
	}
	if lifetime := v.GetDuration("database.max_conn_lifetime"); lifetime > 0 {
		cfg.MaxConnLifetime = lifetime
	}
	if idleTime := v.GetDuration("database.max_conn_idle_time"); idleTime > 0 {
		cfg.MaxConnIdleTime = idleTime
	}
	if healthCheck := v.GetDuration("database.health_check"); healthCheck > 0 {
		cfg.HealthCheck = healthCheck
	}

	return cfg, nil
}

// Validate 验证配置
func (c *DBConfig) Validate() error {
	if c.URL == "" {
		return fmt.Errorf("database URL is required")
	}
	if c.MaxConns <= 0 {
		return fmt.Errorf("max_conns must be positive")
	}
	if c.MinConns < 0 {
		return fmt.Errorf("min_conns must be non-negative")
	}
	if c.MaxConnLifetime <= 0 {
		return fmt.Errorf("max_conn_lifetime must be positive")
	}
	return nil
}
