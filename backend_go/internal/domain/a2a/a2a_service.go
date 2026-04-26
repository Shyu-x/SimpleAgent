/**
 * A2A 服务
 * Agent-to-Agent 协议服务核心
 */

package a2a

import (
	"sync"
)

// A2AService A2A服务核心
type A2AService struct {
	registry *AgentRegistry   // Agent注册表
	broker   *MessageBroker   // 消息代理
	delegate *TaskDelegate    // 任务委托器
	mu       sync.RWMutex     // 互斥锁
	handlers map[string]func(*A2AMessage) // 事件处理器
}

// NewA2AService 创建A2A服务
func NewA2AService() *A2AService {
	service := &A2AService{
		registry: NewAgentRegistry(),
		broker:   NewMessageBroker(),
		delegate: NewTaskDelegate(),
		handlers: make(map[string]func(*A2AMessage)),
	}

	// 初始化消息处理
	service.initMessageHandlers()

	return service
}

// initMessageHandlers 初始化消息处理器
func (s *A2AService) initMessageHandlers() {
	// 监听消息发送事件
	s.broker.SetOnMessage(func(message *A2AMessage) {
		// 如果是结果回传，触发任务完成回调
		if message.Type == MessageTypeResultReturn && message.TaskID != "" {
			s.delegate.resolveCallbacks(message.TaskID, message)
		}
		// 如果是错误通知
		if message.Type == MessageTypeErrorNotify && message.TaskID != "" {
			s.delegate.resolveCallbacks(message.TaskID, message)
		}
	})

	// 设置任务事件回调
	s.delegate.SetOnTaskEvent(func(task *A2ATask, event string) {
		s.mu.RLock()
		handler := s.handlers[event]
		s.mu.RUnlock()

		if handler != nil {
			msg := &A2AMessage{
				Type:   MessageTypeTaskDelegate,
				TaskID: task.ID,
				Payload: map[string]interface{}{
					"task": task.ToMap(),
				},
			}
			go handler(msg)
		}
	})
}

// RegisterAgent 注册Agent
func (s *A2AService) RegisterAgent(info AgentInfo) *AgentInfo {
	return s.registry.Register(info)
}

// UnregisterAgent 注销Agent
func (s *A2AService) UnregisterAgent(agentID string) {
	s.registry.Unregister(agentID)
}

// Heartbeat Agent心跳
func (s *A2AService) Heartbeat(agentID string) {
	s.registry.Heartbeat(agentID)
}

// ListAgents 获取在线Agent列表
func (s *A2AService) ListAgents() []*AgentInfo {
	return s.registry.ListOnlineAgents()
}

// GetAgent 获取Agent信息
func (s *A2AService) GetAgent(agentID string) *AgentInfo {
	return s.registry.GetAgent(agentID)
}

// MatchAgents 智能匹配Agent
func (s *A2AService) MatchAgents(agentType string, capabilities []string) []*AgentInfo {
	return s.registry.MatchAgents(agentType, capabilities)
}

// SendMessage 发送消息
func (s *A2AService) SendMessage(message *A2AMessage) SendResult {
	return s.broker.Send(message)
}

// ReceiveMessages 接收消息
func (s *A2AService) ReceiveMessages(agentID string, options *ReceiveOptions) []*A2AMessage {
	return s.broker.Receive(agentID, options)
}

// GetUnreadCount 获取未读消息数
func (s *A2AService) GetUnreadCount(agentID string) int {
	return s.broker.GetUnreadCount(agentID)
}

// Subscribe 订阅消息
func (s *A2AService) Subscribe(agentID string) chan *A2AMessage {
	return s.broker.Subscribe(agentID)
}

// Unsubscribe 取消订阅
func (s *A2AService) Unsubscribe(agentID string) {
	s.broker.Unsubscribe(agentID)
}

// DelegateTask 委托任务
func (s *A2AService) DelegateTask(task *A2ATask) *DelegateResult {
	return s.delegate.DelegateTask(task, s.broker)
}

// ReturnResult 返回结果
func (s *A2AService) ReturnResult(taskID string, result interface{}, status TaskStatus, metadata map[string]interface{}) *ReturnResult {
	return s.delegate.ReturnResult(taskID, result, status, metadata, s.broker)
}

// SendProgress 发送进度
func (s *A2AService) SendProgress(taskID string, progress int, metadata map[string]interface{}) *ProgressResult {
	return s.delegate.SendProgress(taskID, progress, metadata, s.broker)
}

// GetTaskStatus 获取任务状态
func (s *A2AService) GetTaskStatus(taskID string) *A2ATask {
	return s.delegate.GetTaskStatus(taskID)
}

// ListTasks 列出任务
func (s *A2AService) ListTasks(filter *TaskFilter) []*A2ATask {
	return s.delegate.ListTasks(filter)
}

// CancelTask 取消任务
func (s *A2AService) CancelTask(taskID string) bool {
	return s.delegate.CancelTask(taskID, s.broker)
}

// RegisterCallback 注册任务回调
func (s *A2AService) RegisterCallback(taskID string, callback func(*A2AMessage)) {
	s.delegate.RegisterCallback(taskID, callback)
}

// SetHandler 设置事件处理器
func (s *A2AService) SetHandler(event string, handler func(*A2AMessage)) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.handlers[event] = handler
}

// GetStats 获取服务统计
func (s *A2AService) GetStats() map[string]interface{} {
	return map[string]interface{}{
		"registry": s.registry.GetStats(),
		"broker":   s.broker.GetStats(),
		"delegate": s.delegate.GetStats(),
	}
}

// Stop 停止服务
func (s *A2AService) Stop() {
	s.registry.Stop()
	s.broker.Stop()
}

// GetRegistry 获取注册表（用于测试）
func (s *A2AService) GetRegistry() *AgentRegistry {
	return s.registry
}

// GetBroker 获取消息代理（用于测试）
func (s *A2AService) GetBroker() *MessageBroker {
	return s.broker
}

// GetDelegate 获取任务委托器（用于测试）
func (s *A2AService) GetDelegate() *TaskDelegate {
	return s.delegate
}
