// Package model 健康检查模块
package model

import (
	"context"
	"sync"
	"time"

	"github.com/ai-chat/backend_go/internal/infra/circuitbreaker"
)

// HealthChecker 健康检查器接口
type HealthChecker interface {
	// Ping 执行ping检测
	Ping(ctx context.Context) error
	// GetStatus 获取健康状态
	GetStatus() *HealthStatus
	// IsHealthy 检查是否健康
	IsHealthy() bool
}

// HealthStatus 健康状态
type HealthStatus struct {
	ModelID       string        `json:"model_id"`             // 模型ID
	ModelName     string        `json:"model_name"`           // 模型名称
	Available     bool          `json:"available"`            // 是否可用
	LastCheckAt   int64         `json:"last_check_at"`        // 最后检查时间
	ResponseTime  time.Duration `json:"response_time"`        // 响应时间
	ErrorCount    int           `json:"error_count"`          // 连续错误次数
	SuccessCount  int           `json:"success_count"`        // 成功次数
	TotalReqCount int           `json:"total_req_count"`      // 总请求数
	ErrorRate     float64       `json:"error_rate"`           // 错误率
	LastError     string        `json:"last_error,omitempty"` // 最后错误信息
	CircuitState  CircuitState  `json:"circuit_state"`        // 熔断状态
}

// CircuitState 熔断状态
type CircuitState int

const (
	CircuitClosed   CircuitState = iota // 关闭
	CircuitOpen                         // 开启
	CircuitHalfOpen                     // 半开
)

// String 转换为字符串
func (s CircuitState) String() string {
	switch s {
	case CircuitClosed:
		return "closed"
	case CircuitOpen:
		return "open"
	case CircuitHalfOpen:
		return "half-open"
	default:
		return "unknown"
	}
}

// ModelHealthChecker 模型健康检查器
type ModelHealthChecker struct {
	modelID   string
	modelName string
	checker   HealthChecker
	cb        *circuitbreaker.CircuitBreaker
	threshold int           // 错误阈值
	interval  time.Duration // 检查间隔

	mu     sync.RWMutex
	status *HealthStatus
	stopCh chan struct{}
}

// DefaultHealthCheckerConfig 默认配置
var DefaultHealthCheckerConfig = struct {
	Threshold int
	Interval  time.Duration
}{
	Threshold: 5,
	Interval:  30 * time.Second,
}

// NewModelHealthChecker 创建健康检查器
func NewModelHealthChecker(modelID, modelName string, checker HealthChecker, cb *circuitbreaker.CircuitBreaker) *ModelHealthChecker {
	return &ModelHealthChecker{
		modelID:   modelID,
		modelName: modelName,
		checker:   checker,
		cb:        cb,
		threshold: DefaultHealthCheckerConfig.Threshold,
		interval:  DefaultHealthCheckerConfig.Interval,
		status: &HealthStatus{
			ModelID:     modelID,
			ModelName:   modelName,
			Available:   true,
			LastCheckAt: time.Now().Unix(),
		},
		stopCh: make(chan struct{}),
	}
}

// Ping 执行ping检测
func (h *ModelHealthChecker) Ping(ctx context.Context) error {
	return h.checker.Ping(ctx)
}

// GetStatus 获取健康状态
func (h *ModelHealthChecker) GetStatus() *HealthStatus {
	h.mu.RLock()
	defer h.mu.RUnlock()

	status := *h.status

	// 更新熔断状态
	if h.cb != nil {
		switch h.cb.GetState() {
		case circuitbreaker.StateClosed:
			status.CircuitState = CircuitClosed
		case circuitbreaker.StateOpen:
			status.CircuitState = CircuitOpen
		case circuitbreaker.StateHalfOpen:
			status.CircuitState = CircuitHalfOpen
		}
	}

	// 计算错误率
	if status.TotalReqCount > 0 {
		status.ErrorRate = float64(status.ErrorCount) / float64(status.TotalReqCount)
	}

	return &status
}

// IsHealthy 检查是否健康
func (h *ModelHealthChecker) IsHealthy() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()

	// 检查熔断器状态
	if h.cb != nil && h.cb.IsOpen() {
		return false
	}

	return h.status.Available
}

