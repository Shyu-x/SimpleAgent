package agent

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/ai-chat/backend_go/internal/domain/model"
)

// MemoryMessage 记忆消息
type MemoryMessage struct {
	ID        string       `json:"id"`
	Role      string       `json:"role"`
	Content   string       `json:"content"`
	Timestamp time.Time    `json:"timestamp"`
	Tokens    int          `json:"tokens"`
	Type      MessageType  `json:"type"` // user, assistant, system, tool
}

// MessageType 消息类型
type MessageType string

const (
	MessageTypeUser     MessageType = "user"
	MessageTypeAssistant MessageType = "assistant"
	MessageTypeSystem   MessageType = "system"
	MessageTypeTool     MessageType = "tool"
)

// MemoryConfig 记忆配置
type MemoryConfig struct {
	WindowSize     int     // 滑动窗口大小
	MaxTokens      int     // 最大token数
	EnableSummary  bool    // 启用摘要
	SummaryThresh  int     // 摘要阈值
}

// MemoryStorage 记忆存储接口 (PostgreSQL)
type MemoryStorage interface {
	SaveMessages(ctx context.Context, sessionId string, messages []*MemoryMessage) error
	LoadMessages(ctx context.Context, sessionId string) ([]*MemoryMessage, error)
	DeleteMessages(ctx context.Context, sessionId string) error
}

// TokenCounter Token计数接口
type TokenCounter interface {
	Count(text string) int
}

// DefaultTokenCounter 默认Token计数器 (简单实现)
type DefaultTokenCounter struct{}

func (c *DefaultTokenCounter) Count(text string) int {
	// 简单估算: 1 token ≈ 4 字符
	return (len(text) + 3) / 4
}

// MemoryWindowManager 记忆窗口管理器 (支持PostgreSQL持久化)
type MemoryWindowManager struct {
	config       MemoryConfig
	messages     []*MemoryMessage
	mu           sync.RWMutex
	summary      string
	summaryAt    int            // 摘要位置
	storage      MemoryStorage  // PostgreSQL存储
	sessionId    string         // 会话ID
	tokenCounter TokenCounter   // Token计数器
}

// NewMemoryWindowManager 创建记忆窗口管理器
func NewMemoryWindowManager(config MemoryConfig) *MemoryWindowManager {
	return &MemoryWindowManager{
		config:       config,
		messages:     make([]*MemoryMessage, 0),
		summary:      "",
		summaryAt:    0,
		tokenCounter: &DefaultTokenCounter{},
	}
}

// NewMemoryWindowManagerWithStorage 创建带存储的记忆窗口管理器
func NewMemoryWindowManagerWithStorage(sessionId string, config MemoryConfig, storage MemoryStorage) *MemoryWindowManager {
	return &MemoryWindowManager{
		config:       config,
		messages:     make([]*MemoryMessage, 0),
		summary:      "",
		summaryAt:    0,
		storage:      storage,
		sessionId:    sessionId,
		tokenCounter: &DefaultTokenCounter{},
	}
}

// AddMessage 添加消息 (带Token计数)
func (m *MemoryWindowManager) AddMessage(msg *MemoryMessage) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 估算Token
	if msg.Tokens == 0 && m.tokenCounter != nil {
		msg.Tokens = m.tokenCounter.Count(msg.Content)
	}

	m.messages = append(m.messages, msg)
	m.maybeSummarize()

	// 异步保存到存储
	if m.storage != nil && m.sessionId != "" {
		go m.storage.SaveMessages(context.Background(), m.sessionId, m.messages)
	}
}

// AddUserMessage 添加用户消息
func (m *MemoryWindowManager) AddUserMessage(content string) {
	msg := &MemoryMessage{
		ID:        generateMessageID(),
		Role:      "user",
		Content:   content,
		Timestamp: time.Now(),
		Type:      MessageTypeUser,
	}
	m.AddMessage(msg)
}

// AddAssistantMessage 添加助手消息
func (m *MemoryWindowManager) AddAssistantMessage(content string) {
	msg := &MemoryMessage{
		ID:        generateMessageID(),
		Role:      "assistant",
		Content:   content,
		Timestamp: time.Now(),
		Type:      MessageTypeAssistant,
	}
	m.AddMessage(msg)
}

// AddToolMessage 添加工具消息
func (m *MemoryWindowManager) AddToolMessage(content string) {
	msg := &MemoryMessage{
		ID:        generateMessageID(),
		Role:      "tool",
		Content:   content,
		Timestamp: time.Now(),
		Type:      MessageTypeTool,
	}
	m.AddMessage(msg)
}

