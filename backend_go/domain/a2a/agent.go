package a2a

import (
	"context"
	"encoding/json"
	"errors"
	"math/rand"
	"sync"
	"time"
)

// AgentInfo Agent信息
type AgentInfo struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Capabilities []string              `json:"capabilities"`
	Metadata    map[string]interface{} `json:"metadata"`
	Status      AgentStatus            `json:"status"`
	LastHeartbeat time.Time            `json:"last_heartbeat"`
}

// AgentStatus Agent状态
type AgentStatus string

const (
	AgentStatusOnline  AgentStatus = "online"
	AgentStatusOffline AgentStatus = "offline"
	AgentStatusBusy    AgentStatus = "busy"
)

// Message 消息结构
type Message struct {
	ID        string                 `json:"id"`
	From      string                 `json:"from"`
	To        string                 `json:"to"`
	Type      MessageType            `json:"type"`
	Content   interface{}            `json:"content"`
	Timestamp time.Time              `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata"`
}

// MessageType 消息类型
type MessageType string

const (
	MessageTypeTask    MessageType = "task"
	MessageTypeResult  MessageType = "result"
	MessageTypeError   MessageType = "error"
	MessageTypeHeartbeat MessageType = "heartbeat"
	MessageTypeSubscribe MessageType = "subscribe"
)

