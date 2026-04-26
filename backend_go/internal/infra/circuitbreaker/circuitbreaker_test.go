package circuitbreaker

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestNew(t *testing.T) {
	cfg := Config{
		FailureThreshold: 5,
		SuccessThreshold: 3,
		RecoveryTimeout:  30,
	}

	cb, err := New("test", cfg)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	if cb == nil {
		t.Fatal("expected circuit breaker to be created")
	}
	if cb.GetName() != "test" {
		t.Errorf("expected name 'test', got '%s'", cb.GetName())
	}
}

func TestNewWithDefaults(t *testing.T) {
	cfg := Config{} // 零值配置

	cb, err := New("test_default", cfg)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}

	// 验证默认值
	if cb.GetState() != StateClosed {
		t.Errorf("expected initial state closed, got %s", cb.GetState())
	}
}

func TestCircuitBreakerExecuteSuccess(t *testing.T) {
	cb, _ := New("success_test", Config{
		FailureThreshold: 3,
		SuccessThreshold: 2,
		RecoveryTimeout:  30,
	})

	ctx := context.Background()
	err := cb.Execute(ctx, func() error {
		return nil
	})

	if err != nil {
		t.Errorf("Execute failed unexpectedly: %v", err)
	}

	if !cb.IsClosed() {
		t.Error("expected circuit breaker to be closed after success")
	}
}

func TestCircuitBreakerExecuteFailure(t *testing.T) {
	cb, _ := New("failure_test", Config{
		FailureThreshold: 3,
		SuccessThreshold: 2,
		RecoveryTimeout:  30,
	})

	ctx := context.Background()
	testErr := errors.New("test error")

	// 触发失败但未达到阈值
	for i := 0; i < 2; i++ {
		err := cb.Execute(ctx, func() error {
			return testErr
		})
		if err == nil {
			t.Error("expected error to be propagated")
		}
	}

	// 熔断器应该仍然是关闭状态
	if cb.IsOpen() {
		t.Error("circuit breaker should not be open yet")
	}
}

func TestCircuitBreakerOpen(t *testing.T) {
	cb, _ := New("open_test", Config{
		FailureThreshold: 3,
		SuccessThreshold: 2,
		RecoveryTimeout:  30,
	})

	ctx := context.Background()
	testErr := errors.New("test error")

	// 达到失败阈值
	for i := 0; i < 3; i++ {
		cb.Execute(ctx, func() error {
			return testErr
		})
	}

	// 熔断器应该打开
	if !cb.IsOpen() {
		t.Error("expected circuit breaker to be open after failure threshold")
	}

	// 再次调用应该快速返回错误
	start := time.Now()
	err := cb.Execute(ctx, func() error {
		t.Error("this should not be called")
		return nil
	})
	elapsed := time.Since(start)

	if err == nil {
		t.Error("expected error when circuit breaker is open")
	}
	// 应该快速返回，没有实际执行
	if elapsed > 10*time.Millisecond {
		t.Errorf("Execute took too long: %v", elapsed)
	}
}

func TestCircuitBreakerHalfOpen(t *testing.T) {
	cb, _ := New("halfopen_test", Config{
		FailureThreshold: 2,
		SuccessThreshold: 2,
		RecoveryTimeout:  1, // 1秒后进入半开状态
	})

	ctx := context.Background()
	testErr := errors.New("test error")

	// 触发熔断
	for i := 0; i < 2; i++ {
		cb.Execute(ctx, func() error {
			return testErr
		})
	}

	if !cb.IsOpen() {
		t.Fatal("expected circuit breaker to be open")
	}

	// 等待恢复超时
	time.Sleep(1100 * time.Millisecond)

	// 应该进入半开状态
	if !cb.IsHalfOpen() {
		t.Error("expected circuit breaker to be half-open after timeout")
	}
}

func TestCircuitBreakerExecuteWithResult(t *testing.T) {
	cb, _ := New("result_test", Config{
		FailureThreshold: 3,
		SuccessThreshold: 2,
		RecoveryTimeout: 30,
	})

	ctx := context.Background()
	expectedResult := "success_result"

	result, err := cb.ExecuteWithResult(ctx, func() (interface{}, error) {
		return expectedResult, nil
	})

	if err != nil {
		t.Errorf("ExecuteWithResult failed: %v", err)
	}
	if result != expectedResult {
		t.Errorf("expected result '%s', got '%v'", expectedResult, result)
	}
}

func TestCircuitBreakerGetState(t *testing.T) {
	cb, _ := New("state_test", Config{
		FailureThreshold: 3,
		SuccessThreshold: 2,
		RecoveryTimeout: 30,
	})

	tests := []struct {
		name     string
		expected CircuitState
	}{
		{"closed", StateClosed},
	}

	for _, tt := range tests {
		state := cb.GetState()
		if state != tt.expected {
			t.Errorf("GetState(): expected %s, got %s", tt.expected, state)
		}
	}
}

func TestCircuitBreakerIsClosed(t *testing.T) {
	cb, _ := New("isclosed_test", Config{
		FailureThreshold: 3,
		SuccessThreshold: 2,
		RecoveryTimeout: 30,
	})

	if !cb.IsClosed() {
		t.Error("expected circuit breaker to be closed initially")
	}
}

