package model

import (
	"context"
	"sync"
	"testing"
	"time"
)

// TestMockChatModel 测试模拟聊天模型
func TestMockChatModel(t *testing.T) {
	model := NewMockChatModel("test-model")

	if model.GetModelName() != "test-model" {
		t.Errorf("expected 'test-model', got '%s'", model.GetModelName())
	}

	// 测试Chat
	resp, err := model.Chat(context.Background(), ChatRequest{
		Model: "test-model",
		Messages: []ChatMessage{
			{Role: "user", Content: "hello"},
		},
	})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if resp.Model != "test-model" {
		t.Errorf("expected model 'test-model', got '%s'", resp.Model)
	}
	if resp.Content == "" {
		t.Error("expected non-empty content")
	}
}

// TestMockChatModelError 测试模拟模型错误
func TestMockChatModelError(t *testing.T) {
	model := NewMockChatModel("error-model")
	model.shouldError = true

	_, err := model.Chat(context.Background(), ChatRequest{})
	if err == nil {
		t.Error("expected error")
	}
}

// TestMockChatModelStream 测试模拟模型流式聊天
func TestMockChatModelStream(t *testing.T) {
	model := NewMockChatModel("stream-model")

	var responses []string
	err := model.StreamChat(context.Background(), ChatRequest{}, func(resp ChatResponse) {
		responses = append(responses, resp.Content)
	})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(responses) == 0 {
		t.Error("expected at least one response")
	}
}

// TestMiniMaxRouterRegisterModel 测试注册模型
func TestMiniMaxRouterRegisterModel(t *testing.T) {
	router := NewMiniMaxRouter()

	model := NewMockChatModel("model1")
	err := router.RegisterModel(model, 10)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// 注册nil应返回错误
	err = router.RegisterModel(nil, 10)
	if err == nil {
		t.Error("expected error for nil model")
	}
}

// TestMiniMaxRouterUnregisterModel 测试注销模型
func TestMiniMaxRouterUnregisterModel(t *testing.T) {
	router := NewMiniMaxRouter()

	model := NewMockChatModel("model1")
	router.RegisterModel(model, 10)

	err := router.UnregisterModel("model1")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

// TestMiniMaxRouterRoute 测试路由
func TestMiniMaxRouterRoute(t *testing.T) {
	router := NewMiniMaxRouter()

	model1 := NewMockChatModel("model1")
	model2 := NewMockChatModel("model2")

	router.RegisterModel(model1, 10)
	router.RegisterModel(model2, 20)

	resp, err := router.Route(context.Background(), ChatRequest{
		Model: "model2",
		Messages: []ChatMessage{
			{Role: "user", Content: "hello"},
		},
	})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// 应该路由到更高优先级的model2
	if resp.Model != "model2" {
		t.Errorf("expected model2, got %s", resp.Model)
	}
}

// TestMiniMaxRouterRouteNoModel 测试无模型可用
func TestMiniMaxRouterRouteNoModel(t *testing.T) {
	router := NewMiniMaxRouter()

	_, err := router.Route(context.Background(), ChatRequest{})
	if err == nil {
		t.Error("expected error when no model available")
	}
}

// TestMiniMaxRouterStreamRoute 测试流式路由
func TestMiniMaxRouterStreamRoute(t *testing.T) {
	router := NewMiniMaxRouter()

	model := NewMockChatModel("stream-model")
	router.RegisterModel(model, 10)

	var responses []string
	err := router.StreamRoute(context.Background(), ChatRequest{}, func(resp ChatResponse) {
		responses = append(responses, resp.Content)
	})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(responses) == 0 {
		t.Error("expected at least one response")
	}
}

// TestMiniMaxRouterGetHealthStatus 测试获取健康状态
func TestMiniMaxRouterGetHealthStatus(t *testing.T) {
	router := NewMiniMaxRouter()

	model1 := NewMockChatModel("model1")
	model2 := NewMockChatModel("model2")

	router.RegisterModel(model1, 10)
	router.RegisterModel(model2, 20)

	status := router.GetHealthStatus()
	if len(status) != 2 {
		t.Errorf("expected 2 health statuses, got %d", len(status))
	}
}

// TestMiniMaxRouterConcurrency 测试并发路由
func TestMiniMaxRouterConcurrency(t *testing.T) {
	router := NewMiniMaxRouter()

	model := NewMockChatModel("concurrent-model")
	router.RegisterModel(model, 10)

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			router.Route(context.Background(), ChatRequest{
				Messages: []ChatMessage{{Role: "user", Content: "test"}},
			})
		}()
	}

	wg.Wait()
}

// TestChatMessage 测试聊天消息
func TestChatMessage(t *testing.T) {
	msg := ChatMessage{
		Role:    "user",
		Content: "hello",
	}

	if msg.Role != "user" {
		t.Errorf("expected role 'user', got '%s'", msg.Role)
	}
	if msg.Content != "hello" {
		t.Errorf("expected content 'hello', got '%s'", msg.Content)
	}
}

// TestChatRequest 测试聊天请求
func TestChatRequest(t *testing.T) {
	req := ChatRequest{
		Model: "test-model",
		Messages: []ChatMessage{
			{Role: "user", Content: "hello"},
		},
		Stream:    true,
		MaxTokens: 100,
	}

	if req.Model != "test-model" {
		t.Errorf("expected model 'test-model', got '%s'", req.Model)
	}
	if !req.Stream {
		t.Error("expected Stream to be true")
	}
	if req.MaxTokens != 100 {
		t.Errorf("expected MaxTokens 100, got %d", req.MaxTokens)
	}
}

// TestChatResponse 测试聊天响应
func TestChatResponse(t *testing.T) {
	resp := ChatResponse{
		Model:       "test-model",
		Content:     "hello",
		FinishReason: "stop",
		Usage: Usage{
			PromptTokens:     10,
			CompletionTokens: 20,
			TotalTokens:      30,
		},
	}

	if resp.Content != "hello" {
		t.Errorf("expected content 'hello', got '%s'", resp.Content)
	}
	if resp.Usage.TotalTokens != 30 {
		t.Errorf("expected total tokens 30, got %d", resp.Usage.TotalTokens)
	}
}

// TestHealthStatus 测试健康状态
func TestHealthStatus(t *testing.T) {
	status := HealthStatus{
		Model:     "test-model",
		Healthy:   true,
		Latency:   time.Second,
		LastCheck: time.Now(),
		Error:     nil,
	}

	if status.Model != "test-model" {
		t.Errorf("expected model 'test-model', got '%s'", status.Model)
	}
	if !status.Healthy {
		t.Error("expected healthy to be true")
	}
}

// TestChatModelInterface 测试聊天模型接口
func TestChatModelInterface(t *testing.T) {
	// 确保实现了接口
	var _ ChatModel = (*MockChatModel)(nil)
}

// TestModelRouterInterface 测试路由器接口
func TestModelRouterInterface(t *testing.T) {
	// 确保实现了接口
	var _ ModelRouter = (*miniMaxRouter)(nil)
}
