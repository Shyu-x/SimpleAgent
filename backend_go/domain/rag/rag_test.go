package rag

import (
	"context"
	"math"
	"testing"
)

// TestCosineSimilarity 测试余弦相似度计算
func TestCosineSimilarity(t *testing.T) {
	tests := []struct {
		name     string
		a        []float32
		b        []float32
		expected float64
	}{
		{
			name:     "identical vectors",
			a:        []float32{1, 0, 0},
			b:        []float32{1, 0, 0},
			expected: 1.0,
		},
		{
			name:     "opposite vectors",
			a:        []float32{1, 0, 0},
			b:        []float32{-1, 0, 0},
			expected: -1.0,
		},
		{
			name:     "orthogonal vectors",
			a:        []float32{1, 0, 0},
			b:        []float32{0, 1, 0},
			expected: 0.0,
		},
		{
			name:     "2D vectors",
			a:        []float32{1, 1},
			b:        []float32{1, 1},
			expected: 1.0,
		},
		{
			name:     "empty vectors",
			a:        []float32{},
			b:        []float32{},
			expected: 0.0,
		},
		{
			name:     "mismatched length",
			a:        []float32{1, 0, 0},
			b:        []float32{1, 0},
			expected: 0.0,
		},
		{
			name:     "zero vector",
			a:        []float32{0, 0, 0},
			b:        []float32{1, 0, 0},
			expected: 0.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := cosineSimilarity(tt.a, tt.b)
			if math.Abs(result-tt.expected) > 0.0001 {
				t.Errorf("expected %f, got %f", tt.expected, result)
			}
		})
	}
}

// TestQueryRewriteServiceRewrite 测试问题改写
func TestQueryRewriteServiceRewrite(t *testing.T) {
	service := NewQueryRewriteService()

	result, err := service.Rewrite(context.Background(), "What is AI?")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if result != "What is AI?" {
		t.Errorf("expected 'What is AI?', got '%s'", result)
	}
}

// TestQueryRewriteServiceRewriteEmpty 测试空查询改写
func TestQueryRewriteServiceRewriteEmpty(t *testing.T) {
	service := NewQueryRewriteService()

	_, err := service.Rewrite(context.Background(), "")
	if err == nil {
		t.Error("expected error for empty query")
	}
}

// TestQueryRewriteServiceDecompose 测试问题分解
func TestQueryRewriteServiceDecompose(t *testing.T) {
	service := NewQueryRewriteService()

	results, err := service.Decompose(context.Background(), "What is AI and ML?")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if len(results) == 0 {
		t.Error("expected at least one sub-query")
	}
}

// TestQueryRewriteServiceDecomposeEmpty 测试空问题分解
func TestQueryRewriteServiceDecomposeEmpty(t *testing.T) {
	service := NewQueryRewriteService()

	_, err := service.Decompose(context.Background(), "")
	if err == nil {
		t.Error("expected error for empty query")
	}
}

