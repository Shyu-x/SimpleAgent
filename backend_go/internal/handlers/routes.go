/**
 * 路由注册
 * 统一管理所有API路由
 */

package handlers

import (
	"time"

	"github.com/gin-gonic/gin"

	"github.com/ai-chat/backend_go/internal/application"
	"github.com/ai-chat/backend_go/internal/domain/a2a"
	"github.com/ai-chat/backend_go/internal/domain/agent"
	"github.com/ai-chat/backend_go/internal/middleware"

	adminHandlers "github.com/ai-chat/backend_go/internal/handlers/admin"
)

// Router 路由管理器
type Router struct {
	engine        *gin.Engine
	chatHandler   *ChatHandler
	agentHandler  *AgentHandler
	adminHandlers *adminHandlers.AdminHandlers
	a2aHandler    *A2AHandler
	hitlHandler   *HITLHandler
	memoryHandler *MemoryHandler
}

// NewRouter 创建路由管理器
func NewRouter(orchestrator *application.ChatOrchestrator, agentOrchestrator *application.AgentOrchestrator) *Router {
	// 创建A2A服务
	a2aService := a2a.NewA2AService()
	// 创建HITL管理器
	hitlManager := agent.NewHITLManager(60 * time.Second)

	return &Router{
		chatHandler:   NewChatHandler(orchestrator),
		agentHandler:  NewAgentHandler(agentOrchestrator),
		adminHandlers: adminHandlers.NewAdminHandlers(),
		a2aHandler:    NewA2AHandler(a2aService),
		hitlHandler:   NewHITLHandler(hitlManager),
		memoryHandler: NewMemoryHandler(),
	}
}

// SetupRoutes 注册所有路由（使用 /api 前缀）
func (r *Router) SetupRoutes(engine *gin.Engine) {
	r.engine = engine

	// 创建中间件栈
	stack := middleware.NewMiddlewareStack(engine)

	// 设置限流器
	rateLimiter := middleware.NewRateLimiter(middleware.DefaultRateLimitConfig())
	stack.WithRateLimiter(rateLimiter)

	// 应用中间件
	stack.Setup()

	// API 路由组
	api := engine.Group("/api")
	r.setupChatRoutes(api)
	r.setupAgentRoutes(api)
	r.setupA2ARoutes(api)
	r.setupHITLRoutes(api)
	r.setupMemoryRoutes(api)
	r.setupAdminRoutes(api)

	// 健康检查（不带 /api 前缀）
	engine.GET("/health", r.healthCheck)

	// 指标端点（不带 /api 前缀）
	engine.GET("/metrics", r.metricsHandler)
}

// setupChatRoutes 设置聊天路由
func (r *Router) setupChatRoutes(api *gin.RouterGroup) {
	chat := api.Group("/chat")
	{
		chat.POST("", r.chatHandler.HandleChat)
		chat.GET("/stream", r.chatHandler.HandleStream)
		chat.GET("/history/:sessionId", r.chatHandler.GetHistory)
		chat.GET("/sessions", r.chatHandler.ListSessions)
		chat.DELETE("/session/:sessionId", r.chatHandler.DeleteSession)
	}

	// OpenAI 兼容路由 /api/v1/chat/completions
	v1 := api.Group("/v1")
	{
		v1Chat := v1.Group("/chat")
		{
			v1Chat.POST("/completions", r.chatHandler.HandleChat) // 复用 HandleChat
		}
	}
}

// setupAgentRoutes 设置Agent路由
func (r *Router) setupAgentRoutes(api *gin.RouterGroup) {
	agent := api.Group("/agent")
	{
		agent.POST("/execute", r.agentHandler.HandleExecute)
		agent.GET("/stream", r.agentHandler.HandleStream)
		agent.POST("/cancel/:taskId", r.agentHandler.HandleCancel)
		agent.GET("/tools", r.agentHandler.HandleTools)
		agent.GET("/session/:id", r.agentHandler.HandleSession)
		agent.DELETE("/session/:id", r.agentHandler.HandleDeleteSession)
		agent.GET("/sessions", r.agentHandler.HandleSessions)
	}
}

