/**
 * QueryRewriteService - 问题重写/补全上下文服务
 *
 * 企业级设计：
 * - 补全上下文：利用会话历史恢复省略信息（代词、缩写等）
 * - 省略信息恢复：从上文中推断缺失的主语、宾语、时态
 * - 语义增强：对模糊查询进行语义扩展，提高检索召回率
 * - 问题拆分：支持复杂问题拆分为多个子问题
 *
 * 使用场景：
 * - 用户说"它的缺点是什么" -> 需要从上文推断"它"指代什么
 * - 用户说"继续" -> 需要补充为完整操作指令
 * - 用户说"更便宜" -> 需要语义扩展为"价格更低、性价比更高"等
 */

package rag

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"
	"time"
)

// 重写类型枚举
type RewriteType string

const (
	RewriteTypeContextualCompletion RewriteType = "contextual_completion" // 上下文补全
	RewriteTypeSemanticExpansion    RewriteType = "semantic_expansion"    // 语义扩展
	RewriteTypeIntentPreservation   RewriteType = "intent_preservation"   // 意图保持
	RewriteTypeDisambiguation       RewriteType = "disambiguation"       // 歧义消除
	RewriteTypeWithSplit            RewriteType = "with_split"            // 带拆分的问题改写
)

// 置信度阈值
const (
	ConfidenceHigh   = 0.8
	ConfidenceMedium = 0.5
	ConfidenceLow    = 0.3
)

// RewriteResult 重写结果
type RewriteResult struct {
	Rewritten  string      `json:"rewritten"`  // 重写后的查询
	Type       RewriteType `json:"type"`       // 重写类型
	Confidence float64     `json:"confidence"` // 置信度
	Changes    []string    `json:"changes"`    // 变更描述
	Original   string      `json:"original"`   // 原始查询
	Timestamp  int64       `json:"timestamp"`   // 时间戳
	Error      string      `json:"error,omitempty"`
}

// RewriteWithSplitResult 带拆分的问题改写结果
type RewriteWithSplitResult struct {
	Rewritten      string           `json:"rewritten"`      // 主查询改写结果
	SubQuestions   []SubQuestionRef `json:"subQuestions"`   // 拆分后的子问题
	Type           RewriteType      `json:"type"`          // 重写类型
	Confidence     float64          `json:"confidence"`    // 置信度
	Changes        []string         `json:"changes"`       // 变更描述
	Original       string           `json:"original"`      // 原始查询
	ShouldSplit    bool             `json:"shouldSplit"`   // 是否应该拆分
	DecomposeType  DecomposeType    `json:"decomposeType"` // 拆分类型
	Timestamp      int64            `json:"timestamp"`     // 时间戳
	Error          string           `json:"error,omitempty"`
}

// SubQuestionRef 子问题引用
type SubQuestionRef struct {
	ID        string   `json:"id"`        // 子问题ID
	Question  string   `json:"question"`  // 子问题文本
	Dimension string   `json:"dimension"` // 所属维度
	Order     int      `json:"order"`     // 执行顺序
	Priority  float64  `json:"priority"`  // 优先级
}

// ExpandResult 扩展结果
type ExpandResult struct {
	Query       string   `json:"query"`      // 扩展后的查询
	Expansions  []string `json:"expansions"` // 扩展列表
	Confidence  float64  `json:"confidence"` // 置信度
}

// CompleteResult 补全结果
type CompleteResult struct {
	Query       string            `json:"query"`       // 补全后的查询
	FilledParts map[string]string `json:"filledParts"` // 填充的部分
	Confidence  float64           `json:"confidence"`   // 置信度
}

// Message 消息结构
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// QueryRewriteService 问题重写服务
type QueryRewriteService struct {
	modelClient    ModelClient
	defaultModel   string
	enableContext  bool
	enableSemantic bool
	maxHistoryMsg  int
	confidenceTh   float64
	decomposer     *QueryDecomposeService

	// 统计信息
	stats RewriteStats
}

