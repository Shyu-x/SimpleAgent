package channels

import (
	"context"

	"github.com/ai-chat/backend_go/internal/domain/rag"
)

// VectorSearchChannel 向量检索通道
type VectorSearchChannel struct {
	name      string
	client    VectorStoreClient
	topK      int
	threshold float64
}

// VectorStoreClient 向量存储客户端接口
type VectorStoreClient interface {
	Search(ctx context.Context, query string, topK int) ([]*rag.VectorResult, error)
}

// NewVectorSearchChannel 创建向量检索通道
func NewVectorSearchChannel(name string, client VectorStoreClient, topK int, threshold float64) *VectorSearchChannel {
	return &VectorSearchChannel{
		name:      name,
		client:    client,
		topK:      topK,
		threshold: threshold,
	}
}

// Name 获取通道名称
func (c *VectorSearchChannel) Name() string {
	return c.name
}

// Search 执行搜索
func (c *VectorSearchChannel) Search(ctx context.Context, query string, topK int) ([]*rag.SearchResult, error) {
	if topK <= 0 {
		topK = c.topK
	}

	results, err := c.client.Search(ctx, query, topK)
	if err != nil {
		return nil, err
	}

	searchResults := make([]*rag.SearchResult, len(results))
	for i, r := range results {
		searchResults[i] = &rag.SearchResult{
			ID:           r.ID,
			Content:      r.Content,
			Score:        r.Score,
			Metadata:     r.Metadata,
			RerankScore: r.Score,
		}
	}

	return searchResults, nil
}

// Weight 获取通道权重
func (c *VectorSearchChannel) Weight() float64 {
	return 0.7
}
