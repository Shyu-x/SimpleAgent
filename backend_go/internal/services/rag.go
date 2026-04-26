/**
 * RAG Service - 检索增强生成服务
 *
 * 企业级设计：
 * - Query重写：利用LLM补全上下文、语义扩展
 * - Query拆分：复杂问题分解为多个子问题
 * - 多路检索：向量检索 + 关键词检索并行
 * - RRF融合排序：多检索结果融合
 * - 结果去重：去除重复或高度相似的文档
 * - 引用组装：生成带引用的答案
 */

package services

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ai-chat/backend_go/internal/domain/rag"
	"github.com/ai-chat/backend_go/internal/infra/vector"
)

// RAGConfig RAG服务配置
type RAGConfig struct {
	// 检索配置
	ChunkSize       int
	TopK            int
	RerankEnabled   bool
	RerankTopN      int

	// 多路检索权重
	VectorWeight    float64
	KeywordWeight   float64

	// RRF配置
	RRFK            int // RRF融合参数

	// 去重配置
	DedupeEnabled   bool
	DedupeThreshold float64

	// 引用配置
	CitationEnabled bool
	MaxCitationLen  int

	// 检索通道配置
	VectorTopK      int
	KeywordTopK     int

	// LLM重排序
	LLMRerankEnabled bool
}

// DefaultRAGConfig 默认配置
func DefaultRAGConfig() *RAGConfig {
	return &RAGConfig{
		ChunkSize:       512,
		TopK:            5,
		RerankEnabled:   true,
		RerankTopN:      10,

		VectorWeight:    0.7,
		KeywordWeight:   0.3,

		RRFK:            60,

		DedupeEnabled:   true,
		DedupeThreshold: 0.85,

		CitationEnabled: true,
		MaxCitationLen:  200,

		VectorTopK:      20,
		KeywordTopK:     20,

		LLMRerankEnabled: false,
	}
}

// RAGQuery RAG查询
type RAGQuery struct {
	Query      string
	History    []rag.Message
	TopK       int
	Filter     map[string]interface{}
}

// RAGResult RAG结果
type RAGResult struct {
	Answer       string
	Results      []*rag.SearchResult
	Citations    []Citation
	QueryRewrite *rag.RewriteResult
	Stats        RAGStats
}

// Citation 引用
type Citation struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	Score     float64 `json:"score"`
	StartIdx  int    `json:"start_idx"`
	EndIdx    int    `json:"end_idx"`
}

// RAGStats RAG统计
type RAGStats struct {
	QueryRewriteLatencyMs  int64
	QueryDecomposeLatencyMs int64
	VectorSearchLatencyMs  int64
	KeywordSearchLatencyMs int64
	RerankLatencyMs        int64
	DedupeLatencyMs        int64
	TotalLatencyMs         int64
	TotalTokensUsed        int
	ResultsCount           int
}

// RAGService RAG服务
type RAGService struct {
	config         *RAGConfig
	vectorStore    vector.VectorStore
	embeddingSvc   *EmbeddingService
	queryRewriter  *rag.QueryRewriteService
	queryDecomposer *rag.QueryDecomposeService
	reranker       rag.Reranker
	llmClient      rag.ModelClient
}

// NewRAGService 创建RAG服务
func NewRAGService(
	vectorStore vector.VectorStore,
	embeddingSvc *EmbeddingService,
	llmClient rag.ModelClient,
	config *RAGConfig,
) *RAGService {
	if config == nil {
		config = DefaultRAGConfig()
	}

	svc := &RAGService{
		config:       config,
		vectorStore:  vectorStore,
		embeddingSvc: embeddingSvc,
		llmClient:    llmClient,
	}

	// 初始化Query重写服务
	if llmClient != nil {
		svc.queryRewriter = rag.NewQueryRewriteService(llmClient, &rag.RewriteServiceOptions{
			DefaultModel:            "MiniMax-M2.7",
			EnableContextCompletion: true,
			EnableSemanticExpansion: true,
			MaxHistoryMessages:      10,
			ConfidenceThreshold:     0.5,
		})
	}

	return svc
}

