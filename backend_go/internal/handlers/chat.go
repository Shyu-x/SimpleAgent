/**
 * Chat API 处理器
 * 提供聊天相关的RESTful接口
 */

package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"sync"

	"github.com/gin-gonic/gin"

	"github.com/ai-chat/backend_go/internal/application"
	"github.com/ai-chat/backend_go/internal/common/errors"
	"github.com/ai-chat/backend_go/internal/domain/model"
)

// ChatHandler 聊天处理器
type ChatHandler struct {
	orchestrator *application.ChatOrchestrator
	sessions     sync.Map // sessionId -> *ChatSession
}

// ChatSession 聊天会话
type ChatSession struct {
	ID        string                 `json:"id"`
	Messages  []model.Message        `json:"messages"`
	CreatedAt int64                  `json:"created_at"`
	UpdatedAt int64                  `json:"updated_at"`
	Metadata  map[string]interface{} `json:"metadata"`
}

// ChatRequest 聊天请求
type ChatRequest struct {
	Messages []model.Message `json:"messages" binding:"required"`
	Model    string          `json:"model"`
	Stream   bool            `json:"stream"`
}

// ChatResponse 聊天响应
type ChatResponse struct {
	SessionID string          `json:"session_id,omitempty"`
	Response  string          `json:"response,omitempty"`
	Messages  []model.Message `json:"messages,omitempty"`
	Model     string          `json:"model,omitempty"`
	Tokens    int             `json:"tokens,omitempty"`
}

// NewChatHandler 创建聊天处理器
func NewChatHandler(orchestrator *application.ChatOrchestrator) *ChatHandler {
	return &ChatHandler{
		orchestrator: orchestrator,
	}
}

// HandleChat 处理聊天请求
// POST /api/chat 或 POST /api/v1/chat/completions
func (h *ChatHandler) HandleChat(c *gin.Context) {
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}

	// 验证消息
	if len(req.Messages) == 0 {
		BadRequestResponse(c, "参数错误", "messages不能为空")
		return
	}

	// 验证每条消息
	for i, msg := range req.Messages {
		if msg.Role == "" {
			BadRequestResponse(c, "参数错误", fmt.Sprintf("第%d条消息缺少role", i))
			return
		}
		if msg.Content == "" {
			BadRequestResponse(c, "参数错误", fmt.Sprintf("第%d条消息缺少content", i))
			return
		}
	}

	// 设置默认模型
	if req.Model == "" {
		req.Model = "MiniMax-M2.7"
	}

	// 如果请求stream，则使用流式处理
	if req.Stream {
		h.HandleStream(c)
		return
	}

	// 调用编排器处理
	result, err := h.orchestrator.Chat(c.Request.Context(), &application.ChatRequest{
		Messages: req.Messages,
		Model:    req.Model,
		Stream:   req.Stream,
	})

	if err != nil {
		if appErr, ok := err.(*errors.AppError); ok {
			ErrorResponseFromCode(c, appErr.HttpStatus, strconv.Itoa(appErr.Code), appErr.Message)
			return
		}
		InternalServerErrorResponse(c, "聊天服务错误: "+err.Error())
		return
	}

	SuccessResponse(c, result)
}

// HandleStream SSE流式聊天
// GET /api/chat/stream
func (h *ChatHandler) HandleStream(c *gin.Context) {
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// GET请求可能没有body，尝试从query获取
		req = ChatRequest{}
		req.Model = c.DefaultQuery("model", "MiniMax-M2.7")
	}

	// 如果没有消息体，从query参数构建
	if len(req.Messages) == 0 {
		content := c.Query("content")
		if content != "" {
			req.Messages = []model.Message{
				{Role: "user", Content: content},
			}
		}
	}

	if len(req.Messages) == 0 {
		BadRequestResponse(c, "参数错误", "messages不能为空")
		return
	}

	// 设置SSE头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// 设置默认模型
	if req.Model == "" {
		req.Model = "MiniMax-M2.7"
	}

	// 启动流式处理
	resultChan := make(chan string, 100)
	errorChan := make(chan error, 1)

	go func() {
		err := h.orchestrator.ChatStream(c.Request.Context(), &application.ChatRequest{
			Messages: req.Messages,
			Model:    req.Model,
			Stream:   true,
		}, resultChan)
		if err != nil {
			errorChan <- err
		}
		close(resultChan)
	}()

	// 流式发送响应
	c.Stream(func(w io.Writer) bool {
		select {
		case result, ok := <-resultChan:
			if !ok {
				return false
			}
			// SSE格式: data: {json}\n\n
			c.SSEvent("", result)
			return true
		case err := <-errorChan:
			c.SSEvent("error", err.Error())
			return false
		}
	})
}

// GetHistory 获取聊天历史
// GET /api/chat/history/:sessionId
func (h *ChatHandler) GetHistory(c *gin.Context) {
	sessionId := c.Param("sessionId")
	if sessionId == "" {
		BadRequestResponse(c, "参数错误", "sessionId不能为空")
		return
	}

	// 从会话存储获取历史
	if session, ok := h.sessions.Load(sessionId); ok {
		s := session.(*ChatSession)
		SuccessResponse(c, gin.H{
			"id":         s.ID,
			"messages":   s.Messages,
			"created_at": s.CreatedAt,
			"updated_at": s.UpdatedAt,
			"metadata":   s.Metadata,
		})
		return
	}

	// 如果编排器有历史记录，从编排器获取
	if h.orchestrator != nil {
		history, err := h.orchestrator.GetHistory(c.Request.Context(), sessionId)
		if err != nil {
			InternalServerErrorResponse(c, "获取历史记录失败: "+err.Error())
			return
		}
		SuccessResponse(c, history)
		return
	}

	NotFoundResponse(c, "会话不存在", "未找到对应的会话记录")
}

// ListSessions 获取会话列表
// GET /api/chat/sessions
func (h *ChatHandler) ListSessions(c *gin.Context) {
	sessions := make([]*ChatSession, 0)
	h.sessions.Range(func(key, value interface{}) bool {
		sessions = append(sessions, value.(*ChatSession))
		return true
	})

	SuccessResponse(c, gin.H{
		"sessions": sessions,
		"count":    len(sessions),
	})
}

// DeleteSession 删除会话
// DELETE /api/chat/session/:sessionId
func (h *ChatHandler) DeleteSession(c *gin.Context) {
	sessionId := c.Param("sessionId")
	if sessionId == "" {
		BadRequestResponse(c, "参数错误", "sessionId不能为空")
		return
	}

	if _, ok := h.sessions.LoadAndDelete(sessionId); ok {
		SuccessResponseWithMessage(c, "会话已删除", nil)
		return
	}

	NotFoundResponse(c, "会话不存在", "未找到对应的会话记录")
}

// MarshalJSON 序列化ChatSession
func (s *ChatSession) MarshalJSON() ([]byte, error) {
	type Alias ChatSession
	return json.Marshal((*Alias)(s))
}
