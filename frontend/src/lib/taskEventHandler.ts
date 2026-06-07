// lib/taskEventHandler.ts - 任务事件处理器

import type { StreamChunk } from '../stores/taskStore';

// Re-export for backward compatibility
export type { StreamChunk } from '../stores/taskStore';

/**
 * 事件类型枚举
 */
export type TaskEventType =
  | 'task_created'
  | 'task_started'
  | 'task_progress'
  | 'task_stage'
  | 'task_complete'
  | 'task_failed'
  | 'task_cancelled'
  | 'stream_chunk'
  | 'log'
  | 'tool_call'
  | 'confirmation';

/**
 * 基础事件结构
 */
export interface BaseEvent {
  type: TaskEventType;
  taskId: string;
  collaborationId: string;
  timestamp: number;
}

/**
 * 任务创建事件
 */
export interface TaskCreatedEvent extends BaseEvent {
  type: 'task_created';
  taskName?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 任务开始事件
 */
export interface TaskStartedEvent extends BaseEvent {
  type: 'task_started';
}

/**
 * 任务进度事件
 */
export interface TaskProgressEvent extends BaseEvent {
  type: 'task_progress';
  progress: number;
}

/**
 * 任务阶段事件
 */
export interface TaskStageEvent extends BaseEvent {
  type: 'task_stage';
  stage: string;
}

/**
 * 任务完成事件
 */
export interface TaskCompleteEvent extends BaseEvent {
  type: 'task_complete';
  result: unknown;
}

/**
 * 任务失败事件
 */
export interface TaskFailedEvent extends BaseEvent {
  type: 'task_failed';
  error: {
    code?: string;
    message: string;
    stack?: string;
  };
}

/**
 * 任务取消事件
 */
export interface TaskCancelledEvent extends BaseEvent {
  type: 'task_cancelled';
  reason?: string;
}

/**
 * 流数据块事件
 */
export interface StreamChunkEvent extends BaseEvent {
  type: 'stream_chunk';
  chunk: StreamChunk;
}

/**
 * 日志事件
 */
export interface LogEvent extends BaseEvent {
  type: 'log';
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
}

/**
 * 工具调用事件
 */
export interface ToolCallEvent extends BaseEvent {
  type: 'tool_call';
  toolName: string;
  toolArgs?: Record<string, unknown>;
}

/**
 * 确认请求事件
 */
export interface ConfirmationEvent extends BaseEvent {
  type: 'confirmation';
  request: {
    id: string;
    type: string;
    title: string;
    message: string;
    options?: string[];
  };
}

/**
 * 任务事件联合类型
 */
export type TaskEvent =
  | TaskCreatedEvent
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskStageEvent
  | TaskCompleteEvent
  | TaskFailedEvent
  | TaskCancelledEvent
  | StreamChunkEvent
  | LogEvent
  | ToolCallEvent
  | ConfirmationEvent;

/**
 * 任务事件处理器接口
 */
export interface TaskEventHandler {
  (event: TaskEvent): void;
}

/**
 * 事件处理器注册表项
 */
interface HandlerRegistration {
  id: string;
  handler: TaskEventHandler;
  eventTypes?: TaskEventType[];
  taskIds?: string[];
  priority: number;
}

/**
 * 任务事件处理器单例
 * 支持自定义处理器注册、批量事件处理、优先级排序
 */
class TaskEventProcessor {
  private static instance: TaskEventProcessor | null = null;

  private handlers: Map<string, HandlerRegistration> = new Map();
  private handlerIdCounter = 0;

  private eventQueue: TaskEvent[] = [];
  private isProcessing = false;
  private processingInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    // 启动事件队列处理循环
    this.startProcessingLoop();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): TaskEventProcessor {
    if (!TaskEventProcessor.instance) {
      TaskEventProcessor.instance = new TaskEventProcessor();
    }
    return TaskEventProcessor.instance;
  }

  /**
   * 注册事件处理器
   * @param handler 事件处理函数
   * @param eventTypes 要处理的事件类型（可选，不填则处理所有类型）
   * @param taskIds 要处理的任务ID（可选，不填则处理所有任务）
   * @param priority 优先级（数字越大越先执行）
   * @returns 处理器注册ID
   */
  register(
    handler: TaskEventHandler,
    eventTypes?: TaskEventType[],
    taskIds?: string[],
    priority = 0
  ): string {
    const id = `handler_${++this.handlerIdCounter}`;
    this.handlers.set(id, {
      id,
      handler,
      eventTypes,
      taskIds,
      priority,
    });
    return id;
  }

  /**
   * 注销事件处理器
   */
  unregister(handlerId: string): boolean {
    return this.handlers.delete(handlerId);
  }