func TestCircuitBreakerIsOpen(t *testing.T) {
	cb, _ := New("isopen_test", Config{
		FailureThreshold: 2,
		SuccessThreshold: 2,
		RecoveryTimeout: 30,
	})

	ctx := context.Background()
	testErr := errors.New("test error")

	// 触发熔断
	cb.Execute(ctx, func() error { return testErr })
	cb.Execute(ctx, func() error { return testErr })

	if !cb.IsOpen() {
		t.Error("expected circuit breaker to be open")
	}
}

func TestCircuitBreakerIsHalfOpen(t *testing.T) {
	cb, _ := New("ishalfopen_test", Config{
		FailureThreshold: 2,
		SuccessThreshold: 2,
		RecoveryTimeout:  1,
	})

	// 触发熔断
	ctx := context.Background()
	testErr := errors.New("test error")
	cb.Execute(ctx, func() error { return testErr })
	cb.Execute(ctx, func() error { return testErr })

	// 等待恢复
	time.Sleep(1100 * time.Millisecond)

	if !cb.IsHalfOpen() {
		t.Error("expected circuit breaker to be half-open")
	}
}

func TestCircuitBreakerGetMetrics(t *testing.T) {
	cb, _ := New("metrics_test", Config{
		FailureThreshold: 5,
		SuccessThreshold: 3,
		RecoveryTimeout: 30,
	})

	ctx := context.Background()

	// 执行一些成功和失败的请求
	for i := 0; i < 3; i++ {
		cb.Execute(ctx, func() error { return nil })
	}
	for i := 0; i < 2; i++ {
		cb.Execute(ctx, func() error { return errors.New("fail") })
	}

	metrics := cb.GetMetrics()
	if metrics.TotalReqCount == 0 {
		t.Error("expected non-zero total request count")
	}
	// 注意: 实际指标取决于gobreaker实现
	_ = metrics
}

func TestCircuitStateString(t *testing.T) {
	tests := []struct {
		state    CircuitState
		expected string
	}{
		{StateClosed, "closed"},
		{StateOpen, "open"},
		{StateHalfOpen, "half-open"},
		{CircuitState(999), "unknown"},
	}

	for _, tt := range tests {
		got := tt.state.String()
		if got != tt.expected {
			t.Errorf("State(%d).String(): expected '%s', got '%s'", tt.state, tt.expected, got)
		}
	}
}

func TestStateToGobreakerState(t *testing.T) {
	tests := []struct {
		input    CircuitState
		expected CircuitState
	}{
		{StateClosed, StateClosed},
		{StateOpen, StateOpen},
		{StateHalfOpen, StateHalfOpen},
	}

	for _, tt := range tests {
		// 验证转换不会panic
		got := StateToGobreakerState(tt.input)
		if got != tt.expected {
			t.Errorf("StateToGobreakerState(%d): expected %d, got %d", tt.input, tt.expected, got)
		}
	}
}

func TestCircuitBreakerRecovery(t *testing.T) {
	cb, _ := New("recovery_test", Config{
		FailureThreshold: 2,
		SuccessThreshold: 2,
		RecoveryTimeout:  1,
	})

	ctx := context.Background()
	testErr := errors.New("test error")

	// 触发熔断
	cb.Execute(ctx, func() error { return testErr })
	cb.Execute(ctx, func() error { return testErr })

	if !cb.IsOpen() {
		t.Fatal("expected circuit breaker to be open")
	}

	// 等待恢复超时
	time.Sleep(1100 * time.Millisecond)

	// 半开状态下，成功的请求应该关闭熔断器
	for i := 0; i < 2; i++ {
		cb.Execute(ctx, func() error { return nil })
	}

	if !cb.IsClosed() {
		t.Error("expected circuit breaker to be closed after successful half-open requests")
	}
}

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig
	if cfg.FailureThreshold != 5 {
		t.Errorf("expected default FailureThreshold=5, got %d", cfg.FailureThreshold)
	}
	if cfg.SuccessThreshold != 3 {
		t.Errorf("expected default SuccessThreshold=3, got %d", cfg.SuccessThreshold)
	}
	if cfg.RecoveryTimeout != 30 {
		t.Errorf("expected default RecoveryTimeout=30, got %d", cfg.RecoveryTimeout)
	}
}

func TestErrCircuitOpen(t *testing.T) {
	if ErrCircuitOpen.Error() != "circuit breaker is open" {
		t.Errorf("unexpected error message: %s", ErrCircuitOpen.Error())
	}
}

func TestErrTooManyRequests(t *testing.T) {
	if ErrTooManyRequests.Error() != "too many requests" {
		t.Errorf("unexpected error message: %s", ErrTooManyRequests.Error())
	}
}

func TestCircuitBreakerInvalidConfig(t *testing.T) {
	cfg := Config{
		FailureThreshold: 0, // 无效值
		SuccessThreshold: 0,
		RecoveryTimeout:  0,
	}

	// 应该使用默认值
	cb, err := New("invalid_config", cfg)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}

	// 验证默认值被使用
	if cb == nil {
		t.Fatal("expected circuit breaker to be created with defaults")
	}
}

func TestCircuitBreakerContextCancellation(t *testing.T) {
	cb, _ := New("context_test", Config{
		FailureThreshold: 5,
		SuccessThreshold: 3,
		RecoveryTimeout:  30,
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // 立即取消

	err := cb.Execute(ctx, func() error {
		return nil
	})

	// 取消的上下文应该导致错误
	if err == nil {
		t.Error("expected error with cancelled context")
	}
}
