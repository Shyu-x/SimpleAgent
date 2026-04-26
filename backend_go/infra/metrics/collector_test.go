package metrics

import (
	"testing"
	"time"
)

// TestNewCollector 测试创建指标收集器
func TestNewCollector(t *testing.T) {
	collector := NewCollector()
	if collector == nil {
		t.Fatal("expected non-nil collector")
	}
}

// TestRecordHTTPRequest 测试记录HTTP请求
func TestRecordHTTPRequest(t *testing.T) {
	collector := NewCollector()

	collector.RecordHTTPRequest("GET", "/api/chat", 200, 100*time.Millisecond)
	collector.RecordHTTPRequest("POST", "/api/chat", 201, 200*time.Millisecond)
	collector.RecordHTTPRequest("GET", "/api/chat", 500, 50*time.Millisecond)
}

// TestRecordAgentExecution 测试记录Agent执行
func TestRecordAgentExecution(t *testing.T) {
	collector := NewCollector()

	collector.RecordAgentExecution("agent1", "success", time.Second)
	collector.RecordAgentExecution("agent1", "failure", 500*time.Millisecond)
}

// TestRecordAgentToolCall 测试记录Agent工具调用
func TestRecordAgentToolCall(t *testing.T) {
	collector := NewCollector()

	collector.RecordAgentToolCall("agent1", "search", "success")
	collector.RecordAgentToolCall("agent1", "search", "failure")
	collector.RecordAgentToolCall("agent1", "calculate", "success")
}

// TestRecordRAGQuery 测试记录RAG查询
func TestRecordRAGQuery(t *testing.T) {
	collector := NewCollector()

	collector.RecordRAGQuery("success", 100*time.Millisecond, "semantic")
	collector.RecordRAGQuery("failure", 50*time.Millisecond, "keyword")
}

// TestRecordRAGRetrievalResults 测试记录RAG检索结果
func TestRecordRAGRetrievalResults(t *testing.T) {
	collector := NewCollector()

	collector.RecordRAGRetrievalResults("query1", 10)
	collector.RecordRAGRetrievalResults("query2", 5)
}

// TestRecordCircuitBreakerState 测试记录熔断器状态
func TestRecordCircuitBreakerState(t *testing.T) {
	collector := NewCollector()

	collector.RecordCircuitBreakerState("test_cb", 0) // Closed
	collector.RecordCircuitBreakerState("test_cb", 1) // Open
	collector.RecordCircuitBreakerState("test_cb", 2) // HalfOpen
}

// TestRecordCircuitBreakerEvent 测试记录熔断器事件
func TestRecordCircuitBreakerEvent(t *testing.T) {
	collector := NewCollector()

	collector.RecordCircuitBreakerEvent("test_cb", "failure")
	collector.RecordCircuitBreakerEvent("test_cb", "success")
	collector.RecordCircuitBreakerEvent("test_cb", "open")
	collector.RecordCircuitBreakerEvent("test_cb", "close")
}

// TestRecordRateLimiter 测试记录限流器
func TestRecordRateLimiter(t *testing.T) {
	collector := NewCollector()

	collector.RecordRateLimiterAllowed("limiter1")
	collector.RecordRateLimiterAllowed("limiter1")
	collector.RecordRateLimiterRejected("limiter1")
}

// TestStatusCodeToString 测试状态码转换
func TestStatusCodeToString(t *testing.T) {
	tests := []struct {
		code     int
		expected string
	}{
		{200, "2xx"},
		{201, "2xx"},
		{299, "2xx"},
		{301, "3xx"},
		{400, "4xx"},
		{404, "4xx"},
		{500, "5xx"},
		{503, "5xx"},
		{600, "unknown"},
		{100, "unknown"},
	}

	for _, tt := range tests {
		result := statusCodeToString(tt.code)
		if result != tt.expected {
			t.Errorf("statusCodeToString(%d): expected %s, got %s", tt.code, tt.expected, result)
		}
	}
}

// TestCollectorAllOperations 测试所有操作
func TestCollectorAllOperations(t *testing.T) {
	collector := NewCollector()

	// HTTP请求
	collector.RecordHTTPRequest("GET", "/api/test", 200, time.Millisecond)

	// Agent执行
	collector.RecordAgentExecution("agent1", "success", time.Second)
	collector.RecordAgentToolCall("agent1", "tool1", "success")

	// RAG查询
	collector.RecordRAGQuery("success", time.Second, "semantic")
	collector.RecordRAGRetrievalResults("query1", 5)

	// 熔断器
	collector.RecordCircuitBreakerState("cb1", 0)
	collector.RecordCircuitBreakerEvent("cb1", "failure")

	// 限流器
	collector.RecordRateLimiterAllowed("rl1")
	collector.RecordRateLimiterRejected("rl1")
}
