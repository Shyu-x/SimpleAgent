/**
 * Agent编排器 (集成Executor版本)
 * 负责Agent执行流程的编排和协调
 * 集成 ReAct 执行循环、工具注册表、会话记忆管理
 */

package application

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/ai-chat/backend_go/internal/common/errors"
	"github.com/ai-chat/backend_go/internal/domain/agent"
	"github.com/ai-chat/backend_go/internal/domain/model"
	"github.com/ai-chat/backend_go/internal/services/tools"
)

// AgentOrchestrator Agent编排器
type AgentOrchestrator struct {
	sessions         sync.Map // sessionId -> *AgentSessionData
	executors        sync.Map // taskId -> *ExecutorState
	maxSteps         int
	timeBetweenSteps time.Duration

	// 依赖组件
	model           model.Model           // 模型客户端
	toolRegistry    *tools.ToolRegistry   // 工具注册表
	toolExecutor    agent.ToolExecutor    // 工具执行器
	memoryService   *agent.ConversationMemoryService // 记忆服务
	logger          *slog.Logger          // 日志
}

// AgentSessionData Agent会话数据
type AgentSessionData struct {
	ID            string
	CreatedAt     int64
	LastActivity  int64
	Status        string // active, paused, completed, cancelled
	CurrentTask   string
	Steps         []AgentStep
	Memory        []string
	Metadata      map[string]interface{}
	mu            sync.Mutex
	// 记忆服务实例
	memoryService *agent.ConversationMemoryService
}

// AgentStep Agent执行步骤
type AgentStep struct {
	Index      int
	Type       string // thinking, tool_call, tool_result, response
	Content    string
	ToolName   string
	ToolArgs   map[string]interface{}
	ToolResult string
	Timestamp  int64
}

// ExecutorState 执行器状态
type ExecutorState struct {
	TaskID    string
	SessionID string
	Status    string // running, cancelled, completed
	Cancel    chan struct{}
	executor  *agent.Executor
}

// AgentRequest Agent请求
type AgentRequest struct {
	SessionID string
	Task      string
	Context   map[string]interface{}
}

// NewAgentOrchestrator 创建Agent编排器 (基础版本，不带依赖)
func NewAgentOrchestrator() *AgentOrchestrator {
	return &AgentOrchestrator{
		sessions:         sync.Map{},
		executors:        sync.Map{},
		maxSteps:         50,
		timeBetweenSteps: 100 * time.Millisecond,
	}
}

// NewAgentOrchestratorWithDeps 创建带依赖的Agent编排器
func NewAgentOrchestratorWithDeps(
	model model.Model,
	toolRegistry *tools.ToolRegistry,
	logger *slog.Logger,
) *AgentOrchestrator {
	orchestrator := &AgentOrchestrator{
		sessions:         sync.Map{},
		executors:        sync.Map{},
		maxSteps:         50,
		timeBetweenSteps: 100 * time.Millisecond,
		model:           model,
		toolRegistry:    toolRegistry,
		logger:          logger,
	}

	// 创建工具执行器适配器
	orchestrator.toolExecutor = agent.NewToolExecutorAdapter(toolRegistry)

	return orchestrator
}

// Execute 执行Agent任务 (集成真实Executor)
func (a *AgentOrchestrator) Execute(ctx context.Context, req *AgentRequest, resultChan chan<- string) error {
	// 获取或创建会话
	session := a.getOrCreateSession(req.SessionID)
	session.mu.Lock()
	session.CurrentTask = req.Task
	session.Status = "active"
	session.LastActivity = time.Now().UnixMilli()
	session.mu.Unlock()

	// 创建执行器
	taskId := generateTaskID()

	// 如果有模型客户端，创建真实的Executor
	if a.model != nil && a.toolExecutor != nil {
		executor := a.createExecutor(session)
		execState := &ExecutorState{
			TaskID:    taskId,
			SessionID: req.SessionID,
			Status:    "running",
			Cancel:    make(chan struct{}),
			executor:  executor,
		}
		a.executors.Store(taskId, execState)

		// 启动真实执行
		go func() {
			defer close(resultChan)
			a.executeWithExecutor(ctx, taskId, req.SessionID, req.Task, execState, resultChan)
		}()
	} else {
		// 降级到模拟执行
		execState := &ExecutorState{
			TaskID:    taskId,
			SessionID: req.SessionID,
			Status:    "running",
			Cancel:    make(chan struct{}),
		}
		a.executors.Store(taskId, execState)

		go func() {
			defer close(resultChan)
			a.executeMock(ctx, req.SessionID, req.Task, execState, resultChan)
		}()
	}

	return nil
}

