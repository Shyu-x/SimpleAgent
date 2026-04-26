// Package queuemanager 队列管理器
// 支持内存和Redis Sorted Set实现的优先级队列
package queuemanager

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

// Priority 优先级
type Priority int

const (
	PriorityLow    Priority = iota // 低优先级
	PriorityNormal                 // 普通优先级
	PriorityHigh                   // 高优先级
	PriorityCritical               // 紧急优先级
)

// QueueItem 队列项
type QueueItem struct {
	ID        string                 `json:"id"`
	Priority  Priority                `json:"priority"`
	Data      interface{}             `json:"data"`
	Timestamp time.Time              `json:"timestamp"`
	Timeout   time.Duration          `json:"timeout,omitempty"`
	Retry     int                    `json:"retry"`
	MaxRetry  int                    `json:"max_retries"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// QueueEvent 队列事件
type QueueEvent struct {
	Type      string      `json:"type"` // enqueued, dequeued, removed, expired
	QueueName string      `json:"queue_name"`
	Item      *QueueItem  `json:"item,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

// Config 队列配置
type Config struct {
	// 最大队列长度 (0表示无限制)
	MaxSize int
	// 驱逐超时(秒)
	EvictionTimeout int
	// 是否使用Redis
	UseRedis bool
	// Redis地址
	RedisAddr string
	// Redis密码
	RedisPassword string
	// Redis数据库
	RedisDB int
	// Redis key前缀
	KeyPrefix string
	// SSE通知启用
	EnableSSE bool
}

// QueueManager 队列管理器
type QueueManager struct {
	queues      map[string]*PriorityQueue
	mu          sync.RWMutex
	ctx         context.Context
	cancel      context.CancelFunc
	sseNotifier *SSENotifier
	config      Config
	redis       *redis.Client
}

// PriorityQueue 优先级队列
type PriorityQueue struct {
	items     []*QueueItem
	mu        sync.RWMutex
	cond      *sync.Cond
	closed    bool
	maxSize   int
	evictionTimeout time.Duration
}

// SSENotifier SSE通知器
type SSENotifier struct {
	notifyFunc func(clientID string, event string, data interface{})
}

// SSEClient SSE客户端
type SSEClient struct {
	ID       string
	QueueName string
	notifyFunc func(event QueueEvent)
}

// 全局指标
var (
	queueSizeGauge = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "queue_size",
		Help: "Current size of queue",
	}, []string{"queue_name"})

	queueEnqueuedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "queue_enqueued_total",
		Help: "Total number of items enqueued",
	}, []string{"queue_name"})

	queueDequeuedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "queue_dequeued_total",
		Help: "Total number of items dequeued",
	}, []string{"queue_name"})

	queueExpiredTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "queue_expired_total",
		Help: "Total number of items expired",
	}, []string{"queue_name"})
)

// NewQueueManager 创建队列管理器
func NewQueueManager(cfg Config) *QueueManager {
	ctx, cancel := context.WithCancel(context.Background())
	qm := &QueueManager{
		queues: make(map[string]*PriorityQueue),
		ctx:    ctx,
		cancel: cancel,
		config: cfg,
	}

	if cfg.UseRedis {
		qm.redis = redis.NewClient(&redis.Options{
			Addr:     cfg.RedisAddr,
			Password: cfg.RedisPassword,
			DB:       cfg.RedisDB,
		})
	}

	go qm.cleanup()
	return qm
}

// New 创建队列管理器(兼容旧API)
func New() *QueueManager {
	return NewQueueManager(Config{})
}

// NewPriorityQueue 创建优先级队列
func NewPriorityQueue(maxSize int) *PriorityQueue {
	mu := sync.Mutex{}
	return &PriorityQueue{
		items:     make([]*QueueItem, 0),
		cond:      sync.NewCond(&mu),
		maxSize:   maxSize,
	}
}

// Enqueue 入队
func (q *PriorityQueue) Enqueue(item *QueueItem) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed {
		return fmt.Errorf("队列已关闭")
	}
	if q.maxSize > 0 && len(q.items) >= q.maxSize {
		return fmt.Errorf("队列已满")
	}
	q.items = append(q.items, item)
	q.sort()
	q.cond.Signal()
	return nil
}

