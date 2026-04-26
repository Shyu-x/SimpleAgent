package agent

import (
	"sync"
	"time"
)

// HITLRequest HITL确认请求
type HITLRequest struct {
	ID          string                 `json:"id"`          // 请求ID
	Type        string                 `json:"type"`        // 确认类型: dangerous/expensive/irreversible
	Action      string                 `json:"action"`      // 待确认的动作
	Description string                 `json:"description"` // 动作描述
	RiskLevel   RiskLevel              `json:"risk_level"`  // 风险等级
	Context     map[string]interface{} `json:"context"`    // 上下文信息
	CreatedAt   time.Time              `json:"created_at"`  // 创建时间
	ExpiresAt   time.Time              `json:"expires_at"`  // 过期时间
	Response    *HITLResponse          `json:"response"`    // 响应（如果已响应）
}

// RiskLevel 风险等级
type RiskLevel int

const (
	RiskLevelLow RiskLevel = iota
	RiskLevelMedium
	RiskLevelHigh
	RiskLevelCritical
)

// String 返回风险等级字符串
func (r RiskLevel) String() string {
	switch r {
	case RiskLevelLow:
		return "low"
	case RiskLevelMedium:
		return "medium"
	case RiskLevelHigh:
		return "high"
	case RiskLevelCritical:
		return "critical"
	default:
		return "unknown"
	}
}

// HITLResponse HITL响应
type HITLResponse struct {
	RequestID  string    `json:"request_id"`  // 请求ID
	Approved   bool      `json:"approved"`    // 是否批准
	Reason     string    `json:"reason"`      // 原因
	Operator   string    `json:"operator"`    // 操作员
	RespondedAt time.Time `json:"responded_at"` // 响应时间
}

// HITLType HITL确认类型
type HITLType string

const (
	HITLTypeDangerous    HITLType = "dangerous"    // 危险操作
	HITLTypeExpensive    HITLType = "expensive"    // 高费用调用
	HITLTypeIrreversible HITLType = "irreversible" // 不可逆操作
	HITLTypeExternalHTTP HITLType = "external_http" // 外部HTTP请求
)

// HITLManager HITL管理器 (支持SSE实时通知)
type HITLManager struct {
	requests      map[string]*HITLRequest
	mu            sync.RWMutex
	subscribers   map[string]chan *HITLRequest
	sseChannels   map[string]chan *SSEHITLEvent // SSE实时通知通道
	subMu         sync.RWMutex
	sseMu         sync.RWMutex
	timeout       time.Duration
	checkpoints   map[string]*Checkpoint  // 检查点存储
	history       []*Checkpoint           // 历史记录
}

// SSEHITLEvent SSE事件
type SSEHITLEvent struct {
	EventType string      `json:"event_type"` // new_request, approved, rejected, timeout
	Request   *HITLRequest `json:"request"`
	Checkpoint *Checkpoint  `json:"checkpoint,omitempty"`
	Timestamp int64        `json:"timestamp"`
}

// NewHITLManager 创建HITL管理器
func NewHITLManager(timeout time.Duration) *HITLManager {
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	return &HITLManager{
		requests:    make(map[string]*HITLRequest),
		subscribers: make(map[string]chan *HITLRequest),
		sseChannels: make(map[string]chan *SSEHITLEvent),
		timeout:     timeout,
		checkpoints: make(map[string]*Checkpoint),
		history:     make([]*Checkpoint, 0),
	}
}

// CreateRequest 创建确认请求
func (m *HITLManager) CreateRequest(req *HITLRequest) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	req.CreatedAt = time.Now()
	req.ExpiresAt = req.CreatedAt.Add(m.timeout)

	if req.ID == "" {
		req.ID = generateID()
	}

	m.requests[req.ID] = req

	// 通知SSE订阅者
	go m.BroadcastSSEEvent("new_request", req, nil)

	return nil
}

// GetRequest 获取请求
func (m *HITLManager) GetRequest(id string) (*HITLRequest, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	req, ok := m.requests[id]
	return req, ok
}

// Respond 响应确认请求
func (m *HITLManager) Respond(resp *HITLResponse) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	req, ok := m.requests[resp.RequestID]
	if !ok {
		return ErrRequestNotFound
	}

	if req.Response != nil {
		return ErrAlreadyResponded
	}

	if time.Now().After(req.ExpiresAt) {
		return ErrRequestExpired
	}

	resp.RespondedAt = time.Now()
	req.Response = resp

	// 通知订阅者
	m.notifySubscriber(req)

	// 通知SSE订阅者
	eventType := "rejected"
	if resp.Approved {
		eventType = "approved"
	}
	go m.BroadcastSSEEvent(eventType, req, nil)

	return nil
}

