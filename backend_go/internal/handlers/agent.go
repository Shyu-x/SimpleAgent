/**
 * Agent API 处理器
 * 提供Agent执行相关的RESTful接口
 */

package handlers

import (
	"io"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/ai-chat/backend_go/internal/application"
	"github.com/ai-chat/backend_go/internal/common/errors"
)

// AgentHandler Agent处理器
type AgentHandler struct {
	orchestrator *application.AgentOrchestrator
	sessions     sync.Map // sessionId -> *AgentSession
}

// AgentSession Agent会话
type AgentSession struct {
	ID           string                 `json:"id"`
	CreatedAt    int64                  `json:"created_at"`
	LastActivity int64                  `json:"last_activity"`
	Status       string                 `json:"status"`
	Tasks        []string               `json:"tasks"`
	Metadata     map[string]interface{} `json:"metadata"`
}

// AgentExecuteRequest Agent执行请求
type AgentExecuteRequest struct {
	SessionID string                 `json:"session_id"`
	Task      string                 `json:"task" binding:"required"`
	Context   map[string]interface{} `json:"context"`
}

// AgentResponse Agent响应
type AgentResponse struct {
	Success   bool        `json:"success"`
	SessionID string      `json:"session_id,omitempty"`
	Result    interface{} `json:"result,omitempty"`
	Error     string      `json:"error,omitempty"`
}

// NewAgentHandler 创建Agent处理器
func NewAgentHandler(orchestrator *application.AgentOrchestrator) *AgentHandler {
	return &AgentHandler{
		orchestrator: orchestrator,
	}
}

// HandleExecute Agent执行
// POST /api/agent/execute
func (h *AgentHandler) HandleExecute(c *gin.Context) {
	var req AgentExecuteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}

	if req.Task == "" {
		BadRequestResponse(c, "参数错误", "task不能为空")
		return
	}

	// 获取或创建会话
	sessionId := req.SessionID
	if sessionId == "" {
		sessionId = h.createSession()
	}

	// 设置SSE头
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	// 更新会话活动
	if session, ok := h.sessions.Load(sessionId); ok {
		s := session.(*AgentSession)
		s.LastActivity = time.Now().UnixMilli()
	}

	// 发送SSE事件
	sendSSE := func(eventType string, data interface{}) {
		c.SSEvent(eventType, data)
		c.Writer.Flush()
	}

	// 执行Agent
	resultChan := make(chan string, 100)
	errorChan := make(chan error, 1)
	doneChan := make(chan struct{})

	go func() {
		err := h.orchestrator.Execute(c.Request.Context(), &application.AgentRequest{
			SessionID: sessionId,
			Task:      req.Task,
			Context:   req.Context,
		}, resultChan)
		if err != nil {
			errorChan <- err
		}
		close(resultChan)
		close(doneChan)
	}()

	// 处理结果
	go func() {
		for {
			select {
			case result, ok := <-resultChan:
				if !ok {
					return
				}
				// 解析结果并发送事件
				sendSSE("step", result)
			case err := <-errorChan:
				sendSSE("error", gin.H{"error": err.Error()})
				sendSSE("done", gin.H{})
				return
			case <-doneChan:
				sendSSE("complete", gin.H{})
				sendSSE("done", gin.H{})
				return
			}
		}
	}()

	// 保持连接
	<-c.Request.Context().Done()
}

// HandleStream Agent流式执行
// GET /api/agent/stream
func (h *AgentHandler) HandleStream(c *gin.Context) {
	sessionId := c.Query("session_id")
	task := c.Query("task")

	if sessionId == "" || task == "" {
		BadRequestResponse(c, "参数错误", "session_id和task不能为空")
		return
	}

	// 设置SSE头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	resultChan := make(chan string, 100)
	errorChan := make(chan error, 1)

	go func() {
		err := h.orchestrator.ExecuteStream(c.Request.Context(), &application.AgentRequest{
			SessionID: sessionId,
			Task:      task,
		}, resultChan)
		if err != nil {
			errorChan <- err
		}
		close(resultChan)
	}()

	c.Stream(func(w io.Writer) bool {
		select {
		case result, ok := <-resultChan:
			if !ok {
				return false
			}
			c.SSEvent("", result)
			return true
		case err := <-errorChan:
			c.SSEvent("error", err.Error())
			return false
		}
	})
}

