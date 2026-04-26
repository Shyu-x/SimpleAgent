/**
 * A2A 协议处理器
 * 处理 Agent-to-Agent 相关的 HTTP 请求
 */

package handlers

import (
	"encoding/json"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/ai-chat/backend_go/internal/domain/a2a"
)

// A2AHandler A2A协议处理器
type A2AHandler struct {
	service *a2a.A2AService
}

// NewA2AHandler 创建A2A处理器
func NewA2AHandler(service *a2a.A2AService) *A2AHandler {
	return &A2AHandler{service: service}
}

// RegisterRoutes 注册A2A路由
func (h *A2AHandler) RegisterRoutes(router *gin.RouterGroup) {
	// 状态和Agent管理
	router.GET("/status", h.GetStatus)
	router.GET("/agents", h.ListAgents)
	router.GET("/agents/:agentId", h.GetAgent)
	router.POST("/agents/register", h.RegisterAgent)
	router.POST("/agents/:agentId/unregister", h.UnregisterAgent)
	router.POST("/agents/:agentId/heartbeat", h.Heartbeat)

	// 消息传递
	router.POST("/send", h.SendMessage)
	router.GET("/receive", h.ReceiveMessages)
	router.GET("/poll", h.PollMessages)
	router.GET("/unread/:agentId", h.GetUnreadCount)

	// 任务管理
	router.POST("/result/:taskId", h.ReturnResult)
	router.POST("/progress/:taskId", h.SendProgress)
	router.GET("/tasks/:taskId", h.GetTaskStatus)
	router.GET("/tasks", h.ListTasks)
	router.DELETE("/tasks/:taskId", h.CancelTask)

	// SSE订阅
	router.GET("/subscribe/:agentId", h.Subscribe)

	// 协作任务
	router.POST("/collaborate", h.Collaborate)
	router.GET("/collaboration/:taskId", h.GetCollaborationStatus)
	router.DELETE("/collaboration/:taskId", h.CancelCollaboration)
	router.GET("/collaboration/stats", h.GetCollaborationStats)
}

// GetStatus 获取服务状态
// GET /api/a2a/status
func (h *A2AHandler) GetStatus(c *gin.Context) {
	stats := h.service.GetStats()
	SuccessResponse(c, stats)
}

// ListAgents 获取在线Agent列表
// GET /api/a2a/agents
func (h *A2AHandler) ListAgents(c *gin.Context) {
	agents := h.service.ListAgents()

	agentList := make([]map[string]interface{}, len(agents))
	for i, agent := range agents {
		agentList[i] = map[string]interface{}{
			"id":           agent.ID,
			"name":         agent.Name,
			"type":         agent.Type,
			"status":       agent.Status,
			"endpoint":     agent.Endpoint,
			"capabilities": agent.Capabilities,
			"metadata":     agent.Metadata,
			"lastSeen":     agent.LastSeen,
		}
	}

	SuccessResponse(c, gin.H{
		"agents": agentList,
		"count":  len(agentList),
	})
}

// GetAgent 获取单个Agent信息
// GET /api/a2a/agents/:agentId
func (h *A2AHandler) GetAgent(c *gin.Context) {
	agentID := c.Param("agentId")
	agent := h.service.GetAgent(agentID)

	if agent == nil {
		NotFoundResponse(c, "Agent不存在", "未找到对应的Agent")
		return
	}

	SuccessResponse(c, gin.H{
		"agent": map[string]interface{}{
			"id":           agent.ID,
			"name":         agent.Name,
			"type":         agent.Type,
			"status":       agent.Status,
			"endpoint":     agent.Endpoint,
			"capabilities": agent.Capabilities,
			"metadata":     agent.Metadata,
			"lastSeen":     agent.LastSeen,
		},
	})
}

// RegisterAgentRequest 注册Agent请求
type RegisterAgentRequest struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Type         string                 `json:"type"`
	Endpoint     string                 `json:"endpoint"`
	Capabilities []string               `json:"capabilities"`
	Metadata     map[string]interface{} `json:"metadata"`
}

