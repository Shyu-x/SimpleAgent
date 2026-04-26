/**
 * QueryDecomposeService - 复杂问题拆分服务
 *
 * 企业级设计：
 * - 自动识别复杂多维度问题
 * - 将复杂问题拆分为多个可独立回答的子问题
 * - 支持串行依赖拆分（如"先...再..."）和平行可分拆分（如"...和..."）
 * - 支持子问题结果合并为完整答案
 *
 * 拆分策略：
 * - 纵向拆分：按步骤/时间顺序拆分（如"如何学习React" -> 安装/语法/状态/路由...）
 * - 横向拆分：按维度/方面拆分（如"比较A和B" -> A的特点/B的特点/对比分析）
 * - 混合拆分：同时包含纵向和横向（如"分析XX的优缺点及适用场景"）
 */

package rag

import (
	"context"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// 拆分类型枚举
type DecomposeType string

const (
	DecomposeTypeSequential DecomposeType = "sequential" // 纵向拆分：按步骤/时间顺序
	DecomposeTypeParallel   DecomposeType = "parallel"   // 横向拆分：按维度/方面并行
	DecomposeTypeHybrid     DecomposeType = "hybrid"      // 混合拆分：纵向+横向
)

// SubQuestion 子问题结构
type SubQuestion struct {
	ID        string   `json:"id"`        // 子问题唯一ID
	Question  string   `json:"question"`  // 子问题文本
	Dimension string   `json:"dimension"` // 所属维度
	Order     int      `json:"order"`     // 执行顺序
	DependOn  []string `json:"dependOn"`  // 依赖的子问题ID列表
	Priority  float64  `json:"priority"`  // 优先级（0-1）
	Answer    string   `json:"answer,omitempty"` // 答案（填充后）
}

// DecomposeResult 拆分结果结构
type DecomposeResult struct {
	SubQuestions   []SubQuestion `json:"subQuestions"`   // 子问题列表
	Type           DecomposeType `json:"type"`           // 拆分类型
	Reasoning      string        `json:"reasoning"`      // 拆分理由
	Confidence     float64       `json:"confidence"`     // 置信度
	ShouldDecompose bool         `json:"shouldDecompose"` // 是否应该拆分
	Error          string        `json:"error,omitempty"`
}

// MergeResult 合并结果
type MergeResult struct {
	MergedAnswer      string            `json:"mergedAnswer"`       // 合并后的答案
	KeyPoints         []string          `json:"keyPoints"`          // 要点列表
	Conclusion        string            `json:"conclusion"`         // 结论
	SourceAttributions []SourceAttribution `json:"sourceAttributions,omitempty"` // 来源追溯
}

// SourceAttribution 来源追溯
type SourceAttribution struct {
	SubQuestionID string `json:"subQuestionId"`
	Question       string `json:"question"`
	Dimension      string `json:"dimension"`
}

// QueryDecomposeService 复杂问题拆分服务
type QueryDecomposeService struct {
	modelClient   ModelClient
	defaultModel  string
	maxSubQuestions int
	confidenceTh    float64
	enableLLMDetect bool

	// 统计信息
	stats DecomposeStats
}

// DecomposeStats 拆分统计
type DecomposeStats struct {
	TotalDecomposes     int64   `json:"totalDecomposes"`
	SuccessfulDecomposes int64   `json:"successfulDecomposes"`
	SkippedDecomposes   int64   `json:"skippedDecomposes"`
	Failures            int64   `json:"failures"`
	AverageSubQuestions float64 `json:"averageSubQuestions"`
	AverageLatencyMs    float64 `json:"averageLatencyMs"`
}

// DecomposeServiceOptions 拆分服务选项
type DecomposeServiceOptions struct {
	DefaultModel        string
	MaxSubQuestions     int
	ConfidenceThreshold float64
	EnableLLMDetect     bool
}

// NewQueryDecomposeService 创建问题拆分服务
func NewQueryDecomposeService(modelClient ModelClient, options *DecomposeServiceOptions) *QueryDecomposeService {
	if options == nil {
		options = &DecomposeServiceOptions{}
	}

	return &QueryDecomposeService{
		modelClient:   modelClient,
		defaultModel:  options.DefaultModel,
		maxSubQuestions: options.MaxSubQuestions,
		confidenceTh:  options.ConfidenceThreshold,
		enableLLMDetect: options.EnableLLMDetect,
		stats:         DecomposeStats{},
	}
}

// Decompose 主拆分接口
func (s *QueryDecomposeService) Decompose(ctx context.Context, complexQuery string, context map[string]interface{}) (*DecomposeResult, error) {
	startTime := time.Now()
	s.stats.TotalDecomposes++

	if strings.TrimSpace(complexQuery) == "" {
		return &DecomposeResult{
			SubQuestions:   []SubQuestion{},
			Type:           "",
			Reasoning:      "空查询无需拆分",
			Confidence:     1.0,
			ShouldDecompose: false,
		}, nil
	}

	trimmedQuery := strings.TrimSpace(complexQuery)

	// 1. 判断是否需要拆分
	shouldResult, err := s.CanDecompose(ctx, trimmedQuery)
	if err == nil && !shouldResult.ShouldDecompose {
		s.stats.SkippedDecomposes++
		return &DecomposeResult{
			SubQuestions: []SubQuestion{
				{
					ID:        "q-0",
					Question:  trimmedQuery,
					Dimension: "main",
					Order:     0,
					DependOn:  []string{},
					Priority:  1.0,
				},
			},
			Type:           "",
			Reasoning:      shouldResult.Reasoning,
			Confidence:     shouldResult.Confidence,
			ShouldDecompose: false,
		}, nil
	}

	// 2. 执行拆分
	decomposition, err := s.decomposeWithLLM(ctx, trimmedQuery, context)
	if err != nil {
		s.stats.Failures++
		return &DecomposeResult{
			SubQuestions: []SubQuestion{
				{
					ID:        "q-0",
					Question:  complexQuery,
					Dimension: "main",
					Order:     0,
					DependOn:  []string{},
					Priority:  1.0,
				},
			},
			Type:           "",
			Reasoning:      "拆分失败，降级为单一问题",
			Confidence:     0.3,
			ShouldDecompose: false,
			Error:          err.Error(),
		}, nil
	}

	// 3. 后处理：验证和排序
	validated := s.validateAndSort(decomposition)

	s.stats.SuccessfulDecomposes++
	s.updateLatency(startTime, len(validated.SubQuestions))

	return &DecomposeResult{
		SubQuestions:   validated.SubQuestions,
		Type:           validated.Type,
		Reasoning:      validated.Reasoning,
		Confidence:     validated.Confidence,
		ShouldDecompose: true,
	}, nil
}

// ShouldDecomposeResult 判断是否需要拆分的结果
type ShouldDecomposeResult struct {
	ShouldDecompose bool          `json:"shouldDecompose"`
	Reasoning       string        `json:"reasoning"`
	Confidence      float64       `json:"confidence"`
	Type            DecomposeType `json:"type,omitempty"`
}

// CanDecompose 判断是否需要拆分
func (s *QueryDecomposeService) CanDecompose(ctx context.Context, query string) (*ShouldDecomposeResult, error) {
	// 快速规则判断
	quickResult := s.quickDetect(query)
	if quickResult.ShouldDecompose && quickResult.Confidence > 0.8 {
		return quickResult, nil
	}

	// LLM辅助判断
	if s.enableLLMDetect && s.modelClient != nil {
		return s.llmDetect(ctx, query)
	}

	return quickResult, nil
}

// MergeResults 合并子问题结果
func (s *QueryDecomposeService) MergeResults(ctx context.Context, subQuestions []SubQuestion, originalQuery string, options *MergeOptions) (*MergeResult, error) {
	// 按依赖顺序排序
	sorted := s.topologicalSort(subQuestions)

	// 构建答案摘要
	var answerSummary strings.Builder
	for _, sq := range sorted {
		if sq.Answer != "" {
			answerSummary.WriteString("[子问题" + sq.ID + "]: " + sq.Question + "\n回答: " + sq.Answer + "\n\n")
		}
	}

	includeSource := true
	if options != nil {
		includeSource = options.IncludeSourceAttribution
	}

	prompt := "你是一个答案合并专家。请将多个子问题的回答合并为一个完整、连贯的答案。\n\n## 原始问题\n\"" + originalQuery + "\"\n\n## 子问题及回答\n" + answerSummary.String() + "\n\n## 合并要求\n1. 保持原始问题的核心意图\n2. 去除重复内容，整合相似观点\n3. 按照逻辑顺序组织（先背景/定义，再分析，最后结论）\n4. 如有矛盾观点，客观呈现并给出分析\n5. 保持答案的完整性和专业性\n"

	if includeSource {
		prompt += "6. 在合适位置标注子问题来源（如\"关于React的特点，...\"）\n"
	}

	prompt += "\n## 返回格式\n{\n  \"merged_answer\": \"合并后的完整答案\",\n  \"key_points\": [\"要点1\", \"要点2\", ...],\n  \"conclusion\": \"最终结论（如有）\"\n}"

	resp, err := s.modelClient.Chat(ctx, []Message{
		{Role: "system", Content: "你是一个JSON生成助手，只返回有效的JSON，不要其他内容。"},
		{Role: "user", Content: prompt},
	}, s.defaultModel, &ChatOptions{Temperature: 0.5, MaxTokens: 2000})

	if err != nil {
		// 降级：简单拼接
		var simpleMerge strings.Builder
		for _, sq := range subQuestions {
			if sq.Answer != "" {
				simpleMerge.WriteString(sq.Answer + "\n\n")
			}
		}
		return &MergeResult{
			MergedAnswer: simpleMerge.String(),
			KeyPoints:    []string{},
			Conclusion:   "",
		}, nil
	}

	content := ""
	if len(resp.Content) > 0 {
		content = resp.Content[0].Text
	}

	parsed := parseJSONResponse(content)
	if parsed == nil {
		return &MergeResult{
			MergedAnswer: answerSummary.String(),
			KeyPoints:    []string{},
			Conclusion:   "",
		}, nil
	}

	mergedAnswer, _ := parsed["merged_answer"].(string)
	if mergedAnswer == "" {
		mergedAnswer = answerSummary.String()
	}

	keyPoints := []string{}
	if kps, ok := parsed["key_points"].([]interface{}); ok {
		for _, kp := range kps {
			if kps, ok := kp.(string); ok {
				keyPoints = append(keyPoints, kps)
			}
		}
	}

	conclusion, _ := parsed["conclusion"].(string)

	// 构建来源追溯
	var sourceAttributions []SourceAttribution
	if includeSource {
		for _, sq := range sorted {
			if sq.Answer != "" {
				sourceAttributions = append(sourceAttributions, SourceAttribution{
					SubQuestionID: sq.ID,
					Question:      sq.Question,
					Dimension:     sq.Dimension,
				})
			}
		}
	}

	return &MergeResult{
		MergedAnswer:       mergedAnswer,
		KeyPoints:          keyPoints,
		Conclusion:         conclusion,
		SourceAttributions: sourceAttributions,
	}, nil
}

// MergeOptions 合并选项
type MergeOptions struct {
	IncludeSourceAttribution bool
}

// ==================== 私有方法 ====================

// quickDetect 快速规则判断
func (s *QueryDecomposeService) quickDetect(query string) *ShouldDecomposeResult {
	// 明显需要拆分的模式
	type pattern struct {
		pattern *regexp.Regexp
		decomposeType DecomposeType
		reason        string
		weight        float64
	}

	decomposePatterns := []pattern{
		{regexp.MustCompile(`比较|对比|差异|不同`), DecomposeTypeParallel, "包含对比/比较意图", 0.9},
		{regexp.MustCompile(`和.*和|以及.*和|既.*又`), DecomposeTypeParallel, "包含多个并列项", 0.85},
		{regexp.MustCompile(`如何学会|怎么实现|步骤是|流程是`), DecomposeTypeSequential, "包含多步骤请求", 0.8},
		{regexp.MustCompile(`为什么.*并且|原因.*结果`), DecomposeTypeHybrid, "包含因果多维度", 0.85},
		{regexp.MustCompile(`优缺点|利弊|优势.*劣势`), DecomposeTypeParallel, "包含正反两面分析", 0.9},
		{regexp.MustCompile(`各个方面|多角度|从.*方面|从.*角度`), DecomposeTypeParallel, "包含多维度请求", 0.85},
		{regexp.MustCompile(`现在.*未来|过去.*现在.*未来`), DecomposeTypeSequential, "包含时间序列", 0.8},
	}

	var bestMatch *struct {
		decomposeType DecomposeType
		reason        string
	}
	var bestWeight float64 = 0

	for _, p := range decomposePatterns {
		if p.pattern.MatchString(query) && p.weight > bestWeight {
			bestMatch = &struct {
				decomposeType DecomposeType
				reason        string
			}{p.decomposeType, p.reason}
			bestWeight = p.weight
		}
	}

	// 查询长度辅助判断
	isComplexLength := len(query) > 30

	if bestMatch != nil {
		confidence := bestWeight
		if isComplexLength && confidence < 0.95 {
			confidence += 0.1
		}
		if confidence > 0.95 {
			confidence = 0.95
		}

		threshold := s.confidenceTh
		if threshold == 0 {
			threshold = 0.5
		}

		return &ShouldDecomposeResult{
			ShouldDecompose: confidence >= threshold,
			Reasoning:       bestMatch.reason,
			Confidence:      confidence,
			Type:            bestMatch.decomposeType,
		}
	}

	// 默认：短查询不拆分
	return &ShouldDecomposeResult{
		ShouldDecompose: false,
		Reasoning:      "查询较复杂但未匹配明确拆分模式",
		Confidence:     0.4,
	}
}

// llmDetect LLM辅助判断
func (s *QueryDecomposeService) llmDetect(ctx context.Context, query string) (*ShouldDecomposeResult, error) {
	prompt := "你是一个复杂问题分析专家。请判断以下查询是否需要拆分为多个子问题。\n\n## 查询\n\"" + query + "\"\n\n## 判断标准\n需要拆分的情况：\n1. 查询包含多个独立维度（如\"React和Vue的区别\"）\n2. 查询包含步骤或流程（如\"如何学习新技术\"）\n3. 查询需要多方面分析（如\"分析AI对工作的影响\"）\n4. 查询是对比类（如\"比较A和B的优劣\"）\n5. 查询包含并列意图（如\"介绍一下Python和Java\"）\n\n不需要拆分的情况：\n1. 查询是简单的单一问题（如\"什么是AI\"）\n2. 查询意图明确且单一（如\"怎么安装Node\"）\n3. 查询可以用一句话回答（如\"JavaScript是谁发明的\"）\n\n## 返回格式\n{\n  \"should_decompose\": true/false,\n  \"reasoning\": \"判断理由（20字以内）\",\n  \"decompose_type\": \"parallel/sequential/hybrid/null\",\n  \"confidence\": 0.0-1.0,\n  \"complexity_score\": 1-10\n}"

	resp, err := s.modelClient.Chat(ctx, []Message{
		{Role: "system", Content: "你是一个JSON生成助手，只返回有效的JSON，不要其他内容。"},
		{Role: "user", Content: prompt},
	}, s.defaultModel, &ChatOptions{Temperature: 0.3, MaxTokens: 500})

	if err != nil {
		return s.quickDetect(query), nil
	}

	content := ""
	if len(resp.Content) > 0 {
		content = resp.Content[0].Text
	}

	parsed := parseJSONResponse(content)
	if parsed == nil {
		return s.quickDetect(query), nil
	}

	shouldDec, _ := parsed["should_decompose"].(bool)
	reasoning, _ := parsed["reasoning"].(string)
	confidence, _ := parsed["confidence"].(float64)
	decomposeTypeStr, _ := parsed["decompose_type"].(string)

	var decomposeType DecomposeType
	switch decomposeTypeStr {
	case "parallel":
		decomposeType = DecomposeTypeParallel
	case "sequential":
		decomposeType = DecomposeTypeSequential
	case "hybrid":
		decomposeType = DecomposeTypeHybrid
	default:
		decomposeType = ""
	}

	if confidence == 0 {
		confidence = 0.5
	}

	return &ShouldDecomposeResult{
		ShouldDecompose: shouldDec,
		Reasoning:      reasoning,
		Confidence:     confidence,
		Type:           decomposeType,
	}, nil
}

// decomposeWithLLM 使用LLM执行拆分
func (s *QueryDecomposeService) decomposeWithLLM(ctx context.Context, query string, context map[string]interface{}) (*DecomposeResult, error) {
	maxSubs := s.maxSubQuestions
	if maxSubs == 0 {
		maxSubs = 5
	}

	prompt := "你是一个问题拆分专家。请将复杂查询拆分为多个可独立回答的子问题。\n\n## 复杂查询\n\"" + query + "\"\n\n## 拆分要求\n1. 拆分为 " + itoa(maxSubs) + " 个以内的子问题\n2. 每个子问题应该：\n   - 单一维度/方面\n   - 可以独立回答\n   - 表达清晰无歧义\n3. 明确子问题之间的依赖关系\n4. 标注每个子问题的优先级\n\n## 拆分类型说明\n- parallel（横向）：子问题之间是并列关系，可并行回答\n- sequential（纵向）：子问题之间有先后顺序依赖\n- hybrid（混合）：既有并行也有顺序\n\n## 返回格式\n{\n  \"decompose_type\": \"parallel/sequential/hybrid\",\n  \"reasoning\": \"拆分策略的理由（30字以内）\",\n  \"confidence\": 0.0-1.0,\n  \"sub_questions\": [\n    {\n      \"question\": \"子问题1\",\n      \"dimension\": \"维度名称（如：特点/价格/性能）\",\n      \"order\": 0,\n      \"depend_on\": [\"依赖的子问题id数组，无依赖则空数组\"],\n      \"priority\": 0.0-1.0\n    }\n  ]\n}"

	resp, err := s.modelClient.Chat(ctx, []Message{
		{Role: "system", Content: "你是一个JSON生成助手，只返回有效的JSON，不要其他内容。"},
		{Role: "user", Content: prompt},
	}, s.defaultModel, &ChatOptions{Temperature: 0.5, MaxTokens: 1500})

	if err != nil {
		return nil, err
	}

	content := ""
	if len(resp.Content) > 0 {
		content = resp.Content[0].Text
	}

	parsed := parseJSONResponse(content)
	if parsed == nil {
		return nil, err
	}

	decomposeTypeStr, _ := parsed["decompose_type"].(string)
	var decomposeType DecomposeType
	switch decomposeTypeStr {
	case "parallel":
		decomposeType = DecomposeTypeParallel
	case "sequential":
		decomposeType = DecomposeTypeSequential
	case "hybrid":
		decomposeType = DecomposeTypeHybrid
	default:
		decomposeType = DecomposeTypeParallel
	}

	reasoning, _ := parsed["reasoning"].(string)
	if reasoning == "" {
		reasoning = "LLM智能拆分"
	}

	confidence, _ := parsed["confidence"].(float64)
	if confidence == 0 {
		confidence = 0.6
	}

	subQuestions := []SubQuestion{}
	subList, ok := parsed["sub_questions"].([]interface{})
	if ok {
		for i, sq := range subList {
			if sqMap, ok := sq.(map[string]interface{}); ok {
				question, _ := sqMap["question"].(string)
				dimension, _ := sqMap["dimension"].(string)
				if dimension == "" {
					dimension = "main"
				}

				order, _ := sqMap["order"].(float64)
				priority, _ := sqMap["priority"].(float64)
				if priority == 0 {
					priority = 1 - float64(i)*0.1
				}

				var dependOn []string
				if deps, ok := sqMap["depend_on"].([]interface{}); ok {
					for _, dep := range deps {
						if depStr, ok := dep.(string); ok {
							dependOn = append(dependOn, depStr)
						} else if depNum, ok := dep.(float64); ok {
							dependOn = append(dependOn, "q-"+itoa(int(depNum)))
						}
					}
				}
				if dependOn == nil {
					dependOn = []string{}
				}

				subQuestions = append(subQuestions, SubQuestion{
					ID:        "q-" + itoa(i),
					Question:  question,
					Dimension: dimension,
					Order:     int(order),
					DependOn:  dependOn,
					Priority:  priority,
				})
			}
		}
	}

	return &DecomposeResult{
		SubQuestions: subQuestions,
		Type:         decomposeType,
		Reasoning:    reasoning,
		Confidence:   confidence,
	}, nil
}

// validateAndSort 验证和排序子问题
func (s *QueryDecomposeService) validateAndSort(decomposition *DecomposeResult) *DecomposeResult {
	subQuestions := decomposition.SubQuestions
	maxSubs := s.maxSubQuestions
	if maxSubs == 0 {
		maxSubs = 5
	}

	// 限制数量
	if len(subQuestions) > maxSubs {
		// 按优先级排序
		for i := 0; i < len(subQuestions)-1; i++ {
			for j := i + 1; j < len(subQuestions); j++ {
				if subQuestions[j].Priority > subQuestions[i].Priority {
					subQuestions[i], subQuestions[j] = subQuestions[j], subQuestions[i]
				}
			}
		}
		subQuestions = subQuestions[:maxSubs]
	}

	// 重新编号
	for i := range subQuestions {
		subQuestions[i].ID = "q-" + itoa(i)
		if subQuestions[i].Order == 0 {
			subQuestions[i].Order = i
		}
	}

	// 构建ID映射
	idMap := make(map[string]string)
	for _, sq := range subQuestions {
		key := sq.Question
		if len(key) > 30 {
			key = key[:30]
		}
		idMap[key] = sq.ID
	}

	// 处理依赖关系
	for i := range subQuestions {
		var validDeps []string
		for _, dep := range subQuestions[i].DependOn {
			if depNum, err := strconv.Atoi(strings.TrimPrefix(dep, "q-")); err == nil && depNum < len(subQuestions) {
				validDeps = append(validDeps, "q-"+itoa(depNum))
			} else if newID, ok := idMap[dep]; ok {
				validDeps = append(validDeps, newID)
			}
		}
		subQuestions[i].DependOn = validDeps
	}

	// 如果是串行类型，按依赖关系拓扑排序
	if decomposition.Type == DecomposeTypeSequential || decomposition.Type == DecomposeTypeHybrid {
		subQuestions = s.topologicalSort(subQuestions)
	}

	return &DecomposeResult{
		SubQuestions: subQuestions,
		Type:         decomposition.Type,
		Reasoning:    decomposition.Reasoning,
		Confidence:   decomposition.Confidence,
	}
}

// topologicalSort 拓扑排序
func (s *QueryDecomposeService) topologicalSort(subQuestions []SubQuestion) []SubQuestion {
	sorted := make([]SubQuestion, 0, len(subQuestions))
	visited := make(map[string]bool)
	visiting := make(map[string]bool)

	var visit func(sq SubQuestion)
	visit = func(sq SubQuestion) {
		if visited[sq.ID] {
			return
		}
		if visiting[sq.ID] {
			// 循环依赖：放在当前顺序
			return
		}

		visiting[sq.ID] = true

		// 先访问依赖
		for _, depID := range sq.DependOn {
			for _, depSq := range subQuestions {
				if depSq.ID == depID {
					visit(depSq)
					break
				}
			}
		}

		visiting[sq.ID] = false
		visited[sq.ID] = true
		sorted = append(sorted, sq)
	}

	for i := range subQuestions {
		visit(subQuestions[i])
	}

	// 未排序的追加到末尾
	for _, sq := range subQuestions {
		if !visited[sq.ID] {
			sorted = append(sorted, sq)
		}
	}

	// 重新编号
	for i := range sorted {
		sorted[i].Order = i
	}

	return sorted
}

// updateLatency 更新延迟统计
func (s *QueryDecomposeService) updateLatency(startTime time.Time, subQuestionCount int) {
	latency := time.Since(startTime).Milliseconds()
	total := s.stats.TotalDecomposes
	s.stats.AverageLatencyMs = (s.stats.AverageLatencyMs*float64(total-1) + float64(latency)) / float64(total)
	s.stats.AverageSubQuestions = (s.stats.AverageSubQuestions*float64(total-1) + float64(subQuestionCount)) / float64(total)
}

// GetStats 获取统计信息
func (s *QueryDecomposeService) GetStats() *DecomposeStatsWithRate {
	stats := DecomposeStatsWithRate{
		TotalDecomposes:     s.stats.TotalDecomposes,
		SuccessfulDecomposes: s.stats.SuccessfulDecomposes,
		SkippedDecomposes:   s.stats.SkippedDecomposes,
		Failures:            s.stats.Failures,
		AverageSubQuestions:  s.stats.AverageSubQuestions,
		AverageLatencyMs:    s.stats.AverageLatencyMs,
	}
	if stats.TotalDecomposes > 0 {
		stats.SuccessRate = float64(stats.SuccessfulDecomposes+stats.SkippedDecomposes) / float64(stats.TotalDecomposes) * 100
	}
	return &stats
}

// SuccessRate 成功率（导出字段）
type DecomposeStatsWithRate struct {
	TotalDecomposes     int64   `json:"totalDecomposes"`
	SuccessfulDecomposes int64   `json:"successfulDecomposes"`
	SkippedDecomposes   int64   `json:"skippedDecomposes"`
	Failures            int64   `json:"failures"`
	AverageSubQuestions float64 `json:"averageSubQuestions"`
	AverageLatencyMs    float64 `json:"averageLatencyMs"`
	SuccessRate         float64 `json:"successRate"`
}

// GetStats 获取统计信息
func (s *QueryDecomposeService) GetStatsWithRate() *DecomposeStatsWithRate {
	return &DecomposeStatsWithRate{
		TotalDecomposes:     s.stats.TotalDecomposes,
		SuccessfulDecomposes: s.stats.SuccessfulDecomposes,
		SkippedDecomposes:   s.stats.SkippedDecomposes,
		Failures:            s.stats.Failures,
		AverageSubQuestions: s.stats.AverageSubQuestions,
		AverageLatencyMs:    s.stats.AverageLatencyMs,
		SuccessRate:         0,
	}
}

// ResetStats 重置统计
func (s *QueryDecomposeService) ResetStats() {
	s.stats = DecomposeStats{}
}