// RewriteStats 重写统计
type RewriteStats struct {
	TotalRewrites        int64   `json:"totalRewrites"`
	ContextCompletions   int64   `json:"contextCompletions"`
	SemanticExpansions    int64   `json:"semanticExpansions"`
	IntentPreservations  int64   `json:"intentPreservations"`
	SplitRewrites        int64   `json:"splitRewrites"`
	Failures             int64   `json:"failures"`
	AverageLatencyMs     float64 `json:"averageLatencyMs"`
}

// ModelClient 模型客户端接口
type ModelClient interface {
	Chat(ctx context.Context, messages []Message, model string, options *ChatOptions) (*ChatResponse, error)
}

// ChatOptions 聊天选项
type ChatOptions struct {
	Temperature float64 `json:"temperature"`
	MaxTokens   int     `json:"max_tokens"`
}

// ChatResponse 聊天响应
type ChatResponse struct {
	Content []ContentPart `json:"content"`
}

// ContentPart 内容部分
type ContentPart struct {
	Text string `json:"text"`
}

// NewQueryRewriteService 创建问题重写服务
func NewQueryRewriteService(modelClient ModelClient, options *RewriteServiceOptions) *QueryRewriteService {
	if options == nil {
		options = &RewriteServiceOptions{}
	}

	svc := &QueryRewriteService{
		modelClient:    modelClient,
		defaultModel:   options.DefaultModel,
		enableContext:  options.EnableContextCompletion,
		enableSemantic: options.EnableSemanticExpansion,
		maxHistoryMsg:  options.MaxHistoryMessages,
		confidenceTh:   options.ConfidenceThreshold,
		stats:          RewriteStats{},
	}

	// 如果配置了Decomposer则设置
	if options.Decomposer != nil {
		svc.decomposer = options.Decomposer
	}

	return svc
}

// RewriteServiceOptions 重写服务选项
type RewriteServiceOptions struct {
	DefaultModel            string
	EnableContextCompletion bool
	EnableSemanticExpansion bool
	MaxHistoryMessages      int
	ConfidenceThreshold     float64
	Decomposer              *QueryDecomposeService
}

// SetDecomposer 设置问题拆分服务
func (s *QueryRewriteService) SetDecomposer(decomposer *QueryDecomposeService) {
	s.decomposer = decomposer
}

// Rewrite 主重写接口
func (s *QueryRewriteService) Rewrite(ctx context.Context, query string, messages []Message) (*RewriteResult, error) {
	startTime := time.Now()
	s.stats.TotalRewrites++

	if strings.TrimSpace(query) == "" {
		return &RewriteResult{
			Rewritten:  query,
			Type:       RewriteTypeIntentPreservation,
			Confidence: 1.0,
			Changes:    []string{},
			Original:   query,
			Timestamp:  time.Now().UnixMilli(),
		}, nil
	}

	trimmedQuery := strings.TrimSpace(query)

	// 1. 判断是否需要上下文补全
	needsContext := false
	if s.enableContext && len(messages) > 0 {
		needsContext = s.needsContextCompletion(trimmedQuery)
	}

	// 2. 判断是否需要语义扩展
	needsSemantic := s.needsSemanticExpansion(trimmedQuery)

	// 3. 根据情况选择重写策略
	var rewrittenQuery string
	var rewriteType RewriteType
	var changes []string

	if needsContext {
		result, err := s.completeContext(ctx, trimmedQuery, messages)
		if err == nil && result != nil {
			rewrittenQuery = result.Query
			rewriteType = RewriteTypeContextualCompletion
			for k, v := range result.FilledParts {
				changes = append(changes, "上下文补全: \""+k+"\" -> \""+v+"\"")
			}
			s.stats.ContextCompletions++
		} else {
			rewrittenQuery = trimmedQuery
			rewriteType = RewriteTypeIntentPreservation
		}
	} else if needsSemantic {
		result, err := s.expand(ctx, trimmedQuery, &ExpandOptions{MaxExpansions: 3})
		if err == nil && len(result.Expansions) > 0 {
			rewrittenQuery = result.Expansions[0]
			rewriteType = RewriteTypeSemanticExpansion
			changes = append(changes, "语义扩展: "+strings.Join(result.Expansions, ", "))
			s.stats.SemanticExpansions++
		} else {
			rewrittenQuery = trimmedQuery
			rewriteType = RewriteTypeIntentPreservation
		}
	} else {
		result := s.intentPreservation(trimmedQuery)
		rewrittenQuery = result.Query
		rewriteType = RewriteTypeIntentPreservation
		if result.Changed {
			changes = append(changes, "规范化: "+result.Reason)
		}
		s.stats.IntentPreservations++
	}

	// 计算置信度
	confidence := s.calculateConfidence(trimmedQuery, rewrittenQuery, needsContext, needsSemantic)

	// 更新延迟统计
	s.updateLatency(startTime)

	return &RewriteResult{
		Rewritten:  rewrittenQuery,
		Type:       rewriteType,
		Confidence: confidence,
		Changes:    changes,
		Original:   trimmedQuery,
		Timestamp:  time.Now().UnixMilli(),
	}, nil
}