// Query 执行RAG查询
func (s *RAGService) Query(ctx context.Context, query *RAGQuery) (*RAGResult, error) {
	startTime := time.Now()
	stats := RAGStats{}

	// 1. Query重写
	var rewriteResult *rag.RewriteResult
	if s.queryRewriter != nil {
		rewriteStart := time.Now()
		result, err := s.queryRewriter.Rewrite(ctx, query.Query, query.History)
		rewriteResult = result
		stats.QueryRewriteLatencyMs = time.Since(rewriteStart).Milliseconds()
		if err != nil {
			// 重写失败不影响主流程
			rewriteResult = nil
		}
	}

	// 使用重写后的查询
	searchQuery := query.Query
	if rewriteResult != nil && rewriteResult.Rewritten != "" {
		searchQuery = rewriteResult.Rewritten
	}

	// 2. 多路检索
	topK := query.TopK
	if topK <= 0 {
		topK = s.config.TopK
	}

	vectorResults, keywordResults, searchLatencies := s.multiChannelSearch(ctx, searchQuery, topK)
	stats.VectorSearchLatencyMs = searchLatencies.vector
	stats.KeywordSearchLatencyMs = searchLatencies.keyword

	// 3. RRF融合
	fusedResults := s.rrfFusion(vectorResults, keywordResults, topK)
	stats.ResultsCount = len(fusedResults)

	// 4. 去重
	if s.config.DedupeEnabled && len(fusedResults) > 0 {
		dedupeStart := time.Now()
		fusedResults = s.deduplicate(fusedResults)
		stats.DedupeLatencyMs = time.Since(dedupeStart).Milliseconds()
	}

	// 5. 重排序
	var rerankLatency int64
	if s.config.RerankEnabled && len(fusedResults) > 0 && s.reranker != nil {
		rerankStart := time.Now()
		reranked, err := s.reranker.Rerank(ctx, searchQuery, fusedResults)
		if err == nil && len(reranked) > 0 {
			fusedResults = reranked
		}
		rerankLatency = time.Since(rerankStart).Milliseconds()
		stats.RerankLatencyMs = rerankLatency
	}

	// 限制返回数量
	if len(fusedResults) > topK {
		fusedResults = fusedResults[:topK]
	}

	stats.TotalLatencyMs = time.Since(startTime).Milliseconds()

	return &RAGResult{
		Answer:       "", // 答案由调用方生成
		Results:      fusedResults,
		Citations:    s.extractCitations(fusedResults),
		QueryRewrite: rewriteResult,
		Stats:        stats,
	}, nil
}

// QueryWithDecompose 带问题拆分的RAG查询
func (s *RAGService) QueryWithDecompose(ctx context.Context, query *RAGQuery) (*RAGResult, error) {
	startTime := time.Now()
	stats := RAGStats{}

	// 1. Query重写（带拆分）
	var rewriteResult *rag.RewriteWithSplitResult
	if s.queryRewriter != nil {
		rewriteStart := time.Now()
		result, err := s.queryRewriter.RewriteWithSplit(ctx, query.Query, query.History)
		rewriteResult = result
		stats.QueryRewriteLatencyMs = time.Since(rewriteStart).Milliseconds()
		if err != nil {
			rewriteResult = nil
		}
	}

	// 如果有子问题，并行检索
	var allResults []*rag.SearchResult
	if rewriteResult != nil && rewriteResult.ShouldSplit && len(rewriteResult.SubQuestions) > 0 {
		subResults := s.searchSubQuestions(ctx, rewriteResult.SubQuestions)
		allResults = s.mergeSubQuestionResults(subResults)
	} else {
		// 单查询
		searchQuery := query.Query
		if rewriteResult != nil && rewriteResult.Rewritten != "" {
			searchQuery = rewriteResult.Rewritten
		}

		topK := query.TopK
		if topK <= 0 {
			topK = s.config.TopK
		}

		vectorResults, keywordResults, _ := s.multiChannelSearch(ctx, searchQuery, topK)
		allResults = s.rrfFusion(vectorResults, keywordResults, topK)
	}

	// 去重
	if s.config.DedupeEnabled && len(allResults) > 0 {
		allResults = s.deduplicate(allResults)
	}

	// 重排序
	if s.config.RerankEnabled && len(allResults) > 0 && s.reranker != nil {
		reranked, _ := s.reranker.Rerank(ctx, query.Query, allResults)
		if len(reranked) > 0 {
			allResults = reranked
		}
	}

	stats.TotalLatencyMs = time.Since(startTime).Milliseconds()
	stats.ResultsCount = len(allResults)

	return &RAGResult{
		Results: allResults,
		Stats:   stats,
	}, nil
}

// searchSubQuestions 并行检索子问题
func (s *RAGService) searchSubQuestions(ctx context.Context, subQuestions []rag.SubQuestionRef) map[string][]*rag.SearchResult {
	results := make(map[string][]*rag.SearchResult)
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, sq := range subQuestions {
		wg.Add(1)
		go func(question string, id string) {
			defer wg.Done()

			embedding, err := s.embeddingSvc.Embed(ctx, question)
			if err != nil || embedding.Error != nil {
				return
			}

			searchResults, err := s.vectorStore.Search(ctx, embedding.Embedding, s.config.VectorTopK, nil)
			if err != nil {
				return
			}

			ragResults := make([]*rag.SearchResult, len(searchResults))
			for i, r := range searchResults {
				ragResults[i] = &rag.SearchResult{
					ID:          r.ID,
					Content:     r.Content,
					Score:       r.Score,
					Metadata:    r.Metadata,
					RerankScore: r.Score,
				}
			}

			mu.Lock()
			results[id] = ragResults
			mu.Unlock()
		}(sq.Question, sq.ID)
	}

	wg.Wait()
	return results
}

