/**
 * RetrievalEngine - 检索引擎
 *
 * 企业级设计：
 * - 协调多通道检索（知识库）和MCP工具调用
 * - 对检索结果进行重排序和格式化
 * - 并行执行MCP工具调用
 * - 支持意图定向检索策略
 *
 * 核心功能：
 * 1. 多通道并行检索：向量检索、关键词检索、意图定向检索
 * 2. MCP工具协调：并行执行工具调用，整合工具结果
 * 3. 结果后处理：去重、重排序、格式化
 * 4. 检索策略路由：根据意图选择最佳检索策略
 */

package rag

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

// IntentType 意图类型
type IntentType string

const (
	IntentKnowledge  IntentType = "knowledge"  // 知识问答
	IntentToolUse   IntentType = "tool_use"   // 工具调用
	IntentComparison IntentType = "comparison"  // 比较类
	IntentProcedure IntentType = "procedure"   // 步骤流程
	IntentCasual    IntentType = "casual"     // 闲聊
)

// RetrievalEngine 检索引擎
type RetrievalEngine struct {
	coordinator  SearchCoordinatorInterface
	reranker     Reranker
	mcpExecutor  MCPExecutor
	intentRouter IntentRouter

	// 配置
	config *RetrievalConfig

	// 统计
	stats RetrievalStats

	// 并发控制
	mu sync.RWMutex
}

// SearchCoordinatorInterface 检索协调器接口
type SearchCoordinatorInterface interface {
	Search(ctx context.Context, query string, options *SearchOptions) (*SearchResultWrapper, error)
	RegisterChannel(channel SearchChannelInterface)
	UnregisterChannel(name string)
}

// SearchChannelInterface 检索通道接口
type SearchChannelInterface interface {
	Name() string
	Search(ctx context.Context, query string, topK int) ([]*SearchResult, error)
	Weight() float64
}

// SearchOptions 搜索选项
type SearchOptions struct {
	MaxResults int
	Channels   []string
	Filters    map[string]interface{}
}

// SearchResultWrapper 搜索结果包装
type SearchResultWrapper struct {
	Results  []*SearchResult
	Metadata SearchMetadataWrapper
}

// SearchMetadataWrapper 搜索元数据包装
type SearchMetadataWrapper struct {
	TotalResults  int
	ChannelsUsed  []string
	Latency       int64
	Strategy      string
	PostProcessingEnabled bool
	RerankerEnabled bool
}

// RetrievalConfig 检索引擎配置
type RetrievalConfig struct {
	TopK              int           // 默认返回数量
	EnableMCP         bool          // 是否启用MCP工具调用
	EnableRerank      bool          // 是否启用重排序
	ParallelToolCalls int           // 并行工具调用数
	ToolTimeout       time.Duration // 工具调用超时
	MinConfidence     float64       // 最低置信度
	IntentThreshold   float64       // 意图识别阈值
}

// DefaultRetrievalConfig 默认配置
var DefaultRetrievalConfig = &RetrievalConfig{
	TopK:              5,
	EnableMCP:         true,
	EnableRerank:      true,
	ParallelToolCalls: 3,
	ToolTimeout:       30 * time.Second,
	MinConfidence:     0.3,
	IntentThreshold:   0.5,
}

// RetrievalStats 检索统计
type RetrievalStats struct {
	TotalRetrievals     int64
	KnowledgeRetrievals int64
	ToolRetrievals     int64
	HybridRetrievals   int64
	AverageLatencyMs   float64
	TotalMCPToolCalls  int64
	MCPToolSuccesses   int64
	MCPToolFailures    int64
}

// IntentRouter 意图路由器接口
type IntentRouter interface {
	// Route 根据查询识别意图
	Route(ctx context.Context, query string) (IntentType, float64, error)
}

// MCPExecutor MCP工具执行器接口
type MCPExecutor interface {
	// ExecuteTools 并行执行多个工具
	ExecuteTools(ctx context.Context, tools []ToolCall) ([]ToolResult, error)
	// GetAvailableTools 获取可用工具列表
	GetAvailableTools(ctx context.Context) ([]ToolInfo, error)
}