// UpdateFromResult 根据执行结果更新状态
func (h *ModelHealthChecker) UpdateFromResult(success bool, responseTime time.Duration, errMsg string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.status.TotalReqCount++
	h.status.LastCheckAt = time.Now().Unix()
	h.status.ResponseTime = responseTime

	if success {
		h.status.SuccessCount++
		h.status.ErrorCount = 0
		h.status.Available = true
		h.status.LastError = ""
	} else {
		h.status.ErrorCount++
		h.status.LastError = errMsg

		// 连续失败超过阈值标记为不可用
		if h.status.ErrorCount >= h.threshold {
			h.status.Available = false
		}
	}

	// 更新熔断状态
	if h.cb != nil {
		switch h.cb.GetState() {
		case circuitbreaker.StateClosed:
			h.status.CircuitState = CircuitClosed
		case circuitbreaker.StateOpen:
			h.status.CircuitState = CircuitOpen
		case circuitbreaker.StateHalfOpen:
			h.status.CircuitState = CircuitHalfOpen
		}
	}
}

// StartAutoCheck 启动自动健康检查
func (h *ModelHealthChecker) StartAutoCheck(ctx context.Context) {
	ticker := time.NewTicker(h.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-h.stopCh:
			return
		case <-ticker.C:
			if err := h.checker.Ping(ctx); err != nil {
				h.UpdateFromResult(false, 0, err.Error())
			} else {
				h.UpdateFromResult(true, h.status.ResponseTime, "")
			}
		}
	}
}

// Stop 停止健康检查
func (h *ModelHealthChecker) Stop() {
	close(h.stopCh)
}

// HealthCheckerFunc 函数类型健康检查器
type HealthCheckerFunc func(ctx context.Context) error

// Ping 实现健康检查接口
func (f HealthCheckerFunc) Ping(ctx context.Context) error {
	return f(ctx)
}

// AdaptiveHealthChecker 自适应健康检查器
// 根据错误率动态调整检查频率
type AdaptiveHealthChecker struct {
	modelID      string
	modelName    string
	checker      HealthChecker
	cb           *circuitbreaker.CircuitBreaker
	baseInterval time.Duration
	minInterval  time.Duration
	maxInterval  time.Duration

	mu              sync.RWMutex
	currentInterval time.Duration
	status          *HealthStatus
	stopCh          chan struct{}
}

// NewAdaptiveHealthChecker 创建自适应健康检查器
func NewAdaptiveHealthChecker(modelID, modelName string, checker HealthChecker, cb *circuitbreaker.CircuitBreaker) *AdaptiveHealthChecker {
	baseInterval := 30 * time.Second

	return &AdaptiveHealthChecker{
		modelID:         modelID,
		modelName:       modelName,
		checker:         checker,
		cb:              cb,
		baseInterval:    baseInterval,
		minInterval:     10 * time.Second,
		maxInterval:     5 * time.Minute,
		currentInterval: baseInterval,
		status: &HealthStatus{
			ModelID:   modelID,
			ModelName: modelName,
			Available: true,
		},
		stopCh: make(chan struct{}),
	}
}

// Ping 执行健康检查
func (h *AdaptiveHealthChecker) Ping(ctx context.Context) error {
	start := time.Now()
	err := h.checker.Ping(ctx)
	elapsed := time.Since(start)

	h.mu.Lock()
	defer h.mu.Unlock()

	h.status.TotalReqCount++
	h.status.LastCheckAt = time.Now().Unix()

	if err != nil {
		h.status.ErrorCount++
		h.status.LastError = err.Error()
		h.status.Available = false

		// 错误率升高，加快检查频率
		if h.status.TotalReqCount > 10 {
			errorRate := float64(h.status.ErrorCount) / float64(h.status.TotalReqCount)
			if errorRate > 0.5 {
				h.currentInterval = h.minInterval
			} else if errorRate > 0.2 {
				h.currentInterval = h.baseInterval / 2
			}
		}
	} else {
		h.status.SuccessCount++
		h.status.ErrorCount = 0
		h.status.Available = true
		h.status.LastError = ""
		h.status.ResponseTime = elapsed

		// 恢复正常，降低检查频率
		h.currentInterval = h.baseInterval
	}

	return err
}

// GetStatus 获取健康状态
func (h *AdaptiveHealthChecker) GetStatus() *HealthStatus {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.status
}

// IsHealthy 检查是否健康
func (h *AdaptiveHealthChecker) IsHealthy() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.status.Available && !h.cb.IsOpen()
}

// GetCurrentInterval 获取当前检查间隔
func (h *AdaptiveHealthChecker) GetCurrentInterval() time.Duration {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.currentInterval
}
