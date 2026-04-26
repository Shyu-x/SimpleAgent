package channels

import (
	"context"
	"math"

	"github.com/ai-chat/backend_go/internal/domain/rag"
)

// HybridSearchChannel 混合检索通道
type HybridSearchChannel struct {
	vectorChannel  SearchChannel
	keywordChannel SearchChannel
	vectorWeight   float64
	keywordWeight  float64
}

// SearchChannel 检索通道接口
type SearchChannel interface {
	Name() string
	Search(ctx context.Context, query string, topK int) ([]*rag.SearchResult, error)
	Weight() float64
}

// NewHybridSearchChannel 创建混合检索通道
func NewHybridSearchChannel(vector, keyword SearchChannel) *HybridSearchChannel {
	return &HybridSearchChannel{
		vectorChannel:  vector,
		keywordChannel: keyword,
		vectorWeight:   0.7,
		keywordWeight:  0.3,
	}
}

// Name 获取通道名称
func (c *HybridSearchChannel) Name() string {
	return "hybrid"
}

// Search 执行混合搜索
func (c *HybridSearchChannel) Search(ctx context.Context, query string, topK int) ([]*rag.SearchResult, error) {
	// 并行执行两种检索
	vectorResults, vectorErr := c.vectorChannel.Search(ctx, query, topK*2)
	keywordResults, keywordErr := c.keywordChannel.Search(ctx, query, topK*2)

	var allResults []*rag.SearchResult

	// 合并结果
	if vectorErr == nil && keywordErr == nil {
		allResults = c.mergeResults(vectorResults, keywordResults, topK)
	} else if vectorErr == nil {
		allResults = vectorResults
		if len(allResults) > topK {
			allResults = allResults[:topK]
		}
	} else if keywordErr == nil {
		allResults = keywordResults
		if len(allResults) > topK {
			allResults = allResults[:topK]
		}
	} else {
		return nil, vectorErr
	}

	return allResults, nil
}

// Weight 获取通道权重
func (c *HybridSearchChannel) Weight() float64 {
	return 1.0
}

// mergeResults 合并结果
func (c *HybridSearchChannel) mergeResults(vector, keyword []*rag.SearchResult, topK int) []*rag.SearchResult {
	// RRF(R Reciprocal Rank Fusion)算法
	k := 60.0
	scoreMap := make(map[string]float64)

	for i, r := range vector {
		rrfScore := 1.0 / (k + float64(i+1))
		scoreMap[r.ID] += c.vectorWeight * rrfScore
	}

	for i, r := range keyword {
		rrfScore := 1.0 / (k + float64(i+1))
		scoreMap[r.ID] += c.keywordWeight * rrfScore
	}

	// 构建融合结果
	seen := make(map[string]bool)
	var fused []*rag.SearchResult

	// 优先添加向量检索结果
	for _, r := range vector {
		if !seen[r.ID] {
			seen[r.ID] = true
			r.RerankScore = scoreMap[r.ID]
			fused = append(fused, r)
		}
	}

	// 添加关键词检索结果
	for _, r := range keyword {
		if !seen[r.ID] {
			seen[r.ID] = true
			r.RerankScore = scoreMap[r.ID]
			fused = append(fused, r)
		}
	}

	// 按分数排序
	for i := 0; i < len(fused); i++ {
		for j := i + 1; j < len(fused); j++ {
			if fused[j].RerankScore > fused[i].RerankScore {
				fused[i], fused[j] = fused[j], fused[i]
			}
		}
	}

	if len(fused) > topK {
		fused = fused[:topK]
	}

	return fused
}

// cosineSimilarity 计算余弦相似度
func cosineSimilarity(a, b []float32) float64 {
	if len(a) != len(b) {
		return 0
	}

	var dotProduct, normA, normB float64
	for i := range a {
		dotProduct += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}

	if normA == 0 || normB == 0 {
		return 0
	}

	return dotProduct / (math.Sqrt(normA) * math.Sqrt(normB))
}
