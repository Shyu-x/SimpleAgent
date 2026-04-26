package benchmark

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// BenchmarkChatAPIConcurrentUsers 模拟并发用户聊天
func BenchmarkChatAPIConcurrentUsers(b *testing.B) {
	gin.SetMode(gin.TestMode)

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

		// 模拟处理延迟
		time.Sleep(10 * time.Millisecond)

		c.JSON(http.StatusOK, gin.H{
			"content": "Response content",
			"model":   req.Model,
		})
	})

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			reqBody := map[string]interface{}{
				"messages": []map[string]string{
					{"role": "user", "content": "Hello, how are you?"},
				},
				"model": "MiniMax-M2.7",
			}
			body, _ := json.Marshal(reqBody)

			req, _ := http.NewRequest("POST", "/api/chat", bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)
		}
	})
}

// BenchmarkChatAPIWithContext 模拟带上下文的聊天
func BenchmarkChatAPIWithContext(b *testing.B) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.POST("/api/chat", func(c *gin.Context) {
		var req struct {
			Messages []map[string]string `json:"messages"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// 模拟上下文处理
		_ = len(req.Messages) > 10

		c.JSON(http.StatusOK, gin.H{
			"content":      "Response",
			"messageCount": len(req.Messages),
		})
	})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		reqBody := map[string]interface{}{
			"messages": generateMessages(20),
		}
		body, _ := json.Marshal(reqBody)

		req, _ := http.NewRequest("POST", "/api/chat", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
	}
}

// BenchmarkChatAPIHistoryRetrieval 测试历史记录检索
func BenchmarkChatAPIHistoryRetrieval(b *testing.B) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.GET("/api/chat/history/:sessionId", func(c *gin.Context) {
		sessionId := c.Param("sessionId")

		// 模拟从存储获取历史
		messages := generateMessages(50)

		c.JSON(http.StatusOK, gin.H{
			"session": gin.H{
				"id":       sessionId,
				"messages": messages,
			},
		})
	})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req, _ := http.NewRequest("GET", "/api/chat/history/sess-123", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
	}
}

// BenchmarkChatAPISessionList 测试会话列表
func BenchmarkChatAPISessionList(b *testing.B) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.GET("/api/chat/sessions", func(c *gin.Context) {
		// 模拟返回多个会话
		sessions := make([]map[string]interface{}, 100)
		for i := 0; i < 100; i++ {
			sessions[i] = map[string]interface{}{
				"id":         "session-" + string(rune(i)),
				"messageCount": 10 + i%50,
				"created":    time.Now().Unix(),
			}
		}

		c.JSON(http.StatusOK, gin.H{"sessions": sessions})
	})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req, _ := http.NewRequest("GET", "/api/chat/sessions", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
	}
}

// BenchmarkChatMessageParsing 测试消息解析
func BenchmarkChatMessageParsing(b *testing.B) {
	messageJSON := `{
		"messages": [
			{"role": "system", "content": "You are a helpful assistant"},
			{"role": "user", "content": "What is AI?"},
			{"role": "assistant", "content": "AI stands for Artificial Intelligence"},
			{"role": "user", "content": "Tell me more"},
			{"role": "assistant", "content": "AI is a broad field of computer science..."}
		]
	}`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var req struct {
			Messages []map[string]string `json:"messages"`
		}
		json.Unmarshal([]byte(messageJSON), &req)
		_ = len(req.Messages)
	}
}

// BenchmarkChatResponseSerialization 测试响应序列化
func BenchmarkChatResponseSerialization(b *testing.B) {
	response := map[string]interface{}{
		"content":  "This is a detailed response from the AI assistant",
		"reasoning": "The user asked about AI, so I provided a comprehensive answer",
		"toolCalls": []map[string]string{
			{"name": "search", "args": "{}"},
		},
		"usage": map[string]int{
			"input_tokens":  50,
			"output_tokens": 100,
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := json.Marshal(response)
		if err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkChatSSEStreaming 测试SSE流式传输
func BenchmarkChatSSEStreaming(b *testing.B) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.GET("/api/chat/stream", func(c *gin.Context) {
		c.Header("Content-Type", "text/event-stream")

		// 模拟流式发送
		for i := 0; i < 10; i++ {
			c.SSEvent("", "data: chunk-"+string(rune(i))+"\n\n")
		}
	})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req, _ := http.NewRequest("GET", "/api/chat/stream", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)
	}
}

// BenchmarkChatTokenEstimation 测试Token估算
func BenchmarkChatTokenEstimation(b *testing.B) {
	text := "This is a sample text for token estimation testing. " +
		"It contains multiple sentences and should help benchmark " +
		"the token counting mechanism."

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		tokens := estimateTokens(text)
		_ = tokens
	}
}

// BenchmarkChatConcurrentRequests 模拟真实并发请求
func BenchmarkChatConcurrentRequests(b *testing.B) {
	gin.SetMode(gin.TestMode)

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

		// 模拟AI处理时间
		time.Sleep(5 * time.Millisecond)

		c.JSON(http.StatusOK, gin.H{
			"content": strings.Repeat("x", 100),
		})
	})

	// 模拟50个并发用户
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			reqBody := map[string]interface{}{
				"messages": generateMessages(5),
				"model":    "MiniMax-M2.7",
			}
			body, _ := json.Marshal(reqBody)

			req, _ := http.NewRequest("POST", "/api/chat", bytes.NewBuffer(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)
		}
	})
}

// 辅助函数

func generateMessages(count int) []map[string]string {
	messages := make([]map[string]string, count)
	for i := 0; i < count; i++ {
		role := "user"
		if i%2 == 1 {
			role = "assistant"
		}
		messages[i] = map[string]string{
			"role":    role,
			"content": "This is message content for testing purposes",
		}
	}
	return messages
}

// estimateTokens 简单Token估算 (中英文混合)
func estimateTokens(text string) int {
	// 简单估算: 中文按字符数，英文按空格分隔
	runeCount := 0
	wordCount := 0
	inWord := false

	for _, r := range text {
		runeCount++
		if r == ' ' || r == '\t' || r == '\n' {
			if inWord {
				wordCount++
				inWord = false
			}
		} else {
			inWord = true
		}
	}
	if inWord {
		wordCount++
	}

	// 估算: 中文约2字符=1 token, 英文约4字符=1 token
	return runeCount/2 + wordCount/4
}

// MockChatHandler 模拟聊天处理器
type MockChatHandler struct {
	ProcessingTime time.Duration
}

func (h *MockChatHandler) HandleChat(ctx context.Context, messages []string) (string, error) {
	time.Sleep(h.ProcessingTime)
	return "Mock response", nil
}
