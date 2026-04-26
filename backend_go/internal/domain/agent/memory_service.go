package agent

import (
	"context"
	"sync"
	"time"

	"github.com/ai-chat/backend_go/internal/domain/model"
)

// ConversationMemoryService 对话记忆服务
type ConversationMemoryService struct {
	config        MemoryServiceConfig
	messages      []*MemoryMessage
	summary       string
	summaryAt     int
	mu            sync.RWMutex
	sessionID     string
	persistFunc   PersistFunc // 持久化函数
	loadFunc      LoadFunc    // 加载函数
}

// MemoryServiceConfig 记忆服务配置
type MemoryServiceConfig struct {
	WindowSize      int    // 滑动窗口大小
	MaxTokens       int    // 最大token数
	EnableSummary   bool   // 启用摘要
	SummaryThresh   int    // 摘要阈值(超过此token数触发摘要)
	PersistEnabled  bool   // 启用持久化
}

// PersistFunc 持久化函数类型
type PersistFunc func(sessionID string, messages []*MemoryMessage, summary string) error

// LoadFunc 加载函数类型
type LoadFunc func(sessionID string) ([]*MemoryMessage, string, error)

// MemoryMessage 对话记忆消息(已定义在memory.go)

// NewConversationMemoryService 创建对话记忆服务
func NewConversationMemoryService(sessionID string, config MemoryServiceConfig) *ConversationMemoryService {
	return &ConversationMemoryService{
		config:    config,
		messages:  make([]*MemoryMessage, 0),
		sessionID: sessionID,
	}
}

// WithPersistFunc 设置持久化函数
func (s *ConversationMemoryService) WithPersistFunc(fn PersistFunc) *ConversationMemoryService {
	s.persistFunc = fn
	return s
}

// WithLoadFunc 设置加载函数
func (s *ConversationMemoryService) WithLoadFunc(fn LoadFunc) *ConversationMemoryService {
	s.loadFunc = fn
	return s
}

// Load 加载记忆
func (s *ConversationMemoryService) Load(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.loadFunc == nil {
		return nil
	}

	messages, summary, err := s.loadFunc(s.sessionID)
	if err != nil {
		return err
	}

	s.messages = messages
	s.summary = summary
	if summary != "" {
		s.summaryAt = len(messages)
	}

	return nil
}

// Append 追加记忆
func (s *ConversationMemoryService) Append(msg *MemoryMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.messages = append(s.messages, msg)

	// 检查是否需要触发摘要
	if s.shouldSummarize() && s.summaryAt == 0 {
		s.summaryAt = len(s.messages) - s.config.WindowSize
	}

	// 如果启用持久化，保存到存储
	if s.persistFunc != nil && s.config.PersistEnabled {
		go func() {
			_ = s.persistFunc(s.sessionID, s.messages, s.summary)
		}()
	}

	return nil
}

// LoadAndAppend 加载记忆并追加新消息
func (s *ConversationMemoryService) LoadAndAppend(ctx context.Context, msg *MemoryMessage) error {
	// 先加载
	if err := s.Load(ctx); err != nil {
		return err
	}

	// 再追加
	return s.Append(msg)
}

// GetMessages 获取消息列表(用于发送给模型)
func (s *ConversationMemoryService) GetMessages() []model.Message {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []model.Message

	// 如果有摘要，添加摘要消息
	if s.summary != "" {
		result = append(result, model.Message{
			Role:    "system",
			Content: "之前的对话摘要: " + s.summary,
		})
	}

	// 获取窗口内的消息
	windowSize := s.config.WindowSize
	if windowSize <= 0 {
		windowSize = 10
	}

	start := len(s.messages) - windowSize
	if start < 0 {
		start = 0
	}

	// 如果有摘要，从摘要点之后开始
	if s.summaryAt > 0 && start < s.summaryAt {
		start = s.summaryAt
	}

	for _, msg := range s.messages[start:] {
		result = append(result, model.Message{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}

	return result
}

// GetRecentMessages 获取最近N条消息
func (s *ConversationMemoryService) GetRecentMessages(n int) []*MemoryMessage {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if n <= 0 {
		n = 10
	}

	start := len(s.messages) - n
	if start < 0 {
		start = 0
	}

	result := make([]*MemoryMessage, len(s.messages[start:]))
	copy(result, s.messages[start:])
	return result
}

// GetAllMessages 获取所有消息
func (s *ConversationMemoryService) GetAllMessages() []*MemoryMessage {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*MemoryMessage, len(s.messages))
	copy(result, s.messages)
	return result
}

// GetTotalTokens 获取总token数
func (s *ConversationMemoryService) GetTotalTokens() int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	total := 0
	for _, msg := range s.messages {
		total += msg.Tokens
	}
	return total
}