// Task 任务结构
type Task struct {
	ID          string       `json:"id"`
	AgentID     string       `json:"agent_id"`
	Type        string       `json:"type"`
	Input       interface{}  `json:"input"`
	Output      interface{}  `json:"output"`
	Status      TaskStatus   `json:"status"`
	Error       string       `json:"error,omitempty"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
	CompletedAt *time.Time  `json:"completed_at,omitempty"`
}

// TaskStatus 任务状态
type TaskStatus string

const (
	TaskStatusPending   TaskStatus = "pending"
	TaskStatusRunning   TaskStatus = "running"
	TaskStatusCompleted TaskStatus = "completed"
	TaskStatusFailed    TaskStatus = "failed"
)

// AgentRegistry Agent注册表接口
type AgentRegistry interface {
	// Register 注册Agent
	Register(info AgentInfo) error
	// Unregister 注销Agent
	Unregister(agentID string) error
	// GetAgent 获取Agent信息
	GetAgent(agentID string) (*AgentInfo, error)
	// ListAgents 列出所有Agent
	ListAgents() []AgentInfo
	// Heartbeat 心跳
	Heartbeat(agentID string) error
}

// agentRegistry Agent注册表实现
type agentRegistry struct {
	agents  map[string]*AgentInfo
	mu      sync.RWMutex
	ttl     time.Duration
}

// NewAgentRegistry 创建Agent注册表
func NewAgentRegistry(ttl time.Duration) AgentRegistry {
	if ttl <= 0 {
		ttl = 60 * time.Second
	}

	registry := &agentRegistry{
		agents: make(map[string]*AgentInfo),
		ttl:    ttl,
	}

	// 启动过期清理协程
	go registry.cleanupLoop()

	return registry
}

// Register 注册Agent
func (r *agentRegistry) Register(info AgentInfo) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	info.Status = AgentStatusOnline
	info.LastHeartbeat = time.Now()

	r.agents[info.ID] = &info
	return nil
}

// Unregister 注销Agent
func (r *agentRegistry) Unregister(agentID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.agents, agentID)
	return nil
}

// GetAgent 获取Agent信息
func (r *agentRegistry) GetAgent(agentID string) (*AgentInfo, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	agent, exists := r.agents[agentID]
	if !exists {
		return nil, errors.New("agent not found: " + agentID)
	}

	return agent, nil
}

// ListAgents 列出所有Agent
func (r *agentRegistry) ListAgents() []AgentInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()

	agents := make([]AgentInfo, 0, len(r.agents))
	for _, agent := range r.agents {
		agents = append(agents, *agent)
	}

	return agents
}

// Heartbeat 心跳
func (r *agentRegistry) Heartbeat(agentID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	agent, exists := r.agents[agentID]
	if !exists {
		return errors.New("agent not found: " + agentID)
	}

	agent.LastHeartbeat = time.Now()
	agent.Status = AgentStatusOnline

	return nil
}

// cleanupLoop 清理过期Agent
func (r *agentRegistry) cleanupLoop() {
	ticker := time.NewTicker(r.ttl / 2)
	for range ticker.C {
		r.mu.Lock()
		now := time.Now()
		for id, agent := range r.agents {
			if now.Sub(agent.LastHeartbeat) > r.ttl {
				agent.Status = AgentStatusOffline
				delete(r.agents, id)
			}
		}
		r.mu.Unlock()
	}
}

// MessageQueue 消息队列接口
type MessageQueue interface {
	// Send 发送消息
	Send(msg Message) error
	// Receive 接收消息
	Receive(ctx context.Context, agentID string) (*Message, error)
	// Subscribe 订阅消息
	Subscribe(agentID string) (<-chan Message, error)
	// Unsubscribe 取消订阅
	Unsubscribe(agentID string) error
}

// InMemoryMessageQueue 内存消息队列
type InMemoryMessageQueue struct {
	messages  chan Message
	subs      map[string]chan Message
	mu        sync.RWMutex
}

// NewInMemoryMessageQueue 创建内存消息队列
func NewInMemoryMessageQueue(bufferSize int) MessageQueue {
	if bufferSize <= 0 {
		bufferSize = 100
	}

	return &InMemoryMessageQueue{
		messages: make(chan Message, bufferSize),
		subs:     make(map[string]chan Message),
	}
}

// Send 发送消息
func (q *InMemoryMessageQueue) Send(msg Message) error {
	select {
	case q.messages <- msg:
		// 通知订阅者
		q.mu.RLock()
		if ch, ok := q.subs[msg.To]; ok {
			select {
			case ch <- msg:
			default:
				// 通道满
			}
		}
		q.mu.RUnlock()
		return nil
	default:
		return errors.New("message queue is full")
	}
}

// Receive 接收消息
func (q *InMemoryMessageQueue) Receive(ctx context.Context, agentID string) (*Message, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case msg := <-q.messages:
		if msg.To == agentID {
			return &msg, nil
		}
		// 不是目标Agent，重新放回队列（简化实现）
		return &msg, nil
	}
}

// Subscribe 订阅消息
func (q *InMemoryMessageQueue) Subscribe(agentID string) (<-chan Message, error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	ch := make(chan Message, 100)
	q.subs[agentID] = ch

	return ch, nil
}

// Unsubscribe 取消订阅
func (q *InMemoryMessageQueue) Unsubscribe(agentID string) error {
	q.mu.Lock()
	defer q.mu.Unlock()

	delete(q.subs, agentID)
	return nil
}

// A2AClient A2A客户端接口
type A2AClient interface {
	// SendTask 发送任务
	SendTask(ctx context.Context, targetAgentID string, task *Task) (*Task, error)
	// GetTaskStatus 获取任务状态
	GetTaskStatus(ctx context.Context, taskID string) (*Task, error)
	// SubscribeTask 订阅任务更新
	SubscribeTask(ctx context.Context, taskID string) (<-chan *Task, error)
}

// a2aClient A2A客户端实现
type a2aClient struct {
	registry AgentRegistry
	queue    MessageQueue
}

// NewA2AClient 创建A2A客户端
func NewA2AClient(registry AgentRegistry, queue MessageQueue) A2AClient {
	return &a2aClient{
		registry: registry,
		queue:    queue,
	}
}

// SendTask 发送任务
func (c *a2aClient) SendTask(ctx context.Context, targetAgentID string, task *Task) (*Task, error) {
	// 检查目标Agent是否存在
	_, err := c.registry.GetAgent(targetAgentID)
	if err != nil {
		return nil, err
	}

	// 构建消息
	content, _ := json.Marshal(task)
	msg := Message{
		ID:        generateID(),
		From:      "", // 简化
		To:        targetAgentID,
		Type:      MessageTypeTask,
		Content:   content,
		Timestamp: time.Now(),
	}

	// 发送消息
	if err := c.queue.Send(msg); err != nil {
		return nil, err
	}

	return task, nil
}

// GetTaskStatus 获取任务状态
func (c *a2aClient) GetTaskStatus(ctx context.Context, taskID string) (*Task, error) {
	// 简化实现
	return nil, errors.New("not implemented")
}

// SubscribeTask 订阅任务更新
func (c *a2aClient) SubscribeTask(ctx context.Context, taskID string) (<-chan *Task, error) {
	// 简化实现
	return nil, errors.New("not implemented")
}

// globalRand 全局随机数源
var globalRand = rand.New(rand.NewSource(time.Now().UnixNano()))

// generateID 生成唯一ID
func generateID() string {
	return time.Now().Format("20060102150405.000000000") + randomString(8)
}

// randomString 生成随机字符串
func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[globalRand.Intn(len(letters))]
	}
	return string(b)
}
