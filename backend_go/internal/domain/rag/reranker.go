package rag

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// Reranker 重排序器接口
type Reranker interface {
	// Rerank 重排序
	Rerank(ctx context.Context, query string, results []*SearchResult) ([]*SearchResult, error)
	// Name 获取名称
	Name() string
}

// RerankConfig 重排序配置
type RerankConfig struct {
	TopN          int           // 返回前N个
	Strategy     RerankStrategy // 策略
}

// RerankStrategy 重排序策略
type RerankStrategy int

const (
	StrategyCrossEncoder RerankStrategy = iota
	StrategyBM25
	StrategySemantic
	StrategyDiversity
	StrategyLLM // LLM重排序
)

// DefaultReranker 默认重排序器
type DefaultReranker struct {
	strategy RerankStrategy
	model    ModelClient
}

// NewDefaultReranker 创建默认重排序器
func NewDefaultReranker(strategy RerankStrategy, model ModelClient) *DefaultReranker {
	return &DefaultReranker{
		strategy: strategy,
		model:    model,
	}
}

// Rerank 重排序
func (r *DefaultReranker) Rerank(ctx context.Context, query string, results []*SearchResult) ([]*SearchResult, error) {
	if len(results) == 0 {
		return results, nil
	}

	switch r.strategy {
	case StrategyCrossEncoder:
		return r.crossEncoderRerank(ctx, query, results)
	case StrategyBM25:
		return r.bm25Rerank(ctx, query, results)
	case StrategySemantic:
		return r.semanticRerank(ctx, query, results)
	case StrategyDiversity:
		return r.diversityRerank(ctx, query, results)
	case StrategyLLM:
		return r.llmRerank(ctx, query, results)
	default:
		return results, nil
	}
}

// Name 获取名称
func (r *DefaultReranker) Name() string {
	switch r.strategy {
	case StrategyCrossEncoder:
		return "cross_encoder"
	case StrategyBM25:
		return "bm25"
	case StrategySemantic:
		return "semantic"
	case StrategyDiversity:
		return "diversity"
	case StrategyLLM:
		return "llm_rerank"
	default:
		return "unknown"
	}
}

// llmRerank LLM重排序
func (r *DefaultReranker) llmRerank(ctx context.Context, query string, results []*SearchResult) ([]*SearchResult, error) {
	if r.model == nil {
		// 没有LLM客户端，降级到语义重排序
		return r.semanticRerank(ctx, query, results)
	}

	// 构建提示
	docsStr := buildDocsForRerank(results)
	prompt := fmt.Sprintf(`你是一个文档重排序专家。请评估每个文档与查询的相关性，并给出相关性分数。

## 查询
%s

## 文档列表
%s

## 评分标准
- 9分：完全相关，直接回答查询
- 7-8分：高度相关，包含查询的关键信息
- 4-6分：中等相关，部分信息相关
- 1-3分：低相关，只有少量相关信息
- 0分：不相关

## 返回格式
返回一个JSON数组，按相关性分数排序：
[
  {"id": "文档ID1", "score": 9, "reason": "原因"},
  {"id": "文档ID2", "score": 6, "reason": "原因"}
]

只返回JSON数组，不要其他内容。`, query, docsStr)

	resp, err := r.model.Chat(ctx, []Message{
		{Role: "system", Content: "你是一个JSON生成助手，只返回有效的JSON数组，不要其他内容。"},
		{Role: "user", Content: prompt},
	}, "MiniMax-M2.7", &ChatOptions{Temperature: 0.1, MaxTokens: 1500})

	if err != nil {
		// LLM调用失败，降级到语义重排序
		return r.semanticRerank(ctx, query, results)
	}

	content := ""
	if len(resp.Content) > 0 {
		content = resp.Content[0].Text
	}

	// 解析响应
	scores := parseRerankResponse(content)
	if scores == nil || len(scores) == 0 {
		// 解析失败，降级
		return r.semanticRerank(ctx, query, results)
	}

	// 应用分数
	scoreMap := make(map[string]float64)
	for _, s := range scores {
		scoreMap[s.ID] = s.Score
	}

	for _, result := range results {
		if score, ok := scoreMap[result.ID]; ok {
			result.RerankScore = score / 10.0 // 转换为0-1分数
		} else {
			result.RerankScore = 0
		}
	}

	// 按分数排序
	sort.Slice(results, func(i, j int) bool {
		return results[i].RerankScore > results[j].RerankScore
	})

	return results, nil
}

// RerankScoreItem 重排序分数项
type RerankScoreItem struct {
	ID     string
	Score  float64
	Reason string
}

