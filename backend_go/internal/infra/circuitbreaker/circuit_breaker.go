// Package circuitbreaker 熔断器实现
// 基于 sony/gobreaker 实现，支持状态回调、指标暴露
package circuitbreaker

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/sony/gobreaker"

	"github.com/rs/zerolog/log"
)

// CircuitState 熔断器状态
type CircuitState int

const (
	StateClosed CircuitState = iota // 关闭状态
	StateOpen                       // 开启状态
	StateHalfOpen                   // 半开状态
)

// String 转换为字符串
func (s CircuitState) String() string {
	switch s {
	case StateClosed:
		return "closed"
	case StateOpen:
		return "open"
	case StateHalfOpen:
		return "half-open"
	default:
		return "unknown"
	}
}

// StateToGobreakerState 转换状态
func StateToGobreakerState(state gobreaker.State) CircuitState {
	switch state {
	case gobreaker.StateClosed:
		return StateClosed
	case gobreaker.StateOpen:
		return StateOpen
	case gobreaker.StateHalfOpen:
		return StateHalfOpen
	default:
		return StateClosed
	}
}

// Config 熔断器配置
type Config struct {
	// 失败阈值，达到后开启熔断 (默认5)
	FailureThreshold int
	// 成功阈值，半开状态下达到后关闭熔断 (默认3)
	SuccessThreshold int
	// 恢复超时(秒)，到期后进入半开状态 (默认30)
	RecoveryTimeout int
	// 强制关闭
	ForceClosed bool
	// 强制开启
	ForceOpen bool
	// 滑动窗口大小(秒)，用于计算失败率 (默认60)
	WindowSize int
	// 失败率阈值(百分比)，达到后开启熔断 (默认50)
	FailureRateThreshold float64
}

// DefaultConfig 默认配置
var DefaultConfig = Config{
	FailureThreshold:    5,
	SuccessThreshold:    3,
	RecoveryTimeout:      30,
	WindowSize:           60,
	FailureRateThreshold: 50.0,
}

// StateChangeFunc 状态变更回调
type StateChangeFunc func(name string, from CircuitState, to CircuitState)

// SuccessFunc 成功回调
type SuccessFunc func(name string, duration time.Duration)

// FailureFunc 失败回调
type FailureFunc func(name string, err error, duration time.Duration)

// CircuitBreaker 熔断器
type CircuitBreaker struct {
	name            string
	cb              *gobreaker.CircuitBreaker
	metrics         *Metrics
	stateChangeFunc StateChangeFunc
	successFunc     SuccessFunc
	failureFunc     FailureFunc
	mu              sync.RWMutex
	stateChangeCount uint64
}

// Metrics 熔断器指标
type Metrics struct {
	SuccessCount      uint64
	FailureCount     uint64
	TotalReqCount    uint64
	RejectionCount   uint64
	StateChangeCount uint64
	ConsecutiveSuccess uint64
	ConsecutiveFailure uint64
	LastStateChange   time.Time
}

// 全局熔断器注册表和指标收集器
var (
	circuitBreakers = make(map[string]*CircuitBreaker)
	breakersMu      sync.RWMutex

	// Prometheus指标
	breakerStateGauge = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "circuit_breaker_state",
		Help: "Current state of circuit breaker (0=closed, 1=open, 2=half-open)",
	}, []string{"name"})

	breakerRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "circuit_breaker_requests_total",
		Help: "Total number of requests through circuit breaker",
	}, []string{"name", "result"})

	breakerDurationHistogram = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "circuit_breaker_request_duration_seconds",
		Help:    "Request duration through circuit breaker",
		Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
	}, []string{"name"})

	breakerStateChangesTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "circuit_breaker_state_changes_total",
		Help: "Total number of circuit breaker state changes",
	}, []string{"name", "from_state", "to_state"})
)

