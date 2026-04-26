// Package redis Redis基础设施层
// 提供会话缓存服务
package redis

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/ai-chat/backend_go/internal/common/errors"
)

// DefaultSessionTTL 默认会话TTL (24小时)
const DefaultSessionTTL = 24 * time.Hour

// SessionData 会话数据结构
// 可根据业务需求扩展
type SessionData struct {
	SessionId   string                 `json:"session_id"`
	UserId      string                 `json:"user_id,omitempty"`
	Messages    []SessionMessage       `json:"messages,omitempty"`
	Context     map[string]interface{} `json:"context,omitempty"`
	Metadata    map[string]string      `json:"metadata,omitempty"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
	ExpiresAt   time.Time              `json:"expires_at"`
	Version     int64                  `json:"version"` // 乐观锁版本号
}

// SessionMessage 会话消息
type SessionMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Time    int64  `json:"time"`
}

// SessionCacheService 会话缓存服务
type SessionCacheService struct {
	client *Client
	ttl    time.Duration
}

// NewSessionCacheService 创建会话缓存服务
func NewSessionCacheService(client *Client) *SessionCacheService {
	return &SessionCacheService{
		client: client,
		ttl:    DefaultSessionTTL,
	}
}

// NewSessionCacheServiceWithTTL 创建带自定义TTL的会话缓存服务
func NewSessionCacheServiceWithTTL(client *Client, ttl time.Duration) *SessionCacheService {
	return &SessionCacheService{
		client: client,
		ttl:    ttl,
	}
}

// GetSession 获取会话
func (s *SessionCacheService) GetSession(ctx context.Context, sessionId string) (*SessionData, error) {
	key := SessionKey(sessionId)

	var data []byte
	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		data, err = s.client.rdb.Get(ctx, key).Bytes()
		return err
	})
	if err != nil {
		if err == redis.Nil {
			return nil, nil // 会话不存在
		}
		log.Error().Err(err).Str("sessionId", sessionId).Msg("SessionCacheService.GetSession失败")
		return nil, errors.ErrRedis("获取会话失败: "+sessionId, err)
	}

	var session SessionData
	if err := json.Unmarshal(data, &session); err != nil {
		log.Error().Err(err).Str("sessionId", sessionId).Msg("SessionCacheService.GetSession解析失败")
		return nil, errors.ErrRedis("解析会话数据失败", err)
	}

	return &session, nil
}

// SetSession 设置会话
func (s *SessionCacheService) SetSession(ctx context.Context, sessionId string, session *SessionData) error {
	return s.SetSessionWithTTL(ctx, sessionId, session, s.ttl)
}

// SetSessionWithTTL 设置会话并指定TTL
func (s *SessionCacheService) SetSessionWithTTL(ctx context.Context, sessionId string, session *SessionData, ttl time.Duration) error {
	key := SessionKey(sessionId)

	// 设置更新时间
	session.UpdatedAt = time.Now()
	session.ExpiresAt = time.Now().Add(ttl)

	data, err := json.Marshal(session)
	if err != nil {
		log.Error().Err(err).Str("sessionId", sessionId).Msg("SessionCacheService.SetSession序列化失败")
		return errors.ErrRedis("序列化会话数据失败", err)
	}

	err = s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return s.client.rdb.Set(ctx, key, data, ttl).Err()
	})
	if err != nil {
		log.Error().Err(err).Str("sessionId", sessionId).Msg("SessionCacheService.SetSession失败")
		return errors.ErrRedis("设置会话失败: "+sessionId, err)
	}

	return nil
}

// UpdateSession 更新会话(乐观锁)
func (s *SessionCacheService) UpdateSession(ctx context.Context, sessionId string, updateFn func(*SessionData) error) error {
	for retries := 0; retries < 3; retries++ {
		session, err := s.GetSession(ctx, sessionId)
		if err != nil {
			return err
		}
		if session == nil {
			return errors.ErrSession("会话不存在: "+sessionId, nil)
		}

		// 应用更新函数
		if err := updateFn(session); err != nil {
			return err
		}

		// 乐观锁: 检查版本号
		session.Version++

		// 尝试更新
		key := SessionKey(sessionId)
		data, _ := json.Marshal(session)

		err = s.client.ExecuteWithCircuitBreaker(ctx, func() error {
			// 使用Watch实现乐观锁
			return s.client.rdb.Watch(ctx, func(tx *redis.Tx) error {
				// 获取当前版本
				var current SessionData
				currentData, err := tx.Get(ctx, key).Bytes()
				if err != nil && err != redis.Nil {
					return err
				}
				if err == nil {
					if unmarshalErr := json.Unmarshal(currentData, &current); unmarshalErr != nil {
						return unmarshalErr
					}
					// 版本冲突检测
					if current.Version != session.Version-1 {
						return errors.ErrSession("会话版本冲突", nil)
					}
				}

				// 执行事务
				_, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
					pipe.Set(ctx, key, data, s.ttl)
					return nil
				})
				return err
			}, key)
		})
		if err == nil {
			return nil
		}
		// 如果是版本冲突,重试
		if errors.IsSessionVersionConflict(err) {
			log.Warn().Str("sessionId", sessionId).Int("retry", retries+1).Msg("会话版本冲突,重试")
			continue
		}
		return err
	}
	return errors.ErrSession("会话更新失败,达到最大重试次数", nil)
}

// DelSession 删除会话
func (s *SessionCacheService) DelSession(ctx context.Context, sessionId string) error {
	key := SessionKey(sessionId)

	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return s.client.rdb.Del(ctx, key).Err()
	})
	if err != nil {
		log.Error().Err(err).Str("sessionId", sessionId).Msg("SessionCacheService.DelSession失败")
		return errors.ErrRedis("删除会话失败: "+sessionId, err)
	}
	return nil
}

// RefreshSessionTTL 刷新会话TTL
func (s *SessionCacheService) RefreshSessionTTL(ctx context.Context, sessionId string) error {
	key := SessionKey(sessionId)

	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return s.client.rdb.Expire(ctx, key, s.ttl).Err()
	})
	if err != nil {
		log.Error().Err(err).Str("sessionId", sessionId).Msg("SessionCacheService.RefreshSessionTTL失败")
		return errors.ErrRedis("刷新会话TTL失败: "+sessionId, err)
	}
	return nil
}

// RefreshSessionTTLWithCustom 刷新会话TTL并指定新的TTL
func (s *SessionCacheService) RefreshSessionTTLWithCustom(ctx context.Context, sessionId string, ttl time.Duration) error {
	key := SessionKey(sessionId)

	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		return s.client.rdb.Expire(ctx, key, ttl).Err()
	})
	if err != nil {
		log.Error().Err(err).Str("sessionId", sessionId).Msg("SessionCacheService.RefreshSessionTTLWithCustom失败")
		return errors.ErrRedis("刷新会话TTL失败: "+sessionId, err)
	}
	return nil
}

// AddMessage 添加消息到会话
func (s *SessionCacheService) AddMessage(ctx context.Context, sessionId string, role, content string) error {
	return s.UpdateSession(ctx, sessionId, func(session *SessionData) error {
		session.Messages = append(session.Messages, SessionMessage{
			Role:    role,
			Content: content,
			Time:    time.Now().Unix(),
		})
		return nil
	})
}

// GetMessages 获取会话消息
func (s *SessionCacheService) GetMessages(ctx context.Context, sessionId string) ([]SessionMessage, error) {
	session, err := s.GetSession(ctx, sessionId)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return []SessionMessage{}, nil
	}
	return session.Messages, nil
}

// SetContext 设置会话上下文
func (s *SessionCacheService) SetContext(ctx context.Context, sessionId string, key string, value interface{}) error {
	return s.UpdateSession(ctx, sessionId, func(session *SessionData) error {
		if session.Context == nil {
			session.Context = make(map[string]interface{})
		}
		session.Context[key] = value
		return nil
	})
}

// GetContext 获取会话上下文
func (s *SessionCacheService) GetContext(ctx context.Context, sessionId string, key string) (interface{}, error) {
	session, err := s.GetSession(ctx, sessionId)
	if err != nil {
		return nil, err
	}
	if session == nil || session.Context == nil {
		return nil, nil
	}
	return session.Context[key], nil
}

// SetMetadata 设置会话元数据
func (s *SessionCacheService) SetMetadata(ctx context.Context, sessionId string, key, value string) error {
	return s.UpdateSession(ctx, sessionId, func(session *SessionData) error {
		if session.Metadata == nil {
			session.Metadata = make(map[string]string)
		}
		session.Metadata[key] = value
		return nil
	})
}

// GetMetadata 获取会话元数据
func (s *SessionCacheService) GetMetadata(ctx context.Context, sessionId string, key string) (string, error) {
	session, err := s.GetSession(ctx, sessionId)
	if err != nil {
		return "", err
	}
	if session == nil || session.Metadata == nil {
		return "", nil
	}
	return session.Metadata[key], nil
}

// Exists 检查会话是否存在
func (s *SessionCacheService) Exists(ctx context.Context, sessionId string) (bool, error) {
	key := SessionKey(sessionId)
	var exists bool

	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		n, err := s.client.rdb.Exists(ctx, key).Result()
		exists = n > 0
		return err
	})
	if err != nil {
		log.Error().Err(err).Str("sessionId", sessionId).Msg("SessionCacheService.Exists失败")
		return false, errors.ErrRedis("检查会话存在失败: "+sessionId, err)
	}
	return exists, nil
}

// GetSessionTTL 获取会话剩余生存时间
func (s *SessionCacheService) GetSessionTTL(ctx context.Context, sessionId string) (time.Duration, error) {
	key := SessionKey(sessionId)
	var ttl time.Duration

	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		ttl, err = s.client.rdb.TTL(ctx, key).Result()
		return err
	})
	if err != nil {
		log.Error().Err(err).Str("sessionId", sessionId).Msg("SessionCacheService.GetSessionTTL失败")
		return 0, errors.ErrRedis("获取会话TTL失败: "+sessionId, err)
	}
	return ttl, nil
}

// ListSessions 列出所有会话(用于管理)
func (s *SessionCacheService) ListSessions(ctx context.Context, pattern string, limit int64) ([]string, error) {
	if limit <= 0 {
		limit = 100
	}
	if pattern == "" {
		pattern = SessionKeyPrefix + ":*"
	}

	var sessions []string
	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		iter := s.client.rdb.Scan(ctx, 0, pattern, limit).Iterator()
		for iter.Next(ctx) {
			key := iter.Val()
			// 提取sessionId
			if len(key) > len(SessionKeyPrefix)+1 {
				sessionId := key[len(SessionKeyPrefix)+1:]
				sessions = append(sessions, sessionId)
			}
		}
		if err = iter.Err(); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		log.Error().Err(err).Str("pattern", pattern).Msg("SessionCacheService.ListSessions失败")
		return nil, errors.ErrRedis("列出会话失败", err)
	}
	return sessions, nil
}

// CountSessions 统计会话数量
func (s *SessionCacheService) CountSessions(ctx context.Context, pattern string) (int64, error) {
	if pattern == "" {
		pattern = SessionKeyPrefix + ":*"
	}

	var count int64
	err := s.client.ExecuteWithCircuitBreaker(ctx, func() error {
		var err error
		iter := s.client.rdb.Scan(ctx, 0, pattern, 0).Iterator()
		for iter.Next(ctx) {
			count++
		}
		if err = iter.Err(); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		log.Error().Err(err).Str("pattern", pattern).Msg("SessionCacheService.CountSessions失败")
		return 0, errors.ErrRedis("统计会话数量失败", err)
	}
	return count, nil
}
