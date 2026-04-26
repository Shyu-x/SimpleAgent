// Package redis Redis基础设施层
// 提供Token缓存服务
package redis

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/ai-chat/backend_go/internal/common/errors"
)

// TokenData Token数据结构
type TokenData struct {
	Token     string    `json:"token"`
	UserId    string    `json:"user_id,omitempty"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

// TokenCacheService Token缓存服务
// 提供API Token的缓存、验证和自动刷新功能
type TokenCacheService struct {
	client *Client
	ttl    time.Duration
}

// DefaultTokenTTL 默认Token TTL (1小时)
const DefaultTokenTTL = 1 * time.Hour

// NewTokenCacheService 创建Token缓存服务
func NewTokenCacheService(client *Client) *TokenCacheService {
	return &TokenCacheService{
		client: client,
		ttl:    DefaultTokenTTL,
	}
}

// NewTokenCacheServiceWithTTL 创建带自定义TTL的Token缓存服务
func NewTokenCacheServiceWithTTL(client *Client, ttl time.Duration) *TokenCacheService {
	return &TokenCacheService{
		client: client,
		ttl:    ttl,
	}
}

// TokenKeyPrefix Token键前缀
const TokenKeyPrefix = "token"

// TokenKey 生成Token键
func TokenKey(token string) string {
	return TokenKeyPrefix + ":" + token
}

// SetToken 设置Token
func (s *TokenCacheService) SetToken(ctx context.Context, token string, data *TokenData) error {
	return s.SetTokenWithTTL(ctx, token, data, s.ttl)
}

// SetTokenWithTTL 设置Token并指定TTL
func (s *TokenCacheService) SetTokenWithTTL(ctx context.Context, token string, data *TokenData, ttl time.Duration) error {
	key := TokenKey(token)

	// 设置创建时间和过期时间
	data.CreatedAt = time.Now()
	data.ExpiresAt = time.Now().Add(ttl)

	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Error().Err(err).Str("token", token[:10]+"...").Msg("TokenCacheService.SetToken序列化失败")
		return errors.ErrRedis("序列化Token数据失败", err)
	}

	err = s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return s.client.rdb.Set(ctx, key, jsonData, ttl).Err()
	})
	if err != nil {
		log.Error().Err(err).Str("token", token[:10]+"...").Msg("TokenCacheService.SetToken失败")
		return errors.ErrRedis("设置Token失败", err)
	}

	return nil
}

// GetToken 获取Token数据
func (s *TokenCacheService) GetToken(ctx context.Context, token string) (*TokenData, error) {
	key := TokenKey(token)

	var data []byte
	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		data, err = s.client.rdb.Get(ctx, key).Bytes()
		return err
	})
	if err != nil {
		if err == redis.Nil {
			return nil, nil // Token不存在
		}
		log.Error().Err(err).Str("token", token[:10]+"...").Msg("TokenCacheService.GetToken失败")
		return nil, errors.ErrRedis("获取Token失败", err)
	}

	var tokenData TokenData
	if err := json.Unmarshal(data, &tokenData); err != nil {
		log.Error().Err(err).Str("token", token[:10]+"...").Msg("TokenCacheService.GetToken解析失败")
		return nil, errors.ErrRedis("解析Token数据失败", err)
	}

	return &tokenData, nil
}

// ValidateToken 验证Token是否有效
func (s *TokenCacheService) ValidateToken(ctx context.Context, token string) (bool, error) {
	tokenData, err := s.GetToken(ctx, token)
	if err != nil {
		return false, err
	}
	if tokenData == nil {
		return false, nil
	}

	// 检查是否过期
	if time.Now().After(tokenData.ExpiresAt) {
		log.Debug().Str("token", token[:10]+"...").Msg("Token已过期")
		return false, nil
	}

	return true, nil
}

// DeleteToken 删除Token
func (s *TokenCacheService) DeleteToken(ctx context.Context, token string) error {
	key := TokenKey(token)

	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return s.client.rdb.Del(ctx, key).Err()
	})
	if err != nil {
		log.Error().Err(err).Str("token", token[:10]+"...").Msg("TokenCacheService.DeleteToken失败")
		return errors.ErrRedis("删除Token失败", err)
	}
	return nil
}

// RefreshTokenTTL 刷新Token TTL
func (s *TokenCacheService) RefreshTokenTTL(ctx context.Context, token string) error {
	return s.RefreshTokenTTLWithCustom(ctx, token, s.ttl)
}

// RefreshTokenTTLWithCustom 刷新Token TTL并指定新的TTL
func (s *TokenCacheService) RefreshTokenTTLWithCustom(ctx context.Context, token string, ttl time.Duration) error {
	key := TokenKey(token)

	// 先获取现有数据
	tokenData, err := s.GetToken(ctx, token)
	if err != nil {
		return err
	}
	if tokenData == nil {
		return errors.ErrRedis("Token不存在", nil)
	}

	// 更新过期时间
	tokenData.ExpiresAt = time.Now().Add(ttl)

	jsonData, err := json.Marshal(tokenData)
	if err != nil {
		return errors.ErrRedis("序列化Token数据失败", err)
	}

	err = s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return s.client.rdb.Set(ctx, key, jsonData, ttl).Err()
	})
	if err != nil {
		log.Error().Err(err).Str("token", token[:10]+"...").Msg("TokenCacheService.RefreshTokenTTL失败")
		return errors.ErrRedis("刷新Token TTL失败", err)
	}
	return nil
}

// GetTokenTTL 获取Token剩余生存时间
func (s *TokenCacheService) GetTokenTTL(ctx context.Context, token string) (time.Duration, error) {
	key := TokenKey(token)

	var ttl time.Duration
	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		ttl, err = s.client.rdb.TTL(ctx, key).Result()
		return err
	})
	if err != nil {
		log.Error().Err(err).Str("token", token[:10]+"...").Msg("TokenCacheService.GetTokenTTL失败")
		return 0, errors.ErrRedis("获取Token TTL失败", err)
	}
	return ttl, nil
}

// GetTokenMetadata 获取Token元数据
func (s *TokenCacheService) GetTokenMetadata(ctx context.Context, token string) (map[string]string, error) {
	tokenData, err := s.GetToken(ctx, token)
	if err != nil {
		return nil, err
	}
	if tokenData == nil {
		return nil, nil
	}
	return tokenData.Metadata, nil
}

// SetTokenMetadata 设置Token元数据
func (s *TokenCacheService) SetTokenMetadata(ctx context.Context, token string, key, value string) error {
	tokenData, err := s.GetToken(ctx, token)
	if err != nil {
		return err
	}
	if tokenData == nil {
		return errors.ErrRedis("Token不存在", nil)
	}

	if tokenData.Metadata == nil {
		tokenData.Metadata = make(map[string]string)
	}
	tokenData.Metadata[key] = value

	jsonData, err := json.Marshal(tokenData)
	if err != nil {
		return errors.ErrRedis("序列化Token数据失败", err)
	}

	// 获取剩余TTL
	ttl, _ := s.GetTokenTTL(ctx, token)
	if ttl <= 0 {
		ttl = s.ttl
	}

	err = s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return s.client.rdb.Set(ctx, TokenKey(token), jsonData, ttl).Err()
	})
	if err != nil {
		return errors.ErrRedis("设置Token元数据失败", err)
	}
	return nil
}

// ListTokens 列出所有Token(用于管理)
func (s *TokenCacheService) ListTokens(ctx context.Context, pattern string, limit int64) ([]string, error) {
	if limit <= 0 {
		limit = 100
	}
	if pattern == "" {
		pattern = TokenKeyPrefix + ":*"
	}

	var tokens []string
	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		iter := s.client.rdb.Scan(ctx, 0, pattern, limit).Iterator()
		for iter.Next(ctx) {
			key := iter.Val()
			// 提取token
			if len(key) > len(TokenKeyPrefix)+1 {
				token := key[len(TokenKeyPrefix)+1:]
				tokens = append(tokens, token)
			}
		}
		if err = iter.Err(); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		log.Error().Err(err).Str("pattern", pattern).Msg("TokenCacheService.ListTokens失败")
		return nil, errors.ErrRedis("列出Token失败", err)
	}
	return tokens, nil
}

// CountTokens 统计Token数量
func (s *TokenCacheService) CountTokens(ctx context.Context) (int64, error) {
	var count int64
	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		iter := s.client.rdb.Scan(ctx, 0, TokenKeyPrefix+":*", 0).Iterator()
		for iter.Next(ctx) {
			count++
		}
		if err = iter.Err(); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		log.Error().Err(err).Msg("TokenCacheService.CountTokens失败")
		return 0, errors.ErrRedis("统计Token数量失败", err)
	}
	return count, nil
}

// UserTokenIndex 用户Token索引键前缀
const UserTokenIndexPrefix = "user_tokens"

// UserTokenIndexKey 生成用户Token索引键
func UserTokenIndexKey(userId string) string {
	return UserTokenIndexPrefix + ":" + userId
}

// AddTokenToUserIndex 将Token添加到用户索引
func (s *TokenCacheService) AddTokenToUserIndex(ctx context.Context, userId, token string) error {
	key := UserTokenIndexKey(userId)

	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return s.client.rdb.SAdd(ctx, key, token).Err()
	})
	if err != nil {
		log.Error().Err(err).Str("userId", userId).Msg("AddTokenToUserIndex失败")
		return errors.ErrRedis("添加Token到用户索引失败", err)
	}

	// 设置索引过期时间(比Token TTL长)
	s.client.rdb.Expire(ctx, key, s.ttl*2)

	return nil
}

// RemoveTokenFromUserIndex 将Token从用户索引移除
func (s *TokenCacheService) RemoveTokenFromUserIndex(ctx context.Context, userId, token string) error {
	key := UserTokenIndexKey(userId)

	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return s.client.rdb.SRem(ctx, key, token).Err()
	})
	if err != nil {
		log.Error().Err(err).Str("userId", userId).Msg("RemoveTokenFromUserIndex失败")
		return errors.ErrRedis("从用户索引移除Token失败", err)
	}
	return nil
}

// GetUserTokens 获取用户的所有Token
func (s *TokenCacheService) GetUserTokens(ctx context.Context, userId string) ([]string, error) {
	key := UserTokenIndexKey(userId)

	var tokens []string
	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		tokens, err = s.client.rdb.SMembers(ctx, key).Result()
		return err
	})
	if err != nil {
		log.Error().Err(err).Str("userId", userId).Msg("GetUserTokens失败")
		return nil, errors.ErrRedis("获取用户Token列表失败", err)
	}
	return tokens, nil
}

// DeleteAllUserTokens 删除用户的所有Token
func (s *TokenCacheService) DeleteAllUserTokens(ctx context.Context, userId string) error {
	tokens, err := s.GetUserTokens(ctx, userId)
	if err != nil {
		return err
	}

	for _, token := range tokens {
		if err := s.DeleteToken(ctx, token); err != nil {
			log.Warn().Err(err).Str("token", token[:10]+"...").Msg("删除Token失败,继续其他Token")
		}
	}

	// 删除用户索引
	key := UserTokenIndexKey(userId)
	err = s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return s.client.rdb.Del(ctx, key).Err()
	})
	if err != nil {
		log.Error().Err(err).Str("userId", userId).Msg("DeleteAllUserTokens删除索引失败")
		return errors.ErrRedis("删除用户Token索引失败", err)
	}

	return nil
}
