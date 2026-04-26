/**
 * 聊天编排器 (增强版)
 * 支持:
 * - SSE流式响应
 * - 取消机制 (context)
 * - 超时控制
 * - PostgreSQL持久化存储
 * - Redis缓存
 */

package application

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/ai-chat/backend_go/internal/common/errors"
	"github.com/ai-chat/backend_go/internal/domain/model"
	"github.com/ai-chat/backend_go/pkg/minimax"
)

// Storage 存储接口 (PostgreSQL)
type Storage interface {
	SaveSession(ctx context.Context, session *ChatSessionData) error
	LoadSession(ctx context.Context, sessionId string) (*ChatSessionData, error)
	DeleteSession(ctx context.Context, sessionId string) error
	ListSessions(ctx context.Context, limit, offset int) ([]*ChatSessionData, error)
}

// Cache 缓存接口 (Redis)
type Cache interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key string, value string, ttl time.Duration) error
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) (bool, error)
}

// ChatOrchestrator 聊天编排器 (增强版)
type ChatOrchestrator struct {
	client       *minimax.Client
	sessions     sync.Map // sessionId -> *ChatSessionData (内存缓存)
	storage      Storage  // PostgreSQL持久化
	cache        Cache    // Redis缓存
	maxMessages  int
	timeout      time.Duration
	enableCache  bool
	enablePersist bool
}

// ChatSessionData 会话数据
type ChatSessionData struct {
	ID        string            `json:"id"`
	Messages  []model.Message  `json:"messages"`
	CreatedAt int64             `json:"created_at"`
	UpdatedAt int64             `json:"updated_at"`
	Metadata  map[string]interface{} `json:"metadata"`
	mu        sync.Mutex        `json:"-"`
}

// ChatRequest 聊天请求
type ChatRequest struct {
	SessionID  string           `json:"session_id,omitempty"`
	Messages   []model.Message  `json:"messages"`
	Model      string           `json:"model"`
	Stream     bool             `json:"stream"`
	Timeout    time.Duration    `json:"timeout,omitempty"`
	CancelFunc context.CancelFunc `json:"-"` // 取消函数
}

// ChatResponse 聊天响应
type ChatResponse struct {
	ID      string        `json:"id"`
	Model   string        `json:"model"`
	Choices []ChatChoice  `json:"choices"`
	Usage   model.Usage   `json:"usage"`
}

// ChatChoice 聊天选项
type ChatChoice struct {
	Index        int           `json:"index"`
	Message      model.Message `json:"message"`
	FinishReason string        `json:"finish_reason"`
}

// ChatOrchestratorConfig 编排器配置
type ChatOrchestratorConfig struct {
	MaxMessages   int           // 最大消息数
	Timeout       time.Duration // 默认超时时间
	EnableCache   bool          // 启用Redis缓存
	EnablePersist bool          // 启用PostgreSQL持久化
}

// NewChatOrchestrator 创建聊天编排器 (基础版)
func NewChatOrchestrator(client *minimax.Client) *ChatOrchestrator {
	return &ChatOrchestrator{
		client:      client,
		maxMessages: 100,
		timeout:     60 * time.Second,
	}
}

// NewChatOrchestratorWithConfig 创建带配置的聊天编排器
func NewChatOrchestratorWithConfig(client *minimax.Client, config ChatOrchestratorConfig) *ChatOrchestrator {
	if config.MaxMessages <= 0 {
		config.MaxMessages = 100
	}
	if config.Timeout <= 0 {
		config.Timeout = 60 * time.Second
	}
	return &ChatOrchestrator{
		client:       client,
		maxMessages:  config.MaxMessages,
		timeout:      config.Timeout,
		enableCache:  config.EnableCache,
	}
}

// NewChatOrchestratorWithDeps 创建带依赖的聊天编排器
func NewChatOrchestratorWithDeps(client *minimax.Client, storage Storage, cache Cache, config ChatOrchestratorConfig) *ChatOrchestrator {
	if config.MaxMessages <= 0 {
		config.MaxMessages = 100
	}
	if config.Timeout <= 0 {
		config.Timeout = 60 * time.Second
	}
	return &ChatOrchestrator{
		client:        client,
		storage:       storage,
		cache:         cache,
		maxMessages:   config.MaxMessages,
		timeout:       config.Timeout,
		enableCache:   config.EnableCache,
		enablePersist: config.EnablePersist,
	}
}

