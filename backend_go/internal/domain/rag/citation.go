package rag

import (
	"fmt"
	"sort"
	"strings"
)

// CitationLevel 引用层级
type CitationLevel int

const (
	CitationLevelBasic    CitationLevel = 1 // 基础引用
	CitationLevelMulti   CitationLevel = 2 // 多级引用
	CitationLevelNested  CitationLevel = 3 // 嵌套引用
)

// Citation 引用结构
type Citation struct {
	DocumentID string  `json:"document_id"` // 文档ID
	Content    string  `json:"content"`     // 引用的内容片段
	Score      float64 `json:"score"`       // 置信度分数
	Position   int     `json:"position"`     // 在原文中的位置
	Level      CitationLevel `json:"level"` // 引用层级
}

// CitationResult 引用组装结果
type CitationResult struct {
	Answer     string     `json:"answer"`       // 最终答案
	Citations  []Citation `json:"citations"`     // 引用的文档片段
	TotalCount int        `json:"total_count"`  // 总引用数
	Metadata   CitationMetadata `json:"metadata"` // 额外元数据
}

// CitationMetadata 引用元数据
type CitationMetadata struct {
	Format       string  `json:"format"`        // 引用格式: basic, multi, nested
	OverlapRatio float64 `json:"overlap_ratio"` // 内容重叠率
	Coverage     float64 `json:"coverage"`      // 答案覆盖率
}

// CitationAssembler 引用组装器
type CitationAssembler struct {
	maxCitations int
	format       CitationLevel
	enableNested bool
}

// NewCitationAssembler 创建引用组装器
func NewCitationAssembler(maxCitations int) *CitationAssembler {
	if maxCitations <= 0 {
		maxCitations = 5
	}
	return &CitationAssembler{
		maxCitations: maxCitations,
		format:       CitationLevelBasic,
		enableNested: true,
	}
}

// SetFormat 设置引用格式
func (a *CitationAssembler) SetFormat(format CitationLevel) {
	a.format = format
}

// SetNestedEnable 启用嵌套引用
func (a *CitationAssembler) SetNestedEnable(enable bool) {
	a.enableNested = enable
}

// Assemble 组装引用
func (a *CitationAssembler) Assemble(query string, results []*SearchResult, answer string) *CitationResult {
	if len(results) == 0 {
		return &CitationResult{
			Answer:     answer,
			Citations:  []Citation{},
			TotalCount: 0,
		}
	}

	citations := make([]Citation, 0, a.maxCitations)

	for i, r := range results {
		if i >= a.maxCitations {
			break
		}

		// 查找答案中是否包含此结果的内容
		position := a.findInAnswer(r.Content, answer)

		citation := Citation{
			DocumentID: r.ID,
			Content:    r.Content,
			Score:      r.RerankScore,
			Position:   position,
			Level:      CitationLevelBasic,
		}
		citations = append(citations, citation)
	}

	return &CitationResult{
		Answer:     answer,
		Citations:  citations,
		TotalCount: len(citations),
		Metadata: CitationMetadata{
			Format:   a.getFormatString(),
			Coverage: a.calculateCoverage(answer, citations),
		},
	}
}

// AssembleWithLevel 组装带层级的引用
func (a *CitationAssembler) AssembleWithLevel(query string, results []*SearchResult, subAnswers map[string][]*SearchResult) *CitationResult {
	if len(results) == 0 && len(subAnswers) == 0 {
		return &CitationResult{
			Answer:     "",
			Citations:  []Citation{},
			TotalCount: 0,
		}
	}

	var builder strings.Builder
	var citations []Citation

	// 按顺序拼接子问题答案
	for key, subResult := range subAnswers {
		builder.WriteString(fmt.Sprintf("【%s】\n", key))

		// 添加该子问题对应的引用
		for i, result := range subResult {
			if i >= a.maxCitations {
				break
			}

			builder.WriteString(result.Content)
			builder.WriteString("\n\n")

			citations = append(citations, Citation{
				DocumentID: result.ID,
				Content:    result.Content,
				Score:      result.RerankScore,
				Position:   -1,
				Level:      CitationLevelMulti,
			})
		}
	}

	// 添加顶层引用（如果有）
	if len(results) > 0 {
		builder.WriteString("【综合参考】\n")
		for i, r := range results {
			if i >= a.maxCitations {
				break
			}

			builder.WriteString(fmt.Sprintf("[%d] %s\n", i+1, r.Content))

			citations = append(citations, Citation{
				DocumentID: r.ID,
				Content:    r.Content,
				Score:      r.RerankScore,
				Position:   -1,
				Level:      CitationLevelNested,
			})
		}
	}

	return &CitationResult{
		Answer:     builder.String(),
		Citations:  citations,
		TotalCount: len(citations),
		Metadata: CitationMetadata{
			Format:       a.getFormatString(),
			OverlapRatio: a.calculateOverlapRatio(citations),
			Coverage:     a.calculateCoverage(builder.String(), citations),
		},
	}
}

