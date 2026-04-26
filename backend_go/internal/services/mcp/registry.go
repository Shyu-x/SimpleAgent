/**
 * MCP 工具注册表
 * 提供工具注册、发现和生命周期管理
 * 支持内置工具和远程 MCP 工具的统一管理
 */

package mcp

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// MCPToolRegistry MCP 工具注册表
type MCPToolRegistry struct {
	builtinTools    map[string]*MCPTool        // 内置工具: name -> tool
	remoteTools     map[string][]*MCPTool     // 远程工具: serverName -> tools
	executors       map[string]ToolExecutor    // 执行器: serverName -> executor
	servers         map[string]*MCPConfig      // 服务器配置
	defaultExec     ToolExecutor              // 默认执行器
	mu              sync.RWMutex
	discoveryInterval time.Duration           // 自动发现间隔
	stopDiscovery   chan struct{}
}

// NewMCPToolRegistry 创建 MCP 工具注册表
func NewMCPToolRegistry() *MCPToolRegistry {
	return &MCPToolRegistry{
		builtinTools:      make(map[string]*MCPTool),
		remoteTools:      make(map[string][]*MCPTool),
		executors:        make(map[string]ToolExecutor),
		servers:          make(map[string]*MCPConfig),
		discoveryInterval: 5 * time.Minute,
		stopDiscovery:   make(chan struct{}),
	}
}

// RegisterBuiltinTool 注册内置工具
func (r *MCPToolRegistry) RegisterBuiltinTool(tool *MCPTool, handler ToolHandlerFunc) error {
	if tool == nil || tool.Name == "" {
		return fmt.Errorf("invalid tool: name is required")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	// 检查是否已存在
	if _, exists := r.builtinTools[tool.Name]; exists {
		return fmt.Errorf("tool already exists: %s", tool.Name)
	}

	// 如果没有默认执行器，创建一个内置执行器
	if r.defaultExec == nil {
		r.defaultExec = NewBuiltinToolExecutor(30000) // 30秒超时
	}

	// 转换为 ToolDef 并注册
	exec := r.defaultExec.(*BuiltinToolExecutor)
	exec.Register(tool.Name, tool.Description, tool.InputSchema, handler)

	r.builtinTools[tool.Name] = tool
	return nil
}

// RegisterRemoteServer 注册远程 MCP 服务器
func (r *MCPToolRegistry) RegisterRemoteServer(config *MCPConfig, executor *RemoteToolExecutor) error {
	if config == nil || config.Name == "" {
		return fmt.Errorf("invalid config: name is required")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.servers[config.Name] = config
	r.executors[config.Name] = executor

	return nil
}

// SetDefaultExecutor 设置默认执行器
func (r *MCPToolRegistry) SetDefaultExecutor(exec ToolExecutor) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.defaultExec = exec
}

// GetTool 获取工具定义
func (r *MCPToolRegistry) GetTool(serverName, toolName string) (*MCPTool, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// 先查找内置工具
	if tool, ok := r.builtinTools[toolName]; ok {
		return tool, nil
	}

	// 查找远程工具
	tools, ok := r.remoteTools[serverName]
	if !ok && serverName != "" {
		return nil, fmt.Errorf("server not found: %s", serverName)
	}

	if serverName == "" {
		// 全局搜索
		for _, serverTools := range r.remoteTools {
			for _, tool := range serverTools {
				if tool.Name == toolName {
					return tool, nil
				}
			}
		}
		return nil, fmt.Errorf("tool not found: %s", toolName)
	}

	for _, tool := range tools {
		if tool.Name == toolName {
			return tool, nil
		}
	}

	return nil, fmt.Errorf("tool not found: %s", toolName)
}

// ListAllTools 列出所有可用工具
func (r *MCPToolRegistry) ListAllTools() []*MCPTool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []*MCPTool

	// 添加内置工具
	for _, tool := range r.builtinTools {
		result = append(result, tool)
	}

	// 添加远程工具
	for _, tools := range r.remoteTools {
		result = append(result, tools...)
	}

	return result
}

// ListToolsByServer 列出指定服务器的工具
func (r *MCPToolRegistry) ListToolsByServer(serverName string) []*MCPTool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if serverName == "" {
		return r.listBuiltinToolsUnsafe()
	}

	tools, ok := r.remoteTools[serverName]
	if !ok {
		return nil
	}

	result := make([]*MCPTool, len(tools))
	copy(result, tools)
	return result
}