  /**
   * 清空所有处理器
   */
  clearAllHandlers(): void {
    this.handlers.clear();
  }

  /**
   * 处理单个事件
   */
  handleEvent(event: TaskEvent): void {
    // 按优先级排序处理器
    const sortedHandlers = Array.from(this.handlers.values())
      .sort((a, b) => b.priority - a.priority);

    for (const registration of sortedHandlers) {
      // 检查是否应该处理这个事件
      if (!this.shouldHandle(registration, event)) {
        continue;
      }

      try {
        registration.handler(event);
      } catch (error) {
        console.error(`[TaskEventHandler] Handler ${registration.id} error:`, error);
      }
    }
  }

  /**
   * 发布事件（加入队列异步处理）
   */
  emit(event: TaskEvent): void {
    this.eventQueue.push(event);
  }

  /**
   * 同步发布事件（立即处理）
   */
  emitSync(event: TaskEvent): void {
    this.handleEvent(event);
  }

  /**
   * 批量发布事件
   */
  emitBatch(events: TaskEvent[]): void {
    for (const event of events) {
      this.eventQueue.push(event);
    }
  }

  /**
   * 获取待处理事件数量
   */
  getQueueSize(): number {
    return this.eventQueue.length;
  }

  /**
   * 获取已注册处理器数量
   */
  getHandlerCount(): number {
    return this.handlers.size;
  }

  /**
   * 启动事件队列处理循环
   */
  private startProcessingLoop(): void {
    if (this.processingInterval) return;

    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 100); // 每 100ms 处理一批事件
  }

  /**
   * 停止事件队列处理循环
   */
  stopProcessingLoop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * 处理事件队列
   */
  private processQueue(): void {
    if (this.isProcessing || this.eventQueue.length === 0) return;

    this.isProcessing = true;

    try {
      // 每次最多处理 50 个事件
      const batch = this.eventQueue.splice(0, 50);
      for (const event of batch) {
        this.handleEvent(event);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 检查处理器是否应该处理这个事件
   */
  private shouldHandle(registration: HandlerRegistration, event: TaskEvent): boolean {
    // 检查事件类型
    if (registration.eventTypes && registration.eventTypes.length > 0) {
      if (!registration.eventTypes.includes(event.type)) {
        return false;
      }
    }

    // 检查任务 ID
    if (registration.taskIds && registration.taskIds.length > 0) {
      if (!registration.taskIds.includes(event.taskId)) {
        return false;
      }
    }

    return true;
  }
}

/**
 * 获取任务事件处理器单例
 */
export function getTaskEventHandler(): TaskEventProcessor {
  return TaskEventProcessor.getInstance();
}

/**
 * 解析 SSE 事件数据为标准化事件
 */
function buildBaseEvent(rawData: Record<string, unknown>, timestamp: number) {
  return {
    taskId: String(rawData.taskId || ''),
    collaborationId: String(rawData.collaborationId || ''),
    timestamp,
  };
}

export function parseSSEEvent(eventType: string, data: unknown): TaskEvent | null {
  if (!data || typeof data !== 'object') return null;

  const rawData = data as Record<string, unknown>;
  const timestamp = Date.now();
  const base = buildBaseEvent(rawData, timestamp);

  switch (eventType) {
    case 'task_created':
      return { type: 'task_created', ...base, taskName: rawData.taskName as string, metadata: rawData.metadata as Record<string, unknown> };
    case 'task_started':
      return { type: 'task_started', ...base };
    case 'task_progress':
      return { type: 'task_progress', ...base, progress: Number(rawData.progress || 0) };
    case 'task_stage':
      return { type: 'task_stage', ...base, stage: String(rawData.stage || '') };
    case 'task_complete':
      return { type: 'task_complete', ...base, result: rawData.result };
    case 'task_failed':
      return { type: 'task_failed', ...base, error: rawData.error as TaskFailedEvent['error'] };
    case 'task_cancelled':
      return { type: 'task_cancelled', ...base, reason: rawData.reason as string };
    case 'stream_chunk':
      return { type: 'stream_chunk', ...base, chunk: rawData.chunk as StreamChunk };
    case 'log':
      return { type: 'log', ...base, level: (rawData.level as LogEvent['level']) || 'info', message: String(rawData.message || '') };
    case 'tool_call':
      return { type: 'tool_call', ...base, toolName: String(rawData.toolName || ''), toolArgs: rawData.toolArgs as Record<string, unknown> };
    case 'confirmation':
      return { type: 'confirmation', ...base, request: rawData.request as ConfirmationEvent['request'] };
    default:
      return null;
  }
}

export default TaskEventProcessor;