// Dequeue 出队
func (q *PriorityQueue) Dequeue(timeout time.Duration) (*QueueItem, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	for len(q.items) == 0 && !q.closed {
		if timeout > 0 {
			waitCtx, cancel := context.WithTimeout(context.Background(), timeout)
			ch := make(chan struct{})
			go func() {
				q.cond.Wait()
				close(ch)
			}()
			select {
			case <-ch:
			case <-waitCtx.Done():
				cancel()
				return nil, fmt.Errorf("等待超时")
			}
			cancel()
		} else {
			q.cond.Wait()
		}
	}
	if q.closed && len(q.items) == 0 {
		return nil, fmt.Errorf("队列已关闭")
	}
	item := q.items[0]
	q.items = q.items[1:]
	return item, nil
}

// Peek 查看队首元素
func (q *PriorityQueue) Peek() (*QueueItem, error) {
	q.mu.RLock()
	defer q.mu.RUnlock()
	if len(q.items) == 0 {
		return nil, fmt.Errorf("队列为空")
	}
	return q.items[0], nil
}

// Size 获取队列大小
func (q *PriorityQueue) Size() int {
	q.mu.RLock()
	defer q.mu.RUnlock()
	return len(q.items)
}

// Close 关闭队列
func (q *PriorityQueue) Close() {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.closed = true
	q.cond.Broadcast()
}

func (q *PriorityQueue) sort() {
	for i := 1; i < len(q.items); i++ {
		for j := i; j > 0 && q.items[j].Priority > q.items[j-1].Priority; j-- {
			q.items[j], q.items[j-1] = q.items[j-1], q.items[j]
		}
	}
}

// GetOrCreateQueue 获取或创建队列
func (qm *QueueManager) GetOrCreateQueue(name string, maxSize int) *PriorityQueue {
	qm.mu.Lock()
	defer qm.mu.Unlock()
	if queue, exists := qm.queues[name]; exists {
		return queue
	}
	if maxSize <= 0 {
		maxSize = qm.config.MaxSize
	}
	queue := NewPriorityQueue(maxSize)
	if qm.config.EvictionTimeout > 0 {
		queue.evictionTimeout = time.Duration(qm.config.EvictionTimeout) * time.Second
	}
	qm.queues[name] = queue
	return queue
}

// Enqueue 入队到指定队列
func (qm *QueueManager) Enqueue(queueName string, item *QueueItem) error {
	queue := qm.GetOrCreateQueue(queueName, 0)

	if qm.redis != nil && qm.config.UseRedis {
		return qm.enqueueRedis(queueName, item)
	}

	err := queue.Enqueue(item)
	if err != nil {
		return err
	}

	queueEnqueuedTotal.WithLabelValues(queueName).Inc()
	queueSizeGauge.WithLabelValues(queueName).Inc()

	// SSE通知
	if qm.config.EnableSSE {
		qm.notifySSE(queueName, QueueEvent{
			Type:      "enqueued",
			QueueName: queueName,
			Item:      item,
			Timestamp: time.Now(),
		})
	}

	return nil
}

// enqueueRedis 使用Redis Sorted Set入队
func (qm *QueueManager) enqueueRedis(queueName string, item *QueueItem) error {
	ctx := context.Background()
	key := qm.config.KeyPrefix + "queue:" + queueName

	data, err := json.Marshal(item)
	if err != nil {
		return fmt.Errorf("序列化队列项失败: %w", err)
	}

	// 使用优先级和时间戳作为分数
	score := float64(item.Priority)*1e12 + float64(item.Timestamp.UnixNano())
	member := fmt.Sprintf("%s:%d", item.ID, time.Now().UnixNano())

	// 检查队列大小
	size, err := qm.redis.ZCard(ctx, key).Result()
	if err == nil && qm.config.MaxSize > 0 && int(size) >= qm.config.MaxSize {
		// 移除最低优先级的项
		results, err := qm.redis.ZRangeWithScores(ctx, key, 0, 0).Result()
		if err == nil && len(results) > 0 {
			qm.redis.ZRem(ctx, key, results[0].Member)
			queueExpiredTotal.WithLabelValues(queueName).Inc()
		}
	}

	_, err = qm.redis.ZAdd(ctx, key, redis.Z{Score: score, Member: member}).Result()
	if err != nil {
		return fmt.Errorf("Redis入队失败: %w", err)
	}

	// 存储数据
	dataKey := key + ":data:" + member
	qm.redis.Set(ctx, dataKey, data, 24*time.Hour)

	queueEnqueuedTotal.WithLabelValues(queueName).Inc()
	queueSizeGauge.WithLabelValues(queueName).Set(float64(size+1))

	if qm.config.EnableSSE {
		qm.notifySSE(queueName, QueueEvent{
			Type:      "enqueued",
			QueueName: queueName,
			Item:      item,
			Timestamp: time.Now(),
		})
	}

	return nil
}

