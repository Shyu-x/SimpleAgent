package agent

import (
	"context"
	"errors"
	"sync"
	"time"
)

// Tool 工具接口
type Tool interface {
	// GetName 获取工具名称
	GetName() string
	// GetDescription 获取工具描述
	GetDescription() string
	// Execute 执行工具
	Execute(ctx context.Context, params map[string]interface{}) (interface{}, error)
}

// ToolResult 工具执行结果
type ToolResult struct {
	ToolName string
	Success  bool
	Result   interface{}
	Error    error
	Duration time.Duration
}

// Message 消息结构
type Message struct {
	Role      string
	Content   string
	Timestamp time.Time
}

// AgentConfig Agent配置
type AgentConfig struct {
	Name            string
	MaxIterations   int
	Timeout         time.Duration
	Tools           []Tool
	EnableMemory    bool
	MaxMemoryLength int
}

// Agent Agent接口
type Agent interface {
	// Execute 执行Agent
	Execute(ctx context.Context, input string) (string, error)
	// ExecuteWithTools 使用工具执行Agent
	ExecuteWithTools(ctx context.Context, input string) (string, []ToolResult, error)
	// GetMemory 获取记忆
	GetMemory() []Message
	// ClearMemory 清除记忆
	ClearMemory()
	// GetConfig 获取配置
	GetConfig() AgentConfig
}

// baseAgent 基础Agent实现
type baseAgent struct {
	config  AgentConfig
	memory  []Message
	mu      sync.RWMutex
	logger  Logger
}

// Logger 日志接口
type Logger interface {
	Info(msg string, args ...interface{})
	Error(msg string, args ...interface{})
	Debug(msg string, args ...interface{})
}

// Execute 执行Agent
func (a *baseAgent) Execute(ctx context.Context, input string) (string, error) {
	a.mu.Lock()
	a.memory = append(a.memory, Message{
		Role:      "user",
		Content:   input,
		Timestamp: time.Now(),
	})
	a.mu.Unlock()

	// 简单实现：直接返回输入作为响应
	response := "Agent processed: " + input

	a.mu.Lock()
	a.memory = append(a.memory, Message{
		Role:      "assistant",
		Content:   response,
		Timestamp: time.Now(),
	})
	a.mu.Unlock()

	return response, nil
}

// ExecuteWithTools 使用工具执行Agent
func (a *baseAgent) ExecuteWithTools(ctx context.Context, input string) (string, []ToolResult, error) {
	// 记录输入消息
	a.mu.Lock()
	a.memory = append(a.memory, Message{
		Role:      "user",
		Content:   input,
		Timestamp: time.Now(),
	})
	a.mu.Unlock()

	// 执行工具
	results := make([]ToolResult, 0)
	for _, tool := range a.config.Tools {
		result, err := tool.Execute(ctx, map[string]interface{}{"input": input})
		results = append(results, ToolResult{
			ToolName: tool.GetName(),
			Success:  err == nil,
			Result:   result,
			Error:    err,
			Duration: time.Second, // 简化实现
		})
	}

	response := "Executed " + string(rune(len(a.config.Tools))) + " tools"

	// 记录输出消息
	a.mu.Lock()
	a.memory = append(a.memory, Message{
		Role:      "assistant",
		Content:   response,
		Timestamp: time.Now(),
	})
	a.mu.Unlock()

	return response, results, nil
}

// GetMemory 获取记忆
func (a *baseAgent) GetMemory() []Message {
	a.mu.RLock()
	defer a.mu.RUnlock()
	mem := make([]Message, len(a.memory))
	copy(mem, a.memory)
	return mem
}

// ClearMemory 清除记忆
func (a *baseAgent) ClearMemory() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.memory = a.memory[:0]
}

// GetConfig 获取配置
func (a *baseAgent) GetConfig() AgentConfig {
	return a.config
}

// SimpleTool 简单工具实现
type SimpleTool struct {
	name        string
	description string
	handler     func(ctx context.Context, params map[string]interface{}) (interface{}, error)
}

// NewSimpleTool 创建简单工具
func NewSimpleTool(name, description string, handler func(ctx context.Context, params map[string]interface{}) (interface{}, error)) Tool {
	return &SimpleTool{
		name:        name,
		description: description,
		handler:     handler,
	}
}

// GetName 获取工具名称
func (t *SimpleTool) GetName() string {
	return t.name
}

// GetDescription 获取工具描述
func (t *SimpleTool) GetDescription() string {
	return t.description
}

// Execute 执行工具
func (t *SimpleTool) Execute(ctx context.Context, params map[string]interface{}) (interface{}, error) {
	return t.handler(ctx, params)
}

// Executor 工具执行器
type Executor struct {
	tools    map[string]Tool
	timeout  time.Duration
	mu       sync.RWMutex
}

// NewExecutor 创建执行器
func NewExecutor(timeout time.Duration) *Executor {
	return &Executor{
		tools:   make(map[string]Tool),
		timeout: timeout,
	}
}

// RegisterTool 注册工具
func (e *Executor) RegisterTool(tool Tool) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if tool == nil {
		return errors.New("tool cannot be nil")
	}

	e.tools[tool.GetName()] = tool
	return nil
}

// ExecuteTool 执行单个工具
func (e *Executor) ExecuteTool(ctx context.Context, toolName string, params map[string]interface{}) (interface{}, error) {
	e.mu.RLock()
	tool, exists := e.tools[toolName]
	e.mu.RUnlock()

	if !exists {
		return nil, errors.New("tool not found: " + toolName)
	}

	// 创建带超时的上下文
	ctx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()

	return tool.Execute(ctx, params)
}

// ExecuteTools 执行多个工具
func (e *Executor) ExecuteTools(ctx context.Context, toolCalls []struct {
	Name   string
	Params map[string]interface{}
}) []ToolResult {
	results := make([]ToolResult, 0, len(toolCalls))

	for _, call := range toolCalls {
		start := time.Now()
		result, err := e.ExecuteTool(ctx, call.Name, call.Params)
		results = append(results, ToolResult{
			ToolName: call.Name,
			Success:  err == nil,
			Result:   result,
			Error:    err,
			Duration: time.Since(start),
		})
	}

	return results
}

// ListTools 列出所有工具
func (e *Executor) ListTools() []string {
	e.mu.RLock()
	defer e.mu.RUnlock()

	names := make([]string, 0, len(e.tools))
	for name := range e.tools {
		names = append(names, name)
	}
	return names
}

// ReActAgent ReAct执行循环Agent
type ReActAgent struct {
	*baseAgent
	executor *Executor
}

// NewReActAgent 创建ReAct Agent
func NewReActAgent(config AgentConfig, executor *Executor) Agent {
	return &ReActAgent{
		baseAgent: &baseAgent{
			config: config,
			memory: make([]Message, 0),
		},
		executor: executor,
	}
}

// Execute 执行ReAct循环
func (a *ReActAgent) Execute(ctx context.Context, input string) (string, error) {
	a.mu.Lock()
	a.memory = append(a.memory, Message{
		Role:      "user",
		Content:   input,
		Timestamp: time.Now(),
	})
	a.mu.Unlock()

	var finalResponse string

	for i := 0; i < a.config.MaxIterations; i++ {
		// 检查上下文取消
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		default:
		}

		// 简单实现：直接返回
		finalResponse = "ReAct processed: " + input
		break
	}

	a.mu.Lock()
	a.memory = append(a.memory, Message{
		Role:      "assistant",
		Content:   finalResponse,
		Timestamp: time.Now(),
	})
	a.mu.Unlock()

	return finalResponse, nil
}
