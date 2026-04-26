/**
 * MCP 工具系统测试
 */

package mcp

import (
	"context"
	"testing"
	"time"
)

// TestBuiltinToolExecutor 测试内置工具执行器
func TestBuiltinToolExecutor(t *testing.T) {
	exec := NewBuiltinToolExecutor(30000)

	// 注册测试工具
	exec.Register("test_tool", "测试工具", map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"input": map[string]interface{}{
				"type": "string",
			},
		},
	}, func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
		return "hello " + args["input"].(string), nil
	})

	// 测试执行
	result, err := exec.Execute(context.Background(), &MCPToolCall{
		Name:      "test_tool",
		Arguments: map[string]interface{}{"input": "world"},
	})

	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}

	if !result.Success {
		t.Fatalf("Execute failed: %s", result.Error)
	}

	if result.Result != "hello world" {
		t.Fatalf("Expected 'hello world', got '%v'", result.Result)
	}
}

// TestBuiltinToolExecutor_NotFound 测试工具不存在
func TestBuiltinToolExecutor_NotFound(t *testing.T) {
	exec := NewBuiltinToolExecutor(30000)

	result, err := exec.Execute(context.Background(), &MCPToolCall{
		Name:      "nonexistent",
		Arguments: map[string]interface{}{},
	})

	if err != nil {
		t.Fatalf("Execute should not return error for not found: %v", err)
	}

	if result.Success {
		t.Fatalf("Expected failure for nonexistent tool")
	}

	if result.ErrorCode != ErrorCodeToolNotFound {
		t.Fatalf("Expected ErrorCodeToolNotFound, got %d", result.ErrorCode)
	}
}

// TestRemoteToolExecutor_Creation 测试远程执行器创建
func TestRemoteToolExecutor_Creation(t *testing.T) {
	exec := NewRemoteToolExecutor(30000)

	if exec == nil {
		t.Fatal("NewRemoteToolExecutor returned nil")
	}

	if exec.timeout != 30000 {
		t.Fatalf("Expected timeout 30000, got %d", exec.timeout)
	}
}

// TestToolRegistry_Creation 测试工具注册表创建
func TestToolRegistry_Creation(t *testing.T) {
	registry := NewMCPToolRegistry()

	if registry == nil {
		t.Fatal("NewMCPToolRegistry returned nil")
	}

	// 测试内置工具注册
	tool := &MCPTool{
		Name:        "test_tool",
		Description: "测试工具",
		InputSchema: map[string]interface{}{},
	}

	err := registry.RegisterBuiltinTool(tool, func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
		return "result", nil
	})

	if err != nil {
		t.Fatalf("RegisterBuiltinTool failed: %v", err)
	}

	// 测试获取工具
	retrieved, err := registry.GetTool("", "test_tool")
	if err != nil {
		t.Fatalf("GetTool failed: %v", err)
	}

	if retrieved.Name != "test_tool" {
		t.Fatalf("Expected tool name 'test_tool', got '%s'", retrieved.Name)
	}
}

// TestMCPToolRegistry_ListAllTools 测试列出所有工具
func TestMCPToolRegistry_ListAllTools(t *testing.T) {
	registry := NewMCPToolRegistry()

	// 注册多个工具
	for i := 0; i < 3; i++ {
		name := "tool_" + string(rune('a'+i))
		registry.RegisterBuiltinTool(&MCPTool{
			Name:        name,
			Description: "测试工具",
			InputSchema: map[string]interface{}{},
		}, func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
			return nil, nil
		})
	}

	tools := registry.ListAllTools()
	if len(tools) != 3 {
		t.Fatalf("Expected 3 tools, got %d", len(tools))
	}
}

// TestMCPToolRegistry_Execute 测试执行工具
func TestMCPToolRegistry_Execute(t *testing.T) {
	registry := NewMCPToolRegistry()

	// 注册工具
	registry.RegisterBuiltinTool(&MCPTool{
		Name:        "echo",
		Description: "回显工具",
		InputSchema: map[string]interface{}{},
	}, func(ctx context.Context, args map[string]interface{}) (interface{}, error) {
		return args, nil
	})

	// 执行
	result, err := registry.Execute(context.Background(), &MCPToolCall{
		Name:      "echo",
		Arguments: map[string]interface{}{"msg": "hello"},
	})

	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}

	if !result.Success {
		t.Fatalf("Execute failed: %s", result.Error)
	}
}

// TestMCPToolResult_Structure 测试结果结构
func TestMCPToolResult_Structure(t *testing.T) {
	result := &MCPToolResult{
		Success:     true,
		Result:      "test",
		ErrorCode:   0,
		ExecutionMs: 100,
		Timestamp:   time.Now(),
	}

	if !result.Success {
		t.Fatal("Expected success")
	}

	if result.Result != "test" {
		t.Fatalf("Expected result 'test', got '%v'", result.Result)
	}
}

// TestMCPBatchOptions 测试批量选项
func TestMCPBatchOptions(t *testing.T) {
	opts := &MCPBatchOptions{
		Parallel:    true,
		StopOnError: false,
		Timeout:     30 * time.Second,
	}

	if !opts.Parallel {
		t.Fatal("Expected Parallel to be true")
	}

	if opts.StopOnError {
		t.Fatal("Expected StopOnError to be false")
	}
}

// TestErrorCodes 测试错误码定义
func TestErrorCodes(t *testing.T) {
	if ErrorCodeParseError != -32700 {
		t.Fatalf("Expected ErrorCodeParseError -32700, got %d", ErrorCodeParseError)
	}

	if ErrorCodeToolNotFound != -32000 {
		t.Fatalf("Expected ErrorCodeToolNotFound -32000, got %d", ErrorCodeToolNotFound)
	}

	if ErrorCodeTimeout != -32003 {
		t.Fatalf("Expected ErrorCodeTimeout -32003, got %d", ErrorCodeTimeout)
	}
}

// TestNewInputSchema 测试输入schema创建
func TestNewInputSchema(t *testing.T) {
	properties := map[string]*InputSchemaProperty{
		"name": {
			Type:        "string",
			Description: "名称",
			Required:    true,
		},
		"age": {
			Type:        "number",
			Description: "年龄",
			Default:     0,
		},
	}

	schema := NewInputSchema(properties, []string{"name"})

	if schema["type"] != "object" {
		t.Fatalf("Expected type 'object', got '%v'", schema["type"])
	}

	props, ok := schema["properties"].(map[string]*InputSchemaProperty)
	if !ok {
		t.Fatal("Expected properties to be map")
	}

	if len(props) != 2 {
		t.Fatalf("Expected 2 properties, got %d", len(props))
	}

	required, ok := schema["required"].([]string)
	if !ok {
		t.Fatal("Expected required to be []string")
	}

	if len(required) != 1 || required[0] != "name" {
		t.Fatalf("Expected required ['name'], got %v", required)
	}
}

// TestToolExecutor_Interface 测试工具执行器接口
func TestToolExecutor_Interface(t *testing.T) {
	// 测试内置执行器实现接口
	builtinExec := NewBuiltinToolExecutor(30000)
	var _ ToolExecutor = builtinExec

	// 测试远程执行器实现接口
	remoteExec := NewRemoteToolExecutor(30000)
	var _ ToolExecutor = remoteExec

	// 测试注册表实现接口
	registry := NewMCPToolRegistry()
	var _ ToolExecutor = registry
}
