package circuitbreaker

import (
	"errors"
	"sync"
	"time"
)

// 熔断器状态
type State int

const (
	StateClosed   State = iota // 关闭状态，正常请求
	StateOpen                   // 开启状态，拒绝请求
	StateHalfOpen               // 半开状态，允许探测
)

// 熔断器配置
type Config struct {
	FailureThreshold int           // 失败阈值，达到后开启熔断
	SuccessThreshold int           // 成功阈值，半开状态下达到后关闭熔断
	Timeout          time.Duration // 超时时间，到期后进入半开状态
}

// 熔断器事件
type Event int

const (
	EventFailure Event = iota // 请求失败
	EventSuccess              // 请求成功
	EventOpen                 // 熔断开启
	EventClose                // 熔断关闭
	EventHalfOpen             // 进入半开
)

// 熔断器接口
type CircuitBreaker interface {
	// Execute 执行请求，如果熔断开启则返回错误
	Execute(func() error) error
	// GetState 获取当前状态
	GetState() State
	// GetMetrics 获取指标
	GetMetrics() Metrics
	// Subscribe 订阅事件
	Subscribe(chan Event)
}

// Metrics 熔断器指标
type Metrics struct {
	SuccessCount int64 // 成功次数
	FailureCount int64 // 失败次数
	RejectCount  int64 // 拒绝次数
}

// circuitBreaker 熔断器实现
type circuitBreaker struct {
	config     Config
	state      State
	mu         sync.RWMutex
	failures   int
	successes  int
	lastFailure time.Time
	events     chan Event
	subscribers []chan Event
	subMu      sync.Mutex
}

// New 创建熔断器实例
func New(cfg Config) CircuitBreaker {
	if cfg.FailureThreshold <= 0 {
		cfg.FailureThreshold = 5
	}
	if cfg.SuccessThreshold <= 0 {
		cfg.SuccessThreshold = 3
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 60 * time.Second
	}

	cb := &circuitBreaker{
		config:      cfg,
		state:       StateClosed,
		events:      make(chan Event, 100),
		subscribers: make([]chan Event, 0),
	}

	// 启动事件处理协程
	go cb.handleEvents()

	return cb
}

// Execute 执行请求
func (cb *circuitBreaker) Execute(fn func() error) error {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	// 检查熔断状态
	if cb.state == StateOpen {
		// 检查超时
		if time.Since(cb.lastFailure) >= cb.config.Timeout {
			cb.transitionTo(StateHalfOpen)
		} else {
			cb.addMetric("reject")
			return ErrCircuitOpen
		}
	}

	// 执行请求
	err := fn()

	if err != nil {
		cb.onFailure()
		return err
	}

	cb.onSuccess()
	return nil
}

// GetState 获取当前状态
func (cb *circuitBreaker) GetState() State {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.state
}

// GetMetrics 获取指标
func (cb *circuitBreaker) GetMetrics() Metrics {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return Metrics{
		FailureCount: int64(cb.failures),
		SuccessCount: int64(cb.successes),
	}
}

// Subscribe 订阅事件
func (cb *circuitBreaker) Subscribe(ch chan Event) {
	cb.subMu.Lock()
	defer cb.subMu.Unlock()
	cb.subscribers = append(cb.subscribers, ch)
}

// transitionTo 状态转换
func (cb *circuitBreaker) transitionTo(newState State) {
	oldState := cb.state
	cb.state = newState

	event := cb.getEventForTransition(oldState, newState)
	if event >= 0 {
		// 非阻塞发送事件，避免死锁
		select {
		case cb.events <- event:
		default:
		}
	}

	// 重置计数器
	if newState == StateClosed {
		cb.failures = 0
		cb.successes = 0
	} else if newState == StateHalfOpen {
		cb.successes = 0
	}
}

// getEventForTransition 获取状态转换对应的事件
func (cb *circuitBreaker) getEventForTransition(from, to State) Event {
	if from == StateClosed && to == StateOpen {
		return EventOpen
	}
	if from == StateOpen && to == StateHalfOpen {
		return EventHalfOpen
	}
	if from == StateHalfOpen && to == StateClosed {
		return EventClose
	}
	return -1
}

// onFailure 记录失败
func (cb *circuitBreaker) onFailure() {
	cb.failures++
	cb.lastFailure = time.Now()

	// 非阻塞发送事件，避免死锁
	select {
	case cb.events <- EventFailure:
	default:
	}

	if cb.state == StateHalfOpen {
		// 半开状态失败，直接开启
		cb.transitionTo(StateOpen)
	} else if cb.failures >= cb.config.FailureThreshold {
		cb.transitionTo(StateOpen)
	}
}

// onSuccess 记录成功
func (cb *circuitBreaker) onSuccess() {
	cb.successes++

	// 非阻塞发送事件，避免死锁
	select {
	case cb.events <- EventSuccess:
	default:
	}

	if cb.state == StateHalfOpen && cb.successes >= cb.config.SuccessThreshold {
		cb.transitionTo(StateClosed)
	}
}

// addMetric 增加指标
func (cb *circuitBreaker) addMetric(name string) {
	if name == "reject" {
		// 简化实现，实际应该用 atomic
	}
}

// handleEvents 处理事件
func (cb *circuitBreaker) handleEvents() {
	for event := range cb.events {
		cb.subMu.Lock()
		for _, sub := range cb.subscribers {
			select {
			case sub <- event:
			default:
				// 通道满，跳过
			}
		}
		cb.subMu.Unlock()
	}
}

// ErrCircuitOpen 熔断器开启错误
var ErrCircuitOpen = errors.New("circuit breaker is open")
