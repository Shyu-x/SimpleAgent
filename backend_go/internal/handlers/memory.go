/**
 * Memory API 处理器
 * 处理笔记相关的 HTTP 请求
 * 与 Backend-Node Memory API 保持一致
 */

package handlers

import (
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Note 笔记结构
type Note struct {
	ID        string    `json:"id"`
	SessionID string    `json:"sessionId"`
	Content   string    `json:"content"`
	Type      string    `json:"type"`
	Importance string   `json:"importance"`
	Tags      []string  `json:"tags"`
	Embedding []float64 `json:"embedding,omitempty"`
	CreatedAt int64     `json:"createdAt"`
	UpdatedAt int64     `json:"updatedAt"`
}

// NoteListResponse 笔记列表响应
type NoteListResponse struct {
	Notes []Note `json:"notes"`
	Total int    `json:"total"`
}

// MemoryHandler Memory API 处理器
type MemoryHandler struct {
	notes      map[string]Note // key: noteID
	sessionNotes map[string][]Note // key: sessionID
	mu         sync.RWMutex
}

// NewMemoryHandler 创建Memory处理器
func NewMemoryHandler() *MemoryHandler {
	return &MemoryHandler{
		notes:        make(map[string]Note),
		sessionNotes: make(map[string][]Note),
	}
}

// CreateNoteRequest 创建笔记请求
type CreateNoteRequest struct {
	SessionID   string   `json:"sessionId" binding:"required"`
	Content     string   `json:"content" binding:"required"`
	Type        string   `json:"type"`
	Importance  string   `json:"importance"`
	Tags        []string `json:"tags"`
	Embedding   []float64 `json:"embedding"`
}

// UpdateNoteRequest 更新笔记请求
type UpdateNoteRequest struct {
	Content    string   `json:"content"`
	Type       string   `json:"type"`
	Importance string   `json:"importance"`
	Tags       []string `json:"tags"`
}

// RegisterRoutes 注册Memory路由
func (h *MemoryHandler) RegisterRoutes(router *gin.RouterGroup) {
	memory := router.Group("/memory")
	{
		// 笔记相关
		memory.POST("/note", h.CreateNote)
		memory.GET("/notes", h.ListNotes)
		memory.GET("/note/:id", h.GetNote)
		memory.PUT("/note/:id", h.UpdateNote)
		memory.DELETE("/note/:id", h.DeleteNote)

		// 会话笔记
		memory.GET("/sessions/:sessionId", h.GetSessionNotes)
	}
}

// CreateNote 创建笔记
// POST /api/memory/note
func (h *MemoryHandler) CreateNote(c *gin.Context) {
	var req CreateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}

	if req.Content == "" {
		BadRequestResponse(c, "参数错误", "content不能为空")
		return
	}

	// 设置默认值
	noteType := req.Type
	if noteType == "" {
		noteType = "short_term"
	}
	importance := req.Importance
	if importance == "" {
		importance = "medium"
	}
	tags := req.Tags
	if tags == nil {
		tags = []string{}
	}

	now := time.Now().UnixMilli()
	noteID := "note_" + strconv.FormatInt(now, 10) + "_" + randomString(9)

	note := Note{
		ID:         noteID,
		SessionID:  req.SessionID,
		Content:    req.Content,
		Type:       noteType,
		Importance: importance,
		Tags:       tags,
		Embedding:  req.Embedding,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	h.mu.Lock()
	h.notes[noteID] = note
	h.sessionNotes[req.SessionID] = append(h.sessionNotes[req.SessionID], note)
	h.mu.Unlock()

	SuccessResponse(c, note)
}

// ListNotes 获取笔记列表
// GET /api/memory/notes
// Query: ?sessionId=xxx&type=xxx&importance=xxx&limit=xxx&offset=xxx
func (h *MemoryHandler) ListNotes(c *gin.Context) {
	sessionID := c.Query("sessionId")
	noteType := c.Query("type")
	importance := c.Query("importance")
	limitStr := c.Query("limit")
	offsetStr := c.Query("offset")

	limit := 50
	offset := 0
	if l, err := strconv.Atoi(limitStr); err == nil {
		limit = l
	}
	if o, err := strconv.Atoi(offsetStr); err == nil {
		offset = o
	}

	h.mu.RLock()
	var filteredNotes []Note

	for _, note := range h.notes {
		if sessionID != "" && note.SessionID != sessionID {
			continue
		}
		if noteType != "" && note.Type != noteType {
			continue
		}
		if importance != "" && note.Importance != importance {
			continue
		}
		filteredNotes = append(filteredNotes, note)
	}
	h.mu.RUnlock()

	// 按更新时间倒序
	for i := 0; i < len(filteredNotes)-1; i++ {
		for j := i + 1; j < len(filteredNotes); j++ {
			if filteredNotes[j].UpdatedAt > filteredNotes[i].UpdatedAt {
				filteredNotes[i], filteredNotes[j] = filteredNotes[j], filteredNotes[i]
			}
		}
	}

	total := len(filteredNotes)

	// 分页
	if offset >= len(filteredNotes) {
		filteredNotes = []Note{}
	} else {
		end := offset + limit
		if end > len(filteredNotes) {
			end = len(filteredNotes)
		}
		filteredNotes = filteredNotes[offset:end]
	}

	SuccessResponse(c, NoteListResponse{
		Notes: filteredNotes,
		Total: total,
	})
}

// GetNote 获取单个笔记
// GET /api/memory/note/:id
func (h *MemoryHandler) GetNote(c *gin.Context) {
	id := c.Param("id")

	h.mu.RLock()
	note, exists := h.notes[id]
	h.mu.RUnlock()

	if !exists {
		NotFoundResponse(c, "笔记不存在", "未找到对应的笔记")
		return
	}

	SuccessResponse(c, note)
}

// UpdateNote 更新笔记
// PUT /api/memory/note/:id
func (h *MemoryHandler) UpdateNote(c *gin.Context) {
	id := c.Param("id")

	var req UpdateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}

	h.mu.Lock()
	note, exists := h.notes[id]
	if !exists {
		h.mu.Unlock()
		NotFoundResponse(c, "笔记不存在", "未找到对应的笔记")
		return
	}

	// 更新字段
	if req.Content != "" {
		note.Content = req.Content
	}
	if req.Type != "" {
		note.Type = req.Type
	}
	if req.Importance != "" {
		note.Importance = req.Importance
	}
	if req.Tags != nil {
		note.Tags = req.Tags
	}
	note.UpdatedAt = time.Now().UnixMilli()

	h.notes[id] = note

	// 更新会话笔记列表中的引用
	sessionID := note.SessionID
	if notes, ok := h.sessionNotes[sessionID]; ok {
		for i, n := range notes {
			if n.ID == id {
				notes[i] = note
				h.sessionNotes[sessionID] = notes
				break
			}
		}
	}
	h.mu.Unlock()

	SuccessResponse(c, note)
}

