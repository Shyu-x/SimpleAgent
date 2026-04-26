package agent

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/ai-chat/backend_go/internal/domain/model"
)

// MockModel 模拟模型
type MockModel struct {
	chatFunc  func(ctx context.Context, messages []model.Message, opts ...model.Option) (*model.Response, error)
	streamFunc func(ctx context.Context, messages []model.Message, callback func(*model.Response)) error
}

func (m *MockModel) Chat(ctx context.Context, messages []model.Message, opts ...model.Option) (*model.Response, error) {
	if m.chatFunc != nil {
		return m.chatFunc(ctx, messages, opts...)
	}
	return &model.Response{
		Content: "mock response",
		Usage: model.Usage{
			InputTokens:  10,
			OutputTokens: 20,
			TotalTokens:  30,
		},
	}, nil
}

func (m *MockModel) Stream(ctx context.Context, messages []model.Message, callback func(*model.Response)) error {
	if m.streamFunc != nil {
		return m.streamFunc(ctx, messages, callback)
	}
	callback(&model.Response{
		Content: "mock stream response",
	})
	return nil
}

// MockToolExecutor 模拟工具执行器
type MockToolExecutor struct {
	executeFunc func(ctx context.Context, toolName string, args map[string]interface{}) (*ToolResult, error)
}

func (m *MockToolExecutor) Execute(ctx context.Context, toolName string, args map[string]interface{}) (*ToolResult, error) {
	if m.executeFunc != nil {
		return m.executeFunc(ctx, toolName, args)
	}
	return &ToolResult{
		ToolName: toolName,
		Args:     args,
		Result:   "mock tool result",
		Duration: time.Millisecond * 10,
	}, nil
}

func (m *MockToolExecutor) Register(definition model.ToolDefinition, handler func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	// no-op for mock
}

func (m *MockToolExecutor) ListTools() []model.ToolDefinition {
	return []model.ToolDefinition{}
}

func TestNewExecutor(t *testing.T) {
	mockModel := &MockModel{}
	mockToolExecutor := &MockToolExecutor{}
	logger := slog.Default()

	config := ExecutorConfig{
		MaxIterations:    5,
		IterationTimeout: 30 * time.Second,
		EnableReasoning:  true,
		ToolTimeout:      60 * time.Second,
		EnableMemory:     true,
		MemoryWindowSize: 20,
		EnableRAG:        false,
		RAGTopK:          5,
		MaxContextTokens: 8000,
	}

	executor := NewExecutor(config, mockModel, mockToolExecutor, logger)

	if executor == nil {
		t.Fatal("expected executor to be created")
	}
	if executor.config.MaxIterations != 5 {
		t.Errorf("expected MaxIterations=5, got %d", executor.config.MaxIterations)
	}
	if executor.memoryService == nil {
		t.Error("expected memoryService to be initialized")
	}
	if executor.intentResolver == nil {
		t.Error("expected intentResolver to be initialized")
	}
}

func TestNewExecutorWithDefaults(t *testing.T) {
	mockModel := &MockModel{}
	mockToolExecutor := &MockToolExecutor{}
	logger := slog.Default()

	// 使用零值配置
	config := ExecutorConfig{}
	executor := NewExecutor(config, mockModel, mockToolExecutor, logger)

	// 验证默认值
	if executor.config.MaxIterations != 10 {
		t.Errorf("expected default MaxIterations=10, got %d", executor.config.MaxIterations)
	}
	if executor.config.IterationTimeout != 30*time.Second {
		t.Errorf("expected default IterationTimeout=30s, got %v", executor.config.IterationTimeout)
	}
	if executor.config.ToolTimeout != 60*time.Second {
		t.Errorf("expected default ToolTimeout=60s, got %v", executor.config.ToolTimeout)
	}
	if executor.config.MemoryWindowSize != 20 {
		t.Errorf("expected default MemoryWindowSize=20, got %d", executor.config.MemoryWindowSize)
	}
	if executor.config.RAGTopK != 5 {
		t.Errorf("expected default RAGTopK=5, got %d", executor.config.RAGTopK)
	}
	if executor.config.MaxContextTokens != 8000 {
		t.Errorf("expected default MaxContextTokens=8000, got %d", executor.config.MaxContextTokens)
	}
}