// ToolCall 工具调用请求
type ToolCall struct {
	ID      string                 `json:"id"`      // 调用ID
	Name    string                 `json:"name"`    // 工具名称
	Args    map[string]interface{} `json:"args"`    // 工具参数
	Timeout time.Duration          `json:"timeout"` // 超时时间
}

// ToolResult 工具执行结果
type ToolResult struct {
	ID     string                 `json:"id"`     // 调用ID
	Name   string                 `json:"name"`   // 工具名称
	Output map[string]interface{} `json:"output"` // 输出结果
	Error  string                 `json:"error"`  // 错误信息
	Time   int64                  `json:"time"`   // 执行时间(ms)
}

// ToolInfo 工具信息
type ToolInfo struct {
	Name        string                 `json:"name"`         // 工具名称
	Description string                 `json:"description"`  // 工具描述
	Parameters  map[string]interface{} `json:"parameters"`   // 参数定义
}

// RetrievalResult 检索结果
type RetrievalResult struct {
	Results      []*SearchResult   `json:"results"`      // 知识库检索结果
	ToolResults  []ToolResult      `json:"toolResults"`  // MCP工具执行结果
	Intent       IntentType        `json:"intent"`       // 识别的意图
	Confidence   float64           `json:"confidence"`   // 意图置信度
	UsedChannels []string          `json:"usedChannels"` // 使用的检索通道
	LatencyMs    int64             `json:"latencyMs"`    // 检索延迟
	Reranked     bool              `json:"reranked"`     // 是否经过重排序
	Metadata     map[string]interface{} `json:"metadata"` // 额外元数据
}

// NewRetrievalEngine 创建检索引擎
func NewRetrievalEngine(config *RetrievalConfig) *RetrievalEngine {
	if config == nil {
		config = DefaultRetrievalConfig
	}

	return &RetrievalEngine{
		config: config,
		stats:  RetrievalStats{},
	}
}

// SetCoordinator 设置检索协调器
func (e *RetrievalEngine) SetCoordinator(coordinator SearchCoordinatorInterface) {
	e.coordinator = coordinator
}

// SetReranker 设置重排序器
func (e *RetrievalEngine) SetReranker(reranker Reranker) {
	e.reranker = reranker
}

// SetMCPExecutor 设置MCP执行器
func (e *RetrievalEngine) SetMCPExecutor(executor MCPExecutor) {
	e.mcpExecutor = executor
}

// SetIntentRouter 设置意图路由器
func (e *RetrievalEngine) SetIntentRouter(router IntentRouter) {
	e.intentRouter = router
}

// Retrieve 执行检索
func (e *RetrievalEngine) Retrieve(ctx context.Context, query string, options *RetrievalOptions) (*RetrievalResult, error) {
	startTime := time.Now()
	e.stats.TotalRetrievals++

	result := &RetrievalResult{
		Intent:     IntentKnowledge,
		Confidence: 0.5,
		Metadata:   make(map[string]interface{}),
	}

	// 1. 意图识别
	intent := IntentKnowledge
	confidence := 0.5
	if e.intentRouter != nil {
		intent, confidence, _ = e.intentRouter.Route(ctx, query)
	}
	result.Intent = intent
	result.Confidence = confidence

	// 2. 根据意图选择检索策略
	var err error
	switch intent {
	case IntentKnowledge:
		e.stats.KnowledgeRetrievals++
		result.Results, err = e.retrieveKnowledge(ctx, query, options)
	case IntentToolUse:
		e.stats.ToolRetrievals++
		result.Results, result.ToolResults, err = e.retrieveWithTools(ctx, query, options)
	case IntentComparison, IntentProcedure:
		e.stats.HybridRetrievals++
		result.Results, result.ToolResults, err = e.retrieveHybrid(ctx, query, options)
	default:
		e.stats.KnowledgeRetrievals++
		result.Results, err = e.retrieveKnowledge(ctx, query, options)
	}

	if err != nil {
		return result, err
	}

	// 3. 重排序
	if e.config.EnableRerank && e.reranker != nil && len(result.Results) > 0 {
		result.Results, _ = e.reranker.Rerank(ctx, query, result.Results)
		result.Reranked = true
	}

	// 4. 格式化结果
	result.LatencyMs = time.Since(startTime).Milliseconds()

	e.updateLatency(startTime)
	return result, nil
}