// Dequeue 从指定队列出队
func (qm *QueueManager) Dequeue(queueName string, timeout time.Duration) (*QueueItem, error) {
	if qm.redis != nil && qm.config.UseRedis {
		return qm.dequeueRedis(queueName, timeout)
	}

	qm.mu.RLock()
	queue, exists := qm.queues[queueName]
	qm.mu.RUnlock()
	if !exists {
		return nil, fmt.Errorf("队列不存在: %s", queueName)
	}

	item, err := queue.Dequeue(timeout)
	if err != nil {
		return nil, err
	}

	queueDequeuedTotal.WithLabelValues(queueName).Inc()
	queueSizeGauge.WithLabelValues(queueName).Dec()

	if qm.config.EnableSSE {
		qm.notifySSE(queueName, QueueEvent{
			Type:      "dequeued",
			QueueName: queueName,
			Item:      item,
			Timestamp: time.Now(),
		})
	}

	return item, nil
}

// dequeueRedis 使用Redis Sorted Set出队
func (qm *QueueManager) dequeueRedis(queueName string, timeout time.Duration) (*QueueItem, error) {
	ctx := context.Background()
	key := qm.config.KeyPrefix + "queue:" + queueName

	var result *redis.Z
	var err error

	if timeout > 0 {
		// 等待一段时间直到有元素
		deadline := time.Now().Add(timeout)
		for time.Now().Before(deadline) {
			results, err := qm.redis.ZRevRangeWithScores(ctx, key, 0, 0).Result()
			if err == nil && len(results) > 0 {
				// 检查是否过期
				item, parseErr := qm.getRedisItemData(queueName, results[0].Member.(string))
				if parseErr == nil && qm.isItemExpired(item) {
					// 移除过期项
					qm.redis.ZRem(ctx, key, results[0].Member)
					queueExpiredTotal.WithLabelValues(queueName).Inc()
					continue
				}
				result = &results[0]
				break
			}
			time.Sleep(100 * time.Millisecond)
		}
	} else {
		results, err := qm.redis.ZRevRangeWithScores(ctx, key, 0, 0).Result()
		if err == nil && len(results) > 0 {
			result = &results[0]
		}
	}

	if result == nil {
		return nil, fmt.Errorf("队列为空或超时")
	}

	member := result.Member.(string)
	item, err := qm.getRedisItemData(queueName, member)
	if err != nil {
		return nil, fmt.Errorf("获取队列项数据失败: %w", err)
	}

	// 移除元素
	qm.redis.ZRem(ctx, key, member)
	dataKey := key + ":data:" + member
	qm.redis.Del(ctx, dataKey)

	size, _ := qm.redis.ZCard(ctx, key).Result()
	queueDequeuedTotal.WithLabelValues(queueName).Inc()
	queueSizeGauge.WithLabelValues(queueName).Set(float64(size))

	if qm.config.EnableSSE {
		qm.notifySSE(queueName, QueueEvent{
			Type:      "dequeued",
			QueueName: queueName,
			Item:      item,
			Timestamp: time.Now(),
		})
	}

	return item, nil
}

func (qm *QueueManager) getRedisItemData(queueName, member string) (*QueueItem, error) {
	ctx := context.Background()
	key := qm.config.KeyPrefix + "queue:" + queueName
	dataKey := key + ":data:" + member

	data, err := qm.redis.Get(ctx, dataKey).Result()
	if err != nil {
		return nil, err
	}

	var item QueueItem
	if err := json.Unmarshal([]byte(data), &item); err != nil {
		return nil, err
	}

	return &item, nil
}

func (qm *QueueManager) isItemExpired(item *QueueItem) bool {
	if item.Timeout <= 0 {
		return false
	}
	return time.Since(item.Timestamp) > item.Timeout
}