func TestExecutorExecuteNoTools(t *testing.T) {
	mockModel := &MockModel{
		chatFunc: func(ctx context.Context, messages []model.Message, opts ...model.Option) (*model.Response, error) {
			return &model.Response{
				Content: "Hello! How can I help you?",
				Usage: model.Usage{
					InputTokens:  10,
					OutputTokens: 20,
					TotalTokens:  30,
				},
			}, nil
		},
	}
	mockToolExecutor := &MockToolExecutor{}
	logger := slog.Default()

	executor := NewExecutor(ExecutorConfig{
		MaxIterations:    10,
		IterationTimeout:  30 * time.Second,
		EnableMemory:       false,
	}, mockModel, mockToolExecutor, logger)

	result, err := executor.Execute(context.Background(), "Hello", []model.ToolDefinition{})
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if result.State != "completed" {
		t.Errorf("expected state=completed, got %s", result.State)
	}
	if result.Content != "Hello! How can I help you?" {
		t.Errorf("expected content 'Hello! How can I help you?', got %s", result.Content)
	}
}

func TestExecutorExecuteWithToolCall(t *testing.T) {
	toolCalls := []model.ToolCall{
		{
			ID:   "call-1",
			Name: "search",
			Args: map[string]interface{}{"query": "test"},
		},
	}

	mockModel := &MockModel{
		chatFunc: func(ctx context.Context, messages []model.Message, opts ...model.Option) (*model.Response, error) {
			return &model.Response{
				Content:          "I'll search for that.",
				ToolCalls:        toolCalls,
				ReasoningContent: "I need to use the search tool",
			}, nil
		},
	}

	toolExecuted := false
	mockToolExecutor := &MockToolExecutor{
		executeFunc: func(ctx context.Context, toolName string, args map[string]interface{}) (*ToolResult, error) {
			toolExecuted = true
			if toolName != "search" {
				t.Errorf("expected tool name 'search', got %s", toolName)
			}
			return &ToolResult{
				ToolName: toolName,
				Args:     args,
				Result:   "search results",
				Duration: time.Millisecond * 10,
			}, nil
		},
	}

	logger := slog.Default()
	executor := NewExecutor(ExecutorConfig{
		MaxIterations:    10,
		IterationTimeout:  30 * time.Second,
		EnableMemory:      false,
	}, mockModel, mockToolExecutor, logger)

	// 第二次调用返回最终响应
	mockModel.chatFunc = func(ctx context.Context, messages []model.Message, opts ...model.Option) (*model.Response, error) {
		return &model.Response{
			Content: "Here are the search results: test result",
			Usage: model.Usage{
				InputTokens:  50,
				OutputTokens: 30,
				TotalTokens:  80,
			},
		}, nil
	}

	result, err := executor.Execute(context.Background(), "Search for test", []model.ToolDefinition{
		{
			Name:        "search",
			Description: "Search the web",
			Parameters:  map[string]interface{}{},
		},
	})

	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if !toolExecuted {
		t.Error("expected tool to be executed")
	}
	if len(result.ToolCalls) == 0 {
		t.Error("expected tool calls in result")
	}
}

