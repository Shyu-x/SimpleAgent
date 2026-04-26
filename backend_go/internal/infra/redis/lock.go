// Package redis Redis基础设施层
// 提供分布式锁服务
package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/ai-chat/backend_go/internal/common/errors"
)

// DefaultLockTTL 默认锁TTL (30秒)
const DefaultLockTTL = 30 * time.Second

// LockOption 锁选项
type LockOption func(*LockOptions)

// LockOptions 锁配置选项
type LockOptions struct {
	// 锁TTL
	TTL time.Duration
	// 获取锁重试次数
	RetryCount int
	// 获取锁重试间隔
	RetryDelay time.Duration
	// 是否使用公平锁
	Fair bool
	// 扩展时额外增加的TTL
	ExtendTTL time.Duration
}

// DefaultLockOptions 默认锁选项
func DefaultLockOptions() LockOptions {
	return LockOptions{
		TTL:        DefaultLockTTL,
		RetryCount: 3,
		RetryDelay: 100 * time.Millisecond,
		Fair:       false,
		ExtendTTL:  10 * time.Second,
	}
}

// WithTTL 设置TTL
func WithTTL(ttl time.Duration) LockOption {
	return func(o *LockOptions) {
		o.TTL = ttl
	}
}

// WithRetry 设置重试参数
func WithRetry(count int, delay time.Duration) LockOption {
	return func(o *LockOptions) {
		o.RetryCount = count
		o.RetryDelay = delay
	}
}

// WithFair 设置公平锁
func WithFair(fair bool) LockOption {
	return func(o *LockOptions) {
		o.Fair = fair
	}
}

// WithExtendTTL 设置扩展TTL
func WithExtendTTL(ttl time.Duration) LockOption {
	return func(o *LockOptions) {
		o.ExtendTTL = ttl
	}
}

// DistributedLock 分布式锁
type DistributedLock struct {
	client *Client
	key    string
	value  string // 锁持有者标识
	opts   LockOptions
}

// NewDistributedLock 创建分布式锁
func NewDistributedLock(client *Client, resource string, opts ...LockOption) *DistributedLock {
	options := DefaultLockOptions()
	for _, opt := range opts {
		opt(&options)
	}

	return &DistributedLock{
		client: client,
		key:    LockKey(resource),
		value:  uuid.New().String(), // 唯一标识
		opts:   options,
	}
}

// Lock 尝试获取锁
func (l *DistributedLock) Lock(ctx context.Context) (bool, error) {
	return l.TryLock(ctx, l.opts.TTL)
}

// TryLock 尝试获取锁并设置TTL
func (l *DistributedLock) TryLock(ctx context.Context, ttl time.Duration) (bool, error) {
	key := l.key
	lockValue := l.value

	var acquired bool
	err := l.client.ExecuteWithCircuitBreaker(ctx, func() error {
		result, err := l.client.rdb.SetNX(ctx, key, lockValue, ttl).Result()
		if err != nil {
			return err
		}
		acquired = result
		return nil
	})
	if err != nil {
		log.Error().Err(err).Str("key", key).Msg("DistributedLock.Lock失败")
		return false, errors.ErrRedis("获取锁失败", err)
	}

	if !acquired {
		// 重试机制
		for i := 0; i < l.opts.RetryCount && !acquired; i++ {
			select {
			case <-ctx.Done():
				return false, ctx.Err()
			case <-time.After(l.opts.RetryDelay):
			}

			result, err := l.client.rdb.SetNX(ctx, key, lockValue, ttl).Result()
			if err != nil {
				log.Warn().Err(err).Int("retry", i+1).Msg("DistributedLock.Lock重试")
				continue
			}
			acquired = result
		}
	}

	if acquired {
		log.Debug().Str("key", key).Str("value", lockValue).Msg("DistributedLock.Lock成功")
	} else {
		log.Debug().Str("key", key).Msg("DistributedLock.Lock失败,锁已被持有")
	}

	return acquired, nil
}

// Unlock 释放锁
func (l *DistributedLock) Unlock(ctx context.Context) error {
	key := l.key
	lockValue := l.value

	// 使用Lua脚本确保只删除自己持有的锁
	script := `
		if redis.call("GET", KEYS[1]) == ARGV[1] then
			return redis.call("DEL", KEYS[1])
		else
			return 0
		end
	`

	err := l.client.ExecuteWithCircuitBreaker(ctx, func() error {
		result, err := l.client.rdb.Eval(ctx, script, []string{key}, lockValue).Int64()
		if err != nil {
			return err
		}
		if result == 0 {
			log.Warn().Str("key", key).Msg("DistributedLock.Unlock: 锁不属于当前持有者")
		}
		return nil
	})
	if err != nil {
		log.Error().Err(err).Str("key", key).Msg("DistributedLock.Unlock失败")
		return errors.ErrRedis("释放锁失败", err)
	}

	log.Debug().Str("key", key).Msg("DistributedLock.Unlock成功")
	return nil
}

