package agent

import (
	"sync"
	"time"
)

// SessionNote 会话笔记
type SessionNote struct {
	ID        string    `json:"id"`        // 笔记ID
	SessionID string    `json:"session_id"` // 会话ID
	Content   string    `json:"content"`   // 笔记内容
	Category  string    `json:"category"`  // 分类: important/todo/learn/memory
	Tags      []string  `json:"tags"`      // 标签
	CreatedAt time.Time `json:"created_at"` // 创建时间
}

// SessionNoteStore 会话笔记存储
type SessionNoteStore struct {
	notes    map[string][]*SessionNote // sessionID -> notes
	mu       sync.RWMutex
	maxNotes int
}

// NewSessionNoteStore 创建会话笔记存储
func NewSessionNoteStore(maxNotes int) *SessionNoteStore {
	if maxNotes <= 0 {
		maxNotes = 100
	}
	return &SessionNoteStore{
		notes:    make(map[string][]*SessionNote),
		maxNotes: maxNotes,
	}
}

// Add 添加笔记
func (s *SessionNoteStore) Add(sessionID string, note *SessionNote) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	note.ID = generateNoteID()
	note.SessionID = sessionID
	note.CreatedAt = time.Now()

	notes := s.notes[sessionID]
	notes = append(notes, note)

	// 限制数量
	if len(notes) > s.maxNotes {
		notes = notes[len(notes)-s.maxNotes:]
	}
	s.notes[sessionID] = notes

	return nil
}

// GetBySession 获取会话的所有笔记
func (s *SessionNoteStore) GetBySession(sessionID string) []*SessionNote {
	s.mu.RLock()
	defer s.mu.RUnlock()

	notes := s.notes[sessionID]
	result := make([]*SessionNote, len(notes))
	copy(result, notes)
	return result
}

// GetByCategory 获取指定分类的笔记
func (s *SessionNoteStore) GetByCategory(sessionID, category string) []*SessionNote {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*SessionNote
	for _, note := range s.notes[sessionID] {
		if note.Category == category {
			result = append(result, note)
		}
	}
	return result
}

// Search 搜索笔记
func (s *SessionNoteStore) Search(sessionID, keyword string) []*SessionNote {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*SessionNote
	for _, note := range s.notes[sessionID] {
		if containsContent(note.Content, keyword) || containsAnyTag(note.Tags, keyword) {
			result = append(result, note)
		}
	}
	return result
}

// Delete 删除笔记
func (s *SessionNoteStore) Delete(sessionID, noteID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	notes := s.notes[sessionID]
	for i, note := range notes {
		if note.ID == noteID {
			s.notes[sessionID] = append(notes[:i], notes[i+1:]...)
			return nil
		}
	}
	return ErrNoteNotFound
}

// Clear 清空会话笔记
func (s *SessionNoteStore) Clear(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.notes, sessionID)
}

// containsContent 检查内容是否包含关键词
func containsContent(content, keyword string) bool {
	if len(keyword) > len(content) {
		return false
	}
	for i := 0; i <= len(content)-len(keyword); i++ {
		if content[i:i+len(keyword)] == keyword {
			return true
		}
	}
	return false
}

// containsAnyTag 检查标签数组是否包含关键词
func containsAnyTag(tags []string, keyword string) bool {
	for _, tag := range tags {
		if tag == keyword {
			return true
		}
	}
	return false
}

// generateNoteID 生成笔记ID
func generateNoteID() string {
	return "note-" + time.Now().Format("20060102150405") + "-" + randomString(6)
}

// ErrNoteNotFound 笔记未找到
var ErrNoteNotFound = &NoteError{Message: "note not found"}

// NoteError 笔记错误
type NoteError struct {
	Message string
}

func (e *NoteError) Error() string {
	return e.Message
}

// SessionNoteTool 会话笔记工具
type SessionNoteTool struct {
	store *SessionNoteStore
}

// NewSessionNoteTool 创建会话笔记工具
func NewSessionNoteTool(maxNotes int) *SessionNoteTool {
	return &SessionNoteTool{
		store: NewSessionNoteStore(maxNotes),
	}
}

// RecordNote 记录笔记
func (t *SessionNoteTool) RecordNote(sessionID, content, category string, tags []string) error {
	note := &SessionNote{
		Content:  content,
		Category:  category,
		Tags:      tags,
	}
	return t.store.Add(sessionID, note)
}

// RecallNotes 回忆笔记
func (t *SessionNoteTool) RecallNotes(sessionID, category string) []*SessionNote {
	if category != "" {
		return t.store.GetByCategory(sessionID, category)
	}
	return t.store.GetBySession(sessionID)
}

// SearchNotes 搜索笔记
func (t *SessionNoteTool) SearchNotes(sessionID, keyword string) []*SessionNote {
	return t.store.Search(sessionID, keyword)
}

// DeleteNote 删除笔记
func (t *SessionNoteTool) DeleteNote(sessionID, noteID string) error {
	return t.store.Delete(sessionID, noteID)
}
