/**
 * HITL 协议处理器
 * 处理人机协作确认相关的 HTTP 请求
 */

package handlers

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/ai-chat/backend_go/internal/domain/agent"
)

// HITLHandler HITL协议处理器
type HITLHandler struct {
	manager *agent.HITLManager
}

// NewHITLHandler 创建HITL处理器
func NewHITLHandler(manager *agent.HITLManager) *HITLHandler {
	return &HITLHandler{manager: manager}
}

// RegisterRoutes 注册HITL路由
func (h *HITLHandler) RegisterRoutes(router *gin.RouterGroup) {
	router.POST("/checkpoint", h.CreateCheckpoint)
	router.GET("/checkpoint/:id", h.GetCheckpoint)
	router.POST("/checkpoint/:id/approve", h.ApproveCheckpoint)
	router.POST("/checkpoint/:id/reject", h.RejectCheckpoint)
	router.POST("/checkpoint/:id/wait", h.WaitForCheckpoint)

	router.GET("/pending", h.GetPendingCheckpoints)
	router.GET("/history", h.GetHistory)
	router.GET("/stats", h.GetStats)
	router.GET("/types", h.GetTypes)

	router.POST("/confirm", h.RequestConfirmation)
	router.POST("/clear", h.ClearPending)

	router.GET("/health", h.HealthCheck)
	router.GET("/status", h.HealthCheck)
}

// CreateCheckpointRequest 创建检查点请求
type CreateCheckpointRequest struct {
	Type        string                  `json:"type"`
	Title       string                  `json:"title"`
	Description string                  `json:"description"`
	Context     map[string]interface{}  `json:"context"`
	Options     []CheckpointOptionInput `json:"options"`
	Timeout     int64                   `json:"timeout"`
	Required    bool                    `json:"required"`
}

// CheckpointOptionInput 检查点选项输入
type CheckpointOptionInput struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
	RiskLevel   string `json:"riskLevel"`
}

// CreateCheckpoint 创建检查点
// POST /api/hitl/checkpoint
func (h *HITLHandler) CreateCheckpoint(c *gin.Context) {
	var req CreateCheckpointRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}

	if req.Title == "" {
		BadRequestResponse(c, "参数错误", "title不能为空")
		return
	}

	// 转换类型
	checkpointType := agent.CheckpointType(req.Type)
	if checkpointType == "" {
		checkpointType = agent.CheckpointTypeDecision
	}

	// 转换选项
	options := make([]agent.CheckpointOption, len(req.Options))
	for i, opt := range req.Options {
		options[i] = agent.CheckpointOption{
			ID:          opt.ID,
			Label:       opt.Label,
			Description: opt.Description,
			RiskLevel:   opt.RiskLevel,
		}
	}

	// 如果没有提供选项，使用默认值
	if len(options) == 0 {
		options = []agent.CheckpointOption{
			{ID: "approve", Label: "批准", Description: "批准此操作", RiskLevel: "low"},
			{ID: "reject", Label: "拒绝", Description: "拒绝此操作", RiskLevel: "medium"},
		}
	}

	config := &agent.CheckpointConfig{
		Type:          checkpointType,
		Title:         req.Title,
		Description:   req.Description,
		Context:       req.Context,
		Options:       options,
		DefaultOption: "approve",
		Timeout:       req.Timeout,
		Required:      req.Required,
	}

	cp := h.manager.CreateCheckpoint(config)

	SuccessResponse(c, gin.H{
		"checkpoint": cp.GetSummary(),
	})
}

// GetCheckpoint 获取检查点详情
// GET /api/hitl/checkpoint/:id
func (h *HITLHandler) GetCheckpoint(c *gin.Context) {
	id := c.Param("id")

	cp := h.manager.GetCheckpoint(id)
	if cp == nil {
		// 尝试从历史中查找
		historyCp := h.manager.FindInHistory(id)
		if historyCp == nil {
			NotFoundResponse(c, "检查点不存在", "未找到对应的检查点")
			return
		}
		SuccessResponse(c, gin.H{
			"checkpoint": historyCp.GetSummary(),
		})
		return
	}

	SuccessResponse(c, gin.H{
		"checkpoint": cp.GetSummary(),
	})
}

// ApproveCheckpointRequest 批准检查点请求
type ApproveCheckpointRequest struct {
	Option  string `json:"option"`
	Comment string `json:"comment"`
	UserID  string `json:"userId"`
}

// ApproveCheckpoint 批准检查点
// POST /api/hitl/checkpoint/:id/approve
func (h *HITLHandler) ApproveCheckpoint(c *gin.Context) {
	id := c.Param("id")

	var req ApproveCheckpointRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// 允许空body
		req = ApproveCheckpointRequest{}
	}

	userID := req.UserID
	if userID == "" {
		userID = "user"
	}

	option := req.Option
	if option == "" {
		option = "approve"
	}

	result := h.manager.ApproveCheckpoint(id, option, userID, req.Comment)

	if !result.Success {
		BadRequestResponse(c, "操作失败", result.Error)
		return
	}

	SuccessResponse(c, gin.H{
		"checkpoint": result.Checkpoint.GetSummary(),
	})
}

// RejectCheckpointRequest 拒绝检查点请求
type RejectCheckpointRequest struct {
	Reason string `json:"reason"`
	UserID string `json:"userId"`
}

