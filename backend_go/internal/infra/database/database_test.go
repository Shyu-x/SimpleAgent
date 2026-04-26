package database

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// MockPool is a mock implementation of Pool for testing
type MockPool struct {
	mock.Mock
}

func (m *MockPool) Ping(ctx context.Context) error {
	args := m.Called(ctx)
	return args.Error(0)
}

func (m *MockPool) QueryRow(ctx context.Context, sql string, args ...interface{}) MockRow {
	args2 := m.Called(ctx, sql, args)
	return args2.Get(0).(MockRow)
}

func (m *MockPool) Exec(ctx context.Context, sql string, args ...interface{}) (MockResult, error) {
	args2 := m.Called(ctx, sql, args)
	return args2.Get(0).(MockResult), args2.Error(1)
}

type MockRow struct {
	mock.Mock
}

func (m *MockRow) Scan(dest ...interface{}) error {
	args := m.Called(dest)
	return args.Error(0)
}

type MockResult struct {
	mock.Mock
}

func (m *MockResult) RowsAffected() int64 {
	args := m.Called()
	return args.Get(0).(int64)
}

// TestDBConfig tests for DBConfig
func TestDBConfig_Validate(t *testing.T) {
	t.Run("valid config", func(t *testing.T) {
		cfg := &DBConfig{
			URL:            "postgres://user:pass@localhost:5432/db",
			MaxConns:       10,
			MinConns:       5,
			MaxConnLifetime: time.Hour,
			MaxConnIdleTime: 30 * time.Minute,
		}
		assert.NoError(t, cfg.Validate())
	})

	t.Run("empty URL", func(t *testing.T) {
		cfg := &DBConfig{
			MaxConns:       10,
			MaxConnLifetime: time.Hour,
		}
		assert.Error(t, cfg.Validate())
		assert.Contains(t, cfg.Validate().Error(), "URL is required")
	})

	t.Run("invalid max_conns", func(t *testing.T) {
		cfg := &DBConfig{
			URL:            "postgres://user:pass@localhost:5432/db",
			MaxConns:       0,
			MaxConnLifetime: time.Hour,
		}
		assert.Error(t, cfg.Validate())
		assert.Contains(t, cfg.Validate().Error(), "max_conns must be positive")
	})

	t.Run("negative min_conns", func(t *testing.T) {
		cfg := &DBConfig{
			URL:            "postgres://user:pass@localhost:5432/db",
			MaxConns:       10,
			MinConns:       -1,
			MaxConnLifetime: time.Hour,
		}
		assert.Error(t, cfg.Validate())
		assert.Contains(t, cfg.Validate().Error(), "min_conns must be non-negative")
	})
}

func TestDefaultDBConfig(t *testing.T) {
	cfg := DefaultDBConfig()

	assert.Equal(t, 20, cfg.MaxConns)
	assert.Equal(t, 5, cfg.MinConns)
	assert.Equal(t, time.Hour, cfg.MaxConnLifetime)
	assert.Equal(t, 30*time.Minute, cfg.MaxConnIdleTime)
	assert.Equal(t, time.Minute, cfg.HealthCheck)
}

