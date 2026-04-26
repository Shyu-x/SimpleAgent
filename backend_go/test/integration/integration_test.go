package integration

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

// TestChatFlow 测试聊天流程
func TestChatFlow(t *testing.T) {
	// 创建模型路由器
	router := model.NewMiniMaxRouter()

	// 注册模拟模型
	mockModel := model.NewMockChatModel("test-model")
	router.RegisterModel(mockModel, 10)

	// 创建聊天请求
	req := model.ChatRequest{
		Model: "test-model",
		Messages: []model.ChatMessage{
			{Role: "user", Content: "Hello, how are you?"},
		},
		Stream: false,
	}

	// 发送请求
	resp, err := router.Route(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Model != "test-model" {
		t.Errorf("expected model 'test-model', got '%s'", resp.Model)
	}

	if resp.Content == "" {
		t.Error("expected non-empty content")
	}

	t.Logf("Chat response: %s", resp.Content)
}

// TestAgentExecutionFlow 测试Agent执行流程
func TestAgentExecutionFlow(t *testing.T) {
	// 创建工具执行器
	executor := agent.NewExecutor(time.Second)

	// 注册工具
	searchTool := agent.NewSimpleTool("search", "Search tool", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
		return "search results for: " + params["input"].(string), nil
	})

	calculatorTool := agent.NewSimpleTool("calculate", "Calculator tool", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
		return "calculation result", nil
	})

	executor.RegisterTool(searchTool)
	executor.RegisterTool(calculatorTool)

	// 创建Agent
	reactAgent := agent.NewReActAgent(agent.AgentConfig{
		Name:          "test-agent",
		MaxIterations: 5,
		Tools:         []agent.Tool{searchTool, calculatorTool},
	}, executor)

	// 执行Agent
	response, err := reactAgent.Execute(context.Background(), "search for AI news")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if response == "" {
		t.Error("expected non-empty response")
	}

	// 检查记忆
	memory := reactAgent.GetMemory()
	if len(memory) < 2 {
		t.Errorf("expected at least 2 messages in memory, got %d", len(memory))
	}

	t.Logf("Agent response: %s", response)
}

// TestRAGPipelineFlow 测试RAG流水线
func TestRAGPipelineFlow(t *testing.T) {
	// 创建组件
	rewriteService := rag.NewQueryRewriteService()
	vectorStore := rag.NewSimpleVectorStore()
	reranker := rag.NewCrossEncoderReranker("")

	// 创建RAG流水线
	pipeline := rag.NewRAGPipeline(rewriteService, vectorStore, reranker, rag.RetrievalConfig{
		TopK:         5,
		EnableRerank: true,
		RerankTopK:   10,
	})

	// 插入文档
	chunks := []rag.Chunk{
		{
			ID:         "chunk1",
			DocumentID: "doc1",
			Content:    "Artificial intelligence (AI) is a branch of computer science.",
			Embedding:  []float32{1, 0, 0, 0},
		},
		{
			ID:         "chunk2",
			DocumentID: "doc1",
			Content:    "Machine learning is a subset of AI that enables systems to learn.",
			Embedding:  []float32{0.8, 0.2, 0, 0},
		},
		{
			ID:         "chunk3",
			DocumentID: "doc2",
			Content:    "Deep learning uses neural networks with many layers.",
			Embedding:  []float32{0.3, 0.7, 0, 0},
		},
	}

	err := vectorStore.Insert(context.Background(), chunks)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// 执行查询
	queryEmbedding := []float32{1, 0, 0, 0}
	results, err := pipeline.Query(context.Background(), "What is AI?", queryEmbedding)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(results) == 0 {
		t.Error("expected at least one result")
	}

	// 验证第一个结果是chunk1（最相似）
	if results[0].Chunk.ID != "chunk1" {
		t.Errorf("expected chunk1 first, got %s", results[0].Chunk.ID)
	}

	t.Logf("RAG results: %d chunks retrieved", len(results))
}

