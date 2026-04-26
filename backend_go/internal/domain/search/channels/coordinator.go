package channels

import (
	"context"
	"sync"

	"github.com/ai-chat/backend_go/internal/domain/rag"
)

// SearchCoordinator 检索协调器
type SearchCoordinator struct {
	channels []SearchChannel
	mu       sync.RWMutex
}

// NewSearchCoordinator 创建检索协调器
func NewSearchCoordinator() *SearchCoordinator {
	return &SearchCoordinator{
		channels: make([]SearchChannel, 0),
	}
}

// Register 注册检索通道
func (c *SearchCoordinator) Register(channel SearchChannel) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.channels = append(c.channels, channel)
}

// Unregister 注销检索通道
func (c *SearchCoordinator) Unregister(name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i, ch := range c.channels {
		if ch.Name() == name {
			c.channels = append(c.channels[:i], c.channels[i+1:]...)
			return
		}
	}
}

// Search 协调搜索
func (c *SearchCoordinator) Search(ctx context.Context, query string, topK int) ([]*rag.SearchResult, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if len(c.channels) == 0 {
		return []*rag.SearchResult{}, nil
	}

	// 并行执行所有通道搜索
	type result struct {
		results []*rag.SearchResult
		err    error
	}

	resultCh := make(chan result, len(c.channels))
	var wg sync.WaitGroup

	for _, ch := range c.channels {
		wg.Add(1)
		go func(channel SearchChannel) {
			defer wg.Done()
			results, err := channel.Search(ctx, query, topK)
			resultCh <- result{results: results, err: err}
		}(ch)
	}

	go func() {
		wg.Wait()
		close(resultCh)
	}()

	// 收集结果
	var allResults []*rag.SearchResult
	for r := range resultCh {
		if r.err != nil {
			continue
		}
		allResults = append(allResults, r.results...)
	}

	// 加权合并
	return c.weightedMerge(allResults, topK), nil
}

// weightedMerge 加权合并
func (c *SearchCoordinator) weightedMerge(results []*rag.SearchResult, topK int) []*rag.SearchResult {
	if len(results) == 0 {
		return results
	}

	// 按ID去重并累加权重
	scoreMap := make(map[string]*rag.SearchResult)
	for _, r := range results {
		if existing, ok := scoreMap[r.ID]; ok {
			existing.RerankScore += r.Score
		} else {
			scoreMap[r.ID] = r
		}
	}

	// 转换为切片并排序
	var merged []*rag.SearchResult
	for _, r := range scoreMap {
		merged = append(merged, r)
	}

	for i := 0; i < len(merged); i++ {
		for j := i + 1; j < len(merged); j++ {
			if merged[j].RerankScore > merged[i].RerankScore {
				merged[i], merged[j] = merged[j], merged[i]
			}
		}
	}

	if len(merged) > topK {
		merged = merged[:topK]
	}

	return merged
}
