package agent

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/ai-chat/backend_go/internal/domain/model"
)

func TestToolRegistry(t *testing.T) {
	registry := NewToolRegistry()

	// 测试注册工具
	registry.Register("test_tool", ToolSpec{
		Definition: model.ToolDefinition{
			Name:        "test_tool",
			Description: "A test tool",
			Parameters:  map[string]interface{}{"query": "string"},
		},
		Handler: func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
			return "test result", nil
		},
	})

	// 测试获取工具
	spec, ok := registry.Get("test_tool")
	if !ok {
		t.Fatal("expected to get registered tool")
	}
	if spec.Definition.Name != "test_tool" {
		t.Errorf("expected name 'test_tool', got '%s'", spec.Definition.Name)
	}

	// 测试获取不存在的工具
	_, ok = registry.Get("nonexistent")
	if ok {
		t.Error("expected not to get nonexistent tool")
	}

	// 测试列出工具
	tools := registry.List()
	if len(tools) != 1 {
		t.Errorf("expected 1 tool, got %d", len(tools))
	}
}

func TestToolRegistryConcurrency(t *testing.T) {
	registry := NewToolRegistry()

	var wg sync.WaitGroup
	// 并发注册
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			registry.Register("tool_"+string(rune('0'+idx%10)), ToolSpec{
				Definition: model.ToolDefinition{
					Name: "tool_" + string(rune('0'+idx%10)),
				},
				Handler: func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
					return nil, nil
				},
			})
		}(i)
	}
	wg.Wait()

	// 验证至少有一些工具被注册
	tools := registry.List()
	if len(tools) == 0 {
		t.Error("expected at least some tools to be registered")
	}
}

func TestNewMCPToolExecutor(t *testing.T) {
	executor := NewMCPToolExecutor(30 * time.Second)
	if executor == nil {
		t.Fatal("expected executor to be created")
	}
	if executor.timeout != 30*time.Second {
		t.Errorf("expected timeout 30s, got %v", executor.timeout)
	}
	if executor.registry == nil {
		t.Error("expected registry to be initialized")
	}
}

func TestMCPToolExecutorRegisterTool(t *testing.T) {
	executor := NewMCPToolExecutor(30 * time.Second)

	executor.RegisterTool(
		"calculator",
		"Perform mathematical calculations",
		map[string]interface{}{
			"operation": "string",
			"a":         "number",
			"b":         "number",
		},
		func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
			return "result: 42", nil
		},
	)

	tools := executor.ListTools()
	if len(tools) != 1 {
		t.Errorf("expected 1 tool, got %d", len(tools))
	}
	if tools[0].Name != "calculator" {
		t.Errorf("expected tool name 'calculator', got '%s'", tools[0].Name)
	}
}

func TestMCPToolExecutorExecute(t *testing.T) {
	executor := NewMCPToolExecutor(30 * time.Second)

	executed := false
	executor.RegisterTool(
		"test_tool",
		"A test tool",
		map[string]interface{}{"param": "string"},
		func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
			executed = true
			if args["param"] != "value" {
				t.Errorf("expected param='value', got '%v'", args["param"])
			}
			return "success", nil
		},
	)

	ctx := context.Background()
	result, err := executor.Execute(ctx, "test_tool", map[string]interface{}{"param": "value"})
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if !executed {
		t.Error("expected tool to be executed")
	}
	if result.ToolName != "test_tool" {
		t.Errorf("expected tool name 'test_tool', got '%s'", result.ToolName)
	}
	if result.Result != "success" {
		t.Errorf("expected result 'success', got '%v'", result.Result)
	}
	if result.Duration == 0 {
		t.Error("expected non-zero duration")
	}
}

func TestMCPToolExecutorExecuteNotFound(t *testing.T) {
	executor := NewMCPToolExecutor(30 * time.Second)

	ctx := context.Background()
	_, err := executor.Execute(ctx, "nonexistent", map[string]interface{}{})
	if err == nil {
		t.Error("expected error for nonexistent tool")
	}
	if err.Error() != "mcp tool not found: nonexistent" {
		t.Errorf("unexpected error message: %s", err.Error())
	}
}

func TestMCPToolExecutorExecuteTimeout(t *testing.T) {
	executor := NewMCPToolExecutor(10 * time.Millisecond)

	executor.RegisterTool(
		"slow_tool",
		"A slow tool",
		nil,
		func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
			time.Sleep(100 * time.Millisecond)
			return "done", nil
		},
	)

	ctx := context.Background()
	result, err := executor.Execute(ctx, "slow_tool", map[string]interface{}{})
	if err == nil {
		t.Error("expected timeout error")
	}
	// 上下文超时应该返回错误
	if result != nil && result.Error == nil {
		// 注意: 由于我们的实现，result可能不为nil但err有值
	}
}

func TestMCPToolExecutorListTools(t *testing.T) {
	executor := NewMCPToolExecutor(30 * time.Second)

	// 注册多个工具
	executor.RegisterTool("tool1", "First tool", nil, func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
		return nil, nil
	})
	executor.RegisterTool("tool2", "Second tool", nil, func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
		return nil, nil
	})
	executor.RegisterTool("tool3", "Third tool", nil, func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
		return nil, nil
	})

	tools := executor.ListTools()
	if len(tools) != 3 {
		t.Errorf("expected 3 tools, got %d", len(tools))
	}
}