// RegisterAgent 注册Agent
// POST /api/a2a/agents/register
func (h *A2AHandler) RegisterAgent(c *gin.Context) {
	var req RegisterAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}

	if req.ID == "" {
		BadRequestResponse(c, "参数错误", "Agent ID不能为空")
		return
	}

	info := a2a.AgentInfo{
		ID:           req.ID,
		Name:         req.Name,
		Type:         req.Type,
		Endpoint:     req.Endpoint,
		Capabilities: req.Capabilities,
		Metadata:     req.Metadata,
	}

	agent := h.service.RegisterAgent(info)

	SuccessResponse(c, gin.H{
		"agent": map[string]interface{}{
			"id":           agent.ID,
			"name":         agent.Name,
			"type":         agent.Type,
			"status":       agent.Status,
			"capabilities": agent.Capabilities,
		},
	})
}

// UnregisterAgent 注销Agent
// POST /api/a2a/agents/:agentId/unregister
func (h *A2AHandler) UnregisterAgent(c *gin.Context) {
	agentID := c.Param("agentId")
	h.service.UnregisterAgent(agentID)

	SuccessResponseWithMessage(c, "Agent已注销", nil)
}

// Heartbeat Agent心跳
// POST /api/a2a/agents/:agentId/heartbeat
func (h *A2AHandler) Heartbeat(c *gin.Context) {
	agentID := c.Param("agentId")
	h.service.Heartbeat(agentID)

	SuccessResponse(c, gin.H{
		"timestamp": strconv.FormatInt(SystemTimeNowMillis(), 10),
	})
}

// SendMessageRequest 发送消息请求
type SendMessageRequest struct {
	From    string                 `json:"from"`
	To      string                 `json:"to"`
	Type    string                 `json:"type"`
	Payload map[string]interface{} `json:"payload"`
	TaskID  string                 `json:"taskId"`
	Timeout int64                  `json:"timeout"`
}

// SendMessage 发送消息
// POST /api/a2a/send
func (h *A2AHandler) SendMessage(c *gin.Context) {
	var req SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}

	if req.From == "" || req.To == "" {
		BadRequestResponse(c, "参数错误", "from和to不能为空")
		return
	}

	// 判断是否为任务委托
	if req.Type == "task.delegate" || req.Type == string(a2a.MessageTypeTaskDelegate) {
		task := a2a.NewA2ATask(getStringValue(req.Payload, "title"), req.From, req.To)
		if title, ok := req.Payload["title"].(string); ok {
			task.Title = title
		}
		if desc, ok := req.Payload["description"].(string); ok {
			task.Description = desc
		}
		if input, ok := req.Payload["input"].(map[string]interface{}); ok {
			task.Input = input
		}

		task.Metadata["timeout"] = req.Timeout

		result := h.service.DelegateTask(task)

		SuccessResponse(c, gin.H{
			"success":   result.Success,
			"taskId":    task.ID,
			"messageId": result.Message.ID,
			"task":      task.ToMap(),
		})
		return
	}

	// 普通消息
	msg := a2a.NewA2AMessage(a2a.MessageType(req.Type), req.From, req.To)
	msg.TaskID = req.TaskID
	msg.Payload = req.Payload

	result := h.service.SendMessage(msg)

	SuccessResponse(c, gin.H{
		"success":   result.Success,
		"messageId": result.MessageID,
	})
}

// ReceiveMessages 接收消息
// GET /api/a2a/receive
func (h *A2AHandler) ReceiveMessages(c *gin.Context) {
	agentID := c.Query("agentId")
	if agentID == "" {
		BadRequestResponse(c, "参数错误", "agentId不能为空")
		return
	}

	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	clear := c.Query("clear") == "true"

	options := &a2a.ReceiveOptions{
		Limit:          limit,
		IncludeExpired: false,
		ClearReceived:  clear,
	}

	messages := h.service.ReceiveMessages(agentID, options)

	// 更新心跳
	h.service.Heartbeat(agentID)

	msgList := make([]map[string]interface{}, len(messages))
	for i, msg := range messages {
		msgList[i] = msg.ToMap()
	}

	SuccessResponse(c, gin.H{
		"messages":    msgList,
		"count":       len(msgList),
		"unreadCount": h.service.GetUnreadCount(agentID),
	})
}

