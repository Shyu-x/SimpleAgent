package e2e

import (
	"context"
	"testing"
	"time"

	"github.com/ai-chat/backend_go/domain/agent"
	"github.com/ai-chat/backend_go/domain/a2a"
	"github.com/ai-chat/backend_go/domain/rag"
	"github.com/ai-chat/backend_go/domain/model"
	"github.com/ai-chat/backend_go/infra/circuitbreaker"
	"github.com/ai-chat/backend_go/infra/ratelimiter"
)

// TestE2E_CompleteChatPipeline 测试完整的聊天管道
func TestE2E_CompleteChatPipeline(t *testing.T) {
	// 这个测试模拟完整的聊天管道：
	// 1. 用户发送消息
	// 2. 意图识别（简化模拟）
	// 3. Agent处理
	// 4. RAG增强（如果需要）
	// 5. 模型生成响应
	// 6. 流式返回

	t.Log("Starting E2E chat pipeline test")

	// 1. 创建模型路由
	router := model.NewMiniMaxRouter()
	mockModel := model.NewMockChatModel("e2e-model")
	router.RegisterModel(mockModel, 10)

	// 2. 创建RAG管道
	rewriteService := rag.NewQueryRewriteService()
	vectorStore := rag.NewSimpleVectorStore()
	reranker := rag.NewCrossEncoderReranker("")

	pipeline := rag.NewRAGPipeline(rewriteService, vectorStore, reranker, rag.RetrievalConfig{
		TopK:         5,
		EnableRerank: true,
	})

	// 3. 插入一些文档
	chunks := []rag.Chunk{
		{
			ID:         "e2e-doc1",
			DocumentID: "e2e-doc",
			Content:    "The project uses Go for the backend.",
			Embedding:  []float32{1, 0, 0},
		},
		{
			ID:         "e2e-doc2",
			DocumentID: "e2e-doc",
			Content:    "React is used for the frontend.",
			Embedding:  []float32{0, 1, 0},
		},
	}
	vectorStore.Insert(context.Background(), chunks)

	// 4. 创建Agent
	executor := agent.NewExecutor(time.Second)
	searchTool := agent.NewSimpleTool("search", "Search knowledge base", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
		query, _ := params["input"].(string)
		results, _ := pipeline.Query(ctx, query, []float32{0.5, 0.5, 0})
		return results, nil
	})
	executor.RegisterTool(searchTool)

	reactAgent := agent.NewReActAgent(agent.AgentConfig{
		Name:          "e2e-agent",
		MaxIterations: 5,
		Tools:         []agent.Tool{searchTool},
	}, executor)

	// 5. 模拟对话流程
	messages := []model.ChatMessage{
		{Role: "user", Content: "What technology is used for this project?"},
	}

	// Agent处理
	response, _, err := reactAgent.ExecuteWithTools(context.Background(), messages[0].Content)
	if err != nil {
		t.Fatalf("Agent execution failed: %v", err)
	}

	// 模型生成最终响应
	chatResp, err := router.Route(context.Background(), model.ChatRequest{
		Model:    "e2e-model",
		Messages: append(messages, model.ChatMessage{Role: "assistant", Content: response}),
	})

	if err != nil {
		t.Fatalf("Model route failed: %v", err)
	}

	t.Logf("User: %s", messages[0].Content)
	t.Logf("Agent: %s", response)
	t.Logf("Model: %s", chatResp.Content)
	t.Log("E2E chat pipeline test completed successfully")
}

