// Package redis Redis基础设施层
// 提供缓存服务接口
package redis

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/ai-chat/backend_go/internal/common/errors"
)

// CacheService 缓存服务
// 提供基本的键值缓存功能，支持TTL
type CacheService struct {
	client *Client
}

// NewCacheService 创建缓存服务
func NewCacheService(client *Client) *CacheService {
	return &CacheService{
		client: client,
	}
}

// Get 获取缓存值
func (c *CacheService) Get(ctx context.Context, key string) (string, error) {
	var val string
	err := c.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		val, err = c.client.rdb.Get(ctx, key).Result()
		return err
	})
	if err != nil {
		if err == redis.Nil {
			return "", nil
		}
		log.Error().Err(err).Str("key", key).Msg("CacheService.Get失败")
		return "", errors.ErrRedis("获取缓存失败: "+key, err)
	}

	return val, nil
}

// Set 设置缓存值
func (c *CacheService) Set(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
	err := c.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		switch v := value.(type) {
		case string:
			err = c.client.rdb.Set(ctx, key, v, ttl).Err()
		case []byte:
			err = c.client.rdb.Set(ctx, key, v, ttl).Err()
		default:
			data, marshalErr := json.Marshal(v)
			if marshalErr != nil {
				return marshalErr
			}
			err = c.client.rdb.Set(ctx, key, data, ttl).Err()
		}
		return err
	})
	if err != nil {
		log.Error().Err(err).Str("key", key).Msg("CacheService.Set失败")
		return errors.ErrRedis("设置缓存失败: "+key, err)
	}
	return nil
}

// SetString 设置字符串缓存
func (c *CacheService) SetString(ctx context.Context, key string, value string, ttl time.Duration) error {
	return c.Set(ctx, key, value, ttl)
}

// GetString 获取字符串缓存
func (c *CacheService) GetString(ctx context.Context, key string) (string, error) {
	return c.Get(ctx, key)
}

// SetObject 设置对象缓存
func (c *CacheService) SetObject(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
	return c.Set(ctx, key, value, ttl)
}

// GetObject 获取对象缓存
func (c *CacheService) GetObject(ctx context.Context, key string, dest interface{}) error {
	data, err := c.Get(ctx, key)
	if err != nil {
		return err
	}
	if data == "" {
		return redis.Nil
	}
	return json.Unmarshal([]byte(data), dest)
}

// Delete 删除缓存
func (c *CacheService) Delete(ctx context.Context, key string) error {
	err := c.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return c.client.rdb.Del(ctx, key).Err()
	})
	if err != nil {
		log.Error().Err(err).Str("key", key).Msg("CacheService.Delete失败")
		return errors.ErrRedis("删除缓存失败: "+key, err)
	}
	return nil
}

// DeletePattern 删除匹配模式的键
func (c *CacheService) DeletePattern(ctx context.Context, pattern string) (int64, error) {
	var deleted int64
	err := c.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		iter := c.client.rdb.Scan(ctx, 0, pattern, 100).Iterator()
		for iter.Next(ctx) {
			if err = c.client.rdb.Del(ctx, iter.Val()).Err(); err == nil {
				deleted++
			}
		}
		if err = iter.Err(); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		log.Error().Err(err).Str("pattern", pattern).Msg("CacheService.DeletePattern失败")
		return deleted, errors.ErrRedis("删除匹配键失败: "+pattern, err)
	}
	return deleted, nil
}

// Exists 检查键是否存在
func (c *CacheService) Exists(ctx context.Context, key string) (bool, error) {
	var exists bool
	err := c.client.ExecuteWithCircuitBreaker(ctx, func() error {
		n, err := c.client.rdb.Exists(ctx, key).Result()
		exists = n > 0
		return err
	})
	if err != nil {
		log.Error().Err(err).Str("key", key).Msg("CacheService.Exists失败")
		return false, errors.ErrRedis("检查键存在失败: "+key, err)
	}
	return exists, nil
}

// Expire 设置过期时间
func (c *CacheService) Expire(ctx context.Context, key string, ttl time.Duration) error {
	err := c.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return c.client.rdb.Expire(ctx, key, ttl).Err()
	})
	if err != nil {
		log.Error().Err(err).Str("key", key).Msg("CacheService.Expire失败")
		return errors.ErrRedis("设置过期时间失败: "+key, err)
	}
	return nil
}

// TTL 获取剩余生存时间
func (c *CacheService) TTL(ctx context.Context, key string) (time.Duration, error) {
	var ttl time.Duration
	err := c.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		ttl, err = c.client.rdb.TTL(ctx, key).Result()
		return err
	})
	if err != nil {
		log.Error().Err(err).Str("key", key).Msg("CacheService.TTL失败")
		return 0, errors.ErrRedis("获取TTL失败: "+key, err)
	}
	return ttl, nil
}

// Increment 递增
func (c *CacheService) Increment(ctx context.Context, key string) (int64, error) {
	var n int64
	err := c.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		n, err = c.client.rdb.Incr(ctx, key).Result()
		return err
	})
	if err != nil {
		log.Error().Err(err).Str("key", key).Msg("CacheService.Increment失败")
		return 0, errors.ErrRedis("递增失败: "+key, err)
	}
	return n, nil
}

// Decrement 递减
func (c *CacheService) Decrement(ctx context.Context, key string) (int64, error) {
	var n int64
	err := c.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		n, err = c.client.rdb.Decr(ctx, key).Result()
		return err
	})
	if err != nil {
		log.Error().Err(err).Str("key", key).Msg("CacheService.Decrement失败")
		return 0, errors.ErrRedis("递减失败: "+key, err)
	}
	return n, nil
}

// GetMulti 获取多个键的值
func (c *CacheService) GetMulti(ctx context.Context, keys []string) ([]string, error) {
	if len(keys) == 0 {
		return []string{}, nil
	}

	var values []interface{}
	err := c.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		values, err = c.client.rdb.MGet(ctx, keys...).Result()
		return err
	})
	if err != nil {
		log.Error().Err(err).Strs("keys", keys).Msg("CacheService.GetMulti失败")
		return nil, errors.ErrRedis("批量获取失败", err)
	}

	result := make([]string, len(values))
	for i, v := range values {
		if v != nil {
			// MGet返回[]interface{}，需要类型断言
			if str, ok := v.(string); ok {
				result[i] = str
			}
		}
	}
	return result, nil
}

// SetMulti 批量设置
func (c *CacheService) SetMulti(ctx context.Context, values map[string]interface{}, ttl time.Duration) error {
	if len(values) == 0 {
		return nil
	}

	err := c.client.ExecuteWithCircuitBreaker(ctx, func() error {
		pipe := c.client.rdb.Pipeline()
		for k, v := range values {
			switch val := v.(type) {
			case string:
				pipe.Set(ctx, k, val, ttl)
			case []byte:
				pipe.Set(ctx, k, val, ttl)
			default:
				data, _ := json.Marshal(val)
				pipe.Set(ctx, k, data, ttl)
			}
		}
		_, err := pipe.Exec(ctx)
		return err
	})
	if err != nil {
		log.Error().Err(err).Int("count", len(values)).Msg("CacheService.SetMulti失败")
		return errors.ErrRedis("批量设置失败", err)
	}
	return nil
}