// DeleteNote 删除笔记
// DELETE /api/memory/note/:id
func (h *MemoryHandler) DeleteNote(c *gin.Context) {
	id := c.Param("id")

	h.mu.Lock()
	note, exists := h.notes[id]
	if !exists {
		h.mu.Unlock()
		NotFoundResponse(c, "笔记不存在", "未找到对应的笔记")
		return
	}

	delete(h.notes, id)

	// 从会话笔记列表中移除
	sessionID := note.SessionID
	if notes, ok := h.sessionNotes[sessionID]; ok {
		filtered := make([]Note, 0, len(notes))
		for _, n := range notes {
			if n.ID != id {
				filtered = append(filtered, n)
			}
		}
		h.sessionNotes[sessionID] = filtered
	}
	h.mu.Unlock()

	SuccessResponseWithMessage(c, "笔记已删除", gin.H{"deletedId": id})
}

// GetSessionNotes 获取指定会话的所有笔记
// GET /api/memory/sessions/:sessionId
func (h *MemoryHandler) GetSessionNotes(c *gin.Context) {
	sessionID := c.Param("sessionId")

	h.mu.RLock()
	notes := h.sessionNotes[sessionID]
	h.mu.RUnlock()

	// 深拷贝以避免并发问题
	result := make([]Note, len(notes))
	copy(result, notes)

	SuccessResponse(c, gin.H{
		"notes": result,
		"total": len(result),
	})
}

// NoteStatsResponse 笔记统计响应
type NoteStatsResponse struct {
	SessionCount      int            `json:"sessionCount"`
	TotalNotes        int            `json:"totalNotes"`
	NotesByType       map[string]int `json:"notesByType"`
	NotesByImportance map[string]int `json:"notesByImportance"`
}

// GetStats 获取统计信息
// GET /api/memory/stats
func (h *MemoryHandler) GetStats(c *gin.Context) {
	h.mu.RLock()

	sessionCount := len(h.sessionNotes)
	totalNotes := len(h.notes)

	notesByType := make(map[string]int)
	notesByImportance := make(map[string]int)

	for _, note := range h.notes {
		notesByType[note.Type]++
		notesByImportance[note.Importance]++
	}

	h.mu.RUnlock()

	SuccessResponse(c, NoteStatsResponse{
		SessionCount:      sessionCount,
		TotalNotes:        totalNotes,
		NotesByType:       notesByType,
		NotesByImportance: notesByImportance,
	})
}
