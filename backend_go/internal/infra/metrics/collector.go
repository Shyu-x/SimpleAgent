// Package metrics 指标采集
// Prometheus格式指标，支持HTTP请求、熔断器、限流器、RAG查询等
package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Collector 指标采集器
type Collector struct {
	registry         *prometheus.Registry
	httpRequestsTotal   *prometheus.CounterVec
	httpRequestDuration *prometheus.HistogramVec
	activeConnections   prometheus.Gauge

	// Agent指标
	agentActiveCount prometheus.Gauge
	agentToolCalls   *prometheus.CounterVec
	agentErrors      *prometheus.CounterVec

	// SSE指标
	sseConnections prometheus.Gauge
	sseMessages    *prometheus.CounterVec

	// 熔断器指标
	circuitBreakerState *prometheus.GaugeVec

	// 限流器指标
	rateLimitRemaining *prometheus.GaugeVec
	rateLimitAllowed   *prometheus.CounterVec
	rateLimitRejected  *prometheus.CounterVec

	// RAG指标
	ragQueryDuration *prometheus.HistogramVec
	ragQueryTotal    *prometheus.CounterVec
	ragQueryErrors   *prometheus.CounterVec

	// 队列指标
	queueSize        *prometheus.GaugeVec
	queueEnqueued    *prometheus.CounterVec
	queueDequeued    *prometheus.CounterVec
	queueExpired     *prometheus.CounterVec

	// 向量搜索指标
	vectorSearchDuration *prometheus.HistogramVec
	vectorSearchTotal    *prometheus.CounterVec

	// MCP指标
	mcpToolCalls   *prometheus.CounterVec
	mcpToolErrors  *prometheus.CounterVec
	mcpConnections prometheus.Gauge
}

// NewCollector 创建采集器（使用自定义注册表避免重复注册）
func NewCollector() *Collector {
	registry := prometheus.NewRegistry()

	c := &Collector{
		registry: registry,
	}

	// 注册默认指标（使用自定义注册表）
	registry.MustRegister(prometheus.NewProcessCollector(prometheus.ProcessCollectorOpts{}))
	registry.MustRegister(prometheus.NewGoCollector())

	// HTTP指标
	c.httpRequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total number of HTTP requests",
	}, []string{"method", "path", "status"})
	registry.MustRegister(c.httpRequestsTotal)

	c.httpRequestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP request duration in seconds",
		Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
	}, []string{"method", "path"})
	registry.MustRegister(c.httpRequestDuration)

	c.activeConnections = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "active_connections",
		Help: "Number of active HTTP connections",
	})
	registry.MustRegister(c.activeConnections)

	// Agent指标
	c.agentActiveCount = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "agent_active_count",
		Help: "Number of active agents",
	})
	registry.MustRegister(c.agentActiveCount)

	c.agentToolCalls = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "agent_tool_calls_total",
		Help: "Total number of agent tool calls",
	}, []string{"agent_name", "tool_name"})
	registry.MustRegister(c.agentToolCalls)

	c.agentErrors = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "agent_errors_total",
		Help: "Total number of agent errors",
	}, []string{"agent_name", "error_type"})
	registry.MustRegister(c.agentErrors)

	// SSE指标
	c.sseConnections = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "sse_connections",
		Help: "Number of active SSE connections",
	})
	registry.MustRegister(c.sseConnections)

	c.sseMessages = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "sse_messages_total",
		Help: "Total number of SSE messages",
	}, []string{"type"})
	registry.MustRegister(c.sseMessages)

	// 熔断器指标
	c.circuitBreakerState = prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Name: "circuit_breaker_state",
		Help: "Circuit breaker state (0=closed, 1=open, 2=half-open)",
	}, []string{"name"})
	registry.MustRegister(c.circuitBreakerState)

	// 限流器指标
	c.rateLimitRemaining = prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ratelimit_remaining",
		Help: "Remaining tokens in rate limiter",
	}, []string{"level", "key"})
	registry.MustRegister(c.rateLimitRemaining)

	c.rateLimitAllowed = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "ratelimit_allowed_total",
		Help: "Total number of allowed requests",
	}, []string{"level", "key"})
	registry.MustRegister(c.rateLimitAllowed)

	c.rateLimitRejected = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "ratelimit_rejected_total",
		Help: "Total number of rejected requests",
	}, []string{"level", "key"})
	registry.MustRegister(c.rateLimitRejected)

	// RAG指标
	c.ragQueryDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "rag_query_duration_seconds",
		Help:    "RAG query duration in seconds",
		Buckets: []float64{0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
	}, []string{"query_type"})
	registry.MustRegister(c.ragQueryDuration)

	c.ragQueryTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "rag_query_total",
		Help: "Total number of RAG queries",
	}, []string{"query_type"})
	registry.MustRegister(c.ragQueryTotal)

	c.ragQueryErrors = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "rag_query_errors_total",
		Help: "Total number of RAG query errors",
	}, []string{"query_type", "error_type"})
	registry.MustRegister(c.ragQueryErrors)

	// 队列指标
	c.queueSize = prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Name: "queue_size",
		Help: "Current size of queue",
	}, []string{"queue_name"})
	registry.MustRegister(c.queueSize)

	c.queueEnqueued = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "queue_enqueued_total",
		Help: "Total number of items enqueued",
	}, []string{"queue_name"})
	registry.MustRegister(c.queueEnqueued)

	c.queueDequeued = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "queue_dequeued_total",
		Help: "Total number of items dequeued",
	}, []string{"queue_name"})
	registry.MustRegister(c.queueDequeued)

	c.queueExpired = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "queue_expired_total",
		Help: "Total number of items expired",
	}, []string{"queue_name"})
	registry.MustRegister(c.queueExpired)

	// 向量搜索指标
	c.vectorSearchDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "vector_search_duration_seconds",
		Help:    "Vector search duration in seconds",
		Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5},
	}, []string{"engine"})
	registry.MustRegister(c.vectorSearchDuration)

	c.vectorSearchTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "vector_search_total",
		Help: "Total number of vector searches",
	}, []string{"engine", "result"})
	registry.MustRegister(c.vectorSearchTotal)

	// MCP指标
	c.mcpToolCalls = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "mcp_tool_calls_total",
		Help: "Total number of MCP tool calls",
	}, []string{"server", "tool", "status"})
	registry.MustRegister(c.mcpToolCalls)

	c.mcpToolErrors = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "mcp_tool_errors_total",
		Help: "Total number of MCP tool errors",
	}, []string{"server", "tool", "error_type"})
	registry.MustRegister(c.mcpToolErrors)

	c.mcpConnections = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "mcp_connections",
		Help: "Number of active MCP connections",
	})
	registry.MustRegister(c.mcpConnections)

	return c
}