// createExecutor 为会话创建Executor
func (a *AgentOrchestrator) createExecutor(session *AgentSessionData) *agent.Executor {
	// 获取或创建会话的记忆服务
	if session.memoryService == nil {
		memoryConfig := agent.MemoryServiceConfig{
			WindowSize:    20,
			MaxTokens:     16000,
			EnableSummary: true,
			SummaryThresh: 6000,
		}
		session.memoryService = agent.NewConversationMemoryService(session.ID, memoryConfig)
	}

	// 执行器配置
	config := agent.ExecutorConfig{
		MaxIterations:     10,
		IterationTimeout: 30 * time.Second,
		EnableReasoning:  true,
		ToolTimeout:      60 * time.Second,
		EnableMemory:     true,
		MemoryWindowSize: 20,
		EnableRAG:        false,
		RAGTopK:          5,
		MaxContextTokens: 8000,
	}

	// 使用工厂方法创建执行器
	executor := agent.NewExecutor(
		config,
		a.model,
		a.toolExecutor,
		a.logger,
	)

	// 设置记忆服务
	executor.SetMemoryService(session.memoryService)

	return executor
}

// executeWithExecutor 使用真实Executor执行
func (a *AgentOrchestrator) executeWithExecutor(ctx context.Context, taskId, sessionId, task string, execState *ExecutorState, resultChan chan<- string) {
	executor := execState.executor
	if executor == nil {
		a.sendResult(resultChan, "error", map[string]interface{}{
			"error": "executor not initialized",
		})
		return
	}

	// 获取可用工具
	tools := a.toolExecutor.ListTools()

	// 执行ReAct循环
	result, err := executor.Execute(ctx, task, tools)
	if err != nil {
		a.sendResult(resultChan, "error", map[string]interface{}{
			"task_id": taskId,
			"error":   err.Error(),
		})
		execState.Status = "completed"
		return
	}

	// 发送结果
	a.sendResult(resultChan, "complete", map[string]interface{}{
		"task_id":    taskId,
		"session_id": sessionId,
		"result":     result.Content,
		"reasoning":  result.Reasoning,
		"state":      result.State,
		"tool_calls": len(result.ToolCalls),
	})

	// 更新会话状态
	if session, ok := a.sessions.Load(sessionId); ok {
		s := session.(*AgentSessionData)
		s.mu.Lock()
		s.Status = "completed"
		// 保存执行步骤
		for _, step := range result.ToolCalls {
			s.Steps = append(s.Steps, AgentStep{
				Index:      step.StepNum,
				Type:       step.Action,
				Content:    step.Observed,
				ToolName:   step.Action,
				ToolArgs:   step.ActionInput,
				ToolResult: step.Observed,
				Timestamp:  time.Now().UnixMilli(),
			})
		}
		s.mu.Unlock()
	}

	execState.Status = "completed"
}

// executeMock 模拟执行 (降级方案)
func (a *AgentOrchestrator) executeMock(ctx context.Context, sessionId, task string, execState *ExecutorState, resultChan chan<- string) {
	// 模拟执行步骤
	steps := []string{
		"正在分析任务...",
		"理解用户意图...",
		"准备执行计划...",
		"执行中...",
		"完成",
	}

	for i, step := range steps {
		select {
		case <-execState.Cancel:
			a.sendResult(resultChan, "cancelled", map[string]interface{}{
				"task_id":    execState.TaskID,
				"session_id": sessionId,
			})
			return
		case <-ctx.Done():
			return
		case <-time.After(a.timeBetweenSteps):
			a.sendResult(resultChan, "step", map[string]interface{}{
				"step":     i + 1,
				"content":  step,
				"task_id":  execState.TaskID,
				"session_id": sessionId,
			})
		}
	}

	a.sendResult(resultChan, "complete", map[string]interface{}{
		"task_id":    execState.TaskID,
		"session_id": sessionId,
		"result":     fmt.Sprintf("任务已完成: %s", task),
	})

	if session, ok := a.sessions.Load(sessionId); ok {
		s := session.(*AgentSessionData)
		s.mu.Lock()
		s.Status = "completed"
		s.mu.Unlock()
	}

	execState.Status = "completed"
}

