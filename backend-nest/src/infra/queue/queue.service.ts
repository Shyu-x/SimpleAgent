/**
 * Queue Service - 队列管理器服务
 * @description 请求队列管理、优先级队列、超时踢出、并发控制、SSE状态通知
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';

export enum Priority {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
  BACKGROUND = 4,
}

export enum RequestStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled',
}

export interface QueueItem {
  id: string;
  request: any;
  priority: Priority;
  status: RequestStatus;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  timeout: number;
  maxRetries: number;
  retryCount: number;
  result: any;
  error: string | null;
  progress: number;
  metadata: Record<string, any>;
}

export interface QueueOptions {
  maxSize?: number;
  maxConcurrent?: number;
  defaultTimeout?: number;
  cleanupInterval?: number;
  autoCleanup?: boolean;
  dequeueRate?: number;
}

@Injectable()
export class QueueService extends EventEmitter implements OnModuleDestroy {
  private maxSize: number;
  private maxConcurrent: number;
  private defaultTimeout: number;
  private cleanupInterval: number;
  private dequeueRate: number;
  private lastDequeueTime = 0;

  private queues: Record<Priority, QueueItem[]> = {
    [Priority.CRITICAL]: [],
    [Priority.HIGH]: [],
    [Priority.NORMAL]: [],
    [Priority.LOW]: [],
    [Priority.BACKGROUND]: [],
  };

  private processing = new Map<string, QueueItem>();

  private stats = {
    enqueued: 0,
    processed: 0,
    failed: 0,
    timedOut: 0,
    cancelled: 0,
  };

  private cleanupTimer: NodeJS.Timeout | null = null;
  private sseSubscriptions = new Map<string, (data: any) => void>();

  constructor(options: QueueOptions = {}) {
    super();
    this.maxSize = options.maxSize || 1000;
    this.maxConcurrent = options.maxConcurrent || 10;
    this.defaultTimeout = options.defaultTimeout || 30000;
    this.cleanupInterval = options.cleanupInterval || 60000;
    this.dequeueRate = options.dequeueRate || 100;

    if (options.autoCleanup !== false) {
      this.startCleanup();
    }
  }

  onModuleDestroy() {
    this.destroy();
  }

  enqueue(request: any, options: Partial<QueueItem> = {}): string {
    if (this.size() >= this.maxSize) {
      this.emit('queueFull', { request, size: this.size() });
      throw new Error(`队列已满 (${this.maxSize})`);
    }

    const item: QueueItem = {
      id: options.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      request,
      priority: options.priority || Priority.NORMAL,
      status: RequestStatus.PENDING,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      timeout: options.timeout || this.defaultTimeout,
      maxRetries: options.maxRetries || 0,
      retryCount: 0,
      result: null,
      error: null,
      progress: 0,
      metadata: options.metadata || {},
    };

    this.queues[item.priority].push(item);
    this.stats.enqueued++;
    this.emit('enqueue', { item, size: this.size() });
    this.notifySSE('enqueue', item);
    this.scheduleDequeue();

    return item.id;
  }

  dequeue(): QueueItem | null {
    const priorities = [Priority.CRITICAL, Priority.HIGH, Priority.NORMAL, Priority.LOW, Priority.BACKGROUND];
    for (const priority of priorities) {
      const queue = this.queues[priority];
      if (queue && queue.length > 0) {
        return queue.shift()!;
      }
    }
    return null;
  }

  peek(): QueueItem | null {
    for (const queue of Object.values(this.queues)) {
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return null;
  }

  size(priority?: Priority): number {
    if (priority !== undefined) {
      return this.queues[priority]?.length || 0;
    }

    let total = 0;
    for (const queue of Object.values(this.queues)) {
      total += queue.length;
    }
    return total;
  }

  getActiveCount(): number {
    return this.processing.size;
  }

  getStatus(id: string): QueueItem | null {
    if (this.processing.has(id)) {
      return this.processing.get(id)!;
    }

    for (const queue of Object.values(this.queues)) {
      const item = queue.find((item) => item.id === id);
      if (item) return item;
    }

    return null;
  }

  cancel(id: string): boolean {
    for (const [priority, queue] of Object.entries(this.queues)) {
      const index = queue.findIndex((item) => item.id === id);
      if (index !== -1) {
        const item = queue.splice(index, 1)[0];
        item.status = RequestStatus.CANCELLED;
        this.stats.cancelled++;
        this.emit('cancelled', { item });
        this.notifySSE('cancelled', item);
        return true;
      }
    }

    if (this.processing.has(id)) {
      const item = this.processing.get(id)!;
      item.status = RequestStatus.CANCELLED;
      this.processing.delete(id);
      this.stats.cancelled++;
      this.emit('cancelled', { item });
      this.notifySSE('cancelled', item);
      return true;
    }

    return false;
  }

  async process(id: string, handler: (request: any, item: QueueItem) => Promise<any>): Promise<QueueItem> {
    const item = this.getStatus(id);
    if (!item) {
      throw new Error(`任务 ${id} 不存在`);
    }

    if (item.status !== RequestStatus.PENDING) {
      throw new Error(`任务 ${id} 状态不是 PENDING`);
    }

    if (this.processing.size >= this.maxConcurrent) {
      await this.waitForCapacity();
    }

    item.status = RequestStatus.PROCESSING;
    item.startedAt = Date.now();
    this.processing.set(id, item);

    this.emit('start', { item });
    this.notifySSE('start', item);

    try {
      const result = await Promise.race([
        handler(item.request, item),
        this.createTimeoutPromise(item.timeout),
      ]);

      item.result = result;
      item.status = RequestStatus.COMPLETED;
      item.completedAt = Date.now();
      this.stats.processed++;

      this.emit('complete', { item, result });
      this.notifySSE('complete', item);
    } catch (error: any) {
      if (error.message === 'TIMEOUT') {
        item.status = RequestStatus.TIMEOUT;
        this.stats.timedOut++;
        this.emit('timeout', { item });
      } else {
        item.status = RequestStatus.FAILED;
        item.error = error.message;
        this.stats.failed++;
        this.emit('error', { item, error });
      }

      if (this.canRetry(item)) {
        item.retryCount++;
        item.status = RequestStatus.PENDING;
        item.startedAt = null;
        this.queues[item.priority].push(item);
        this.emit('retry', { item });
      }
    } finally {
      this.processing.delete(id);
      this.scheduleDequeue();
    }

    return item;
  }

  private canRetry(item: QueueItem): boolean {
    return item.retryCount < item.maxRetries;
  }

  clear(priority?: Priority): number {
    if (priority !== undefined) {
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

  getStats() {
    return {
      ...this.stats,
      queueSize: this.size(),
      activeCount: this.processing.size,
      maxConcurrent: this.maxConcurrent,
      queues: {
        critical: this.size(Priority.CRITICAL),
        high: this.size(Priority.HIGH),
        normal: this.size(Priority.NORMAL),
        low: this.size(Priority.LOW),
        background: this.size(Priority.BACKGROUND),
      },
    };
  }

  subscribe(sessionId: string, callback: (data: any) => void): () => void {
    this.sseSubscriptions.set(sessionId, callback);
    return () => {
      this.sseSubscriptions.delete(sessionId);
    };
  }

  private notifySSE(event: string, item: QueueItem) {
    const data = {
      event,
      item: {
        id: item.id,
        status: item.status,
        priority: item.priority,
        progress: item.progress,
      },
      timestamp: Date.now(),
    };

    for (const callback of this.sseSubscriptions.values()) {
      try {
        callback(data);
      } catch (error) {
        console.error('SSE通知失败:', error);
      }
    }
  }

  private scheduleDequeue() {
    const now = Date.now();
    if (now - this.lastDequeueTime >= this.dequeueRate) {
      this.lastDequeueTime = now;
      this.emit('ready', { queueSize: this.size() });
    }
  }

  private waitForCapacity(): Promise<void> {
    return new Promise((resolve) => {
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

  private createTimeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), ms);
    });
  }

  private startCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  private cleanup() {
    let cleaned = 0;

    const priorities = [Priority.CRITICAL, Priority.HIGH, Priority.NORMAL, Priority.LOW, Priority.BACKGROUND];
    for (const priority of priorities) {
      const queue = this.queues[priority];
      if (!queue) continue;
      const validItems: QueueItem[] = [];
      for (const item of queue) {
        if (this.isExpired(item) && item.status === RequestStatus.PENDING) {
          item.status = RequestStatus.TIMEOUT;
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

  private isExpired(item: QueueItem): boolean {
    return Date.now() - item.createdAt > item.timeout;
  }

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