// HTTP指标

// RecordHTTPRequest 记录HTTP请求
func (c *Collector) RecordHTTPRequest(method, path string, status int, duration time.Duration) {
	c.httpRequestsTotal.WithLabelValues(method, path, strconv.Itoa(status)).Inc()
	c.httpRequestDuration.WithLabelValues(method, path).Observe(duration.Seconds())
}

// IncrementActiveConnections 增加活跃连接
func (c *Collector) IncrementActiveConnections() {
	c.activeConnections.Inc()
}

// DecrementActiveConnections 减少活跃连接
func (c *Collector) DecrementActiveConnections() {
	c.activeConnections.Dec()
}

// Agent指标

// IncrementAgentCount 增加Agent计数
func (c *Collector) IncrementAgentCount() {
	c.agentActiveCount.Inc()
}

// DecrementAgentCount 减少Agent计数
func (c *Collector) DecrementAgentCount() {
	c.agentActiveCount.Dec()
}

// RecordToolCall 记录工具调用
func (c *Collector) RecordToolCall(agentName, toolName string) {
	c.agentToolCalls.WithLabelValues(agentName, toolName).Inc()
}

// RecordAgentError 记录Agent错误
func (c *Collector) RecordAgentError(agentName, errorType string) {
	c.agentErrors.WithLabelValues(agentName, errorType).Inc()
}

// SSE指标

// IncrementSSEConnections 增加SSE连接
func (c *Collector) IncrementSSEConnections() {
	c.sseConnections.Inc()
}

// DecrementSSEConnections 减少SSE连接
func (c *Collector) DecrementSSEConnections() {
	c.sseConnections.Dec()
}

// RecordSSEMessage 记录SSE消息
func (c *Collector) RecordSSEMessage(msgType string) {
	c.sseMessages.WithLabelValues(msgType).Inc()
}

// 熔断器指标

// RecordCircuitBreakerState 记录熔断器状态
func (c *Collector) RecordCircuitBreakerState(name string, state int) {
	c.circuitBreakerState.WithLabelValues(name).Set(float64(state))
}

// 限流器指标

// RecordRateLimitRemaining 记录限流器剩余令牌
func (c *Collector) RecordRateLimitRemaining(level, key string, remaining float64) {
	c.rateLimitRemaining.WithLabelValues(level, key).Set(remaining)
}

// RecordRateLimitAllowed 记录允许的请求
func (c *Collector) RecordRateLimitAllowed(level, key string) {
	c.rateLimitAllowed.WithLabelValues(level, key).Inc()
}

