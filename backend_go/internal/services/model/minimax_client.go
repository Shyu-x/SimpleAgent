// Package model MiniMax模型客户端实现
// 提供重试机制、超时控制、断路器保护、SSE流式响应
package model

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/ai-chat/backend_go/internal/common/errors"
	"github.com/ai-chat/backend_go/internal/infra/circuitbreaker"
	"github.com/rs/zerolog/log"
)

// MiniMaxClient MiniMax API客户端 - 支持重试、断路器、SSE
type MiniMaxClient struct {
	apiKey         string
	baseURL        string
	modelName      string
	timeout        time.Duration
	maxRetries     int
	baseRetryDelay time.Duration
	client         *http.Client
	circuitBreaker *circuitbreaker.CircuitBreaker

	// 健康状态
	mu           sync.RWMutex
	healthStatus *HealthInfo
}

// HealthInfo 健康状态信息
type HealthInfo struct {
	ModelID       string        `json:"model_id"`
	ModelName     string        `json:"model_name"`
	Available     bool          `json:"available"`
	LastCheckAt   time.Time     `json:"last_check_at"`
	ResponseTime  time.Duration `json:"response_time"`
	ErrorCount    int           `json:"error_count"`
	SuccessCount  int           `json:"success_count"`
	TotalReqCount int           `json:"total_req_count"`
	LastError     string        `json:"last_error,omitempty"`
	CircuitState  string        `json:"circuit_state"`
}

// MiniMaxConfig MiniMax客户端配置
type MiniMaxConfig struct {
	APIKey         string                 // MiniMax API Key
	BaseURL        string                 // API地址 (默认: https://api.minimaxi.com/anthropic)
	ModelName      string                 // 模型名称 (默认: MiniMax-M2.7)
	Timeout        int                    // 超时秒数 (默认: 120)
	MaxRetries     int                    // 最大重试次数 (默认: 3)
	RetryDelay     int                    // 基础重试延迟毫秒 (默认: 500)
	CircuitBreaker *circuitbreaker.Config // 断路器配置
}

// DefaultMiniMaxConfig 默认配置
var DefaultMiniMaxConfig = MiniMaxConfig{
	BaseURL:    "https://api.minimaxi.com/anthropic",
	ModelName:  "MiniMax-M2.7",
	Timeout:    120,
	MaxRetries: 3,
	RetryDelay: 500,
}

// NewMiniMaxClient 创建MiniMax客户端
func NewMiniMaxClient(cfg *MiniMaxConfig) (*MiniMaxClient, error) {
	if cfg == nil {
		cfg = &DefaultMiniMaxConfig
	}

	if cfg.BaseURL == "" {
		cfg.BaseURL = DefaultMiniMaxConfig.BaseURL
	}
	if cfg.ModelName == "" {
		cfg.ModelName = DefaultMiniMaxConfig.ModelName
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = DefaultMiniMaxConfig.Timeout
	}
	if cfg.MaxRetries <= 0 {
		cfg.MaxRetries = DefaultMiniMaxConfig.MaxRetries
	}
	if cfg.RetryDelay <= 0 {
		cfg.RetryDelay = DefaultMiniMaxConfig.RetryDelay
	}

	// 创建断路器
	cbName := fmt.Sprintf("minimax-%s", cfg.ModelName)
	cbConfig := circuitbreaker.DefaultConfig
	if cfg.CircuitBreaker != nil {
		cbConfig = *cfg.CircuitBreaker
	}
	cb, err := circuitbreaker.New(cbName, cbConfig)
	if err != nil {
		return nil, errors.ErrModel("创建断路器失败", err)
	}

	client := &MiniMaxClient{
		apiKey:         cfg.APIKey,
		baseURL:        cfg.BaseURL,
		modelName:      cfg.ModelName,
		timeout:        time.Duration(cfg.Timeout) * time.Second,
		maxRetries:     cfg.MaxRetries,
		baseRetryDelay: time.Duration(cfg.RetryDelay) * time.Millisecond,
		client: &http.Client{
			Timeout: time.Duration(cfg.Timeout) * time.Second,
		},
		circuitBreaker: cb,
		healthStatus: &HealthInfo{
			ModelID:     cfg.ModelName,
			ModelName:   cfg.ModelName,
			Available:   true,
			LastCheckAt: time.Now(),
		},
	}

	return client, nil
}

