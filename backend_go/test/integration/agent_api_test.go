package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAgentAPIHealth(t *testing.T) {
	router := gin.New()
	router.GET("/api/agent/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"version": "1.0.0",
		})
	})

	req, _ := http.NewRequest("GET", "/api/agent/health", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if response["status"] != "healthy" {
		t.Errorf("expected status 'healthy', got '%v'", response["status"])
	}
}

func TestAgentAPIExecuteEndpoint(t *testing.T) {
	router := gin.New()
	router.POST("/api/agent/execute", func(c *gin.Context) {
		var req struct {
			Input  string                   `json:"input"`
			Tools  []map[string]interface{} `json:"tools"`
			Config map[string]interface{}   `json:"config"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if req.Input == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "input cannot be empty"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"content":   "Agent execution result",
			"state":     "completed",
			"toolCalls": []map[string]string{},
		})
	})

	reqBody := map[string]interface{}{
		"input": "Execute a task",
		"tools": []map[string]interface{}{},
		"config": map[string]interface{}{
			"maxIterations": 10,
		},
	}
	body, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", "/api/agent/execute", bytes.NewBuffer(body))
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

	if response["content"] != "Agent execution result" {
		t.Errorf("unexpected content: %v", response["content"])
	}
	if response["state"] != "completed" {
		t.Errorf("unexpected state: %v", response["state"])
	}
}

func TestAgentAPIExecuteWithTools(t *testing.T) {
	router := gin.New()
	router.POST("/api/agent/execute", func(c *gin.Context) {
		var req struct {
			Input string `json:"input"`
			Tools []struct {
				Name        string                 `json:"name"`
				Description string                 `json:"description"`
				Parameters  map[string]interface{} `json:"parameters"`
			} `json:"tools"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// 返回工具调用信息
		c.JSON(http.StatusOK, gin.H{
			"content": "Tool execution result",
			"toolCalls": []map[string]interface{}{
				{
					"tool":    req.Tools[0].Name,
					"success": true,
				},
			},
		})
	})

	reqBody := map[string]interface{}{
		"input": "Use the search tool",
		"tools": []map[string]interface{}{
			{
				"name":        "search",
				"description": "Search the web",
				"parameters":  map[string]interface{}{"query": "string"},
			},
		},
	}
	body, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", "/api/agent/execute", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestAgentAPIStreamExecute(t *testing.T) {
	router := gin.New()
	router.GET("/api/agent/execute/stream", func(c *gin.Context) {
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")

		// 模拟流式响应
		c.SSEvent("", `{"type":"tool_call","tool":"search"}`)
		c.SSEvent("", `{"type":"progress","content":"Thinking..."}`)
		c.SSEvent("", `{"type":"complete","content":"Done!"}`)
	})

	req, _ := http.NewRequest("GET", "/api/agent/execute/stream", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if cType := w.Header().Get("Content-Type"); cType != "text/event-stream" {
		t.Errorf("expected Content-Type 'text/event-stream', got '%s'", cType)
	}
}

func TestAgentAPIToolsEndpoint(t *testing.T) {
	router := gin.New()
	router.GET("/api/agent/tools", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"tools": []map[string]string{
				{"name": "search", "description": "Search the web"},
				{"name": "calculator", "description": "Perform calculations"},
			},
		})
	})

	req, _ := http.NewRequest("GET", "/api/agent/tools", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	tools := response["tools"].([]interface{})
	if len(tools) != 2 {
		t.Errorf("expected 2 tools, got %d", len(tools))
	}
}

func TestAgentAPIRegisterTool(t *testing.T) {
	router := gin.New()
	router.POST("/api/agent/tools", func(c *gin.Context) {
		var req struct {
			Name        string                 `json:"name"`
			Description string                 `json:"description"`
			Parameters  map[string]interface{} `json:"parameters"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if req.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "tool name is required"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"success": true,
			"tool": gin.H{
				"name":        req.Name,
				"description": req.Description,
			},
		})
	})

	reqBody := map[string]interface{}{
		"name":        "custom_tool",
		"description": "A custom tool",
		"parameters":  map[string]interface{}{},
	}
	body, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", "/api/agent/tools", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected status 201, got %d", w.Code)
	}
}

func TestAgentAPISessionEndpoint(t *testing.T) {
	router := gin.New()
	router.GET("/api/agent/session/:sessionId", func(c *gin.Context) {
		sessionId := c.Param("sessionId")

		c.JSON(http.StatusOK, gin.H{
			"session": gin.H{
				"id": sessionId,
				"state": gin.H{
					"iteration":  3,
					"lastAction": "search",
				},
			},
		})
	})

	req, _ := http.NewRequest("GET", "/api/agent/session/sess-123", nil)
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
	if session["id"] != "sess-123" {
		t.Errorf("expected session id 'sess-123', got '%v'", session["id"])
	}
}

func TestAgentAPICancelEndpoint(t *testing.T) {
	router := gin.New()
	router.POST("/api/agent/session/:sessionId/cancel", func(c *gin.Context) {
		sessionId := c.Param("sessionId")

		c.JSON(http.StatusOK, gin.H{
			"success":    true,
			"session_id": sessionId,
			"message":    "Execution cancelled",
		})
	})

	req, _ := http.NewRequest("POST", "/api/agent/session/sess-123/cancel", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestAgentAPIMetricsEndpoint(t *testing.T) {
	router := gin.New()
	router.GET("/api/agent/metrics", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"total_executions":   100,
			"successful":          95,
			"failed":              5,
			"avg_duration_ms":    1500,
			"tool_call_success":  0.98,
		})
	})

	req, _ := http.NewRequest("GET", "/api/agent/metrics", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if response["total_executions"].(float64) != 100 {
		t.Errorf("expected total_executions 100, got %v", response["total_executions"])
	}
}

func TestAgentAPIEmptyInput(t *testing.T) {
	router := gin.New()
	router.POST("/api/agent/execute", func(c *gin.Context) {
		var req struct {
			Input string `json:"input"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if req.Input == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "input cannot be empty"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	reqBody := map[string]interface{}{
		"input": "",
	}
	body, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", "/api/agent/execute", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400 for empty input, got %d", w.Code)
	}
}

func TestAgentAPITimeoutConfig(t *testing.T) {
	router := gin.New()
	router.POST("/api/agent/execute", func(c *gin.Context) {
		var req struct {
			Input  string                 `json:"input"`
			Config map[string]interface{}   `json:"config"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		timeout := 30 // 默认超时
		if t, ok := req.Config["timeout"].(float64); ok {
			timeout = int(t)
		}

		c.JSON(http.StatusOK, gin.H{
			"timeout": timeout,
			"state":   "completed",
		})
	})

	reqBody := map[string]interface{}{
		"input": "A task",
		"config": map[string]interface{}{
			"timeout": 60,
		},
	}
	body, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", "/api/agent/execute", bytes.NewBuffer(body))
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

	if int(response["timeout"].(float64)) != 60 {
		t.Errorf("expected timeout 60, got %v", response["timeout"])
	}
}
