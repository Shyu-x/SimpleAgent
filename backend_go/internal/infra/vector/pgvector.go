// Package vector PostgreSQL向量存储 (pgvector)
package vector

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

// PGVectorConfig PostgreSQL向量配置
type PGVectorConfig struct {
	Host           string
	Port           int
	User           string
	Password       string
	Database       string
	SSLMode        string
	Dimension      int
	TableName      string
	IndexType      string // hnsw, ivfflat
	DistanceType   string // cosine, ip, l2
	MaxConnections int
	PoolSize       int
}

// DefaultPGVectorConfig 默认配置
func DefaultPGVectorConfig() *PGVectorConfig {
	return &PGVectorConfig{
		Host:         "localhost",
		Port:         5432,
		User:         "postgres",
		Password:     "postgres",
		Database:     "vectors",
		SSLMode:      "disable",
		Dimension:    1536,
		TableName:    "documents",
		IndexType:    "hnsw",
		DistanceType: "cosine",
		PoolSize:     10,
	}
}

// PGVectorStore PostgreSQL向量存储
type PGVectorStore struct {
	config *PGVectorConfig
	db     *sql.DB
}

// NewPGVectorStore 创建PostgreSQL向量存储
func NewPGVectorStore(cfg *PGVectorConfig) (*PGVectorStore, error) {
	if cfg == nil {
		cfg = DefaultPGVectorConfig()
	}

	connStr := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Database, cfg.SSLMode,
	)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}

	db.SetMaxOpenConns(cfg.MaxConnections)
	db.SetMaxIdleConns(cfg.PoolSize)
	db.SetConnMaxLifetime(time.Hour)

	store := &PGVectorStore{
		config: cfg,
		db:     db,
	}

	return store, nil
}

// Init 初始化表结构
func (s *PGVectorStore) Init(ctx context.Context) error {
	// 创建表
	createTableSQL := fmt.Sprintf(`
		CREATE TABLE IF NOT EXISTS %s (
			id VARCHAR(255) PRIMARY KEY,
			content TEXT NOT NULL,
			embedding vector(%d),
			metadata JSONB DEFAULT '{}',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`, s.config.TableName, s.config.Dimension)

	if _, err := s.db.ExecContext(ctx, createTableSQL); err != nil {
		return fmt.Errorf("创建表失败: %w", err)
	}

	// 创建向量索引
	if err := s.createIndex(ctx); err != nil {
		return fmt.Errorf("创建索引失败: %w", err)
	}

	// 创建JSONB索引
	metaIndexSQL := fmt.Sprintf(`
		CREATE INDEX IF NOT EXISTS %s_metadata_idx ON %s USING GIN (metadata);
	`, s.config.TableName, s.config.TableName)
	s.db.ExecContext(ctx, metaIndexSQL)

	return nil
}

// createIndex 创建向量索引
func (s *PGVectorStore) createIndex(ctx context.Context) error {
	var indexSQL string

	switch s.config.IndexType {
	case "hnsw":
		indexSQL = fmt.Sprintf(`
			CREATE INDEX IF NOT EXISTS %s_embedding_idx ON %s
			USING hnsw (embedding %s)
			WITH (m = 16, ef_construction = 64);
		`, s.config.TableName, s.config.TableName, s.config.DistanceType)
	case "ivfflat":
		indexSQL = fmt.Sprintf(`
			CREATE INDEX IF NOT EXISTS %s_embedding_idx ON %s
			USING ivfflat (embedding %s)
			WITH (lists = 100);
		`, s.config.TableName, s.config.TableName, s.config.DistanceType)
	default:
		return nil
	}

	_, err := s.db.ExecContext(ctx, indexSQL)
	return err
}

// Upsert 插入或更新
func (s *PGVectorStore) Upsert(ctx context.Context, id string, vector []float32, payload map[string]interface{}) error {
	if len(vector) != s.config.Dimension {
		return fmt.Errorf("向量维度不匹配: 需要%d, 实际%d", s.config.Dimension, len(vector))
	}

	metadataJSON, _ := json.Marshal(payload)
	vectorStr := arrayToPostgresVector(vector)

	query := fmt.Sprintf(`
		INSERT INTO %s (id, content, embedding, metadata, updated_at)
		VALUES ($1, $2, $3::vector, $4::jsonb, CURRENT_TIMESTAMP)
		ON CONFLICT (id) DO UPDATE SET
			content = EXCLUDED.content,
			embedding = EXCLUDED.embedding,
			metadata = EXCLUDED.metadata,
			updated_at = CURRENT_TIMESTAMP
	`, s.config.TableName)

	_, err := s.db.ExecContext(ctx, query, id, "", vectorStr, metadataJSON)
	return err
}

