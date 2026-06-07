// hooks/useTaskStatus.ts - 任务状态 Hook
'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useTaskStore, type Task, type TaskStatus, type StreamChunk, type ErrorInfo, type ConnectionStatus } from '@/stores/taskStore';
import { parseSSEEvent, type TaskEvent } from '@/lib/taskEventHandler';
import { BACKEND_URL } from '@/lib/config';

/**
 * useTaskStatus Hook 配置选项
 */
export interface UseTaskStatusOptions {
  /** 协作会话 ID */
  collaborationId?: string;
  /** 任务 ID */
  taskId?: string;
  /** 是否启用自动连接 */
  autoConnect?: boolean;
  /** SSE 端点路径（可选，默认使用 A2A 协作端点） */
  sseEndpoint?: string;
  /** 最大重连次数 */
  maxReconnectAttempts?: number;
  /** 重连间隔（毫秒） */
  reconnectInterval?: number;
  /** 连接超时（毫秒） */
  connectionTimeout?: number;
  /** 是否自动重连 */
  autoReconnect?: boolean;

  // 事件回调
  /** 任务创建回调 */
  onTaskCreated?: (task: Task) => void;
  /** 任务开始回调 */
  onTaskStarted?: (taskId: string) => void;
  /** 任务进度回调 */
  onTaskProgress?: (taskId: string, progress: number, stage?: string) => void;
  /** 任务阶段变化回调 */
  onTaskStage?: (taskId: string, stage: string) => void;
  /** 任务完成回调 */
  onTaskComplete?: (taskId: string, result: unknown) => void;
  /** 任务失败回调 */
  onTaskFailed?: (taskId: string, error: ErrorInfo) => void;
  /** 任务取消回调 */
  onTaskCancelled?: (taskId: string, reason?: string) => void;
  /** 流数据块回调 */
  onStreamChunk?: (taskId: string, chunk: StreamChunk) => void;
  /** 日志回调 */
  onLog?: (taskId: string, level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
  /** 工具调用回调 */
  onToolCall?: (taskId: string, toolName: string, toolArgs?: Record<string, unknown>) => void;
  /** 确认请求回调 */
  onConfirmation?: (request: { id: string; type: string; title: string; message: string }) => void;

  // 连接状态回调
  /** 连接成功回调 */
  onConnected?: () => void;
  /** 断开连接回调 */
  onDisconnected?: () => void;
  /** 连接错误回调 */
  onConnectionError?: (error: Error) => void;
}

/**
 * useTaskStatus Hook 返回值
 */
export interface UseTaskStatusReturn {
  // 连接状态
  /** 是否已连接 */
  isConnected: boolean;
  /** 连接状态 */
  connectionStatus: ConnectionStatus;
  /** 最后错误信息 */
  lastError: ErrorInfo | null;

  // 任务数据
  /** 获取指定任务 */
  getTask: (taskId: string) => Task | undefined;
  /** 获取所有任务 */
  getAllTasks: () => Task[];
  /** 获取活跃任务列表 */
  getActiveTasks: () => Task[];
  /** 获取任务流缓冲 */
  getStreamBuffer: (taskId: string) => StreamChunk[];

