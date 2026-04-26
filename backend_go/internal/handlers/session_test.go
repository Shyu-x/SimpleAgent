package handlers

import (
	"sync"
	"testing"
	"time"

	"github.com/ai-chat/backend_go/internal/domain/model"
)

func TestChatSession(t *testing.T) {
	session := &ChatSession{
		ID:        "test-session-123",
		Messages:  []model.Message{},
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
		Metadata:  make(map[string]interface{}),
	}

	// 测试ID
	if session.ID != "test-session-123" {
		t.Errorf("expected ID test-session-123, got %s", session.ID)
	}

	// 测试消息添加
	session.Messages = append(session.Messages, model.Message{
		Role:    "user",
		Content: "Hello",
	})
	if len(session.Messages) != 1 {
		t.Errorf("expected 1 message, got %d", len(session.Messages))
	}

	// 测试Metadata
	session.Metadata["key"] = "value"
	if session.Metadata["key"] != "value" {
		t.Errorf("expected metadata value, got %v", session.Metadata["key"])
	}
}

func TestChatSessionMarshal(t *testing.T) {
	session := &ChatSession{
		ID:        "marshal-test",
		Messages:  []model.Message{{Role: "user", Content: "test"}},
		CreatedAt: 1234567890,
		UpdatedAt: 1234567890,
		Metadata:  map[string]interface{}{"test": "data"},
	}

	// 测试序列化
	data, err := session.MarshalJSON()
	if err != nil {
		t.Errorf("MarshalJSON failed: %v", err)
	}
	if len(data) == 0 {
		t.Error("expected non-empty JSON data")
	}
}

func TestSessionManager(t *testing.T) {
	manager := &sessionManager{
		sessions: sync.Map{},
	}

	sessionID := "session-001"
	session := &ChatSession{
		ID:        sessionID,
		Messages:  []model.Message{},
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}

	// 测试创建会话
	manager.Store(sessionID, session)
	if !manager.Exists(sessionID) {
		t.Error("expected session to exist after store")
	}

	// 测试获取会话
	retrieved, ok := manager.Load(sessionID)
	if !ok {
		t.Error("expected session to be loadable")
	}
	if retrieved.ID != sessionID {
		t.Errorf("expected ID %s, got %s", sessionID, retrieved.ID)
	}

	// 测试删除会话
	manager.Delete(sessionID)
	if manager.Exists(sessionID) {
		t.Error("expected session to not exist after delete")
	}

	// 测试不存在时加载
	_, ok = manager.Load("nonexistent")
	if ok {
		t.Error("expected no session for nonexistent key")
	}
}

func TestSessionManagerList(t *testing.T) {
	manager := &sessionManager{
		sessions: sync.Map{},
	}

	// 添加多个会话
	for i := 0; i < 5; i++ {
		session := &ChatSession{
			ID:        "session-" + string(rune('0'+i)),
			Messages:  []model.Message{},
			CreatedAt: time.Now().Unix(),
			UpdatedAt: time.Now().Unix(),
		}
		manager.Store(session.ID, session)
	}

	// 测试列表
	sessions := manager.List()
	if len(sessions) != 5 {
		t.Errorf("expected 5 sessions, got %d", len(sessions))
	}
}

func TestSessionManagerClear(t *testing.T) {
	manager := &sessionManager{
		sessions: sync.Map{},
	}

	// 添加会话
	for i := 0; i < 3; i++ {
		session := &ChatSession{
			ID:        "session-" + string(rune('0'+i)),
			Messages:  []model.Message{},
			CreatedAt: time.Now().Unix(),
			UpdatedAt: time.Now().Unix(),
		}
		manager.Store(session.ID, session)
	}

	// 测试清空
	manager.Clear()
	sessions := manager.List()
	if len(sessions) != 0 {
		t.Errorf("expected 0 sessions after clear, got %d", len(sessions))
	}
}

func TestConcurrentSessionAccess(t *testing.T) {
	manager := &sessionManager{
		sessions: sync.Map{},
	}

	sessionID := "concurrent-test"
	manager.Store(sessionID, &ChatSession{
		ID:        sessionID,
		Messages:  []model.Message{},
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	})

	// 并发读写测试
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			id := sessionID
			if idx%2 == 0 {
				manager.Store(id, &ChatSession{
					ID:        id,
					Messages:  []model.Message{},
					CreatedAt: time.Now().Unix(),
					UpdatedAt: time.Now().Unix(),
				})
			} else {
				manager.Load(id)
			}
		}(i)
	}
	wg.Wait()

	// 验证会话仍然存在
	if !manager.Exists(sessionID) {
		t.Error("session should still exist after concurrent access")
	}
}

func TestSessionMessageHistory(t *testing.T) {
	session := &ChatSession{
		ID:        "history-test",
		Messages:  []model.Message{},
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}

	// 添加用户消息
	session.Messages = append(session.Messages, model.Message{
		Role:    "user",
		Content: "Hello AI",
	})

	// 添加助手回复
	session.Messages = append(session.Messages, model.Message{
		Role:    "assistant",
		Content: "Hello! How can I help you?",
	})

	// 验证消息历史
	if len(session.Messages) != 2 {
		t.Errorf("expected 2 messages, got %d", len(session.Messages))
	}
	if session.Messages[0].Role != "user" {
		t.Errorf("expected first message role user, got %s", session.Messages[0].Role)
	}
	if session.Messages[1].Role != "assistant" {
		t.Errorf("expected second message role assistant, got %s", session.Messages[1].Role)
	}
}

// sessionManager 简化版会话管理器(用于测试)
type sessionManager struct {
	sessions sync.Map
}

func (m *sessionManager) Store(id string, session *ChatSession) {
	m.sessions.Store(id, session)
}

func (m *sessionManager) Load(id string) (*ChatSession, bool) {
	val, ok := m.sessions.Load(id)
	if !ok {
		return nil, false
	}
	return val.(*ChatSession), true
}

func (m *sessionManager) Delete(id string) {
	m.sessions.Delete(id)
}

func (m *sessionManager) Exists(id string) bool {
	_, ok := m.sessions.Load(id)
	return ok
}

func (m *sessionManager) List() []*ChatSession {
	sessions := make([]*ChatSession, 0)
	m.sessions.Range(func(key, value interface{}) bool {
		sessions = append(sessions, value.(*ChatSession))
		return true
	})
	return sessions
}

func (m *sessionManager) Clear() {
	m.sessions.Range(func(key, value interface{}) bool {
		m.sessions.Delete(key)
		return true
	})
}
