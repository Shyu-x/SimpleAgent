// Package model 模型注册表
// 提供模型客户端的注册、发现和管理功能
package model

import (
	"context" // context上下文，用于超时控制和取消信号
	"sync"
	"time"

	"github.com/ai-chat/backend_go/internal/infra/circuitbreaker"
)

// HealthInfo 健康状态信息 - 定义在domain层以便跨层使用
type HealthInfo struct {
	ModelID       string        `json:"model_id"`     // 模型ID
	ModelName     string        `json:"model_name"`   // 模型名称
	Available     bool          `json:"available"`    // 是否可用
	LastCheckAt   time.Time     `json:"last_check_at"` // 最后检查时间
	ResponseTime  time.Duration `json:"response_time"` // 响应时间
	ErrorCount    int           `json:"error_count"`  // 错误次数
	SuccessCount  int           `json:"success_count"` // 成功次数
	TotalReqCount int           `json:"total_req_count"` // 总请求数
	LastError     string        `json:"last_error,omitempty"` // 最后错误信息
	CircuitState  string        `json:"circuit_state"` // 熔断状态
}

// Registry 模型注册表接口
type Registry interface {
	// Register 注册模型客户端
	Register(name string, client ModelClient)
	// Unregister 注销模型
	Unregister(name string)
	// Get 获取模型客户端
	Get(name string) (ModelClient, bool)
	// List 列出所有已注册模型名称
	List() []string
	// GetInfo 获取模型信息
	GetInfo(name string) (*ModelInfo, bool)
	// ListInfos 列出所有模型信息
	ListInfos() []*ModelInfo
	// RegisterWithInfo 注册模型客户端及信息
	RegisterWithInfo(name string, client ModelClient, info *ModelInfo)
	// UpdateHealth 更新健康状态
	UpdateHealth(name string, status *HealthStatus)
	// GetHealth 获取健康状态
	GetHealth(name string) *HealthStatus
}

// ModelClient 模型客户端接口
type ModelClient interface {
	// Chat 发送聊天请求
	Chat(ctx context.Context, messages []Message, opts ...Option) (*Response, error)
	// StreamChat 流式聊天请求
	StreamChat(ctx context.Context, messages []Message, callback func(content string) error, opts ...Option) error
	// GetHealth 获取健康状态
	GetHealth() *HealthInfo
	// IsAvailable 检查是否可用
	IsAvailable() bool
	// Ping 健康检查
	Ping(ctx context.Context) error
	// GetModelName 获取模型名称
	GetModelName() string
	// GetCircuitBreaker 获取断路器
	GetCircuitBreaker() *circuitbreaker.CircuitBreaker
}

// InMemoryRegistry 内存模型注册表
type InMemoryRegistry struct {
	models map[string]*modelEntry
	mu     sync.RWMutex
}

type modelEntry struct {
	client ModelClient
	info   *ModelInfo
	health *HealthStatus
	mu     sync.RWMutex
	stopCh chan struct{}
}

// NewInMemoryRegistry 创建内存注册表
func NewInMemoryRegistry() *InMemoryRegistry {
	return &InMemoryRegistry{
		models: make(map[string]*modelEntry),
	}
}

// Register 注册模型客户端
func (r *InMemoryRegistry) Register(name string, client ModelClient) {
	r.mu.Lock()
	defer r.mu.Unlock()

	entry := &modelEntry{
		client: client,
		info: &ModelInfo{
			ID:      name,
			Name:    client.GetModelName(),
			Enabled: true,
		},
		health: &HealthStatus{
			ModelID:     name,
			ModelName:   client.GetModelName(),
			Available:   true,
			LastCheckAt: time.Now().Unix(),
		},
		stopCh: make(chan struct{}),
	}

	r.models[name] = entry

	// 启动健康检查
	go r.runHealthCheck(entry)
}

// runHealthCheck 运行健康检查
func (r *InMemoryRegistry) runHealthCheck(entry *modelEntry) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-entry.stopCh:
			return
		case <-ticker.C:
			if entry.client != nil {
				health := entry.client.GetHealth()
				entry.mu.Lock()
				entry.health.Available = health.Available
				entry.health.LastCheckAt = time.Now().Unix()
				entry.health.CircuitState = CircuitStateFromString(health.CircuitState)
				if health.LastError != "" {
					entry.health.LastError = health.LastError
				}
				entry.mu.Unlock()
			}
		}
	}
}

// CircuitStateFromString 从字符串转换为CircuitState
func CircuitStateFromString(state string) CircuitState {
	switch state {
	case "open":
		return CircuitOpen
	case "half-open":
		return CircuitHalfOpen
	default:
		return CircuitClosed
	}
}

// Unregister 注销模型
func (r *InMemoryRegistry) Unregister(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if entry, ok := r.models[name]; ok {
		close(entry.stopCh)
		delete(r.models, name)
	}
}

// Get 获取模型客户端
func (r *InMemoryRegistry) Get(name string) (ModelClient, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	entry, ok := r.models[name]
	if !ok {
		return nil, false
	}
	return entry.client, true
}

// List 列出所有已注册模型名称
func (r *InMemoryRegistry) List() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]string, 0, len(r.models))
	for name := range r.models {
		result = append(result, name)
	}
	return result
}

// GetInfo 获取模型信息
func (r *InMemoryRegistry) GetInfo(name string) (*ModelInfo, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	entry, ok := r.models[name]
	if !ok {
		return nil, false
	}
	return entry.info, true
}

// ListInfos 列出所有模型信息
func (r *InMemoryRegistry) ListInfos() []*ModelInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*ModelInfo, 0, len(r.models))
	for _, entry := range r.models {
		result = append(result, entry.info)
	}
	return result
}

// RegisterWithInfo 注册模型客户端及信息
func (r *InMemoryRegistry) RegisterWithInfo(name string, client ModelClient, info *ModelInfo) {
	r.mu.Lock()
	defer r.mu.Unlock()

	entry := &modelEntry{
		client: client,
		info:   info,
		health: &HealthStatus{
			ModelID:     name,
			ModelName:   info.Name,
			Available:   true,
			LastCheckAt: time.Now().Unix(),
		},
		stopCh: make(chan struct{}),
	}

	r.models[name] = entry

	// 启动健康检查
	go r.runHealthCheck(entry)
}

// UpdateHealth 更新健康状态
func (r *InMemoryRegistry) UpdateHealth(name string, status *HealthStatus) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if entry, ok := r.models[name]; ok {
		entry.mu.Lock()
		entry.health = status
		entry.mu.Unlock()
	}
}

// GetHealth 获取健康状态
func (r *InMemoryRegistry) GetHealth(name string) *HealthStatus {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if entry, ok := r.models[name]; ok {
		entry.mu.RLock()
		defer entry.mu.RUnlock()
		return entry.health
	}
	return nil
}

// GetDefaultRegistry 获取默认注册表（单例）
var defaultRegistry *InMemoryRegistry
var defaultRegistryOnce sync.Once

// GetDefaultRegistry 获取默认注册表
func GetDefaultRegistry() *InMemoryRegistry {
	defaultRegistryOnce.Do(func() {
		defaultRegistry = NewInMemoryRegistry()
	})
	return defaultRegistry
}