// ChatRequest 聊天请求
type ChatRequest struct {
	Model       string           `json:"model"`
	Messages    []ChatMessage    `json:"messages"`
	MaxTokens   int              `json:"max_tokens"`
	Stream      bool             `json:"stream,omitempty"`
	Temperature float64          `json:"temperature,omitempty"`
	Tools       []ToolDefinition `json:"tools,omitempty"`
}

// ChatMessage 聊天消息
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ToolDefinition 工具定义
type ToolDefinition struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

// ChatResponse 聊天响应
type ChatResponse struct {
	ID         string         `json:"id"`
	Content    []ContentBlock `json:"content"`
	Role       string         `json:"role"`
	Type       string         `json:"type"`
	Usage      Usage          `json:"usage"`
	StopReason string         `json:"stop_reason"`
	Error      *APIError      `json:"error,omitempty"`
}

// ContentBlock 内容块
type ContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

// Usage Token使用量
type Usage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// APIError API错误
type APIError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Code    string `json:"code"`
}

// StreamCallback 流式回调函数
type StreamCallback func(content string) error

// SSE Data 结构
type SSEData struct {
	ID      string   `json:"id"`
	Object  string   `json:"object"`
	Created int64    `json:"created"`
	Model   string   `json:"model"`
	Choices []Choice `json:"choices"`
}

// Choice 选择
type Choice struct {
	Index        int    `json:"index"`
	Delta        Delta  `json:"delta"`
	FinishReason string `json:"finish_reason"`
}

// Delta 增量内容
type Delta struct {
	Content string `json:"content"`
}

// ErrCircuitOpen 断路器开启
var ErrCircuitOpen = errors.NewWithDetail(errors.CodeCircuitBreakerOpen, "服务暂时不可用", "熔断器已开启", nil)

// ErrMaxRetriesExceeded 最大重试次数超限
var ErrMaxRetriesExceeded = errors.NewWithDetail(errors.CodeModelAPIError, "模型调用失败", "最大重试次数超限", nil)

// Chat 发送聊天请求 - 支持重试和断路器
func (c *MiniMaxClient) Chat(ctx context.Context, messages []ChatMessage, options *ChatOptions) (*ChatResponse, error) {
	// 检查断路器
	if c.circuitBreaker.IsOpen() {
		c.updateHealth(false, "circuit breaker open")
		return nil, ErrCircuitOpen
	}

	// 构建请求
	req := &ChatRequest{
		Model:       c.modelName,
		Messages:    messages,
		MaxTokens:   options.MaxTokens,
		Temperature: options.Temperature,
	}

	if options.Tools != nil {
		req.Tools = options.Tools
	}

	// 执行请求 (带重试)
	var lastErr error

	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			delay := c.calculateBackoff(attempt)
			log.Info().Str("model", c.modelName).Int("attempt", attempt).Dur("delay", delay).Msg("重试请求")

			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
			}
		}

		resp, err := c.executeChat(ctx, req)
		if err == nil {
			c.updateHealth(true, "")
			return resp, nil
		}

		lastErr = err

		// 检查错误是否可重试
		if !c.isRetryableError(err) {
			c.updateHealth(false, err.Error())
			return nil, err
		}

		log.Warn().Err(err).Str("model", c.modelName).Int("attempt", attempt).Msg("请求失败")
	}

	c.updateHealth(false, lastErr.Error())
	return nil, fmt.Errorf("%w: %v", ErrMaxRetriesExceeded, lastErr)
}