// buildDocsForRerank 构建用于重排序的文档字符串
func buildDocsForRerank(results []*SearchResult) string {
	var sb strings.Builder
	for i, r := range results {
		if i >= 20 {
			break // 限制文档数量
		}
		content := r.Content
		if len(content) > 500 {
			content = content[:500] + "..."
		}
		sb.WriteString(fmt.Sprintf("[%d] ID: %s\n内容: %s\n\n", i+1, r.ID, content))
	}
	return sb.String()
}

// parseRerankResponse 解析重排序响应
func parseRerankResponse(content string) []RerankScoreItem {
	content = strings.TrimSpace(content)

	// 提取JSON数组
	re := regexp.MustCompile(`\[[\s\S]*\]`)
	matches := re.FindString(content)
	if matches == "" {
		return nil
	}

	var items []RerankScoreItem
	if err := json.Unmarshal([]byte(matches), &items); err != nil {
		return nil
	}

	return items
}

// crossEncoderRerank CrossEncoder重排序
func (r *DefaultReranker) crossEncoderRerank(ctx context.Context, query string, results []*SearchResult) ([]*SearchResult, error) {
	// 使用关键词匹配度作为CrossEncoder的近似
	for _, result := range results {
		result.RerankScore = r.keywordMatchScore(query, result.Content)
	}

	// 排序
	sort.Slice(results, func(i, j int) bool {
		return results[i].RerankScore > results[j].RerankScore
	})

	return results, nil
}

// bm25Rerank BM25重排序
func (r *DefaultReranker) bm25Rerank(ctx context.Context, query string, results []*SearchResult) ([]*SearchResult, error) {
	docFreq := make(map[string]int)
	queryWords := tokenize(query)

	for _, result := range results {
		docWords := tokenize(result.Content)
		for _, word := range queryWords {
			if containsWord(docWords, word) {
				docFreq[word]++
			}
		}
	}

	N := float64(len(results))
	for _, result := range results {
		docWords := tokenize(result.Content)
		var score float64
		for _, word := range queryWords {
			if containsWord(docWords, word) {
				df := float64(docFreq[word])
				if df > 0 {
					score += 1.0 / df * N
				}
			}
		}
		result.RerankScore = score
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].RerankScore > results[j].RerankScore
	})

	return results, nil
}

// semanticRerank 语义重排序
func (r *DefaultReranker) semanticRerank(ctx context.Context, query string, results []*SearchResult) ([]*SearchResult, error) {
	for i, result := range results {
		keywordScore := r.keywordMatchScore(query, result.Content)
		// 位置越靠前分数越高
		positionScore := 1.0 / float64(i+1)
		result.RerankScore = keywordScore*0.7 + positionScore*0.3
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].RerankScore > results[j].RerankScore
	})

	return results, nil
}

// diversityRerank 多样性重排序
func (r *DefaultReranker) diversityRerank(ctx context.Context, query string, results []*SearchResult) ([]*SearchResult, error) {
	if len(results) <= 1 {
		return results, nil
	}

	// MMR(Maximal Marginal Relevance)风格的多样性重排序
	var reranked []*SearchResult
	var remaining = make([]*SearchResult, len(results))
	copy(remaining, results)

	lambda := 0.5 // 相关性和多样性的权重比例

	for len(reranked) < len(results) && len(remaining) > 0 {
		var best *SearchResult
		bestIdx := -1

		for i, candidate := range remaining {
			// 计算相关性分数（使用已有的RerankScore）
			relevance := candidate.RerankScore

			// 计算与已选结果的最大相似度（惩罚重复内容）
			var maxSimilarity float64
			for _, selected := range reranked {
				sim := r.contentSimilarity(candidate.Content, selected.Content)
				if sim > maxSimilarity {
					maxSimilarity = sim
				}
			}

			// MMR分数
			mmrScore := lambda*relevance - (1-lambda)*maxSimilarity

			if best == nil || mmrScore > best.RerankScore {
				best = candidate
				bestIdx = i
			}
		}

		if best != nil {
			reranked = append(reranked, best)
			remaining = append(remaining[:bestIdx], remaining[bestIdx+1:]...)
		}
	}

	// 更新RerankScore为MMR分数
	for i := range reranked {
		reranked[i].RerankScore = float64(len(reranked) - i)
	}

	return reranked, nil
}

// keywordMatchScore 关键词匹配分数
func (r *DefaultReranker) keywordMatchScore(query, content string) float64 {
	queryWords := tokenize(query)
	contentWords := tokenize(content)

	if len(queryWords) == 0 {
		return 0
	}

	matchCount := 0
	for _, qw := range queryWords {
		if containsWord(contentWords, qw) {
			matchCount++
		}
	}

	return float64(matchCount) / float64(len(queryWords))
}