func TestExecutorExecuteMaxIterations(t *testing.T) {
	mockModel := &MockModel{
		chatFunc: func(ctx context.Context, messages []model.Message, opts ...model.Option) (*model.Response, error) {
			// 始终返回工具调用，模拟未完成任务
			return &model.Response{
				Content:   "thinking...",
				ToolCalls: []model.ToolCall{{ID: "call-1", Name: "tool1", Args: map[string]interface{}{}}},
			}, nil
		},
	}
	mockToolExecutor := &MockToolExecutor{
		executeFunc: func(ctx context.Context, toolName string, args map[string]interface{}) (*ToolResult, error) {
			return &ToolResult{
				ToolName: toolName,
				Args:     args,
				Result:   "intermediate result",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorConfig{
		MaxIterations:   3,
		IterationTimeout: 30 * time.Second,
		EnableMemory:    false,
	}, mockModel, mockToolExecutor, slog.Default())

	result, err := executor.Execute(context.Background(), "do something", []model.ToolDefinition{})
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if result.State != "max_iterations" {
		t.Errorf("expected state=max_iterations, got %s", result.State)
	}
	if len(result.ToolCalls) != 3 {
		t.Errorf("expected 3 tool calls (max iterations), got %d", len(result.ToolCalls))
	}
}

func TestExecutorCancel(t *testing.T) {
	mockModel := &MockModel{
		chatFunc: func(ctx context.Context, messages []model.Message, opts ...model.Option) (*model.Response, error) {
			time.Sleep(100 * time.Millisecond)
			return &model.Response{
				Content:   "response",
				ToolCalls: []model.ToolCall{},
			}, nil
		},
	}
	mockToolExecutor := &MockToolExecutor{}

	executor := NewExecutor(ExecutorConfig{
		MaxIterations:   100,
		IterationTimeout: 10 * time.Second,
		EnableMemory:    false,
	}, mockModel, mockToolExecutor, slog.Default())

	// 在不同goroutine中取消
	go func() {
		time.Sleep(50 * time.Millisecond)
		executor.Cancel()
	}()

	result, err := executor.Execute(context.Background(), "cancel test", []model.ToolDefinition{})
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if result.State != "cancelled" {
		t.Errorf("expected state=cancelled, got %s", result.State)
	}
}

func TestExecutorContextCancellation(t *testing.T) {
	mockModel := &MockModel{
		chatFunc: func(ctx context.Context, messages []model.Message, opts ...model.Option) (*model.Response, error) {
			time.Sleep(200 * time.Millisecond)
			return &model.Response{
				Content:   "response",
				ToolCalls: []model.ToolCall{},
			}, nil
		},
	}
	mockToolExecutor := &MockToolExecutor{}

	executor := NewExecutor(ExecutorConfig{
		MaxIterations:   100,
		IterationTimeout: 10 * time.Second,
		EnableMemory:    false,
	}, mockModel, mockToolExecutor, slog.Default())

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	result, err := executor.Execute(ctx, "timeout test", []model.ToolDefinition{})
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if result.State != "timeout" {
		t.Errorf("expected state=timeout, got %s", result.State)
	}
}

func TestExecutorToolError(t *testing.T) {
	mockModel := &MockModel{
		chatFunc: func(ctx context.Context, messages []model.Message, opts ...model.Option) (*model.Response, error) {
			return &model.Response{
				Content:   "about to call tool",
				ToolCalls: []model.ToolCall{{ID: "call-1", Name: "failing_tool", Args: map[string]interface{}{}}},
			}, nil
		},
	}
	mockToolExecutor := &MockToolExecutor{
		executeFunc: func(ctx context.Context, toolName string, args map[string]interface{}) (*ToolResult, error) {
			return &ToolResult{
				ToolName: toolName,
				Args:     args,
				Error:    errors.New("tool execution failed"),
			}, nil
		},
	}

	executor := NewExecutor(ExecutorConfig{
		MaxIterations:   10,
		IterationTimeout: 30 * time.Second,
		EnableMemory:    false,
	}, mockModel, mockToolExecutor, slog.Default())

	result, err := executor.Execute(context.Background(), "test tool error", []model.ToolDefinition{})
	// 工具错误应该被捕获，不会导致Execute失败
	if err != nil {
		t.Fatalf("Execute should not fail on tool error: %v", err)
	}
	if len(result.ToolCalls) == 0 {
		t.Error("expected tool calls to be recorded even with error")
	}
}

func TestExecutorMemory(t *testing.T) {
	mockModel := &MockModel{
		chatFunc: func(ctx context.Context, messages []model.Message, opts ...model.Option) (*model.Response, error) {
			return &model.Response{
				Content:   "Memory test response",
				ToolCalls: []model.ToolCall{},
			}, nil
		},
	}
	mockToolExecutor := &MockToolExecutor{}

	executor := NewExecutor(ExecutorConfig{
		MaxIterations:   10,
		IterationTimeout: 30 * time.Second,
		EnableMemory:    true,
		MemoryWindowSize: 5,
	}, mockModel, mockToolExecutor, slog.Default())

	// 第一次对话
	result1, _ := executor.Execute(context.Background(), "First message", []model.ToolDefinition{})
	if result1.State != "completed" {
		t.Errorf("first execute failed: state=%s", result1.State)
	}

	// 检查记忆服务是否有消息
	memoryService := executor.GetMemoryService()
	if memoryService == nil {
		t.Fatal("memoryService should not be nil")
	}
	messages := memoryService.GetMessages()
	// 应该有用户消息和助手回复
	if len(messages) < 2 {
		t.Errorf("expected at least 2 messages in memory, got %d", len(messages))
	}
}

func TestExecutorStreamExecute(t *testing.T) {
	var streamContent string
	mockModel := &MockModel{
		streamFunc: func(ctx context.Context, messages []model.Message, callback func(*model.Response)) error {
			callback(&model.Response{Content: "Hello"})
			callback(&model.Response{Content: " World"})
			return nil
		},
	}
	mockToolExecutor := &MockToolExecutor{}

	executor := NewExecutor(ExecutorConfig{
		MaxIterations:   10,
		IterationTimeout: 30 * time.Second,
		EnableMemory:    false,
	}, mockModel, mockToolExecutor, slog.Default())

	err := executor.StreamExecute(context.Background(), "stream test", []model.ToolDefinition{}, func(result *ExecuteResult) error {
		streamContent += result.Content
		return nil
	})

	if err != nil {
		t.Fatalf("StreamExecute failed: %v", err)
	}
	if streamContent != "Hello World" {
		t.Errorf("expected 'Hello World', got '%s'", streamContent)
	}
}

func TestBuildSystemPrompt(t *testing.T) {
	mockModel := &MockModel{}
	mockToolExecutor := &MockToolExecutor{}

	executor := NewExecutor(ExecutorConfig{
		MaxIterations:   10,
		IterationTimeout: 30 * time.Second,
		EnableReasoning:  true,
	}, mockModel, mockToolExecutor, slog.Default())

	tools := []model.ToolDefinition{
		{Name: "search", Description: "Search the web"},
		{Name: "calculator", Description: "Perform calculations"},
	}

	intent := ResolvedIntent{
		Domain:     "general",
		Category:   "chat",
		Confidence: 0.8,
	}

	prompt := executor.buildSystemPrompt(tools, intent)

	// 验证提示词包含关键元素
	if prompt == "" {
		t.Error("expected non-empty prompt")
	}
}

func TestFormatToolResult(t *testing.T) {
	mockModel := &MockModel{}
	mockToolExecutor := &MockToolExecutor{}

	executor := NewExecutor(ExecutorConfig{}, mockModel, mockToolExecutor, slog.Default())

	// 测试正常结果
	result := &ToolResult{
		ToolName: "test_tool",
		Result:   "success output",
	}
	formatted := executor.formatToolResult(result)
	if formatted != "Success: success output" {
		t.Errorf("expected 'Success: success output', got '%s'", formatted)
	}

	// 测试错误结果
	errorResult := &ToolResult{
		ToolName: "test_tool",
		Error:    errors.New("something went wrong"),
	}
	formatted = executor.formatToolResult(errorResult)
	if formatted != "Error: something went wrong" {
		t.Errorf("expected 'Error: something went wrong', got '%s'", formatted)
	}

	// 测试nil结果
	nilResult := &ToolResult{
		ToolName: "test_tool",
		Result:   nil,
	}
	formatted = executor.formatToolResult(nilResult)
	if formatted != "Success: (no output)" {
		t.Errorf("expected 'Success: (no output)', got '%s'", formatted)
	}
}

func TestExecutorIsCancelled(t *testing.T) {
	mockModel := &MockModel{}
	mockToolExecutor := &MockToolExecutor{}

	executor := NewExecutor(ExecutorConfig{}, mockModel, mockToolExecutor, slog.Default())

	// 初始状态应该未取消
	if executor.IsCancelled() {
		t.Error("expected initial state to not be cancelled")
	}

	// 取消后应该返回true
	executor.Cancel()
	if !executor.IsCancelled() {
		t.Error("expected to be cancelled after Cancel()")
	}

	// resetCancel应该重置状态
	executor.resetCancel()
	if executor.IsCancelled() {
		t.Error("expected to not be cancelled after resetCancel()")
	}
}

func TestSummarizeReasoning(t *testing.T) {
	mockModel := &MockModel{}
	mockToolExecutor := &MockToolExecutor{}

	executor := NewExecutor(ExecutorConfig{}, mockModel, mockToolExecutor, slog.Default())

	// 测试空推理
	empty := executor.summarizeReasoning("")
	if empty != "" {
		t.Errorf("expected empty string, got '%s'", empty)
	}

	// 测试短推理（不超过200字符）
	short := "short reasoning"
	summary := executor.summarizeReasoning(short)
	if summary != short {
		t.Errorf("expected '%s', got '%s'", short, summary)
	}

	// 测试长推理（超过200字符）
	long := make([]byte, 300)
	for i := range long {
		long[i] = 'a'
	}
	longReasoning := string(long)
	summary = executor.summarizeReasoning(longReasoning)
	if len(summary) != 203 { // 200 + "..."
		t.Errorf("expected 203 chars, got %d", len(summary))
	}
	if summary[len(summary)-3:] != "..." {
		t.Errorf("expected ending '...', got '%s'", summary[len(summary)-3:])
	}
}