// ExecuteStream 流式执行Agent任务
func (a *AgentOrchestrator) ExecuteStream(ctx context.Context, req *AgentRequest, resultChan chan<- string) error {
	return a.Execute(ctx, req, resultChan)
}

// Cancel 取消任务
func (a *AgentOrchestrator) Cancel(taskId string) error {
	if exec, ok := a.executors.Load(taskId); ok {
		e := exec.(*ExecutorState)
		if e.Status == "running" {
			e.Status = "cancelled"
			if e.executor != nil {
				e.executor.Cancel()
			}
			close(e.Cancel)
			return nil
		}
	}
	return errors.ErrAgent("任务不存在或已结束", nil)
}

// GetSession 获取会话
func (a *AgentOrchestrator) GetSession(sessionId string) (*AgentSessionData, error) {
	if session, ok := a.sessions.Load(sessionId); ok {
		s := session.(*AgentSessionData)
		s.mu.Lock()
		defer s.mu.Unlock()
		return &AgentSessionData{
			ID:            s.ID,
			CreatedAt:     s.CreatedAt,
			LastActivity:  s.LastActivity,
			Status:        s.Status,
			CurrentTask:   s.CurrentTask,
			Steps:         append([]AgentStep{}, s.Steps...),
			Memory:        append([]string{}, s.Memory...),
			Metadata:      s.Metadata,
			memoryService: s.memoryService,
		}, nil
	}
	return nil, errors.ErrSession("会话不存在", nil)
}

// DeleteSession 删除会话
func (a *AgentOrchestrator) DeleteSession(sessionId string) bool {
	_, ok := a.sessions.LoadAndDelete(sessionId)
	return ok
}

// GetOrCreateMemoryService 获取或创建记忆服务
func (a *AgentOrchestrator) GetOrCreateMemoryService(sessionId string) *agent.ConversationMemoryService {
	session := a.getOrCreateSession(sessionId)
	if session.memoryService == nil {
		memoryConfig := agent.MemoryServiceConfig{
			WindowSize:    20,
			MaxTokens:     16000,
			EnableSummary: true,
			SummaryThresh: 6000,
		}
		session.memoryService = agent.NewConversationMemoryService(sessionId, memoryConfig)
	}
	return session.memoryService
}

// ListTools 列出所有可用工具
func (a *AgentOrchestrator) ListTools() []model.ToolDefinition {
	if a.toolExecutor != nil {
		return a.toolExecutor.ListTools()
	}
	return []model.ToolDefinition{}
}

// getOrCreateSession 获取或创建会话
func (a *AgentOrchestrator) getOrCreateSession(id string) *AgentSessionData {
	if session, ok := a.sessions.Load(id); ok {
		return session.(*AgentSessionData)
	}

	session := &AgentSessionData{
		ID:           id,
		CreatedAt:    time.Now().UnixMilli(),
		LastActivity: time.Now().UnixMilli(),
		Status:       "active",
		Steps:        make([]AgentStep, 0),
		Memory:       make([]string, 0),
		Metadata:     make(map[string]interface{}),
	}
	a.sessions.Store(id, session)
	return session
}

// sendResult 发送结果到chan
func (a *AgentOrchestrator) sendResult(resultChan chan<- string, eventType string, data map[string]interface{}) {
	result := map[string]interface{}{
		"type": eventType,
	}
	for k, v := range data {
		result[k] = v
	}
	jsonData, _ := json.Marshal(result)
	resultChan <- string(jsonData)
}

// generateTaskID 生成任务ID
func generateTaskID() string {
	return "task_" + time.Now().Format("20060102150405") + "_" + randomString(8)
}

// randomString 生成随机字符串
func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
	}
	return string(b)
}