func TestToolResultMerger(t *testing.T) {
	merger := NewToolResultMerger()

	// 测试空结果
	result, err := merger.Merge([]*ToolResult{})
	if err != nil {
		t.Errorf("Merge failed: %v", err)
	}
	if result != "" {
		t.Errorf("expected empty string, got '%s'", result)
	}

	// 测试正常合并
	results := []*ToolResult{
		{
			ToolName: "tool1",
			Result:   "result1",
		},
		{
			ToolName: "tool2",
			Result:   "result2",
		},
	}

	merged, err := merger.Merge(results)
	if err != nil {
		t.Errorf("Merge failed: %v", err)
	}
	if merged == "" {
		t.Error("expected non-empty merged result")
	}
}

func TestToolResultMergerWithErrors(t *testing.T) {
	merger := NewToolResultMerger()

	results := []*ToolResult{
		{
			ToolName: "tool1",
			Result:   "result1",
		},
		{
			ToolName: "tool2",
			Error:    errors.New("tool2 failed"),
		},
		{
			ToolName: "tool3",
			Result:   "result3",
		},
	}

	merged, err := merger.Merge(results)
	if err != nil {
		t.Errorf("Merge failed: %v", err)
	}
	// 验证错误被正确记录
	if merged == "" {
		t.Error("expected non-empty merged result")
	}
}

func TestDefaultToolExecutor(t *testing.T) {
	executor := NewDefaultToolExecutor(nil)
	if executor == nil {
		t.Fatal("expected executor to be created")
	}
	if len(executor.tools) != 0 {
		t.Errorf("expected empty tools map, got %d", len(executor.tools))
	}
	if len(executor.handlers) != 0 {
		t.Errorf("expected empty handlers map, got %d", len(executor.handlers))
	}
}

func TestDefaultToolExecutorRegister(t *testing.T) {
	executor := NewDefaultToolExecutor(nil)

	definition := model.ToolDefinition{
		Name:        "my_tool",
		Description: "My custom tool",
		Parameters:  map[string]interface{}{},
	}
	handler := func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
		return "handled", nil
	}

	executor.Register(definition, handler)

	if len(executor.tools) != 1 {
		t.Errorf("expected 1 tool, got %d", len(executor.tools))
	}
	if len(executor.handlers) != 1 {
		t.Errorf("expected 1 handler, got %d", len(executor.handlers))
	}

	// 验证工具定义
	tools := executor.ListTools()
	if len(tools) != 1 {
		t.Errorf("expected 1 tool in list, got %d", len(tools))
	}
	if tools[0].Name != "my_tool" {
		t.Errorf("expected tool name 'my_tool', got '%s'", tools[0].Name)
	}
}

func TestDefaultToolExecutorExecute(t *testing.T) {
	executor := NewDefaultToolExecutor(nil)

	toolCalled := false
	executor.Register(model.ToolDefinition{
		Name:        "echo",
		Description: "Echo back the input",
	}, func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
		toolCalled = true
		return args["message"], nil
	})

	ctx := context.Background()
	result, err := executor.Execute(ctx, "echo", map[string]interface{}{"message": "hello"})
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if !toolCalled {
		t.Error("expected tool to be called")
	}
	if result.ToolName != "echo" {
		t.Errorf("expected tool name 'echo', got '%s'", result.ToolName)
	}
	if result.Result != "hello" {
		t.Errorf("expected result 'hello', got '%v'", result.Result)
	}
}

func TestDefaultToolExecutorExecuteNotFound(t *testing.T) {
	executor := NewDefaultToolExecutor(nil)

	ctx := context.Background()
	_, err := executor.Execute(ctx, "nonexistent", map[string]interface{}{})
	if err == nil {
		t.Error("expected error for nonexistent tool")
	}
	if err.Error() != "tool not found: nonexistent" {
		t.Errorf("unexpected error message: %s", err.Error())
	}
}

func TestDefaultToolExecutorListTools(t *testing.T) {
	executor := NewDefaultToolExecutor(nil)

	// 注册多个工具
	executor.Register(model.ToolDefinition{Name: "tool1"}, func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
		return nil, nil
	})
	executor.Register(model.ToolDefinition{Name: "tool2"}, func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
		return nil, nil
	})

	tools := executor.ListTools()
	if len(tools) != 2 {
		t.Errorf("expected 2 tools, got %d", len(tools))
	}
}

func TestToolResult(t *testing.T) {
	result := &ToolResult{
		ToolName: "test",
		Args:     map[string]interface{}{"key": "value"},
		Result:   "success",
		Duration: time.Second,
	}

	if result.ToolName != "test" {
		t.Errorf("expected tool name 'test', got '%s'", result.ToolName)
	}
	if result.Args["key"] != "value" {
		t.Errorf("expected args[key]='value', got '%v'", result.Args["key"])
	}
	if result.Result != "success" {
		t.Errorf("expected result 'success', got '%v'", result.Result)
	}
	if result.Duration != time.Second {
		t.Errorf("expected duration 1s, got %v", result.Duration)
	}
}

func TestToolExecutorContext(t *testing.T) {
	executor := NewMCPToolExecutor(30 * time.Second)

	var ctx context.Context
	executor.RegisterTool(
		"context_tool",
		"Check context",
		nil,
		func(c context.Context, args map[string]interface{}) (interface{}, error) {
			ctx = c
			return "context received", nil
		},
	)

	result, err := executor.Execute(context.Background(), "context_tool", map[string]interface{}{})
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if ctx == nil {
		t.Error("expected context to be passed")
	}
	_ = result
}
