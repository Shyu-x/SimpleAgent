package agent

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

// TestSimpleTool 测试简单工具
func TestSimpleTool(t *testing.T) {
	tool := NewSimpleTool("test_tool", "A test tool", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
		return "result", nil
	})

	if tool.GetName() != "test_tool" {
		t.Errorf("expected name 'test_tool', got '%s'", tool.GetName())
	}

	if tool.GetDescription() != "A test tool" {
		t.Errorf("expected description 'A test tool', got '%s'", tool.GetDescription())
	}

	result, err := tool.Execute(context.Background(), map[string]interface{}{"key": "value"})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if result != "result" {
		t.Errorf("expected 'result', got '%v'", result)
	}
}

// TestSimpleToolError 测试工具错误
func TestSimpleToolError(t *testing.T) {
	tool := NewSimpleTool("error_tool", "An error tool", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
		return nil, errors.New("tool error")
	})

	_, err := tool.Execute(context.Background(), nil)
	if err == nil {
		t.Error("expected error, got nil")
	}
}

// TestExecutorRegisterTool 测试注册工具
func TestExecutorRegisterTool(t *testing.T) {
	executor := NewExecutor(time.Second)

	tool := NewSimpleTool("tool1", "Tool 1", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
		return "ok", nil
	})

	err := executor.RegisterTool(tool)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// 注册nil应返回错误
	err = executor.RegisterTool(nil)
	if err == nil {
		t.Error("expected error for nil tool")
	}
}

// TestExecutorExecuteTool 测试执行工具
func TestExecutorExecuteTool(t *testing.T) {
	executor := NewExecutor(time.Second)

	tool := NewSimpleTool("echo", "Echo tool", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
		return params["input"], nil
	})

	executor.RegisterTool(tool)

	result, err := executor.ExecuteTool(context.Background(), "echo", map[string]interface{}{"input": "hello"})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if result != "hello" {
		t.Errorf("expected 'hello', got '%v'", result)
	}
}

// TestExecutorExecuteToolNotFound 测试执行不存在的工具
func TestExecutorExecuteToolNotFound(t *testing.T) {
	executor := NewExecutor(time.Second)

	_, err := executor.ExecuteTool(context.Background(), "not_exist", nil)
	if err == nil {
		t.Error("expected error for not found tool")
	}
}

// TestExecutorExecuteTools 测试批量执行工具
func TestExecutorExecuteTools(t *testing.T) {
	executor := NewExecutor(time.Second)

	tool1 := NewSimpleTool("tool1", "Tool 1", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
		return "result1", nil
	})

	tool2 := NewSimpleTool("tool2", "Tool 2", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
		return "result2", nil
	})

	executor.RegisterTool(tool1)
	executor.RegisterTool(tool2)

	results := executor.ExecuteTools(context.Background(), []struct {
		Name   string
		Params map[string]interface{}
	}{
		{Name: "tool1", Params: nil},
		{Name: "tool2", Params: nil},
	})

	if len(results) != 2 {
		t.Errorf("expected 2 results, got %d", len(results))
	}
	if !results[0].Success || results[0].ToolName != "tool1" {
		t.Errorf("unexpected first result: %+v", results[0])
	}
	if !results[1].Success || results[1].ToolName != "tool2" {
		t.Errorf("unexpected second result: %+v", results[1])
	}
}

// TestExecutorListTools 测试列出工具
func TestExecutorListTools(t *testing.T) {
	executor := NewExecutor(time.Second)

	tool1 := NewSimpleTool("tool1", "Tool 1", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
		return nil, nil
	})
	tool2 := NewSimpleTool("tool2", "Tool 2", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
		return nil, nil
	})

	executor.RegisterTool(tool1)
	executor.RegisterTool(tool2)

	tools := executor.ListTools()
	if len(tools) != 2 {
		t.Errorf("expected 2 tools, got %d", len(tools))
	}
}

// TestBaseAgentExecute 测试基础Agent执行
func TestBaseAgentExecute(t *testing.T) {
	agent := &baseAgent{
		config: AgentConfig{
			Name:            "test_agent",
			MaxIterations:   5,
			EnableMemory:    true,
			MaxMemoryLength: 100,
		},
		memory: make([]Message, 0),
	}

	response, err := agent.Execute(context.Background(), "hello")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if response == "" {
		t.Error("expected non-empty response")
	}

	// 检查记忆
	memory := agent.GetMemory()
	if len(memory) != 2 { // user message + assistant message
		t.Errorf("expected 2 messages in memory, got %d", len(memory))
	}
}

// TestBaseAgentMemory 测试Agent记忆
func TestBaseAgentMemory(t *testing.T) {
	agent := &baseAgent{
		config:  AgentConfig{},
		memory:  make([]Message, 0),
	}

	agent.Execute(context.Background(), "message 1")
	agent.Execute(context.Background(), "message 2")

	memory := agent.GetMemory()
	if len(memory) != 4 {
		t.Errorf("expected 4 messages, got %d", len(memory))
	}

	agent.ClearMemory()
	memory = agent.GetMemory()
	if len(memory) != 0 {
		t.Errorf("expected 0 messages after clear, got %d", len(memory))
	}
}

// TestReActAgentExecute 测试ReAct Agent执行
func TestReActAgentExecute(t *testing.T) {
	executor := NewExecutor(time.Second)
	agent := NewReActAgent(AgentConfig{
		Name:          "react_agent",
		MaxIterations: 5,
	}, executor)

	response, err := agent.Execute(context.Background(), "test input")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if response == "" {
		t.Error("expected non-empty response")
	}
}

// TestReActAgentWithTools 测试ReAct Agent工具执行
func TestReActAgentWithTools(t *testing.T) {
	executor := NewExecutor(time.Second)

	tool := NewSimpleTool("search", "Search tool", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
		return "search result", nil
	})
	executor.RegisterTool(tool)

	agent := NewReActAgent(AgentConfig{
		Name:          "react_agent",
		MaxIterations: 5,
		Tools:         []Tool{tool},
	}, executor)

	response, results, err := agent.ExecuteWithTools(context.Background(), "search for AI")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if response == "" {
		t.Error("expected non-empty response")
	}

	if len(results) != 1 {
		t.Errorf("expected 1 tool result, got %d", len(results))
	}
}

// TestAgentConcurrency 测试Agent并发
func TestAgentConcurrency(t *testing.T) {
	agent := &baseAgent{
		config:  AgentConfig{},
		memory:  make([]Message, 0),
	}

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			agent.Execute(context.Background(), "concurrent message")
		}()
	}

	wg.Wait()

	memory := agent.GetMemory()
	if len(memory) != 20 {
		t.Errorf("expected 20 messages, got %d", len(memory))
	}
}

// TestAgentToolResult 测试工具结果结构
func TestAgentToolResult(t *testing.T) {
	result := ToolResult{
		ToolName: "test_tool",
		Success:  true,
		Result:   "test result",
		Duration: time.Second,
	}

	if result.ToolName != "test_tool" {
		t.Errorf("expected 'test_tool', got '%s'", result.ToolName)
	}
	if !result.Success {
		t.Error("expected success")
	}
	if result.Result != "test result" {
		t.Errorf("expected 'test result', got '%v'", result.Result)
	}
}

// TestMessage 测试消息结构
func TestMessage(t *testing.T) {
	msg := Message{
		Role:      "user",
		Content:   "test content",
		Timestamp: time.Now(),
	}

	if msg.Role != "user" {
		t.Errorf("expected role 'user', got '%s'", msg.Role)
	}
	if msg.Content != "test content" {
		t.Errorf("expected content 'test content', got '%s'", msg.Content)
	}
}
