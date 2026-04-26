package agent

import (
	"context"
	"sync"
	"time"

	"github.com/ai-chat/backend_go/internal/domain/model"
)

// AgentState Agent状态
type AgentState int

const (
	AgentStateIdle    AgentState = iota // 空闲
	AgentStateRunning                    // 运行中
	AgentStateWaiting                    // 等待确认
	AgentStatePaused                     // 暂停
	AgentStateCancelled                  // 已取消
	AgentStateError                      // 错误
)

// String 返回状态字符串
func (s AgentState) String() string {
	switch s {
	case AgentStateIdle:
		return "idle"
	case AgentStateRunning:
		return "running"
	case AgentStateWaiting:
		return "waiting"
	case AgentStatePaused:
		return "paused"
	case AgentStateCancelled:
		return "cancelled"
	case AgentStateError:
		return "error"
	default:
		return "unknown"
	}
}

// ToolCall 工具调用结构
type ToolCall struct {
	ID        string                 `json:"id"`        // 调用ID
	Name      string                 `json:"name"`      // 工具名称
	Arguments map[string]interface{} `json:"arguments"` // 参数
	Result    interface{}            `json:"result"`   // 执行结果
	Success   bool                   `json:"success"`   // 是否成功
	Error     string                 `json:"error"`     // 错误信息
	StartTime time.Time              `json:"start_time"` // 开始时间
	EndTime   time.Time              `json:"end_time"`   // 结束时间
}

// AgentConfig Agent配置
type AgentConfig struct {
	Name            string            `json:"name"`            // Agent名称
	Model           string            `json:"model"`           // 使用的模型
	MaxIterations   int               `json:"max_iterations"`  // 最大迭代次数
	Timeout         time.Duration     `json:"timeout"`         // 超时时间
	Tools           []model.ToolDefinition `json:"tools"`        // 可用工具
	EnableHITL      bool              `json:"enable_hitl"`     // 启用人工确认
	MemoryWindowSize int              `json:"memory_window"`   // 记忆窗口大小
}

// Agent Agent接口
type Agent interface {
	// Run 执行Agent任务
	Run(ctx context.Context, input string) (*AgentResult, error)
	// StreamRun 流式执行Agent任务
	StreamRun(ctx context.Context, input string, callback func(*AgentResult) error) error
	// Cancel 取消执行
	Cancel()
	// GetState 获取当前状态
	GetState() AgentState
	// GetHistory 获取执行历史
	GetHistory() []*AgentResult
}

// AgentResult Agent执行结果
type AgentResult struct {
	SessionID   string     `json:"session_id"`   // 会话ID
	Input       string     `json:"input"`        // 输入
	Output      string     `json:"output"`       // 输出
	Reasoning   string     `json:"reasoning"`    // 思维链
	ToolCalls   []ToolCall `json:"tool_calls"`   // 工具调用列表
	State       AgentState `json:"state"`        // 最终状态
	Error       error      `json:"error"`        // 错误信息
	StartTime   time.Time  `json:"start_time"`   // 开始时间
	EndTime     time.Time  `json:"end_time"`     // 结束时间
	TokenUsage  *TokenUsage `json:"token_usage"` // Token使用量
}

// TokenUsage Token使用量
type TokenUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
	TotalTokens  int `json:"total_tokens"`
}

// BaseAgent 基础Agent实现
type BaseAgent struct {
	config     AgentConfig
	state      AgentState
	stateMu    sync.RWMutex
	history    []*AgentResult
	historyMu  sync.RWMutex
	cancelChan chan struct{}
	model      model.Model
}

// NewBaseAgent 创建基础Agent
func NewBaseAgent(config AgentConfig, modelClient model.Model) *BaseAgent {
	return &BaseAgent{
		config:     config,
		state:      AgentStateIdle,
		history:    make([]*AgentResult, 0),
		cancelChan: make(chan struct{}, 1),
		model:      modelClient,
	}
}

// GetState 获取当前状态
func (a *BaseAgent) GetState() AgentState {
	a.stateMu.RLock()
	defer a.stateMu.RUnlock()
	return a.state
}

// setState 设置状态
func (a *BaseAgent) setState(state AgentState) {
	a.stateMu.Lock()
	defer a.stateMu.Unlock()
	a.state = state
}

// GetHistory 获取执行历史
func (a *BaseAgent) GetHistory() []*AgentResult {
	a.historyMu.RLock()
	defer a.historyMu.RUnlock()
	return a.history
}

// addToHistory 添加到历史
func (a *BaseAgent) addToHistory(result *AgentResult) {
	a.historyMu.Lock()
	defer a.historyMu.Unlock()
	a.history = append(a.history, result)
}

// Cancel 取消执行
func (a *BaseAgent) Cancel() {
	select {
	case a.cancelChan <- struct{}{}:
	default:
	}
	a.setState(AgentStateCancelled)
}

// isCancelled 检查是否已取消
func (a *BaseAgent) isCancelled() bool {
	select {
	case <-a.cancelChan:
		return true
	default:
		return false
	}
}

// resetCancel 重置取消信号
func (a *BaseAgent) resetCancel() {
	a.cancelChan = make(chan struct{}, 1)
}
