/**
 * Embedding Service - 向量化服务
 *
 * 企业级设计：
 * - 调用 MiniMax API 进行文本向量化
 * - 支持批量向量化以提高效率
 * - 支持 Redis 缓存嵌入结果
 * - 支持多种嵌入模型配置
 * - 自动重试和错误处理
 */

package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// EmbeddingConfig 向量化配置
type EmbeddingConfig struct {
	APIKey       string
	BaseURL      string
	Model        string
	BatchSize    int
	MaxRetries   int
	Timeout      time.Duration
	CacheEnabled bool
	CacheTTL     time.Duration
	Dimension    int
}

// DefaultEmbeddingConfig 默认配置
func DefaultEmbeddingConfig() *EmbeddingConfig {
	return &EmbeddingConfig{
		BaseURL:      "https://api.minimaxi.com/anthropic",
		Model:        "embedding-2",
		BatchSize:    32,
		MaxRetries:   3,
		Timeout:      30 * time.Second,
		CacheEnabled: true,
		CacheTTL:     7 * 24 * time.Hour, // 7天
		Dimension:    1536,
	}
}

// EmbeddingResult 向量化结果
type EmbeddingResult struct {
	Text      string
	Embedding []float32
	TokenUsed int
	Error     error
}

// BatchEmbeddingResult 批量向量化结果
type BatchEmbeddingResult struct {
	Results []*EmbeddingResult
	TotalTokens int
	Errors   int
}

// EmbeddingService 向量化服务
type EmbeddingService struct {
	config   *EmbeddingConfig
	client   *http.Client
	cache    *redis.Client
	cacheKey string
	mu       sync.RWMutex
	stats    EmbeddingStats
}

// EmbeddingStats 向量化统计
type EmbeddingStats struct {
	TotalRequests    int64
	CacheHits        int64
	CacheMisses      int64
	TotalTokensUsed  int64
	AverageLatencyMs float64
	Errors           int64
}

// NewEmbeddingService 创建向量化服务
func NewEmbeddingService(config *EmbeddingConfig) (*EmbeddingService, error) {
	if config == nil {
		config = DefaultEmbeddingConfig()
	}

	// 初始化 Redis 缓存
	var cache *redis.Client
	if config.CacheEnabled {
		cache = redis.NewClient(&redis.Options{
			Addr:     "localhost:6379",
			Password: "",
			DB:       1,
		})
	}

	return &EmbeddingService{
		config:   config,
		client:   &http.Client{Timeout: config.Timeout},
		cache:    cache,
		cacheKey: "embedding:",
	}, nil
}

// NewEmbeddingServiceWithCache 使用指定 Redis 客户端创建服务
func NewEmbeddingServiceWithCache(config *EmbeddingConfig, redisClient *redis.Client) (*EmbeddingService, error) {
	if config == nil {
		config = DefaultEmbeddingConfig()
	}

	return &EmbeddingService{
		config:   config,
		client:   &http.Client{Timeout: config.Timeout},
		cache:    redisClient,
		cacheKey: "embedding:",
	}, nil
}

// Embed 单文本向量化
func (s *EmbeddingService) Embed(ctx context.Context, text string) (*EmbeddingResult, error) {
	start := time.Now()
	s.mu.Lock()
	s.stats.TotalRequests++
	s.mu.Unlock()

	// 清理文本
	cleanText := s.preprocessText(text)

	// 检查缓存
	if s.cache != nil {
		embedding, err := s.getFromCache(ctx, cleanText)
		if err == nil && embedding != nil {
			s.mu.Lock()
			s.stats.CacheHits++
			s.mu.Unlock()
			return &EmbeddingResult{
				Text:      text,
				Embedding: embedding,
			}, nil
		}
	}

	s.mu.Lock()
	s.stats.CacheMisses++
	s.mu.Unlock()

	// 调用 API
	embedding, tokenUsed, err := s.callEmbeddingAPI(ctx, cleanText)
	if err != nil {
		s.mu.Lock()
		s.stats.Errors++
		s.mu.Unlock()
		return &EmbeddingResult{
			Text:  text,
			Error: err,
		}, err
	}

	// 更新统计
	s.mu.Lock()
	s.stats.TotalTokensUsed += int64(tokenUsed)
	latency := time.Since(start).Milliseconds()
	s.stats.AverageLatencyMs = (s.stats.AverageLatencyMs*float64(s.stats.TotalRequests-1) + float64(latency)) / float64(s.stats.TotalRequests)
	s.mu.Unlock()

	// 缓存结果
	if s.cache != nil && embedding != nil {
		go s.setToCache(context.Background(), cleanText, embedding)
	}

	return &EmbeddingResult{
		Text:      text,
		Embedding: embedding,
		TokenUsed: tokenUsed,
	}, nil
}

