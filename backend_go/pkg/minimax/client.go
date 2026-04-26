package minimax

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/ai-chat/backend_go/internal/domain/model"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Client MiniMax API客户端
type Client struct {
	apiKey    string
	baseURL   string
	modelName string
	client    *http.Client
	logger    zerolog.Logger
}

// Config MiniMax客户端配置
type Config struct {
	APIKey    string // MiniMax API Key
	BaseURL   string // API地址
	ModelName string // 模型名称: MiniMax-M2.7, MiniMax-M2.5, MiniMax-VL-01
}

// NewClient 创建MiniMax客户端
func NewClient(cfg Config) *Client {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.minimaxi.com/anthropic"
	}
	if cfg.ModelName == "" {
		cfg.ModelName = "MiniMax-M2.7"
	}

	return &Client{
		apiKey:    cfg.APIKey,
		baseURL:   cfg.BaseURL,
		modelName: cfg.ModelName,
		client: &http.Client{
			Timeout: 120 * time.Second,
		},
		logger: log.With().Str("component", "minimax_client").Logger(),
	}
}

// ChatRequest 聊天请求结构
type ChatRequest struct {
	Model     string               `json:"model"`
	Messages  []minimaxMessage     `json:"messages"`
	MaxTokens int                  `json:"max_tokens"`
	Stream    bool                 `json:"stream,omitempty"`
	Tools     []minimaxTool        `json:"tools,omitempty"`
}

// minimaxMessage MiniMax消息格式
type minimaxMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// minimaxTool MiniMax工具格式
type minimaxTool struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Parameters  any    `json:"parameters"`
}

// ChatResponse 聊天响应结构
type ChatResponse struct {
	ID       string          `json:"id"`
	Content  []ContentBlock  `json:"content"`
	Role     string          `json:"role"`
	Type     string          `json:"type"`
	Usage    usage           `json:"usage"`
	StopReason string       `json:"stop_reason"`
}

// ContentBlock 内容块 - MiniMax 支持多种内容类型
type ContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

// usage Token使用量
type usage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// Chat 发送聊天请求
func (c *Client) Chat(ctx context.Context, messages []model.Message, opts ...model.Option) (*model.Response, error) {
	req := &model.ModelRequest{
		Model:       c.modelName,
		Messages:    messages,
		Temperature: 0.7,
		MaxTokens:   8000,
	}

	// 应用选项
	for _, opt := range opts {
		opt(req)
	}

	// 转换消息格式
	minimaxMsgs := make([]minimaxMessage, len(messages))
	for i, msg := range messages {
		minimaxMsgs[i] = minimaxMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
	}

	// 构建请求
	chatReq := ChatRequest{
		Model:     c.modelName,
		Messages:  minimaxMsgs,
		MaxTokens: req.MaxTokens,
	}

	// 添加工具
	if len(req.Tools) > 0 {
		chatReq.Tools = make([]minimaxTool, len(req.Tools))
		for i, tool := range req.Tools {
			chatReq.Tools[i] = minimaxTool{
				Name:        tool.Name,
				Description: tool.Description,
				Parameters:  tool.Parameters,
			}
		}
	}

	// 序列化请求
	jsonData, err := json.Marshal(chatReq)
	if err != nil {
		return nil, fmt.Errorf("序列化请求失败: %w", err)
	}

	// 创建请求 - MiniMax 使用 /v1/messages 路径
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/v1/messages", bytes.NewReader(jsonData))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	// 设置请求头 - MiniMax 支持多种认证方式
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("x-api-key", c.apiKey)

	// 发送请求
	c.logger.Debug().Str("url", httpReq.URL.String()).Msg("发送聊天请求")
	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("发送请求失败: %w", err)
	}
	defer resp.Body.Close()

	// 读取响应
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API错误: status=%d, body=%s", resp.StatusCode, string(body))
	}

	// 解析响应
	var chatResp ChatResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	// 从 content 数组中提取文本内容
	textContent := ""
	for _, block := range chatResp.Content {
		if block.Type == "text" && block.Text != "" {
			textContent += block.Text
		}
	}

	// 转换响应
	return &model.Response{
		Content: textContent,
		Usage: model.Usage{
			InputTokens:  chatResp.Usage.InputTokens,
			OutputTokens: chatResp.Usage.OutputTokens,
			TotalTokens:  chatResp.Usage.InputTokens + chatResp.Usage.OutputTokens,
		},
		RawResponse: chatResp,
	}, nil
}