  // 操作方法
  /** 连接 SSE */
  connect: () => void;
  /** 断开连接 */
  disconnect: () => void;
  /** 手动刷新任务状态 */
  refreshTask: (taskId: string) => Promise<void>;
  /** 清除任务 */
  clearTask: (taskId: string) => void;
  /** 清除所有任务 */
  clearAllTasks: () => void;
}

/**
 * useTaskStatus Hook
 * 提供任务状态管理、SSE 连接、自动重连等功能
 *
 * @example
 * ```tsx
 * const { isConnected, getTask, onTaskComplete } = useTaskStatus({
 *   collaborationId: 'collab-123',
 *   autoConnect: true,
 *   onTaskComplete: (taskId, result) => {
 *     console.log('Task completed:', taskId, result);
 *   },
 * });
 * ```
 */
export function useTaskStatus(options: UseTaskStatusOptions = {}): UseTaskStatusReturn {
  const {
    collaborationId,
    taskId,
    autoConnect = true,
    sseEndpoint,
    maxReconnectAttempts = 5,
    reconnectInterval = 3000,
    connectionTimeout = 30000,
    autoReconnect = true,

    // 事件回调
    onTaskCreated,
    onTaskStarted,
    onTaskProgress,
    onTaskStage,
    onTaskComplete,
    onTaskFailed,
    onTaskCancelled,
    onStreamChunk,
    onLog,
    onToolCall,
    onConfirmation,

    // 连接状态回调
    onConnected,
    onDisconnected,
    onConnectionError,
  } = options;

  const store = useTaskStore();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 存储回调的 ref（用于在 effect 中访问最新回调）
  const callbacksRef = useRef({
    onTaskCreated,
    onTaskStarted,
    onTaskProgress,
    onTaskStage,
    onTaskComplete,
    onTaskFailed,
    onTaskCancelled,
    onStreamChunk,
    onLog,
    onToolCall,
    onConfirmation,
    onConnected,
    onDisconnected,
    onConnectionError,
  });

  // 更新回调 ref
  useEffect(() => {
    callbacksRef.current = {
      onTaskCreated,
      onTaskStarted,
      onTaskProgress,
      onTaskStage,
      onTaskComplete,
      onTaskFailed,
      onTaskCancelled,
      onStreamChunk,
      onLog,
      onToolCall,
      onConfirmation,
      onConnected,
      onDisconnected,
      onConnectionError,
    };
  });

  /**
   * 处理 SSE 事件
   */
  const handleSSEEvent = useCallback((eventType: string, data: unknown) => {
    // 使用独立的 parseSSEEvent 函数
    const event = parseSSEEvent(eventType, data);

    if (!event) return;

    const { type, taskId: eventTaskId, ...eventData } = event;

    // 更新 Store
    switch (type) {
      case 'task_created':
        store.addTask({
          id: eventTaskId,
          collaborationId: (event as { collaborationId: string }).collaborationId,
          status: 'PENDING',
          progress: 0,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
          metadata: (event as { metadata?: Record<string, unknown> }).metadata,
        });
        // 获取创建的任务并传递给回调
        const createdTask = store.tasks[eventTaskId];
        if (createdTask) {
          callbacksRef.current.onTaskCreated?.(createdTask);
        }
        break;

      case 'task_started':
        store.updateTask(eventTaskId, { status: 'RUNNING' });
        callbacksRef.current.onTaskStarted?.(eventTaskId);
        break;

      case 'task_progress':
        store.updateTask(eventTaskId, { progress: (event as { progress: number }).progress });
        const progressData = event as { progress: number; stage?: string };
        callbacksRef.current.onTaskProgress?.(eventTaskId, progressData.progress, progressData.stage);
        break;

      case 'task_stage':
        store.updateTask(eventTaskId, { stage: (event as { stage: string }).stage });
        callbacksRef.current.onTaskStage?.(eventTaskId, (event as { stage: string }).stage);
        break;

      case 'task_complete':
        store.updateTask(eventTaskId, {
          status: 'COMPLETED',
          progress: 100,
          result: (event as { result: unknown }).result,
        });
        callbacksRef.current.onTaskComplete?.(eventTaskId, (event as { result: unknown }).result);
        break;

      case 'task_failed':
        const failedData = event as { error: ErrorInfo };
        store.updateTask(eventTaskId, { status: 'FAILED', error: failedData.error });
        callbacksRef.current.onTaskFailed?.(eventTaskId, failedData.error);
        break;

      case 'task_cancelled':
        store.updateTask(eventTaskId, { status: 'CANCELLED' });
        callbacksRef.current.onTaskCancelled?.(eventTaskId, (event as { reason?: string }).reason);
        break;

      case 'stream_chunk':
        const chunkData = event as { chunk: StreamChunk };
        store.addStreamChunk(eventTaskId, chunkData.chunk);
        callbacksRef.current.onStreamChunk?.(eventTaskId, chunkData.chunk);
        break;

      case 'log':
        const logData = event as { level: 'debug' | 'info' | 'warn' | 'error'; message: string };
        callbacksRef.current.onLog?.(eventTaskId, logData.level, logData.message);
        break;

      case 'tool_call':
        const toolData = event as { toolName: string; toolArgs?: Record<string, unknown> };
        callbacksRef.current.onToolCall?.(eventTaskId, toolData.toolName, toolData.toolArgs);
        break;

      case 'confirmation':
        callbacksRef.current.onConfirmation?.((event as { request: Parameters<typeof callbacksRef.current.onConfirmation>[0] }).request);
        break;
    }
  }, [store]);

  /**
   * 连接 SSE
   */
  const connect = useCallback(() => {
    // 避免重复连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // 构建 SSE URL
    let url: string;
    if (sseEndpoint) {
      url = `${BACKEND_URL}${sseEndpoint}`;
    } else if (collaborationId) {
      url = `${BACKEND_URL}/api/a2a/collaboration/${collaborationId}/subscribe`;
    } else if (taskId) {
      url = `${BACKEND_URL}/api/a2a/collaboration/${taskId}/subscribe`;
    } else {
      console.error('[useTaskStatus] No collaborationId or taskId provided');
      return;
    }

    store.setConnectionStatus('connecting');

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // 连接超时计时器
    connectionTimerRef.current = setTimeout(() => {
      if (eventSource.readyState === EventSource.CONNECTING) {
        eventSource.close();
        store.setConnectionStatus('error');
        store.setLastError({ message: '连接超时' });
        callbacksRef.current.onConnectionError?.(new Error('连接超时'));
      }
    }, connectionTimeout);

    eventSource.onopen = () => {
      clearTimeout(connectionTimerRef.current!);
      reconnectAttemptsRef.current = 0;
      store.setConnectionStatus('connected');
      store.setLastError(null);
      callbacksRef.current.onConnected?.();
    };

    // 监听各种事件类型
    eventSource.addEventListener('task_created', (e) => handleSSEEvent('task_created', JSON.parse(e.data)));
    eventSource.addEventListener('task_started', (e) => handleSSEEvent('task_started', JSON.parse(e.data)));
    eventSource.addEventListener('task_progress', (e) => handleSSEEvent('task_progress', JSON.parse(e.data)));
    eventSource.addEventListener('task_stage', (e) => handleSSEEvent('task_stage', JSON.parse(e.data)));
    eventSource.addEventListener('task_complete', (e) => handleSSEEvent('task_complete', JSON.parse(e.data)));
    eventSource.addEventListener('task_failed', (e) => handleSSEEvent('task_failed', JSON.parse(e.data)));
    eventSource.addEventListener('task_cancelled', (e) => handleSSEEvent('task_cancelled', JSON.parse(e.data)));
    eventSource.addEventListener('stream_chunk', (e) => handleSSEEvent('stream_chunk', JSON.parse(e.data)));
    eventSource.addEventListener('log', (e) => handleSSEEvent('log', JSON.parse(e.data)));
    eventSource.addEventListener('tool_call', (e) => handleSSEEvent('tool_call', JSON.parse(e.data)));
    eventSource.addEventListener('confirmation', (e) => handleSSEEvent('confirmation', JSON.parse(e.data)));

    // 处理 onmessage（通用消息）
    eventSource.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.event) {
          handleSSEEvent(parsed.event, parsed.data);
        }
      } catch (error) {
        console.error('[useTaskStatus] Parse error:', error);
      }
    };

