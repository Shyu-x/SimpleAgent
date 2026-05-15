/**
 * QueueManager - 队列管理器
 *
 * 功能：
 * - 请求队列管理
 * - 优先级队列
 * - 超时踢出
 * - 并发控制
 * - SSE状态通知
 * - 防止雪崩和惊群
 */

const { EventEmitter } = require('events');
const AppError = require('../../common/errors/AppError');

// 优先级常量
const PRIORITY = {
  CRITICAL: 0,  // 关键任务
  HIGH: 1,      // 高优先级
  NORMAL: 2,    // 普通优先级
  LOW: 3,       // 低优先级
  BACKGROUND: 4 // 后台任务
};

// 请求状态
const REQUEST_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled'
};

class QueueItem {
  constructor(request, options = {}) {
    this.id = options.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.request = request;
    this.priority = options.priority || PRIORITY.NORMAL;
    this.status = REQUEST_STATUS.PENDING;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 0;
    this.retryCount = 0;
    this.result = null;
    this.error = null;
    this.progress = 0;
    this.metadata = options.metadata || {};
  }

  get age() {
    return Date.now() - this.createdAt;
  }

  isExpired() {
    return this.age > this.timeout;
  }

  canRetry() {
    return this.retryCount < this.maxRetries;
  }
}

class QueueManager extends EventEmitter {
  constructor(options = {}) {
    super();

    // 队列配置
    this.maxSize = options.maxSize || 1000;
    this.maxConcurrent = options.maxConcurrent || 10;
    this.defaultTimeout = options.defaultTimeout || 30000;
    this.cleanupInterval = options.cleanupInterval || 60000;

    // 优先级队列
    this.queues = {
      [PRIORITY.CRITICAL]: [],
      [PRIORITY.HIGH]: [],
      [PRIORITY.NORMAL]: [],
      [PRIORITY.LOW]: [],
      [PRIORITY.BACKGROUND]: []
    };

    // 正在处理的任务
    this.processing = new Map();

    // 统计
    this.stats = {
      enqueued: 0,
      processed: 0,
      failed: 0,
      timedOut: 0,
      cancelled: 0
    };

    // 节流控制
    this.dequeueRate = options.dequeueRate || 100; // ms between dequeues
    this.lastDequeueTime = 0;

    // 清理定时器
    this.cleanupTimer = null;
    if (options.autoCleanup !== false) {
      this._startCleanup();
    }

    // SSE订阅者
    this.sseSubscriptions = new Map();
  }

  /**
   * 入队
   */
  enqueue(request, options = {}) {
    // 检查队列满
    if (this.size() >= this.maxSize) {
      this.emit('queueFull', { request, size: this.size() });
      throw AppError.internalError(`队列已满 (${this.maxSize})`);
    }

    const item = new QueueItem(request, {
      ...options,
      timeout: options.timeout || this.defaultTimeout
    });

    // 添加到对应优先级队列
    this.queues[item.priority].push(item);
    this.stats.enqueued++;

    this.emit('enqueue', { item, size: this.size() });

    // 通知SSE订阅者
    this._notifySSE('enqueue', item);

    // 触发处理
    this._scheduleDequeue();

    return item.id;
  }

