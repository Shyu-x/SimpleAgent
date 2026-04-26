/**
 * A2A 包
 * Agent-to-Agent 协议实现
 *
 * 核心组件:
 * - AgentRegistry: Agent注册表，管理Agent注册、心跳、技能匹配
 * - MessageBroker: 消息代理，负责消息传递、SSE订阅、消息持久化
 * - TaskDelegate: 任务委托器，负责任务分发、状态跟踪、协作执行
 * - A2AService: A2A服务核心，整合以上组件提供统一接口
 *
 * 消息类型:
 * - task.delegate: 任务委托
 * - result.return: 结果回传
 * - status.sync: 状态同步
 * - heartbeat: 心跳检测
 * - error.notify: 错误通知
 * - progress.update: 进度更新
 *
 * 任务状态:
 * - pending: 等待处理
 * - running: 执行中
 * - completed: 已完成
 * - failed: 失败
 * - cancelled: 已取消
 */

package a2a

import (
	"fmt"
	"time"
)

// A2A 消息类型
type MessageType string

const (
	MessageTypeTaskDelegate   MessageType = "task.delegate"
	MessageTypeResultReturn   MessageType = "result.return"
	MessageTypeStatusSync    MessageType = "status.sync"
	MessageTypeHeartbeat      MessageType = "heartbeat"
	MessageTypeErrorNotify    MessageType = "error.notify"
	MessageTypeProgressUpdate MessageType = "progress.update"
	MessageTypeMessageSend    MessageType = "message.send"
)

// A2A 任务状态
type TaskStatus string

const (
	TaskStatusPending   TaskStatus = "pending"
	TaskStatusRunning   TaskStatus = "running"
	TaskStatusCompleted TaskStatus = "completed"
	TaskStatusFailed    TaskStatus = "failed"
	TaskStatusCancelled TaskStatus = "cancelled"
)

// A2AMessage A2A消息结构
type A2AMessage struct {
	ID        string      `json:"id"`
	Type      MessageType `json:"type"`
	From      string      `json:"from"`
	To        string      `json:"to"`
	TaskID    string      `json:"taskId"`
	SessionID string      `json:"sessionId"`
	Payload   interface{} `json:"payload"`
	Status    TaskStatus  `json:"status"`
	Timestamp int64       `json:"timestamp"`
	ExpiresAt int64       `json:"expiresAt"`
	ReplyTo   string      `json:"replyTo"`
	Metadata  map[string]interface{} `json:"metadata"`
}

// NewA2AMessage 创建新的A2A消息
func NewA2AMessage(msgType MessageType, from, to string) *A2AMessage {
	now := time.Now().UnixMilli()
	return &A2AMessage{
		ID:        generateMessageID(),
		Type:      msgType,
		From:      from,
		To:        to,
		Timestamp: now,
		ExpiresAt: now + 30*60*1000,
		Metadata:  make(map[string]interface{}),
	}
}

// IsExpired 检查消息是否已过期
func (m *A2AMessage) IsExpired() bool {
	return time.Now().UnixMilli() > m.ExpiresAt
}

// IsReply 检查是否为回复消息
func (m *A2AMessage) IsReply() bool {
	return m.ReplyTo != ""
}

// ToMap 转换为map格式
func (m *A2AMessage) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"id":         m.ID,
		"type":       m.Type,
		"from":       m.From,
		"to":         m.To,
		"taskId":     m.TaskID,
		"sessionId":  m.SessionID,
		"payload":    m.Payload,
		"status":     m.Status,
		"timestamp":  m.Timestamp,
		"expiresAt":  m.ExpiresAt,
		"replyTo":    m.ReplyTo,
		"metadata":   m.Metadata,
	}
}

// A2ATask A2A任务结构
type A2ATask struct {
	ID           string                 `json:"id"`
	Type         MessageType           `json:"type"`
	Title        string                 `json:"title"`
	Description  string                 `json:"description"`
	From         string                 `json:"from"`
	To           string                 `json:"to"`
	Input        map[string]interface{} `json:"input"`
	Output       interface{}            `json:"output"`
	Status       TaskStatus             `json:"status"`
	Progress     int                    `json:"progress"`
	Result       interface{}            `json:"result"`
	Error        interface{}            `json:"error"`
	CreatedAt    int64                  `json:"createdAt"`
	StartedAt    int64                  `json:"startedAt"`
	CompletedAt  int64                  `json:"completedAt"`
	SubTasks     []string               `json:"subTasks"`
	ParentTaskID string                 `json:"parentTaskId"`
	Metadata     map[string]interface{} `json:"metadata"`
	Tags         []string               `json:"tags"`
	Priority     int                    `json:"priority"`
}

// NewA2ATask 创建新的A2A任务
func NewA2ATask(title, from, to string) *A2ATask {
	now := time.Now().UnixMilli()
	return &A2ATask{
		ID:        generateTaskID(),
		Type:      MessageTypeTaskDelegate,
		Title:     title,
		From:      from,
		To:        to,
		Input:     make(map[string]interface{}),
		Status:    TaskStatusPending,
		Progress:  0,
		CreatedAt: now,
		Metadata:  make(map[string]interface{}),
		Tags:      []string{},
	}
}

// ToMap 转换为map格式
func (t *A2ATask) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"id":           t.ID,
		"type":         t.Type,
		"title":        t.Title,
		"description":  t.Description,
		"from":         t.From,
		"to":           t.To,
		"input":        t.Input,
		"output":       t.Output,
		"status":       t.Status,
		"progress":     t.Progress,
		"result":       t.Result,
		"error":        t.Error,
		"createdAt":    t.CreatedAt,
		"startedAt":    t.StartedAt,
		"completedAt":  t.CompletedAt,
		"subTasks":     t.SubTasks,
		"parentTaskId": t.ParentTaskID,
		"metadata":     t.Metadata,
		"tags":         t.Tags,
		"priority":     t.Priority,
	}
}

// AgentInfo Agent信息
type AgentInfo struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Type         string                 `json:"type"`
	Status       string                 `json:"status"`
	Endpoint     string                 `json:"endpoint"`
	Capabilities []string               `json:"capabilities"`
	Metadata     map[string]interface{} `json:"metadata"`
	RegisteredAt int64                  `json:"registeredAt"`
	LastSeen     int64                  `json:"lastSeen"`
}

// SendResult 发送结果
type SendResult struct {
	Success   bool
	MessageID string
	Error     string
}

// ReceiveOptions 接收消息选项
type ReceiveOptions struct {
	Limit          int
	IncludeExpired bool
	ClearReceived  bool
}

// DelegateResult 委托结果
type DelegateResult struct {
	Task    *A2ATask
	Message *A2AMessage
	Success bool
}

// ReturnResult 返回结果
type ReturnResult struct {
	Success bool
	Message *A2AMessage
	Error   string
}

// ProgressResult 进度结果
type ProgressResult struct {
	Success   bool
	MessageID string
	Error     string
}

// TaskFilter 任务过滤条件
type TaskFilter struct {
	Status string
	From  string
	To    string
	Limit int
}

// generateMessageID 生成唯一消息ID
func generateMessageID() string {
	return fmt.Sprintf("msg_%d_%s", time.Now().UnixNano(), randomString(8))
}

// generateTaskID 生成唯一任务ID
func generateTaskID() string {
	return fmt.Sprintf("task_%d_%s", time.Now().UnixNano(), randomString(8))
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
