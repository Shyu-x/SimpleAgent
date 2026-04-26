package rag

import (
	"context"
	"errors"
	"math"
)

// Document 文档结构
type Document struct {
	ID       string
	Content  string
	Metadata map[string]interface{}
}

// Chunk 文档块
type Chunk struct {
	ID       string
	DocumentID string
	Content  string
	Metadata map[string]interface{}
	// 向量表示（如果已嵌入）
	Embedding []float32
}

// SearchResult 搜索结果
type SearchResult struct {
	Chunk      *Chunk
	Score      float64
	Rank       int
}

// QueryRewriteService 问题改写服务
type QueryRewriteService interface {
	// Rewrite 改写查询
	Rewrite(ctx context.Context, query string) (string, error)
	// Decompose 分解查询
	Decompose(ctx context.Context, query string) ([]string, error)
}

// queryRewriteService 问题改写服务实现
type queryRewriteService struct {
	enableHistory bool
}

// NewQueryRewriteService 创建问题改写服务
func NewQueryRewriteService() QueryRewriteService {
	return &queryRewriteService{
		enableHistory: true,
	}
}

// Rewrite 改写查询
func (s *queryRewriteService) Rewrite(ctx context.Context, query string) (string, error) {
	if query == "" {
		return "", errors.New("query cannot be empty")
	}
	// 简单实现：直接返回原查询
	// 实际应该使用LLM进行改写
	return query, nil
}

// Decompose 分解查询为多个子问题
func (s *queryRewriteService) Decompose(ctx context.Context, query string) ([]string, error) {
	if query == "" {
		return nil, errors.New("query cannot be empty")
	}

	// 简单实现：按标点符号分解
	subQueries := []string{query}
	// 实际应该使用LLM分析查询意图并分解

	return subQueries, nil
}

// Reranker 重排序器接口
type Reranker interface {
	// Rerank 重排序
	Rerank(ctx context.Context, query string, results []SearchResult) ([]SearchResult, error)
}

// crossEncoderReranker CrossEncoder重排序器
type crossEncoderReranker struct {
	modelPath string
}

// NewCrossEncoderReranker 创建CrossEncoder重排序器
func NewCrossEncoderReranker(modelPath string) Reranker {
	return &crossEncoderReranker{
		modelPath: modelPath,
	}
}

// Rerank 重排序
func (r *crossEncoderReranker) Rerank(ctx context.Context, query string, results []SearchResult) ([]SearchResult, error) {
	if query == "" {
		return nil, errors.New("query cannot be empty")
	}

	// 简化实现：按原始分数排序
	// 实际应该使用CrossEncoder模型进行重排序

	for i := 0; i < len(results)-1; i++ {
		for j := i + 1; j < len(results); j++ {
			if results[j].Score > results[i].Score {
				results[i], results[j] = results[j], results[i]
			}
		}
	}

	// 更新排名
	for i := range results {
		results[i].Rank = i + 1
	}

	return results, nil
}

// bm25Reranker BM25重排序器
type bm25Reranker struct {
	k1 float64
	b  float64
}

// NewBM25Reranker 创建BM25重排序器
func NewBM25Reranker() Reranker {
	return &bm25Reranker{
		k1: 1.5,
		b:  0.75,
	}
}

// Rerank 重排序
func (r *bm25Reranker) Rerank(ctx context.Context, query string, results []SearchResult) ([]SearchResult, error) {
	// 简化实现
	return results, nil
}

// VectorStore 向量存储接口
type VectorStore interface {
	// Insert 插入文档
	Insert(ctx context.Context, chunks []Chunk) error
	// Search 搜索
	Search(ctx context.Context, query []float32, topK int) ([]SearchResult, error)
	// Delete 删除文档
	Delete(ctx context.Context, docID string) error
}

// simpleVectorStore 简单向量存储实现
type simpleVectorStore struct {
	chunks []Chunk
}

// NewSimpleVectorStore 创建简单向量存储
func NewSimpleVectorStore() VectorStore {
	return &simpleVectorStore{
		chunks: make([]Chunk, 0),
	}
}