// RetrievalOptions 检索选项
type RetrievalOptions struct {
	TopK        int
	Channels    []string
	Filters     map[string]interface{}
	EnableTools bool
	ToolNames   []string
}

// retrieveKnowledge 知识库检索
func (e *RetrievalEngine) retrieveKnowledge(ctx context.Context, query string, options *RetrievalOptions) ([]*SearchResult, error) {
	topK := e.config.TopK
	if options != nil && options.TopK > 0 {
		topK = options.TopK
	}

	if e.coordinator == nil {
		return []*SearchResult{}, nil
	}

	searchOptions := &SearchOptions{
		MaxResults: topK * 2, // 多检索一些用于重排序
	}
	if options != nil {
		searchOptions.Channels = options.Channels
		searchOptions.Filters = options.Filters
	}

	searchResult, err := e.coordinator.Search(ctx, query, searchOptions)
	if err != nil {
		return nil, err
	}

	results := searchResult.Results

	if len(results) > topK {
		results = results[:topK]
	}

	return results, nil
}

// retrieveWithTools 检索并调用工具
func (e *RetrievalEngine) retrieveWithTools(ctx context.Context, query string, options *RetrievalOptions) ([]*SearchResult, []ToolResult, error) {
	var results []*SearchResult
	var toolResults []ToolResult

	// 1. 并行执行知识库检索和工具调用
	type parallelResult struct {
		knowledgeResults []*SearchResult
		toolResults       []ToolResult
		err               error
	}

	resultCh := make(chan parallelResult, 1)

	go func() {
		kr, err := e.retrieveKnowledge(ctx, query, options)
		resultCh <- parallelResult{knowledgeResults: kr, err: err}
	}()

	// 工具调用
	var tools []ToolCall
	if e.config.EnableMCP && e.mcpExecutor != nil {
		tools = e.suggestTools(query)
		if len(tools) > 0 {
			toolResults, _ = e.executeToolsParallel(ctx, tools)
			e.stats.TotalMCPToolCalls += int64(len(tools))
		}
	}

	pr := <-resultCh
	if pr.err != nil {
		return nil, toolResults, pr.err
	}
	results = pr.knowledgeResults

	return results, toolResults, nil
}

// retrieveHybrid 混合检索
func (e *RetrievalEngine) retrieveHybrid(ctx context.Context, query string, options *RetrievalOptions) ([]*SearchResult, []ToolResult, error) {
	// 对于复杂问题，先拆分再检索
	var results []*SearchResult
	var toolResults []ToolResult

	// 知识库检索
	knowledgeResults, err := e.retrieveKnowledge(ctx, query, options)
	if err != nil {
		return nil, nil, err
	}
	results = knowledgeResults

	// 如果是步骤类问题，调用相关工具获取补充信息
	if e.config.EnableMCP && e.mcpExecutor != nil {
		tools := e.suggestTools(query)
		if len(tools) > 0 {
			toolResults, _ = e.executeToolsParallel(ctx, tools)
		}
	}

	return results, toolResults, nil
}

// suggestTools 根据查询建议相关工具
func (e *RetrievalEngine) suggestTools(query string) []ToolCall {
	// 简单的工具建议逻辑 - 预留扩展接口
	return []ToolCall{}
}

// executeToolsParallel 并行执行工具
func (e *RetrievalEngine) executeToolsParallel(ctx context.Context, tools []ToolCall) ([]ToolResult, error) {
	if len(tools) == 0 {
		return []ToolResult{}, nil
	}

	if e.mcpExecutor == nil {
		return []ToolResult{}, nil
	}

	// 限制并发数
	maxParallel := e.config.ParallelToolCalls
	if maxParallel <= 0 {
		maxParallel = 3
	}

	semaphore := make(chan struct{}, maxParallel)
	var wg sync.WaitGroup
	results := make([]ToolResult, len(tools))
	errors := make([]error, 0)
	var mu sync.Mutex

	for i, tool := range tools {
		wg.Add(1)
		go func(idx int, t ToolCall) {
			defer wg.Done()

			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			start := time.Now()

			// 设置超时
			timeout := e.config.ToolTimeout
			if t.Timeout > 0 {
				timeout = t.Timeout
			}

			toolCtx, cancel := context.WithTimeout(ctx, timeout)
			defer cancel()

			// 执行工具
			toolResults, err := e.mcpExecutor.ExecuteTools(toolCtx, []ToolCall{t})
			mu.Lock()
			if err != nil {
				errors = append(errors, err)
				e.stats.MCPToolFailures++
				results[idx] = ToolResult{
					ID:    t.ID,
					Name:  t.Name,
					Error: err.Error(),
					Time:  time.Since(start).Milliseconds(),
				}
			} else if len(toolResults) > 0 {
				results[idx] = toolResults[0]
				e.stats.MCPToolSuccesses++
			}
			mu.Unlock()
		}(i, tool)
	}

	wg.Wait()

	if len(errors) > 0 && len(results) == 0 {
		return results, errors[0]
	}

	return results, nil
}

