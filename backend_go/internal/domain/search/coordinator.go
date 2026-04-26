/**
 * SearchCoordinator - 检索协调器
 *
 * 功能说明：
 * - 管理多个检索通道的协调执行
 * - 支持并行/串行检索策略
 * - 结果合并与去重
 * - 通道权重配置
 *
 * 设计模式：
 * - 策略模式：不同通道可插拔
 * - 组合模式：多个通道协同工作
 * - 装饰器模式：结果后处理链
 */

package search

import (
	"context"
	"sync"
	"time"

	"github.com/ai-chat/backend_go/internal/domain/rag"
)

// SearchChannel 检索通道接口
type SearchChannel interface {
	// Search 执行搜索
	Search(ctx context.Context, query string, topK int) ([]*rag.SearchResult, error)
	// Name 获取通道名称
	Name() string
	// Weight 获取通道权重
	Weight() float64
}

// CoordinatorConfig 协调器配置
type CoordinatorConfig struct {
	Strategy     string // 检索策略: parallel | sequential | weighted
	DefaultMaxResults int
	Concurrency int // 并发数
	RerankerEnabled bool
	PostProcessingEnabled bool
}

// DefaultCoordinatorConfig 默认配置
var DefaultCoordinatorConfig = &CoordinatorConfig{
	Strategy:     "parallel",
	DefaultMaxResults: 10,
	Concurrency:  5,
	RerankerEnabled: true,
	PostProcessingEnabled: true,
}

// SearchCoordinator 检索协调器
type SearchCoordinator struct {
	config     *CoordinatorConfig
	channels   map[string]SearchChannel
	strategy   string
	maxResults int
	threadPool *ThreadPoolExecutor
	reranker   rag.Reranker
	stats      CoordinatorStats
	mu         sync.RWMutex
}

// CoordinatorStats 协调器统计
type CoordinatorStats struct {
	TotalRequests       int64
	ParallelExecutions  int64
	SequentialExecutions int64
	ChannelStats        map[string]*ChannelStats
	TotalLatencyMs     int64
}

// ChannelStats 通道统计
type ChannelStats struct {
	Requests    int64
	Failures    int64
	AvgLatency  float64
	TotalLatency int64
}

// NewSearchCoordinator 创建检索协调器
func NewSearchCoordinator(config *CoordinatorConfig) *SearchCoordinator {
	if config == nil {
		config = DefaultCoordinatorConfig
	}

	return &SearchCoordinator{
		config:     config,
		channels:   make(map[string]SearchChannel),
		strategy:   config.Strategy,
		maxResults: config.DefaultMaxResults,
		threadPool: NewThreadPoolExecutor(config.Concurrency),
		stats: CoordinatorStats{
			ChannelStats: make(map[string]*ChannelStats),
		},
	}
}

// RegisterChannel 注册检索通道
func (c *SearchCoordinator) RegisterChannel(channel SearchChannel) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.channels[channel.Name()] = channel
	c.stats.ChannelStats[channel.Name()] = &ChannelStats{}
}

// UnregisterChannel 注销检索通道
func (c *SearchCoordinator) UnregisterChannel(name string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	delete(c.channels, name)
	delete(c.stats.ChannelStats, name)
}

// GetChannels 获取通道列表
func (c *SearchCoordinator) GetChannels() []SearchChannel {
	c.mu.RLock()
	defer c.mu.RUnlock()

	channels := make([]SearchChannel, 0, len(c.channels))
	for _, ch := range c.channels {
		channels = append(channels, ch)
	}
	return channels
}

// SetReranker 设置重排序器
func (c *SearchCoordinator) SetReranker(reranker rag.Reranker) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.reranker = reranker
}

// SetRerankerEnabled 启用/禁用重排序
func (c *SearchCoordinator) SetRerankerEnabled(enabled bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.config.RerankerEnabled = enabled
}

// SetPostProcessingEnabled 启用/禁用后处理
func (c *SearchCoordinator) SetPostProcessingEnabled(enabled bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.config.PostProcessingEnabled = enabled
}

// SetConcurrency 设置并发数
func (c *SearchCoordinator) SetConcurrency(concurrency int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.threadPool.SetConcurrency(concurrency)
}

