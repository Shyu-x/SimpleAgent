package agent

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/ai-chat/backend_go/internal/domain/model"
)

// ExecutorConfig 执行器配置
type ExecutorConfig struct {
	MaxIterations    int           // 最大迭代次数
	IterationTimeout time.Duration // 单次迭代超时时间
	EnableReasoning  bool          // 启用思维链
	ToolTimeout      time.Duration // 工具执行超时
	EnableMemory     bool         // 启用对话记忆
	MemoryWindowSize int          // 记忆窗口大小
	EnableRAG        bool         // 启用RAG
	RAGTopK          int          // RAG检索数量
	MaxContextTokens int          // 最大上下文token数
}

// ToolResult 工具执行结果
type ToolResult struct {
	ToolName string                 `json:"tool_name"`
	Args     map[string]interface{} `json:"args"`
	Result   interface{}            `json:"result"`
	Error    error                  `json:"error"`
	Duration time.Duration         `json:"duration"`
	Attempts int                   `json:"attempts"`
	Cached   bool                  `json:"cached"`
}

// ReActStep ReAct执行步骤
type ReActStep struct {
	StepNum     int                    `json:"step_num"`
	Thought     string                 `json:"thought"`
	Action      string                 `json:"action"`
	ActionInput map[string]interface{} `json:"action_input"`
	Observed    string                 `json:"observed"`
	Finish      bool                   `json:"finish"`
	Reasoning   string                 `json:"reasoning"`
}

// ToolExecutor 工具执行器接口
type ToolExecutor interface {
	Execute(ctx context.Context, toolName string, args map[string]interface{}) (*ToolResult, error)
	Register(definition model.ToolDefinition, handler func(ctx context.Context, args map[string]interface{}) (interface{}, error))
	ListTools() []model.ToolDefinition
}

// DefaultToolExecutor 默认工具执行器
type DefaultToolExecutor struct {
	tools    map[string]model.ToolDefinition
	handlers map[string]func(ctx context.Context, args map[string]interface{}) (interface{}, error)
	logger   *slog.Logger
}

// NewDefaultToolExecutor 创建默认工具执行器
func NewDefaultToolExecutor(logger *slog.Logger) *DefaultToolExecutor {
	return &DefaultToolExecutor{
		tools:    make(map[string]model.ToolDefinition),
		handlers: make(map[string]func(ctx context.Context, args map[string]interface{}) (interface{}, error)),
		logger:   logger,
	}
}

// Register 注册工具
func (e *DefaultToolExecutor) Register(definition model.ToolDefinition, handler func(ctx context.Context, args map[string]interface{}) (interface{}, error)) {
	e.tools[definition.Name] = definition
	e.handlers[definition.Name] = handler
}

// Execute 执行工具
func (e *DefaultToolExecutor) Execute(ctx context.Context, toolName string, args map[string]interface{}) (*ToolResult, error) {
	handler, ok := e.handlers[toolName]
	if !ok {
		return nil, fmt.Errorf("tool not found: %s", toolName)
	}

	start := time.Now()
	result, err := handler(ctx, args)
	duration := time.Since(start)

	return &ToolResult{
		ToolName: toolName,
		Args:     args,
		Result:   result,
		Error:    err,
		Duration: duration,
	}, nil
}

// ListTools 列出所有工具
func (e *DefaultToolExecutor) ListTools() []model.ToolDefinition {
	result := make([]model.ToolDefinition, 0, len(e.tools))
	for _, t := range e.tools {
		result = append(result, t)
	}
	return result
}

// Executor Agent执行器
type Executor struct {
	config        ExecutorConfig
	model        model.Model
	toolExecutor ToolExecutor
	memoryService *ConversationMemoryService
	intentResolver *IntentResolver
	contextAssember *ContextAssember
	logger        *slog.Logger
	cancelChan   chan struct{}
	resetChan    chan struct{}
}

// NewExecutor 创建执行器
func NewExecutor(config ExecutorConfig, model model.Model, toolExecutor ToolExecutor, logger *slog.Logger) *Executor {
	if config.MaxIterations <= 0 {
		config.MaxIterations = 10
	}
	if config.IterationTimeout <= 0 {
		config.IterationTimeout = 30 * time.Second
	}
	if config.ToolTimeout <= 0 {
		config.ToolTimeout = 60 * time.Second
	}
	if config.MemoryWindowSize <= 0 {
		config.MemoryWindowSize = 20
	}
	if config.RAGTopK <= 0 {
		config.RAGTopK = 5
	}
	if config.MaxContextTokens <= 0 {
		config.MaxContextTokens = 8000
	}

	memoryConfig := MemoryServiceConfig{
		WindowSize:    config.MemoryWindowSize,
		MaxTokens:    16000,
		EnableSummary: true,
		SummaryThresh: 6000,
	}
	memoryService := NewConversationMemoryService("default", memoryConfig)
	intentResolver := NewIntentResolver()
	ctxConfig := ContextConfig{
		Scenario:         ScenarioMixed,
		EnableReasoning:  config.EnableReasoning,
		EnableMemory:     config.EnableMemory,
		EnableRAG:        config.EnableRAG,
		MaxContextTokens: config.MaxContextTokens,
	}
	contextAssember := NewContextAssember(ctxConfig)

	return &Executor{
		config:         config,
		model:          model,
		toolExecutor:   toolExecutor,
		memoryService: memoryService,
		intentResolver: intentResolver,
		contextAssember: contextAssember,
		logger:         logger,
		cancelChan:    make(chan struct{}, 1),
		resetChan:     make(chan struct{}, 1),
	}
}

