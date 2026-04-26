/**
 * 中间件栈
 * 统一管理和组合所有中间件
 */

package middleware

import (
	"github.com/gin-gonic/gin"
)

// MiddlewareStack 中间件栈
type MiddlewareStack struct {
	engine        *gin.Engine
	rateLimiter   *RateLimiter
	tracerConfig  TracerConfig
	timeoutConfig TimeoutConfig
}

// NewMiddlewareStack 创建中间件栈
func NewMiddlewareStack(engine *gin.Engine) *MiddlewareStack {
	return &MiddlewareStack{
		engine:        engine,
		rateLimiter:   nil,
		tracerConfig:  DefaultTracerConfig(),
		timeoutConfig: DefaultTimeoutConfig(),
	}
}

// WithRateLimiter 设置限流器
func (s *MiddlewareStack) WithRateLimiter(limiter *RateLimiter) *MiddlewareStack {
	s.rateLimiter = limiter
	return s
}

// WithTracerConfig 设置追踪配置
func (s *MiddlewareStack) WithTracerConfig(config TracerConfig) *MiddlewareStack {
	s.tracerConfig = config
	return s
}

// WithTimeoutConfig 设置超时配置
func (s *MiddlewareStack) WithTimeoutConfig(config TimeoutConfig) *MiddlewareStack {
	s.timeoutConfig = config
	return s
}

// Setup 应用中间件栈到引擎
func (s *MiddlewareStack) Setup() {
	// 1. Recovery (Panic恢复) - 最先，确保能捕获所有panic
	// 使用带错误处理的 RecoveryWithErrorHandler 替代 DefaultRecovery
	s.engine.Use(RecoveryWithErrorHandler())

	// 2. Request Logger - 记录所有请求
	if gin.Mode() == gin.DebugMode {
		s.engine.Use(DetailedRequestLogger())
	} else {
		s.engine.Use(DefaultRequestLogger())
	}

	// 3. Tracer - 链路追踪
	s.engine.Use(TracerMiddlewareWithConfig(s.tracerConfig))

	// 4. Security Headers - 安全头
	s.engine.Use(SecurityHeaders())

	// 5. CORS - 跨域资源共享
	s.engine.Use(DefaultCORS())

	// 6. Rate Limiter - 限流（如果配置了）
	if s.rateLimiter != nil {
		s.engine.Use(IPBasedRateLimit(s.rateLimiter))
	}

	// 7. Timeout - 请求超时
	s.engine.Use(Timeout(s.timeoutConfig))

	// 8. Max Body Size - 请求体大小限制
	s.engine.Use(MaxBodySize(DefaultSecurityConfig().MaxBodySize))

	// 9. Error Handler - 统一错误处理（最后）
	s.engine.Use(ErrorHandler())

	// 10. 404 Handler - 路由不存在处理
	s.engine.Use(NotFoundHandler())
}

// SetupRoutes 设置带中间件的路由组
func (s *MiddlewareStack) SetupRoutes(routes func(*gin.RouterGroup)) {
	// API 路由组
	api := s.engine.Group("/api")
	routes(api)
}

// SetupPublicRoutes 设置公开路由（不带限流）
func (s *MiddlewareStack) SetupPublicRoutes(routes func(*gin.RouterGroup)) {
	// Public API 路由组（不带限流）
	public := s.engine.Group("/api")
	// 不应用限流和追踪中间件
	public.Use(SecurityHeaders())
	public.Use(DefaultCORS())
	routes(public)
}

// SetupAdminRoutes 设置管理后台路由
func (s *MiddlewareStack) SetupAdminRoutes(routes func(*gin.RouterGroup)) {
	admin := s.engine.Group("/api/admin")
	// Admin路由可以添加额外的认证中间件
	routes(admin)
}

// GetEngine 获取Gin引擎
func (s *MiddlewareStack) GetEngine() *gin.Engine {
	return s.engine
}

// SetupWithConfig 使用配置设置中间件栈
func SetupWithConfig(engine *gin.Engine, config *ServerMiddlewareConfig) *MiddlewareStack {
	stack := NewMiddlewareStack(engine)

	if config != nil {
		if config.RateLimiter != nil {
			stack.WithRateLimiter(config.RateLimiter)
		}
		if config.TracerConfig.ServiceName != "" {
			stack.WithTracerConfig(config.TracerConfig)
		}
		if config.TimeoutConfig.DefaultTimeout > 0 {
			stack.WithTimeoutConfig(config.TimeoutConfig)
		}
	}

	stack.Setup()
	return stack
}

// ServerMiddlewareConfig 服务器中间件配置
type ServerMiddlewareConfig struct {
	RateLimiter   *RateLimiter
	TracerConfig  TracerConfig
	TimeoutConfig TimeoutConfig
}

// NewServerMiddlewareConfig 创建默认服务器中间件配置
func NewServerMiddlewareConfig() *ServerMiddlewareConfig {
	return &ServerMiddlewareConfig{
		TracerConfig:  DefaultTracerConfig(),
		TimeoutConfig: DefaultTimeoutConfig(),
	}
}

// WithProductionSettings 生产环境设置
func (c *ServerMiddlewareConfig) WithProductionSettings(origins []string) *ServerMiddlewareConfig {
	c.TracerConfig.Environment = "production"
	c.TimeoutConfig.DefaultTimeout = 30 * 1e9 // 30秒
	c.TracerConfig.Exporter = "stdout"
	return c
}

// WithDevelopmentSettings 开发环境设置
func (c *ServerMiddlewareConfig) WithDevelopmentSettings() *ServerMiddlewareConfig {
	c.TracerConfig.Environment = "development"
	c.TimeoutConfig.DefaultTimeout = 60 * 1e9 // 60秒
	return c
}
