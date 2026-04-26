package agent

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/ai-chat/backend_go/internal/domain/model"
)

// ToolHandler 工具处理函数类型
type ToolHandler func(ctx context.Context, args map[string]interface{}) (interface{}, error)

// ToolSpec 工具规格
type ToolSpec struct {
	Definition model.ToolDefinition
	Handler    ToolHandler
}

// ToolRegistry 工具注册表
type ToolRegistry struct {
	tools   map[string]ToolSpec
	mu      sync.RWMutex
	wrapped map[string]model.ToolDefinition
}

// NewToolRegistry 创建工具注册表
func NewToolRegistry() *ToolRegistry {
	return &ToolRegistry{
		tools:   make(map[string]ToolSpec),
		wrapped: make(map[string]model.ToolDefinition),
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
func (r *ToolRegistry) List() []model.ToolDefinition {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]model.ToolDefinition, 0, len(r.tools))
	for _, spec := range r.tools {
		result = append(result, spec.Definition)
	}
	return result
}

// RetryConfig 重试配置
type RetryConfig struct {
	MaxAttempts int           // 最大重试次数
	BaseDelay   time.Duration // 基础延迟
	MaxDelay    time.Duration // 最大延迟
}

// DefaultRetryConfig 默认重试配置
var DefaultRetryConfig = RetryConfig{
	MaxAttempts: 3,
	BaseDelay:   100 * time.Millisecond,
	MaxDelay:    5 * time.Second,
}

// MCPToolExecutor MCP工具执行器 (带重试和超时控制)
type MCPToolExecutor struct {
	registry   *ToolRegistry
	logger     interface {
		Debug(msg string, args ...interface{})
		Info(msg string, args ...interface{})
		Error(msg string, args ...interface{})
	}
	timeout    time.Duration
	retryConfig RetryConfig
}

// NewMCPToolExecutor 创建MCP工具执行器
func NewMCPToolExecutor(timeout time.Duration) *MCPToolExecutor {
	return &MCPToolExecutor{
		registry:    NewToolRegistry(),
		timeout:    timeout,
		retryConfig: DefaultRetryConfig,
	}
}

// NewMCPToolExecutorWithRetry 创建带重试配置的执行器
func NewMCPToolExecutorWithRetry(timeout time.Duration, retryCfg RetryConfig) *MCPToolExecutor {
	return &MCPToolExecutor{
		registry:    NewToolRegistry(),
		timeout:    timeout,
		retryConfig: retryCfg,
	}
}

// RegisterTool 注册MCP工具
func (e *MCPToolExecutor) RegisterTool(name string, description string, parameters map[string]interface{}, handler ToolHandler) {
	e.registry.Register(name, ToolSpec{
		Definition: model.ToolDefinition{
			Name:        name,
			Description: description,
			Parameters:  parameters,
		},
		Handler: handler,
	})
}

// Execute 执行MCP工具 (带超时控制和重试机制)
func (e *MCPToolExecutor) Execute(ctx context.Context, name string, args map[string]interface{}) (*ToolResult, error) {
	spec, ok := e.registry.Get(name)
	if !ok {
		return nil, fmt.Errorf("mcp tool not found: %s", name)
	}

	var lastErr error
	maxAttempts := e.retryConfig.MaxAttempts

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		toolCtx, cancel := context.WithTimeout(ctx, e.timeout)

		start := time.Now()
		result, err := spec.Handler(toolCtx, args)
		duration := time.Since(start)

		cancel()

		if err == nil {
			return &ToolResult{
				ToolName: name,
				Args:     args,
				Result:   result,
				Error:    nil,
				Duration: duration,
				Attempts: attempt,
			}, nil
		}

		lastErr = err

		// 非可重试错误直接返回
		if !isRetryableError(err) {
			return &ToolResult{
				ToolName: name,
				Args:     args,
				Result:   nil,
				Error:    err,
				Duration: duration,
				Attempts: attempt,
			}, err
		}

		// 最后一次尝试不等待
		if attempt < maxAttempts {
			delay := e.calculateBackoff(attempt)
			if e.logger != nil {
				e.logger.Info(fmt.Sprintf("tool %s failed (attempt %d/%d), retrying in %v: %v",
					name, attempt, maxAttempts, delay, err))
			}

			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
			}
		}
	}

	return &ToolResult{
		ToolName: name,
		Args:     args,
		Result:   nil,
		Error:    lastErr,
		Attempts: maxAttempts,
	}, lastErr
}

// calculateBackoff 计算指数退避延迟
func (e *MCPToolExecutor) calculateBackoff(attempt int) time.Duration {
	delay := e.retryConfig.BaseDelay * time.Duration(1<<(attempt-1))
	if delay > e.retryConfig.MaxDelay {
		delay = e.retryConfig.MaxDelay
	}
	return delay
}

// isRetryableError 判断错误是否可重试
func isRetryableError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	// 网络超时、临时故障可重试
	retryableKeywords := []string{"timeout", "temporary", "unavailable", "connection", "network"}
	for _, kw := range retryableKeywords {
		if strings.Contains(strings.ToLower(errStr), kw) {
			return true
		}
	}
	return false
}

// ExecuteParallel 并行执行多个工具
func (e *MCPToolExecutor) ExecuteParallel(ctx context.Context, tools []model.ToolCall) ([]*ToolResult, error) {
	if len(tools) == 0 {
		return nil, nil
	}

	results := make([]*ToolResult, len(tools))
	errChan := make(chan error, len(tools))
	doneChan := make(chan struct{}, 1)

	go func() {
		var wg sync.WaitGroup
		for i, tc := range tools {
			wg.Add(1)
			go func(idx int, call model.ToolCall) {
				defer wg.Done()
				result, err := e.Execute(ctx, call.Name, call.Args)
				results[idx] = result
				if err != nil {
					errChan <- err
				}
			}(i, tc)
		}
		wg.Wait()
		close(doneChan)
	}()

	select {
	case <-ctx.Done():
		return results, ctx.Err()
	case <-doneChan:
		if len(errChan) > 0 {
			// 返回第一个错误，但保留所有结果
			return results, <-errChan
		}
		return results, nil
	}
}

// ListTools 列出所有MCP工具
func (e *MCPToolExecutor) ListTools() []model.ToolDefinition {
	return e.registry.List()
}

// ToolResultMerger 工具结果合并器
type ToolResultMerger struct{}

// NewToolResultMerger 创建结果合并器
func NewToolResultMerger() *ToolResultMerger {
	return &ToolResultMerger{}
}

// Merge 合并多个工具结果
func (m *ToolResultMerger) Merge(results []*ToolResult) (string, error) {
	if len(results) == 0 {
		return "", nil
	}

	var merged strings.Builder
	for i, r := range results {
		if r.Error != nil {
			merged.WriteString(fmt.Sprintf("[%d] %s error: %v\n", i, r.ToolName, r.Error))
		} else {
			merged.WriteString(fmt.Sprintf("[%d] %s result: %v\n", i, r.ToolName, r.Result))
		}
	}
	return merged.String(), nil
}