// GetQueueSize 获取队列大小
func (qm *QueueManager) GetQueueSize(queueName string) int {
	if qm.redis != nil && qm.config.UseRedis {
		ctx := context.Background()
		key := qm.config.KeyPrefix + "queue:" + queueName
		size, err := qm.redis.ZCard(ctx, key).Result()
		if err != nil {
			return 0
		}
		return int(size)
	}

	qm.mu.RLock()
	queue, exists := qm.queues[queueName]
	qm.mu.RUnlock()
	if !exists {
		return 0
	}
	return queue.Size()
}

// GetAllQueueSizes 获取所有队列大小
func (qm *QueueManager) GetAllQueueSizes() map[string]int {
	sizes := make(map[string]int)

	if qm.redis != nil && qm.config.UseRedis {
		ctx := context.Background()
		pattern := qm.config.KeyPrefix + "queue:*"
		keys, err := qm.redis.Keys(ctx, pattern).Result()
		if err == nil {
			for _, key := range keys {
				queueName := key[len(qm.config.KeyPrefix+"queue:"):]
				size, err := qm.redis.ZCard(ctx, key).Result()
				if err == nil {
					sizes[queueName] = int(size)
				}
			}
		}
		return sizes
	}

	qm.mu.RLock()
	defer qm.mu.RUnlock()
	for name, queue := range qm.queues {
		sizes[name] = queue.Size()
	}
	return sizes
}

// Remove 移除指定项
func (qm *QueueManager) Remove(queueName string, itemID string) error {
	if qm.redis != nil && qm.config.UseRedis {
		ctx := context.Background()
		key := qm.config.KeyPrefix + "queue:" + queueName

		// 查找匹配的项
		results, err := qm.redis.ZRangeByScoreWithScores(ctx, key, &redis.ZRangeBy{
			Min: "-inf",
			Max: "+inf",
		}).Result()
		if err != nil {
			return err
		}

		for _, z := range results {
			member := z.Member.(string)
			if member[:len(itemID)] == itemID {
				qm.redis.ZRem(ctx, key, member)
				dataKey := key + ":data:" + member
				qm.redis.Del(ctx, dataKey)
				return nil
			}
		}
		return fmt.Errorf("项不存在: %s", itemID)
	}

	qm.mu.RLock()
	queue, exists := qm.queues[queueName]
	qm.mu.RUnlock()
	if !exists {
		return fmt.Errorf("队列不存在: %s", queueName)
	}

	queue.mu.Lock()
	defer queue.mu.Unlock()
	for i, item := range queue.items {
		if item.ID == itemID {
			queue.items = append(queue.items[:i], queue.items[i+1:]...)
			queueSizeGauge.WithLabelValues(queueName).Dec()
			return nil
		}
	}
	return fmt.Errorf("项不存在: %s", itemID)
}

// Notify SSE通知
func (qm *QueueManager) Notify(clientID string, event string, data interface{}) {
	if qm.sseNotifier != nil && qm.sseNotifier.notifyFunc != nil {
		qm.sseNotifier.notifyFunc(clientID, event, data)
	}
}

// SetSSENotifier 设置SSE通知器
func (qm *QueueManager) SetSSENotifier(notifyFunc func(clientID string, event string, data interface{})) {
	qm.sseNotifier = &SSENotifier{notifyFunc: notifyFunc}
}

// notifySSE 通知SSE客户端
func (qm *QueueManager) notifySSE(queueName string, event QueueEvent) {
	if qm.sseNotifier != nil && qm.sseNotifier.notifyFunc != nil {
		qm.sseNotifier.notifyFunc(queueName, "queue:"+event.Type, event)
	}
}

// Subscribe 订阅队列事件
func (qm *QueueManager) Subscribe(clientID string, queueName string, notifyFunc func(event QueueEvent)) {
	qm.mu.Lock()
	defer qm.mu.Unlock()
	// 通知函数已在外部设置
}

// cleanup 定期清理过期项
func (qm *QueueManager) cleanup() {
	ticker := time.NewTicker(1 * time.Minute)
	for {
		select {
		case <-ticker.C:
			qm.cleanupExpired()
		case <-qm.ctx.Done():
			return
		}
	}
}

