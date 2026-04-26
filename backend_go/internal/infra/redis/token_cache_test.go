// Package redis Token缓存服务单元测试
package redis

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestTokenCacheServiceCreation(t *testing.T) {
	client := &Client{}
	service := NewTokenCacheService(client)

	assert.NotNil(t, service)
	assert.Equal(t, DefaultTokenTTL, service.ttl)
}

func TestTokenCacheServiceCreationWithTTL(t *testing.T) {
	client := &Client{}
	ttl := 2 * time.Hour
	service := NewTokenCacheServiceWithTTL(client, ttl)

	assert.NotNil(t, service)
	assert.Equal(t, ttl, service.ttl)
}

func TestTokenKey(t *testing.T) {
	tests := []struct {
		name     string
		token    string
		expected string
	}{
		{
			name:     "普通token",
			token:    "abc123",
			expected: "token:abc123",
		},
		{
			name:     "长token",
			token:    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
			expected: "token:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := TokenKey(tt.token)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestUserTokenIndexKey(t *testing.T) {
	result := UserTokenIndexKey("user123")
	assert.Equal(t, "user_tokens:user123", result)
}

func TestTokenData(t *testing.T) {
	now := time.Now()
	tokenData := TokenData{
		Token:     "test-token-123",
		UserId:    "user456",
		ExpiresAt: now.Add(time.Hour),
		CreatedAt: now,
		Metadata:  map[string]string{"role": "admin"},
	}

	assert.Equal(t, "test-token-123", tokenData.Token)
	assert.Equal(t, "user456", tokenData.UserId)
	assert.Equal(t, "admin", tokenData.Metadata["role"])
	assert.True(t, tokenData.ExpiresAt.After(now))
}

func TestTokenCacheServiceDefaultTTL(t *testing.T) {
	// 验证默认TTL是1小时
	assert.Equal(t, 1*time.Hour, DefaultTokenTTL)
}
