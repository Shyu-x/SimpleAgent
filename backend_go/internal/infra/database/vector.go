/**
 * PostgreSQL Vector Store - 使用 pgvector 实现向量存储
 *
 * 企业级设计：
 * - 支持向量相似度搜索（余弦相似度/内积/欧氏距离）
 * - 支持 JSONB 元数据存储和过滤
 * - 支持批量插入和搜索
 * - 支持分区表以提高查询性能
 * - 自动创建索引（HNSW/IVFFlat）
 */

package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"
	_ "github.com/lib/pq"
)

// VectorStoreConfig 向量存储配置
type VectorStoreConfig struct {
	Host           string
	Port           int
	User           string
	Password       string
	Database       string
	SSLMode        string
	Dimension      int
	TableName      string
	IndexType      string // hnsw, ivfflat
	MeasureType    string // cosine, ip, l2
	MaxConnections int
	PoolSize       int
}

// DefaultVectorStoreConfig 默认配置
func DefaultVectorStoreConfig() *VectorStoreConfig {
	return &VectorStoreConfig{
		Host:           "localhost",
		Port:           5432,
		User:           "postgres",
		Password:       "postgres",
		Database:       "vectors",
		SSLMode:        "disable",
		Dimension:      1536,
		TableName:      "documents",
		IndexType:      "hnsw",
		MeasureType:    "cosine",
		MaxConnections: 20,
		PoolSize:       10,
	}
}

// Document 文档结构
type Document struct {
	ID       string                 `json:"id"`
	Content  string                 `json:"content"`
	Metadata map[string]interface{} `json:"metadata"`
}

// SearchResult 搜索结果
type SearchResult struct {
	ID           string                 `json:"id"`
	Content      string                 `json:"content"`
	Score        float64                `json:"score"`
	Metadata     map[string]interface{} `json:"metadata"`
	RerankScore  float64                `json:"rerank_score"`
	Distance     float64                `json:"distance"`
}

// VectorStore 向量存储接口
type VectorStore interface {
	// Upsert 插入或更新文档
	Upsert(ctx context.Context, doc *Document, embedding []float32) error
	// BatchUpsert 批量插入或更新
	BatchUpsert(ctx context.Context, docs []*Document, embeddings [][]float32) error
	// Search 搜索相似文档
	Search(ctx context.Context, query []float32, topK int, filter map[string]interface{}) ([]*SearchResult, error)
	// Delete 删除文档
	Delete(ctx context.Context, id string) error
	// DeleteByFilter 根据条件删除
	DeleteByFilter(ctx context.Context, filter map[string]interface{}) error
	// GetByID 根据ID获取
	GetByID(ctx context.Context, id string) (*Document, error)
	// Close 关闭连接
	Close() error
}

// PostgresVectorStore PostgreSQL向量存储实现
type PostgresVectorStore struct {
	config  *VectorStoreConfig
	db      *sql.DB
	connStr string
}

// NewPostgresVectorStore 创建PostgreSQL向量存储
func NewPostgresVectorStore(config *VectorStoreConfig) (*PostgresVectorStore, error) {
	if config == nil {
		config = DefaultVectorStoreConfig()
	}

	connStr := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		config.Host, config.Port, config.User, config.Password, config.Database, config.SSLMode,
	)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(config.MaxConnections)
	db.SetMaxIdleConns(config.PoolSize)
	db.SetConnMaxLifetime(time.Hour)

	store := &PostgresVectorStore{
		config:  config,
		db:      db,
		connStr: connStr,
	}

	// 初始化表结构
	if err := store.initSchema(); err != nil {
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return store, nil
}