  /**
   * 出队
   */
  dequeue() {
    // 查找最高优先级的非空队列
    for (const priority of Object.keys(this.queues)) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        const item = queue.shift();
        return item;
      }
    }
    return null;
  }

  /**
   * 查看队首（不移除）
   */
  peek() {
    for (const queue of Object.values(this.queues)) {
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return null;
  }

  /**
   * 获取队列大小
   */
  size(priority = null) {
    if (priority !== null) {
      return this.queues[priority]?.length || 0;
    }

    let total = 0;
    for (const queue of Object.values(this.queues)) {
      total += queue.length;
    }
    return total;
  }

  /**
   * 获取正在处理的任务数
   */
  getActiveCount() {
    return this.processing.size;
  }

  /**
   * 获取任务状态
   */
  getStatus(id) {
    // 检查处理中的任务
    if (this.processing.has(id)) {
      return this.processing.get(id);
    }

    // 检查队列中的任务
    for (const queue of Object.values(this.queues)) {
      const item = queue.find(item => item.id === id);
      if (item) {
        return item;
      }
    }

    return null;
  }

  /**
   * 取消任务
   */
  cancel(id) {
    // 从队列中移除
    for (const [priority, queue] of Object.entries(this.queues)) {
      const index = queue.findIndex(item => item.id === id);
      if (index !== -1) {
        const item = queue.splice(index, 1)[0];
        item.status = REQUEST_STATUS.CANCELLED;
        this.stats.cancelled++;
        this.emit('cancelled', { item });
        this._notifySSE('cancelled', item);
        return true;
      }
    }

    // 从处理中移除
    if (this.processing.has(id)) {
      const item = this.processing.get(id);
      item.status = REQUEST_STATUS.CANCELLED;
      this.processing.delete(id);
      this.stats.cancelled++;
      this.emit('cancelled', { item });
      this._notifySSE('cancelled', item);
      return true;
    }

    return false;
  }

  /**
   * 处理任务
   */
  async process(id, handler) {
    const item = this.getStatus(id);
    if (!item) {
      throw AppError.notFound(`任务 ${id}`);
    }

    if (item.status !== REQUEST_STATUS.PENDING) {
      throw AppError.validationError('status', `任务 ${id} 状态不是 PENDING`);
    }

    // 检查并发限制
    if (this.processing.size >= this.maxConcurrent) {
      // 等待有空闲
      await this._waitForCapacity();
    }

    // 更新状态
    item.status = REQUEST_STATUS.PROCESSING;
    item.startedAt = Date.now();
    this.processing.set(id, item);

    this.emit('start', { item });
    this._notifySSE('start', item);

    try {
      // 执行处理函数
      const result = await Promise.race([
        handler(item.request, item),
        this._createTimeoutPromise(item.timeout)
      ]);

      item.result = result;
      item.status = REQUEST_STATUS.COMPLETED;
      item.completedAt = Date.now();
      this.stats.processed++;

      this.emit('complete', { item, result });
      this._notifySSE('complete', item);

    } catch (error) {
      if (error.message === 'TIMEOUT') {
        item.status = REQUEST_STATUS.TIMEOUT;
        this.stats.timedOut++;
        this.emit('timeout', { item });
      } else {
        item.status = REQUEST_STATUS.FAILED;
        item.error = error.message;
        this.stats.failed++;
        this.emit('error', { item, error });
      }

      // 重试
      if (item.canRetry()) {
        item.retryCount++;
        item.status = REQUEST_STATUS.PENDING;
        item.startedAt = null;
        this.queues[item.priority].push(item);
        this.emit('retry', { item });
      }
    } finally {
      this.processing.delete(id);
      this._scheduleDequeue();
    }

    return item;
  }

  /**
   * 清空队列
   */
  clear(priority = null) {
    if (priority !== null) {
      const count = this.queues[priority]?.length || 0;
      this.queues[priority] = [];
      return count;
    }

    let total = 0;
    for (const queue of Object.values(this.queues)) {
      total += queue.length;
      queue.length = 0;
    }
    return total;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      queueSize: this.size(),
      activeCount: this.processing.size,
      maxConcurrent: this.maxConcurrent,
      queues: {
        critical: this.size(PRIORITY.CRITICAL),
        high: this.size(PRIORITY.HIGH),
        normal: this.size(PRIORITY.NORMAL),
        low: this.size(PRIORITY.LOW),
        background: this.size(PRIORITY.BACKGROUND)
      }
    };
  }

  /**
   * SSE订阅
   */
  subscribe(sessionId, callback) {
    this.sseSubscriptions.set(sessionId, callback);

    // 返回取消订阅函数
    return () => {
      this.sseSubscriptions.delete(sessionId);
    };
  }

  /**
   * SSE通知
   */
  _notifySSE(event, item) {
    const data = {
      event,
      item: {
        id: item.id,
        status: item.status,
        priority: item.priority,
        progress: item.progress
      },
      timestamp: Date.now()
    };

    for (const callback of this.sseSubscriptions.values()) {
      try {
        callback(data);
      } catch (error) {
        console.error('SSE通知失败:', error);
      }
    }
  }

  /**
   * 调度出队
   */
  _scheduleDequeue() {
    const now = Date.now();
    if (now - this.lastDequeueTime >= this.dequeueRate) {
      this.lastDequeueTime = now;
      this.emit('ready', { queueSize: this.size() });
    }
  }

  /**
   * 等待有空闲容量
   */
  _waitForCapacity() {
    return new Promise(resolve => {
      const check = () => {
        if (this.processing.size < this.maxConcurrent) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * 创建超时Promise
   */
  _createTimeoutPromise(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), ms);
    });
  }

  /**
   * 启动清理定时器
   */
  _startCleanup() {
    this.cleanupTimer = setInterval(() => {
      this._cleanup();
    }, this.cleanupInterval);
  }

  /**
   * 清理过期任务
   */
  _cleanup() {
    let cleaned = 0;

    // 清理各优先级队列中的过期任务
    for (const [priority, queue] of Object.entries(this.queues)) {
      const validItems = [];
      for (const item of queue) {
        if (item.isExpired() && item.status === REQUEST_STATUS.PENDING) {
          item.status = REQUEST_STATUS.TIMEOUT;
          this.stats.timedOut++;
          cleaned++;
          this.emit('expired', { item });
        } else {
          validItems.push(item);
        }
      }
      this.queues[priority] = validItems;
    }

    if (cleaned > 0) {
      this.emit('cleanup', { cleaned, remaining: this.size() });
    }
  }

  /**
   * 销毁
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.clear();
    this.processing.clear();
    this.sseSubscriptions.clear();
    this.removeAllListeners();
  }
}

// 导出
module.exports = {
  QueueManager,
  QueueItem,
  PRIORITY,
  REQUEST_STATUS
};