// listBuiltinToolsUnsafe 列出内置工具（不加锁版本）
func (r *MCPToolRegistry) listBuiltinToolsUnsafe() []*MCPTool {
	result := make([]*MCPTool, 0, len(r.builtinTools))
	for _, tool := range r.builtinTools {
		result = append(result, tool)
	}
	return result
}

// GetExecutor 获取执行器
func (r *MCPToolRegistry) GetExecutor(serverName string) (ToolExecutor, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if serverName != "" {
		if exec, ok := r.executors[serverName]; ok {
			return exec, nil
		}
	}

	if r.defaultExec != nil {
		return r.defaultExec, nil
	}

	return nil, fmt.Errorf("no executor available")
}

// Execute 执行工具
func (r *MCPToolRegistry) Execute(ctx context.Context, call *MCPToolCall) (*MCPToolResult, error) {
	if call == nil || call.Name == "" {
		return nil, fmt.Errorf("invalid tool call")
	}

	// 确定服务器
	serverName := ""
	if tool, err := r.findServerForTool(call.Name); err == nil {
		serverName = tool.MCPServer
	}

	exec, err := r.GetExecutor(serverName)
	if err != nil {
		return &MCPToolResult{
			Success:   false,
			Error:     err.Error(),
			ErrorCode: ErrorCodeToolNotFound,
		}, nil
	}

	return exec.Execute(ctx, call)
}

// ExecuteBatch 批量执行工具
func (r *MCPToolRegistry) ExecuteBatch(ctx context.Context, calls []*MCPToolCall, opts *MCPBatchOptions) ([]*MCPToolResult, error) {
	if len(calls) == 0 {
		return nil, nil
	}

	// 按服务器分组调用
	callsByServer := make(map[string][]*MCPToolCall)
	for _, call := range calls {
		serverName := ""
		if tool, err := r.findServerForTool(call.Name); err == nil {
			serverName = tool.MCPServer
		}
		callsByServer[serverName] = append(callsByServer[serverName], call)
	}

	// 执行每组调用
	var results []*MCPToolResult
	for serverName, serverCalls := range callsByServer {
		exec, err := r.GetExecutor(serverName)
		if err != nil {
			for range serverCalls {
				results = append(results, &MCPToolResult{
					Success:   false,
					Error:     err.Error(),
					ErrorCode: ErrorCodeToolNotFound,
				})
			}
			continue
		}

		serverResults, _ := exec.ExecuteBatch(ctx, serverCalls, opts)
		results = append(results, serverResults...)
	}

	return results, nil
}

// ListTools 列出工具 (实现 ToolExecutor 接口)
func (r *MCPToolRegistry) ListTools(serverName string) []*MCPTool {
	return r.ListToolsByServer(serverName)
}

// findServerForTool 查找工具所在的服务器
func (r *MCPToolRegistry) findServerForTool(toolName string) (*MCPTool, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// 先查内置工具
	if tool, ok := r.builtinTools[toolName]; ok {
		return tool, nil
	}

	// 查远程工具
	for serverName, tools := range r.remoteTools {
		for _, tool := range tools {
			if tool.Name == toolName {
				tool.MCPServer = serverName
				return tool, nil
			}
		}
	}
	return nil, fmt.Errorf("tool not found: %s", toolName)
}

// DiscoverTools 自动发现远程工具
func (r *MCPToolRegistry) DiscoverTools(ctx context.Context, serverName string) error {
	r.mu.RLock()
	config, ok := r.servers[serverName]
	exec, execOk := r.executors[serverName]
	r.mu.RUnlock()

	if !ok {
		return fmt.Errorf("server not found: %s", serverName)
	}

	if !execOk {
		return fmt.Errorf("executor not found for server: %s", serverName)
	}

	tools := exec.ListTools(serverName)

	r.mu.Lock()
	r.remoteTools[serverName] = tools
	r.mu.Unlock()

	// 更新服务器配置
	_ = config

	return nil
}

// DiscoverAllTools 发现所有远程服务器的工具
func (r *MCPToolRegistry) DiscoverAllTools(ctx context.Context) error {
	r.mu.RLock()
	names := make([]string, 0, len(r.servers))
	for name := range r.servers {
		names = append(names, name)
	}
	r.mu.RUnlock()

	for _, name := range names {
		if err := r.DiscoverTools(ctx, name); err != nil {
			return err
		}
	}

	return nil
}