// mergeSubQuestionResults 合并子问题检索结果
func (s *RAGService) mergeSubQuestionResults(subResults map[string][]*rag.SearchResult) []*rag.SearchResult {
	scoreMap := make(map[string]*rag.SearchResult)
	docScores := make(map[string]float64)

	for _, results := range subResults {
		for i, r := range results {
			if _, exists := scoreMap[r.ID]; !exists {
				scoreMap[r.ID] = r
			}
			// 使用RRF计算综合分数
			rrfScore := 1.0 / float64(s.config.RRFK+i+1)
			docScores[r.ID] += r.Score * rrfScore * 0.5 // 子问题权重0.5
		}
	}

	// 转换为列表并排序
	var merged []*rag.SearchResult
	for _, r := range scoreMap {
		r.Score = docScores[r.ID]
		r.RerankScore = docScores[r.ID]
		merged = append(merged, r)
	}

	sort.Slice(merged, func(i, j int) bool {
		return merged[i].Score > merged[j].Score
	})

	return merged
}

// multiChannelSearch 多路检索
func (s *RAGService) multiChannelSearch(ctx context.Context, query string, topK int) ([]*rag.SearchResult, []*rag.SearchResult, struct {
	vector   int64
	keyword  int64
}) {
	var vectorResults []*rag.SearchResult
	var keywordResults []*rag.SearchResult
	var latencies struct {
		vector   int64
		keyword  int64
	}
	var wg sync.WaitGroup
	var mu sync.Mutex

	wg.Add(2)

	// 向量检索
	go func() {
		defer wg.Done()
		start := time.Now()

		embedding, err := s.embeddingSvc.Embed(ctx, query)
		if err != nil || embedding.Error != nil || embedding.Embedding == nil {
			mu.Lock()
			latencies.vector = time.Since(start).Milliseconds()
			mu.Unlock()
			return
		}

		searchResults, err := s.vectorStore.Search(ctx, embedding.Embedding, s.config.VectorTopK, nil)
		if err != nil {
			mu.Lock()
			latencies.vector = time.Since(start).Milliseconds()
			mu.Unlock()
			return
		}

		vectorResults = make([]*rag.SearchResult, len(searchResults))
		for i, r := range searchResults {
			vectorResults[i] = &rag.SearchResult{
				ID:          r.ID,
				Content:     r.Content,
				Score:       r.Score,
				Metadata:    r.Metadata,
				RerankScore: r.Score,
			}
		}

		mu.Lock()
		latencies.vector = time.Since(start).Milliseconds()
		mu.Unlock()
	}()

	// 关键词检索（这里简化处理，实际应该使用搜索引擎）
	go func() {
		defer wg.Done()
		start := time.Now()

		// TODO: 实现关键词检索通道
		// 目前简单返回空结果
		searchResults, err := s.keywordSearch(ctx, query, s.config.KeywordTopK)
		if err != nil {
			mu.Lock()
			latencies.keyword = time.Since(start).Milliseconds()
			mu.Unlock()
			return
		}

		keywordResults = make([]*rag.SearchResult, len(searchResults))
		for i, r := range searchResults {
			keywordResults[i] = &rag.SearchResult{
				ID:          r.ID,
				Content:     r.Content,
				Score:       r.Score,
				Metadata:    r.Metadata,
				RerankScore: r.Score,
			}
		}

		mu.Lock()
		latencies.keyword = time.Since(start).Milliseconds()
		mu.Unlock()
	}()

	wg.Wait()
	return vectorResults, keywordResults, latencies
}

// keywordSearch 关键词搜索
func (s *RAGService) keywordSearch(ctx context.Context, query string, topK int) ([]*rag.SearchResult, error) {
	// TODO: 实现基于关键词的搜索
	// 可以使用全文索引或BM25算法
	return []*rag.SearchResult{}, nil
}