// PollMessages 轮询消息
// GET /api/a2a/poll
func (h *A2AHandler) PollMessages(c *gin.Context) {
	agentID := c.Query("agentId")
	if agentID == "" {
		BadRequestResponse(c, "参数错误", "agentId不能为空")
		return
	}

	// 更新心跳
	h.service.Heartbeat(agentID)

	// 立即返回可用消息
	messages := h.service.ReceiveMessages(agentID, &a2a.ReceiveOptions{
		Limit:         50,
		ClearReceived: true,
	})

	msgList := make([]map[string]interface{}, len(messages))
	for i, msg := range messages {
		msgList[i] = msg.ToMap()
	}

	SuccessResponse(c, gin.H{
		"messages": msgList,
		"count":    len(msgList),
	})
}

// GetUnreadCount 获取未读消息数
// GET /api/a2a/unread/:agentId
func (h *A2AHandler) GetUnreadCount(c *gin.Context) {
	agentID := c.Param("agentId")
	count := h.service.GetUnreadCount(agentID)

	SuccessResponse(c, gin.H{
		"unreadCount": count,
	})
}

// ReturnResultRequest 返回结果请求
type ReturnResultRequest struct {
	Result   interface{}            `json:"result"`
	Status   string                 `json:"status"`
	Metadata map[string]interface{} `json:"metadata"`
}

// ReturnResult 返回结果
// POST /api/a2a/result/:taskId
func (h *A2AHandler) ReturnResult(c *gin.Context) {
	taskID := c.Param("taskId")

	var req ReturnResultRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}

	status := a2a.TaskStatus(req.Status)
	if status == "" {
		status = a2a.TaskStatusCompleted
	}

	metadata := req.Metadata
	if metadata == nil {
		metadata = make(map[string]interface{})
	}

	result := h.service.ReturnResult(taskID, req.Result, status, metadata)

	if !result.Success {
		NotFoundResponse(c, "任务不存在", result.Error)
		return
	}

	SuccessResponse(c, result)
}