// cleanupExpired 清理过期项
func (qm *QueueManager) cleanupExpired() {
	if qm.redis != nil && qm.config.UseRedis {
		qm.cleanupExpiredRedis()
	} else {
		qm.cleanupExpiredMemory()
	}
}

func (qm *QueueManager) cleanupExpiredRedis() {
	ctx := context.Background()
	pattern := qm.config.KeyPrefix + "queue:*"
	keys, err := qm.redis.Keys(ctx, pattern).Result()
	if err != nil {
		return
	}

	now := time.Now()

	for _, key := range keys {
		queueName := key[len(qm.config.KeyPrefix+"queue:"):]

		// 获取所有项并检查过期
		results, err := qm.redis.ZRangeByScoreWithScores(ctx, key, &redis.ZRangeBy{
			Min: "-inf",
			Max: "+inf",
		}).Result()
		if err != nil {
			continue
		}

		for _, z := range results {
			member := z.Member.(string)
			item, err := qm.getRedisItemData(queueName, member)
			if err != nil {
				// 数据不存在，删除zset中的项
				qm.redis.ZRem(ctx, key, member)
				continue
			}

			if item.Timeout > 0 && now.Sub(item.Timestamp) > item.Timeout {
				log.Warn().Str("item_id", item.ID).Str("queue", queueName).Msg("队列项超时被移除")
				qm.redis.ZRem(ctx, key, member)
				dataKey := key + ":data:" + member
				qm.redis.Del(ctx, dataKey)
				queueExpiredTotal.WithLabelValues(queueName).Inc()
			}
		}
	}
}

func (qm *QueueManager) cleanupExpiredMemory() {
	qm.mu.Lock()
	defer qm.mu.Unlock()
	now := time.Now()
	for name, queue := range qm.queues {
		queue.mu.Lock()
		validItems := make([]*QueueItem, 0)
		for _, item := range queue.items {
			if item.Timeout > 0 && now.Sub(item.Timestamp) > item.Timeout {
				log.Warn().Str("item_id", item.ID).Str("queue", name).Msg("队列项超时被移除")
				queueExpiredTotal.WithLabelValues(name).Inc()
				continue
			}
			validItems = append(validItems, item)
		}
		queue.items = validItems
		queue.mu.Unlock()
	}
}

// Close 关闭队列管理器
func (qm *QueueManager) Close() error {
	qm.cancel()
	qm.mu.Lock()
	defer qm.mu.Unlock()
	for _, queue := range qm.queues {
		queue.Close()
	}
	if qm.redis != nil {
		return qm.redis.Close()
	}
	return nil
}

// QueueStats 队列统计
type QueueStats struct {
	Name       string    `json:"name"`
	Size       int       `json:"size"`
	OldestItem time.Time `json:"oldest_item,omitempty"`
	MaxSize    int       `json:"max_size"`
}

// GetStats 获取队列统计信息
func (qm *QueueManager) GetStats() []QueueStats {
	stats := make([]QueueStats, 0)

	if qm.redis != nil && qm.config.UseRedis {
		ctx := context.Background()
		pattern := qm.config.KeyPrefix + "queue:*"
		keys, err := qm.redis.Keys(ctx, pattern).Result()
		if err == nil {
			for _, key := range keys {
				queueName := key[len(qm.config.KeyPrefix+"queue:"):]
				size, _ := qm.redis.ZCard(ctx, key).Result()
				var oldest time.Time
				if size > 0 {
					results, _ := qm.redis.ZRangeWithScores(ctx, key, 0, 0).Result()
					if len(results) > 0 {
						oldest = time.Unix(0, int64(results[0].Score))
					}
				}
				stats = append(stats, QueueStats{
					Name:       queueName,
					Size:       int(size),
					OldestItem: oldest,
					MaxSize:    qm.config.MaxSize,
				})
			}
		}
		return stats
	}

	qm.mu.RLock()
	defer qm.mu.RUnlock()
	for name, queue := range qm.queues {
		queue.mu.RLock()
		size := len(queue.items)
		var oldest time.Time
		if size > 0 {
			oldest = queue.items[0].Timestamp
		}
		queue.mu.RUnlock()
		stats = append(stats, QueueStats{
			Name:       name,
			Size:       size,
			OldestItem: oldest,
			MaxSize:    queue.maxSize,
		})
	}
	return stats
}