// StartAutoDiscovery 启动自动发现
func (r *MCPToolRegistry) StartAutoDiscovery(ctx context.Context) {
	ticker := time.NewTicker(r.discoveryInterval)
	go func() {
		for {
			select {
			case <-ticker.C:
				_ = r.DiscoverAllTools(ctx)
			case <-r.stopDiscovery:
				ticker.Stop()
				return
			case <-ctx.Done():
				ticker.Stop()
				return
			}
		}
	}()
}

// StopAutoDiscovery 停止自动发现
func (r *MCPToolRegistry) StopAutoDiscovery() {
	close(r.stopDiscovery)
}

// HealthCheck 健康检查
func (r *MCPToolRegistry) HealthCheck(serverName string) *MCPHealthResult {
	r.mu.RLock()
	exec, ok := r.executors[serverName]
	r.mu.RUnlock()

	if !ok {
		return &MCPHealthResult{
			ServerName: serverName,
			Healthy:    false,
			Error:      "server not found",
			CheckedAt:  time.Now(),
		}
	}

	if remoteExec, ok := exec.(*RemoteToolExecutor); ok {
		return remoteExec.HealthCheck(serverName)
	}

	return &MCPHealthResult{
		ServerName: serverName,
		Healthy:    true,
		CheckedAt:  time.Now(),
	}
}

// HealthCheckAll 检查所有服务器健康状态
func (r *MCPToolRegistry) HealthCheckAll() []*MCPHealthResult {
	r.mu.RLock()
	names := make([]string, 0, len(r.servers))
	for name := range r.servers {
		names = append(names, name)
	}
	r.mu.RUnlock()

	results := make([]*MCPHealthResult, 0, len(names))
	for _, name := range names {
		results = append(results, r.HealthCheck(name))
	}
	return results
}

// GetServerConfig 获取服务器配置
func (r *MCPToolRegistry) GetServerConfig(name string) (*MCPConfig, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	config, ok := r.servers[name]
	return config, ok
}

// ListServers 列出所有注册的服务器
func (r *MCPToolRegistry) ListServers() []*MCPConfig {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*MCPConfig, 0, len(r.servers))
	for _, config := range r.servers {
		result = append(result, config)
	}
	return result
}

// RemoveServer 移除服务器
func (r *MCPToolRegistry) RemoveServer(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.servers, name)
	delete(r.remoteTools, name)
	delete(r.executors, name)
}

// FilterTools 过滤工具
func (r *MCPToolRegistry) FilterTools(filter *MCPToolFilter) []*MCPTool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []*MCPTool

	// 根据服务器名称过滤
	if filter.ServerName != "" {
		tools, ok := r.remoteTools[filter.ServerName]
		if !ok {
			return nil
		}
		result = tools
	} else {
		// 获取所有工具
		for _, tool := range r.builtinTools {
			result = append(result, tool)
		}
		for _, tools := range r.remoteTools {
			result = append(result, tools...)
		}
	}

	// 根据名称模式过滤
	if filter.NamePattern != "" {
		filtered := result[:0]
		for _, tool := range result {
			if containsString(tool.Name, filter.NamePattern) {
				filtered = append(filtered, tool)
			}
		}
		result = filtered
	}

	// 根据标签过滤
	if len(filter.Tags) > 0 {
		filtered := result[:0]
		for _, tool := range result {
			if hasCommonTag(tool.Annotations, filter.Tags) {
				filtered = append(filtered, tool)
			}
		}
		result = filtered
	}

	return result
}

// containsString 检查字符串是否包含子串
func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstr(s, substr))
}

func containsSubstr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// hasCommonTag 检查是否有共同标签
func hasCommonTag(annotations map[string]interface{}, tags []string) bool {
	if annotations == nil {
		return false
	}
	toolTags, ok := annotations["tags"].([]interface{})
	if !ok {
		return false
	}
	for _, tag := range tags {
		for _, t := range toolTags {
			if ts, ok := t.(string); ok && ts == tag {
				return true
			}
		}
	}
	return false
}

// Ensure MCPToolRegistry implements required interfaces
var _ ToolExecutor = (*MCPToolRegistry)(nil)
