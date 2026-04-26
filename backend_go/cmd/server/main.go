/**
 * 后端服务器入口
 * AI Chat 玩具 - Go 版本
 */

package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/ai-chat/backend_go/config"
	"github.com/ai-chat/backend_go/internal/application"
	"github.com/ai-chat/backend_go/internal/domain/a2a"
	"github.com/ai-chat/backend_go/internal/domain/agent"
	"github.com/ai-chat/backend_go/internal/handlers"
	adminHandlers "github.com/ai-chat/backend_go/internal/handlers/admin"
	"github.com/ai-chat/backend_go/internal/infra/metrics"
	"github.com/ai-chat/backend_go/internal/middleware"
	"github.com/ai-chat/backend_go/internal/services/tools"
	"github.com/ai-chat/backend_go/pkg/minimax"

	"github.com/gin-gonic/gin"
)

func main() {
	// 初始化配置
	if err := initConfig(); err != nil {
		log.Fatalf("配置初始化失败: %v", err)
		os.Exit(1)
	}

	// 设置Gin模式
	mode := config.GetString("server.mode")
	if mode == "" {
		mode = "debug"
	}
	gin.SetMode(mode)

	// 创建Gin引擎
	router := gin.New()

	// 初始化并应用中间件栈
	initMiddleware(router)

	// 初始化MiniMax客户端
	mmConfig := config.GetMiniMaxConfig()
	minimaxClient := minimax.NewClient(minimax.Config{
		APIKey:    mmConfig.APIKey,
		BaseURL:   mmConfig.BaseURL,
		ModelName: mmConfig.Model,
	})

	// 初始化工具注册表
	toolRegistry := tools.NewToolRegistry()

	// 初始化服务
	metricsCollector := metrics.NewCollector()
	a2aService := a2a.NewA2AService()
	hitlManager := agent.NewHITLManager(60 * time.Second)

	// 创建编排器 (带真实依赖)
	chatOrchestrator := application.NewChatOrchestrator(minimaxClient)
	agentOrchestrator := application.NewAgentOrchestratorWithDeps(
		minimaxClient, // 模型客户端 (实现 model.Model 接口)
		toolRegistry,  // 工具注册表
		nil,           // 日志 (可选)
	)

	// 创建处理器
	chatHandler := handlers.NewChatHandler(chatOrchestrator)
	agentHandler := handlers.NewAgentHandler(agentOrchestrator)
	a2aHandler := handlers.NewA2AHandler(a2aService)
	hitlHandler := handlers.NewHITLHandler(hitlManager)
	adminHandlersInstance := adminHandlers.NewAdminHandlers()
	memoryHandler := handlers.NewMemoryHandler()

	// 注册路由
	registerRoutes(router, chatHandler, agentHandler, a2aHandler, hitlHandler, adminHandlersInstance, memoryHandler, metricsCollector)

	// 健康检查
	router.GET("/health", func(c *gin.Context) {
		handlers.HealthCheckResponse(c, "ai-chat-backend-go", "1.0.0")
	})

	// 获取端口
	port := config.GetInt("server.port")
	if port == 0 {
		port = 30000
	}

	log.Printf("启动服务器 [环境: %s] 端口: %d", config.GetEnv(), port)
	log.Printf("Health check: http://localhost:%d/health", port)
	log.Printf("API base: http://localhost:%d/api", port)

	// 创建HTTP服务器
	addr := ":" + strconv.Itoa(port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout: 120 * time.Second,
	}

	// 启动服务器（使用goroutine）
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("服务器启动失败: %v", err)
			os.Exit(1)
		}
	}()

	// 等待中断信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("正在关闭服务器...")

	// 优雅关闭
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 关闭追踪器
	if tracer := middleware.GetTracer(); tracer != nil {
		if err := tracer.Shutdown(ctx); err != nil {
			log.Printf("关闭追踪器失败: %v", err)
		}
	}

	// 关闭HTTP服务器
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("服务器被迫关闭: %v", err)
	}

	log.Println("服务器已退出")
}

// initConfig 初始化配置
func initConfig() error {
	// 获取环境变量
	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "development"
	}

	// 初始化配置
	return config.InitConfigWithEnv("", env)
}