// Stream 流式聊天请求
func (c *Client) Stream(ctx context.Context, messages []model.Message, callback func(resp *model.Response)) error {
	// 转换消息格式
	minimaxMsgs := make([]minimaxMessage, len(messages))
	for i, msg := range messages {
		minimaxMsgs[i] = minimaxMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
	}

	// 构建请求
	chatReq := ChatRequest{
		Model:     c.modelName,
		Messages:  minimaxMsgs,
		MaxTokens: 8000,
		Stream:    true,
	}

	// 序列化请求
	jsonData, err := json.Marshal(chatReq)
	if err != nil {
		return fmt.Errorf("序列化请求失败: %w", err)
	}

	// 创建请求 - MiniMax 流式同样使用 /v1/messages 路径
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/v1/messages", bytes.NewReader(jsonData))
	if err != nil {
		return fmt.Errorf("创建请求失败: %w", err)
	}

	// 设置请求头 - MiniMax 支持多种认证方式
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("x-api-key", c.apiKey)

	// 发送请求
	c.logger.Debug().Msg("发送流式聊天请求")
	resp, err := c.client.Do(httpReq)
	if err != nil {
		return fmt.Errorf("发送请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API错误: status=%d, body=%s", resp.StatusCode, string(body))
	}

	// 处理SSE流 - MiniMax返回SSE格式:
	// event: <event_type>
	// data: {...}
	reader := resp.Body
	buf := make([]byte, 0, 4096)
	lineBuf := make([]byte, 0, 4096)
	fullContent := ""
	inputTokens := 0
	outputTokens := 0
	var currentEvent string

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// 读取一块数据
		n, err := reader.Read(buf[:cap(buf)])
		if n > 0 {
			lineBuf = append(lineBuf, buf[:n]...)
		}
		if err != nil {
			if err == io.EOF && len(lineBuf) > 0 {
				// 处理最后一行
				if strings.HasPrefix(currentEvent, "data: ") || strings.HasPrefix(currentEvent, "data:") {
					processLine(currentEvent, &fullContent, &inputTokens, &outputTokens, callback)
				}
			}
			if err == io.EOF {
				return nil
			}
			return fmt.Errorf("读取流失败: %w", err)
		}

		// 按行处理
		for {
			line, rest, found := stringsCut(string(lineBuf), "\n")
			if !found {
				lineBuf = []byte(rest)
				break
			}
			lineBuf = []byte(rest)

			// 跳过空行
			line = strings.TrimRight(line, "\r")
			if line == "" {
				continue
			}

			// 解析事件类型行: event: <type>
			if strings.HasPrefix(line, "event: ") {
				currentEvent = strings.TrimPrefix(line, "event: ")
				continue
			}

			// 解析数据行: data: {...}
			if strings.HasPrefix(line, "data: ") {
				data := strings.TrimPrefix(line, "data: ")
				if data == "[DONE]" {
					return nil
				}
				processLine(data, &fullContent, &inputTokens, &outputTokens, callback)
			}
		}
	}
}

// stringsCut 字符串切割
func stringsCut(s, sep string) (string, string, bool) {
	idx := strings.Index(s, sep)
	if idx == -1 {
		return "", "", false
	}
	return s[:idx], s[idx+len(sep):], true
}

// processLine 处理单行SSE数据
func processLine(data string, fullContent *string, inputTokens, outputTokens *int, callback func(resp *model.Response)) {
	var sseEvent SSEEvent
	if err := json.Unmarshal([]byte(data), &sseEvent); err != nil {
		return
	}

	var textContent string
	switch sseEvent.Type {
	case "content_block_delta":
		if sseEvent.Delta.Type == "text_delta" {
			textContent = sseEvent.Delta.Text
		}
	case "message_delta":
		if sseEvent.Usage.OutputTokens > 0 {
			*outputTokens = sseEvent.Usage.OutputTokens
		}
	}

	if textContent != "" {
		*fullContent += textContent
		callback(&model.Response{
			Content: textContent,
			Usage: model.Usage{
				InputTokens:  *inputTokens,
				OutputTokens: *outputTokens,
				TotalTokens:  *inputTokens + *outputTokens,
			},
		})
	}
}

// SSEEvent MiniMax SSE事件格式
type SSEEvent struct {
	Type      string `json:"type"`
	Index     int    `json:"index,omitempty"`
	Delta     Delta  `json:"delta,omitempty"`
	Usage     Usage  `json:"usage,omitempty"`
	StopReason string `json:"stop_reason,omitempty"`
}

// Delta 内容增量
type Delta struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

// Usage Token使用量 (SSE格式)
type Usage struct {
	InputTokens  int `json:"input_tokens,omitempty"`
	OutputTokens int `json:"output_tokens,omitempty"`
}