// RecordRateLimitRejected 记录拒绝的请求
func (c *Collector) RecordRateLimitRejected(level, key string) {
	c.rateLimitRejected.WithLabelValues(level, key).Inc()
}

// RAG指标

// RecordRAGQuery 记录RAG查询
func (c *Collector) RecordRAGQuery(queryType string, duration time.Duration, success bool) {
	c.ragQueryDuration.WithLabelValues(queryType).Observe(duration.Seconds())
	c.ragQueryTotal.WithLabelValues(queryType).Inc()
	if !success {
		c.ragQueryErrors.WithLabelValues(queryType, "unknown").Inc()
	}
}

// RecordRAGQueryError 记录RAG查询错误
func (c *Collector) RecordRAGQueryError(queryType, errorType string) {
	c.ragQueryErrors.WithLabelValues(queryType, errorType).Inc()
}

// 队列指标

// RecordQueueSize 记录队列大小
func (c *Collector) RecordQueueSize(queueName string, size float64) {
	c.queueSize.WithLabelValues(queueName).Set(size)
}

// RecordQueueEnqueued 记录入队
func (c *Collector) RecordQueueEnqueued(queueName string) {
	c.queueEnqueued.WithLabelValues(queueName).Inc()
}

// RecordQueueDequeued 记录出队
func (c *Collector) RecordQueueDequeued(queueName string) {
	c.queueDequeued.WithLabelValues(queueName).Inc()
}

// RecordQueueExpired 记录过期
func (c *Collector) RecordQueueExpired(queueName string) {
	c.queueExpired.WithLabelValues(queueName).Inc()
}

// 向量搜索指标

// RecordVectorSearch 记录向量搜索
func (c *Collector) RecordVectorSearch(engine string, duration time.Duration, success bool) {
	c.vectorSearchDuration.WithLabelValues(engine).Observe(duration.Seconds())
	result := "success"
	if !success {
		result = "failure"
	}
	c.vectorSearchTotal.WithLabelValues(engine, result).Inc()
}

// MCP指标

// RecordMCPToolCall 记录MCP工具调用
func (c *Collector) RecordMCPToolCall(server, tool, status string) {
	c.mcpToolCalls.WithLabelValues(server, tool, status).Inc()
}

// RecordMCPToolError 记录MCP工具错误
func (c *Collector) RecordMCPToolError(server, tool, errorType string) {
	c.mcpToolErrors.WithLabelValues(server, tool, errorType).Inc()
}

// IncrementMCPConnections 增加MCP连接
func (c *Collector) IncrementMCPConnections() {
	c.mcpConnections.Inc()
}

// DecrementMCPConnections 减少MCP连接
func (c *Collector) DecrementMCPConnections() {
	c.mcpConnections.Dec()
}

// HTTPHandler 返回Prometheus HTTP处理器
func (c *Collector) HTTPHandler() gin.HandlerFunc {
	h := promhttp.HandlerFor(c.registry, promhttp.HandlerOpts{})

	return func(ctx *gin.Context) {
		h.ServeHTTP(ctx.Writer, ctx.Request)
	}
}

// Middleware 返回HTTP指标中间件
func (c *Collector) Middleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		start := time.Now()
		path := ctx.FullPath()
		if path == "" {
			path = "unknown"
		}

		c.IncrementActiveConnections()
		defer c.DecrementActiveConnections()

		ctx.Next()

		duration := time.Since(start)
		status := ctx.Writer.Status()
		c.RecordHTTPRequest(ctx.Request.Method, path, status, duration)
	}
}

// 全局采集器实例
var globalCollector *Collector

// Init 初始化全局采集器
func Init() {
	globalCollector = NewCollector()
}

// GetCollector 获取全局采集器
func GetCollector() *Collector {
	if globalCollector == nil {
		globalCollector = NewCollector()
	}
	return globalCollector
}

// 全局便捷函数

// RecordHTTPRequest 记录HTTP请求
func RecordHTTPRequest(method, path string, status int, duration time.Duration) {
	GetCollector().RecordHTTPRequest(method, path, status, duration)
}

// RecordRAGQuery 记录RAG查询
func RecordRAGQuery(queryType string, duration time.Duration, success bool) {
	GetCollector().RecordRAGQuery(queryType, duration, success)
}

// RecordCircuitBreakerState 记录熔断器状态
func RecordCircuitBreakerState(name string, state int) {
	GetCollector().RecordCircuitBreakerState(name, state)
}

// StartMetricsServer 启动指标服务器
func StartMetricsServer(addr string) *http.Server {
	collector := GetCollector()
	r := gin.New()
	r.Use(collector.Middleware())
	r.GET("/metrics", collector.HTTPHandler())

	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			// log error
		}
	}()

	return srv
}