// initMiddleware 初始化中间件栈
func initMiddleware(router *gin.Engine) {
	// 创建中间件栈
	stack := middleware.NewMiddlewareStack(router)

	// 配置限流器
	rateLimiter := middleware.NewRateLimiter(middleware.RateLimitConfig{
		RequestsPerMinute: 60,
		RequestsPerHour:   1000,
		RequestsPerDay:    10000,
		BurstSize:         10,
	})

	// 配置追踪器
	tracerConfig := middleware.TracerConfig{
		ServiceName:   "ai-chat-backend-go",
		Environment:   config.GetEnv(),
		Enabled:       true,
		Exporter:      "stdout",
	}

	// 初始化追踪器
	if _, err := middleware.InitTracer(tracerConfig); err != nil {
		log.Printf("警告: 追踪器初始化失败: %v", err)
	}

	// 配置超时
	timeoutConfig := middleware.TimeoutConfig{
		DefaultTimeout: 30 * time.Second,
		PathTimeouts: map[string]time.Duration{
			"/api/chat/stream":   120 * time.Second,
			"/api/agent/execute": 300 * time.Second,
		},
	}

	// 配置中间件栈
	stack.WithRateLimiter(rateLimiter)
	stack.WithTracerConfig(tracerConfig)
	stack.WithTimeoutConfig(timeoutConfig)

	// 应用中间件
	stack.Setup()

	fmt.Println("[中间件] 中间件栈已初始化:")
	fmt.Println("  - Recovery (Panic恢复)")
	fmt.Println("  - Request Logger (请求日志)")
	fmt.Println("  - Tracer (OpenTelemetry链路追踪)")
	fmt.Println("  - Security Headers (安全头)")
	fmt.Println("  - CORS (跨域资源共享)")
	fmt.Println("  - Rate Limiter (IP限流)")
	fmt.Println("  - Timeout (请求超时)")
	fmt.Println("  - Max Body Size (请求体大小限制)")
}