// Extend 延长锁的TTL
func (l *DistributedLock) Extend(ctx context.Context) error {
	return l.ExtendWithTTL(ctx, l.opts.TTL+l.opts.ExtendTTL)
}

// ExtendWithTTL 使用指定TTL延长锁
func (l *DistributedLock) ExtendWithTTL(ctx context.Context, ttl time.Duration) error {
	key := l.key
	lockValue := l.value

	// Lua脚本确保只延长自己的锁
	script := `
		if redis.call("GET", KEYS[1]) == ARGV[1] then
			return redis.call("PEXPIRE", KEYS[1], ARGV[2])
		else
			return 0
		end
	`

	var extended bool
	err := l.client.ExecuteWithCircuitBreaker(ctx, func() error {
		result, err := l.client.rdb.Eval(ctx, script, []string{key}, lockValue, int64(ttl/time.Millisecond)).Int64()
		if err != nil {
			return err
		}
		extended = result == 1
		return nil
	})
	if err != nil {
		log.Error().Err(err).Str("key", key).Msg("DistributedLock.Extend失败")
		return errors.ErrRedis("延长锁失败", err)
	}

	if !extended {
		log.Warn().Str("key", key).Msg("DistributedLock.Extend: 锁已不属于当前持有者")
		return errors.ErrRedis("延长锁失败,锁不属于当前持有者", nil)
	}

	return nil
}

// IsLocked 检查资源是否被锁定
func (l *DistributedLock) IsLocked(ctx context.Context) (bool, error) {
	key := l.key
	var locked bool

	err := l.client.ExecuteWithCircuitBreaker(ctx, func() error {
		n, err := l.client.rdb.Exists(ctx, key).Result()
		locked = n > 0
		return err
	})
	if err != nil {
		return false, errors.ErrRedis("检查锁状态失败", err)
	}
	return locked, nil
}

// GetHolder 获取锁持有者
func (l *DistributedLock) GetHolder(ctx context.Context) (string, error) {
	key := l.key
	var holder string

	err := l.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		holder, err = l.client.rdb.Get(ctx, key).Result()
		if err == redis.Nil {
			holder = ""
			return nil
		}
		return err
	})
	if err != nil {
		return "", errors.ErrRedis("获取锁持有者失败", err)
	}
	return holder, nil
}

// GetTTL 获取锁剩余TTL
func (l *DistributedLock) GetTTL(ctx context.Context) (time.Duration, error) {
	key := l.key
	var ttl time.Duration

	err := l.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		ttl, err = l.client.rdb.TTL(ctx, key).Result()
		return err
	})
	if err != nil {
		return 0, errors.ErrRedis("获取锁TTL失败", err)
	}
	return ttl, nil
}

// ForceUnlock 强制释放锁(仅限管理员操作)
func (l *DistributedLock) ForceUnlock(ctx context.Context) error {
	key := l.key

	err := l.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return l.client.rdb.Del(ctx, key).Err()
	})
	if err != nil {
		return errors.ErrRedis("强制释放锁失败", err)
	}
	return nil
}

// LockGuard 锁守卫,自动释放锁
type LockGuard struct {
	lock *DistributedLock
	ctx  context.Context
}

// WithLock 获取锁守卫(自动释放)
func (l *DistributedLock) WithLock(ctx context.Context) (*LockGuard, error) {
	acquired, err := l.Lock(ctx)
	if err != nil {
		return nil, err
	}
	if !acquired {
		return nil, fmt.Errorf("无法获取锁: %s", l.key)
	}
	return &LockGuard{
		lock: l,
		ctx:  ctx,
	}, nil
}

// Release 释放锁
func (g *LockGuard) Release() error {
	return g.lock.Unlock(g.ctx)
}

// Close 释放锁(别名)
func (g *LockGuard) Close() error {
	return g.Release()
}

// FairLock 公平锁
// 基于Redis有序集合实现,保证锁获取的FIFO顺序
type FairLock struct {
	client *Client
	key    string
	value  string
	opts   LockOptions
}

// NewFairLock 创建公平锁
func NewFairLock(client *Client, resource string, opts ...LockOption) *FairLock {
	options := DefaultLockOptions()
	options.Fair = true
	for _, opt := range opts {
		opt(&options)
	}

	return &FairLock{
		client: client,
		key:    fmt.Sprintf("fairlock:%s", resource),
		value:  uuid.New().String(),
		opts:   options,
	}
}

