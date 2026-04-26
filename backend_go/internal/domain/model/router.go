package model

import (
	"sync"
	"time"
)

// ModelRegistry 模型注册表
type ModelRegistry struct {
	models    map[string]*ModelInfo
	health    map[string]*HealthStatus
	mu        sync.RWMutex
	checkInterval time.Duration
}

// NewModelRegistry 创建模型注册表
func NewModelRegistry() *ModelRegistry {
	return &ModelRegistry{
		models:       make(map[string]*ModelInfo),
		health:       make(map[string]*HealthStatus),
		checkInterval: 30 * time.Second,
	}
}

// Register 注册模型
func (r *ModelRegistry) Register(model *ModelInfo) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.models[model.ID] = model
	r.health[model.ID] = &HealthStatus{
		ModelID:    model.ID,
		Available:  true,
		LastCheckAt: time.Now().Unix(),
	}
}

// Unregister 注销模型
func (r *ModelRegistry) Unregister(modelID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.models, modelID)
	delete(r.health, modelID)
}

// Get 获取模型信息
func (r *ModelRegistry) Get(modelID string) (*ModelInfo, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	m, ok := r.models[modelID]
	return m, ok
}

// List 列出所有模型
func (r *ModelRegistry) List() []*ModelInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*ModelInfo, 0, len(r.models))
	for _, m := range r.models {
		result = append(result, m)
	}
	return result
}

// GetHealth 获取健康状态
func (r *ModelRegistry) GetHealth(modelID string) *HealthStatus {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.health[modelID]
}

// UpdateHealth 更新健康状态
func (r *ModelRegistry) UpdateHealth(modelID string, status *HealthStatus) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.health[modelID] = status
}

// DefaultRouter 默认模型路由器实现
type DefaultRouter struct {
	registry *ModelRegistry
	mu       sync.RWMutex
}

// NewDefaultRouter 创建默认路由器
func NewDefaultRouter(registry *ModelRegistry) *DefaultRouter {
	return &DefaultRouter{
		registry: registry,
	}
}

// SelectModel 选择最佳模型
func (r *DefaultRouter) SelectModel(taskType ModelType) (*ModelInfo, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var best *ModelInfo
	for _, m := range r.registry.models {
		if !m.Enabled {
			continue
		}
		if m.Type != taskType && taskType != ModelTypeChat {
			continue
		}
		if best == nil || m.Priority < best.Priority {
			health := r.registry.health[m.ID]
			if health != nil && health.Available {
				best = m
			}
		}
	}

	if best == nil {
		return nil, ErrNoAvailableModel
	}
	return best, nil
}

// GetAllModels 获取所有可用模型
func (r *DefaultRouter) GetAllModels() []*ModelInfo {
	return r.registry.List()
}

// HealthCheck 健康检查
func (r *DefaultRouter) HealthCheck(modelID string) (*HealthStatus, error) {
	return r.registry.GetHealth(modelID), nil
}

// RegisterModel 注册模型
func (r *DefaultRouter) RegisterModel(model *ModelInfo) error {
	r.registry.Register(model)
	return nil
}

// UnregisterModel 注销模型
func (r *DefaultRouter) UnregisterModel(modelID string) error {
	r.registry.Unregister(modelID)
	return nil
}