// RewriteWithSplit 带拆分的问题改写
// 对于复杂问题，先拆分再改写，每个子问题独立改写
func (s *QueryRewriteService) RewriteWithSplit(ctx context.Context, query string, messages []Message) (*RewriteWithSplitResult, error) {
	startTime := time.Now()
	s.stats.TotalRewrites++

	result := &RewriteWithSplitResult{
		Original:   strings.TrimSpace(query),
		Timestamp:  time.Now().UnixMilli(),
		Type:       RewriteTypeWithSplit,
		Changes:    []string{},
		SubQuestions: []SubQuestionRef{},
	}

	if strings.TrimSpace(query) == "" {
		result.Error = "query is empty"
		return result, nil
	}

	// 1. 首先判断是否需要拆分
	shouldSplit := s.shouldDecompose(query)
	result.ShouldSplit = shouldSplit

	if !shouldSplit {
		// 不需要拆分，直接改写
		rewriteResult, err := s.Rewrite(ctx, query, messages)
		if err != nil {
			result.Error = err.Error()
			return result, err
		}

		result.Rewritten = rewriteResult.Rewritten
		result.Confidence = rewriteResult.Confidence
		result.Changes = rewriteResult.Changes
		result.DecomposeType = ""
		s.updateLatency(startTime)
		return result, nil
	}

	// 2. 需要拆分，先拆分再改写
	s.stats.SplitRewrites++

	var decomposeResult *DecomposeResult
	if s.decomposer != nil {
		decomposeResult, _ = s.decomposer.Decompose(ctx, query, nil)
	}

	if decomposeResult != nil && decomposeResult.ShouldDecompose {
		result.DecomposeType = decomposeResult.Type

		// 为每个子问题进行改写
		for _, sq := range decomposeResult.SubQuestions {
			// 独立改写每个子问题
			subRewrite, _ := s.Rewrite(ctx, sq.Question, messages)

			subRef := SubQuestionRef{
				ID:        sq.ID,
				Question:  sq.Question,
				Dimension: sq.Dimension,
				Order:     sq.Order,
				Priority:  sq.Priority,
			}

			// 如果改写成功且有变化，使用改写后的结果
			if subRewrite != nil && subRewrite.Confidence > 0.5 {
				subRef.Question = subRewrite.Rewritten
				result.Changes = append(result.Changes, "子问题改写: \""+sq.Question+"\" -> \""+subRewrite.Rewritten+"\"")
			}

			result.SubQuestions = append(result.SubQuestions, subRef)
		}

		// 主查询也进行一次改写
		mainRewrite, _ := s.Rewrite(ctx, query, messages)
		if mainRewrite != nil {
			result.Rewritten = mainRewrite.Rewritten
			result.Confidence = mainRewrite.Confidence * 0.8 // 拆分后置信度略低
		} else {
			result.Rewritten = query
			result.Confidence = 0.5
		}

		result.Changes = append(result.Changes, "复杂问题拆分: "+string(decomposeResult.Type))
	} else {
		// 拆分服务不可用或不需要拆分，直接改写
		rewriteResult, err := s.Rewrite(ctx, query, messages)
		if err != nil {
			result.Error = err.Error()
			return result, err
		}

		result.Rewritten = rewriteResult.Rewritten
		result.Confidence = rewriteResult.Confidence
		result.Changes = rewriteResult.Changes
		result.DecomposeType = ""
	}

	s.updateLatency(startTime)
	return result, nil
}