// Chat 处理聊天请求 (带超时和取消支持)
func (c *ChatOrchestrator) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	// 验证请求
	if len(req.Messages) == 0 {
		return nil, errors.ErrInvalidParameter("messages不能为空")
	}

	// 创建超时上下文
	timeout := c.timeout
	if req.Timeout > 0 {
		timeout = req.Timeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// 获取会话ID
	sessionId := req.SessionID
	if sessionId == "" {
		sessionId = req.Messages[0].Role // 使用第一条消息的role作为session标识
	}

	// 加载会话 (优先缓存 -> PostgreSQL -> 内存)
	session, err := c.loadSession(ctx, sessionId)
	if err != nil {
		// 创建新会话
		session = c.newSession(sessionId)
	}

	session.mu.Lock()
	defer session.mu.Unlock()

	// 添加用户消息
	session.Messages = append(session.Messages, req.Messages...)
	session.UpdatedAt = nowMillis()

	// 限制消息数量
	if len(session.Messages) > c.maxMessages {
		session.Messages = session.Messages[len(session.Messages)-c.maxMessages:]
	}

	// 调用MiniMax API
	resp, err := c.client.Chat(ctx, session.Messages)
	if err != nil {
		return nil, errors.ErrModel("MiniMax API调用失败", err)
	}

	// 添加助手消息到会话
	assistantMessage := model.Message{
		Role:    "assistant",
		Content: resp.Content,
	}
	session.Messages = append(session.Messages, assistantMessage)

	// 保存会话
	c.saveSession(ctx, session)

	return &ChatResponse{
		ID:      session.ID,
		Model:   req.Model,
		Choices: []ChatChoice{{
			Index:        0,
			Message:      assistantMessage,
			FinishReason: "stop",
		}},
		Usage: resp.Usage,
	}, nil
}