// New 创建熔断器
func New(name string, cfg Config, opts ...Option) (*CircuitBreaker, error) {
	if cfg.FailureThreshold <= 0 {
		cfg.FailureThreshold = DefaultConfig.FailureThreshold
	}
	if cfg.SuccessThreshold <= 0 {
		cfg.SuccessThreshold = DefaultConfig.SuccessThreshold
	}
	if cfg.RecoveryTimeout <= 0 {
		cfg.RecoveryTimeout = DefaultConfig.RecoveryTimeout
	}
	if cfg.WindowSize <= 0 {
		cfg.WindowSize = DefaultConfig.WindowSize
	}

	breaker := &CircuitBreaker{
		name:    name,
		metrics: &Metrics{},
	}

	// 应用选项
	for _, opt := range opts {
		opt(breaker)
	}

	settings := gobreaker.Settings{
		Name:        name,
		MaxRequests: uint32(cfg.SuccessThreshold),
		Interval:    time.Duration(cfg.WindowSize) * time.Second,
		Timeout:     time.Duration(cfg.RecoveryTimeout) * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			if counts.ConsecutiveFailures >= uint32(cfg.FailureThreshold) {
				return true
			}
			if counts.Requests > 0 && cfg.FailureRateThreshold > 0 {
				failureRate := float64(counts.TotalFailures) / float64(counts.Requests) * 100
				return failureRate >= cfg.FailureRateThreshold
			}
			return false
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			breaker.mu.Lock()
			breaker.metrics.StateChangeCount++
			breaker.metrics.LastStateChange = time.Now()
			breaker.stateChangeCount++
			breaker.mu.Unlock()

			fromState := StateToGobreakerState(from)
			toState := StateToGobreakerState(to)

			// 更新Prometheus指标
			breakerStateGauge.WithLabelValues(name).Set(float64(toState))
			breakerStateChangesTotal.WithLabelValues(name, from.String(), to.String()).Inc()

			log.Info().
				Str("name", name).
				Str("from", from.String()).
				Str("to", to.String()).
				Msg("熔断器状态变更")

			if breaker.stateChangeFunc != nil {
				go func() {
					defer func() {
						if r := recover(); r != nil {
							log.Error().Interface("panic", r).Msg("StateChange callback panicked")
						}
					}()
					breaker.stateChangeFunc(name, fromState, toState)
				}()
			}
		},
	}

	cb := gobreaker.NewCircuitBreaker(settings)
	breaker.cb = cb

	// 注册到全局表
	breakersMu.Lock()
	circuitBreakers[name] = breaker
	breakersMu.Unlock()

	return breaker, nil
}

// Option 配置选项
type Option func(*CircuitBreaker)

// WithStateChangeCallback 设置状态变更回调
func WithStateChangeCallback(fn StateChangeFunc) Option {
	return func(cb *CircuitBreaker) {
		cb.stateChangeFunc = fn
	}
}

// WithSuccessCallback 设置成功回调
func WithSuccessCallback(fn SuccessFunc) Option {
	return func(cb *CircuitBreaker) {
		cb.successFunc = fn
	}
}

// WithFailureCallback 设置失败回调
func WithFailureCallback(fn FailureFunc) Option {
	return func(cb *CircuitBreaker) {
		cb.failureFunc = fn
	}
}

// Execute 执行请求
func (cb *CircuitBreaker) Execute(ctx context.Context, fn func() error) error {
	start := time.Now()
	result, err := cb.cb.Execute(func() (interface{}, error) {
		return nil, fn()
	})

	duration := time.Since(start)

	if err != nil {
		cb.onFailure(err, duration)
		breakerRequestsTotal.WithLabelValues(cb.name, "failure").Inc()
		breakerDurationHistogram.WithLabelValues(cb.name).Observe(duration.Seconds())
		return err.(error)
	}

	cb.onSuccess(duration)
	breakerRequestsTotal.WithLabelValues(cb.name, "success").Inc()
	breakerDurationHistogram.WithLabelValues(cb.name).Observe(duration.Seconds())
	_ = result
	return nil
}