// shouldDecompose 判断是否应该拆分
func (s *QueryRewriteService) shouldDecompose(query string) bool {
	// 复杂问题信号词
	complexPatterns := []*regexp.Regexp{
		regexp.MustCompile(`(和|与|以及|并且|同时)`),        // 并列关系
		regexp.MustCompile(`(比较|对比|差别|区别|差异)`),      // 比较关系
		regexp.MustCompile(`(原因|为什么|因为|所以|因此)`),    // 因果关系
		regexp.MustCompile(`(步骤|流程|顺序|首先|其次|最后)`), // 顺序关系
		regexp.MustCompile(`(优缺点|利弊|好处坏处)`),          // 优缺点
		regexp.MustCompile(`(如何|怎么|怎样|怎么办)`),         // 如何类问题
		regexp.MustCompile(`(什么|哪些|哪个)`),                // 开放式问题
	}

	matchCount := 0
	for _, p := range complexPatterns {
		if p.MatchString(query) {
			matchCount++
		}
	}

	// 超过2个信号词或者包含"和"且长度适中，认为需要拆分
	hasAnd := regexp.MustCompile(`(和|与|以及)`).MatchString(query)
	lengthOk := len(query) > 15 && len(query) < 200

	return matchCount >= 2 || (hasAnd && lengthOk && matchCount >= 1)
}

// Expand 扩展查询（专门用于语义扩展）
func (s *QueryRewriteService) expand(ctx context.Context, query string, options *ExpandOptions) (*ExpandResult, error) {
	maxExpansions := 5
	if options != nil {
		maxExpansions = options.MaxExpansions
	}

	prompt := "你是一个查询扩展专家。请为给定查询生成多个语义相近的表达变体。\n\n## 查询\n\"" + query + "\"\n\n## 要求\n1. 生成 " + itoa(maxExpansions) + " 个语义相近但表达不同的查询变体\n2. 每个变体应该从不同角度描述同一主题\n3. 可以包含同义词、反义词对比、上下位词等\n4. 只返回查询，不要解释\n\n## 格式要求\n返回JSON数组格式：\n[\"扩展1\", \"扩展2\", \"扩展3\", ...]"

	resp, err := s.modelClient.Chat(ctx, []Message{
		{Role: "system", Content: "你是一个JSON生成助手，只返回有效的JSON数组，不要其他内容。"},
		{Role: "user", Content: prompt},
	}, s.defaultModel, &ChatOptions{Temperature: 0.7, MaxTokens: 500})

	if err != nil {
		return &ExpandResult{Query: query, Expansions: []string{}, Confidence: 0.3}, err
	}

	content := ""
	if len(resp.Content) > 0 {
		content = resp.Content[0].Text
	}

	expansions := parseJSONArray(content)
	if expansions == nil {
		expansions = []string{}
	}

	allQueries := append([]string{query}, expansions...)
	mergedQuery := strings.Join(allQueries, " | ")

	return &ExpandResult{
		Query:      mergedQuery,
		Expansions: expansions,
		Confidence: 0.8,
	}, nil
}

// ExpandOptions 扩展选项
type ExpandOptions struct {
	MaxExpansions int
}

