package rag

import (
	"context"
	"math"
	"testing"
)

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
		{
			name:     "3D normalized",
			a:        []float32{0.577, 0.577, 0.577},
			b:        []float32{0.577, 0.577, 0.577},
			expected: 1.0,
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

func TestBaseRetriever(t *testing.T) {
	// 创建模拟的VectorStore
	mockStore := &MockVectorStore{
		vectors: []*VectorResult{
			{ID: "doc1", Content: "content 1", Score: 0.9, Metadata: nil},
			{ID: "doc2", Content: "content 2", Score: 0.8, Metadata: nil},
		},
	}

	retriever := NewBaseRetriever("test", mockStore)

	if retriever.Name() != "test" {
		t.Errorf("expected name 'test', got '%s'", retriever.Name())
	}

	ctx := context.Background()
	results, err := retriever.Retrieve(ctx, "test query", 5)
	if err != nil {
		t.Fatalf("Retrieve failed: %v", err)
	}

	if len(results) != 2 {
		t.Errorf("expected 2 results, got %d", len(results))
	}
}

func TestHybridRetriever(t *testing.T) {
	mockVectorStore := &MockVectorStore{
		vectors: []*VectorResult{
			{ID: "vec1", Content: "vector result 1", Score: 0.9, Metadata: nil},
		},
	}

	mockKeywordStore := &MockVectorStore{
		vectors: []*VectorResult{
			{ID: "kw1", Content: "keyword result 1", Score: 0.85, Metadata: nil},
		},
	}

	vectorRetriever := NewBaseRetriever("vector", mockVectorStore)
	keywordRetriever := NewBaseRetriever("keyword", mockKeywordStore)

	hybrid := NewHybridRetriever(vectorRetriever, keywordRetriever)

	if hybrid.Name() != "hybrid" {
		t.Errorf("expected name 'hybrid', got '%s'", hybrid.Name())
	}

	ctx := context.Background()
	results, err := hybrid.Retrieve(ctx, "test query", 5)
	if err != nil {
		t.Fatalf("Hybrid Retrieve failed: %v", err)
	}

	// 应该至少有2个结果（向量和关键词）
	if len(results) < 2 {
		t.Errorf("expected at least 2 results, got %d", len(results))
	}
}

func TestHybridRetrieverVectorOnlyError(t *testing.T) {
	mockVectorStore := &MockVectorStore{
		err: assertError("vector store error"),
	}
	mockKeywordStore := &MockVectorStore{
		vectors: []*VectorResult{
			{ID: "kw1", Content: "keyword result", Score: 0.85, Metadata: nil},
		},
	}

	vectorRetriever := NewBaseRetriever("vector", mockVectorStore)
	keywordRetriever := NewBaseRetriever("keyword", mockKeywordStore)

	hybrid := NewHybridRetriever(vectorRetriever, keywordRetriever)

	ctx := context.Background()
	results, err := hybrid.Retrieve(ctx, "test query", 5)
	if err != nil {
		t.Fatalf("Hybrid Retrieve failed unexpectedly: %v", err)
	}

	// 应该回退到keyword检索
	if len(results) != 1 {
		t.Errorf("expected 1 result (keyword fallback), got %d", len(results))
	}
}

func TestHybridRetrieverBothError(t *testing.T) {
	mockVectorStore := &MockVectorStore{
		err: assertError("vector store error"),
	}
	mockKeywordStore := &MockVectorStore{
		err: assertError("keyword store error"),
	}

	vectorRetriever := NewBaseRetriever("vector", mockVectorStore)
	keywordRetriever := NewBaseRetriever("keyword", mockKeywordStore)

	hybrid := NewHybridRetriever(vectorRetriever, keywordRetriever)

	ctx := context.Background()
	_, err := hybrid.Retrieve(ctx, "test query", 5)
	if err == nil {
		t.Error("expected error when both retrievers fail")
	}
}

func TestMergeResults(t *testing.T) {
	mockVectorStore := &MockVectorStore{
		vectors: []*VectorResult{
			{ID: "v1", Content: "vector 1", Score: 0.9, Metadata: nil},
			{ID: "v2", Content: "vector 2", Score: 0.8, Metadata: nil},
		},
	}
	mockKeywordStore := &MockVectorStore{
		vectors: []*VectorResult{
			{ID: "k1", Content: "keyword 1", Score: 0.85, Metadata: nil},
			{ID: "k2", Content: "keyword 2", Score: 0.75, Metadata: nil},
		},
	}

	vectorRetriever := NewBaseRetriever("vector", mockVectorStore)
	keywordRetriever := NewBaseRetriever("keyword", mockKeywordStore)

	hybrid := NewHybridRetriever(vectorRetriever, keywordRetriever)

	ctx := context.Background()
	results, err := hybrid.Retrieve(ctx, "test", 3)
	if err != nil {
		t.Fatalf("Retrieve failed: %v", err)
	}

	// 应该被限制在topK=3
	if len(results) > 3 {
		t.Errorf("expected at most 3 results, got %d", len(results)))
	}

	// 验证去重 - 不应该有重复ID
	seen := make(map[string]bool)
	for _, r := range results {
		if seen[r.ID] {
			t.Errorf("duplicate ID found: %s", r.ID)
		}
		seen[r.ID] = true
	}
}

