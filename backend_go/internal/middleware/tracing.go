/**
 * 链路追踪中间件
 * 基于 OpenTelemetry 的分布式追踪能力
 * 注意：使用简化的内存追踪器，不依赖stdouttrace导出器
 */

package middleware

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"
)

// noopExporter 空实现导出器
type noopExporter struct{}

func (n *noopExporter) ExportSpans(ctx context.Context, spans []sdktrace.ReadOnlySpan) error {
	return nil
}

func (n *noopExporter) Shutdown(ctx context.Context) error {
	return nil
}

// TracerConfig 追踪器配置
type TracerConfig struct {
	// 服务名称
	ServiceName string
	// 环境
	Environment string
	// 是否启用
	Enabled bool
	// 导出方式: stdout | jaeger
	Exporter string
	// Jaeger配置
	JaegerEndpoint string
}

// DefaultTracerConfig 默认追踪器配置
func DefaultTracerConfig() TracerConfig {
	return TracerConfig{
		ServiceName: "backend-go",
		Environment: "development",
		Enabled:     true,
		Exporter:    "stdout",
	}
}

// TraceContext 追踪上下文
type TraceContext struct {
	TraceID   string
	SpanID    string
	ParentID  string
	StartTime time.Time
	EndTime   time.Time
	Duration  time.Duration
	Tags      map[string]string
	Events    []TraceEvent
	mu        sync.RWMutex
}

// TraceEvent 追踪事件
type TraceEvent struct {
	Name       string            `json:"name"`
	Timestamp  time.Time         `json:"timestamp"`
	Attributes map[string]string `json:"attributes,omitempty"`
}

// Tracer 追踪器
type Tracer struct {
	config     TracerConfig
	provider   *sdktrace.TracerProvider
	tracer     trace.Tracer
	propagator propagation.TextMapPropagator
}

// 全局追踪器实例
var (
	globalTracer   *Tracer
	tracerInitOnce sync.Once
	requestCount   uint64
)

// InitTracer 初始化追踪器
func InitTracer(config TracerConfig) (*Tracer, error) {
	var initErr error

	tracerInitOnce.Do(func() {
		// 创建资源
		res, err := resource.Merge(
			resource.Default(),
			resource.NewWithAttributes(
				semconv.SchemaURL,
				semconv.ServiceName(config.ServiceName),
				semconv.ServiceVersion("1.0.0"),
				semconv.DeploymentEnvironment(config.Environment),
			),
		)
		if err != nil {
			initErr = fmt.Errorf("创建追踪资源失败: %w", err)
			return
		}

		// 使用空导出器（避免stdouttrace依赖问题）
		exporter := &noopExporter{}

		// 创建追踪提供者
		provider := sdktrace.NewTracerProvider(
			sdktrace.WithBatcher(exporter),
			sdktrace.WithResource(res),
			sdktrace.WithSampler(sdktrace.AlwaysSample()),
		)

		// 设置全局提供者
		otel.SetTracerProvider(provider)
		otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
			propagation.TraceContext{},
			propagation.Baggage{},
		))

		// 创建追踪器
		tracer := provider.Tracer(config.ServiceName)

		globalTracer = &Tracer{
			config:     config,
			provider:   provider,
			tracer:     tracer,
			propagator: otel.GetTextMapPropagator(),
		}
	})

	return globalTracer, initErr
}

// GetTracer 获取全局追踪器
func GetTracer() *Tracer {
	return globalTracer
}

// Shutdown 关闭追踪器
func (t *Tracer) Shutdown(ctx context.Context) error {
	if t.provider != nil {
		return t.provider.Shutdown(ctx)
	}
	return nil
}

// StartSpan 开始一个span
func (t *Tracer) StartSpan(ctx context.Context, name string, opts ...trace.SpanStartOption) (context.Context, trace.Span) {
	if t == nil || !t.config.Enabled {
		return ctx, nil
	}
	return t.tracer.Start(ctx, name, opts...)
}

// SpanFromContext 从上下文获取span
func SpanFromContext(ctx context.Context) trace.Span {
	return trace.SpanFromContext(ctx)
}