// executeChat 执行单次聊天请求
func (c *MiniMaxClient) executeChat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	startTime := time.Now()

	// 序列化请求
	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, errors.ErrModel("序列化请求失败", err)
	}

	// 创建请求
	url := c.baseURL + "/v1/messages"
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonData))
	if err != nil {
		return nil, errors.NewWithDetail(errors.CodeNetworkError, "网络错误", "创建请求失败", err)
	}

	// 设置请求头
	c.setHeaders(httpReq)

	// 执行请求 (带断路器)
	var resp *http.Response
	err = c.circuitBreaker.Execute(ctx, func() error {
		var execErr error
		resp, execErr = c.client.Do(httpReq)
		return execErr
	})

	if err != nil {
		log.Error().Err(err).Str("model", c.modelName).Msg("请求执行失败")
		return nil, errors.NewWithDetail(errors.CodeNetworkError, "网络错误", "请求执行失败", err)
	}
	defer resp.Body.Close()

	// 读取响应
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, errors.NewWithDetail(errors.CodeNetworkError, "网络错误", "读取响应失败", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API错误: status=%d, body=%s", resp.StatusCode, string(body))
	}

	// 解析响应
	var chatResp ChatResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		return nil, errors.ErrModel("解析响应失败", err)
	}

	if chatResp.Error != nil {
		return nil, fmt.Errorf("MiniMax API错误: %s", chatResp.Error.Message)
	}

	responseTime := time.Since(startTime)
	log.Debug().Str("model", c.modelName).Dur("response_time", responseTime).Msg("请求完成")

	return &chatResp, nil
}

// StreamChat 流式聊天请求 - 支持SSE
func (c *MiniMaxClient) StreamChat(ctx context.Context, messages []ChatMessage, options *ChatOptions, callback func(*ChatResponse) error) error {
	// 检查断路器
	if c.circuitBreaker.IsOpen() {
		c.updateHealth(false, "circuit breaker open")
		return ErrCircuitOpen
	}

	// 构建请求
	req := &ChatRequest{
		Model:       c.modelName,
		Messages:    messages,
		MaxTokens:   options.MaxTokens,
		Temperature: options.Temperature,
		Stream:      true,
	}

	if options.Tools != nil {
		req.Tools = options.Tools
	}

	// 序列化请求
	jsonData, err := json.Marshal(req)
	if err != nil {
		return errors.ErrModel("序列化请求失败", err)
	}

	// 创建请求
	url := c.baseURL + "/v1/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonData))
	if err != nil {
		return errors.NewWithDetail(errors.CodeNetworkError, "网络错误", "创建请求失败", err)
	}

	// 设置请求头
	c.setHeaders(httpReq)

	// 发送请求
	log.Debug().Str("model", c.modelName).Msg("发送流式聊天请求")

	var resp *http.Response
	err = c.circuitBreaker.Execute(ctx, func() error {
		var execErr error
		resp, execErr = c.client.Do(httpReq)
		return execErr
	})

	if err != nil {
		c.updateHealth(false, err.Error())
		return errors.NewWithDetail(errors.CodeNetworkError, "网络错误", "发送请求失败", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		c.updateHealth(false, fmt.Sprintf("status=%d", resp.StatusCode))
		return fmt.Errorf("API错误: status=%d, body=%s", resp.StatusCode, string(body))
	}

	// 处理SSE流
	err = c.readSSestream(ctx, resp, callback)
	if err != nil {
		c.updateHealth(false, err.Error())
		return err
	}

	c.updateHealth(true, "")
	return nil
}

// readSSestream 读取SSE流
func (c *MiniMaxClient) readSSestream(ctx context.Context, resp *http.Response, callback func(*ChatResponse) error) error {
	reader := bufio.NewReader(resp.Body)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return fmt.Errorf("读取流失败: %w", err)
		}

		line = strings.TrimSpace(line)

		// 跳过空行和注释
		if line == "" || strings.HasPrefix(line, ":") {
			continue
		}

		// SSE事件格式: data: {...}
		if !strings.HasPrefix(line, "data:") {
			continue
		}

		data := strings.TrimPrefix(line, "data:")
		data = strings.TrimSpace(data)

		// 检查结束信号
		if data == "[DONE]" || data == "" {
			return nil
		}

		// 解析SSE数据
		var sseData SSEData
		if err := json.Unmarshal([]byte(data), &sseData); err != nil {
			log.Warn().Str("data", data).Msg("解析SSE数据失败")
			continue
		}

		// 提取内容并构建ChatResponse
		if sseData.Choices != nil && len(sseData.Choices) > 0 {
			delta := sseData.Choices[0].Delta
			if delta.Content != "" {
				chatResp := &ChatResponse{
					ID: sseData.ID,
				}
				chatResp.Content = []ContentBlock{{Type: "text", Text: delta.Content}}

				if err := callback(chatResp); err != nil {
					return fmt.Errorf("回调失败: %w", err)
				}
			}

			// 检查结束
			if sseData.Choices[0].FinishReason != "" {
				return nil
			}
		}
	}
}