// GetMessages 获取消息列表
func (m *MemoryWindowManager) GetMessages() []model.Message {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []model.Message
	if m.summary != "" {
		result = append(result, model.Message{
			Role:    "system",
			Content: "之前的对话摘要: " + m.summary,
		})
	}

	windowSize := m.config.WindowSize
	if windowSize <= 0 {
		windowSize = 10
	}

	start := len(m.messages) - windowSize
	if start < 0 {
		start = 0
	}

	for _, msg := range m.messages[start:] {
		result = append(result, model.Message{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}
	return result
}

// GetAllMessages 获取所有消息（包括历史）
func (m *MemoryWindowManager) GetAllMessages() []*MemoryMessage {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.messages
}

// GetTotalTokens 获取总token数
func (m *MemoryWindowManager) GetTotalTokens() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	total := 0
	for _, msg := range m.messages {
		total += msg.Tokens
	}
	return total
}

// Clear 清空记忆
func (m *MemoryWindowManager) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages = make([]*MemoryMessage, 0)
	m.summary = ""
	m.summaryAt = 0

	// 清除存储中的记忆
	if m.storage != nil && m.sessionId != "" {
		go m.storage.DeleteMessages(context.Background(), m.sessionId)
	}
}

// maybeSummarize 检查是否需要摘要
func (m *MemoryWindowManager) maybeSummarize() {
	if !m.config.EnableSummary {
		return
	}

	totalTokens := m.GetTotalTokens()
	if totalTokens > m.config.SummaryThresh && m.summaryAt == 0 {
		// 需要摘要，标记位置
		m.summaryAt = len(m.messages) - m.config.WindowSize
	}
}

// SetSummary 设置摘要
func (m *MemoryWindowManager) SetSummary(summary string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.summary = summary
	m.summaryAt = len(m.messages)
}

// LoadFromStorage 从存储加载记忆
func (m *MemoryWindowManager) LoadFromStorage(ctx context.Context) error {
	if m.storage == nil || m.sessionId == "" {
		return nil
	}

	messages, err := m.storage.LoadMessages(ctx, m.sessionId)
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages = messages
	return nil
}

// SaveToStorage 保存记忆到存储
func (m *MemoryWindowManager) SaveToStorage(ctx context.Context) error {
	if m.storage == nil || m.sessionId == "" {
		return nil
	}

	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.storage.SaveMessages(ctx, m.sessionId, m.messages)
}

// generateMessageID 生成消息ID
func generateMessageID() string {
	return time.Now().Format("20060102150405") + "-" + randomString(8)
}

// randomString 生成随机字符串
func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
	}
	return string(b)
}

// SemanticMemory 语义记忆
type SemanticMemory struct {
	notes      map[string][]*SemanticNote
	mu         sync.RWMutex
	maxNotes   int
	storage    MemoryStorage
}

// SemanticNote 语义笔记
type SemanticNote struct {
	ID        string    `json:"id"`
	Content   string    `json:"content"`
	Category  string    `json:"category"`
	Tags      []string  `json:"tags"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// NewSemanticMemory 创建语义记忆
func NewSemanticMemory(maxNotes int) *SemanticMemory {
	if maxNotes <= 0 {
		maxNotes = 1000
	}
	return &SemanticMemory{
		notes:    make(map[string][]*SemanticNote),
		maxNotes: maxNotes,
	}
}

// NewSemanticMemoryWithStorage 创建带存储的语义记忆
func NewSemanticMemoryWithStorage(maxNotes int, storage MemoryStorage) *SemanticMemory {
	return &SemanticMemory{
		notes:    make(map[string][]*SemanticNote),
		maxNotes: maxNotes,
		storage:  storage,
	}
}

// AddNote 添加笔记
func (s *SemanticMemory) AddNote(note *SemanticNote) {
	s.mu.Lock()
	defer s.mu.Unlock()

	notes := s.notes[note.Category]
	notes = append(notes, note)

	// 限制数量
	if len(notes) > s.maxNotes {
		notes = notes[len(notes)-s.maxNotes:]
	}
	s.notes[note.Category] = notes
}

// GetNotesByCategory 获取分类下的笔记
func (s *SemanticMemory) GetNotesByCategory(category string) []*SemanticNote {
	s.mu.RLock()
	defer s.mu.RUnlock()
	notes := s.notes[category]
	result := make([]*SemanticNote, len(notes))
	copy(result, notes)
	return result
}

// SearchNotes 搜索笔记
func (s *SemanticMemory) SearchNotes(keyword string) []*SemanticNote {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*SemanticNote
	for _, notes := range s.notes {
		for _, note := range notes {
			if containsString(note.Content, keyword) || containsAnyString(note.Tags, keyword) {
				result = append(result, note)
			}
		}
	}
	return result
}

// MarshalJSON 序列化笔记
func (n *SemanticNote) MarshalJSON() ([]byte, error) {
	type Alias SemanticNote
	return json.Marshal((*Alias)(n))
}

// containsString 检查字符串是否包含子串
func containsString(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr) >= 0
}

// containsAnyString 检查字符串数组是否包含任意元素
func containsAnyString(arr []string, keyword string) bool {
	for _, s := range arr {
		if s == keyword {
			return true
		}
	}
	return false
}

// searchString 搜索字符串（简单实现）
func searchString(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