// contentSimilarity 内容相似度
func (r *DefaultReranker) contentSimilarity(a, b string) float64 {
	aWords := tokenize(a)
	bWords := tokenize(b)

	if len(aWords) == 0 || len(bWords) == 0 {
		return 0
	}

	matchCount := 0
	for _, aw := range aWords {
		if containsWord(bWords, aw) {
			matchCount++
		}
	}

	// Jaccard相似度
	return float64(matchCount) / float64(len(aWords)+len(bWords)-matchCount)
}

// tokenize 分词（简单实现）
func tokenize(text string) []string {
	var words []string
	var current []byte

	for i := 0; i < len(text); i++ {
		c := text[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' {
			current = append(current, c)
		} else if len(current) > 0 {
			words = append(words, string(current))
			current = nil
		}
	}

	if len(current) > 0 {
		words = append(words, string(current))
	}

	return words
}

// containsWord 检查是否包含单词
func containsWord(words []string, word string) bool {
	for _, w := range words {
		if w == word {
			return true
		}
	}
	return false
}

// MultiStrategyReranker 多策略重排序器
type MultiStrategyReranker struct {
	rerankers []Reranker
}

// NewMultiStrategyReranker 创建多策略重排序器
func NewMultiStrategyReranker(rerankers []Reranker) *MultiStrategyReranker {
	return &MultiStrategyReranker{rerankers: rerankers}
}

// Rerank 依次应用多个重排序策略
func (m *MultiStrategyReranker) Rerank(ctx context.Context, query string, results []*SearchResult) ([]*SearchResult, error) {
	var err error
	for _, reranker := range m.rerankers {
		results, err = reranker.Rerank(ctx, query, results)
		if err != nil {
			return results, err
		}
	}
	return results, nil
}

// Name 获取名称
func (m *MultiStrategyReranker) Name() string {
	return "multi_strategy"
}

// HybridReranker 混合重排序器（组合多种策略）
type HybridReranker struct {
	strategies []RerankStrategy
	model      ModelClient
	weights    []float64
}

// NewHybridReranker 创建混合重排序器
func NewHybridReranker(strategies []RerankStrategy, model ModelClient, weights []float64) *HybridReranker {
	// 默认权重均匀分布
	if weights == nil {
		weights = make([]float64, len(strategies))
		for i := range weights {
			weights[i] = 1.0 / float64(len(strategies))
		}
	}

	return &HybridReranker{
		strategies: strategies,
		model:      model,
		weights:    weights,
	}
}

// Rerank 执行混合重排序
func (h *HybridReranker) Rerank(ctx context.Context, query string, results []*SearchResult) ([]*SearchResult, error) {
	if len(results) == 0 || len(h.strategies) == 0 {
		return results, nil
	}

	// 创建临时reranker进行各策略评分
	var allScores []map[string]float64
	for _, strategy := range h.strategies {
		reranker := &DefaultReranker{strategy: strategy, model: h.model}
		// 深拷贝结果避免污染
		copied := make([]*SearchResult, len(results))
		for i := range results {
			copied[i] = &SearchResult{
				ID:          results[i].ID,
				Content:     results[i].Content,
				Score:       results[i].Score,
				Metadata:    results[i].Metadata,
				RerankScore: results[i].Score,
			}
		}
		reranked, err := reranker.Rerank(ctx, query, copied)
		if err != nil {
			continue
		}
		scoreMap := make(map[string]float64)
		for i, r := range reranked {
			// 归一化分数
			scoreMap[r.ID] = 1.0 - float64(i)/float64(len(reranked))
		}
		allScores = append(allScores, scoreMap)
	}

	if len(allScores) == 0 {
		return results, nil
	}

	// 计算加权分数
	finalScores := make(map[string]float64)
	for i, scores := range allScores {
		weight := h.weights[i]
		for id, score := range scores {
			finalScores[id] += weight * score
		}
	}

	// 应用分数并排序
	for _, result := range results {
		if score, ok := finalScores[result.ID]; ok {
			result.RerankScore = score
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].RerankScore > results[j].RerankScore
	})

	return results, nil
}

// Name 获取名称
func (h *HybridReranker) Name() string {
	return "hybrid"
}

// LLM Reranker 专用配置
type LLMReRankConfig struct {
	Model         string
	TopN          int
	Temperature   float64
	MaxTokens     int
	PromptTemplate string
}

// NewLLMRerankerConfig 创建LLM重排序配置
func NewLLMRerankerConfig() *LLMReRankConfig {
	return &LLMReRankConfig{
		Model:       "MiniMax-M2.7",
		TopN:        10,
		Temperature: 0.1,
		MaxTokens:   1500,
	}
}
