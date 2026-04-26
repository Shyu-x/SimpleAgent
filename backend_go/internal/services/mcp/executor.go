/**
 * MCP 工具执行器
 * 提供工具执行接口和远程工具执行实现
 */

package mcp

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// ToolExecutor 工具执行器接口
type ToolExecutor interface {
	// Execute 执行单个工具调用
	Execute(ctx context.Context, call *MCPToolCall) (*MCPToolResult, error)
	// ExecuteBatch 批量执行工具调用
	ExecuteBatch(ctx context.Context, calls []*MCPToolCall, opts *MCPBatchOptions) ([]*MCPToolResult, error)
	// ListTools 列出所有可用工具
	ListTools(serverName string) []*MCPTool
	// GetTool 获取指定工具
	GetTool(serverName, toolName string) (*MCPTool, error)
}

// RemoteToolExecutor 远程 MCP 工具执行器
type RemoteToolExecutor struct {
	client  *MCPClient
	configs map[string]*MCPConfig // 服务器配置列表
	tools   map[string][]*MCPTool  // 工具缓存: serverName -> tools
	mu      sync.RWMutex
	timeout int64 // 超时时间(毫秒)
}

// NewRemoteToolExecutor 创建远程工具执行器
func NewRemoteToolExecutor(timeoutMs int64) *RemoteToolExecutor {
	return &RemoteToolExecutor{
		client:  NewMCPClient("executor", &MCPConfig{Timeout: timeoutMs}),
		configs: make(map[string]*MCPConfig),
		tools:   make(map[string][]*MCPTool),
		timeout: timeoutMs,
	}
}

// RegisterServer 注册 MCP 服务器
func (e *RemoteToolExecutor) RegisterServer(config *MCPConfig) error {
	if config == nil || config.Name == "" || config.URL == "" {
		return fmt.Errorf("invalid MCP config: name and URL are required")
	}
	if config.Timeout == 0 {
		config.Timeout = e.timeout
	}

	e.mu.Lock()
	e.configs[config.Name] = config
	// 加载工具列表
	tools := e.client.ListTools(config)
	e.tools[config.Name] = tools
	e.mu.Unlock()

	return nil
}

// UnregisterServer 注销 MCP 服务器
func (e *RemoteToolExecutor) UnregisterServer(name string) {
	e.mu.Lock()
	defer e.mu.Unlock()

	delete(e.configs, name)
	delete(e.tools, name)
	e.client.RemoveConnection(name, "")
}

// Execute 执行单个工具调用
func (e *RemoteToolExecutor) Execute(ctx context.Context, call *MCPToolCall) (*MCPToolResult, error) {
	if call == nil {
		return nil, fmt.Errorf("tool call is nil")
	}
	if call.Name == "" {
		return nil, fmt.Errorf("tool name is required")
	}

	// 确定服务器
	serverName := ""
	if mcpTool, err := e.findServerForTool(call.Name); err == nil {
		serverName = mcpTool.MCPServer
	}
	if serverName == "" {
		return &MCPToolResult{
			ID:        "",
			Success:   false,
			Error:     "tool server not found",
			ErrorCode: ErrorCodeToolNotFound,
		}, nil
	}

	e.mu.RLock()
	config, ok := e.configs[serverName]
	e.mu.RUnlock()

	if !ok {
		return &MCPToolResult{
			ID:        "",
			Success:   false,
			Error:     fmt.Sprintf("MCP server not found: %s", serverName),
			ErrorCode: ErrorCodeConnectionError,
		}, nil
	}

	// 构建工具调用
	toolCall := &MCPToolCall{
		Name:      call.Name,
		Arguments: call.Arguments,
	}

	// 执行调用
	start := time.Now()
	result := e.client.ExecuteMCP(toolCall, config, nil)
	executionMs := time.Since(start).Milliseconds()

	return &MCPToolResult{
		ID:          "",
		Success:     result.Success,
		Result:      result.Result,
		Error:       result.Error,
		ErrorCode:   e.mapErrorType(result.ErrorType),
		ExecutionMs: executionMs,
		Timestamp:   time.Now(),
	}, nil
}