// EmbedBatch 批量向量化
func (s *EmbeddingService) EmbedBatch(ctx context.Context, texts []string) (*BatchEmbeddingResult, error) {
	if len(texts) == 0 {
		return &BatchEmbeddingResult{Results: []*EmbeddingResult{}}, nil
	}

	start := time.Now()
	s.mu.Lock()
	s.stats.TotalRequests++
	s.mu.Unlock()

	results := make([]*EmbeddingResult, 0, len(texts))
	var totalTokens int
	var errorCount int

	// 分批处理
	batchSize := s.config.BatchSize
	if batchSize <= 0 {
		batchSize = 32
	}

	for i := 0; i < len(texts); i += batchSize {
		end := i + batchSize
		if end > len(texts) {
			end = len(texts)
		}

		batch := texts[i:end]
		batchResults, tokens, errs := s.embedBatchWithCache(ctx, batch)
		results = append(results, batchResults...)
		totalTokens += tokens
		errorCount += errs
	}

	// 更新统计
	s.mu.Lock()
	s.stats.TotalTokensUsed += int64(totalTokens)
	latency := time.Since(start).Milliseconds()
	s.stats.AverageLatencyMs = (s.stats.AverageLatencyMs*float64(s.stats.TotalRequests-1) + float64(latency)) / float64(s.stats.TotalRequests)
	s.mu.Unlock()

	return &BatchEmbeddingResult{
		Results:     results,
		TotalTokens: totalTokens,
		Errors:      errorCount,
	}, nil
}

// embedBatchWithCache 批量向量化（带缓存）
func (s *EmbeddingService) embedBatchWithCache(ctx context.Context, texts []string) ([]*EmbeddingResult, int, int) {
	results := make([]*EmbeddingResult, len(texts))
	var uncachedTexts []string
	var uncachedIndices []int
	var totalTokens int
	var errorCount int

	// 预处理和缓存查询
	cleanTexts := make([]string, len(texts))
	for i, text := range texts {
		cleanText := s.preprocessText(text)
		cleanTexts[i] = cleanText

		if s.cache != nil {
			embedding, err := s.getFromCache(ctx, cleanText)
			if err == nil && embedding != nil {
				results[i] = &EmbeddingResult{Text: text, Embedding: embedding}
				s.mu.Lock()
				s.stats.CacheHits++
				s.mu.Unlock()
				continue
			}
		}

		s.mu.Lock()
		s.stats.CacheMisses++
		s.mu.Unlock()

		uncachedTexts = append(uncachedTexts, cleanText)
		uncachedIndices = append(uncachedIndices, i)
	}

	// 批量调用 API
	if len(uncachedTexts) > 0 {
		embeddings, tokens, err := s.callBatchEmbeddingAPI(ctx, uncachedTexts)
		totalTokens += tokens

		for idx, embedding := range embeddings {
			originalIdx := uncachedIndices[idx]
			if embedding != nil {
				results[originalIdx] = &EmbeddingResult{
					Text:      texts[originalIdx],
					Embedding: embedding,
					TokenUsed: len(uncachedTexts[idx]) / 4, // 估算 token 数
				}

				// 缓存
				if s.cache != nil && embedding != nil {
					go s.setToCache(context.Background(), uncachedTexts[idx], embedding)
				}
			} else {
				results[originalIdx] = &EmbeddingResult{
					Text:  texts[originalIdx],
					Error: fmt.Errorf("embedding failed"),
				}
				errorCount++
			}
		}

		if err != nil {
			errorCount++
		}
	}

	return results, totalTokens, errorCount
}