// RejectCheckpoint 拒绝检查点
// POST /api/hitl/checkpoint/:id/reject
func (h *HITLHandler) RejectCheckpoint(c *gin.Context) {
	id := c.Param("id")

	var req RejectCheckpointRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// 允许空body
		req = RejectCheckpointRequest{}
	}

	userID := req.UserID
	if userID == "" {
		userID = "user"
	}

	reason := req.Reason
	if reason == "" {
		reason = "User rejected"
	}

	result := h.manager.RejectCheckpoint(id, reason, userID)

	if !result.Success {
		BadRequestResponse(c, "操作失败", result.Error)
		return
	}

	SuccessResponse(c, gin.H{
		"checkpoint": result.Checkpoint.GetSummary(),
	})
}

// WaitForCheckpointRequest 等待检查点请求
type WaitForCheckpointRequest struct {
	Timeout int64 `json:"timeout"`
}

// WaitForCheckpoint 等待检查点响应
// POST /api/hitl/checkpoint/:id/wait
func (h *HITLHandler) WaitForCheckpoint(c *gin.Context) {
	id := c.Param("id")

	var req WaitForCheckpointRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// 允许空body，使用默认值
	}

	timeout := req.Timeout
	if timeout <= 0 {
		timeout = 5 * 60 * 1000 // 默认5分钟
	}

	result := h.manager.WaitForCheckpoint(id, timeout)

	SuccessResponse(c, gin.H{
		"success":    result.Success,
		"checkpoint": result.Checkpoint.GetSummary(),
		"error":      result.Error,
	})
}

// GetPendingCheckpoints 获取待处理检查点
// GET /api/hitl/pending
func (h *HITLHandler) GetPendingCheckpoints(c *gin.Context) {
	pending := h.manager.GetPendingCheckpoints()

	checkpoints := make([]map[string]interface{}, len(pending))
	for i, cp := range pending {
		checkpoints[i] = cp.GetSummary()
	}

	SuccessResponse(c, gin.H{
		"checkpoints": checkpoints,
		"count":       len(checkpoints),
	})
}

// GetHistory 获取历史记录
// GET /api/hitl/history
func (h *HITLHandler) GetHistory(c *gin.Context) {
	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	history := h.manager.GetHistory(limit)

	checkpoints := make([]map[string]interface{}, len(history))
	for i, cp := range history {
		checkpoints[i] = cp.GetSummary()
	}

	SuccessResponse(c, gin.H{
		"history": checkpoints,
		"count":   len(checkpoints),
	})
}

// GetStats 获取统计信息
// GET /api/hitl/stats
func (h *HITLHandler) GetStats(c *gin.Context) {
	stats := h.manager.GetStats()
	SuccessResponse(c, stats)
}

// GetTypes 获取检查点类型
// GET /api/hitl/types
func (h *HITLHandler) GetTypes(c *gin.Context) {
	SuccessResponse(c, gin.H{
		"types": []string{
			string(agent.CheckpointTypeDecision),
			string(agent.CheckpointTypeAction),
			string(agent.CheckpointTypeDataAccess),
			string(agent.CheckpointTypeHighRisk),
			string(agent.CheckpointTypeCostLimit),
		},
		"statuses": []string{
			string(agent.CheckpointStatusPending),
			string(agent.CheckpointStatusApproved),
			string(agent.CheckpointStatusRejected),
			string(agent.CheckpointStatusTimeout),
			string(agent.CheckpointStatusCancelled),
		},
	})
}

// RequestConfirmation 创建并等待确认
// POST /api/hitl/confirm
func (h *HITLHandler) RequestConfirmation(c *gin.Context) {
	var req CreateCheckpointRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}

	if req.Title == "" {
		BadRequestResponse(c, "参数错误", "title不能为空")
		return
	}

	// 转换类型
	checkpointType := agent.CheckpointType(req.Type)
	if checkpointType == "" {
		checkpointType = agent.CheckpointTypeDecision
	}

	// 转换选项
	options := make([]agent.CheckpointOption, len(req.Options))
	for i, opt := range req.Options {
		options[i] = agent.CheckpointOption{
			ID:          opt.ID,
			Label:       opt.Label,
			Description: opt.Description,
			RiskLevel:   opt.RiskLevel,
		}
	}

	if len(options) == 0 {
		options = []agent.CheckpointOption{
			{ID: "approve", Label: "批准", Description: "批准此操作", RiskLevel: "low"},
			{ID: "reject", Label: "拒绝", Description: "拒绝此操作", RiskLevel: "medium"},
		}
	}

	config := &agent.CheckpointConfig{
		Type:          checkpointType,
		Title:         req.Title,
		Description:   req.Description,
		Context:       req.Context,
		Options:       options,
		DefaultOption: "approve",
		Timeout:       req.Timeout,
		Required:      req.Required,
	}

	result := h.manager.RequestConfirmation(config)

	SuccessResponse(c, gin.H{
		"success":    result.Success,
		"checkpoint": result.Checkpoint.GetSummary(),
		"error":      result.Error,
	})
}

// ClearPending 清除待处理检查点
// POST /api/hitl/clear
func (h *HITLHandler) ClearPending(c *gin.Context) {
	h.manager.ClearPending()

	SuccessResponseWithMessage(c, "所有待处理检查点已清除", nil)
}

// HealthCheck 健康检查
// GET /api/hitl/health
func (h *HITLHandler) HealthCheck(c *gin.Context) {
	stats := h.manager.GetStats()

	SuccessResponse(c, gin.H{
		"status":    "ok",
		"service":   "human-in-the-loop",
		"pending":   stats["pending"],
		"timestamp": time.Now().Format(time.RFC3339),
	})
}