// HandleCancel 取消Agent任务
// POST /api/agent/cancel/:taskId
func (h *AgentHandler) HandleCancel(c *gin.Context) {
	taskId := c.Param("taskId")
	if taskId == "" {
		BadRequestResponse(c, "参数错误", "taskId不能为空")
		return
	}

	// 调用编排器取消任务
	err := h.orchestrator.Cancel(taskId)
	if err != nil {
		if appErr, ok := err.(*errors.AppError); ok {
			ErrorResponseFromCode(c, appErr.HttpStatus, strconv.Itoa(appErr.Code), appErr.Message)
			return
		}
		InternalServerErrorResponse(c, "取消任务失败: "+err.Error())
		return
	}

	SuccessResponseWithMessage(c, "任务已取消", nil)
}

// HandleTools 获取工具列表
// GET /api/agent/tools
func (h *AgentHandler) HandleTools(c *gin.Context) {
	tools := h.orchestrator.ListTools()
	SuccessResponse(c, gin.H{
		"tools": tools,
		"count": len(tools),
	})
}

// HandleSession 获取会话信息
// GET /api/agent/session/:id
func (h *AgentHandler) HandleSession(c *gin.Context) {
	sessionId := c.Param("id")
	if sessionId == "" {
		BadRequestResponse(c, "参数错误", "sessionId不能为空")
		return
	}

	if session, ok := h.sessions.Load(sessionId); ok {
		s := session.(*AgentSession)
		SuccessResponse(c, gin.H{
			"id":            s.ID,
			"created_at":    s.CreatedAt,
			"last_activity": s.LastActivity,
			"status":        s.Status,
			"tasks":         s.Tasks,
			"metadata":      s.Metadata,
		})
		return
	}

	NotFoundResponse(c, "会话不存在", "未找到对应的会话记录")
}

// HandleDeleteSession 删除会话
// DELETE /api/agent/session/:id
func (h *AgentHandler) HandleDeleteSession(c *gin.Context) {
	sessionId := c.Param("id")
	if sessionId == "" {
		BadRequestResponse(c, "参数错误", "sessionId不能为空")
		return
	}

	if _, ok := h.sessions.LoadAndDelete(sessionId); ok {
		SuccessResponseWithMessage(c, "会话已关闭", nil)
		return
	}

	NotFoundResponse(c, "会话不存在", "未找到对应的会话记录")
}

// HandleSessions 获取所有会话
// GET /api/agent/sessions
func (h *AgentHandler) HandleSessions(c *gin.Context) {
	sessions := make([]*AgentSession, 0)
	h.sessions.Range(func(key, value interface{}) bool {
		sessions = append(sessions, value.(*AgentSession))
		return true
	})

	SuccessResponse(c, gin.H{
		"sessions": sessions,
		"count":    len(sessions),
	})
}

// createSession 创建新会话
func (h *AgentHandler) createSession() string {
	session := &AgentSession{
		ID:           generateSessionID(),
		CreatedAt:    time.Now().UnixMilli(),
		LastActivity: time.Now().UnixMilli(),
		Status:       "active",
		Tasks:        []string{},
		Metadata:     make(map[string]interface{}),
	}
	h.sessions.Store(session.ID, session)
	return session.ID
}

// generateSessionID 生成会话ID
func generateSessionID() string {
	return "session_" + time.Now().Format("20060102150405") + "_" + randomString(8)
}

// randomString 生成随机字符串
func randomString(length int) string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	result := make([]byte, length)
	for i := range result {
		result[i] = chars[time.Now().UnixNano()%62]
		time.Sleep(time.Nanosecond)
	}
	return string(result)
}
