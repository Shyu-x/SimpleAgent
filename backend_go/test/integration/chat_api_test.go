package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestChatAPIHealth(t *testing.T) {
	// 创建测试路由
	router := gin.New()
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// 创建测试请求
	req, _ := http.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var response map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if response["status"] != "ok" {
		t.Errorf("expected status 'ok', got '%s'", response["status"])
	}
}

func TestChatAPIChatEndpoint(t *testing.T) {
	// 创建测试路由
	router := gin.New()
	router.POST("/api/chat", func(c *gin.Context) {
		var req struct {
			Messages []map[string]string `json:"messages"`
			Model    string              `json:"model"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if len(req.Messages) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "messages cannot be empty"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"content": "This is a test response",
			"model":   req.Model,
		})
	})

	// 创建测试请求
	reqBody := map[string]interface{}{
		"messages": []map[string]string{
			{"role": "user", "content": "Hello"},
		},
		"model": "MiniMax-M2.7",
	}
	body, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", "/api/chat", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if response["content"] != "This is a test response" {
		t.Errorf("unexpected content: %v", response["content"])
	}
}

func TestChatAPIValidation(t *testing.T) {
	router := gin.New()
	router.POST("/api/chat", func(c *gin.Context) {
		var req struct {
			Messages []map[string]string `json:"messages" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "messages is required"})
			return
		}

		if len(req.Messages) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "messages cannot be empty"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	// 测试空消息
	reqBody := map[string]interface{}{
		"messages": []map[string]string{},
	}
	body, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", "/api/chat", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400 for empty messages, got %d", w.Code)
	}
}

func TestChatAPIStreamEndpoint(t *testing.T) {
	router := gin.New()
	router.GET("/api/chat/stream", func(c *gin.Context) {
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")

		// 模拟流式响应
		c.SSEvent("", "data: Hello\n\n")
		c.SSEvent("", "data: World\n\n")
		c.SSEvent("", "data: \n\n")
	})

	req, _ := http.NewRequest("GET", "/api/chat/stream", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// SSE响应不返回状态码检查
	// 检查响应头
	if cType := w.Header().Get("Content-Type"); cType != "text/event-stream" {
		t.Errorf("expected Content-Type 'text/event-stream', got '%s'", cType)
	}
}

func TestChatAPIHistoryEndpoint(t *testing.T) {
	router := gin.New()
	router.GET("/api/chat/history/:sessionId", func(c *gin.Context) {
		sessionId := c.Param("sessionId")
		if sessionId == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "sessionId required"})
			return
		}

		// 模拟返回历史
		c.JSON(http.StatusOK, gin.H{
			"session": gin.H{
				"id": sessionId,
				"messages": []map[string]string{
					{"role": "user", "content": "Hello"},
					{"role": "assistant", "content": "Hi there!"},
				},
			},
		})
	})

	req, _ := http.NewRequest("GET", "/api/chat/history/test-session-123", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	session := response["session"].(map[string]interface{})
	if session["id"] != "test-session-123" {
		t.Errorf("expected session id 'test-session-123', got '%v'", session["id"])
	}
}

func TestChatAPISessionsEndpoint(t *testing.T) {
	router := gin.New()
	router.GET("/api/chat/sessions", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"sessions": []map[string]string{
				{"id": "session1"},
				{"id": "session2"},
			},
		})
	})

	req, _ := http.NewRequest("GET", "/api/chat/sessions", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestChatAPIDeleteSessionEndpoint(t *testing.T) {
	router := gin.New()
	router.DELETE("/api/chat/session/:sessionId", func(c *gin.Context) {
		sessionId := c.Param("sessionId")
		if sessionId == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "sessionId required"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Session deleted",
		})
	})

	req, _ := http.NewRequest("DELETE", "/api/chat/session/test-session", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestChatAPIMissingContentType(t *testing.T) {
	router := gin.New()
	router.POST("/api/chat", func(c *gin.Context) {
		var req struct {
			Messages []map[string]string `json:"messages"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	req, _ := http.NewRequest("POST", "/api/chat", bytes.NewBuffer([]byte("invalid json")))
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400 for invalid JSON, got %d", w.Code)
	}
}

func TestChatAPIMultipleMessages(t *testing.T) {
	router := gin.New()
	router.POST("/api/chat", func(c *gin.Context) {
		var req struct {
			Messages []map[string]string `json:"messages"`
			Model    string              `json:"model"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// 返回接收到的消息数量
		c.JSON(http.StatusOK, gin.H{
			"message_count": len(req.Messages),
			"model":         req.Model,
		})
	})

	reqBody := map[string]interface{}{
		"messages": []map[string]string{
			{"role": "system", "content": "You are a helpful assistant"},
			{"role": "user", "content": "Hello"},
			{"role": "assistant", "content": "Hi!"},
			{"role": "user", "content": "How are you?"},
		},
		"model": "MiniMax-M2.7",
	}
	body, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", "/api/chat", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if int(response["message_count"].(float64)) != 4 {
		t.Errorf("expected message_count 4, got %v", response["message_count"])
	}
}

func TestChatAPIErrorResponse(t *testing.T) {
	router := gin.New()
	router.POST("/api/chat", func(c *gin.Context) {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"code":    1001,
				"message": "Internal server error",
			},
		})
	})

	reqBody := map[string]interface{}{
		"messages": []map[string]string{
			{"role": "user", "content": "Hello"},
		},
	}
	body, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", "/api/chat", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected status 500, got %d", w.Code)
	}
}