// TestE2E_MultiAgentCollaboration 测试多Agent协作
func TestE2E_MultiAgentCollaboration(t *testing.T) {
	t.Log("Starting E2E multi-agent collaboration test")

	// 1. 创建Agent注册表
	registry := a2a.NewAgentRegistry(time.Second)

	// 2. 创建多个专业Agent
	agents := []a2a.AgentInfo{
		{
			ID:          "orchestrator",
			Name:        "Orchestrator",
			Description: "Coordinates other agents",
			Capabilities: []string{"coordinate", "delegate"},
		},
		{
			ID:          "researcher",
			Name:        "Researcher",
			Description: "Researches information",
			Capabilities: []string{"search", "analyze", "summarize"},
		},
		{
			ID:          "coder",
			Name:        "Coder",
			Description: "Writes code",
			Capabilities: []string{"write_code", "review_code", "test_code"},
		},
		{
			ID:          "reporter",
			Name:        "Reporter",
			Description: "Creates reports",
			Capabilities: []string{"format", "present", "export"},
		},
	}

	for _, a := range agents {
		if err := registry.Register(a); err != nil {
			t.Fatalf("Failed to register agent %s: %v", a.ID, err)
		}
	}

	// 3. 创建消息队列
	queue := a2a.NewInMemoryMessageQueue(200)

	// 4. 创建A2A客户端
	client := a2a.NewA2AClient(registry, queue)

	// 5. 模拟任务协作流程
	// Step 1: Orchestrator接收任务
	mainTask := &a2a.Task{
		ID:      "main-task",
		AgentID: "orchestrator",
		Type:    "research_and_report",
		Input:   "Research AI trends and create a report",
		Status:  a2a.TaskStatusPending,
	}

	result, err := client.SendTask(context.Background(), "orchestrator", mainTask)
	if err != nil {
		t.Fatalf("Failed to send main task: %v", err)
	}

	t.Logf("Step 1: Main task created - %s", result.ID)

	// Step 2: Orchestrator委托给Researcher
	researchTask := &a2a.Task{
		ID:      "research-task",
		AgentID: "researcher",
		Type:    "research",
		Input:   "Research AI trends in 2024",
		Status:  a2a.TaskStatusPending,
	}

	result, err = client.SendTask(context.Background(), "researcher", researchTask)
	if err != nil {
		t.Fatalf("Failed to send research task: %v", err)
	}

	t.Logf("Step 2: Research task delegated - %s", result.ID)

	// Step 3: Orchestrator委托给Coder
	codeTask := &a2a.Task{
		ID:      "code-task",
		AgentID: "coder",
		Type:    "code_generation",
		Input:   "Generate code examples for AI trends",
		Status:  a2a.TaskStatusPending,
	}

	result, err = client.SendTask(context.Background(), "coder", codeTask)
	if err != nil {
		t.Fatalf("Failed to send code task: %v", err)
	}

	t.Logf("Step 3: Code task delegated - %s", result.ID)

	// Step 4: Reporter创建报告
	reportTask := &a2a.Task{
		ID:      "report-task",
		AgentID: "reporter",
		Type:    "report_generation",
		Input:   "Compile research and code into a report",
		Status:  a2a.TaskStatusPending,
	}

	result, err = client.SendTask(context.Background(), "reporter", reportTask)
	if err != nil {
		t.Fatalf("Failed to send report task: %v", err)
	}

	t.Logf("Step 4: Report task created - %s", result.ID)

	// 6. 验证所有Agent
	allAgents := registry.ListAgents()
	if len(allAgents) != 4 {
		t.Errorf("Expected 4 agents, got %d", len(allAgents))
	}

	t.Log("E2E multi-agent collaboration test completed successfully")
}

// TestE2E_CircuitBreakerProtection 测试熔断器保护
func TestE2E_CircuitBreakerProtection(t *testing.T) {
	t.Log("Starting E2E circuit breaker protection test")

	// 1. 创建熔断器
	cb := circuitbreaker.New(circuitbreaker.Config{
		FailureThreshold: 5,
		SuccessThreshold: 3,
		Timeout:          200 * time.Millisecond,
	})

	// 2. 模拟不稳定服务
	var failureCount int
	var successCount int

	// 3. 在熔断器保护下调用服务
	for i := 0; i < 20; i++ {
		err := cb.Execute(func() error {
			// 模拟80%失败率
			if failureCount < 16 {
				failureCount++
				return circuitbreaker.ErrCircuitOpen
			}
			successCount++
			return nil
		})

		if i < 5 {
			// 前5次应该失败
			if err == nil {
				t.Errorf("Iteration %d: expected failure", i)
			}
		} else if i >= 5 && i < 10 {
			// 熔断开启后应该快速失败
			if err == nil {
				t.Errorf("Iteration %d: expected circuit open error", i)
			}
		}

		time.Sleep(10 * time.Millisecond)
	}

	// 4. 等待恢复
	time.Sleep(250 * time.Millisecond)

	// 5. 再次调用应该成功或进入半开
	cb.Execute(func() error {
		successCount++
		return nil
	})

	metrics := cb.GetMetrics()
	t.Logf("Circuit breaker metrics: Success=%d, Failure=%d", metrics.SuccessCount, metrics.FailureCount)
	t.Logf("Actual: Success=%d, Failure=%d", successCount, failureCount)

	t.Log("E2E circuit breaker protection test completed successfully")
}