// SearchOptions 搜索选项
type SearchOptions struct {
	Channels   []string // 指定通道，默认全部
	MaxResults int      // 最大结果数
	Strategy   string   // 检索策略: parallel | sequential | weighted
	Filters    map[string]interface{} // 过滤器
	EnableRerank bool  // 是否启用重排序
	FusionType string  // 融合方式: RRFS | RRF | weighted
}

// SearchResult 搜索结果
type SearchResult struct {
	Query      string
	Results    []*rag.SearchResult
	Metadata   SearchMetadata
}

// SearchMetadata 搜索元数据
type SearchMetadata struct {
	TotalResults   int
	ChannelsUsed  []string
	Latency       int64
	Strategy      string
	PostProcessingEnabled bool
	RerankerEnabled bool
}

// Search 执行检索
func (c *SearchCoordinator) Search(ctx context.Context, query string, options *SearchOptions) (*SearchResult, error) {
	startTime := time.Now()
	c.stats.TotalRequests++

	// 确定要使用的通道
	targetChannels := c.getTargetChannels(options)

	if len(targetChannels) == 0 {
		return &SearchResult{
			Query:   query,
			Results: []*rag.SearchResult{},
			Metadata: SearchMetadata{
				TotalResults:  0,
				ChannelsUsed:  []string{},
				Latency:      time.Since(startTime).Milliseconds(),
				Strategy:     options.Strategy,
			},
		}, nil
	}

	// 根据策略执行检索
	var channelResults []*ChannelSearchResult
	var err error

	strategy := c.strategy
	if options != nil && options.Strategy != "" {
		strategy = options.Strategy
	}

	switch strategy {
	case "parallel":
		c.stats.ParallelExecutions++
		channelResults, err = c.executeSearchChannelsParallel(ctx, query, targetChannels, options)
	case "sequential":
		c.stats.SequentialExecutions++
		channelResults, err = c.executeSearchChannelsSequential(ctx, query, targetChannels, options)
	case "weighted":
		c.stats.ParallelExecutions++
		channelResults, err = c.executeSearchChannelsWeighted(ctx, query, targetChannels, options)
	default:
		c.stats.ParallelExecutions++
		channelResults, err = c.executeSearchChannelsParallel(ctx, query, targetChannels, options)
	}

	if err != nil {
		return nil, err
	}

	// 结果融合
	fusedResults := c.fuseResults(channelResults, options)

	// 后处理
	if c.config.PostProcessingEnabled {
		fusedResults = c.executePostProcessors(fusedResults, options)
	}

	// 领域层重排序
	if c.config.RerankerEnabled && c.reranker != nil {
		fusedResults, _ = c.reranker.Rerank(ctx, query, fusedResults)
	}

	// 截取最终结果
	maxResults := c.maxResults
	if options != nil && options.MaxResults > 0 {
		maxResults = options.MaxResults
	}

	finalResults := fusedResults
	if len(finalResults) > maxResults {
		finalResults = finalResults[:maxResults]
	}

	// 记录统计
	latency := time.Since(startTime).Milliseconds()
	c.stats.TotalLatencyMs += latency
	c.recordLatencyStats(targetChannels, latency)

	channelNames := make([]string, len(targetChannels))
	for i, ch := range targetChannels {
		channelNames[i] = ch.Name()
	}

	return &SearchResult{
		Query:   query,
		Results: finalResults,
		Metadata: SearchMetadata{
			TotalResults:   len(finalResults),
			ChannelsUsed:   channelNames,
			Latency:       latency,
			Strategy:      strategy,
			PostProcessingEnabled: c.config.PostProcessingEnabled,
			RerankerEnabled: c.config.RerankerEnabled,
		},
	}, nil
}

// ChannelSearchResult 通道搜索结果
type ChannelSearchResult struct {
	Channel string
	Type    string
	Weight  float64
	Results []*rag.SearchResult
	Error   error
}

// getTargetChannels 获取目标通道
func (c *SearchCoordinator) getTargetChannels(options *SearchOptions) []SearchChannel {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if options == nil || options.Channels == nil || len(options.Channels) == 0 {
		channels := make([]SearchChannel, 0, len(c.channels))
		for _, ch := range c.channels {
			channels = append(channels, ch)
		}
		return channels
	}

	channels := make([]SearchChannel, 0, len(options.Channels))
	for _, name := range options.Channels {
		if ch, ok := c.channels[name]; ok {
			channels = append(channels, ch)
		}
	}
	return channels
}

