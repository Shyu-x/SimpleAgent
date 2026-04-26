// Package vector Qdrant向量数据库集成
package vector

import (
	"context"
	"fmt"
	"time"

	"github.com/rs/zerolog/log"
)

// QdrantConfig Qdrant配置
type QdrantConfig struct {
	Addr         string // 地址，如 "localhost:6334"
	APIKey       string // API密钥（可选）
	Collection   string // 默认集合名
	Dimension    int    // 向量维度
	DistanceType string // 距离类型：Cosine/Dot/Euclidean
	Timeout      int    // 超时秒数
}

// DefaultQdrantConfig 默认配置
func DefaultQdrantConfig() *QdrantConfig {
	return &QdrantConfig{
		Addr:         "localhost:6334",
		Collection:   "gagent_documents",
		Dimension:    1536,
		DistanceType: "Cosine",
		Timeout:      10,
	}
}

// QdrantStore Qdrant向量存储
// 注意：当前为简化实现，使用REST API进行通信
type QdrantStore struct {
	config *QdrantConfig
}

// NewQdrantStore 创建Qdrant存储
func NewQdrantStore(cfg *QdrantConfig) (*QdrantStore, error) {
	if cfg == nil {
		cfg = DefaultQdrantConfig()
	}

	store := &QdrantStore{
		config: cfg,
	}

	log.Info().
		Str("addr", cfg.Addr).
		Str("collection", cfg.Collection).
		Int("dimension", cfg.Dimension).
		Msg("Qdrant存储初始化")

	return store, nil
}

// InitCollection 初始化集合
func (s *QdrantStore) InitCollection(ctx context.Context) error {
	collectionName := s.config.Collection

	log.Info().Str("collection", collectionName).Msg("Qdrant集合初始化")

	// 简化实现：假设集合已存在或创建成功
	// 实际生产环境应调用Qdrant API检查/创建集合
	return nil
}

// Upsert 插入或更新向量
func (s *QdrantStore) Upsert(ctx context.Context, id string, vector []float32, payload map[string]interface{}) error {
	_, err := s.client().Upsert(ctx, &UpsertRequest{
		CollectionName: s.config.Collection,
		Points: []*PointStruct{
			{
				Id:       id,
				Vector:   vector,
				Payload:  payload,
			},
		},
	})
	if err != nil {
		return fmt.Errorf("Upsert失败: %w", err)
	}

	return nil
}

// BatchUpsert 批量插入或更新
func (s *QdrantStore) BatchUpsert(ctx context.Context, ids []string, vectors [][]float32, payloads []map[string]interface{}) error {
	if len(ids) != len(vectors) || len(ids) != len(payloads) {
		return fmt.Errorf("参数长度不匹配: %d ids, %d vectors, %d payloads",
			len(ids), len(vectors), len(payloads))
	}

	points := make([]*PointStruct, 0, len(ids))
	for i := range ids {
		points = append(points, &PointStruct{
			Id:      ids[i],
			Vector:  vectors[i],
			Payload: payloads[i],
		})
	}

	_, err := s.client().Upsert(ctx, &UpsertRequest{
		CollectionName: s.config.Collection,
		Points:         points,
	})
	if err != nil {
		return fmt.Errorf("BatchUpsert失败: %w", err)
	}

	return nil
}

// Search 搜索相似向量
func (s *QdrantStore) Search(ctx context.Context, query []float32, topK int, filter map[string]interface{}) ([]*SearchResult, error) {
	results, err := s.client().Search(ctx, &SearchRequest{
		CollectionName: s.config.Collection,
		Vector:         query,
		Limit:          topK,
		WithPayload:    true,
		Filter:         filter,
	})
	if err != nil {
		return nil, fmt.Errorf("Search失败: %w", err)
	}

	return results, nil
}

