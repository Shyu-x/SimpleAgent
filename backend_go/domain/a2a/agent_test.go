package a2a

import (
	"context"
	"sync"
	"testing"
	"time"
)

// TestAgentRegistryRegister 测试注册Agent
func TestAgentRegistryRegister(t *testing.T) {
	registry := NewAgentRegistry(time.Second)

	info := AgentInfo{
		ID:          "agent1",
		Name:        "Test Agent",
		Description: "A test agent",
	}

	err := registry.Register(info)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// 重复注册应覆盖
	err = registry.Register(info)
	if err != nil {
		t.Errorf("unexpected error on re-register: %v", err)
	}
}

// TestAgentRegistryUnregister 测试注销Agent
func TestAgentRegistryUnregister(t *testing.T) {
	registry := NewAgentRegistry(time.Second)

	info := AgentInfo{
		ID:   "agent1",
		Name: "Test Agent",
	}

	registry.Register(info)

	err := registry.Unregister("agent1")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// 注销后获取应失败
	_, err = registry.GetAgent("agent1")
	if err == nil {
		t.Error("expected error after unregister")
	}
}

// TestAgentRegistryGetAgent 测试获取Agent
func TestAgentRegistryGetAgent(t *testing.T) {
	registry := NewAgentRegistry(time.Second)

	info := AgentInfo{
		ID:          "agent1",
		Name:        "Test Agent",
		Description: "A test agent",
	}

	registry.Register(info)

	retrieved, err := registry.GetAgent("agent1")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if retrieved.ID != "agent1" {
		t.Errorf("expected ID 'agent1', got '%s'", retrieved.ID)
	}
	if retrieved.Name != "Test Agent" {
		t.Errorf("expected name 'Test Agent', got '%s'", retrieved.Name)
	}
}

// TestAgentRegistryGetAgentNotFound 测试获取不存在的Agent
func TestAgentRegistryGetAgentNotFound(t *testing.T) {
	registry := NewAgentRegistry(time.Second)

	_, err := registry.GetAgent("not_exist")
	if err == nil {
		t.Error("expected error for not found agent")
	}
}

// TestAgentRegistryListAgents 测试列出Agent
func TestAgentRegistryListAgents(t *testing.T) {
	registry := NewAgentRegistry(time.Second)

	for i := 0; i < 5; i++ {
		registry.Register(AgentInfo{
			ID:   "agent" + string(rune('0'+i)),
			Name: "Agent",
		})
	}

	agents := registry.ListAgents()
	if len(agents) != 5 {
		t.Errorf("expected 5 agents, got %d", len(agents))
	}
}

// TestAgentRegistryHeartbeat 测试心跳
func TestAgentRegistryHeartbeat(t *testing.T) {
	registry := NewAgentRegistry(time.Second)

	info := AgentInfo{
		ID:   "agent1",
		Name: "Test Agent",
	}

	registry.Register(info)

	err := registry.Heartbeat("agent1")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	agent, _ := registry.GetAgent("agent1")
	if agent.Status != AgentStatusOnline {
		t.Errorf("expected status online, got %s", agent.Status)
	}
}

// TestAgentRegistryHeartbeatNotFound 测试不存在的心跳
func TestAgentRegistryHeartbeatNotFound(t *testing.T) {
	registry := NewAgentRegistry(time.Second)

	err := registry.Heartbeat("not_exist")
	if err == nil {
		t.Error("expected error for not found agent")
	}
}

// TestInMemoryMessageQueueSendReceive 测试消息队列发送和接收
func TestInMemoryMessageQueueSendReceive(t *testing.T) {
	queue := NewInMemoryMessageQueue(100)

	msg := Message{
		ID:      "msg1",
		From:    "agent1",
		To:      "agent2",
		Type:    MessageTypeTask,
		Content: "test content",
	}

	err := queue.Send(msg)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// 接收消息
	ctx := context.Background()
	received, err := queue.Receive(ctx, "agent2")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if received.ID != "msg1" {
		t.Errorf("expected ID 'msg1', got '%s'", received.ID)
	}
}