// executeSearchChannelsParallel 并行执行所有检索通道
func (c *SearchCoordinator) executeSearchChannelsParallel(ctx context.Context, query string, channels []SearchChannel, options *SearchOptions) ([]*ChannelSearchResult, error) {
	maxResults := c.maxResults
	if options != nil && options.MaxResults > 0 {
		maxResults = options.MaxResults
	}

	var wg sync.WaitGroup
	results := make([]*ChannelSearchResult, len(channels))
	errors := make([]error, 0)

	for i, channel := range channels {
		wg.Add(1)
		go func(idx int, ch SearchChannel) {
			defer wg.Done()

			start := time.Now()
			searchResults, err := ch.Search(ctx, query, maxResults*3)
			latency := time.Since(start).Milliseconds()

			result := &ChannelSearchResult{
				Channel: ch.Name(),
				Type:    "vector", // 假设
				Weight:  ch.Weight(),
				Results: searchResults,
				Error:   err,
			}

			c.mu.Lock()
			if stats, ok := c.stats.ChannelStats[ch.Name()]; ok {
				stats.Requests++
				stats.TotalLatency += latency
				if stats.Requests > 0 {
					stats.AvgLatency = float64(stats.TotalLatency) / float64(stats.Requests)
				}
				if err != nil {
					stats.Failures++
				}
			}
			c.mu.Unlock()

			results[idx] = result
			if err != nil {
				errors = append(errors, err)
			}
		}(i, channel)
	}

	wg.Wait()

	if len(errors) > 0 && len(results) == 0 {
		return nil, errors[0]
	}

	return results, nil
}

// executeSearchChannelsSequential 串行执行检索通道
func (c *SearchCoordinator) executeSearchChannelsSequential(ctx context.Context, query string, channels []SearchChannel, options *SearchOptions) ([]*ChannelSearchResult, error) {
	maxResults := c.maxResults
	if options != nil && options.MaxResults > 0 {
		maxResults = options.MaxResults
	}

	results := make([]*ChannelSearchResult, 0)

	for _, channel := range channels {
		start := time.Now()
		searchResults, err := channel.Search(ctx, query, maxResults*2)
		latency := time.Since(start).Milliseconds()

		result := &ChannelSearchResult{
			Channel: channel.Name(),
			Type:    "vector",
			Weight:  channel.Weight(),
			Results: searchResults,
			Error:   err,
		}

		c.mu.Lock()
		if stats, ok := c.stats.ChannelStats[channel.Name()]; ok {
			stats.Requests++
			stats.TotalLatency += latency
			if stats.Requests > 0 {
				stats.AvgLatency = float64(stats.TotalLatency) / float64(stats.Requests)
			}
			if err != nil {
				stats.Failures++
			}
		}
		c.mu.Unlock()

		results = append(results, result)

		// 如果结果足够，停止检索
		totalResults := 0
		for _, r := range results {
			totalResults += len(r.Results)
		}
		if totalResults >= maxResults*2 {
			break
		}
	}

	return results, nil
}

// executeSearchChannelsWeighted 加权执行检索通道
func (c *SearchCoordinator) executeSearchChannelsWeighted(ctx context.Context, query string, channels []SearchChannel, options *SearchOptions) ([]*ChannelSearchResult, error) {
	// 加权模式下，先并行查询，再根据权重调整得分
	return c.executeSearchChannelsParallel(ctx, query, channels, options)
}

// fuseResults 结果融合
func (c *SearchCoordinator) fuseResults(channelResults []*ChannelSearchResult, options *SearchOptions) []*rag.SearchResult {
	if len(channelResults) == 0 {
		return []*rag.SearchResult{}
	}

	if len(channelResults) == 1 {
		return channelResults[0].Results
	}

	fusionType := "RRFS"
	if options != nil && options.FusionType != "" {
		fusionType = options.FusionType
	}

	seen := make(map[string]*rag.SearchResult)
	sources := make(map[string][]SourceInfo)

	// 收集所有结果
	for _, cr := range channelResults {
		for rank, result := range cr.Results {
			if _, exists := seen[result.ID]; !exists {
				seen[result.ID] = &rag.SearchResult{
					ID:         result.ID,
					Content:    result.Content,
					Score:      result.Score,
					Metadata:   result.Metadata,
					RerankScore: result.Score,
				}
				sources[result.ID] = []SourceInfo{}
			}

			sources[result.ID] = append(sources[result.ID], SourceInfo{
				Channel: cr.Channel,
				Rank:    rank + 1,
				Weight:  cr.Weight,
			})

			// 融合得分
			fusedScore := c.calculateFusedScore(rank+1, cr.Weight, fusionType)
			seen[result.ID].Score += fusedScore
		}
	}

	// 转换为结果数组
	fused := make([]*rag.SearchResult, 0, len(seen))
	for _, result := range seen {
		fused = append(fused, result)
	}

	// 按融合得分排序
	for i := 0; i < len(fused); i++ {
		for j := i + 1; j < len(fused); j++ {
			if fused[j].Score > fused[i].Score {
				fused[i], fused[j] = fused[j], fused[i]
			}
		}
	}

	return fused
}