// ExecuteResult 执行结果
type ExecuteResult struct {
	Content    string           `json:"content"`
	Reasoning  string           `json:"reasoning"`
	ToolCalls  []ReActStep      `json:"tool_calls"`
	TokenUsage *model.Usage     `json:"token_usage,omitempty"`
	Intent     *ResolvedIntent  `json:"intent,omitempty"`
	State      string           `json:"state"`
}

// Cancel 取消执行
func (e *Executor) Cancel() {
	select {
	case e.cancelChan <- struct{}{}:
	default:
	}
}

// GetMemoryService 获取记忆服务
func (e *Executor) GetMemoryService() *ConversationMemoryService {
	return e.memoryService
}

// SetMemoryService 设置记忆服务 (用于外部注入)
func (e *Executor) SetMemoryService(memoryService *ConversationMemoryService) {
	e.memoryService = memoryService
}

// Execute 执行ReAct循环
func (e *Executor) Execute(ctx context.Context, task string, tools []model.ToolDefinition) (*ExecuteResult, error) {
	// 添加用户消息到记忆
	if e.memoryService != nil {
		e.memoryService.AddUserMessage(task)
	}

	// 构建系统提示
	systemPrompt := "你是一个智能助手，可以使用工具来完成任务。"

	// 准备初始消息
	messages := []model.Message{
		{Role: "system", Content: systemPrompt},
	}

	// 从记忆获取历史消息
	if e.memoryService != nil {
		history := e.memoryService.GetMessages()
		messages = append(messages, history...)
	}

	// 添加用户任务
	messages = append(messages, model.Message{Role: "user", Content: task})

	var toolCalls []ReActStep
	var lastErr error

	// ReAct循环
	for iteration := 0; iteration < e.config.MaxIterations; iteration++ {
		// 检查取消
		select {
		case <-e.cancelChan:
			return &ExecuteResult{
				Content:   "",
				State:     "cancelled",
				ToolCalls: toolCalls,
			}, nil
		case <-ctx.Done():
			return &ExecuteResult{
				Content:   "",
				State:     "timeout",
				ToolCalls: toolCalls,
			}, ctx.Err()
		default:
		}

		// 调用模型
		resp, err := e.model.Chat(ctx, messages, model.WithTools(tools))
		if err != nil {
			lastErr = err
			break
		}

		// 检查是否有工具调用
		if len(resp.ToolCalls) == 0 {
			// 没有工具调用，直接返回结果
			if e.memoryService != nil {
				e.memoryService.AddAssistantMessage(resp.Content)
			}
			return &ExecuteResult{
				Content:    resp.Content,
				Reasoning:  resp.ReasoningContent,
				ToolCalls:  toolCalls,
				TokenUsage: &resp.Usage,
				State:      "completed",
			}, nil
		}

		// 执行工具调用
		for _, tc := range resp.ToolCalls {
			step := ReActStep{
				StepNum:     iteration,
				Thought:     resp.ReasoningContent,
				Action:      tc.Name,
				ActionInput: tc.Args,
			}

			// 执行工具
			if e.toolExecutor != nil {
				result, err := e.toolExecutor.Execute(ctx, tc.Name, tc.Args)
				if err != nil {
					step.Observed = fmt.Sprintf("error: %v", err)
				} else if result != nil {
					step.Observed = fmt.Sprintf("%v", result.Result)
				}
			}

			toolCalls = append(toolCalls, step)

			// 将工具结果添加到消息
			toolResultMsg := fmt.Sprintf("Tool %s result: %s", tc.Name, step.Observed)
			messages = append(messages, model.Message{
				Role:    "system",
				Content: toolResultMsg,
			})

			// 添加到记忆
			if e.memoryService != nil {
				e.memoryService.AddToolMessage(toolResultMsg)
			}
		}

		// 将助手响应添加到消息
		messages = append(messages, model.Message{
			Role:    "assistant",
			Content: resp.Content,
		})
	}

	// 达到最大迭代次数
	if e.memoryService != nil {
		e.memoryService.AddAssistantMessage("达到最大迭代次数，任务未完成。")
	}

	return &ExecuteResult{
		Content:   "任务达到最大迭代次数未完成",
		ToolCalls: toolCalls,
		State:     "max_iterations",
	}, lastErr
}
