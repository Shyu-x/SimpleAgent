/**
 * 消息代理
 * 负责消息传递、SSE订阅、消息持久化
 */

package a2a

import (
	"sync"
)

// MessageBroker 消息代理
type MessageBroker struct {
	messages    sync.Map // map[string][]*A2AMessage
	subscribers sync.Map // map[string]chan *A2AMessage
	mu          sync.RWMutex
	onMessage   func(*A2AMessage)
	stopChan    chan struct{}
}

// NewMessageBroker 创建消息代理
func NewMessageBroker() *MessageBroker {
	return &MessageBroker{
		stopChan: make(chan struct{}),
	}
}

// SetOnMessage 设置消息回调
func (b *MessageBroker) SetOnMessage(callback func(*A2AMessage)) {
	b.onMessage = callback
}

// Send 发送消息
func (b *MessageBroker) Send(message *A2AMessage) SendResult {
	// 存储消息
	key := message.SessionID
	if key == "" {
		key = message.To
	}

	var messages []*A2AMessage
	if val, ok := b.messages.Load(key); ok {
		messages = val.([]*A2AMessage)
	}
	messages = append(messages, message)
	b.messages.Store(key, messages)

	// 通知订阅者
	if val, ok := b.subscribers.Load(message.To); ok {
		select {
		case val.(chan *A2AMessage) <- message:
		default:
		}
	}

	// 触发回调
	if b.onMessage != nil {
		b.onMessage(message)
	}

	return SendResult{
		Success:   true,
		MessageID: message.ID,
	}
}

// Receive 接收消息
func (b *MessageBroker) Receive(agentID string, options *ReceiveOptions) []*A2AMessage {
	key := agentID
	if options != nil && options.ClearReceived {
		defer func() {
			b.messages.Delete(key)
		}()
	}

	val, ok := b.messages.Load(key)
	if !ok {
		return []*A2AMessage{}
	}

	messages := val.([]*A2AMessage)
	if options == nil {
		return messages
	}

	var result []*A2AMessage
	for _, msg := range messages {
		if !options.IncludeExpired && msg.IsExpired() {
			continue
		}
		result = append(result, msg)
	}

	limit := options.Limit
	if limit <= 0 {
		limit = len(result)
	}
	if limit > len(result) {
		limit = len(result)
	}

	return result[:limit]
}

// GetUnreadCount 获取未读消息数
func (b *MessageBroker) GetUnreadCount(agentID string) int {
	val, ok := b.messages.Load(agentID)
	if !ok {
		return 0
	}

	messages := val.([]*A2AMessage)
	count := 0
	for _, msg := range messages {
		if !msg.IsExpired() {
			count++
		}
	}
	return count
}

// Subscribe 订阅消息
func (b *MessageBroker) Subscribe(agentID string) chan *A2AMessage {
	b.mu.Lock()
	defer b.mu.Unlock()

	if val, ok := b.subscribers.Load(agentID); ok {
		return val.(chan *A2AMessage)
	}

	ch := make(chan *A2AMessage, 100)
	b.subscribers.Store(agentID, ch)
	return ch
}

// Unsubscribe 取消订阅
func (b *MessageBroker) Unsubscribe(agentID string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if val, ok := b.subscribers.Load(agentID); ok {
		close(val.(chan *A2AMessage))
		b.subscribers.Delete(agentID)
	}
}

// GetStats 获取统计信息
func (b *MessageBroker) GetStats() map[string]interface{} {
	var msgCount, subCount int

	b.messages.Range(func(k, v interface{}) bool {
		msgCount += len(v.([]*A2AMessage))
		return true
	})

	b.subscribers.Range(func(k, v interface{}) bool {
		subCount++
		return true
	})

	return map[string]interface{}{
		"messages":    msgCount,
		"subscribers": subCount,
	}
}

// Stop 停止代理
func (b *MessageBroker) Stop() {
	close(b.stopChan)

	b.subscribers.Range(func(k, v interface{}) bool {
		close(v.(chan *A2AMessage))
		return true
	})
}
