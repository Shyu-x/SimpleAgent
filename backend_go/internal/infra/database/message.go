package database

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	apperrors "github.com/ai-chat/backend_go/internal/common/errors"
)

// Message 消息模型
type Message struct {
	ID        uuid.UUID `json:"id"`
	SessionID uuid.UUID `json:"session_id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// SaveMessageRequest 保存消息请求
type SaveMessageRequest struct {
	SessionID uuid.UUID `json:"session_id" binding:"required"`
	Role      string    `json:"role" binding:"required"`
	Content   string    `json:"content" binding:"required"`
}

// MessageRepository 消息仓储接口
type MessageRepository interface {
	SaveMessage(ctx context.Context, req *SaveMessageRequest) (*Message, error)
	GetMessagesBySessionID(ctx context.Context, sessionID uuid.UUID, limit, offset int) ([]*Message, int, error)
	GetMessageByID(ctx context.Context, id uuid.UUID) (*Message, error)
	DeleteMessagesBySessionID(ctx context.Context, sessionID uuid.UUID) error
}

// PostgresMessageRepository PostgreSQL消息仓储实现
type PostgresMessageRepository struct {
	pool *Pool
}

// NewMessageRepository 创建消息仓储
func NewMessageRepository(pool *Pool) MessageRepository {
	return &PostgresMessageRepository{pool: pool}
}

// SaveMessage 保存消息
func (r *PostgresMessageRepository) SaveMessage(ctx context.Context, req *SaveMessageRequest) (*Message, error) {
	if req.SessionID == uuid.Nil {
		return nil, apperrors.ErrInvalidParameter("session_id is required")
	}
	if req.Role == "" {
		return nil, apperrors.ErrInvalidParameter("role is required")
	}
	if req.Content == "" {
		return nil, apperrors.ErrInvalidParameter("content is required")
	}

	// 验证角色
	validRoles := map[string]bool{
		"user":      true,
		"assistant": true,
		"system":    true,
	}
	if !validRoles[req.Role] {
		return nil, apperrors.ErrInvalidParameter("invalid role: " + req.Role)
	}

	query := `
		INSERT INTO messages (session_id, role, content)
		VALUES ($1, $2, $3)
		RETURNING id, session_id, role, content, created_at
	`

	var msg Message
	err := r.pool.QueryRow(ctx, query, req.SessionID, req.Role, req.Content).Scan(
		&msg.ID,
		&msg.SessionID,
		&msg.Role,
		&msg.Content,
		&msg.CreatedAt,
	)
	if err != nil {
		log.Error().Err(err).Msg("failed to save message")
		return nil, apperrors.ErrDatabase("failed to save message", err)
	}

	// 更新会话的updated_at
	updateSessionQuery := `UPDATE sessions SET updated_at = NOW() WHERE id = $1`
	if _, err := r.pool.Exec(ctx, updateSessionQuery, req.SessionID); err != nil {
		log.Warn().Err(err).Str("session_id", req.SessionID.String()).Msg("failed to update session timestamp")
	}

	log.Debug().
		Str("message_id", msg.ID.String()).
		Str("session_id", msg.SessionID.String()).
		Str("role", msg.Role).
		Msg("message saved")

	return &msg, nil
}

// GetMessagesBySessionID 获取会话消息列表
func (r *PostgresMessageRepository) GetMessagesBySessionID(ctx context.Context, sessionID uuid.UUID, limit, offset int) ([]*Message, int, error) {
	if sessionID == uuid.Nil {
		return nil, 0, apperrors.ErrInvalidParameter("session_id is required")
	}

	if limit <= 0 {
		limit = 50
	}
	if limit > 1000 {
		limit = 1000
	}

	// 获取总数
	countQuery := `SELECT COUNT(*) FROM messages WHERE session_id = $1`
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, sessionID).Scan(&total); err != nil {
		return nil, 0, apperrors.ErrDatabase("failed to count messages", err)
	}

	// 获取消息列表
	query := `
		SELECT id, session_id, role, content, created_at
		FROM messages
		WHERE session_id = $1
		ORDER BY created_at ASC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, sessionID, limit, offset)
	if err != nil {
		return nil, 0, apperrors.ErrDatabase("failed to get messages", err)
	}
	defer rows.Close()

	messages := make([]*Message, 0)
	for rows.Next() {
		var msg Message
		if err := rows.Scan(
			&msg.ID,
			&msg.SessionID,
			&msg.Role,
			&msg.Content,
			&msg.CreatedAt,
		); err != nil {
			return nil, 0, apperrors.ErrDatabase("failed to scan message", err)
		}
		messages = append(messages, &msg)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, apperrors.ErrDatabase("failed to iterate messages", err)
	}

	return messages, total, nil
}

// GetMessageByID 获取单条消息
func (r *PostgresMessageRepository) GetMessageByID(ctx context.Context, id uuid.UUID) (*Message, error) {
	query := `
		SELECT id, session_id, role, content, created_at
		FROM messages
		WHERE id = $1
	`

	var msg Message
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&msg.ID,
		&msg.SessionID,
		&msg.Role,
		&msg.Content,
		&msg.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, apperrors.ErrNotFound
		}
		log.Error().Err(err).Str("message_id", id.String()).Msg("failed to get message")
		return nil, apperrors.ErrDatabase("failed to get message", err)
	}

	return &msg, nil
}

// DeleteMessagesBySessionID 删除会话的所有消息
func (r *PostgresMessageRepository) DeleteMessagesBySessionID(ctx context.Context, sessionID uuid.UUID) error {
	if sessionID == uuid.Nil {
		return apperrors.ErrInvalidParameter("session_id is required")
	}

	query := `DELETE FROM messages WHERE session_id = $1`
	_, err := r.pool.Exec(ctx, query, sessionID)
	if err != nil {
		log.Error().Err(err).Str("session_id", sessionID.String()).Msg("failed to delete messages")
		return apperrors.ErrDatabase("failed to delete messages", err)
	}

	log.Debug().
		Str("session_id", sessionID.String()).
		Msg("messages deleted")

	return nil
}

// MessageRepositoryInterface 单元测试用接口
type MessageRepositoryInterface interface {
	SaveMessage(ctx context.Context, req *SaveMessageRequest) (*Message, error)
	GetMessagesBySessionID(ctx context.Context, sessionID uuid.UUID, limit, offset int) ([]*Message, int, error)
	GetMessageByID(ctx context.Context, id uuid.UUID) (*Message, error)
	DeleteMessagesBySessionID(ctx context.Context, sessionID uuid.UUID) error
}

// Verify MessageRepository implements MessageRepositoryInterface
var _ MessageRepositoryInterface = (*PostgresMessageRepository)(nil)