// rrfFusion RRF融合算法
func (s *RAGService) rrfFusion(vectorResults, keywordResults []*rag.SearchResult, topK int) []*rag.SearchResult {
	if len(vectorResults) == 0 && len(keywordResults) == 0 {
		return []*rag.SearchResult{}
	}

	scoreMap := make(map[string]*rag.SearchResult)
	docScores := make(map[string]float64)

	// 向量检索结果评分
	for i, r := range vectorResults {
		rrfScore := 1.0 / float64(s.config.RRFK+i+1)
		docScores[r.ID] += s.config.VectorWeight * rrfScore
		if _, exists := scoreMap[r.ID]; !exists {
			scoreMap[r.ID] = r
		}
	}

	// 关键词检索结果评分
	for i, r := range keywordResults {
		rrfScore := 1.0 / float64(s.config.RRFK+i+1)
		docScores[r.ID] += s.config.KeywordWeight * rrfScore
		if _, exists := scoreMap[r.ID]; !exists {
			scoreMap[r.ID] = r
		}
	}

	// 构建融合后的结果
	var fused []*rag.SearchResult
	for id, r := range scoreMap {
		r.Score = docScores[id]
		r.RerankScore = docScores[id]
		fused = append(fused, r)
	}

	// 按分数排序
	sort.Slice(fused, func(i, j int) bool {
		return fused[i].Score > fused[j].Score
	})

	if len(fused) > topK {
		fused = fused[:topK]
	}

	return fused
}

// deduplicate 去重
func (s *RAGService) deduplicate(results []*rag.SearchResult) []*rag.SearchResult {
	if len(results) <= 1 {
		return results
	}

	var deduplicated []*rag.SearchResult

	for _, r := range results {
		isDupe := false
		for _, existing := range deduplicated {
			// 使用简单的相似度判断
			sim := s.contentSimilarity(r.Content, existing.Content)
			if sim > s.config.DedupeThreshold {
				isDupe = true
				// 保留分数高的
				if r.Score > existing.Score {
					existing.Score = r.Score
					existing.RerankScore = r.RerankScore
				}
				break
			}
		}
		if !isDupe {
			deduplicated = append(deduplicated, r)
		}
	}

	return deduplicated
}

// contentSimilarity 计算内容相似度
func (s *RAGService) contentSimilarity(a, b string) float64 {
	// 简单的字符级Jaccard相似度
	if len(a) == 0 || len(b) == 0 {
		return 0
	}

	// 转换为词集合
	aWords := strings.Fields(strings.ToLower(a))
	bWords := strings.Fields(strings.ToLower(b))

	if len(aWords) == 0 || len(bWords) == 0 {
		return 0
	}

	// 计算Jaccard相似度
	aSet := make(map[string]bool)
	for _, w := range aWords {
		aSet[w] = true
	}

	intersection := 0
	for _, w := range bWords {
		if aSet[w] {
			intersection++
		}
	}

	union := len(aWords) + len(bWords) - intersection
	if union == 0 {
		return 0
	}

	return float64(intersection) / float64(union)
}

// extractCitations 提取引用
func (s *RAGService) extractCitations(results []*rag.SearchResult) []Citation {
	if !s.config.CitationEnabled || len(results) == 0 {
		return []Citation{}
	}

	var citations []Citation
	for _, r := range results {
		content := r.Content
		if len(content) > s.config.MaxCitationLen {
			content = content[:s.config.MaxCitationLen] + "..."
		}

		citations = append(citations, Citation{
			ID:      r.ID,
			Content: content,
			Score:   r.Score,
		})
	}

	return citations
}

// GenerateAnswer 生成带引用的答案
func (s *RAGService) GenerateAnswer(ctx context.Context, query string, results *RAGResult) (string, error) {
	if results == nil || len(results.Results) == 0 {
		return "抱歉，没有找到相关的文档来回答您的问题。", nil
	}

	// 构建上下文
	var contextBuilder strings.Builder
	for i, r := range results.Results {
		contextBuilder.WriteString(fmt.Sprintf("[%d] %s\n\n", i+1, r.Content))
	}

	prompt := fmt.Sprintf(`你是一个RAG助手。请根据以下检索到的文档内容回答用户的问题。

## 用户问题
%s

## 检索到的文档
%s

## 要求
1. 仅根据提供的文档内容回答问题
2. 如果文档中有相关内容，引用相关片段
3. 如果文档中没有相关内容，直接说明无法回答
4. 保持答案简洁、准确
5. 在答案中标注引用的文档编号，如：[1]、[2]

## 返回格式
直接返回答案内容即可`, query, contextBuilder.String())

	// 调用LLM生成答案
	resp, err := s.llmClient.Chat(ctx, []rag.Message{
		{Role: "system", Content: "你是一个有帮助的助手，基于给定的文档回答问题。"},
		{Role: "user", Content: prompt},
	}, "MiniMax-M2.7", &rag.ChatOptions{Temperature: 0.3, MaxTokens: 1000})

	if err != nil {
		return "", fmt.Errorf("failed to generate answer: %w", err)
	}

	if len(resp.Content) == 0 {
		return "抱歉，生成答案时出现错误。", nil
	}

	return resp.Content[0].Text, nil
}

// GetConfig 获取配置
func (s *RAGService) GetConfig() *RAGConfig {
	return s.config
}

// UpdateConfig 更新配置
func (s *RAGService) UpdateConfig(config *RAGConfig) {
	if config != nil {
		s.config = config
	}
}
