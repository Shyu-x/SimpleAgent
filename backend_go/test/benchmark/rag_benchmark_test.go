package benchmark

import (
	"context"
	"math"
	"testing"
)

// BenchmarkCosineSimilarity 计算余弦相似度性能
func BenchmarkCosineSimilarity(b *testing.B) {
	a := generateVector(1536) // MiniMax embedding dimension
	bVec := generateVector(1536)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = cosineSim(a, bVec)
	}
}

// BenchmarkCosineSimilaritySmallVector 小向量余弦相似度
func BenchmarkCosineSimilaritySmallVector(b *testing.B) {
	a := generateVector(384)
	bVec := generateVector(384)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = cosineSim(a, bVec)
	}
}

// BenchmarkVectorSearch 模拟向量搜索
func BenchmarkVectorSearch(b *testing.B) {
	// 模拟10000个向量
	vectors := generateVectorDataset(10000, 1536)
	query := generateVector(1536)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		results := searchVectors(vectors, query, 10)
		_ = len(results)
	}
}

// BenchmarkVectorSearchLargeDataset 大规模向量搜索
func BenchmarkVectorSearchLargeDataset(b *testing.B) {
	vectors := generateVectorDataset(100000, 1536)
	query := generateVector(1536)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		results := searchVectors(vectors, query, 10)
		_ = len(results)
	}
}

// BenchmarkHybridSearch 混合搜索性能
func BenchmarkHybridSearch(b *testing.B) {
	vectorResults := generateSearchResults(100)
	keywordResults := generateSearchResults(100)
	query := "test query"
	topK := 10

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		results := hybridMerge(vectorResults, keywordResults, query, topK)
		_ = len(results)
	}
}

// BenchmarkRRFFusion RRF融合算法性能
func BenchmarkRRFFusion(b *testing.B) {
	vectorResults := generateSearchResults(100)
	keywordResults := generateSearchResults(100)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = rrfFusion(vectorResults, keywordResults)
	}
}

// BenchmarkSearchResultDeduplication 结果去重性能
func BenchmarkSearchResultDeduplication(b *testing.B) {
	results := generateSearchResultsWithDupes(500)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		deduped := deduplicateResults(results)
		_ = len(deduped)
	}
}

// BenchmarkTextChunking 文本分块性能
func BenchmarkTextChunking(b *testing.B) {
	text := generateLongText(10000) // 10000字符

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		chunks := chunkText(text, 512)
		_ = len(chunks)
	}
}

// BenchmarkQueryRewrite 查询改写性能
func BenchmarkQueryRewrite(b *testing.B) {
	queries := []string{
		"What is AI?",
		"Tell me about machine learning",
		"How does neural network work?",
		"What are the benefits of deep learning?",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, q := range queries {
			rewritten := rewriteQuery(q)
			_ = rewritten
		}
	}
}

// BenchmarkQueryDecomposition 查询分解性能
func BenchmarkQueryDecomposition(b *testing.B) {
	queries := []string{
		"What is AI and machine learning?",
		"Difference between supervised and unsupervised learning?",
		"How do CNNs and RNNs compare?",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, q := range queries {
			subqueries := decomposeQuery(q)
			_ = len(subqueries)
		}
	}
}

// BenchmarkDocumentIndexing 文档索引性能
func BenchmarkDocumentIndexing(b *testing.B) {
	docs := generateDocuments(100)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, doc := range docs {
			chunks := chunkText(doc.Content, 512)
			_ = len(chunks)
			// 模拟embedding
			_ = generateVector(1536)
		}
	}
}

// BenchmarkRAGPipeline 完整RAG流水线性能
func BenchmarkRAGPipeline(b *testing.B) {
	query := "What are the applications of AI in healthcare?"
	documents := generateDocuments(50)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// 1. Query rewrite
		rewritten := rewriteQuery(query)

		// 2. Decompose if complex
		subqueries := decomposeQuery(rewritten)

		// 3. Search each subquery
		var allResults []SearchResult
		for _, sq := range subqueries {
			results := generateSearchResults(10)
			allResults = append(allResults, results...)
		}

		// 4. Merge and rerank
		merged := deduplicateResults(allResults)
		reranked := rerankResults(merged, query)

		// 5. Take topK
		if len(reranked) > 5 {
			reranked = reranked[:5]
		}
		_ = len(reranked)
	}
}

// BenchmarkRAGPipelineConcurrent 并发RAG请求
func BenchmarkRAGPipelineConcurrent(b *testing.B) {
	queries := make([]string, 10)
	for i := range queries {
		queries[i] = "What is AI and how does it work?"
	}

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			for _, q := range queries {
				rewritten := rewriteQuery(q)
				results := generateSearchResults(5)
				reranked := rerankResults(results, rewritten)
				_ = len(reranked)
			}
		}
	})
}

// 辅助函数

type Vector []float32

type SearchResult struct {
	ID          string
	Content     string
	Score       float64
	RerankScore float64
}

func generateVector(dim int) Vector {
	v := make(Vector, dim)
	for i := 0; i < dim; i++ {
		v[i] = float32(i%256) / 256.0
	}
	return v
}

func generateVectorDataset(count, dim int) []Vector {
	vectors := make([]Vector, count)
	for i := 0; i < count; i++ {
		vectors[i] = generateVector(dim)
	}
	return vectors
}

