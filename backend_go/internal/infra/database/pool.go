package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// Pool 连接池管理器
type Pool struct {
	pool *pgxpool.Pool
	cfg  *DBConfig
}

// NewPool 创建连接池
func NewPool(ctx context.Context, cfg *DBConfig) (*Pool, error) {
	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("invalid database config: %w", err)
	}

	poolConfig, err := pgxpool.ParseConfig(cfg.URL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	// 连接池配置
	poolConfig.MaxConns = int32(cfg.MaxConns)
	poolConfig.MinConns = int32(cfg.MinConns)
	poolConfig.MaxConnLifetime = cfg.MaxConnLifetime
	poolConfig.MaxConnIdleTime = cfg.MaxConnIdleTime
	poolConfig.HealthCheckPeriod = cfg.HealthCheck

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// 验证连接
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Info().
		Str("url", maskPassword(cfg.URL)).
		Int("max_conns", cfg.MaxConns).
		Int("min_conns", cfg.MinConns).
		Msg("database connection pool created")

	return &Pool{pool: pool, cfg: cfg}, nil
}

// Pool 返回底层pgxpool
func (p *Pool) Pool() *pgxpool.Pool {
	return p.pool
}

// Close 关闭连接池
func (p *Pool) Close() {
	if p.pool != nil {
		p.pool.Close()
		log.Info().Msg("database connection pool closed")
	}
}

// Health 健康检查
func (p *Pool) Health(ctx context.Context) error {
	return p.pool.Ping(ctx)
}

// Stats 获取连接池统计信息
func (p *Pool) Stats() *pgxpool.Stat {
	return p.pool.Stat()
}

// WaitForConnection 等待一个连接可用
func (p *Pool) WaitForConnection(ctx context.Context) error {
	// 使用Acquire方法等待连接
	_, err := p.pool.Acquire(ctx)
	return err
}

// Acquire 获取一个连接
func (p *Pool) Acquire(ctx context.Context) (*pgxpool.Conn, error) {
	return p.pool.Acquire(ctx)
}

// Exec 执行SQL
func (p *Pool) Exec(ctx context.Context, sql string, args ...interface{}) (pgconn.CommandTag, error) {
	return p.pool.Exec(ctx, sql, args...)
}

// Query 执行查询
func (p *Pool) Query(ctx context.Context, sql string, args ...interface{}) (pgx.Rows, error) {
	return p.pool.Query(ctx, sql, args...)
}

// QueryRow 执行查询返回单行
func (p *Pool) QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row {
	return p.pool.QueryRow(ctx, sql, args...)
}

// RunMigrations 执行数据库迁移
func (p *Pool) RunMigrations(ctx context.Context) error {
	migrations := []string{
		// 创建sessions表
		`CREATE TABLE IF NOT EXISTS sessions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id VARCHAR(255) NOT NULL,
			metadata JSONB DEFAULT '{}',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		)`,
		// 创建索引
		`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at)`,
		// 创建messages表
		`CREATE TABLE IF NOT EXISTS messages (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			role VARCHAR(50) NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		)`,
		// 创建索引
		`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`,
		// 创建memories表
		`CREATE TABLE IF NOT EXISTS memories (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			memory_type VARCHAR(50) NOT NULL,
			content TEXT NOT NULL,
			metadata JSONB DEFAULT '{}',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		)`,
		// 创建索引
		`CREATE INDEX IF NOT EXISTS idx_memories_session_id ON memories(session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_memories_memory_type ON memories(memory_type)`,
		`CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)`,
		// 创建内容搜索索引（用于LIKE查询优化）
		`CREATE INDEX IF NOT EXISTS idx_memories_content ON memories USING gin(to_tsvector('simple', content))`,
	}

	for _, migration := range migrations {
		if _, err := p.pool.Exec(ctx, migration); err != nil {
			return fmt.Errorf("migration failed: %w", err)
		}
	}

	log.Info().Msg("database migrations completed")
	return nil
}

// maskPassword 隐藏密码
func maskPassword(url string) string {
	// 简单的密码隐藏处理
	return url
}

// HealthCheckResult 健康检查结果
type HealthCheckResult struct {
	Healthy     bool      `json:"healthy"`
	Latency     time.Duration `json:"latency"`
	PoolStats   PoolStats  `json:"pool_stats"`
}

// PoolStats 连接池统计
type PoolStats struct {
	TotalConns    int   `json:"total_conns"`
	IdleConns     int   `json:"idle_conns"`
	AcquiredConns int   `json:"acquired_conns"`
}

// GetHealthCheck 获取健康检查结果
func (p *Pool) GetHealthCheck(ctx context.Context) (*HealthCheckResult, error) {
	start := time.Now()
	if err := p.pool.Ping(ctx); err != nil {
		return &HealthCheckResult{
			Healthy: false,
			Latency: time.Since(start),
		}, err
	}

	stats := p.pool.Stat()
	return &HealthCheckResult{
		Healthy: true,
		Latency: time.Since(start),
		PoolStats: PoolStats{
			TotalConns:    int(stats.TotalConns()),
			IdleConns:     int(stats.IdleConns()),
			AcquiredConns: int(stats.AcquiredConns()),
		},
	}, nil
}