// TestE2E_RateLimiterProtection 测试限流器保护
func TestE2E_RateLimiterProtection(t *testing.T) {
	t.Log("Starting E2E rate limiter protection test")

	// 1. 创建限流器
	limiter := ratelimiter.NewSlidingWindow(time.Second, 10)

	// 2. 模拟高并发请求
	var allowedCount int
	var rejectedCount int

	for i := 0; i < 25; i++ {
		if limiter.Allow() {
			allowedCount++
		} else {
			rejectedCount++
		}
	}

	// 3. 验证限流效果
	metrics := limiter.GetMetrics()

	t.Logf("Rate limiter metrics: Total=%d, Allowed=%d, Rejected=%d",
		metrics.TotalRequests, metrics.AllowedCount, metrics.RejectedCount)
	t.Logf("Actual: Allowed=%d, Rejected=%d", allowedCount, rejectedCount)

	// 25个请求中，应该只有10个被允许
	if allowedCount > 10 {
		t.Errorf("Expected at most 10 allowed, got %d", allowedCount)
	}

	t.Log("E2E rate limiter protection test completed successfully")
}

// TestE2E_FullSystemIntegration 测试完整系统集成
func TestE2E_FullSystemIntegration(t *testing.T) {
	t.Log("Starting E2E full system integration test")

	// 1. 初始化所有组件
	// 模型路由
	router := model.NewMiniMaxRouter()
	mockModel := model.NewMockChatModel("production-model")
	router.RegisterModel(mockModel, 10)

	// RAG系统
	rewriteService := rag.NewQueryRewriteService()
	vectorStore := rag.NewSimpleVectorStore()
	reranker := rag.NewCrossEncoderReranker("")
	pipeline := rag.NewRAGPipeline(rewriteService, vectorStore, reranker, rag.RetrievalConfig{
		TopK:         5,
		EnableRerank: true,
	})

	// Agent系统
	executor := agent.NewExecutor(time.Second)
	searchTool := agent.NewSimpleTool("rag_search", "Search knowledge base", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
		query, _ := params["input"].(string)
		return pipeline.Query(ctx, query, []float32{0.5, 0.5, 0})
	})
	executor.RegisterTool(searchTool)

	reactAgent := agent.NewReActAgent(agent.AgentConfig{
		Name:          "production-agent",
		MaxIterations: 10,
		Tools:         []agent.Tool{searchTool},
	}, executor)

	// A2A系统
	registry := a2a.NewAgentRegistry(time.Second)
	queue := a2a.NewInMemoryMessageQueue(100)
	_ = a2a.NewA2AClient(registry, queue)

	// 注册主Agent
	registry.Register(a2a.AgentInfo{
		ID:          "main-agent",
		Name:        "Main Agent",
		Capabilities: []string{"chat", "search", "coordinate"},
	})

	// 限流和熔断
	rateLimiter := ratelimiter.NewTokenBucket(ratelimiter.Config{
		Capacity:   100,
		RefillRate: 50,
	})

	circuitBreaker := circuitbreaker.New(circuitbreaker.Config{
		FailureThreshold: 10,
		SuccessThreshold: 5,
		Timeout:          time.Second,
	})

	// 2. 模拟用户请求流程
	testRequests := []string{
		"Hello, how can you help me?",
		"What is the capital of France?",
		"Tell me about AI",
		"What's the weather like today?",
		"Thanks for your help!",
	}

	for i, req := range testRequests {
		// 限流检查
		if !rateLimiter.Allow() {
			t.Logf("Request %d rejected by rate limiter", i+1)
			continue
		}

		// 熔断检查
		err := circuitBreaker.Execute(func() error {
			// Agent处理
			response, _, err := reactAgent.ExecuteWithTools(context.Background(), req)
			if err != nil {
				return err
			}

			// 模型增强
			_, err = router.Route(context.Background(), model.ChatRequest{
				Model: "production-model",
				Messages: []model.ChatMessage{
					{Role: "user", Content: req},
					{Role: "assistant", Content: response},
				},
			})

			return err
		})

		if err != nil {
			t.Logf("Request %d failed: %v", i+1, err)
		} else {
			t.Logf("Request %d processed successfully", i+1)
		}
	}

	// 3. 记录系统状态
	t.Logf("Rate limiter stats: %+v", rateLimiter.GetMetrics())
	t.Logf("Circuit breaker state: %v", circuitBreaker.GetState())

	t.Log("E2E full system integration test completed successfully")
}
