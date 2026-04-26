package ratelimiter

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/ai-chat/backend_go/internal/common/errors"
)

func TestNew(t *testing.T) {
	cfg := Config{
		Rate:       "100/s",
		Concurrent: 10,
		Burst:      20,
	}

	rl, err := New(cfg)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	if rl == nil {
		t.Fatal("expected rate limiter to be created")
	}
	defer rl.Close()

	if rl.limiters == nil {
		t.Error("expected limiters map to be initialized")
	}
}

func TestRateLimiterAllow(t *testing.T) {
	cfg := Config{
		Rate: "10/s", // 每秒10个令牌
	}

	rl, err := New(cfg)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	defer rl.Close()

	// 消耗所有令牌
	for i := 0; i < 10; i++ {
		allowed, err := rl.Allow("test_key")
		if err != nil {
			t.Fatalf("Allow failed: %v", err)
		}
		if !allowed {
			t.Error("expected request to be allowed")
		}
	}

	// 第11个请求应该被拒绝
	allowed, err := rl.Allow("test_key")
	if err != nil {
		t.Fatalf("Allow failed: %v", err)
	}
	if allowed {
		t.Error("expected request to be denied after rate limit")
	}
}

func TestRateLimiterRefill(t *testing.T) {
	cfg := Config{
		Rate: "5/s",
	}

	rl, err := New(cfg)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	defer rl.Close()

	// 消耗所有令牌
	for i := 0; i < 5; i++ {
		rl.Allow("test_key")
	}

	// 立即再次请求应该被拒绝
	allowed, _ := rl.Allow("test_key")
	if allowed {
		t.Error("expected request to be denied immediately after exhaustion")
	}

	// 等待令牌补充
	time.Sleep(2100 * time.Millisecond) // 等待超过2秒(每秒5个令牌)

	// 现在应该允许
	allowed, err := rl.Allow("test_key")
	if err != nil {
		t.Fatalf("Allow failed: %v", err)
	}
	if !allowed {
		t.Error("expected request to be allowed after refill")
	}
}

func TestRateLimiterDifferentKeys(t *testing.T) {
	cfg := Config{
		Rate: "2/s",
	}

	rl, err := New(cfg)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	defer rl.Close()

	// 使用不同的key应该独立计数
	allowed1, _ := rl.Allow("key1")
	allowed2, _ := rl.Allow("key2")
	allowed3, _ := rl.Allow("key1") // key1已达2个限制

	if !allowed1 || !allowed2 {
		t.Error("expected first requests to be allowed")
	}
	if allowed3 {
		t.Error("expected third request for key1 to be denied")
	}
}

func TestRateLimiterConcurrent(t *testing.T) {
	cfg := Config{
		Rate:       "100/s",
		Concurrent: 5,
	}

	rl, err := New(cfg)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	defer rl.Close()

	var wg sync.WaitGroup
	successCount := 0
	var mu sync.Mutex

	// 并发获取信号量
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			acquired, err := rl.AcquireConcurrent("concurrent_test")
			if err != nil {
				t.Errorf("AcquireConcurrent failed: %v", err)
				return
			}
			if acquired {
				mu.Lock()
				successCount++
				mu.Unlock()
				time.Sleep(10 * time.Millisecond)
				rl.ReleaseConcurrent("concurrent_test")
			}
		}()
	}

	wg.Wait()

	// 由于并发限制为5，最多5个成功
	if successCount > 5 {
		t.Errorf("expected at most 5 successful acquisitions, got %d", successCount)
	}
}

func TestRateLimiterAcquireRelease(t *testing.T) {
	cfg := Config{
		Rate:       "100/s",
		Concurrent: 2,
	}

	rl, err := New(cfg)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	defer rl.Close()

	// 获取信号量
	acquired1, _ := rl.AcquireConcurrent("test")
	acquired2, _ := rl.AcquireConcurrent("test")
	acquired3, _ := rl.AcquireConcurrent("test")

	if !acquired1 || !acquired2 {
		t.Error("expected first two acquisitions to succeed")
	}
	if acquired3 {
		t.Error("expected third acquisition to fail due to limit")
	}

	// 释放一个
	rl.ReleaseConcurrent("test")

	// 现在应该可以再获取一个
	acquired4, _ := rl.AcquireConcurrent("test")
	if !acquired4 {
		t.Error("expected acquisition to succeed after release")
	}
}