// calculateBackoff 计算指数退避延迟
func (c *MiniMaxClient) calculateBackoff(attempt int) time.Duration {
	// 指数退避: delay * 2^(attempt-1), 最大30秒
	delay := c.baseRetryDelay * time.Duration(1<<uint(attempt-1))
	if delay > 30*time.Second {
		delay = 30 * time.Second
	}
	return delay
}

// isRetryableError 判断错误是否可重试
func (c *MiniMaxClient) isRetryableError(err error) bool {
	if err == nil {
		return false
	}

	errStr := err.Error()

	// 可重试的错误类型
	retryableErrors := []string{
		"timeout",
		"context deadline exceeded",
		"connection reset",
		"connection refused",
		"i/o timeout",
		"429", // Rate limit
		"500", // Internal server error
		"502", // Bad gateway
		"503", // Service unavailable
		"504", // Gateway timeout
	}

	for _, retryable := range retryableErrors {
		if strings.Contains(strings.ToLower(errStr), strings.ToLower(retryable)) {
			return true
		}
	}

	return false
}

// setHeaders 设置请求头
func (c *MiniMaxClient) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("Accept", "application/json")
}

// updateHealth 更新健康状态
func (c *MiniMaxClient) updateHealth(success bool, errMsg string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.healthStatus.TotalReqCount++
	c.healthStatus.LastCheckAt = time.Now()

	if success {
		c.healthStatus.SuccessCount++
		c.healthStatus.ErrorCount = 0
		c.healthStatus.Available = true
		c.healthStatus.LastError = ""
	} else {
		c.healthStatus.ErrorCount++
		c.healthStatus.LastError = errMsg

		// 连续失败超过阈值标记为不可用
		if c.healthStatus.ErrorCount >= 5 {
			c.healthStatus.Available = false
		}
	}

	c.healthStatus.CircuitState = c.circuitBreaker.GetState().String()
}

// GetHealth 获取健康状态
func (c *MiniMaxClient) GetHealth() *HealthInfo {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// 复制一份避免竞争
	health := *c.healthStatus
	health.CircuitState = c.circuitBreaker.GetState().String()
	return &health
}

// IsAvailable 检查是否可用
func (c *MiniMaxClient) IsAvailable() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.healthStatus.Available && !c.circuitBreaker.IsOpen()
}

// GetCircuitBreaker 获取断路器
func (c *MiniMaxClient) GetCircuitBreaker() *circuitbreaker.CircuitBreaker {
	return c.circuitBreaker
}

// Ping 健康检查
func (c *MiniMaxClient) Ping(ctx context.Context) error {
	testMsgs := []ChatMessage{{Role: "user", Content: "ping"}}
	testOptions := &ChatOptions{MaxTokens: 1}

	start := time.Now()
	_, err := c.Chat(ctx, testMsgs, testOptions)
	elapsed := time.Since(start)

	c.mu.Lock()
	c.healthStatus.ResponseTime = elapsed
	c.mu.Unlock()

	return err
}

// GetModelName 获取模型名称
func (c *MiniMaxClient) GetModelName() string {
	return c.modelName
}

// ChatOptions 聊天选项 - 提供MaxTokens和Temperature配置
// 用于MiniMaxClient的Chat和StreamChat方法
type ChatOptions struct {
	MaxTokens   int              // 最大输出Token数
	Temperature float64          // 温度参数
	Tools       []ToolDefinition  // 可用工具列表
}