// registerRoutes 注册路由
func registerRoutes(
	router *gin.Engine,
	chatHandler *handlers.ChatHandler,
	agentHandler *handlers.AgentHandler,
	a2aHandler *handlers.A2AHandler,
	hitlHandler *handlers.HITLHandler,
	adminHandlersInstance *adminHandlers.AdminHandlers,
	memoryHandler *handlers.MemoryHandler,
	metricsCollector *metrics.Collector,
) {
	// API 路由组
	api := router.Group("/api")
	{
		// 聊天路由
		api.POST("/chat", chatHandler.HandleChat)
		api.POST("/chat/stream", chatHandler.HandleStream)
		api.GET("/chat/history/:sessionId", chatHandler.GetHistory)
		api.GET("/chat/sessions", chatHandler.ListSessions)
		api.DELETE("/chat/session/:sessionId", chatHandler.DeleteSession)

		// Agent路由
		api.POST("/agent/execute", agentHandler.HandleExecute)
		api.GET("/agent/stream", agentHandler.HandleStream)
		api.POST("/agent/cancel/:taskId", agentHandler.HandleCancel)
		api.GET("/agent/tools", agentHandler.HandleTools)
		api.GET("/agent/session/:id", agentHandler.HandleSession)
		api.DELETE("/agent/session/:id", agentHandler.HandleDeleteSession)
		api.GET("/agent/sessions", agentHandler.HandleSessions)

		// A2A路由
		a2aGroup := api.Group("/a2a")
		{
			a2aGroup.GET("/status", a2aHandler.GetStatus)
			a2aGroup.GET("/agents", a2aHandler.ListAgents)
			a2aGroup.GET("/agents/:agentId", a2aHandler.GetAgent)
			a2aGroup.POST("/agents/register", a2aHandler.RegisterAgent)
			a2aGroup.POST("/agents/:agentId/unregister", a2aHandler.UnregisterAgent)
			a2aGroup.POST("/agents/:agentId/heartbeat", a2aHandler.Heartbeat)
			a2aGroup.POST("/send", a2aHandler.SendMessage)
			a2aGroup.GET("/receive", a2aHandler.ReceiveMessages)
			a2aGroup.GET("/poll", a2aHandler.PollMessages)
			a2aGroup.GET("/unread/:agentId", a2aHandler.GetUnreadCount)
			a2aGroup.POST("/result/:taskId", a2aHandler.ReturnResult)
			a2aGroup.POST("/progress/:taskId", a2aHandler.SendProgress)
			a2aGroup.GET("/tasks/:taskId", a2aHandler.GetTaskStatus)
			a2aGroup.GET("/tasks", a2aHandler.ListTasks)
			a2aGroup.DELETE("/tasks/:taskId", a2aHandler.CancelTask)
			a2aGroup.GET("/subscribe/:agentId", a2aHandler.Subscribe)
			a2aGroup.POST("/collaborate", a2aHandler.Collaborate)
			a2aGroup.GET("/collaboration/:taskId", a2aHandler.GetCollaborationStatus)
			a2aGroup.DELETE("/collaboration/:taskId", a2aHandler.CancelCollaboration)
			a2aGroup.GET("/collaboration/stats", a2aHandler.GetCollaborationStats)
		}

		// HITL路由
		hitlGroup := api.Group("/hitl")
		{
			hitlGroup.POST("/checkpoint", hitlHandler.CreateCheckpoint)
			hitlGroup.GET("/checkpoint/:id", hitlHandler.GetCheckpoint)
			hitlGroup.POST("/checkpoint/:id/approve", hitlHandler.ApproveCheckpoint)
			hitlGroup.POST("/checkpoint/:id/reject", hitlHandler.RejectCheckpoint)
			hitlGroup.POST("/checkpoint/:id/wait", hitlHandler.WaitForCheckpoint)
			hitlGroup.GET("/pending", hitlHandler.GetPendingCheckpoints)
			hitlGroup.GET("/history", hitlHandler.GetHistory)
			hitlGroup.GET("/stats", hitlHandler.GetStats)
			hitlGroup.GET("/types", hitlHandler.GetTypes)
			hitlGroup.POST("/confirm", hitlHandler.RequestConfirmation)
			hitlGroup.POST("/clear", hitlHandler.ClearPending)
			hitlGroup.GET("/health", hitlHandler.HealthCheck)
			hitlGroup.GET("/status", hitlHandler.HealthCheck)
		}

		// Memory路由
		memoryGroup := api.Group("/memory")
		{
			memoryGroup.POST("/note", memoryHandler.CreateNote)
			memoryGroup.GET("/notes", memoryHandler.ListNotes)
			memoryGroup.GET("/note/:id", memoryHandler.GetNote)
			memoryGroup.PUT("/note/:id", memoryHandler.UpdateNote)
			memoryGroup.DELETE("/note/:id", memoryHandler.DeleteNote)
			memoryGroup.GET("/sessions/:sessionId", memoryHandler.GetSessionNotes)
		}

		// Admin路由
		admin := api.Group("/admin")
		{
			// 知识库管理
			knowledge := admin.Group("/knowledge")
			{
				knowledge.GET("", adminHandlersInstance.Knowledge.List)
				knowledge.GET("/:id", adminHandlersInstance.Knowledge.Get)
				knowledge.POST("", adminHandlersInstance.Knowledge.Create)
				knowledge.PUT("/:id", adminHandlersInstance.Knowledge.Update)
				knowledge.DELETE("/:id", adminHandlersInstance.Knowledge.Delete)
				knowledge.POST("/:id/index", adminHandlersInstance.Knowledge.Reindex)
			}

			// 工具管理
			tool := admin.Group("/tool")
			{
				tool.GET("", adminHandlersInstance.Tool.List)
				tool.GET("/:name", adminHandlersInstance.Tool.Get)
				tool.POST("", adminHandlersInstance.Tool.Register)
				tool.PUT("/:name", adminHandlersInstance.Tool.Update)
				tool.DELETE("/:name", adminHandlersInstance.Tool.Unregister)
				tool.POST("/:name/test", adminHandlersInstance.Tool.Test)
			}

			// 模型管理
			model := admin.Group("/model")
			{
				model.GET("", adminHandlersInstance.Model.List)
				model.GET("/:name", adminHandlersInstance.Model.Get)
				model.POST("", adminHandlersInstance.Model.Register)
				model.PUT("/:name", adminHandlersInstance.Model.Update)
				model.DELETE("/:name", adminHandlersInstance.Model.Delete)
				model.GET("/:name/health", adminHandlersInstance.Model.HealthCheck)
			}

			// Prompt模板管理
			prompt := admin.Group("/prompt")
			{
				prompt.GET("", adminHandlersInstance.Prompt.List)
				prompt.GET("/:id", adminHandlersInstance.Prompt.Get)
				prompt.POST("", adminHandlersInstance.Prompt.Create)
				prompt.PUT("/:id", adminHandlersInstance.Prompt.Update)
				prompt.DELETE("/:id", adminHandlersInstance.Prompt.Delete)
				prompt.POST("/:id/version", adminHandlersInstance.Prompt.CreateVersion)
			}

			// 链路追踪
			trace := admin.Group("/trace")
			{
				trace.GET("", adminHandlersInstance.Trace.List)
				trace.GET("/:id", adminHandlersInstance.Trace.Get)
				trace.GET("/stats", adminHandlersInstance.Trace.Stats)
				trace.GET("/session/:sessionId", adminHandlersInstance.Trace.GetBySession)
			}
		}
	}

	// 指标路由
	router.GET("/metrics", func(c *gin.Context) {
		handlers.SuccessResponse(c, gin.H{
			"requests_total": middleware.GetRequestCount(),
		})
	})
}