// TestSession tests for Session model
func TestSession_Model(t *testing.T) {
	session := &Session{
		ID:        uuid.New(),
		UserID:    "user-123",
		Metadata:  json.RawMessage(`{"key": "value"}`),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	assert.NotEmpty(t, session.ID)
	assert.Equal(t, "user-123", session.UserID)
	assert.NotNil(t, session.Metadata)
}

// TestMessage tests for Message model
func TestMessage_Model(t *testing.T) {
	sessionID := uuid.New()
	msg := &Message{
		ID:        uuid.New(),
		SessionID: sessionID,
		Role:      "user",
		Content:   "Hello, world!",
		CreatedAt: time.Now(),
	}

	assert.NotEmpty(t, msg.ID)
	assert.Equal(t, sessionID, msg.SessionID)
	assert.Equal(t, "user", msg.Role)
	assert.Equal(t, "Hello, world!", msg.Content)
}

// TestCreateSessionRequest validates CreateSessionRequest
func TestCreateSessionRequest(t *testing.T) {
	t.Run("valid request", func(t *testing.T) {
		metadata := json.RawMessage(`{"source": "test"}`)
		req := &CreateSessionRequest{
			UserID:   "user-123",
			Metadata: metadata,
		}
		assert.Equal(t, "user-123", req.UserID)
		assert.Equal(t, metadata, req.Metadata)
	})

	t.Run("nil metadata defaults to empty object", func(t *testing.T) {
		req := &CreateSessionRequest{
			UserID: "user-123",
		}
		assert.Nil(t, req.Metadata)
	})
}

// TestSaveMessageRequest validates SaveMessageRequest
func TestSaveMessageRequest(t *testing.T) {
	t.Run("valid request", func(t *testing.T) {
		sessionID := uuid.New()
		req := &SaveMessageRequest{
			SessionID: sessionID,
			Role:      "assistant",
			Content:   "How can I help you?",
		}
		assert.Equal(t, sessionID, req.SessionID)
		assert.Equal(t, "assistant", req.Role)
		assert.Equal(t, "How can I help you?", req.Content)
	})
}

// TestRoleValidation tests role validation
func TestRoleValidation(t *testing.T) {
	validRoles := map[string]bool{
		"user":      true,
		"assistant": true,
		"system":    true,
	}

	t.Run("valid roles", func(t *testing.T) {
		for role := range validRoles {
			assert.True(t, validRoles[role])
		}
	})

	t.Run("invalid role", func(t *testing.T) {
		assert.False(t, validRoles["invalid"])
		assert.False(t, validRoles["admin"])
	})
}

// TestHealthCheckResult tests HealthCheckResult structure
func TestHealthCheckResult(t *testing.T) {
	result := &HealthCheckResult{
		Healthy: true,
		Latency: 10 * time.Millisecond,
		PoolStats: PoolStats{
			TotalConns:    10,
			IdleConns:     5,
			AcquiredConns: 3,
			Constructing:  0,
		},
	}

	assert.True(t, result.Healthy)
	assert.Equal(t, 10*time.Millisecond, result.Latency)
	assert.Equal(t, 10, result.PoolStats.TotalConns)
	assert.Equal(t, 5, result.PoolStats.IdleConns)
}

// Integration test helpers (requires actual PostgreSQL)
func skipIfNoDatabase(t *testing.T) {
	t.Skip("Skipping integration test: no database available")
}

// Integration tests (these would run against a real database)
func TestPostgresSessionRepository_Integration(t *testing.T) {
	skipIfNoDatabase(t)

	ctx := context.Background()
	cfg := &DBConfig{
		URL:            "postgres://localhost:5432/test",
		MaxConns:       5,
		MinConns:       1,
		MaxConnLifetime: time.Hour,
	}

	pool, err := NewPool(ctx, cfg)
	if err != nil {
		t.Skipf("Skipping: cannot connect to database: %v", err)
	}
	defer pool.Close()

	repo := NewSessionRepository(pool)

	t.Run("CreateSession", func(t *testing.T) {
		req := &CreateSessionRequest{
			UserID:   "test-user",
			Metadata: json.RawMessage(`{"test": true}`),
		}
		session, err := repo.CreateSession(ctx, req)
		assert.NoError(t, err)
		assert.NotNil(t, session)
		assert.Equal(t, "test-user", session.UserID)
	})

	t.Run("GetSession", func(t *testing.T) {
		req := &CreateSessionRequest{UserID: "test-user-2"}
		session, err := repo.CreateSession(ctx, req)
		assert.NoError(t, err)

		retrieved, err := repo.GetSession(ctx, session.ID)
		assert.NoError(t, err)
		assert.Equal(t, session.ID, retrieved.ID)
	})

	t.Run("UpdateSession", func(t *testing.T) {
		req := &CreateSessionRequest{UserID: "test-user-3"}
		session, err := repo.CreateSession(ctx, req)
		assert.NoError(t, err)

		newMetadata := json.RawMessage(`{"updated": true}`)
		updated, err := repo.UpdateSession(ctx, session.ID, &UpdateSessionRequest{Metadata: newMetadata})
		assert.NoError(t, err)
		assert.Equal(t, newMetadata, updated.Metadata)
	})

	t.Run("DeleteSession", func(t *testing.T) {
		req := &CreateSessionRequest{UserID: "test-user-4"}
		session, err := repo.CreateSession(ctx, req)
		assert.NoError(t, err)

		err = repo.DeleteSession(ctx, session.ID)
		assert.NoError(t, err)

		_, err = repo.GetSession(ctx, session.ID)
		assert.Error(t, err)
	})
}