func TestDocument(t *testing.T) {
	doc := &Document{
		ID:      "doc1",
		Content: "This is test content",
		Metadata: map[string]interface{}{
			"author": "test_author",
			"tags":   []string{"test", "sample"},
		},
	}

	if doc.ID != "doc1" {
		t.Errorf("expected ID 'doc1', got '%s'", doc.ID)
	}
	if doc.Content != "This is test content" {
		t.Errorf("expected content 'This is test content', got '%s'", doc.Content)
	}
	if doc.Metadata["author"] != "test_author" {
		t.Errorf("expected author 'test_author', got '%v'", doc.Metadata["author"])
	}
}

func TestSearchResult(t *testing.T) {
	result := &SearchResult{
		ID:          "result1",
		Content:     "search result content",
		Score:       0.95,
		Metadata:    map[string]interface{}{"source": "test"},
		RerankScore: 0.92,
	}

	if result.ID != "result1" {
		t.Errorf("expected ID 'result1', got '%s'", result.ID)
	}
	if result.Score != 0.95 {
		t.Errorf("expected Score 0.95, got %f", result.Score)
	}
	if result.RerankScore != 0.92 {
		t.Errorf("expected RerankScore 0.92, got %f", result.RerankScore)
	}
}

func TestVectorResult(t *testing.T) {
	result := &VectorResult{
		ID:       "vec1",
		Content:  "vector content",
		Score:    0.88,
		Metadata: nil,
	}

	if result.ID != "vec1" {
		t.Errorf("expected ID 'vec1', got '%s'", result.ID)
	}
	if result.Score != 0.88 {
		t.Errorf("expected Score 0.88, got %f", result.Score)
	}
}

// MockVectorStore 模拟向量存储
type MockVectorStore struct {
	vectors []*VectorResult
	err     error
}

func (m *MockVectorStore) Search(ctx context.Context, query string, topK int) ([]*VectorResult, error) {
	if m.err != nil {
		return nil, m.err
	}
	results := m.vectors
	if len(results) > topK {
		results = results[:topK]
	}
	return results, nil
}

func (m *MockVectorStore) Insert(ctx context.Context, doc *Document) error {
	if m.err != nil {
		return m.err
	}
	return nil
}

func (m *MockVectorStore) Delete(ctx context.Context, id string) error {
	if m.err != nil {
		return m.err
	}
	return nil
}

// assertError 创建测试用错误
func assertError(msg string) error {
	return &testError{msg: msg}
}

type testError struct {
	msg string
}

func (e *testError) Error() string {
	return e.msg
}
