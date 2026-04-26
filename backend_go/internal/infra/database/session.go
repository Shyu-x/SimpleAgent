package database

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	apperrors "github.com/ai-chat/backend_go/internal/common/errors"
)

// Session 会话模型
type Session struct {
	ID        uuid.UUID       `json:"id"`
	UserID    string          `json:"user_id"`
	Metadata  json.RawMessage `json:"metadata"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// CreateSessionRequest 创建会话请求
type CreateSessionRequest struct {
	UserID   string          `json:"user_id" binding:"required"`
	Metadata json.RawMessage `json:"metadata"`
}

// UpdateSessionRequest 更新会话请求
type UpdateSessionRequest struct {
	Metadata json.RawMessage `json:"metadata"`
}

// SessionRepository 会话仓储接口
type SessionRepository interface {
	CreateSession(ctx context.Context, req *CreateSessionRequest) (*Session, error)
	GetSession(ctx context.Context, id uuid.UUID) (*Session, error)
	UpdateSession(ctx context.Context, id uuid.UUID, req *UpdateSessionRequest) (*Session, error)
	DeleteSession(ctx context.Context, id uuid.UUID) error
	ListSessions(ctx context.Context, userID string, limit, offset int) ([]*Session, int, error)
}

// PostgresSessionRepository PostgreSQL会话仓储实现
type PostgresSessionRepository struct {
	pool *Pool
}

// NewSessionRepository 创建会话仓储
func NewSessionRepository(pool *Pool) SessionRepository {
	return &PostgresSessionRepository{pool: pool}
}

// CreateSession 创建会话
func (r *PostgresSessionRepository) CreateSession(ctx context.Context, req *CreateSessionRequest) (*Session, error) {
	if req.UserID == "" {
		return nil, apperrors.ErrInvalidParameter("user_id is required")
	}

	metadata := req.Metadata
	if metadata == nil {
		metadata = json.RawMessage("{}")
	}

	query := `
		INSERT INTO sessions (user_id, metadata)
		VALUES ($1, $2)
		RETURNING id, user_id, metadata, created_at, updated_at
	`

	var session Session
	err := r.pool.QueryRow(ctx, query, req.UserID, metadata).Scan(
		&session.ID,
		&session.UserID,
		&session.Metadata,
		&session.CreatedAt,
		&session.UpdatedAt,
	)
	if err != nil {
		log.Error().Err(err).Msg("failed to create session")
		return nil, apperrors.ErrDatabase("failed to create session", err)
	}

	log.Debug().
		Str("session_id", session.ID.String()).
		Str("user_id", session.UserID).
		Msg("session created")

	return &session, nil
}

// GetSession 获取会话
func (r *PostgresSessionRepository) GetSession(ctx context.Context, id uuid.UUID) (*Session, error) {
	query := `
		SELECT id, user_id, metadata, created_at, updated_at
		FROM sessions
		WHERE id = $1
	`

	var session Session
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&session.ID,
		&session.UserID,
		&session.Metadata,
		&session.CreatedAt,
		&session.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, apperrors.ErrNotFound
		}
		log.Error().Err(err).Str("session_id", id.String()).Msg("failed to get session")
		return nil, apperrors.ErrDatabase("failed to get session", err)
	}

	return &session, nil
}

// UpdateSession 更新会话
func (r *PostgresSessionRepository) UpdateSession(ctx context.Context, id uuid.UUID, req *UpdateSessionRequest) (*Session, error) {
	if req.Metadata == nil {
		return nil, apperrors.ErrInvalidParameter("metadata is required")
	}

	query := `
		UPDATE sessions
		SET metadata = $1, updated_at = NOW()
		WHERE id = $2
		RETURNING id, user_id, metadata, created_at, updated_at
	`

	var session Session
	err := r.pool.QueryRow(ctx, query, req.Metadata, id).Scan(
		&session.ID,
		&session.UserID,
		&session.Metadata,
		&session.CreatedAt,
		&session.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, apperrors.ErrNotFound
		}
		log.Error().Err(err).Str("session_id", id.String()).Msg("failed to update session")
		return nil, apperrors.ErrDatabase("failed to update session", err)
	}

	log.Debug().
		Str("session_id", session.ID.String()).
		Msg("session updated")

	return &session, nil
}

// DeleteSession 删除会话
func (r *PostgresSessionRepository) DeleteSession(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM sessions WHERE id = $1`

	result, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		log.Error().Err(err).Str("session_id", id.String()).Msg("failed to delete session")
		return apperrors.ErrDatabase("failed to delete session", err)
	}

	if result.RowsAffected() == 0 {
		return apperrors.ErrNotFound
	}

	log.Debug().
		Str("session_id", id.String()).
		Msg("session deleted")

	return nil
}

// ListSessions 列出用户会话
func (r *PostgresSessionRepository) ListSessions(ctx context.Context, userID string, limit, offset int) ([]*Session, int, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	// 获取总数
	countQuery := `SELECT COUNT(*) FROM sessions WHERE user_id = $1`
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, userID).Scan(&total); err != nil {
		return nil, 0, apperrors.ErrDatabase("failed to count sessions", err)
	}

	// 获取会话列表
	query := `
		SELECT id, user_id, metadata, created_at, updated_at
		FROM sessions
		WHERE user_id = $1
		ORDER BY updated_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, 0, apperrors.ErrDatabase("failed to list sessions", err)
	}
	defer rows.Close()

	sessions := make([]*Session, 0)
	for rows.Next() {
		var session Session
		if err := rows.Scan(
			&session.ID,
			&session.UserID,
			&session.Metadata,
			&session.CreatedAt,
			&session.UpdatedAt,
		); err != nil {
			return nil, 0, apperrors.ErrDatabase("failed to scan session", err)
		}
		sessions = append(sessions, &session)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, apperrors.ErrDatabase("failed to iterate sessions", err)
	}

	return sessions, total, nil
}

// SessionRepositoryInterface 单元测试用接口
type SessionRepositoryInterface interface {
	CreateSession(ctx context.Context, req *CreateSessionRequest) (*Session, error)
	GetSession(ctx context.Context, id uuid.UUID) (*Session, error)
	UpdateSession(ctx context.Context, id uuid.UUID, req *UpdateSessionRequest) (*Session, error)
	DeleteSession(ctx context.Context, id uuid.UUID) error
	ListSessions(ctx context.Context, userID string, limit, offset int) ([]*Session, int, error)
}

// Verify SessionRepository implements SessionRepositoryInterface
var _ SessionRepositoryInterface = (*PostgresSessionRepository)(nil)