// Subscribe 订阅请求变化
func (m *HITLManager) Subscribe(sessionID string, ch chan *HITLRequest) {
	m.subMu.Lock()
	defer m.subMu.Unlock()
	m.subscribers[sessionID] = ch
}

// Unsubscribe 取消订阅
func (m *HITLManager) Unsubscribe(sessionID string) {
	m.subMu.Lock()
	defer m.subMu.Unlock()
	delete(m.subscribers, sessionID)
}

// SubscribeSSE 订阅SSE实时通知
func (m *HITLManager) SubscribeSSE(sessionID string, ch chan *SSEHITLEvent) {
	m.sseMu.Lock()
	defer m.sseMu.Unlock()
	m.sseChannels[sessionID] = ch
}

// UnsubscribeSSE 取消SSE订阅
func (m *HITLManager) UnsubscribeSSE(sessionID string) {
	m.sseMu.Lock()
	defer m.sseMu.Unlock()
	if ch, ok := m.sseChannels[sessionID]; ok {
		close(ch)
		delete(m.sseChannels, sessionID)
	}
}

// notifySubscriber 通知订阅者
func (m *HITLManager) notifySubscriber(req *HITLRequest) {
	m.subMu.RLock()
	defer m.subMu.RUnlock()
	for _, ch := range m.subscribers {
		select {
		case ch <- req:
		default:
		}
	}
}

// notifySSESubscribers 通知SSE订阅者
func (m *HITLManager) notifySSESubscribers(event *SSEHITLEvent) {
	m.sseMu.RLock()
	defer m.sseMu.RUnlock()
	for _, ch := range m.sseChannels {
		select {
		case ch <- event:
		default:
		}
	}
}

// BroadcastSSEEvent 广播SSE事件到所有订阅者
func (m *HITLManager) BroadcastSSEEvent(eventType string, req *HITLRequest, cp *Checkpoint) {
	event := &SSEHITLEvent{
		EventType:  eventType,
		Request:    req,
		Checkpoint: cp,
		Timestamp:  time.Now().UnixMilli(),
	}
	m.notifySSESubscribers(event)
}

// ErrRequestNotFound 请求未找到
var ErrRequestNotFound = &HITLError{Message: "HITL request not found"}

// ErrAlreadyResponded 已经响应过
var ErrAlreadyResponded = &HITLError{Message: "HITL request already responded"}

// ErrRequestExpired 请求已过期
var ErrRequestExpired = &HITLError{Message: "HITL request expired"}

// HITLError HITL错误
type HITLError struct {
	Message string
}

func (e *HITLError) Error() string {
	return e.Message
}

// ========== Checkpoint 风格接口（与 handlers/hitl.go 兼容）==========

// CheckpointStatus 检查点状态
type CheckpointStatus string

const (
	CheckpointStatusPending   CheckpointStatus = "pending"
	CheckpointStatusApproved  CheckpointStatus = "approved"
	CheckpointStatusRejected  CheckpointStatus = "rejected"
	CheckpointStatusTimeout   CheckpointStatus = "timeout"
	CheckpointStatusCancelled CheckpointStatus = "cancelled"
)

// CheckpointType 检查点类型
type CheckpointType string

const (
	CheckpointTypeDecision   CheckpointType = "decision"
	CheckpointTypeAction    CheckpointType = "action"
	CheckpointTypeDataAccess CheckpointType = "data_access"
	CheckpointTypeHighRisk  CheckpointType = "high_risk"
	CheckpointTypeCostLimit CheckpointType = "cost_limit"
)

// CheckpointOption 检查点选项
type CheckpointOption struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
	RiskLevel   string `json:"riskLevel"`
}

// CheckpointResponse 检查点响应
type CheckpointResponse struct {
	Option  string `json:"option"`
	Comment string `json:"comment"`
	Reason  string `json:"reason"`
}