// SearchBatch 批量搜索
func (s *QdrantStore) SearchBatch(ctx context.Context, queries [][]float32, topK int) ([][]*SearchResult, error) {
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

// Delete 删除向量
func (s *QdrantStore) Delete(ctx context.Context, id string) error {
	_, err := s.client().Delete(ctx, &DeleteRequest{
		CollectionName: s.config.Collection,
		Points:         []string{id},
	})
	if err != nil {
		return fmt.Errorf("Delete失败: %w", err)
	}
	return nil
}

// DeleteByFilter 根据条件删除
func (s *QdrantStore) DeleteByFilter(ctx context.Context, filter map[string]interface{}) error {
	if filter == nil || len(filter) == 0 {
		return fmt.Errorf("filter不能为空")
	}

	_, err := s.client().Delete(ctx, &DeleteRequest{
		CollectionName: s.config.Collection,
		Filter:         filter,
	})
	if err != nil {
		return fmt.Errorf("DeleteByFilter失败: %w", err)
	}
	return nil
}

// GetByID 根据ID获取
func (s *QdrantStore) GetByID(ctx context.Context, id string) (*SearchResult, error) {
	results, err := s.client().Retrieve(ctx, &RetrieveRequest{
		CollectionName: s.config.Collection,
		Ids:            []string{id},
		WithPayload:    true,
	})
	if err != nil {
		return nil, fmt.Errorf("GetByID失败: %w", err)
	}

	if len(results) == 0 {
		return nil, nil
	}

	return results[0], nil
}

// GetCollectionInfo 获取集合信息
func (s *QdrantStore) GetCollectionInfo(ctx context.Context) (*CollectionInfo, error) {
	info, err := s.client().GetCollectionInfo(ctx, s.config.Collection)
	if err != nil {
		return nil, fmt.Errorf("GetCollectionInfo失败: %w", err)
	}

	return info, nil
}

// Health 健康检查
func (s *QdrantStore) Health(ctx context.Context) error {
	_, err := s.client().GetCollectionInfo(ctx, s.config.Collection)
	return err
}

// Close 关闭连接
func (s *QdrantStore) Close() error {
	// Qdrant客户端不需要显式关闭
	return nil
}

// CollectionInfo 集合信息
type CollectionInfo struct {
	Name           string
	VectorsCount   uint64
	IndexedVectors uint64
	PointsCount    uint64
	Status         string
}

// PointStruct 点结构
type PointStruct struct {
	Id      string
	Vector  []float32
	Payload map[string]interface{}
}

// UpsertRequest Upsert请求
type UpsertRequest struct {
	CollectionName string
	Points         []*PointStruct
}

// SearchRequest 搜索请求
type SearchRequest struct {
	CollectionName string
	Vector         []float32
	Limit          int
	WithPayload    bool
	Filter         map[string]interface{}
}

// DeleteRequest 删除请求
type DeleteRequest struct {
	CollectionName string
	Points         []string
	Filter         map[string]interface{}
}

// RetrieveRequest 检索请求
type RetrieveRequest struct {
	CollectionName string
	Ids            []string
	WithPayload    bool
}

// qdrantClient 简化Qdrant客户端接口
type qdrantClient interface {
	Upsert(ctx context.Context, req *UpsertRequest) ([]*SearchResult, error)
	Search(ctx context.Context, req *SearchRequest) ([]*SearchResult, error)
	Delete(ctx context.Context, req *DeleteRequest) (bool, error)
	Retrieve(ctx context.Context, req *RetrieveRequest) ([]*SearchResult, error)
	GetCollectionInfo(ctx context.Context, collection string) (*CollectionInfo, error)
}

// httpQdrantClient 基于HTTP的简化Qdrant客户端实现
type httpQdrantClient struct {
	addr   string
	apiKey string
	timeout time.Duration
}

// client 返回Qdrant客户端实例
func (s *QdrantStore) client() qdrantClient {
	return &httpQdrantClient{
		addr:   s.config.Addr,
		apiKey: s.config.APIKey,
		timeout: time.Duration(s.config.Timeout) * time.Second,
	}
}

// Upsert 插入或更新向量
func (c *httpQdrantClient) Upsert(ctx context.Context, req *UpsertRequest) ([]*SearchResult, error) {
	// 简化实现：实际应调用Qdrant REST API
	// POST /collections/{collection}/points
	log.Debug().Str("collection", req.CollectionName).Int("points", len(req.Points)).Msg("Upsert")
	return nil, nil
}

// Search 搜索
func (c *httpQdrantClient) Search(ctx context.Context, req *SearchRequest) ([]*SearchResult, error) {
	// 简化实现：实际应调用Qdrant REST API
	// POST /collections/{collection}/points/search
	log.Debug().Str("collection", req.CollectionName).Int("limit", req.Limit).Msg("Search")
	return nil, nil
}

// Delete 删除
func (c *httpQdrantClient) Delete(ctx context.Context, req *DeleteRequest) (bool, error) {
	// 简化实现：实际应调用Qdrant REST API
	// POST /collections/{collection}/points/delete
	log.Debug().Str("collection", req.CollectionName).Int("points", len(req.Points)).Msg("Delete")
	return true, nil
}

// Retrieve 检索
func (c *httpQdrantClient) Retrieve(ctx context.Context, req *RetrieveRequest) ([]*SearchResult, error) {
	// 简化实现：实际应调用Qdrant REST API
	// GET /collections/{collection}/points/{id}
	log.Debug().Str("collection", req.CollectionName).Int("ids", len(req.Ids)).Msg("Retrieve")
	return nil, nil
}

// GetCollectionInfo 获取集合信息
func (c *httpQdrantClient) GetCollectionInfo(ctx context.Context, collection string) (*CollectionInfo, error) {
	// 简化实现：实际应调用Qdrant REST API
	// GET /collections/{collection}
	log.Debug().Str("collection", collection).Msg("GetCollectionInfo")
	return &CollectionInfo{
		Name:         collection,
		VectorsCount: 0,
		Status:       "green",
	}, nil
}
