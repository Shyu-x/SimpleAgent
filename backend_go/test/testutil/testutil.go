package testutil

import (
	"context"
	"sync"
	"time"
)

// TestContext 测试上下文
type TestContext struct {
	Context    context.Context
	Cancel     context.CancelFunc
	WaitGroup  *sync.WaitGroup
	TimeSource func() time.Time
}

// NewTestContext 创建测试上下文
func NewTestContext() *TestContext {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	return &TestContext{
		Context:   ctx,
		Cancel:    cancel,
		WaitGroup: &sync.WaitGroup{},
	}
}

// NewTestContextWithTimeout 创建带超时的测试上下文
func NewTestContextWithTimeout(timeout time.Duration) *TestContext {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	return &TestContext{
		Context:   ctx,
		Cancel:    cancel,
		WaitGroup: &sync.WaitGroup{},
	}
}

// Cleanup 清理资源
func (tc *TestContext) Cleanup() {
	tc.Cancel()
	tc.WaitGroup.Wait()
}

// Eventually 检查条件是否最终满足
func Eventually(condition func() bool, intervals ...time.Duration) bool {
	interval := 100 * time.Millisecond
	if len(intervals) > 0 {
		interval = intervals[0]
	}

	timeout := time.After(5 * time.Second)
	for {
		select {
		case <-timeout:
			return false
		case <-time.After(interval):
			if condition() {
				return true
			}
		}
	}
}

// EventuallyWithRetry 最终重试
func EventuallyWithRetry(fn func() (interface{}, error), maxRetries int, interval time.Duration) (interface{}, error) {
	var lastErr error
	for i := 0; i < maxRetries; i++ {
		result, err := fn()
		if err == nil {
			return result, nil
		}
		lastErr = err
		time.Sleep(interval)
	}
	return nil, lastErr
}

// MockClock 模拟时钟
type MockClock struct {
	mu       sync.Mutex
	now      time.Time
	sleeps   []time.Duration
	schedule map[string]time.Time
}

// NewMockClock 创建模拟时钟
func NewMockClock(start time.Time) *MockClock {
	return &MockClock{
		now:      start,
		sleeps:   make([]time.Duration, 0),
		schedule: make(map[string]time.Time),
	}
}

// Now 获取当前时间
func (mc *MockClock) Now() time.Time {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	return mc.now
}

// Advance 前进时间
func (mc *MockClock) Advance(d time.Duration) {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	mc.now = mc.now.Add(d)
}

// Sleep记录睡眠时间
func (mc *MockClock) Sleep(d time.Duration) {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	mc.sleeps = append(mc.sleeps, d)
}

// GetSleeps 获取所有睡眠记录
func (mc *MockClock) GetSleeps() []time.Duration {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	return mc.sleeps
}

// Schedule 调度任务
func (mc *MockClock) Schedule(id string, t time.Time) {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	mc.schedule[id] = t
}

// AssertNil 断言为空
func AssertNil(t interface{}, err error) {
	if err != nil {
		panic(err)
	}
}

// AssertEqual 断言相等
func AssertEqual[T comparable](expected, actual T) {
	if expected != actual {
		panicf("expected %v, got %v", expected, actual)
	}
}

// AssertTrue 断言为真
func AssertTrue(actual bool) {
	if !actual {
		panic("expected true, got false")
	}
}

// AssertFalse 断言为假
func AssertFalse(actual bool) {
	if actual {
		panic("expected false, got true")
	}
}

// panicf 格式化 panic
func panicf(format string, args ...interface{}) {
	panic("assertion failed: " + format)
}

// Barrier 屏障（用于同步测试）
type Barrier struct {
	mu       sync.Mutex
	count    int
	expected int
	waiters  []chan struct{}
}

// NewBarrier 创建屏障
func NewBarrier(count int) *Barrier {
	return &Barrier{
		expected: count,
		waiters:  make([]chan struct{}, 0),
	}
}

// Wait 等待
func (b *Barrier) Wait() {
	b.mu.Lock()
	b.count++
	if b.count == b.expected {
		// 唤醒所有等待者
		for _, ch := range b.waiters {
			close(ch)
		}
		b.waiters = b.waiters[:0]
		b.count = 0
	} else {
		ch := make(chan struct{})
		b.waiters = append(b.waiters, ch)
		b.mu.Unlock()
		<-ch
		return
	}
	b.mu.Unlock()
}

// Counter 计数器（线程安全）
type Counter struct {
	mu    sync.Mutex
	value int
}

// NewCounter 创建计数器
func NewCounter() *Counter {
	return &Counter{}
}

// Inc 增加
func (c *Counter) Inc() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.value++
	return c.value
}

// Dec 减少
func (c *Counter) Dec() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.value--
	return c.value
}

// Get 获取值
func (c *Counter) Get() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.value
}

// Reset 重置
func (c *Counter) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.value = 0
}