// Checkpoint 检查点
type Checkpoint struct {
	ID            string                 `json:"id"`
	Type          CheckpointType        `json:"type"`
	Title         string                 `json:"title"`
	Description   string                 `json:"description"`
	Context       map[string]interface{} `json:"context"`
	Options       []CheckpointOption     `json:"options"`
	DefaultOption string                 `json:"defaultOption"`
	Timeout       int64                  `json:"timeout"`
	Required      bool                   `json:"required"`
	CreatedAt     int64                  `json:"createdAt"`
	Status        CheckpointStatus       `json:"status"`
	Response      *CheckpointResponse    `json:"response"`
	RespondedAt   int64                  `json:"respondedAt"`
	RespondedBy   string                 `json:"respondedBy"`
}

// CheckpointConfig 检查点配置
type CheckpointConfig struct {
	Type          CheckpointType
	Title         string
	Description   string
	Context       map[string]interface{}
	Options       []CheckpointOption
	DefaultOption string
	Timeout       int64
	Required      bool
}

// ApproveResult 批准结果
type ApproveResult struct {
	Success    bool
	Error      string
	Checkpoint *Checkpoint
}

// RejectResult 拒绝结果
type RejectResult struct {
	Success    bool
	Error      string
	Checkpoint *Checkpoint
}

// WaitResult 等待结果
type WaitResult struct {
	Success    bool
	Error      string
	Checkpoint *Checkpoint
}

// CreateCheckpoint 创建检查点
func (m *HITLManager) CreateCheckpoint(config *CheckpointConfig) *Checkpoint {
	m.mu.Lock()
	defer m.mu.Unlock()

	if config.Timeout <= 0 {
		config.Timeout = 5 * 60 * 1000 // 5分钟
	}

	if len(config.Options) == 0 {
		config.Options = []CheckpointOption{
			{ID: "approve", Label: "批准", Description: "批准此操作", RiskLevel: "low"},
			{ID: "reject", Label: "拒绝", Description: "拒绝此操作", RiskLevel: "medium"},
		}
	}

	now := time.Now().UnixMilli()
	cp := &Checkpoint{
		ID:            generateID(),
		Type:          config.Type,
		Title:         config.Title,
		Description:   config.Description,
		Context:       config.Context,
		Options:       config.Options,
		DefaultOption: config.DefaultOption,
		Timeout:       config.Timeout,
		Required:      config.Required,
		CreatedAt:     now,
		Status:        CheckpointStatusPending,
	}

	if cp.Context == nil {
		cp.Context = make(map[string]interface{})
	}

	m.checkpoints[cp.ID] = cp
	return cp
}

// ApproveCheckpoint 批准检查点
func (m *HITLManager) ApproveCheckpoint(checkpointID string, option string, userID string, comment string) *ApproveResult {
	m.mu.Lock()
	defer m.mu.Unlock()

	cp, ok := m.checkpoints[checkpointID]
	if !ok {
		return &ApproveResult{Success: false, Error: "Checkpoint not found"}
	}

	if cp.Status != CheckpointStatusPending {
		return &ApproveResult{Success: false, Error: "Checkpoint already " + string(cp.Status)}
	}

	cp.Status = CheckpointStatusApproved
	cp.Response = &CheckpointResponse{Option: option, Comment: comment}
	cp.RespondedAt = time.Now().UnixMilli()
	cp.RespondedBy = userID

	// 通知SSE订阅者
	go m.BroadcastSSEEvent("approved", nil, cp)

	return &ApproveResult{Success: true, Checkpoint: cp}
}

// RejectCheckpoint 拒绝检查点
func (m *HITLManager) RejectCheckpoint(checkpointID string, reason string, userID string) *RejectResult {
	m.mu.Lock()
	defer m.mu.Unlock()

	cp, ok := m.checkpoints[checkpointID]
	if !ok {
		return &RejectResult{Success: false, Error: "Checkpoint not found"}
	}

	if cp.Status != CheckpointStatusPending {
		return &RejectResult{Success: false, Error: "Checkpoint already " + string(cp.Status)}
	}

	cp.Status = CheckpointStatusRejected
	cp.Response = &CheckpointResponse{Reason: reason}
	cp.RespondedAt = time.Now().UnixMilli()
	cp.RespondedBy = userID

	// 通知SSE订阅者
	go m.BroadcastSSEEvent("rejected", nil, cp)

	return &RejectResult{Success: true, Checkpoint: cp}
}

// GetCheckpoint 获取检查点
func (m *HITLManager) GetCheckpoint(checkpointID string) *Checkpoint {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.checkpoints[checkpointID]
}

