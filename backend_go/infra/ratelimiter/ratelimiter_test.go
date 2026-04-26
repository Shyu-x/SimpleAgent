package ratelimiter

import (
	"sync"
	"testing"
	"time"
)

// TestTokenBucketAllow 测试令牌桶允许请求
func TestTokenBucketAllow(t *testing.T) {
	cfg := Config{
		Capacity:   10,
		RefillRate: 5, // 每秒5个
	}

	tb := NewTokenBucket(cfg)

	// 初始应有足够令牌
	for i := 0; i < 10; i++ {
		if !tb.Allow() {
			t.Errorf("request %d should be allowed", i)
		}
	}

	// 令牌耗尽后应拒绝
	if tb.Allow() {
		t.Error("request should be rejected when tokens are exhausted")
	}
}

// TestTokenBucketRefill 测试令牌桶自动补充
func TestTokenBucketRefill(t *testing.T) {
	cfg := Config{
		Capacity:   5,
		RefillRate: 10, // 每秒10个
	}

	tb := NewTokenBucket(cfg)

	// 消耗所有令牌
	for i := 0; i < 5; i++ {
		tb.Allow()
	}

	// 应拒绝
	if tb.Allow() {
		t.Error("should be rejected immediately after exhaustion")
	}

	// 等待补充
	time.Sleep(200 * time.Millisecond)

	// 应该有新令牌
	if !tb.Allow() {
		t.Error("should allow after refill")
	}
}

// TestTokenBucketAllowN 测试批量请求
func TestTokenBucketAllowN(t *testing.T) {
	cfg := Config{
		Capacity:   10,
		RefillRate: 0,
	}

	tb := NewTokenBucket(cfg)

	// 批量允许
	if !tb.AllowN(5) {
		t.Error("should allow batch of 5")
	}

	// 剩余5个
	if !tb.AllowN(5) {
		t.Error("should allow remaining 5")
	}

	// 已耗尽
	if tb.AllowN(1) {
		t.Error("should reject when exhausted")
	}
}

// TestTokenBucketMetrics 测试令牌桶指标
func TestTokenBucketMetrics(t *testing.T) {
	cfg := Config{
		Capacity:   10,
		RefillRate: 5,
	}

	tb := NewTokenBucket(cfg)

	tb.Allow()
	tb.Allow()
	tb.Allow()

	metrics := tb.GetMetrics()
	if metrics.TotalRequests != 3 {
		t.Errorf("expected 3 total requests, got %d", metrics.TotalRequests)
	}
	if metrics.AllowedCount != 3 {
		t.Errorf("expected 3 allowed, got %d", metrics.AllowedCount)
	}
}

// TestTokenBucketReset 测试令牌桶重置
func TestTokenBucketReset(t *testing.T) {
	cfg := Config{
		Capacity:   10,
		RefillRate: 5,
	}

	tb := NewTokenBucket(cfg)

	// 消耗令牌
	for i := 0; i < 10; i++ {
		tb.Allow()
	}

	// 重置
	tb.Reset()

	// 应该能再次使用
	if !tb.Allow() {
		t.Error("should allow after reset")
	}
}

// TestSlidingWindowAllow 测试滑动窗口允许请求
func TestSlidingWindowAllow(t *testing.T) {
	sw := NewSlidingWindow(time.Second, 5)

	// 允许5个请求
	for i := 0; i < 5; i++ {
		if !sw.Allow() {
			t.Errorf("request %d should be allowed", i)
		}
	}

	// 第6个应被拒绝
	if sw.Allow() {
		t.Error("6th request should be rejected")
	}
}

// TestSlidingWindowExpire 测试滑动窗口过期
func TestSlidingWindowExpire(t *testing.T) {
	sw := NewSlidingWindow(100*time.Millisecond, 3)

	// 消耗所有配额
	for i := 0; i < 3; i++ {
		sw.Allow()
	}

	// 应被拒绝
	if sw.Allow() {
		t.Error("should be rejected")
	}

	// 等待窗口过期
	time.Sleep(150 * time.Millisecond)

	// 应该能再次请求
	if !sw.Allow() {
		t.Error("should allow after window expires")
	}
}

// TestSlidingWindowConcurrency 测试滑动窗口并发
func TestSlidingWindowConcurrency(t *testing.T) {
	sw := NewSlidingWindow(time.Second, 100)

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				sw.Allow()
			}
		}()
	}

	wg.Wait()

	metrics := sw.GetMetrics()
	if metrics.TotalRequests != 200 {
		t.Errorf("expected 200 total requests, got %d", metrics.TotalRequests)
	}
}

// TestSlidingWindowMetrics 测试滑动窗口指标
func TestSlidingWindowMetrics(t *testing.T) {
	sw := NewSlidingWindow(time.Second, 5)

	// 允许5个，拒绝5个
	for i := 0; i < 5; i++ {
		sw.Allow()
	}
	for i := 0; i < 5; i++ {
		sw.Allow()
	}

	metrics := sw.GetMetrics()
	if metrics.TotalRequests != 10 {
		t.Errorf("expected 10 total requests, got %d", metrics.TotalRequests)
	}
	if metrics.AllowedCount != 5 {
		t.Errorf("expected 5 allowed, got %d", metrics.AllowedCount)
	}
	if metrics.RejectedCount != 5 {
		t.Errorf("expected 5 rejected, got %d", metrics.RejectedCount)
	}
}

// TestSlidingWindowReset 测试滑动窗口重置
func TestSlidingWindowReset(t *testing.T) {
	sw := NewSlidingWindow(time.Second, 5)

	// 消耗配额
	for i := 0; i < 5; i++ {
		sw.Allow()
	}

	// 重置
	sw.Reset()

	// 应该能再次使用
	if !sw.Allow() {
		t.Error("should allow after reset")
	}
}

// TestRateLimiterInterface 测试限流器接口
func TestRateLimiterInterface(t *testing.T) {
	// 确保实现了接口
	var _ RateLimiter = (*tokenBucket)(nil)
	var _ RateLimiter = (*slidingWindow)(nil)
}