// setupA2ARoutes 设置A2A路由
func (r *Router) setupA2ARoutes(api *gin.RouterGroup) {
	a2a := api.Group("/a2a")
	{
		r.a2aHandler.RegisterRoutes(a2a)
	}
}

// setupHITLRoutes 设置HITL路由
func (r *Router) setupHITLRoutes(api *gin.RouterGroup) {
	hitl := api.Group("/hitl")
	{
		r.hitlHandler.RegisterRoutes(hitl)
	}
}

// setupMemoryRoutes 设置Memory路由
func (r *Router) setupMemoryRoutes(api *gin.RouterGroup) {
	r.memoryHandler.RegisterRoutes(api)
}

// setupAdminRoutes 设置管理后台路由
func (r *Router) setupAdminRoutes(api *gin.RouterGroup) {
	admin := api.Group("/admin")
	{
		// 知识库管理
		knowledge := admin.Group("/knowledge")
		{
			knowledge.GET("", r.adminHandlers.Knowledge.List)
			knowledge.GET("/:id", r.adminHandlers.Knowledge.Get)
			knowledge.POST("", r.adminHandlers.Knowledge.Create)
			knowledge.PUT("/:id", r.adminHandlers.Knowledge.Update)
			knowledge.DELETE("/:id", r.adminHandlers.Knowledge.Delete)
			knowledge.POST("/:id/index", r.adminHandlers.Knowledge.Reindex)
		}

		// 工具管理
		tool := admin.Group("/tool")
		{
			tool.GET("", r.adminHandlers.Tool.List)
			tool.GET("/:name", r.adminHandlers.Tool.Get)
			tool.POST("", r.adminHandlers.Tool.Register)
			tool.PUT("/:name", r.adminHandlers.Tool.Update)
			tool.DELETE("/:name", r.adminHandlers.Tool.Unregister)
			tool.POST("/:name/test", r.adminHandlers.Tool.Test)
		}

		// 模型管理
		model := admin.Group("/model")
		{
			model.GET("", r.adminHandlers.Model.List)
			model.GET("/:name", r.adminHandlers.Model.Get)
			model.POST("", r.adminHandlers.Model.Register)
			model.PUT("/:name", r.adminHandlers.Model.Update)
			model.DELETE("/:name", r.adminHandlers.Model.Delete)
			model.GET("/:name/health", r.adminHandlers.Model.HealthCheck)
		}

		// Prompt模板管理
		prompt := admin.Group("/prompt")
		{
			prompt.GET("", r.adminHandlers.Prompt.List)
			prompt.GET("/:id", r.adminHandlers.Prompt.Get)
			prompt.POST("", r.adminHandlers.Prompt.Create)
			prompt.PUT("/:id", r.adminHandlers.Prompt.Update)
			prompt.DELETE("/:id", r.adminHandlers.Prompt.Delete)
			prompt.POST("/:id/version", r.adminHandlers.Prompt.CreateVersion)
		}

		// 链路追踪
		trace := admin.Group("/trace")
		{
			trace.GET("", r.adminHandlers.Trace.List)
			trace.GET("/:id", r.adminHandlers.Trace.Get)
			trace.GET("/stats", r.adminHandlers.Trace.Stats)
			trace.GET("/session/:sessionId", r.adminHandlers.Trace.GetBySession)
		}
	}
}

// healthCheck 健康检查
func (r *Router) healthCheck(c *gin.Context) {
	HealthCheckResponse(c, "ai-chat-backend-go", "1.0.0")
}

// metricsHandler 指标处理器
func (r *Router) metricsHandler(c *gin.Context) {
	// Prometheus格式指标
	metrics := gin.H{
		"requests_total": middleware.GetRequestCount(),
	}
	SuccessResponse(c, metrics)
}