func TestRateLimiterGetMetrics(t *testing.T) {
	cfg := Config{
		Rate: "10/s",
	}

	rl, err := New(cfg)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	defer rl.Close()

	// 使用一些令牌
	rl.Allow("key1")
	rl.Allow("key1")
	rl.Allow("key2")

	metrics := rl.GetMetrics()
	if metrics == nil {
		t.Fatal("expected non-nil metrics")
	}

	// 检查key1的指标
	key1Metrics, ok := metrics["key1"].(map[string]interface{})
	if !ok {
		t.Fatal("expected key1 metrics to be map")
	}
	if key1Metrics["rate"] != 10.0 {
		t.Errorf("expected rate=10, got %v", key1Metrics["rate"])
	}
}

func TestParseRateString(t *testing.T) {
	tests := []struct {
		input    string
		expected int
		unit     string
		hasError bool
	}{
		{"100/s", 100, "s", false},
		{"50/m", 50, "m", false},
		{"10/h", 10, "h", false},
		{"abc/s", 0, "", true},
		{"100", 0, "", true},
		{"", 0, "", true},
	}

	for _, tt := range tests {
		var count int
		var unit string
		_, err := parseRateString(tt.input, &count, &unit)

		if tt.hasError {
			if err == nil {
				t.Errorf("parseRateString(%s): expected error", tt.input)
			}
		} else {
			if err != nil {
				t.Errorf("parseRateString(%s): unexpected error: %v", tt.input, err)
			}
			if count != tt.expected {
				t.Errorf("parseRateString(%s): expected count=%d, got %d", tt.input, tt.expected, count)
			}
			if unit != tt.unit {
				t.Errorf("parseRateString(%s): expected unit=%s, got %s", tt.input, tt.unit, unit)
			}
		}
	}
}

func TestRateLimiterAllowWithContext(t *testing.T) {
	cfg := Config{
		Rate: "5/s",
	}

	rl, err := New(cfg)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	defer rl.Close()

	ctx := context.Background()
	allowed, err := rl.AllowWithContext(ctx, "test_key")
	if err != nil {
		t.Fatalf("AllowWithContext failed: %v", err)
	}
	if !allowed {
		t.Error("expected request to be allowed")
	}
}

func TestLimiterItemAllow(t *testing.T) {
	item := &limiterItem{
		tokens:     5,
		lastRefill: time.Now(),
		rate:       10,
		capacity:   10,
	}

	// 允许5个请求
	for i := 0; i < 5; i++ {
		if !item.Allow() {
			t.Errorf("expected request %d to be allowed", i+1)
		}
	}

	// 第6个请求应该被拒绝
	if item.Allow() {
		t.Error("expected 6th request to be denied")
	}
}

func TestLimiterItemRefill(t *testing.T) {
	item := &limiterItem{
		tokens:     0,
		lastRefill: time.Now().Add(-1 * time.Second), // 1秒前
		rate:       10,                                 // 每秒10个
		capacity:   10,
	}

	item.refill()

	// 1秒内应该补充10个令牌，但受容量限制
	if item.tokens > 10 {
		t.Errorf("expected tokens <= capacity(10), got %f", item.tokens)
	}
}

func TestRateLimiterInvalidRate(t *testing.T) {
	cfg := Config{
		Rate: "invalid_rate",
	}

	_, err := New(cfg)
	if err == nil {
		t.Error("expected error for invalid rate")
	}
}

func TestRateLimiterClose(t *testing.T) {
	cfg := Config{
		Rate: "100/s",
	}

	rl, err := New(cfg)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}

	err = rl.Close()
	if err != nil {
		t.Errorf("Close failed: %v", err)
	}

	// Close应该可以多次调用
	err = rl.Close()
	if err != nil {
		t.Errorf("second Close failed: %v", err)
	}
}

func TestRateLimiterGetLimiter(t *testing.T) {
	cfg := Config{
		Rate: "10/s",
	}

	rl, err := New(cfg)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	defer rl.Close()

	// 获取不存在的limiter应该创建新的
	item1, err := rl.GetLimiter("new_key")
	if err != nil {
		t.Fatalf("GetLimiter failed: %v", err)
	}
	if item1 == nil {
		t.Fatal("expected non-nil limiter item")
	}

	// 获取已存在的limiter应该返回同一个
	item2, err := rl.GetLimiter("new_key")
	if err != nil {
		t.Fatalf("GetLimiter failed: %v", err)
	}
	if item1 != item2 {
		t.Error("expected same limiter item for same key")
	}
}

func TestErrInvalidParameter(t *testing.T) {
	err := errors.ErrInvalidParameter("test parameter error")
	if err == nil {
		t.Fatal("expected non-nil error")
	}
	if err.Code != errors.CodeInvalidParameter {
		t.Errorf("expected code %d, got %d", errors.CodeInvalidParameter, err.Code)
	}
}