// Complete 补全省略信息（专门用于上下文补全）
func (s *QueryRewriteService) Complete(ctx context.Context, query string, messages []Message) (*CompleteResult, error) {
	if strings.TrimSpace(query) == "" {
		return &CompleteResult{Query: query, FilledParts: map[string]string{}, Confidence: 1.0}, nil
	}

	contextSummary := s.buildContextSummary(messages)
	if contextSummary == "" {
		return &CompleteResult{Query: query, FilledParts: map[string]string{}, Confidence: 0.5}, nil
	}

	prompt := "你是一个上下文补全专家。请根据对话历史补全用户查询中的省略信息。\n\n## 对话历史\n" + contextSummary + "\n\n## 当前查询\n\"" + query + "\"\n\n## 补全规则\n1. 如果查询是完整的，返回原查询\n2. 如果查询包含代词（它、这个、那个、这、那等），根据上下文推断指代对象\n3. 如果查询包含省略的主语或宾语，根据话题连贯性补全\n4. 如果查询表达不完整（如\"继续\"、\"然后呢\"），根据上下文推断完整意图\n\n## 返回格式\n{\n  \"completed_query\": \"补全后的完整查询\",\n  \"filled_parts\": {\n    \"代词/省略\": \"推断的实际指代\"\n  },\n  \"confidence\": 0.0-1.0\n}"

	resp, err := s.modelClient.Chat(ctx, []Message{
		{Role: "system", Content: "你是一个JSON生成助手，只返回有效的JSON，不要其他内容。"},
		{Role: "user", Content: prompt},
	}, s.defaultModel, &ChatOptions{Temperature: 0.3, MaxTokens: 500})

	if err != nil {
		return &CompleteResult{Query: query, FilledParts: map[string]string{}, Confidence: 0.3}, err
	}

	content := ""
	if len(resp.Content) > 0 {
		content = resp.Content[0].Text
	}

	parsed := parseJSONResponse(content)
	if parsed == nil {
		return &CompleteResult{Query: query, FilledParts: map[string]string{}, Confidence: 0.3}, nil
	}

	completedQuery, _ := parsed["completed_query"].(string)
	if completedQuery == "" {
		completedQuery = query
	}

	filledParts := make(map[string]string)
	if parts, ok := parsed["filled_parts"].(map[string]interface{}); ok {
		for k, v := range parts {
			if vs, ok := v.(string); ok {
				filledParts[k] = vs
			}
		}
	}

	confidence, _ := parsed["confidence"].(float64)
	if confidence == 0 {
		confidence = 0.5
	}

	return &CompleteResult{
		Query:       completedQuery,
		FilledParts: filledParts,
		Confidence:  confidence,
	}, nil
}

// needsContextCompletion 判断是否需要上下文补全
func (s *QueryRewriteService) needsContextCompletion(query string) bool {
	// 代词和指示词模式
	pronounPatterns := []*regexp.Regexp{
		regexp.MustCompile(`^(它|这个|那个|这|那|这些|那些)`),
		regexp.MustCompile(`^(他们|她们|它们|各位|大家)`),
		regexp.MustCompile(`^(我|你|他|她)`),
		regexp.MustCompile(`^(上述|前述|上面|刚才|之前)`),
		regexp.MustCompile(`继续[吗|啊|呀]?`),
		regexp.MustCompile(`然后[呢|的]?`),
		regexp.MustCompile(`还有呢`),
		regexp.MustCompile(`除此之外`),
		regexp.MustCompile(`^同上$`),
	}

	// 省略主语模式
	ellipsisPatterns := []*regexp.Regexp{
		regexp.MustCompile(`^[能会要请帮给将].{0,5}$`),
		regexp.MustCompile(`^[是很有有没有].{0,10}$`),
		regexp.MustCompile(`^[好吗对吗可以吗]$`),
	}

	for _, p := range pronounPatterns {
		if p.MatchString(query) {
			return true
		}
	}

	for _, p := range ellipsisPatterns {
		if p.MatchString(query) {
			return true
		}
	}

	return len(query) < 5
}

// needsSemanticExpansion 判断是否需要语义扩展
func (s *QueryRewriteService) needsSemanticExpansion(query string) bool {
	shortQuery := len(query) < 15
	vaguePatterns := []*regexp.Regexp{
		regexp.MustCompile(`^(什么是|如何|怎么|怎样)`),
		regexp.MustCompile(`[东西事]`),
		regexp.MustCompile(`(好|坏|优|缺)`),
		regexp.MustCompile(`(便宜|贵|快|慢)`),
	}

	if !shortQuery {
		return false
	}

	for _, p := range vaguePatterns {
		if p.MatchString(query) {
			return true
		}
	}

	return false
}

// completeContext 上下文补全
func (s *QueryRewriteService) completeContext(ctx context.Context, query string, messages []Message) (*CompleteResult, error) {
	maxHistory := s.maxHistoryMsg
	if maxHistory == 0 {
		maxHistory = 10
	}

	start := 0
	if len(messages) > maxHistory {
		start = len(messages) - maxHistory
	}

	recentMessages := messages[start:]
	return s.Complete(ctx, query, recentMessages)
}