    eventSource.onerror = (error) => {
      clearTimeout(connectionTimerRef.current!);
      store.setConnectionStatus('error');
      store.setLastError({ message: 'SSE 连接错误' });
      callbacksRef.current.onConnectionError?.(new Error('SSE 连接错误'));

      // 自动重连
      if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        console.log(`[useTaskStatus] 尝试重连 (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);

        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, reconnectInterval);
      } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        console.error('[useTaskStatus] 达到最大重连次数');
        callbacksRef.current.onConnectionError?.(new Error('达到最大重连次数'));
      }
    };
  }, [
    collaborationId,
    taskId,
    sseEndpoint,
    autoReconnect,
    maxReconnectAttempts,
    reconnectInterval,
    connectionTimeout,
    store,
    handleSSEEvent,
  ]);

  /**
   * 断开连接
   */
  const disconnect = useCallback(() => {
    // 清除重连计时器
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // 清除连接超时计时器
    if (connectionTimerRef.current) {
      clearTimeout(connectionTimerRef.current);
      connectionTimerRef.current = null;
    }

    // 关闭 EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    store.setConnectionStatus('disconnected');
    callbacksRef.current.onDisconnected?.();
  }, [store]);

  /**
   * 刷新任务状态
   */
  const refreshTask = useCallback(async (taskIdToRefresh: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/a2a/collaboration/${taskIdToRefresh}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status) {
        store.updateTask(taskIdToRefresh, {
          status: data.status as TaskStatus,
          progress: data.progress,
          result: data.result,
        });
      }
    } catch (error) {
      console.error('[useTaskStatus] 刷新任务失败:', error);
    }
  }, [store]);

  /**
   * 清除任务
   */
  const clearTask = useCallback((taskIdToClear: string) => {
    store.removeTask(taskIdToClear);
  }, [store]);

  /**
   * 清除所有任务
   */
  const clearAllTasks = useCallback(() => {
    store.clearAllTasks();
  }, [store]);

  /**
   * 获取任务 - 使用 useMemo 缓存结果，基于 store.tasks 变化时更新
   */
  const getTask = useCallback((taskIdToGet: string) => store.tasks[taskIdToGet], [store.tasks]);

  /**
   * 获取所有任务 - 使用 useMemo 缓存结果
   */
  const getAllTasks = useCallback(() => Object.values(store.tasks), [store.tasks]);

  /**
   * 获取活跃任务
   */
  const getActiveTasks = useCallback(() => {
    return store.getActiveTasks();
  }, [store]);

  /**
   * 获取流缓冲
   */
  const getStreamBuffer = useCallback((taskIdToGet: string) => {
    return store.getStreamBuffer(taskIdToGet);
  }, [store]);

  // 自动连接
  useEffect(() => {
    if (autoConnect && (collaborationId || taskId)) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, collaborationId, taskId, connect, disconnect]);

  // 清理
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (connectionTimerRef.current) {
        clearTimeout(connectionTimerRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    // 连接状态
    isConnected: store.connectionStatus === 'connected',
    connectionStatus: store.connectionStatus,
    lastError: store.lastError,

    // 任务数据
    getTask,
    getAllTasks,
    getActiveTasks,
    getStreamBuffer,

    // 操作方法
    connect,
    disconnect,
    refreshTask,
    clearTask,
    clearAllTasks,
  };
}

export default useTaskStatus;