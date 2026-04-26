package database

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	apperrors "github.com/ai-chat/backend_go/internal/common/errors"
)

// MemoryType 记忆类型
type MemoryType string

const (
	MemoryTypeShortTerm  MemoryType = "short_term"
	MemoryTypeLongTerm  MemoryType = "long_term"
	MemoryTypeSemantic  MemoryType = "semantic"
	MemoryTypeWorking   MemoryType = "working"
	MemoryTypeSession   MemoryType = "session"
)

// Memory 记忆模型
type Memory struct {
	ID         uuid.UUID       `json:"id"`
	SessionID  uuid.UUID       `json:"session_id"`
	MemoryType MemoryType      `json:"memory_type"`
	Content    string          `json:"content"`
	Metadata   json.RawMessage `json:"metadata"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

// CreateMemoryRequest 创建记忆请求
type CreateMemoryRequest struct {
	SessionID  uuid.UUID       `json:"session_id" binding:"required"`
	MemoryType MemoryType      `json:"memory_type" binding:"required"`
	Content    string          `json:"content" binding:"required"`
	Metadata   json.RawMessage `json:"metadata"`
}

// UpdateMemoryRequest 更新记忆请求
type UpdateMemoryRequest struct {
	Content  string          `json:"content"`
	Metadata json.RawMessage `json:"metadata"`
}

// SearchMemoryRequest 搜索记忆请求
type SearchMemoryRequest struct {
	SessionID  uuid.UUID  `json:"session_id"`
	MemoryType MemoryType `json:"memory_type"`
	Query      string     `json:"query"`
	Limit      int        `json:"limit"`
	Offset     int        `json:"offset"`
}

// MemoryRepository 记忆仓储接口
type MemoryRepository interface {
	CreateMemory(ctx context.Context, req *CreateMemoryRequest) (*Memory, error)
	GetMemory(ctx context.Context, id uuid.UUID) (*Memory, error)
	UpdateMemory(ctx context.Context, id uuid.UUID, req *UpdateMemoryRequest) (*Memory, error)
	DeleteMemory(ctx context.Context, id uuid.UUID) error
	DeleteMemoriesBySessionID(ctx context.Context, sessionID uuid.UUID) error
	ListMemories(ctx context.Context, req *SearchMemoryRequest) ([]*Memory, int, error)
	GetMemoriesBySessionID(ctx context.Context, sessionID uuid.UUID, memoryType MemoryType, limit, offset int) ([]*Memory, int, error)
}

// PostgresMemoryRepository PostgreSQL记忆仓储实现
type PostgresMemoryRepository struct {
	pool *Pool
}

// NewMemoryRepository 创建记忆仓储
func NewMemoryRepository(pool *Pool) MemoryRepository {
	return &PostgresMemoryRepository{pool: pool}
}

// CreateMemory 创建记忆
func (r *PostgresMemoryRepository) CreateMemory(ctx context.Context, req *CreateMemoryRequest) (*Memory, error) {
	if req.SessionID == uuid.Nil {
		return nil, apperrors.ErrInvalidParameter("session_id is required")
	}
	if req.MemoryType == "" {
		return nil, apperrors.ErrInvalidParameter("memory_type is required")
	}
	if req.Content == "" {
		return nil, apperrors.ErrInvalidParameter("content is required")
	}

	// 验证记忆类型
	validTypes := map[MemoryType]bool{
		MemoryTypeShortTerm: true,
		MemoryTypeLongTerm:  true,
		MemoryTypeSemantic:  true,
		MemoryTypeWorking:   true,
		MemoryTypeSession:   true,
	}
	if !validTypes[req.MemoryType] {
		return nil, apperrors.ErrInvalidParameter("invalid memory_type: " + string(req.MemoryType))
	}

	metadata := req.Metadata
	if metadata == nil {
		metadata = json.RawMessage("{}")
	}

	query := `
		INSERT INTO memories (session_id, memory_type, content, metadata)
		VALUES ($1, $2, $3, $4)
		RETURNING id, session_id, memory_type, content, metadata, created_at, updated_at
	`

	var memory Memory
	err := r.pool.QueryRow(ctx, query, req.SessionID, req.MemoryType, req.Content, metadata).Scan(
		&memory.ID,
		&memory.SessionID,
		&memory.MemoryType,
		&memory.Content,
		&memory.Metadata,
		&memory.CreatedAt,
		&memory.UpdatedAt,
	)
	if err != nil {
		log.Error().Err(err).Msg("failed to create memory")
		return nil, apperrors.ErrDatabase("failed to create memory", err)
	}

	log.Debug().
		Str("memory_id", memory.ID.String()).
		Str("session_id", memory.SessionID.String()).
		Str("memory_type", string(memory.MemoryType)).
		Msg("memory created")

	return &memory, nil
}

// GetMemory 获取记忆
func (r *PostgresMemoryRepository) GetMemory(ctx context.Context, id uuid.UUID) (*Memory, error) {
	query := `
		SELECT id, session_id, memory_type, content, metadata, created_at, updated_at
		FROM memories
		WHERE id = $1
	`

	var memory Memory
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&memory.ID,
		&memory.SessionID,
		&memory.MemoryType,
		&memory.Content,
		&memory.Metadata,
		&memory.CreatedAt,
		&memory.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, apperrors.ErrNotFound
		}
		log.Error().Err(err).Str("memory_id", id.String()).Msg("failed to get memory")
		return nil, apperrors.ErrDatabase("failed to get memory", err)
	}

	return &memory, nil
}

// UpdateMemory 更新记忆
func (r *PostgresMemoryRepository) UpdateMemory(ctx context.Context, id uuid.UUID, req *UpdateMemoryRequest) (*Memory, error) {
	if req.Content == "" && req.Metadata == nil {
		return nil, apperrors.ErrInvalidParameter("content or metadata is required")
	}

	// 构建动态更新查询
	setClauses := []string{}
	args := []interface{}{}
	argIndex := 1

	if req.Content != "" {
		setClauses = append(setClauses, fmt.Sprintf("content = $%d", argIndex))
		args = append(args, req.Content)
		argIndex++
	}

	if req.Metadata != nil {
		setClauses = append(setClauses, fmt.Sprintf("metadata = $%d", argIndex))
		args = append(args, req.Metadata)
		argIndex++
	}

	if len(setClauses) == 0 {
		return nil, apperrors.ErrInvalidParameter("content or metadata is required")
	}

	setClauses = append(setClauses, fmt.Sprintf("updated_at = NOW()"))

	query := fmt.Sprintf(`
		UPDATE memories
		SET %s
		WHERE id = $%d
		RETURNING id, session_id, memory_type, content, metadata, created_at, updated_at
	`, joinStrings(setClauses, ", "), argIndex)

	args = append(args, id)

	var memory Memory
	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&memory.ID,
		&memory.SessionID,
		&memory.MemoryType,
		&memory.Content,
		&memory.Metadata,
		&memory.CreatedAt,
		&memory.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, apperrors.ErrNotFound
		}
		log.Error().Err(err).Str("memory_id", id.String()).Msg("failed to update memory")
		return nil, apperrors.ErrDatabase("failed to update memory", err)
	}

	log.Debug().
		Str("memory_id", memory.ID.String()).
		Msg("memory updated")

	return &memory, nil
}

// DeleteMemory 删除记忆
func (r *PostgresMemoryRepository) DeleteMemory(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM memories WHERE id = $1`

	result, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		log.Error().Err(err).Str("memory_id", id.String()).Msg("failed to delete memory")
		return apperrors.ErrDatabase("failed to delete memory", err)
	}

	if result.RowsAffected() == 0 {
		return apperrors.ErrNotFound
	}

	log.Debug().
		Str("memory_id", id.String()).
		Msg("memory deleted")

	return nil
}

