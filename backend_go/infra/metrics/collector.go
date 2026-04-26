package metrics

import (
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// Collector 指标收集器
type Collector struct {
	registry *prometheus.Registry

	// 请求指标
	httpRequestsTotal   *prometheus.CounterVec
	httpRequestDuration *prometheus.HistogramVec

	// Agent指标
	agentExecutionsTotal    *prometheus.CounterVec
	agentExecutionDuration *prometheus.HistogramVec
	agentToolCallsTotal    *prometheus.CounterVec

	// RAG指标
	ragQueriesTotal      *prometheus.CounterVec
	ragQueryDuration     *prometheus.HistogramVec
	ragRetrievalResults  *prometheus.GaugeVec

	// 熔断器指标
	circuitBreakerState  *prometheus.GaugeVec
	circuitBreakerEvents *prometheus.CounterVec

	// 限流器指标
	rateLimiterAllowed  *prometheus.CounterVec
	rateLimiterRejected *prometheus.CounterVec

	mu sync.RWMutex
}

// NewCollector 创建指标收集器
func NewCollector() *Collector {
	c := &Collector{
		registry: prometheus.NewRegistry(),
	}

	// HTTP请求指标
	c.httpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "endpoint", "status"},
	)
	c.registry.MustRegister(c.httpRequestsTotal)

	c.httpRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "endpoint"},
	)
	c.registry.MustRegister(c.httpRequestDuration)

	// Agent指标
	c.agentExecutionsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "agent_executions_total",
			Help: "Total number of agent executions",
		},
		[]string{"agent_id", "status"},
	)
	c.registry.MustRegister(c.agentExecutionsTotal)

	c.agentExecutionDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "agent_execution_duration_seconds",
			Help:    "Agent execution duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"agent_id"},
	)
	c.registry.MustRegister(c.agentExecutionDuration)

	c.agentToolCallsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "agent_tool_calls_total",
			Help: "Total number of agent tool calls",
		},
		[]string{"agent_id", "tool_name", "status"},
	)
	c.registry.MustRegister(c.agentToolCallsTotal)

	// RAG指标
	c.ragQueriesTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "rag_queries_total",
			Help: "Total number of RAG queries",
		},
		[]string{"status"},
	)
	c.registry.MustRegister(c.ragQueriesTotal)

	c.ragQueryDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "rag_query_duration_seconds",
			Help:    "RAG query duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"query_type"},
	)
	c.registry.MustRegister(c.ragQueryDuration)

	c.ragRetrievalResults = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "rag_retrieval_results",
			Help: "Number of RAG retrieval results",
		},
		[]string{"query_id"},
	)
	c.registry.MustRegister(c.ragRetrievalResults)

	// 熔断器指标
	c.circuitBreakerState = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "circuit_breaker_state",
			Help: "Circuit breaker state (0=closed, 1=open, 2=half-open)",
		},
		[]string{"name"},
	)
	c.registry.MustRegister(c.circuitBreakerState)

	c.circuitBreakerEvents = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "circuit_breaker_events_total",
			Help: "Total number of circuit breaker events",
		},
		[]string{"name", "event"},
	)
	c.registry.MustRegister(c.circuitBreakerEvents)

	// 限流器指标
	c.rateLimiterAllowed = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "rate_limiter_allowed_total",
			Help: "Total number of allowed requests by rate limiter",
		},
		[]string{"limiter_id"},
	)
	c.registry.MustRegister(c.rateLimiterAllowed)

	c.rateLimiterRejected = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "rate_limiter_rejected_total",
			Help: "Total number of rejected requests by rate limiter",
		},
		[]string{"limiter_id"},
	)
	c.registry.MustRegister(c.rateLimiterRejected)

	return c
}

// RecordHTTPRequest 记录HTTP请求
func (c *Collector) RecordHTTPRequest(method, endpoint string, status int, duration time.Duration) {
	c.httpRequestsTotal.WithLabelValues(method, endpoint, statusCodeToString(status)).Inc()
	c.httpRequestDuration.WithLabelValues(method, endpoint).Observe(duration.Seconds())
}

// RecordAgentExecution 记录Agent执行
func (c *Collector) RecordAgentExecution(agentID string, status string, duration time.Duration) {
	c.agentExecutionsTotal.WithLabelValues(agentID, status).Inc()
	c.agentExecutionDuration.WithLabelValues(agentID).Observe(duration.Seconds())
}

// RecordAgentToolCall 记录Agent工具调用
func (c *Collector) RecordAgentToolCall(agentID, toolName, status string) {
	c.agentToolCallsTotal.WithLabelValues(agentID, toolName, status).Inc()
}

// RecordRAGQuery 记录RAG查询
func (c *Collector) RecordRAGQuery(status string, duration time.Duration, queryType string) {
	c.ragQueriesTotal.WithLabelValues(status).Inc()
	c.ragQueryDuration.WithLabelValues(queryType).Observe(duration.Seconds())
}

// RecordRAGRetrievalResults 记录RAG检索结果数量
func (c *Collector) RecordRAGRetrievalResults(queryID string, count float64) {
	c.ragRetrievalResults.WithLabelValues(queryID).Set(count)
}

// RecordCircuitBreakerState 记录熔断器状态
func (c *Collector) RecordCircuitBreakerState(name string, state float64) {
	c.circuitBreakerState.WithLabelValues(name).Set(state)
}

// RecordCircuitBreakerEvent 记录熔断器事件
func (c *Collector) RecordCircuitBreakerEvent(name, event string) {
	c.circuitBreakerEvents.WithLabelValues(name, event).Inc()
}

// RecordRateLimiterAllowed 记录允许的请求
func (c *Collector) RecordRateLimiterAllowed(limiterID string) {
	c.rateLimiterAllowed.WithLabelValues(limiterID).Inc()
}

// RecordRateLimiterRejected 记录拒绝的请求
func (c *Collector) RecordRateLimiterRejected(limiterID string) {
	c.rateLimiterRejected.WithLabelValues(limiterID).Inc()
}

// statusCodeToString 将状态码转换为字符串标签
func statusCodeToString(code int) string {
	switch {
	case code >= 200 && code < 300:
		return "2xx"
	case code >= 300 && code < 400:
		return "3xx"
	case code >= 400 && code < 500:
		return "4xx"
	case code >= 500 && code < 600:
		return "5xx"
	default:
		return "unknown"
	}
}