// ExecuteBatch 批量执行工具调用
func (e *RemoteToolExecutor) ExecuteBatch(ctx context.Context, calls []*MCPToolCall, opts *MCPBatchOptions) ([]*MCPToolResult, error) {
	if len(calls) == 0 {
		return []*MCPToolResult{}, nil
	}

	parallel := true
	stopOnError := false
	if opts != nil {
		parallel = opts.Parallel
		stopOnError = opts.StopOnError
	}

	results := make([]*MCPToolResult, len(calls))

	if parallel {
		var wg sync.WaitGroup
		for i, call := range calls {
			wg.Add(1)
			go func(idx int, c *MCPToolCall) {
				defer wg.Done()
				result, _ := e.Execute(ctx, c)
				if result != nil {
					results[idx] = result
				}
			}(i, call)
		}
		wg.Wait()
	} else {
		for i, call := range calls {
			result, _ := e.Execute(ctx, call)
			if result != nil {
				results[i] = result
			}
			if stopOnError && !result.Success {
				results = results[:i+1]
				break
			}
		}
	}

	return results, nil
}

// ListTools 列出所有可用工具
func (e *RemoteToolExecutor) ListTools(serverName string) []*MCPTool {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if serverName != "" {
		return e.tools[serverName]
	}

	// 返回所有服务器的工具
	var all []*MCPTool
	for _, tools := range e.tools {
		all = append(all, tools...)
	}
	return all
}

// GetTool 获取指定工具
func (e *RemoteToolExecutor) GetTool(serverName, toolName string) (*MCPTool, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	tools, ok := e.tools[serverName]
	if !ok {
		return nil, fmt.Errorf("server not found: %s", serverName)
	}

	for _, tool := range tools {
		if tool.Name == toolName {
			return tool, nil
		}
	}

	return nil, fmt.Errorf("tool not found: %s", toolName)
}

// HealthCheck 健康检查
func (e *RemoteToolExecutor) HealthCheck(serverName string) *MCPHealthResult {
	e.mu.RLock()
	config, ok := e.configs[serverName]
	e.mu.RUnlock()

	if !ok {
		return &MCPHealthResult{
			ServerName: serverName,
			Healthy:    false,
			Error:      "server not found",
			CheckedAt:  time.Now(),
		}
	}

	result := e.client.HealthCheck(config)
	return &MCPHealthResult{
		ServerName: serverName,
		Healthy:    result.Healthy,
		LatencyMs:  result.LatencyMs,
		Error:      result.Error,
		CheckedAt:  time.Now(),
	}
}

// HealthCheckAll 检查所有服务器健康状态
func (e *RemoteToolExecutor) HealthCheckAll() []*MCPHealthResult {
	e.mu.RLock()
	names := make([]string, 0, len(e.configs))
	for name := range e.configs {
		names = append(names, name)
	}
	e.mu.RUnlock()

	results := make([]*MCPHealthResult, len(names))
	for i, name := range names {
		results[i] = e.HealthCheck(name)
	}
	return results
}

// findServerForTool 查找工具所在的服务器
func (e *RemoteToolExecutor) findServerForTool(toolName string) (*MCPTool, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	for serverName, tools := range e.tools {
		for _, tool := range tools {
			if tool.Name == toolName {
				tool.MCPServer = serverName
				return tool, nil
			}
		}
	}
	return nil, fmt.Errorf("tool not found: %s", toolName)
}

// mapErrorType 映射错误类型到错误码
func (e *RemoteToolExecutor) mapErrorType(errorType string) int {
	switch errorType {
	case "timeout":
		return ErrorCodeTimeout
	case "auth":
		return ErrorCodeAuthError
	case "rate_limit":
		return ErrorCodeRateLimit
	case "network":
		return ErrorCodeConnectionError
	case "execution":
		return ErrorCodeToolExecution
	default:
		return ErrorCodeInternalError
	}
}

// BuiltinToolExecutor 内置工具执行器
type BuiltinToolExecutor struct {
	registry *ToolRegistry
	timeout  int64
}

// NewBuiltinToolExecutor 创建内置工具执行器
func NewBuiltinToolExecutor(timeoutMs int64) *BuiltinToolExecutor {
	return &BuiltinToolExecutor{
		registry: NewToolRegistry(),
		timeout:  timeoutMs,
	}
}