// BatchUpsert 批量插入
func (s *PGVectorStore) BatchUpsert(ctx context.Context, ids []string, vectors [][]float32, payloads []map[string]interface{}) error {
	if len(ids) != len(vectors) || len(ids) != len(payloads) {
		return fmt.Errorf("参数长度不匹配")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, fmt.Sprintf(`
		INSERT INTO %s (id, content, embedding, metadata, updated_at)
		VALUES ($1, $2, $3::vector, $4::jsonb, CURRENT_TIMESTAMP)
		ON CONFLICT (id) DO UPDATE SET
			content = EXCLUDED.content,
			embedding = EXCLUDED.embedding,
			metadata = EXCLUDED.metadata,
			updated_at = CURRENT_TIMESTAMP
	`, s.config.TableName))
	if err != nil {
		return err
	}
	defer stmt.Close()

	for i := range ids {
		if len(vectors[i]) != s.config.Dimension {
			continue
		}
		metadataJSON, _ := json.Marshal(payloads[i])
		vectorStr := arrayToPostgresVector(vectors[i])
		_, err = stmt.ExecContext(ctx, ids[i], "", vectorStr, metadataJSON)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// Search 搜索
func (s *PGVectorStore) Search(ctx context.Context, query []float32, topK int, filter map[string]interface{}) ([]*SearchResult, error) {
	if len(query) != s.config.Dimension {
		return nil, fmt.Errorf("查询向量维度不匹配")
	}

	var queryStr string
	var args []interface{}
	args = append(args, arrayToPostgresVector(query))
	argIndex := 2

	switch s.config.DistanceType {
	case "cosine":
		queryStr = fmt.Sprintf(`
			SELECT id, metadata, 1 - (embedding <=> $1::vector) as score
			FROM %s
		`, s.config.TableName)
	case "ip":
		queryStr = fmt.Sprintf(`
			SELECT id, metadata, embedding <#> $1::vector as score
			FROM %s
		`, s.config.TableName)
	case "l2":
		queryStr = fmt.Sprintf(`
			SELECT id, metadata, embedding <-> $1::vector as score
			FROM %s
		`, s.config.TableName)
	default:
		queryStr = fmt.Sprintf(`
			SELECT id, metadata, 1 - (embedding <=> $1::vector) as score
			FROM %s
		`, s.config.TableName)
	}

	if filter != nil && len(filter) > 0 {
		whereClause, filterArgs := buildPGFilter(filter, argIndex)
		if whereClause != "" {
			queryStr += " WHERE " + whereClause
			args = append(args, filterArgs...)
			argIndex += len(filterArgs)
		}
	}

	queryStr += fmt.Sprintf(" ORDER BY score DESC LIMIT $%d", argIndex)
	args = append(args, topK)

	rows, err := s.db.QueryContext(ctx, queryStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*SearchResult
	for rows.Next() {
		var id string
		var metadataBytes []byte
		var score float64

		if err := rows.Scan(&id, &metadataBytes, &score); err != nil {
			return nil, err
		}

		var metadata map[string]interface{}
		json.Unmarshal(metadataBytes, &metadata)

		results = append(results, &SearchResult{
			ID:       id,
			Score:    score,
			Payload:  metadata,
			Metadata: metadata,
		})
	}

	return results, rows.Err()
}

// SearchBatch 批量搜索
func (s *PGVectorStore) SearchBatch(ctx context.Context, queries [][]float32, topK int) ([][]*SearchResult, error) {
	results := make([][]*SearchResult, 0, len(queries))
	for _, query := range queries {
		searchResults, err := s.Search(ctx, query, topK, nil)
		if err != nil {
			return nil, err
		}
		results = append(results, searchResults)
	}
	return results, nil
}

// Delete 删除
func (s *PGVectorStore) Delete(ctx context.Context, id string) error {
	query := fmt.Sprintf(`DELETE FROM %s WHERE id = $1`, s.config.TableName)
	_, err := s.db.ExecContext(ctx, query, id)
	return err
}

// DeleteByFilter 条件删除
func (s *PGVectorStore) DeleteByFilter(ctx context.Context, filter map[string]interface{}) error {
	if filter == nil || len(filter) == 0 {
		return fmt.Errorf("filter不能为空")
	}

	whereClause, args := buildPGFilter(filter, 1)
	query := fmt.Sprintf("DELETE FROM %s WHERE %s", s.config.TableName, whereClause)

	_, err := s.db.ExecContext(ctx, query, args...)
	return err
}

// GetByID 获取单个
func (s *PGVectorStore) GetByID(ctx context.Context, id string) (*SearchResult, error) {
	query := fmt.Sprintf(`SELECT id, metadata FROM %s WHERE id = $1`, s.config.TableName)

	var metadataBytes []byte
	err := s.db.QueryRowContext(ctx, query, id).Scan(&id, &metadataBytes)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	var metadata map[string]interface{}
	json.Unmarshal(metadataBytes, &metadata)

	return &SearchResult{
		ID:      id,
		Score:   1.0,
		Payload: metadata,
	}, nil
}

// Health 健康检查
func (s *PGVectorStore) Health(ctx context.Context) error {
	return s.db.PingContext(ctx)
}

// Close 关闭
func (s *PGVectorStore) Close() error {
	return s.db.Close()
}

// arrayToPostgresVector 转换向量为PostgreSQL格式
func arrayToPostgresVector(arr []float32) string {
	strs := make([]string, len(arr))
	for i, v := range arr {
		strs[i] = fmt.Sprintf("%.6f", v)
	}
	return "[" + strings.Join(strs, ",") + "]"
}

// buildPGFilter 构建PostgreSQL过滤条件
func buildPGFilter(filter map[string]interface{}, startIndex int) (string, []interface{}) {
	if len(filter) == 0 {
		return "", nil
	}

	var conditions []string
	var args []interface{}
	argIndex := startIndex

	for key, value := range filter {
		switch v := value.(type) {
		case string:
			conditions = append(conditions, fmt.Sprintf("metadata->>$%d = $%d", argIndex, argIndex+1))
			args = append(args, key, v)
			argIndex += 2
		case int, int64, int32:
			conditions = append(conditions, fmt.Sprintf("(metadata->>$%d)::bigint = $%d", argIndex, argIndex+1))
			args = append(args, key, v)
			argIndex += 2
		case float64, float32:
			conditions = append(conditions, fmt.Sprintf("(metadata->>$%d)::float = $%d", argIndex, argIndex+1))
			args = append(args, key, v)
			argIndex += 2
		case bool:
			conditions = append(conditions, fmt.Sprintf("(metadata->>$%d)::boolean = $%d", argIndex, argIndex+1))
			args = append(args, key, v)
			argIndex += 2
		}
	}

	return strings.Join(conditions, " AND "), args
}