// ExecuteWithResult 执行请求并返回结果
func (cb *CircuitBreaker) ExecuteWithResult(ctx context.Context, fn func() (interface{}, error)) (interface{}, error) {
	start := time.Now()
	result, err := cb.cb.Execute(fn)
	duration := time.Since(start)

	if err != nil {
		cb.onFailure(err, duration)
		breakerRequestsTotal.WithLabelValues(cb.name, "failure").Inc()
		breakerDurationHistogram.WithLabelValues(cb.name).Observe(duration.Seconds())
		return nil, err
	}

	cb.onSuccess(duration)
	breakerRequestsTotal.WithLabelValues(cb.name, "success").Inc()
	breakerDurationHistogram.WithLabelValues(cb.name).Observe(duration.Seconds())
	return result, nil
}

func (cb *CircuitBreaker) onSuccess(duration time.Duration) {
	cb.mu.Lock()
	cb.metrics.SuccessCount++
	cb.metrics.ConsecutiveSuccess++
	cb.metrics.ConsecutiveFailure = 0
	cb.mu.Unlock()

	if cb.successFunc != nil {
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Error().Interface("panic", r).Msg("Success callback panicked")
				}
			}()
			cb.successFunc(cb.name, duration)
		}()
	}
}

func (cb *CircuitBreaker) onFailure(err error, duration time.Duration) {
	cb.mu.Lock()
	cb.metrics.FailureCount++
	cb.metrics.ConsecutiveFailure++
	cb.metrics.ConsecutiveSuccess = 0
	cb.mu.Unlock()

	if cb.failureFunc != nil {
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Error().Interface("panic", r).Msg("Failure callback panicked")
				}
			}()
			cb.failureFunc(cb.name, err, duration)
		}()
	}
}

// GetState 获取当前状态
func (cb *CircuitBreaker) GetState() CircuitState {
	return StateToGobreakerState(cb.cb.State())
}

// IsOpen 检查熔断器是否开启
func (cb *CircuitBreaker) IsOpen() bool {
	return cb.cb.State() == gobreaker.StateOpen
}

// IsClosed 检查熔断器是否关闭
func (cb *CircuitBreaker) IsClosed() bool {
	return cb.cb.State() == gobreaker.StateClosed
}

// IsHalfOpen 检查熔断器是否半开
func (cb *CircuitBreaker) IsHalfOpen() bool {
	return cb.cb.State() == gobreaker.StateHalfOpen
}

// GetMetrics 获取指标
func (cb *CircuitBreaker) GetMetrics() Metrics {
	counts := cb.cb.Counts()
	cb.mu.RLock()
	stateChangeCount := cb.stateChangeCount
	lastChange := cb.metrics.LastStateChange
	consecutiveSuccess := cb.metrics.ConsecutiveSuccess
	consecutiveFailure := cb.metrics.ConsecutiveFailure
	cb.mu.RUnlock()

	return Metrics{
		SuccessCount:         uint64(counts.Requests - counts.TotalFailures),
		FailureCount:         uint64(counts.TotalFailures),
		TotalReqCount:        uint64(counts.Requests),
		RejectionCount:       uint64(counts.TotalFailures),
		StateChangeCount:     stateChangeCount,
		ConsecutiveSuccess:   consecutiveSuccess,
		ConsecutiveFailure:   consecutiveFailure,
		LastStateChange:      lastChange,
	}
}

// GetName 获取名称
func (cb *CircuitBreaker) GetName() string {
	return cb.name
}

// GetAllBreakers 获取所有熔断器实例
func GetAllBreakers() map[string]*CircuitBreaker {
	breakersMu.RLock()
	defer breakersMu.RUnlock()
	result := make(map[string]*CircuitBreaker, len(circuitBreakers))
	for k, v := range circuitBreakers {
		result[k] = v
	}
	return result
}

// GetBreaker 获取指定名称的熔断器
func GetBreaker(name string) (*CircuitBreaker, bool) {
	breakersMu.RLock()
	defer breakersMu.RUnlock()
	cb, ok := circuitBreakers[name]
	return cb, ok
}

// 辅助函数

// ErrCircuitOpen 熔断器开启错误
var ErrCircuitOpen = errors.New("circuit breaker is open")

// ErrTooManyRequests 请求过多错误
var ErrTooManyRequests = errors.New("too many requests")