// intentPreservation 意图保持（轻微规范化）
func (s *QueryRewriteService) intentPreservation(query string) *struct {
	Query   string
	Changed bool
	Reason  string
} {
	// 轻微规范化：去除多余空格、标点
	normalized := strings.TrimSpace(query)
	normalized = regexp.MustCompile(`\s+`).ReplaceAllString(normalized, " ")
	normalized = regexp.MustCompile(`[。！？]+$`).ReplaceAllString(normalized, "")

	return &struct {
		Query   string
		Changed bool
		Reason  string
	}{
		Query:   normalized,
		Changed: normalized != query,
		Reason:  "轻微规范化",
	}
}

// calculateConfidence 计算置信度
func (s *QueryRewriteService) calculateConfidence(original, rewritten string, needsContext, needsExpansion bool) float64 {
	confidence := 0.8

	if needsContext {
		confidence += 0.1
	}
	if needsExpansion {
		confidence += 0.05
	}
	if rewritten != original {
		confidence += 0.05
	}

	// 长度异常惩罚
	if len(rewritten) < len(original)*50/100 {
		confidence -= 0.2
	}
	if len(rewritten) > len(original)*3 {
		confidence -= 0.1
	}

	if confidence > 1 {
		confidence = 1
	}
	if confidence < 0 {
		confidence = 0
	}

	return confidence
}

// buildContextSummary 构建上下文摘要
func (s *QueryRewriteService) buildContextSummary(messages []Message) string {
	if messages == nil || len(messages) == 0 {
		return ""
	}

	maxHistory := s.maxHistoryMsg
	if maxHistory == 0 {
		maxHistory = 10
	}

	start := 0
	if len(messages) > maxHistory {
		start = len(messages) - maxHistory
	}

	var sb strings.Builder
	recentMessages := messages[start:]

	for i, m := range recentMessages {
		if i == len(recentMessages)-1 {
			sb.WriteString(">>> ")
		}
		sb.WriteString("[" + m.Role + "]: ")
		if len(m.Content) > 200 {
			sb.WriteString(m.Content[:200] + "[多模态内容]")
		} else {
			sb.WriteString(m.Content)
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

// updateLatency 更新延迟统计
func (s *QueryRewriteService) updateLatency(startTime time.Time) {
	latency := time.Since(startTime).Milliseconds()
	total := s.stats.TotalRewrites
	if total > 0 {
		s.stats.AverageLatencyMs = (s.stats.AverageLatencyMs*float64(total-1) + float64(latency)) / float64(total)
	}
}

// GetStats 获取统计信息
func (s *QueryRewriteService) GetStats() *RewriteStats {
	stats := s.stats
	if s.stats.TotalRewrites > 0 {
		successRate := float64(s.stats.TotalRewrites-s.stats.Failures) / float64(s.stats.TotalRewrites) * 100
		_ = successRate // 可以使用
	}
	return &stats
}

// ResetStats 重置统计
func (s *QueryRewriteService) ResetStats() {
	s.stats = RewriteStats{}
}

// ==================== 辅助函数 ====================

func parseJSONResponse(content string) map[string]interface{} {
	content = strings.TrimSpace(content)
	// 提取JSON对象
	re := regexp.MustCompile(`\{[\s\S]*\}`)
	matches := re.FindString(content)
	if matches == "" {
		return nil
	}

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(matches), &result); err != nil {
		return nil
	}
	return result
}

func parseJSONArray(content string) []string {
	content = strings.TrimSpace(content)
	// 提取JSON数组
	re := regexp.MustCompile(`\[[\s\S]*\]`)
	matches := re.FindString(content)
	if matches == "" {
		return nil
	}

	var result []string
	if err := json.Unmarshal([]byte(matches), &result); err != nil {
		return nil
	}
	return result
}

func itoa(i int) string {
	b, _ := json.Marshal(i)
	return strings.TrimSpace(strings.Replace(string(b), `"`, ``, -1))
}