// AssembleNested 组装嵌套引用（多级来源追溯）
func (a *CitationAssembler) AssembleNested(query string, results []*SearchResult, answer string, sources []*NestedSource) *CitationResult {
	if len(results) == 0 {
		return &CitationResult{
			Answer:     answer,
			Citations:  []Citation{},
			TotalCount: 0,
		}
	}

	var builder strings.Builder
	var citations []Citation

	// 写入答案
	builder.WriteString(answer)
	builder.WriteString("\n\n")

	// 添加引用来源
	builder.WriteString("【引用来源】\n")
	for i, result := range results {
		if i >= a.maxCitations {
			break
		}

		source := fmt.Sprintf("[%d] %s (相关度: %.2f)", i+1, result.Content, result.Score)
		builder.WriteString(source)
		builder.WriteString("\n")

		citations = append(citations, Citation{
			DocumentID: result.ID,
			Content:    result.Content,
			Score:      result.RerankScore,
			Position:   strings.Index(answer, result.Content),
			Level:      CitationLevelNested,
		})
	}

	// 添加嵌套来源（如果有）
	if a.enableNested && len(sources) > 0 {
		builder.WriteString("\n【详细来源】\n")
		for i, src := range sources {
			builder.WriteString(fmt.Sprintf("  [%d] %s: %s\n", i+1, src.Title, src.Reference))
			citations = append(citations, Citation{
				DocumentID: src.DocumentID,
				Content:    src.Reference,
				Score:      src.Score,
				Position:   -1,
				Level:      CitationLevelNested,
			})
		}
	}

	return &CitationResult{
		Answer:     builder.String(),
		Citations:  citations,
		TotalCount: len(citations),
		Metadata: CitationMetadata{
			Format:       "nested",
			OverlapRatio: a.calculateOverlapRatio(citations),
			Coverage:     a.calculateCoverage(answer, citations),
		},
	}
}

// NestedSource 嵌套来源
type NestedSource struct {
	DocumentID string  `json:"document_id"`
	Title      string  `json:"title"`
	Reference  string  `json:"reference"`
	Score      float64 `json:"score"`
}

// findInAnswer 查找内容在答案中的位置
func (a *CitationAssembler) findInAnswer(content, answer string) int {
	// 简单的字符串匹配
	idx := strings.Index(answer, content)
	if idx >= 0 {
		return idx
	}

	// 尝试模糊匹配
	words := strings.Fields(content)
	if len(words) > 3 {
		// 使用前几个词匹配
		prefix := strings.Join(words[:3], " ")
		idx = strings.Index(answer, prefix)
		if idx >= 0 {
			return idx
		}
	}

	return -1
}

// AssembleWithAttribution 组装带来源追溯的引用
func (a *CitationAssembler) AssembleWithAttribution(query string, results []*SearchResult, subAnswers map[string]string) *CitationResult {
	var builder strings.Builder
	var citations []Citation

	// 按顺序拼接子问题答案
	for key, answer := range subAnswers {
		builder.WriteString(answer)
		builder.WriteString("\n\n")

		// 添加对应引用
		for _, result := range results {
			if result.ID == key {
				citations = append(citations, Citation{
					DocumentID: result.ID,
					Content:    result.Content,
					Score:      result.RerankScore,
					Position:   -1,
					Level:      CitationLevelMulti,
				})
				break
			}
		}
	}

	return &CitationResult{
		Answer:     builder.String(),
		Citations:  citations,
		TotalCount: len(citations),
		Metadata: CitationMetadata{
			Format:   "multi",
			Coverage: a.calculateCoverage(builder.String(), citations),
		},
	}
}