// Clear 清空记忆
func (s *ConversationMemoryService) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.messages = make([]*MemoryMessage, 0)
	s.summary = ""
	s.summaryAt = 0
}

// SetSummary 设置摘要
func (s *ConversationMemoryService) SetSummary(summary string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.summary = summary
	s.summaryAt = len(s.messages)

	// 如果启用持久化，保存摘要
	if s.persistFunc != nil && s.config.PersistEnabled {
		go func() {
			_ = s.persistFunc(s.sessionID, s.messages, s.summary)
		}()
	}
}

// GetSummary 获取当前摘要
func (s *ConversationMemoryService) GetSummary() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.summary
}

// shouldSummarize 检查是否需要摘要
func (s *ConversationMemoryService) shouldSummarize() bool {
	if !s.config.EnableSummary || s.config.SummaryThresh <= 0 {
		return false
	}
	return s.GetTotalTokens() > s.config.SummaryThresh
}

// ShouldSummarizeNow 检查是否应该立即进行摘要
func (s *ConversationMemoryService) ShouldSummarizeNow() bool {
	if !s.shouldSummarize() {
		return false
	}
	// 摘要点在窗口之外时需要立即摘要
	return s.summaryAt > 0 && len(s.messages)-s.summaryAt > s.config.WindowSize
}

// GetMemoryStats 获取记忆统计信息
func (s *ConversationMemoryService) GetMemoryStats() MemoryStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return MemoryStats{
		TotalMessages:  len(s.messages),
		TotalTokens:   s.GetTotalTokens(),
		HasSummary:    s.summary != "",
		SummaryAt:     s.summaryAt,
		WindowSize:    s.config.WindowSize,
		SummaryThresh: s.config.SummaryThresh,
	}
}

// MemoryStats 记忆统计信息
type MemoryStats struct {
	TotalMessages int    `json:"total_messages"`
	TotalTokens   int    `json:"total_tokens"`
	HasSummary    bool   `json:"has_summary"`
	SummaryAt     int    `json:"summary_at"`
	WindowSize    int    `json:"window_size"`
	SummaryThresh int    `json:"summary_thresh"`
}

// TruncateMessages 截断消息到指定长度
func (s *ConversationMemoryService) TruncateMessages(maxMessages int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if maxMessages <= 0 {
		maxMessages = 10
	}

	if len(s.messages) > maxMessages {
		// 保留最新的消息
		s.messages = s.messages[len(s.messages)-maxMessages:]
	}
}

// LoadFromHistory 从历史记录加载
func (s *ConversationMemoryService) LoadFromHistory(history []*MemoryMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.messages = make([]*MemoryMessage, len(history))
	copy(s.messages, history)
}

// AddUserMessage 添加用户消息
func (s *ConversationMemoryService) AddUserMessage(content string) {
	msg := &MemoryMessage{
		ID:        generateMessageID(),
		Role:      "user",
		Content:   content,
		Timestamp: time.Now(),
		Type:      MessageTypeUser,
	}
	s.Append(msg)
}

// AddAssistantMessage 添加助手消息
func (s *ConversationMemoryService) AddAssistantMessage(content string) {
	msg := &MemoryMessage{
		ID:        generateMessageID(),
		Role:      "assistant",
		Content:   content,
		Timestamp: time.Now(),
		Type:      MessageTypeAssistant,
	}
	s.Append(msg)
}

// AddToolMessage 添加工具消息
func (s *ConversationMemoryService) AddToolMessage(content string) {
	msg := &MemoryMessage{
		ID:        generateMessageID(),
		Role:      "tool",
		Content:   content,
		Timestamp: time.Now(),
		Type:      MessageTypeTool,
	}
	s.Append(msg)
}

// AddSystemMessage 添加系统消息
func (s *ConversationMemoryService) AddSystemMessage(content string) {
	msg := &MemoryMessage{
		ID:        generateMessageID(),
		Role:      "system",
		Content:   content,
		Timestamp: time.Now(),
		Type:      MessageTypeSystem,
	}
	s.Append(msg)
}

// generateMessageID 生成消息ID（已移至memory.go，避免重复声明）
// func generateMessageID() string {
// 	return time.Now().Format("20060102150405.000000")
// }