// DeleteMemoriesBySessionID 删除会话的所有记忆
func (r *PostgresMemoryRepository) DeleteMemoriesBySessionID(ctx context.Context, sessionID uuid.UUID) error {
	if sessionID == uuid.Nil {
		return apperrors.ErrInvalidParameter("session_id is required")
	}

	query := `DELETE FROM memories WHERE session_id = $1`
	_, err := r.pool.Exec(ctx, query, sessionID)
	if err != nil {
		log.Error().Err(err).Str("session_id", sessionID.String()).Msg("failed to delete memories")
		return apperrors.ErrDatabase("failed to delete memories", err)
	}

	log.Debug().
		Str("session_id", sessionID.String()).
		Msg("memories deleted")

	return nil
}

// ListMemories 列出记忆（支持过滤）
func (r *PostgresMemoryRepository) ListMemories(ctx context.Context, req *SearchMemoryRequest) ([]*Memory, int, error) {
	if req.Limit <= 0 {
		req.Limit = 20
	}
	if req.Limit > 100 {
		req.Limit = 100
	}

	// 构建 WHERE 条件
	whereClauses := []string{}
	args := []interface{}{}
	argIndex := 1

	if req.SessionID != uuid.Nil {
		whereClauses = append(whereClauses, fmt.Sprintf("session_id = $%d", argIndex))
		args = append(args, req.SessionID)
		argIndex++
	}

	if req.MemoryType != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("memory_type = $%d", argIndex))
		args = append(args, req.MemoryType)
		argIndex++
	}

	if req.Query != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("content LIKE $%d", argIndex))
		args = append(args, "%"+req.Query+"%")
		argIndex++
	}

	whereClause := ""
	if len(whereClauses) > 0 {
		whereClause = "WHERE " + joinStrings(whereClauses, " AND ")
	}

	// 获取总数
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM memories %s", whereClause)
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, apperrors.ErrDatabase("failed to count memories", err)
	}

	// 获取记忆列表
	query := fmt.Sprintf(`
		SELECT id, session_id, memory_type, content, metadata, created_at, updated_at
		FROM memories
		%s
		ORDER BY updated_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, argIndex, argIndex+1)

	args = append(args, req.Limit, req.Offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, apperrors.ErrDatabase("failed to list memories", err)
	}
	defer rows.Close()

	memories := make([]*Memory, 0)
	for rows.Next() {
		var memory Memory
		if err := rows.Scan(
			&memory.ID,
			&memory.SessionID,
			&memory.MemoryType,
			&memory.Content,
			&memory.Metadata,
			&memory.CreatedAt,
			&memory.UpdatedAt,
		); err != nil {
			return nil, 0, apperrors.ErrDatabase("failed to scan memory", err)
		}
		memories = append(memories, &memory)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, apperrors.ErrDatabase("failed to iterate memories", err)
	}

	return memories, total, nil
}

// GetMemoriesBySessionID 获取会话的记忆列表
func (r *PostgresMemoryRepository) GetMemoriesBySessionID(ctx context.Context, sessionID uuid.UUID, memoryType MemoryType, limit, offset int) ([]*Memory, int, error) {
	if sessionID == uuid.Nil {
		return nil, 0, apperrors.ErrInvalidParameter("session_id is required")
	}

	if limit <= 0 {
		limit = 50
	}
	if limit > 1000 {
		limit = 1000
	}

	// 构建查询条件
	whereClause := "session_id = $1"
	args := []interface{}{sessionID}
	argIndex := 2

	if memoryType != "" {
		whereClause += fmt.Sprintf(" AND memory_type = $%d", argIndex)
		args = append(args, memoryType)
		argIndex++
	}

	// 获取总数
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM memories WHERE %s", whereClause)
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, apperrors.ErrDatabase("failed to count memories", err)
	}

	// 获取记忆列表
	query := fmt.Sprintf(`
		SELECT id, session_id, memory_type, content, metadata, created_at, updated_at
		FROM memories
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, argIndex, argIndex+1)

	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, apperrors.ErrDatabase("failed to get memories", err)
	}
	defer rows.Close()

	memories := make([]*Memory, 0)
	for rows.Next() {
		var memory Memory
		if err := rows.Scan(
			&memory.ID,
			&memory.SessionID,
			&memory.MemoryType,
			&memory.Content,
			&memory.Metadata,
			&memory.CreatedAt,
			&memory.UpdatedAt,
		); err != nil {
			return nil, 0, apperrors.ErrDatabase("failed to scan memory", err)
		}
		memories = append(memories, &memory)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, apperrors.ErrDatabase("failed to iterate memories", err)
	}

	return memories, total, nil
}

// MemoryRepositoryInterface 单元测试用接口
type MemoryRepositoryInterface interface {
	CreateMemory(ctx context.Context, req *CreateMemoryRequest) (*Memory, error)
	GetMemory(ctx context.Context, id uuid.UUID) (*Memory, error)
	UpdateMemory(ctx context.Context, id uuid.UUID, req *UpdateMemoryRequest) (*Memory, error)
	DeleteMemory(ctx context.Context, id uuid.UUID) error
	DeleteMemoriesBySessionID(ctx context.Context, sessionID uuid.UUID) error
	ListMemories(ctx context.Context, req *SearchMemoryRequest) ([]*Memory, int, error)
	GetMemoriesBySessionID(ctx context.Context, sessionID uuid.UUID, memoryType MemoryType, limit, offset int) ([]*Memory, int, error)
}

// Verify MemoryRepository implements MemoryRepositoryInterface
var _ MemoryRepositoryInterface = (*PostgresMemoryRepository)(nil)

// joinStrings 辅助函数：连接字符串数组
func joinStrings(strs []string, sep string) string {
	if len(strs) == 0 {
		return ""
	}
	result := strs[0]
	for i := 1; i < len(strs); i++ {
		result += sep + strs[i]
	}
	return result
}