// TestInMemoryMessageQueueFull 测试消息队列满
func TestInMemoryMessageQueueFull(t *testing.T) {
	// 缓冲区为1的队列
	queue := NewInMemoryMessageQueue(1)

	msg1 := Message{ID: "msg1", To: "agent1"}
	msg2 := Message{ID: "msg2", To: "agent1"}

	err := queue.Send(msg1)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// 第二个消息应被拒绝
	err = queue.Send(msg2)
	if err == nil {
		t.Error("expected error when queue is full")
	}
}

// TestInMemoryMessageQueueSubscribe 测试消息订阅
func TestInMemoryMessageQueueSubscribe(t *testing.T) {
	queue := NewInMemoryMessageQueue(100)

	sub, err := queue.Subscribe("agent1")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// 发送消息
	msg := Message{ID: "msg1", To: "agent1", Content: "hello"}
	queue.Send(msg)

	// 接收订阅消息
	select {
	case received := <-sub:
		if received.ID != "msg1" {
			t.Errorf("expected ID 'msg1', got '%s'", received.ID)
		}
	case <-time.After(time.Second):
		t.Error("timeout waiting for message")
	}
}

// TestInMemoryMessageQueueUnsubscribe 测试取消订阅
func TestInMemoryMessageQueueUnsubscribe(t *testing.T) {
	queue := NewInMemoryMessageQueue(100)

	queue.Subscribe("agent1")

	err := queue.Unsubscribe("agent1")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

// TestInMemoryMessageQueueReceiveCancel 测试接收取消
func TestInMemoryMessageQueueReceiveCancel(t *testing.T) {
	queue := NewInMemoryMessageQueue(100)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := queue.Receive(ctx, "agent1")
	if err == nil {
		t.Error("expected error when context is cancelled")
	}
}

// TestA2AClientSendTask 测试发送任务
func TestA2AClientSendTask(t *testing.T) {
	registry := NewAgentRegistry(time.Second)
	queue := NewInMemoryMessageQueue(100)

	registry.Register(AgentInfo{
		ID:   "target_agent",
		Name: "Target Agent",
	})

	client := NewA2AClient(registry, queue)

	task := &Task{
		ID:      "task1",
		Type:    "test",
		Input:   "test input",
		Status:  TaskStatusPending,
	}

	result, err := client.SendTask(context.Background(), "target_agent", task)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.ID != "task1" {
		t.Errorf("expected task ID 'task1', got '%s'", result.ID)
	}
}

// TestA2AClientSendTaskAgentNotFound 测试发送给不存在的Agent
func TestA2AClientSendTaskAgentNotFound(t *testing.T) {
	registry := NewAgentRegistry(time.Second)
	queue := NewInMemoryMessageQueue(100)

	client := NewA2AClient(registry, queue)

	_, err := client.SendTask(context.Background(), "not_exist", &Task{ID: "task1"})
	if err == nil {
		t.Error("expected error for not found agent")
	}
}

// TestMessage 测试消息结构
func TestMessage(t *testing.T) {
	msg := Message{
		ID:        "msg1",
		From:      "agent1",
		To:        "agent2",
		Type:      MessageTypeTask,
		Content:   "test content",
		Timestamp: time.Now(),
		Metadata:  map[string]interface{}{"key": "value"},
	}

	if msg.ID != "msg1" {
		t.Errorf("expected ID 'msg1', got '%s'", msg.ID)
	}
	if msg.Type != MessageTypeTask {
		t.Errorf("expected type MessageTypeTask, got %s", msg.Type)
	}
}

// TestTask 测试任务结构
func TestTask(t *testing.T) {
	now := time.Now()
	task := Task{
		ID:        "task1",
		AgentID:   "agent1",
		Type:      "test",
		Input:     "test input",
		Output:    "test output",
		Status:    TaskStatusCompleted,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if task.ID != "task1" {
		t.Errorf("expected ID 'task1', got '%s'", task.ID)
	}
	if task.Status != TaskStatusCompleted {
		t.Errorf("expected status TaskStatusCompleted, got %s", task.Status)
	}
}

// TestAgentInfo 测试Agent信息结构
func TestAgentInfo(t *testing.T) {
	info := AgentInfo{
		ID:          "agent1",
		Name:        "Test Agent",
		Description: "A test agent",
		Capabilities: []string{"cap1", "cap2"},
		Metadata:    map[string]interface{}{"version": "1.0"},
		Status:      AgentStatusOnline,
		LastHeartbeat: time.Now(),
	}

	if info.ID != "agent1" {
		t.Errorf("expected ID 'agent1', got '%s'", info.ID)
	}
	if info.Status != AgentStatusOnline {
		t.Errorf("expected status online, got %s", info.Status)
	}
	if len(info.Capabilities) != 2 {
		t.Errorf("expected 2 capabilities, got %d", len(info.Capabilities))
	}
}

// TestMessageTypes 测试消息类型常量
func TestMessageTypes(t *testing.T) {
	if MessageTypeTask != "task" {
		t.Errorf("expected MessageTypeTask to be 'task', got '%s'", MessageTypeTask)
	}
	if MessageTypeResult != "result" {
		t.Errorf("expected MessageTypeResult to be 'result', got '%s'", MessageTypeResult)
	}
	if MessageTypeError != "error" {
		t.Errorf("expected MessageTypeError to be 'error', got '%s'", MessageTypeError)
	}
}

// TestTaskStatuses 测试任务状态常量
func TestTaskStatuses(t *testing.T) {
	if TaskStatusPending != "pending" {
		t.Errorf("expected TaskStatusPending to be 'pending', got '%s'", TaskStatusPending)
	}
	if TaskStatusRunning != "running" {
		t.Errorf("expected TaskStatusRunning to be 'running', got '%s'", TaskStatusRunning)
	}
	if TaskStatusCompleted != "completed" {
		t.Errorf("expected TaskStatusCompleted to be 'completed', got '%s'", TaskStatusCompleted)
	}
	if TaskStatusFailed != "failed" {
		t.Errorf("expected TaskStatusFailed to be 'failed', got '%s'", TaskStatusFailed)
	}
}

// TestAgentRegistryConcurrency 测试Agent注册表并发
func TestAgentRegistryConcurrency(t *testing.T) {
	registry := NewAgentRegistry(time.Second)

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			registry.Register(AgentInfo{
				ID:   "agent" + string(rune('0'+id%10)),
				Name: "Agent",
			})
		}(i)
	}

	wg.Wait()

	agents := registry.ListAgents()
	if len(agents) == 0 {
		t.Error("expected at least one agent")
	}
}

// TestGenerateID 测试ID生成
func TestGenerateID(t *testing.T) {
	id1 := generateID()
	id2 := generateID()

	if id1 == "" {
		t.Error("expected non-empty ID")
	}
	if id1 == id2 {
		t.Error("expected different IDs")
	}
}

// TestMessageQueueInterface 测试消息队列接口
func TestMessageQueueInterface(t *testing.T) {
	// 确保实现了接口
	var _ MessageQueue = (*InMemoryMessageQueue)(nil)
}

// TestAgentRegistryInterface 测试Agent注册表接口
func TestAgentRegistryInterface(t *testing.T) {
	// 确保实现了接口
	var _ AgentRegistry = (*agentRegistry)(nil)
}

// TestA2AClientInterface 测试A2A客户端接口
func TestA2AClientInterface(t *testing.T) {
	// 确保实现了接口
	var _ A2AClient = (*a2aClient)(nil)
}
