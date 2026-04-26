// Package vector 向量存储抽象层
// 支持 Qdrant 和 PostgreSQL (pgvector) 两种实现
package vector

import (
	"context"
)

// StoreConfig 存储配置
type StoreConfig struct {
	Provider string          // "qdrant" 或 "pgvector"
	Qdrant   *QdrantConfig   // Qdrant配置
	PGVector *PGVectorConfig // PostgreSQL向量配置
}

// VectorStore 向量存储接口
type VectorStore interface {
	// Upsert 插入或更新单个向量
	Upsert(ctx context.Context, id string, vector []float32, payload map[string]interface{}) error
	// BatchUpsert 批量插入向量
	BatchUpsert(ctx context.Context, ids []string, vectors [][]float32, payloads []map[string]interface{}) error
	// Search 搜索相似向量
	Search(ctx context.Context, query []float32, topK int, filter map[string]interface{}) ([]*SearchResult, error)
	// SearchBatch 批量搜索
	SearchBatch(ctx context.Context, queries [][]float32, topK int) ([][]*SearchResult, error)
	// Delete 删除向量
	Delete(ctx context.Context, id string) error
	// DeleteByFilter 根据条件删除
	DeleteByFilter(ctx context.Context, filter map[string]interface{}) error
	// GetByID 根据ID获取
	GetByID(ctx context.Context, id string) (*SearchResult, error)
	// Init 初始化存储
	Init(ctx context.Context) error
	// Health 健康检查
	Health(ctx context.Context) error
	// Close 关闭连接
	Close() error
}

// SearchResult 搜索结果
type SearchResult struct {
	ID       string
	Score    float64
	Payload  map[string]interface{}
	Content  string
	Metadata map[string]interface{}
}

// NewVectorStore 创建向量存储实例
func NewVectorStore(cfg *StoreConfig) (VectorStore, error) {
	switch cfg.Provider {
	case "qdrant":
		store, err := NewQdrantStore(cfg.Qdrant)
		if err != nil {
			return nil, err
		}
		return &QdrantWrapper{store: store}, nil
	case "pgvector":
		store, err := NewPGVectorStore(cfg.PGVector)
		if err != nil {
			return nil, err
		}
		return store, nil
	default:
		// 默认使用Qdrant
		store, err := NewQdrantStore(DefaultQdrantConfig())
		if err != nil {
			return nil, err
		}
		return &QdrantWrapper{store: store}, nil
	}
}

// QdrantWrapper Qdrant存储包装器，适配VectorStore接口
type QdrantWrapper struct {
	store *QdrantStore
}

// Init 初始化
func (w *QdrantWrapper) Init(ctx context.Context) error {
	return w.store.InitCollection(ctx)
}

// Upsert 插入或更新
func (w *QdrantWrapper) Upsert(ctx context.Context, id string, vector []float32, payload map[string]interface{}) error {
	return w.store.Upsert(ctx, id, vector, payload)
}

// BatchUpsert 批量插入
func (w *QdrantWrapper) BatchUpsert(ctx context.Context, ids []string, vectors [][]float32, payloads []map[string]interface{}) error {
	return w.store.BatchUpsert(ctx, ids, vectors, payloads)
}

// Search 搜索
func (w *QdrantWrapper) Search(ctx context.Context, query []float32, topK int, filter map[string]interface{}) ([]*SearchResult, error) {
	return w.store.Search(ctx, query, topK, filter)
}

// SearchBatch 批量搜索
func (w *QdrantWrapper) SearchBatch(ctx context.Context, queries [][]float32, topK int) ([][]*SearchResult, error) {
	return w.store.SearchBatch(ctx, queries, topK)
}

// Delete 删除
func (w *QdrantWrapper) Delete(ctx context.Context, id string) error {
	return w.store.Delete(ctx, id)
}

// DeleteByFilter 条件删除
func (w *QdrantWrapper) DeleteByFilter(ctx context.Context, filter map[string]interface{}) error {
	return w.store.DeleteByFilter(ctx, filter)
}

// GetByID 获取单个
func (w *QdrantWrapper) GetByID(ctx context.Context, id string) (*SearchResult, error) {
	return w.store.GetByID(ctx, id)
}

// Health 健康检查
func (w *QdrantWrapper) Health(ctx context.Context) error {
	return w.store.Health(ctx)
}

// Close 关闭
func (w *QdrantWrapper) Close() error {
	return w.store.Close()
}