// FormatAsInline 格式化为行内引用
func (a *CitationAssembler) FormatAsInline(answer string, citations []Citation) string {
	if len(citations) == 0 {
		return answer
	}

	// 使用 [1][2][3] 格式添加行内引用
	var sb strings.Builder
	var currentIdx int

	for i, r := range citations {
		if r.Position >= 0 && r.Position < len(answer) {
			// 在正确位置插入引用标记
			sb.WriteString(answer[currentIdx:r.Position])
			sb.WriteString(fmt.Sprintf("[%d]", i+1))
			currentIdx = r.Position + len(r.Content)
		}
	}

	// 添加剩余内容
	if currentIdx < len(answer) {
		sb.WriteString(answer[currentIdx:])
	}

	return sb.String()
}

// FormatAsSuperscript 格式化为上标引用
func (a *CitationAssembler) FormatAsSuperscript(answer string, citations []Citation) string {
	if len(citations) == 0 {
		return answer
	}

	// 使用上标格式 [1]
	var sb strings.Builder
	var currentIdx int

	for i, r := range citations {
		if r.Position >= 0 && r.Position < len(answer) {
			sb.WriteString(answer[currentIdx:r.Position])
			sb.WriteString(fmt.Sprintf("^%d^", i+1))
			currentIdx = r.Position + len(r.Content)
		}
	}

	if currentIdx < len(answer) {
		sb.WriteString(answer[currentIdx:])
	}

	return sb.String()
}

// FormatAsFootnote 格式化为脚注引用
func (a *CitationAssembler) FormatAsFootnote(answer string, citations []Citation) string {
	if len(citations) == 0 {
		return answer
	}

	var sb strings.Builder
	sb.WriteString(answer)
	sb.WriteString("\n\n---\n")
	sb.WriteString("【引用】\n")

	for i, c := range citations {
		sb.WriteString(fmt.Sprintf("[%d] %s\n", i+1, truncateString(c.Content, 100)))
	}

	return sb.String()
}

// truncateString 截断字符串
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// getFormatString 获取格式字符串
func (a *CitationAssembler) getFormatString() string {
	switch a.format {
	case CitationLevelBasic:
		return "basic"
	case CitationLevelMulti:
		return "multi"
	case CitationLevelNested:
		return "nested"
	default:
		return "basic"
	}
}

// calculateCoverage 计算覆盖率
func (a *CitationAssembler) calculateCoverage(answer string, citations []Citation) float64 {
	if len(answer) == 0 || len(citations) == 0 {
		return 0.0
	}

	covered := 0
	for _, c := range citations {
		if c.Position >= 0 {
			covered += len(c.Content)
		}
	}

	coverage := float64(covered) / float64(len(answer))
	if coverage > 1.0 {
		coverage = 1.0
	}
	return coverage
}

// calculateOverlapRatio 计算重叠率
func (a *CitationAssembler) calculateOverlapRatio(citations []Citation) float64 {
	if len(citations) <= 1 {
		return 0.0
	}

	totalOverlap := 0
	pairCount := 0

	for i := 0; i < len(citations); i++ {
		for j := i + 1; j < len(citations); j++ {
			overlap := a.calculateOverlap(citations[i].Content, citations[j].Content)
			totalOverlap += overlap
			pairCount++
		}
	}

	if pairCount == 0 {
		return 0.0
	}

	return float64(totalOverlap) / float64(pairCount)
}

// calculateOverlap 计算两个内容的重叠度
func (a *CitationAssembler) calculateOverlap(contentA, contentB string) int {
	wordsA := strings.Fields(contentA)
	wordsB := strings.Fields(contentB)

	wordSetB := make(map[string]bool)
	for _, w := range wordsB {
		wordSetB[w] = true
	}

	overlap := 0
	for _, w := range wordsA {
		if wordSetB[w] {
			overlap++
		}
	}

	return overlap
}

// sortByScore 按分数排序
func (a *CitationAssembler) sortByScore(citations []Citation) {
	sort.Slice(citations, func(i, j int) bool {
		return citations[i].Score > citations[j].Score
	})
}

// Deduplicate 去重
func (a *CitationAssembler) Deduplicate(citations []Citation) []Citation {
	seen := make(map[string]bool)
	var deduped []Citation

	for _, c := range citations {
		key := c.DocumentID + ":" + truncateString(c.Content, 50)
		if !seen[key] {
			seen[key] = true
			deduped = append(deduped, c)
		}
	}

	return deduped
}