// Register 注册内置工具
func (e *BuiltinToolExecutor) Register(name string, desc string, params map[string]interface{}, handler ToolHandlerFunc) {
	e.registry.Register(name, ToolSpec{
		Definition: ToolDef{
			Name:        name,
			Description: desc,
			Parameters:  params,
		},
		Handler: handler,
	})
}

// Execute 执行内置工具
func (e *BuiltinToolExecutor) Execute(ctx context.Context, call *MCPToolCall) (*MCPToolResult, error) {
	if call == nil || call.Name == "" {
		return nil, fmt.Errorf("invalid tool call")
	}

	spec, ok := e.registry.Get(call.Name)
	if !ok {
		return &MCPToolResult{
			ID:        "",
			Success:   false,
			Error:     fmt.Sprintf("tool not found: %s", call.Name),
			ErrorCode: ErrorCodeToolNotFound,
		}, nil
	}

	timeout := time.Duration(e.timeout) * time.Millisecond
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	start := time.Now()
	result, err := spec.Handler(ctx, call.Arguments)
	executionMs := time.Since(start).Milliseconds()

	if err != nil {
		return &MCPToolResult{
			ID:          "",
			Success:     false,
			Error:       err.Error(),
			ErrorCode:   ErrorCodeToolExecution,
			ExecutionMs: executionMs,
			Timestamp:   time.Now(),
		}, nil
	}

	return &MCPToolResult{
		ID:          "",
		Success:     true,
		Result:      result,
		ExecutionMs: executionMs,
		Timestamp:   time.Now(),
	}, nil
}

// ExecuteBatch 批量执行内置工具
func (e *BuiltinToolExecutor) ExecuteBatch(ctx context.Context, calls []*MCPToolCall, opts *MCPBatchOptions) ([]*MCPToolResult, error) {
	results := make([]*MCPToolResult, len(calls))
	for i, call := range calls {
		results[i], _ = e.Execute(ctx, call)
	}
	return results, nil
}

// ListTools 列出所有内置工具
func (e *BuiltinToolExecutor) ListTools(serverName string) []*MCPTool {
	tools := e.registry.List()
	result := make([]*MCPTool, len(tools))
	for i, t := range tools {
		result[i] = &MCPTool{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: t.Parameters,
		}
	}
	return result
}

// GetTool 获取指定工具
func (e *BuiltinToolExecutor) GetTool(serverName, toolName string) (*MCPTool, error) {
	spec, ok := e.registry.Get(toolName)
	if !ok {
		return nil, fmt.Errorf("tool not found: %s", toolName)
	}
	return &MCPTool{
		Name:        spec.Definition.Name,
		Description: spec.Definition.Description,
		InputSchema: spec.Definition.Parameters,
	}, nil
}

// ToolHandlerFunc 工具处理函数类型
type ToolHandlerFunc func(ctx context.Context, args map[string]interface{}) (interface{}, error)

// ToolRegistry 工具注册表
type ToolRegistry struct {
	tools map[string]ToolSpec
	mu    sync.RWMutex
}

// ToolSpec 工具规格
type ToolSpec struct {
	Definition ToolDef
	Handler    ToolHandlerFunc
}

// ToolDef 工具定义
type ToolDef struct {
	Name        string
	Description string
	Parameters  map[string]interface{}
}

// NewToolRegistry 创建工具注册表
func NewToolRegistry() *ToolRegistry {
	return &ToolRegistry{
		tools: make(map[string]ToolSpec),
	}
}

// Register 注册工具
func (r *ToolRegistry) Register(name string, spec ToolSpec) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tools[name] = spec
}

// Get 获取工具规格
func (r *ToolRegistry) Get(name string) (ToolSpec, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	spec, ok := r.tools[name]
	return spec, ok
}

// List 列出所有工具定义
func (r *ToolRegistry) List() []ToolDef {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]ToolDef, 0, len(r.tools))
	for _, spec := range r.tools {
		result = append(result, spec.Definition)
	}
	return result
}

// Ensure RemoteToolExecutor and BuiltinToolExecutor implement ToolExecutor
var _ ToolExecutor = (*RemoteToolExecutor)(nil)
var _ ToolExecutor = (*BuiltinToolExecutor)(nil)