// FormatResults 格式化检索结果
func (e *RetrievalEngine) FormatResults(results []*SearchResult, format string) string {
	if len(results) == 0 {
		return ""
	}

	switch format {
	case "compact":
		return e.formatCompact(results)
	case "detailed":
		return e.formatDetailed(results)
	default:
		return e.formatCompact(results)
	}
}

// formatCompact 紧凑格式
func (e *RetrievalEngine) formatCompact(results []*SearchResult) string {
	var sb strings.Builder
	for i, r := range results {
		if i > 0 {
			sb.WriteString("\n---\n")
		}
		sb.WriteString(r.Content)
	}
	return sb.String()
}

// formatDetailed 详细格式
func (e *RetrievalEngine) formatDetailed(results []*SearchResult) string {
	var sb strings.Builder
	for i, r := range results {
		if i > 0 {
			sb.WriteString("\n---\n")
		}
		sb.WriteString(fmt.Sprintf("[%d] Score: %.4f\n", i+1, r.Score))
		sb.WriteString(r.Content)
		if len(r.Metadata) > 0 {
			if source, ok := r.Metadata["source"].(string); ok {
				sb.WriteString(fmt.Sprintf("\n来源: %s", source))
			}
		}
	}
	return sb.String()
}

// updateLatency 更新延迟统计
func (e *RetrievalEngine) updateLatency(startTime time.Time) {
	latency := time.Since(startTime).Milliseconds()
	total := e.stats.TotalRetrievals
	if total > 0 {
		e.stats.AverageLatencyMs = (e.stats.AverageLatencyMs*float64(total-1) + float64(latency)) / float64(total)
	}
}

// GetStats 获取统计信息
func (e *RetrievalEngine) GetStats() *RetrievalStats {
	e.mu.RLock()
	defer e.mu.RUnlock()
	stats := e.stats
	return &stats
}

// ResetStats 重置统计
func (e *RetrievalEngine) ResetStats() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.stats = RetrievalStats{}
}

// MergeResults 合并知识检索和工具结果
func (e *RetrievalEngine) MergeResults(knowledge []*SearchResult, tools []ToolResult) *MergedResult {
	result := &MergedResult{
		KnowledgeSources: knowledge,
		ToolOutputs:      tools,
		KnowledgeCount:   len(knowledge),
		ToolCount:        len(tools),
	}

	// 按分数排序知识结果
	sort.Slice(result.KnowledgeSources, func(i, j int) bool {
		return result.KnowledgeSources[i].Score > result.KnowledgeSources[j].Score
	})

	return result
}

// MergedResult 合并后的结果
type MergedResult struct {
	KnowledgeSources []*SearchResult `json:"knowledgeSources"`
	ToolOutputs     []ToolResult     `json:"toolOutputs"`
	KnowledgeCount  int              `json:"knowledgeCount"`
	ToolCount       int              `json:"toolCount"`
}

// AddSearchChannel 添加检索通道
func (e *RetrievalEngine) AddSearchChannel(channel SearchChannelInterface) {
	if e.coordinator != nil {
		e.coordinator.RegisterChannel(channel)
	}
}

// RemoveSearchChannel 移除检索通道
func (e *RetrievalEngine) RemoveSearchChannel(name string) {
	if e.coordinator != nil {
		e.coordinator.UnregisterChannel(name)
	}
}
