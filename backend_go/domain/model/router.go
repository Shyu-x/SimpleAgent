package model

import (
	"context"
	"errors"
	"sync"
	"time"
)

// ChatMessage 聊天消息
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatRequest 聊天请求
type ChatRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
	MaxTokens int          `json:"max_tokens"`
}

// ChatResponse 聊天响应
type ChatResponse struct {
	Model      string `json:"model"`
	Content    string `json:"content"`
	FinishReason string `json:"finish_reason"`
	Usage      Usage  `json:"usage"`
}

// Usage 使用量
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// ChatModel 聊天模型接口
type ChatModel interface {
	// Chat 聊天
	Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error)
	// StreamChat 流式聊天
	StreamChat(ctx context.Context, req ChatRequest, callback func(resp ChatResponse)) error
	// GetModelName 获取模型名称
	GetModelName() string
}

// HealthStatus 健康状态
type HealthStatus struct {
	Model    string
	Healthy  bool
	Latency  time.Duration
	LastCheck time.Time
	Error    error
}

// ModelRouter 模型路由器接口
type ModelRouter interface {
	// Route 路由请求
	Route(ctx context.Context, req ChatRequest) (*ChatResponse, error)
	// StreamRoute 流式路由
	StreamRoute(ctx context.Context, req ChatRequest, callback func(resp ChatResponse)) error
	// GetHealthStatus 获取健康状态
	GetHealthStatus() []HealthStatus
	// RegisterModel 注册模型
	RegisterModel(model ChatModel, priority int) error
	// UnregisterModel 注销模型
	UnregisterModel(modelName string) error
}

// modelEntry 模型条目
type modelEntry struct {
	model    ChatModel
	priority int
	healthy  bool
	mu       sync.RWMutex
}

// miniMaxRouter MiniMax路由器实现
type miniMaxRouter struct {
	models    map[string]*modelEntry
	mu        sync.RWMutex
	checkInterval time.Duration
}

// NewMiniMaxRouter 创建MiniMax路由器
func NewMiniMaxRouter() ModelRouter {
	r := &miniMaxRouter{
		models:       make(map[string]*modelEntry),
		checkInterval: 30 * time.Second,
	}

	// 启动健康检查协程
	go r.healthCheckLoop()

	return r
}

// Route 路由请求
func (r *miniMaxRouter) Route(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// 选择健康的最高优先级模型
	var selected *modelEntry
	for _, entry := range r.models {
		entry.mu.RLock()
		if entry.healthy && (selected == nil || entry.priority > selected.priority) {
			selected = entry
		}
		entry.mu.RUnlock()
	}

	if selected == nil {
		return nil, errors.New("no available model")
	}

	return selected.model.Chat(ctx, req)
}

// StreamRoute 流式路由
func (r *miniMaxRouter) StreamRoute(ctx context.Context, req ChatRequest, callback func(resp ChatResponse)) error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var selected *modelEntry
	for _, entry := range r.models {
		entry.mu.RLock()
		if entry.healthy && (selected == nil || entry.priority > selected.priority) {
			selected = entry
		}
		entry.mu.RUnlock()
	}

	if selected == nil {
		return errors.New("no available model")
	}

	return selected.model.StreamChat(ctx, req, callback)
}

// GetHealthStatus 获取健康状态
func (r *miniMaxRouter) GetHealthStatus() []HealthStatus {
	r.mu.RLock()
	defer r.mu.RUnlock()

	status := make([]HealthStatus, 0, len(r.models))
	for name, entry := range r.models {
		entry.mu.RLock()
		status = append(status, HealthStatus{
			Model:    name,
			Healthy:  entry.healthy,
			LastCheck: time.Now(),
		})
		entry.mu.RUnlock()
	}

	return status
}

// RegisterModel 注册模型
func (r *miniMaxRouter) RegisterModel(model ChatModel, priority int) error {
	if model == nil {
		return errors.New("model cannot be nil")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.models[model.GetModelName()] = &modelEntry{
		model:    model,
		priority: priority,
		healthy:  true,
	}

	return nil
}

// UnregisterModel 注销模型
func (r *miniMaxRouter) UnregisterModel(modelName string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.models, modelName)
	return nil
}

// healthCheckLoop 健康检查循环
func (r *miniMaxRouter) healthCheckLoop() {
	ticker := time.NewTicker(r.checkInterval)
	for range ticker.C {
		r.mu.RLock()
		for name, entry := range r.models {
			entry.mu.Lock()
			// 简化：假设模型健康
			entry.healthy = true
			entry.mu.Unlock()

			_ = name // 避免未使用警告
		}
		r.mu.RUnlock()
	}
}

// MockChatModel 模拟聊天模型（用于测试）
type MockChatModel struct {
	name        string
	shouldError bool
	delay       time.Duration
}

// NewMockChatModel 创建模拟聊天模型
func NewMockChatModel(name string) *MockChatModel {
	return &MockChatModel{
		name: name,
	}
}

// Chat 聊天
func (m *MockChatModel) Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	if m.shouldError {
		return nil, errors.New("mock error")
	}

	// 模拟延迟
	if m.delay > 0 {
		time.Sleep(m.delay)
	}

	return &ChatResponse{
		Model:       m.name,
		Content:     "Mock response for: " + req.Messages[len(req.Messages)-1].Content,
		FinishReason: "stop",
		Usage: Usage{
			PromptTokens:     10,
			CompletionTokens: 20,
			TotalTokens:      30,
		},
	}, nil
}

// StreamChat 流式聊天
func (m *MockChatModel) StreamChat(ctx context.Context, req ChatRequest, callback func(resp ChatResponse)) error {
	if m.shouldError {
		return errors.New("mock error")
	}

	// 模拟流式响应
	callback(ChatResponse{
		Model:       m.name,
		Content:     "Mock",
		FinishReason: "",
	})

	callback(ChatResponse{
		Model:       m.name,
		Content:     " stream",
		FinishReason: "",
	})

	callback(ChatResponse{
		Model:       m.name,
		Content:     " response",
		FinishReason: "stop",
	})

	return nil
}

// GetModelName 获取模型名称
func (m *MockChatModel) GetModelName() string {
	return m.name
}
