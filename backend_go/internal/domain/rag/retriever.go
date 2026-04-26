package rag

import (
	"context"
	"math"
)

// SearchResult 搜索结果
type SearchResult struct {
	ID         string                 `json:"id"`          // 文档ID
	Content    string                 `json:"content"`     // 文档内容
	Score      float64                `json:"score"`        // 相似度分数
	Metadata   map[string]interface{} `json:"metadata"`     // 元数据
	RerankScore float64               `json:"rerank_score"` // 重排分数
}

// Retriever 检索器接口
type Retriever interface {
	// Retrieve 检索文档
	Retrieve(ctx context.Context, query string, topK int) ([]*SearchResult, error)
	// Name 获取检索器名称
	Name() string
}

// BaseRetriever 基础检索器
type BaseRetriever struct {
	name   string
	client VectorStore
}

// NewBaseRetriever 创建基础检索器
func NewBaseRetriever(name string, client VectorStore) *BaseRetriever {
	return &BaseRetriever{name: name, client: client}
}

// Name 获取名称
func (r *BaseRetriever) Name() string {
	return r.name
}

// VectorStore 向量存储接口
type VectorStore interface {
	// Search 搜索
	Search(ctx context.Context, query string, topK int) ([]*VectorResult, error)
	// Insert 插入
	Insert(ctx context.Context, doc *Document) error
	// Delete 删除
	Delete(ctx context.Context, id string) error
}

// VectorResult 向量搜索结果
type VectorResult struct {
	ID       string                 `json:"id"`
	Content  string                 `json:"content"`
	Score    float64                `json:"score"`
	Metadata map[string]interface{} `json:"metadata"`
}

// Document 文档
type Document struct {
	ID      string                 `json:"id"`
	Content string                 `json:"content"`
	Metadata map[string]interface{} `json:"metadata"`
}

// Retrieve 检索
func (r *BaseRetriever) Retrieve(ctx context.Context, query string, topK int) ([]*SearchResult, error) {
	vectorResults, err := r.client.Search(ctx, query, topK)
	if err != nil {
		return nil, err
	}

	results := make([]*SearchResult, len(vectorResults))
	for i, vr := range vectorResults {
		results[i] = &SearchResult{
			ID:         vr.ID,
			Content:    vr.Content,
			Score:      vr.Score,
			Metadata:   vr.Metadata,
			RerankScore: vr.Score,
		}
	}

	return results, nil
}

// HybridRetriever 混合检索器
type HybridRetriever struct {
	vectorRetriever Retriever
	keywordRetriever Retriever
}

// NewHybridRetriever 创建混合检索器
func NewHybridRetriever(vector, keyword Retriever) *HybridRetriever {
	return &HybridRetriever{
		vectorRetriever:  vector,
		keywordRetriever: keyword,
	}
}

// Retrieve 执行混合检索
func (r *HybridRetriever) Retrieve(ctx context.Context, query string, topK int) ([]*SearchResult, error) {
	// 并行执行向量检索和关键词检索
	vectorResults, vectorErr := r.vectorRetriever.Retrieve(ctx, query, topK*2)
	keywordResults, keywordErr := r.keywordRetriever.Retrieve(ctx, query, topK*2)

	var results []*SearchResult

	// 合并结果
	if vectorErr == nil && keywordErr == nil {
		results = r.mergeResults(vectorResults, keywordResults, topK)
	} else if vectorErr == nil {
		results = vectorResults
		if len(results) > topK {
			results = results[:topK]
		}
	} else if keywordErr == nil {
		results = keywordResults
		if len(results) > topK {
			results = results[:topK]
		}
	} else {
		return nil, vectorErr
	}

	return results, nil
}

// Name 获取名称
func (r *HybridRetriever) Name() string {
	return "hybrid"
}

// mergeResults 合并结果
func (r *HybridRetriever) mergeResults(vector, keyword []*SearchResult, topK int) []*SearchResult {
	// 使用RRF融合算法(Reciprocal Rank Fusion)
	scoreMap := make(map[string]float64)

	const k = 60 // RRF参数
	for i, res := range vector {
		rrfScore := 1.0 / float64(k+i+1)
		scoreMap[res.ID] += 0.7 * rrfScore // 向量权重0.7
	}

	for i, res := range keyword {
		rrfScore := 1.0 / float64(k+i+1)
		scoreMap[res.ID] += 0.3 * rrfScore // 关键词权重0.3
	}

	// 构建融合后的结果
	var fused []*SearchResult
	seen := make(map[string]bool)

	for _, res := range vector {
		if !seen[res.ID] {
			seen[res.ID] = true
			fused = append(fused, res)
		}
	}

	for _, res := range keyword {
		if !seen[res.ID] {
			seen[res.ID] = true
			fused = append(fused, res)
		}
	}

	// 按融合分数排序
	for i := 0; i < len(fused); i++ {
		for j := i + 1; j < len(fused); j++ {
			scoreI := scoreMap[fused[i].ID]
			scoreJ := scoreMap[fused[j].ID]
			if scoreJ > scoreI {
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