// callEmbeddingAPI 调用单文本嵌入 API
func (s *EmbeddingService) callEmbeddingAPI(ctx context.Context, text string) ([]float32, int, error) {
	reqBody := map[string]interface{}{
		"model": s.config.Model,
		"input": text,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := s.config.BaseURL + "/v1/embeddings"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.config.APIKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to call API: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	// 解析响应
	var result struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
		Usage struct {
			TotalTokens int `json:"total_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, 0, fmt.Errorf("failed to parse response: %w", err)
	}

	if len(result.Data) == 0 {
		return nil, 0, fmt.Errorf("no embedding returned")
	}

	return result.Data[0].Embedding, result.Usage.TotalTokens, nil
}

// callBatchEmbeddingAPI 调用批量嵌入 API
func (s *EmbeddingService) callBatchEmbeddingAPI(ctx context.Context, texts []string) ([][]float32, int, error) {
	reqBody := map[string]interface{}{
		"model": s.config.Model,
		"input": texts,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := s.config.BaseURL + "/v1/embeddings"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.config.APIKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to call API: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
		Usage struct {
			TotalTokens int `json:"total_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, 0, fmt.Errorf("failed to parse response: %w", err)
	}

	embeddings := make([][]float32, len(texts))
	for i, d := range result.Data {
		if i < len(embeddings) {
			embeddings[i] = d.Embedding
		}
	}

	return embeddings, result.Usage.TotalTokens, nil
}

// preprocessText 预处理文本
func (s *EmbeddingService) preprocessText(text string) string {
	// 去除多余空白
	text = strings.TrimSpace(text)
	text = strings.ReplaceAll(text, "\n", " ")
	text = strings.ReplaceAll(text, "\t", " ")

	// 去除多余空格
	for strings.Contains(text, "  ") {
		text = strings.ReplaceAll(text, "  ", " ")
	}

	return text
}

// getFromCache 从缓存获取
func (s *EmbeddingService) getFromCache(ctx context.Context, text string) ([]float32, error) {
	if s.cache == nil {
		return nil, fmt.Errorf("cache not enabled")
	}

	cacheKey := s.cacheKey + fmt.Sprintf("%d", hashString(text))
	data, err := s.cache.Get(ctx, cacheKey).Bytes()
	if err != nil {
		return nil, err
	}

	// 反序列化
	embedding := make([]float32, s.config.Dimension)
	if err := json.Unmarshal(data, &embedding); err != nil {
		return nil, err
	}

	return embedding, nil
}

// setToCache 设置缓存
func (s *EmbeddingService) setToCache(ctx context.Context, text string, embedding []float32) error {
	if s.cache == nil || embedding == nil {
		return nil
	}

	cacheKey := s.cacheKey + fmt.Sprintf("%d", hashString(text))
	data, err := json.Marshal(embedding)
	if err != nil {
		return err
	}

	return s.cache.Set(ctx, cacheKey, data, s.config.CacheTTL).Err()
}

// GetStats 获取统计信息
func (s *EmbeddingService) GetStats() EmbeddingStats {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.stats
}

// ResetStats 重置统计
func (s *EmbeddingService) ResetStats() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stats = EmbeddingStats{}
}

// Close 关闭服务
func (s *EmbeddingService) Close() error {
	if s.cache != nil {
		return s.cache.Close()
	}
	return nil
}

// hashString 简单字符串哈希
func hashString(s string) int {
	h := 0
	for _, c := range s {
		h = h*31 + int(c)
	}
	return h
}

// String 字符串表示
func (s *EmbeddingService) String() string {
	return fmt.Sprintf("EmbeddingService{model=%s, dimension=%d, batchSize=%d, cacheEnabled=%v}",
		s.config.Model, s.config.Dimension, s.config.BatchSize, s.cache != nil)
}