// Lock 获取公平锁
func (f *FairLock) Lock(ctx context.Context) error {
	key := f.key
	now := time.Now().UnixNano()
	score := float64(now)

	// 添加到有序集合
	err := f.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return f.client.rdb.ZAdd(ctx, key, redis.Z{
			Score:  score,
			Member: f.value,
		}).Err()
	})
	if err != nil {
		return errors.ErrRedis("获取公平锁失败", err)
	}

	// 尝试获取锁(自己是第一个)
	for i := 0; i < f.opts.RetryCount; i++ {
		// 检查自己是否是最小的
		rank, err := f.client.rdb.ZRank(ctx, key, f.value).Result()
		if err != nil {
			if err == redis.Nil {
				continue
			}
			return errors.ErrRedis("检查锁排名失败", err)
		}

		if rank == 0 {
			// 自己是第一个,尝试获取锁
			result, err := f.client.rdb.SetNX(ctx, key+":lock", f.value, f.opts.TTL).Result()
			if err != nil {
				return errors.ErrRedis("设置公平锁失败", err)
			}
			if result {
				return nil // 获取成功
			}
		}

		// 不是第一个,等待并重试
		select {
		case <-ctx.Done():
			// 清理自己的 entry
			f.client.rdb.ZRem(ctx, key, f.value)
			return ctx.Err()
		case <-time.After(f.opts.RetryDelay):
		}
	}

	// 获取失败,清理entry
	f.client.rdb.ZRem(ctx, key, f.value)
	return fmt.Errorf("获取公平锁超时: %s", f.key)
}

// Unlock 释放公平锁
func (f *FairLock) Unlock(ctx context.Context) error {
	key := f.key

	// Lua脚本:只删除自己的entry和lock
	script := `
		local lock_holder = redis.call("GET", KEYS[1])
		if lock_holder == ARGV[1] then
			redis.call("DEL", KEYS[1])
		end
		redis.call("ZREM", KEYS[2], ARGV[1])
		return 1
	`

	err := f.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return f.client.rdb.Eval(ctx, script,
			[]string{key + ":lock", key}, f.value).Err()
	})
	if err != nil {
		return errors.ErrRedis("释放公平锁失败", err)
	}
	return nil
}

// ReadWriteLock 读写锁
// 多个读锁可以同时持有,写锁独占
type ReadWriteLock struct {
	client *Client
	key    string
	opts   LockOptions
}

// NewReadWriteLock 创建读写锁
func NewReadWriteLock(client *Client, resource string, opts ...LockOption) *ReadWriteLock {
	return &ReadWriteLock{
		client: client,
		key:    fmt.Sprintf("rwlock:%s", resource),
		opts:   DefaultLockOptions(),
	}
}

// RLock 获取读锁
func (rw *ReadWriteLock) RLock(ctx context.Context) error {
	key := fmt.Sprintf("%s:read", rw.key)
	value := uuid.New().String()

	for i := 0; i < rw.opts.RetryCount; i++ {
		// 检查是否有写锁
		exists, err := rw.client.rdb.Exists(ctx, fmt.Sprintf("%s:write", rw.key)).Result()
		if err != nil {
			return err
		}
		if exists == 0 {
			// 没有写锁,添加读锁
			result, err := rw.client.rdb.SAdd(ctx, key, value).Result()
			if err != nil {
				continue
			}
			if result > 0 {
				// 获取读锁成功
				rw.client.rdb.Expire(ctx, key, rw.opts.TTL)
				return nil
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(rw.opts.RetryDelay):
		}
	}
	return fmt.Errorf("获取读锁超时")
}

// RUnlock 释放读锁
func (rw *ReadWriteLock) RUnlock(ctx context.Context) error {
	key := fmt.Sprintf("%s:read", rw.key)
	value := uuid.New().String()

	err := rw.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return rw.client.rdb.SRem(ctx, key, value).Err()
	})
	return err
}

// WLock 获取写锁
func (rw *ReadWriteLock) WLock(ctx context.Context) error {
	key := fmt.Sprintf("%s:write", rw.key)
	value := uuid.New().String()

	for i := 0; i < rw.opts.RetryCount; i++ {
		// 检查是否有读锁或写锁
		readCount, _ := rw.client.rdb.SCard(ctx, fmt.Sprintf("%s:read", rw.key)).Result()
		if readCount > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(rw.opts.RetryDelay):
				continue
			}
		}

		result, err := rw.client.rdb.SetNX(ctx, key, value, rw.opts.TTL).Result()
		if err != nil {
			return err
		}
		if result {
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(rw.opts.RetryDelay):
		}
	}
	return fmt.Errorf("获取写锁超时")
}

// WUnlock 释放写锁
func (rw *ReadWriteLock) WUnlock(ctx context.Context) error {
	key := fmt.Sprintf("%s:write", rw.key)
	return rw.client.rdb.Del(ctx, key).Err()
}