// Insert 插入文档
func (vs *simpleVectorStore) Insert(ctx context.Context, chunks []Chunk) error {
	vs.chunks = append(vs.chunks, chunks...)
	return nil
}

// Search 搜索
func (vs *simpleVectorStore) Search(ctx context.Context, query []float32, topK int) ([]SearchResult, error) {
	results := make([]SearchResult, 0)

	for i := range vs.chunks {
		chunk := vs.chunks[i]
		score := cosineSimilarity(query, chunk.Embedding)
		results = append(results, SearchResult{
			Chunk: &chunk,
			Score: score,
			Rank:  len(results) + 1,
		})
	}

	// 排序
	for i := 0; i < len(results)-1; i++ {
		for j := i + 1; j < len(results); j++ {
			if results[j].Score > results[i].Score {
				results[i], results[j] = results[j], results[i]
			}
		}
	}

	// 截取topK
	if len(results) > topK {
		results = results[:topK]
	}

	return results, nil
}

// Delete 删除文档
func (vs *simpleVectorStore) Delete(ctx context.Context, docID string) error {
	newChunks := make([]Chunk, 0)
	for _, c := range vs.chunks {
		if c.DocumentID != docID {
			newChunks = append(newChunks, c)
		}
	}
	vs.chunks = newChunks
	return nil
}

// cosineSimilarity 计算余弦相似度
func cosineSimilarity(a, b []float32) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}

	var dotProduct float64
	var normA float64
	var normB float64

	for i := range a {
		dotProduct += float64(a[i] * b[i])
		normA += float64(a[i] * a[i])
		normB += float64(b[i] * b[i])
	}

	if normA == 0 || normB == 0 {
		return 0
	}

	return dotProduct / (math.Sqrt(normA) * math.Sqrt(normB))
}

// RetrievalConfig 检索配置
type RetrievalConfig struct {
	TopK           int
	MinScore       float64
	EnableRerank   bool
	RerankTopK    int
}

// RAGPipeline RAG流水线
type RAGPipeline struct {
	rewriteService QueryRewriteService
	vectorStore    VectorStore
	reranker       Reranker
	config         RetrievalConfig
}

// NewRAGPipeline 创建RAG流水线
func NewRAGPipeline(rewriteService QueryRewriteService, vectorStore VectorStore, reranker Reranker, config RetrievalConfig) *RAGPipeline {
	if config.TopK <= 0 {
		config.TopK = 5
	}
	if config.RerankTopK <= 0 {
		config.RerankTopK = 10
	}

	return &RAGPipeline{
		rewriteService: rewriteService,
		vectorStore:    vectorStore,
		reranker:       reranker,
		config:         config,
	}
}

// Query 执行查询
func (p *RAGPipeline) Query(ctx context.Context, query string, queryEmbedding []float32) ([]SearchResult, error) {
	// 1. 改写查询
	rewrittenQuery, err := p.rewriteService.Rewrite(ctx, query)
	if err != nil {
		return nil, err
	}

	// 2. 分解查询
	subQueries, err := p.rewriteService.Decompose(ctx, rewrittenQuery)
	if err != nil {
		return nil, err
	}

	// 3. 向量搜索
	allResults := make([]SearchResult, 0)
	for range subQueries {
		results, err := p.vectorStore.Search(ctx, queryEmbedding, p.config.TopK)
		if err != nil {
			continue
		}
		allResults = append(allResults, results...)
	}

	// 4. 去重
	allResults = deduplicateResults(allResults)

	// 5. 重排序
	if p.config.EnableRerank && p.reranker != nil {
		allResults, err = p.reranker.Rerank(ctx, query, allResults)
		if err != nil {
			return nil, err
		}
	}

	// 6. 截取TopK
	if len(allResults) > p.config.TopK {
		allResults = allResults[:p.config.TopK]
	}

	return allResults, nil
}

// deduplicateResults 去重搜索结果
func deduplicateResults(results []SearchResult) []SearchResult {
	seen := make(map[string]bool)
	unique := make([]SearchResult, 0)

	for _, r := range results {
		if !seen[r.Chunk.ID] {
			seen[r.Chunk.ID] = true
			unique = append(unique, r)
		}
	}

	return unique
}