// SendProgress 发送进度更新
// POST /api/a2a/progress/:taskId
func (h *A2AHandler) SendProgress(c *gin.Context) {
	taskID := c.Param("taskId")

	var req struct {
		Progress int                    `json:"progress"`
		Metadata map[string]interface{} `json:"metadata"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}

	if req.Progress < 0 || req.Progress > 100 {
		BadRequestResponse(c, "参数错误", "progress必须在0-100之间")
		return
	}

	metadata := req.Metadata
	if metadata == nil {
		metadata = make(map[string]interface{})
	}

	result := h.service.SendProgress(taskID, req.Progress, metadata)

	if !result.Success {
		NotFoundResponse(c, "任务不存在", result.Error)
		return
	}

	SuccessResponse(c, gin.H{
		"messageId": result.MessageID,
	})
}

// GetTaskStatus 获取任务状态
// GET /api/a2a/tasks/:taskId
func (h *A2AHandler) GetTaskStatus(c *gin.Context) {
	taskID := c.Param("taskId")
	task := h.service.GetTaskStatus(taskID)

	if task == nil {
		NotFoundResponse(c, "任务不存在", "未找到对应的任务")
		return
	}

	SuccessResponse(c, gin.H{
		"task": task.ToMap(),
	})
}

// ListTasks 列出任务
// GET /api/a2a/tasks
func (h *A2AHandler) ListTasks(c *gin.Context) {
	status := c.Query("status")
	from := c.Query("from")
	to := c.Query("to")
	limit := 100

	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	filter := &a2a.TaskFilter{
		Status: status,
		From:   from,
		To:     to,
		Limit:  limit,
	}

	tasks := h.service.ListTasks(filter)

	taskList := make([]map[string]interface{}, len(tasks))
	for i, task := range tasks {
		taskList[i] = task.ToMap()
	}

	SuccessResponse(c, gin.H{
		"tasks": taskList,
		"count": len(taskList),
	})
}

// CancelTask 取消任务
// DELETE /api/a2a/tasks/:taskId
func (h *A2AHandler) CancelTask(c *gin.Context) {
	taskID := c.Param("taskId")
	success := h.service.CancelTask(taskID)

	if !success {
		NotFoundResponse(c, "任务不存在", "未找到对应的任务")
		return
	}

	SuccessResponseWithMessage(c, "任务已取消", nil)
}

// Subscribe SSE订阅消息
// GET /api/a2a/subscribe/:agentId
func (h *A2AHandler) Subscribe(c *gin.Context) {
	agentID := c.Param("agentId")

	// 更新心跳
	h.service.Heartbeat(agentID)

	// 设置SSE头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	// 订阅消息
	ch := h.service.Subscribe(agentID)
	defer h.service.Unsubscribe(agentID)

	// 定期心跳
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// 定期检查新消息
	pollTicker := time.NewTicker(2 * time.Second)
	defer pollTicker.Stop()

	// 初始连接确认
	c.SSEvent("connected", gin.H{"agentId": agentID})
	c.Writer.Flush()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case <-ticker.C:
			h.service.Heartbeat(agentID)
			c.SSEvent("heartbeat", gin.H{"timestamp": strconv.FormatInt(SystemTimeNowMillis(), 10)})
			c.Writer.Flush()
		case msg := <-ch:
			c.SSEvent("message", msg.ToMap())
			c.Writer.Flush()
		case <-pollTicker.C:
			messages := h.service.ReceiveMessages(agentID, &a2a.ReceiveOptions{
				Limit:         10,
				ClearReceived: true,
			})
			for _, msg := range messages {
				c.SSEvent("message", msg.ToMap())
				c.Writer.Flush()
			}
		}
	}
}

// Collaborate 协作任务处理
// POST /api/a2a/collaborate
func (h *A2AHandler) Collaborate(c *gin.Context) {
	var req struct {
		Title    string                   `json:"title"`
		SubTasks []map[string]interface{} `json:"subTasks"`
		Options  map[string]interface{}   `json:"options"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}

	if req.Title == "" {
		BadRequestResponse(c, "参数错误", "title不能为空")
		return
	}

	// 简化的协作任务实现
	SuccessResponse(c, gin.H{
		"collaboration": map[string]interface{}{
			"title":    req.Title,
			"subTasks": req.SubTasks,
			"status":   "processing",
		},
	})
}

// GetCollaborationStatus 获取协作状态
// GET /api/a2a/collaboration/:taskId
func (h *A2AHandler) GetCollaborationStatus(c *gin.Context) {
	taskID := c.Param("taskId")

	SuccessResponse(c, gin.H{
		"collaboration": map[string]interface{}{
			"taskId": taskID,
			"status": "completed",
		},
	})
}

// CancelCollaboration 取消协作
// DELETE /api/a2a/collaboration/:taskId
func (h *A2AHandler) CancelCollaboration(c *gin.Context) {
	taskID := c.Param("taskId")

	SuccessResponseWithMessage(c, "协作已取消", gin.H{"taskId": taskID})
}

// GetCollaborationStats 获取协作统计
// GET /api/a2a/collaboration/stats
func (h *A2AHandler) GetCollaborationStats(c *gin.Context) {
	SuccessResponse(c, gin.H{
		"activeCollaborations":    0,
		"completedCollaborations": 0,
	})
}

// SystemTimeNowMillis 获取当前毫秒时间戳
func SystemTimeNowMillis() int64 {
	return time.Now().UnixMilli()
}

// getStringValue 安全获取字符串值
func getStringValue(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// MarshalJSON 安全JSON序列化
func MarshalJSON(v interface{}) string {
	data, _ := json.Marshal(v)
	return string(data)
}