// TestA2AAgentCommunication 测试A2A Agent通信
func TestA2AAgentCommunication(t *testing.T) {
	// 创建Agent注册表
	registry := a2a.NewAgentRegistry(time.Second)

	// 注册Agent
	agent1 := a2a.AgentInfo{
		ID:          "agent1",
		Name:        "Agent One",
		Description: "First agent",
		Capabilities: []string{"search", "calculate"},
	}

	agent2 := a2a.AgentInfo{
		ID:          "agent2",
		Name:        "Agent Two",
		Description: "Second agent",
		Capabilities: []string{"analyze", "report"},
	}

	err := registry.Register(agent1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	err = registry.Register(agent2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// 创建消息队列
	queue := a2a.NewInMemoryMessageQueue(100)

	// 创建A2A客户端
	client := a2a.NewA2AClient(registry, queue)

	// 创建任务
	task := &a2a.Task{
		ID:      "task1",
		AgentID: "agent2",
		Type:    "analysis",
		Input:   "analyze this data",
		Status:  a2a.TaskStatusPending,
	}

	// 发送任务
	result, err := client.SendTask(context.Background(), "agent2", task)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.ID != "task1" {
		t.Errorf("expected task ID 'task1', got '%s'", result.ID)
	}

	// 验证Agent状态
	agents := registry.ListAgents()
	if len(agents) != 2 {
		t.Errorf("expected 2 agents, got %d", len(agents))
	}

	t.Logf("A2A task sent successfully: %s", result.ID)
}

// TestCircuitBreakerIntegration 测试熔断器集成
func TestCircuitBreakerIntegration(t *testing.T) {
	// 创建熔断器
	cb := circuitbreaker.New(circuitbreaker.Config{
		FailureThreshold: 3,
		SuccessThreshold: 2,
		Timeout:          100 * time.Millisecond,
	})

	// 模拟服务
	var callCount int

	// 前3次调用应失败（熔断开启）
	for i := 0; i < 3; i++ {
		err := cb.Execute(func() error {
			callCount++
			if callCount <= 3 {
				return circuitbreaker.ErrCircuitOpen
			}
			return nil
		})
		if err == nil {
			t.Errorf("call %d: expected error, got nil", i+1)
		}
	}

	// 状态应为Open
	if cb.GetState() != circuitbreaker.StateOpen {
		t.Errorf("expected state Open, got %v", cb.GetState())
	}

	// 等待超时
	time.Sleep(150 * time.Millisecond)

	// 再次调用应进入HalfOpen
	cb.Execute(func() error {
		return nil
	})

	if cb.GetState() != circuitbreaker.StateHalfOpen {
		t.Errorf("expected state HalfOpen, got %v", cb.GetState())
	}

	t.Logf("Circuit breaker integration test passed, callCount: %d", callCount)
}

// TestRateLimiterIntegration 测试限流器集成
func TestRateLimiterIntegration(t *testing.T) {
	// 创建限流器
	limiter := ratelimiter.NewTokenBucket(ratelimiter.Config{
		Capacity:   10,
		RefillRate: 5,
	})

	// 前10个请求应通过
	for i := 0; i < 10; i++ {
		if !limiter.Allow() {
			t.Errorf("request %d should be allowed", i+1)
		}
	}

	// 第11个请求应被拒绝
	if limiter.Allow() {
		t.Error("request 11 should be rejected")
	}

	// 获取指标
	metrics := limiter.GetMetrics()
	if metrics.TotalRequests != 11 {
		t.Errorf("expected 11 total requests, got %d", metrics.TotalRequests)
	}
	if metrics.AllowedCount != 10 {
		t.Errorf("expected 10 allowed, got %d", metrics.AllowedCount)
	}
	if metrics.RejectedCount != 1 {
		t.Errorf("expected 1 rejected, got %d", metrics.RejectedCount)
	}

	t.Logf("Rate limiter integration test passed")
}

// TestMultiAgentWorkflow 测试多Agent工作流
func TestMultiAgentWorkflow(t *testing.T) {
	// 创建Agent注册表
	registry := a2a.NewAgentRegistry(time.Second)

	// 注册多个Agent
	agents := []a2a.AgentInfo{
		{ID: "coordinator", Name: "Coordinator", Capabilities: []string{"coordinate"}},
		{ID: "researcher", Name: "Researcher", Capabilities: []string{"search", "analyze"}},
		{ID: "reporter", Name: "Reporter", Capabilities: []string{"format", "present"}},
	}

	for _, a := range agents {
		if err := registry.Register(a); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	}

	// 创建消息队列
	queue := a2a.NewInMemoryMessageQueue(100)

	// 创建A2A客户端
	client := a2a.NewA2AClient(registry, queue)

	// 模拟工作流：coordinator -> researcher -> reporter
	workflow := []struct {
		from  string
		to    string
		task  *a2a.Task
	}{
		{
			from: "system",
			to:   "coordinator",
			task: &a2a.Task{ID: "task1", AgentID: "coordinator", Type: "coordinate"},
		},
		{
			from: "coordinator",
			to:   "researcher",
			task: &a2a.Task{ID: "task2", AgentID: "researcher", Type: "research"},
		},
		{
			from: "researcher",
			to:   "reporter",
			task: &a2a.Task{ID: "task3", AgentID: "reporter", Type: "report"},
		},
	}

	// 执行工作流
	for _, step := range workflow {
		_, err := client.SendTask(context.Background(), step.to, step.task)
		if err != nil {
			t.Fatalf("workflow step %s -> %s failed: %v", step.from, step.to, err)
		}
	}

	// 验证所有Agent仍在线
	onlineAgents := registry.ListAgents()
	if len(onlineAgents) != 3 {
		t.Errorf("expected 3 online agents, got %d", len(onlineAgents))
	}

	t.Logf("Multi-agent workflow test passed")
}

// TestEndToEndChatWithRAG 测试端到端聊天+RAG流程
func TestEndToEndChatWithRAG(t *testing.T) {
	// 1. 初始化RAG系统
	rewriteService := rag.NewQueryRewriteService()
	vectorStore := rag.NewSimpleVectorStore()
	reranker := rag.NewCrossEncoderReranker("")

	pipeline := rag.NewRAGPipeline(rewriteService, vectorStore, reranker, rag.RetrievalConfig{
		TopK:         3,
		EnableRerank: true,
	})

	// 2. 插入知识库文档
	knowledgeChunks := []rag.Chunk{
		{
			ID:         "kb1",
			DocumentID: "kb",
			Content:    "The capital of France is Paris.",
			Embedding:  []float32{1, 0, 0},
		},
		{
			ID:         "kb2",
			DocumentID: "kb",
			Content:    "Paris is also known as the City of Light.",
			Embedding:  []float32{0.9, 0.1, 0},
		},
	}

	vectorStore.Insert(context.Background(), knowledgeChunks)

	// 3. 初始化模型路由
	router := model.NewMiniMaxRouter()
	mockModel := model.NewMockChatModel("test-model")
	router.RegisterModel(mockModel, 10)

	// 4. 模拟用户查询
	userQuery := "What is the capital of France?"

	// 5. RAG检索
	results, err := pipeline.Query(context.Background(), userQuery, []float32{1, 0, 0})
	if err != nil {
		t.Fatalf("RAG query failed: %v", err)
	}

	// 6. 组装上下文
	contextStr := "Based on the knowledge base:\n"
	for _, r := range results {
		contextStr += "- " + r.Chunk.Content + "\n"
	}
	contextStr += "\nUser question: " + userQuery

	// 7. 调用模型
	chatResp, err := router.Route(context.Background(), model.ChatRequest{
		Model: "test-model",
		Messages: []model.ChatMessage{
			{Role: "system", Content: "You are a helpful assistant. Use the provided context to answer questions."},
			{Role: "user", Content: contextStr},
		},
	})

	if err != nil {
		t.Fatalf("Model chat failed: %v", err)
	}

	t.Logf("User query: %s", userQuery)
	t.Logf("Retrieved context: %d chunks", len(results))
	t.Logf("Model response: %s", chatResp.Content)
}

// TestEndToEndAgentWithTools 测试端到端Agent+工具流程
func TestEndToEndAgentWithTools(t *testing.T) {
	// 1. 创建Agent执行器
	executor := agent.NewExecutor(time.Second)

	// 2. 注册工具
	tools := []agent.Tool{
		agent.NewSimpleTool("web_search", "Search the web", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
			query, _ := params["input"].(string)
			return "Web search results for: " + query, nil
		}),
		agent.NewSimpleTool("calculator", "Perform calculation", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
			return "Calculation result: 42", nil
		}),
		agent.NewSimpleTool("weather", "Get weather info", func(ctx context.Context, params map[string]interface{}) (interface{}, error) {
			city, _ := params["input"].(string)
			return "Weather in " + city + ": Sunny, 25°C", nil
		}),
	}

	for _, tool := range tools {
		executor.RegisterTool(tool)
	}

	// 3. 创建Agent
	reactAgent := agent.NewReActAgent(agent.AgentConfig{
		Name:          "assistant",
		MaxIterations: 10,
		Tools:         tools,
	}, executor)

	// 4. 用户请求
	userRequest := "What's the weather in Tokyo and calculate 15 * 3?"

	// 5. Agent处理
	response, toolResults, err := reactAgent.ExecuteWithTools(context.Background(), userRequest)
	if err != nil {
		t.Fatalf("Agent execution failed: %v", err)
	}

	t.Logf("User request: %s", userRequest)
	t.Logf("Agent response: %s", response)
	t.Logf("Tools executed: %d", len(toolResults))

	for _, tr := range toolResults {
		t.Logf("  - %s: %v", tr.ToolName, tr.Result)
	}
}