// initSchema 初始化表结构
func (v *PostgresVectorStore) initSchema() error {
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
	`, v.config.TableName, v.config.Dimension)

	if _, err := v.db.Exec(createTableSQL); err != nil {
		return fmt.Errorf("failed to create table: %w", err)
	}

	// 创建索引
	if err := v.createIndex(); err != nil {
		return fmt.Errorf("failed to create index: %w", err)
	}

	// 创建元数据 GIN 索引
	createMetaIndexSQL := fmt.Sprintf(`
		CREATE INDEX IF NOT EXISTS %s_metadata_idx ON %s USING GIN (metadata);
	`, v.config.TableName, v.config.TableName)

	if _, err := v.db.Exec(createMetaIndexSQL); err != nil {
		// GIN索引可能创建失败，不影响主功能
		fmt.Printf("warning: failed to create metadata index: %v\n", err)
	}

	return nil
}

// createIndex 创建向量索引
func (v *PostgresVectorStore) createIndex() error {
	var indexSQL string

	switch v.config.IndexType {
	case "hnsw":
		// HNSW 索引 - 高召回率，适合实时查询
		indexSQL = fmt.Sprintf(`
			CREATE INDEX IF NOT EXISTS %s_embedding_idx ON %s
			USING hnsw (embedding %s)
			WITH (m = 16, ef_construction = 64);
		`, v.config.TableName, v.config.TableName, v.config.MeasureType)
	case "ivfflat":
		// IVFFlat 索引 - 高性能，适合大批量数据
		// 需要先创建向量列的分区或设置服务器参数
		indexSQL = fmt.Sprintf(`
			CREATE INDEX IF NOT EXISTS %s_embedding_idx ON %s
			USING ivfflat (embedding %s)
			WITH (lists = 100);
		`, v.config.TableName, v.config.TableName, v.config.MeasureType)
	default:
		return nil
	}

	_, err := v.db.Exec(indexSQL)
	return err
}

// Upsert 插入或更新文档
func (v *PostgresVectorStore) Upsert(ctx context.Context, doc *Document, embedding []float32) error {
	if len(embedding) != v.config.Dimension {
		return fmt.Errorf("embedding dimension mismatch: expected %d, got %d", v.config.Dimension, len(embedding))
	}

	metadataJSON, err := json.Marshal(doc.Metadata)
	if err != nil {
		metadataJSON = []byte("{}")
	}

	// 将 float32 转换为 PostgreSQL vector 格式
	vectorStr := arrayToPostgresVector(embedding)

	query := fmt.Sprintf(`
		INSERT INTO %s (id, content, embedding, metadata, updated_at)
		VALUES ($1, $2, $3::vector, $4::jsonb, CURRENT_TIMESTAMP)
		ON CONFLICT (id) DO UPDATE SET
			content = EXCLUDED.content,
			embedding = EXCLUDED.embedding,
			metadata = EXCLUDED.metadata,
			updated_at = CURRENT_TIMESTAMP
	`, v.config.TableName)

	_, err = v.db.ExecContext(ctx, query, doc.ID, doc.Content, vectorStr, metadataJSON)
	return err
}

// BatchUpsert 批量插入或更新
func (v *PostgresVectorStore) BatchUpsert(ctx context.Context, docs []*Document, embeddings [][]float32) error {
	if len(docs) != len(embeddings) {
		return fmt.Errorf("documents and embeddings count mismatch: %d vs %d", len(docs), len(embeddings))
	}

	if len(docs) == 0 {
		return nil
	}

	tx, err := v.db.BeginTx(ctx, nil)
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
	`, v.config.TableName))
	if err != nil {
		return err
	}
	defer stmt.Close()

	for i, doc := range docs {
		if len(embeddings[i]) != v.config.Dimension {
			continue // 跳过维度不匹配的嵌入
		}

		metadataJSON, err := json.Marshal(doc.Metadata)
		if err != nil {
			metadataJSON = []byte("{}")
		}

		vectorStr := arrayToPostgresVector(embeddings[i])
		_, err = stmt.ExecContext(ctx, doc.ID, doc.Content, vectorStr, metadataJSON)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// Search 搜索相似文档
func (v *PostgresVectorStore) Search(ctx context.Context, query []float32, topK int, filter map[string]interface{}) ([]*SearchResult, error) {
	if len(query) != v.config.Dimension {
		return nil, fmt.Errorf("query dimension mismatch: expected %d, got %d", v.config.Dimension, len(query))
	}

	// 构建查询
	var queryStr string
	var args []interface{}
	argIndex := 1

	switch v.config.MeasureType {
	case "cosine":
		// 余弦相似度 - 1 - cosine_distance
		queryStr = fmt.Sprintf(`
			SELECT id, content, metadata, 1 - (embedding <=> $1::vector) as score
			FROM %s
		`, v.config.TableName)
	case "ip":
		// 内积
		queryStr = fmt.Sprintf(`
			SELECT id, content, metadata, embedding <#> $1::vector as score
			FROM %s
		`, v.config.TableName)
	case "l2":
		// 欧氏距离
		queryStr = fmt.Sprintf(`
			SELECT id, content, metadata, embedding <-> $1::vector as score
			FROM %s
		`, v.config.TableName)
	default:
		queryStr = fmt.Sprintf(`
			SELECT id, content, metadata, 1 - (embedding <=> $1::vector) as score
			FROM %s
		`, v.config.TableName)
	}

	// 添加过滤条件
	if filter != nil && len(filter) > 0 {
		whereClause, filterArgs := buildWhereClause(filter, argIndex)
		if whereClause != "" {
			queryStr += " WHERE " + whereClause
			args = append(args, filterArgs...)
			argIndex += len(filterArgs)
		}
	}

	// 添加排序和限制
	queryStr += fmt.Sprintf(" ORDER BY score DESC LIMIT $%d", argIndex)
	args = append(args, topK)

	rows, err := v.db.QueryContext(ctx, queryStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*SearchResult
	for rows.Next() {
		var id, content string
		var metadataBytes []byte
		var score float64

		if err := rows.Scan(&id, &content, &metadataBytes, &score); err != nil {
			return nil, err
		}

		var metadata map[string]interface{}
		if err := json.Unmarshal(metadataBytes, &metadata); err != nil {
			metadata = make(map[string]interface{})
		}

		results = append(results, &SearchResult{
			ID:          id,
			Content:     content,
			Score:       score,
			Metadata:    metadata,
			RerankScore: score,
			Distance:    1 - score, // 距离 = 1 - 相似度
		})
	}

	return results, rows.Err()
}

// Delete 删除文档
func (v *PostgresVectorStore) Delete(ctx context.Context, id string) error {
	query := fmt.Sprintf(`DELETE FROM %s WHERE id = $1`, v.config.TableName)
	result, err := v.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("document not found: %s", id)
	}

	return nil
}

// DeleteByFilter 根据条件删除
func (v *PostgresVectorStore) DeleteByFilter(ctx context.Context, filter map[string]interface{}) error {
	if filter == nil || len(filter) == 0 {
		return fmt.Errorf("filter is required")
	}

	whereClause, args := buildWhereClause(filter, 1)
	query := fmt.Sprintf("DELETE FROM %s WHERE %s", v.config.TableName, whereClause)

	_, err := v.db.ExecContext(ctx, query, args...)
	return err
}

// GetByID 根据ID获取文档
func (v *PostgresVectorStore) GetByID(ctx context.Context, id string) (*Document, error) {
	query := fmt.Sprintf(`SELECT id, content, metadata FROM %s WHERE id = $1`, v.config.TableName)

	var doc Document
	var metadataBytes []byte

	err := v.db.QueryRowContext(ctx, query, id).Scan(&doc.ID, &doc.Content, &metadataBytes)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("document not found: %s", id)
		}
		return nil, err
	}

	if err := json.Unmarshal(metadataBytes, &doc.Metadata); err != nil {
		doc.Metadata = make(map[string]interface{})
	}

	return &doc, nil
}