func cosineSim(a, b Vector) float64 {
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

func searchVectors(vectors []Vector, query Vector, topK int) []Vector {
	// 简单计算余弦相似度并排序
	scores := make([]struct {
		index int
		score float64
	}, len(vectors))

	for i, v := range vectors {
		scores[i] = struct {
			index int
			score float64
		}{i, cosineSim(v, query)}
	}

	// 简单排序
	for i := 0; i < len(scores); i++ {
		for j := i + 1; j < len(scores); j++ {
			if scores[j].score > scores[i].score {
				scores[i], scores[j] = scores[j], scores[i]
			}
		}
	}

	if len(scores) < topK {
		topK = len(scores)
	}

	result := make([]Vector, topK)
	for i := 0; i < topK; i++ {
		result[i] = vectors[scores[i].index]
	}
	return result
}

func generateSearchResults(count int) []SearchResult {
	results := make([]SearchResult, count)
	for i := 0; i < count; i++ {
		results[i] = SearchResult{
			ID:          "doc-" + string(rune(i)),
			Content:     "Document content " + string(rune(i)),
			Score:       float64(i) / float64(count),
			RerankScore: float64(i) / float64(count),
		}
	}
	return results
}

func generateSearchResultsWithDupes(count int) []SearchResult {
	results := make([]SearchResult, count)
	for i := 0; i < count; i++ {
		// 制造一些重复
		id := i
		if i%10 == 0 {
			id = i - 1 // 与前面的重复
		}
		results[i] = SearchResult{
			ID:          "doc-" + string(rune(id)),
			Content:     "Content " + string(rune(i)),
			Score:       float64(i) / float64(count),
		}
	}
	return results
}

func hybridMerge(vector, keyword []SearchResult, query string, topK int) []SearchResult {
	// 简单RRF融合
	scoreMap := make(map[string]float64)
	const k = 60

	for i, r := range vector {
		rrfScore := 1.0 / float64(k+i+1)
		scoreMap[r.ID] += 0.7 * rrfScore
	}

	for i, r := range keyword {
		rrfScore := 1.0 / float64(k+i+1)
		scoreMap[r.ID] += 0.3 * rrfScore
	}

	// 合并并取topK
	var merged []SearchResult
	seen := make(map[string]bool)

	for _, r := range vector {
		if !seen[r.ID] {
			seen[r.ID] = true
			merged = append(merged, r)
		}
	}
	for _, r := range keyword {
		if !seen[r.ID] {
			seen[r.ID] = true
			merged = append(merged, r)
		}
	}

	if len(merged) > topK {
		merged = merged[:topK]
	}
	return merged
}

func rrfFusion(vector, keyword []SearchResult) map[string]float64 {
	scoreMap := make(map[string]float64)
	const k = 60

	for i, r := range vector {
		rrfScore := 1.0 / float64(k+i+1)
		scoreMap[r.ID] += 0.7 * rrfScore
	}

	for i, r := range keyword {
		rrfScore := 1.0 / float64(k+i+1)
		scoreMap[r.ID] += 0.3 * rrfScore
	}

	return scoreMap
}

func deduplicateResults(results []SearchResult) []SearchResult {
	seen := make(map[string]bool)
	var deduped []SearchResult

	for _, r := range results {
		if !seen[r.ID] {
			seen[r.ID] = true
			deduped = append(deduped, r)
		}
	}

	return deduped
}

func generateLongText(length int) string {
	const chars = "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 1234567890"
	text := make([]byte, length)
	for i := range text {
		text[i] = chars[i%len(chars)]
	}
	return string(text)
}

func chunkText(text string, chunkSize int) []string {
	var chunks []string
	for i := 0; i < len(text); i += chunkSize {
		end := i + chunkSize
		if end > len(text) {
			end = len(text)
		}
		chunks = append(chunks, text[i:end])
	}
	return chunks
}

func rewriteQuery(query string) string {
	// 简化模拟
	return query
}

func decomposeQuery(query string) []string {
	// 简化模拟 - 按空格分割
	var subqueries []string
	words := 0
	current := ""

	for _, c := range query {
		if c == ' ' {
			words++
			if words > 3 {
				subqueries = append(subqueries, current)
				current = ""
				words = 1
			}
		}
		current += string(c)
	}
	if current != "" {
		subqueries = append(subqueries, current)
	}

	if len(subqueries) == 0 {
		return []string{query}
	}
	return subqueries
}

func rerankResults(results []SearchResult, query string) []SearchResult {
	// 简化模拟 - 按分数排序
	for i := 0; i < len(results); i++ {
		for j := i + 1; j < len(results); j++ {
			if results[j].Score > results[i].Score {
				results[i], results[j] = results[j], results[i]
			}
		}
	}
	return results
}

type Document struct {
	ID      string
	Content string
}

func generateDocuments(count int) []Document {
	docs := make([]Document, count)
	for i := 0; i < count; i++ {
		docs[i] = Document{
			ID:      "doc-" + string(rune(i)),
			Content: generateLongText(1000),
		}
	}
	return docs
}

// 保持现有测试函数兼容性
func CosineSimilarity(a, b []float32) float64 {
	return cosineSim(a, b)
}