// TracerMiddleware 追踪中间件
func TracerMiddleware(serviceName string) gin.HandlerFunc {
	return TracerMiddlewareWithConfig(DefaultTracerConfig())
}

// TracerMiddlewareWithConfig 带配置的追踪中间件
func TracerMiddlewareWithConfig(config TracerConfig) gin.HandlerFunc {
	// 确保追踪器已初始化
	if globalTracer == nil {
		InitTracer(config)
	}

	return func(c *gin.Context) {
		if globalTracer == nil || !globalTracer.config.Enabled {
			c.Next()
			return
		}

		// 生成或提取 Trace ID
		traceID := c.GetHeader("X-Trace-Id")
		if traceID == "" {
			traceID = generateTraceID()
		}

		// 存储到上下文
		c.Set("trace_id", traceID)
		c.Header("X-Trace-Id", traceID)

		// 开始时间
		start := time.Now()

		// 创建spans
		ctx := c.Request.Context()

		// 使用 OpenTelemetry 追踪
		ctx, span := globalTracer.tracer.Start(ctx, c.Request.Method+" "+c.FullPath(),
			trace.WithAttributes(
				attribute.String("http.method", c.Request.Method),
				attribute.String("http.url", c.Request.URL.String()),
				attribute.String("http.route", c.FullPath()),
				attribute.String("http.client_ip", c.ClientIP()),
				attribute.String("http.user_agent", c.Request.UserAgent()),
				attribute.String("trace.id", traceID),
			),
			trace.WithSpanKind(trace.SpanKindServer),
		)
		defer span.End()

		// 替换请求上下文
		c.Request = c.Request.WithContext(ctx)

		// 处理请求
		c.Next()

		// 记录响应状态
		status := c.Writer.Status()
		span.SetAttributes(attribute.Int("http.status_code", status))

		// 设置错误状态
		if status >= 400 {
			span.SetAttributes(attribute.Bool("error", true))
		}

		// 记录请求处理时间
		duration := time.Since(start)
		span.SetAttributes(attribute.Int64("http.duration_ms", duration.Milliseconds()))

		// 增加请求计数
		atomic.AddUint64(&requestCount, 1)

		// 打印追踪信息
		if gin.Mode() != gin.ReleaseMode {
			spanID := span.SpanContext().SpanID().String()
			fmt.Printf("[TRACE] trace_id=%s span_id=%s method=%s path=%s status=%d duration=%v\n",
				traceID,
				spanID,
				c.Request.Method,
				c.FullPath(),
				status,
				duration,
			)
		}
	}
}

// generateTraceID 生成Trace ID
func generateTraceID() string {
	// 使用时间戳和计数器生成唯一的Trace ID
	now := time.Now()
	count := atomic.AddUint64(&requestCount, 1)
	return fmt.Sprintf("%016x-%016x", now.UnixNano(), count)
}

// SpanContextToMap 将span上下文转换为map
func SpanContextToMap(ctx context.Context) map[string]string {
	span := trace.SpanFromContext(ctx)
	sc := span.SpanContext()

	result := make(map[string]string)
	if sc.HasTraceID() {
		result["trace_id"] = sc.TraceID().String()
	}
	if sc.HasSpanID() {
		result["span_id"] = sc.SpanID().String()
	}
	return result
}

// AddSpanEvent 添加span事件
func AddSpanEvent(ctx context.Context, name string, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	span.AddEvent(name, trace.WithAttributes(attrs...))
}

// SetSpanAttributes 设置span属性
func SetSpanAttributes(ctx context.Context, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	span.SetAttributes(attrs...)
}

// RecordError 记录错误到当前span
func RecordError(ctx context.Context, err error, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	span.RecordError(err, trace.WithAttributes(attrs...))
}

// GetTraceID 获取当前Trace ID
func GetTraceID(c *gin.Context) string {
	if traceID, exists := c.Get("trace_id"); exists {
		return traceID.(string)
	}
	return ""
}

// GetRequestCount 获取请求计数
func GetRequestCount() uint64 {
	return atomic.LoadUint64(&requestCount)
}