// TestSimpleVectorStoreInsert 测试向量存储插入
func TestSimpleVectorStoreInsert(t *testing.T) {
	store := NewSimpleVectorStore()

	chunks := []Chunk{
		{
			ID:         "chunk1",
			DocumentID: "doc1",
			Content:    "content 1",
			Embedding:  []float32{1, 0, 0},
		},
		{
			ID:         "chunk2",
			DocumentID: "doc1",
			Content:    "content 2",
			Embedding:  []float32{0, 1, 0},
		},
	}

	err := store.Insert(context.Background(), chunks)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

// TestSimpleVectorStoreSearch 测试向量存储搜索
func TestSimpleVectorStoreSearch(t *testing.T) {
	store := NewSimpleVectorStore()

	chunks := []Chunk{
		{
			ID:         "chunk1",
			DocumentID: "doc1",
			Content:    "content 1",
			Embedding:  []float32{1, 0, 0},
		},
		{
			ID:         "chunk2",
			DocumentID: "doc1",
			Content:    "content 2",
			Embedding:  []float32{0, 1, 0},
		},
		{
			ID:         "chunk3",
			DocumentID: "doc2",
			Content:    "content 3",
			Embedding:  []float32{0.5, 0.5, 0},
		},
	}

	store.Insert(context.Background(), chunks)

	// 搜索接近 [1, 0, 0] 的向量
	results, err := store.Search(context.Background(), []float32{1, 0, 0}, 2)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(results) != 2 {
		t.Errorf("expected 2 results, got %d", len(results))
	}

	// 第一个结果应该是chunk1
	if results[0].Chunk.ID != "chunk1" {
		t.Errorf("expected chunk1 first, got %s", results[0].Chunk.ID)
	}
}

// TestSimpleVectorStoreDelete 测试向量存储删除
func TestSimpleVectorStoreDelete(t *testing.T) {
	store := NewSimpleVectorStore()

	chunks := []Chunk{
		{
			ID:         "chunk1",
			DocumentID: "doc1",
			Content:    "content 1",
			Embedding:  []float32{1, 0, 0},
		},
		{
			ID:         "chunk2",
			DocumentID: "doc2",
			Content:    "content 2",
			Embedding:  []float32{0, 1, 0},
		},
	}

	store.Insert(context.Background(), chunks)

	// 删除doc1
	err := store.Delete(context.Background(), "doc1")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// 搜索应该只剩一个结果
	results, _ := store.Search(context.Background(), []float32{1, 0, 0}, 10)
	if len(results) != 1 {
		t.Errorf("expected 1 result after delete, got %d", len(results))
	}
}

// TestDeduplicateResults 测试搜索结果去重
func TestDeduplicateResults(t *testing.T) {
	results := []SearchResult{
		{Chunk: &Chunk{ID: "chunk1", Content: "content 1"}},
		{Chunk: &Chunk{ID: "chunk2", Content: "content 2"}},
		{Chunk: &Chunk{ID: "chunk1", Content: "content 1"}}, // 重复
		{Chunk: &Chunk{ID: "chunk3", Content: "content 3"}},
	}

	deduped := deduplicateResults(results)

	if len(deduped) != 3 {
		t.Errorf("expected 3 results after dedup, got %d", len(deduped))
	}
}

// TestRAGPipelineQuery 测试RAG流水线查询
func TestRAGPipelineQuery(t *testing.T) {
	rewriteService := NewQueryRewriteService()
	vectorStore := NewSimpleVectorStore()
	reranker := NewCrossEncoderReranker("")

	pipeline := NewRAGPipeline(rewriteService, vectorStore, reranker, RetrievalConfig{
		TopK:         5,
		EnableRerank: true,
		RerankTopK:   10,
	})

	chunks := []Chunk{
		{
			ID:         "chunk1",
			DocumentID: "doc1",
			Content:    "AI is artificial intelligence",
			Embedding:  []float32{1, 0, 0},
		},
		{
			ID:         "chunk2",
			DocumentID: "doc1",
			Content:    "ML is machine learning",
			Embedding:  []float32{0.8, 0.2, 0},
		},
	}

	vectorStore.Insert(context.Background(), chunks)

	results, err := pipeline.Query(context.Background(), "What is AI?", []float32{1, 0, 0})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(results) == 0 {
		t.Error("expected at least one result")
	}
}

// TestRAGPipelineEmptyQuery 测试RAG流水线空查询
func TestRAGPipelineEmptyQuery(t *testing.T) {
	rewriteService := NewQueryRewriteService()
	vectorStore := NewSimpleVectorStore()
	reranker := NewCrossEncoderReranker("")

	pipeline := NewRAGPipeline(rewriteService, vectorStore, reranker, RetrievalConfig{})

	_, err := pipeline.Query(context.Background(), "", []float32{1, 0, 0})
	if err == nil {
		t.Error("expected error for empty query")
	}
}

// TestCrossEncoderReranker 测试CrossEncoder重排序
func TestCrossEncoderReranker(t *testing.T) {
	reranker := NewCrossEncoderReranker("")

	results := []SearchResult{
		{Chunk: &Chunk{ID: "chunk1"}, Score: 0.5},
		{Chunk: &Chunk{ID: "chunk2"}, Score: 0.9},
		{Chunk: &Chunk{ID: "chunk3"}, Score: 0.7},
	}

	reranked, err := reranker.Rerank(context.Background(), "test query", results)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// 应该是按分数排序
	if reranked[0].Chunk.ID != "chunk2" {
		t.Errorf("expected chunk2 first, got %s", reranked[0].Chunk.ID)
	}
}

// TestDocument 测试文档结构
func TestDocument(t *testing.T) {
	doc := Document{
		ID:      "doc1",
		Content: "test content",
		Metadata: map[string]interface{}{
			"author": "test",
		},
	}

	if doc.ID != "doc1" {
		t.Errorf("expected ID 'doc1', got '%s'", doc.ID)
	}
	if doc.Content != "test content" {
		t.Errorf("expected content 'test content', got '%s'", doc.Content)
	}
}

// TestChunk 测试块结构
func TestChunk(t *testing.T) {
	chunk := Chunk{
		ID:         "chunk1",
		DocumentID: "doc1",
		Content:    "test content",
		Embedding:  []float32{1, 2, 3},
	}

	if chunk.ID != "chunk1" {
		t.Errorf("expected ID 'chunk1', got '%s'", chunk.ID)
	}
	if len(chunk.Embedding) != 3 {
		t.Errorf("expected embedding length 3, got %d", len(chunk.Embedding))
	}
}

// TestSearchResult 测试搜索结果结构
func TestSearchResult(t *testing.T) {
	result := SearchResult{
		Chunk: &Chunk{ID: "chunk1"},
		Score: 0.95,
		Rank:  1,
	}

	if result.Score != 0.95 {
		t.Errorf("expected score 0.95, got %f", result.Score)
	}
	if result.Rank != 1 {
		t.Errorf("expected rank 1, got %d", result.Rank)
	}
}
