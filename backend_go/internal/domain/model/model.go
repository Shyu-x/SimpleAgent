package model

import (
	"context"
	"errors"
)

// Message 聊天消息结构
type Message struct {
	Role    string `json:"role"`    // 角色: user, assistant, system
	Content string `json:"content"` // 消息内容
}

// Model 模型接口 - 抽象所有语言模型调用
type Model interface {
	// Chat 发送聊天请求
	Chat(ctx context.Context, messages []Message, opts ...Option) (*Response, error)
	// Stream 流式聊天请求
	Stream(ctx context.Context, messages []Message, callback func(resp *Response)) error
}

// StreamCallback 流式回调函数类型
type StreamCallback func(content string) error

// ModelClientInterface 模型客户端接口 - 定义Chat和StreamChat方法
type ModelClientInterface interface {
	// Chat 发送聊天请求
	Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error)
	// StreamChat 流式聊天请求
	StreamChat(ctx context.Context, req ChatRequest, callback StreamCallback) error
}

// ChatRequest 聊天请求结构
type ChatRequest struct {
	Model       string           `json:"model"`
	Messages    []Message        `json:"messages"`
	MaxTokens   int              `json:"max_tokens"`
	Stream      bool             `json:"stream,omitempty"`
	Temperature float64          `json:"temperature,omitempty"`
	Tools       []ToolDefinition `json:"tools,omitempty"`
}

// ChatResponse 聊天响应结构
type ChatResponse struct {
	ID          string         `json:"id"`
	Content     []ContentBlock `json:"content"`
	Role        string         `json:"role"`
	Type        string         `json:"type"`
	Usage       Usage          `json:"usage"`
	StopReason  string         `json:"stop_reason"`
	RawResponse interface{}    `json:"raw_response,omitempty"`
}

// ContentBlock 内容块
type ContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

// Response 模型响应结构
type Response struct {
	Content          string      `json:"content"`                     // 文本内容
	ReasoningContent string      `json:"reasoning_content,omitempty"` // 思维链内容 (MiniMax)
	ToolCalls        []ToolCall  `json:"tool_calls,omitempty"`        // 工具调用列表
	Usage            Usage       `json:"usage"`                       // Token使用量
	RawResponse      interface{} `json:"raw_response,omitempty"`      // 原始响应
}

// ToolCall 工具调用结构
type ToolCall struct {
	ID   string                 `json:"id"`        // 调用ID
	Name string                 `json:"name"`      // 工具名称
	Args map[string]interface{} `json:"arguments"` // 工具参数
}

// Usage Token使用量统计
type Usage struct {
	InputTokens  int `json:"input_tokens"`  // 输入Token数
	OutputTokens int `json:"output_tokens"` // 输出Token数
	TotalTokens  int `json:"total_tokens"`  // 总Token数
}

// Option 模型请求选项函数
type Option func(*ModelRequest)

// ModelRequest 模型请求结构
type ModelRequest struct {
	Model       string           `json:"model"`       // 模型名称
	Messages    []Message        `json:"messages"`    // 消息列表
	Temperature float64          `json:"temperature"` // 温度参数
	MaxTokens   int              `json:"max_tokens"`  // 最大输出Token
	Tools       []ToolDefinition `json:"tools"`       // 可用工具列表
	Stream      bool             `json:"stream"`      // 是否流式
}

// ToolDefinition 工具定义结构
type ToolDefinition struct {
	Name        string                 `json:"name"`        // 工具名称
	Description string                 `json:"description"` // 工具描述
	Parameters  map[string]interface{} `json:"parameters"`  // 参数Schema
}

// WithTemperature 设置温度参数
func WithTemperature(temp float64) Option {
	return func(req *ModelRequest) {
		req.Temperature = temp
	}
}

// WithMaxTokens 设置最大Token数
func WithMaxTokens(max int) Option {
	return func(req *ModelRequest) {
		req.MaxTokens = max
	}
}

// WithTools 设置可用工具
func WithTools(tools []ToolDefinition) Option {
	return func(req *ModelRequest) {
		req.Tools = tools
	}
}

// WithStream 设置流式模式
func WithStream(stream bool) Option {
	return func(req *ModelRequest) {
		req.Stream = stream
	}
}

// ModelInfo 模型信息
type ModelInfo struct {
	ID           string    `json:"id"`           // 模型ID
	Name         string    `json:"name"`         // 模型名称
	Type         ModelType `json:"type"`         // 模型类型
	Endpoint     string    `json:"endpoint"`     // API端点
	APIKey       string    `json:"api_key"`      // API密钥
	Priority     int       `json:"priority"`     // 优先级 (数字越小优先级越高)
	Enabled      bool      `json:"enabled"`      // 是否启用
	Capabilities []string  `json:"capabilities"` // 支持的能力
}

// ModelType 模型类型
type ModelType int

const (
	ModelTypeChat      ModelType = iota // 聊天模型
	ModelTypeEmbedding                  // 向量模型
	ModelTypeRerank                     // 重排序模型
)

// ErrNoAvailableModel 没有可用模型
var ErrNoAvailableModel = errors.New("no available model")