// Close 关闭连接
func (v *PostgresVectorStore) Close() error {
	return v.db.Close()
}

// Ping 检查连接
func (v *PostgresVectorStore) Ping(ctx context.Context) error {
	return v.db.PingContext(ctx)
}

// GetStats 获取表统计信息
func (v *PostgresVectorStore) GetStats(ctx context.Context) (map[string]interface{}, error) {
	query := fmt.Sprintf(`
		SELECT
			COUNT(*) as total_count,
			COUNT(embedding) as indexed_count,
			MAX(updated_at) as last_updated
		FROM %s
	`, v.config.TableName)

	var stats struct {
		TotalCount  int64
		IndexedCount int64
		LastUpdated sql.NullTime
	}

	if err := v.db.QueryRowContext(ctx, query).Scan(&stats.TotalCount, &stats.IndexedCount, &stats.LastUpdated); err != nil {
		return nil, err
	}

	result := map[string]interface{}{
		"table":          v.config.TableName,
		"total_count":    stats.TotalCount,
		"indexed_count":  stats.IndexedCount,
		"dimension":      v.config.Dimension,
		"index_type":     v.config.IndexType,
		"measure_type":   v.config.MeasureType,
	}

	if stats.LastUpdated.Valid {
		result["last_updated"] = stats.LastUpdated.Time
	}

	return result, nil
}

// arrayToPostgresVector 将 float32 数组转换为 PostgreSQL vector 格式字符串
func arrayToPostgresVector(arr []float32) string {
	strs := make([]string, len(arr))
	for i, v := range arr {
		strs[i] = fmt.Sprintf("%.6f", v)
	}
	return "[" + strings.Join(strs, ",") + "]"
}

// buildWhereClause 构建 WHERE 子句
func buildWhereClause(filter map[string]interface{}, startIndex int) (string, []interface{}) {
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
		case []string:
			if len(v) > 0 {
				conditions = append(conditions, fmt.Sprintf("metadata->>$%d = ANY($%d)", argIndex, argIndex+1))
				args = append(args, key, pq.Array(v))
				argIndex += 2
			}
		default:
			conditions = append(conditions, fmt.Sprintf("metadata->>$%d = $%d", argIndex, argIndex+1))
			args = append(args, key, fmt.Sprintf("%v", v))
			argIndex += 2
		}
	}

	return strings.Join(conditions, " AND "), args
}

// LLMClient LLM客户端接口（用于重排序）
type LLMClient interface {
	Chat(ctx context.Context, messages []ChatMessage, model string, options *ChatOptions) (*ChatResponse, error)
}

// ChatMessage 聊天消息
type ChatMessage struct {
	Role    string
	Content string
}

// ChatOptions 聊天选项
type ChatOptions struct {
	Temperature float64
	MaxTokens   int
}

// ChatResponse 聊天响应
type ChatResponse struct {
	Content []ContentPart
}

// ContentPart 内容部分
type ContentPart struct {
	Text string
}