// ChatStream 流式聊天 (SSE支持)
func (c *ChatOrchestrator) ChatStream(ctx context.Context, req *ChatRequest, resultChan chan<- string) error {
	if len(req.Messages) == 0 {
		return errors.ErrInvalidParameter("messages不能为空")
	}

	// 创建超时上下文
	timeout := c.timeout
	if req.Timeout > 0 {
		timeout = req.Timeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	sessionId := req.SessionID
	if sessionId == "" {
		sessionId = req.Messages[0].Role
	}

	session, err := c.loadSession(ctx, sessionId)
	if err != nil {
		session = c.newSession(sessionId)
	}

	session.mu.Lock()
	session.Messages = append(session.Messages, req.Messages...)
	session.UpdatedAt = nowMillis()
	session.mu.Unlock()

	// 流式调用
	err = c.client.Stream(ctx, session.Messages, func(resp *model.Response) {
		resultChan <- resp.Content
	})

	if err != nil {
		return err
	}

	// 保存会话
	c.saveSession(ctx, session)
	return nil
}

// SSEStream SSE流式聊天 (支持取消)
func (c *ChatOrchestrator) SSEStream(ctx context.Context, req *ChatRequest, sseChan chan<- SSEvent) error {
	if len(req.Messages) == 0 {
		return errors.ErrInvalidParameter("messages不能为空")
	}

	// 创建带取消的上下文
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	sessionId := req.SessionID
	if sessionId == "" {
		sessionId = req.Messages[0].Role
	}

	session, err := c.loadSession(ctx, sessionId)
	if err != nil {
		session = c.newSession(sessionId)
	}

	session.mu.Lock()
	session.Messages = append(session.Messages, req.Messages...)
	session.UpdatedAt = nowMillis()
	session.mu.Unlock()

	// 发送SSE事件
	sendSSEvent(sseChan, "session_id", session.ID)

	var fullContent string
	err = c.client.Stream(ctx, session.Messages, func(resp *model.Response) {
		fullContent += resp.Content
		sendSSEvent(sseChan, "content", resp.Content)
		if resp.ReasoningContent != "" {
			sendSSEvent(sseChan, "reasoning", resp.ReasoningContent)
		}
	})

	if err != nil {
		sendSSEvent(sseChan, "error", err.Error())
		return err
	}

	// 保存会话
	c.saveSession(ctx, session)

	// 发送完成事件
	sendSSEvent(sseChan, "done", "")

	return nil
}

// Cancel 取消指定会话的请求
func (c *ChatOrchestrator) Cancel(sessionId string) {
	if session, ok := c.sessions.Load(sessionId); ok {
		s := session.(*ChatSessionData)
		s.mu.Lock()
		if s.Metadata != nil {
			if cancel, ok := s.Metadata["cancelFunc"].(context.CancelFunc); ok {
				cancel()
			}
		}
		s.mu.Unlock()
	}
}

// GetHistory 获取历史记录
func (c *ChatOrchestrator) GetHistory(ctx context.Context, sessionId string) (*ChatSessionData, error) {
	session, err := c.loadSession(ctx, sessionId)
	if err != nil {
		return nil, errors.ErrNotFound.WithDetail("会话不存在")
	}
	return session, nil
}

// DeleteSession 删除会话
func (c *ChatOrchestrator) DeleteSession(ctx context.Context, sessionId string) bool {
	// 从内存删除
	_, ok := c.sessions.LoadAndDelete(sessionId)

	// 从缓存删除
	if c.cache != nil {
		c.cache.Delete(ctx, "session:"+sessionId)
	}

	// 从存储删除
	if c.storage != nil {
		c.storage.DeleteSession(ctx, sessionId)
	}

	return ok
}

// ListSessions 列出所有会话
func (c *ChatOrchestrator) ListSessions(ctx context.Context, limit, offset int) ([]*ChatSessionData, error) {
	if c.storage != nil {
		return c.storage.ListSessions(ctx, limit, offset)
	}

	// 内存中列举
	sessions := make([]*ChatSessionData, 0)
	c.sessions.Range(func(key, value interface{}) bool {
		sessions = append(sessions, value.(*ChatSessionData))
		return true
	})

	if offset >= len(sessions) {
		return []*ChatSessionData{}, nil
	}
	end := offset + limit
	if end > len(sessions) {
		end = len(sessions)
	}
	return sessions[offset:end], nil
}

// loadSession 加载会话 (缓存 -> 存储 -> 内存)
func (c *ChatOrchestrator) loadSession(ctx context.Context, sessionId string) (*ChatSessionData, error) {
	// 1. 尝试从缓存加载
	if c.cache != nil && c.enableCache {
		cacheKey := "session:" + sessionId
		if data, err := c.cache.Get(ctx, cacheKey); err == nil {
			var session ChatSessionData
			if json.Unmarshal([]byte(data), &session) == nil {
				// 更新到内存
				c.sessions.Store(sessionId, &session)
				return &session, nil
			}
		}
	}

	// 2. 尝试从存储加载
	if c.storage != nil && c.enablePersist {
		if session, err := c.storage.LoadSession(ctx, sessionId); err == nil {
			// 更新到缓存和内存
			c.sessions.Store(sessionId, session)
			c.cacheSession(ctx, session)
			return session, nil
		}
	}

	// 3. 从内存加载
	if session, ok := c.sessions.Load(sessionId); ok {
		return session.(*ChatSessionData), nil
	}

	return nil, errors.ErrNotFound.WithDetail("会话不存在")
}

// saveSession 保存会话 (内存 -> 缓存 -> 存储)
func (c *ChatOrchestrator) saveSession(ctx context.Context, session *ChatSessionData) {
	// 更新到内存
	c.sessions.Store(session.ID, session)

	// 更新到缓存
	if c.cache != nil && c.enableCache {
		c.cacheSession(ctx, session)
	}

	// 更新到存储
	if c.storage != nil && c.enablePersist {
		go c.storage.SaveSession(ctx, session) // 异步保存
	}
}

// cacheSession 缓存会话
func (c *ChatOrchestrator) cacheSession(ctx context.Context, session *ChatSessionData) {
	if data, err := json.Marshal(session); err == nil {
		c.cache.Set(ctx, "session:"+session.ID, string(data), 30*time.Minute)
	}
}

// newSession 创建新会话
func (c *ChatOrchestrator) newSession(id string) *ChatSessionData {
	return &ChatSessionData{
		ID:        id,
		Messages:  make([]model.Message, 0),
		CreatedAt: nowMillis(),
		UpdatedAt: nowMillis(),
		Metadata:  make(map[string]interface{}),
	}
}

// SSEvent SSE事件
type SSEvent struct {
	Event string `json:"event"`
	Data  string `json:"data"`
}

// sendSSEvent 发送SSE事件
func sendSSEvent(ch chan<- SSEvent, event, data string) {
	select {
	case ch <- SSEvent{Event: event, Data: data}:
	default:
	}
}

// nowMillis 获取当前毫秒时间戳
func nowMillis() int64 {
	return time.Now().UnixMilli()
}

// MarshalJSON 序列化会话数据
func (s *ChatSessionData) MarshalJSON() ([]byte, error) {
	type Alias ChatSessionData
	return json.Marshal((*Alias)(s))
}