// GetPendingCheckpoints 获取待处理检查点
func (m *HITLManager) GetPendingCheckpoints() []*Checkpoint {
	m.mu.RLock()
	defer m.mu.RUnlock()

	pending := make([]*Checkpoint, 0)
	for _, cp := range m.checkpoints {
		if cp.Status == CheckpointStatusPending {
			pending = append(pending, cp)
		}
	}
	return pending
}

// WaitForCheckpoint 等待检查点响应
func (m *HITLManager) WaitForCheckpoint(checkpointID string, timeoutMs int64) *WaitResult {
	start := time.Now().UnixMilli()
	checkInterval := int64(500)

	for {
		m.mu.RLock()
		cp := m.checkpoints[checkpointID]
		m.mu.RUnlock()

		if cp == nil || cp.Status != CheckpointStatusPending {
			if cp == nil {
				return &WaitResult{Success: false, Error: "Checkpoint not found"}
			}
			return &WaitResult{Success: cp.Status == CheckpointStatusApproved, Checkpoint: cp}
		}

		if time.Now().UnixMilli()-start > timeoutMs {
			m.mu.Lock()
			if c, ok := m.checkpoints[checkpointID]; ok {
				c.Status = CheckpointStatusTimeout
				m.history = append(m.history, c)
				delete(m.checkpoints, checkpointID)
			}
			m.mu.Unlock()
			return &WaitResult{Success: false, Error: "Timeout"}
		}

		time.Sleep(time.Duration(checkInterval) * time.Millisecond)
	}
}

// RequestConfirmation 创建并等待确认
func (m *HITLManager) RequestConfirmation(config *CheckpointConfig) *WaitResult {
	cp := m.CreateCheckpoint(config)
	return m.WaitForCheckpoint(cp.ID, config.Timeout)
}

// FindInHistory 从历史中查找
func (m *HITLManager) FindInHistory(checkpointID string) *Checkpoint {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, cp := range m.history {
		if cp.ID == checkpointID {
			return cp
		}
	}
	return nil
}

// GetHistory 获取历史记录
func (m *HITLManager) GetHistory(limit int) []*Checkpoint {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if limit <= 0 || limit > len(m.history) {
		limit = len(m.history)
	}

	history := make([]*Checkpoint, limit)
	copy(history, m.history[len(m.history)-limit:])
	return history
}

// ClearPending 清除待处理检查点
func (m *HITLManager) ClearPending() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, cp := range m.checkpoints {
		if cp.Status == CheckpointStatusPending {
			cp.Status = CheckpointStatusCancelled
			m.history = append(m.history, cp)
			delete(m.checkpoints, id)
		}
	}
}

// GetStats 获取统计信息
func (m *HITLManager) GetStats() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	pendingCount := 0
	approvedCount := 0
	rejectedCount := 0
	timeoutCount := 0

	for _, cp := range m.checkpoints {
		if cp.Status == CheckpointStatusPending {
			pendingCount++
		}
	}

	for _, cp := range m.history {
		switch cp.Status {
		case CheckpointStatusApproved:
			approvedCount++
		case CheckpointStatusRejected:
			rejectedCount++
		case CheckpointStatusTimeout:
			timeoutCount++
		}
	}

	return map[string]interface{}{
		"pending":  pendingCount,
		"approved": approvedCount,
		"rejected": rejectedCount,
		"timeout":  timeoutCount,
		"total":    len(m.history),
	}
}

// GetSummary 获取检查点摘要
func (cp *Checkpoint) GetSummary() map[string]interface{} {
	summary := map[string]interface{}{
		"id":          cp.ID,
		"type":        cp.Type,
		"title":       cp.Title,
		"description": cp.Description,
		"status":      cp.Status,
		"createdAt":   cp.CreatedAt,
		"respondedAt": cp.RespondedAt,
		"response":    cp.Response,
	}
	if cp.Context != nil {
		summary["context"] = cp.Context
	}
	return summary
}

// generateID 生成唯一ID（使用memory.go中的randomString）
func generateID() string {
	return time.Now().Format("20060102150405") + "-" + randomString(8)
}

// randomString 生成随机字符串（注释掉，使用memory.go中的定义以避免重复声明）
// func randomString(n int) string {
// 	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
// 	b := make([]byte, n)
// 	for i := range b {
// 		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
// 	}
// 	return string(b)
// }