// SourceInfo 来源信息
type SourceInfo struct {
	Channel string
	Rank    int
	Weight  float64
}

// calculateFusedScore 计算融合得分
func (c *SearchCoordinator) calculateFusedScore(rank int, weight float64, fusionType string) float64 {
	k := 60.0

	switch fusionType {
	case "RRFS":
		return weight / (k + float64(rank))
	case "RRF":
		return 1.0 / (k + float64(rank))
	case "weighted":
		return weight * (1.0 / float64(rank))
	default:
		return 1.0 / (k + float64(rank))
	}
}

// executePostProcessors 执行后处理
func (c *SearchCoordinator) executePostProcessors(results []*rag.SearchResult, options *SearchOptions) []*rag.SearchResult {
	// 简化实现：可以去重和过滤
	if len(results) == 0 {
		return results
	}

	// 去重
	seen := make(map[string]bool)
	deduped := make([]*rag.SearchResult, 0, len(results))

	for _, r := range results {
		if !seen[r.ID] {
			seen[r.ID] = true
			deduped = append(deduped, r)
		}
	}

	return deduped
}

// recordLatencyStats 记录延迟统计
func (c *SearchCoordinator) recordLatencyStats(channels []SearchChannel, latency int64) {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, ch := range channels {
		if stats, ok := c.stats.ChannelStats[ch.Name()]; ok {
			if stats.Requests > 0 {
				stats.AvgLatency = float64(stats.TotalLatency) / float64(stats.Requests)
			}
		}
	}
}

// GetStats 获取协调器统计
func (c *SearchCoordinator) GetStats() *CoordinatorStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	stats := c.stats
	if c.stats.TotalRequests > 0 {
		_ = c.stats.TotalLatencyMs / c.stats.TotalRequests
	}
	return &stats
}

// ThreadPoolExecutor 线程池执行器
type ThreadPoolExecutor struct {
	concurrency int
	running     int
	queue       []func() error
	wg          sync.WaitGroup
	mu          sync.Mutex
}

// NewThreadPoolExecutor 创建线程池执行器
func NewThreadPoolExecutor(concurrency int) *ThreadPoolExecutor {
	if concurrency <= 0 {
		concurrency = 5
	}
	return &ThreadPoolExecutor{
		concurrency: concurrency,
		queue:       make([]func() error, 0),
	}
}

// SetConcurrency 设置并发数
func (p *ThreadPoolExecutor) SetConcurrency(concurrency int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.concurrency = concurrency
}

// GetConcurrency 获取并发数
func (p *ThreadPoolExecutor) GetConcurrency() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.concurrency
}

// Execute 执行任务
func (p *ThreadPoolExecutor) Execute(task func() error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.running >= p.concurrency {
		p.queue = append(p.queue, task)
		return
	}

	p.running++
	p.wg.Add(1)
	go func() {
		defer p.wg.Done()
		defer func() {
			p.mu.Lock()
			p.running--
			if len(p.queue) > 0 {
				next := p.queue[0]
				p.queue = p.queue[1:]
				p.mu.Unlock()

				p.running++
				p.wg.Add(1)
				go func() {
					defer p.wg.Done()
					next()
					p.mu.Lock()
					p.running--
					p.mu.Unlock()
				}()
			} else {
				p.mu.Unlock()
			}
		}()

		task()
	}()
}

// Wait 等待所有任务完成
func (p *ThreadPoolExecutor) Wait() {
	p.wg.Wait()
}
