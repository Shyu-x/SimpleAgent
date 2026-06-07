'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAgentWorkflowStore, SSEEvent } from '@/store/agentWorkflowStore';
import { agentWorkflowAPI } from '@/lib/agentWorkflowAPI';
import { BACKEND_URL } from '@/lib/config';

interface UseAgentSSEOptions {
  sessionId: string | null;
  enabled?: boolean;
  onTaskStart?: (taskId: string, agentId: string) => void;
  onTaskComplete?: (taskId: string, result: string) => void;
  onTaskError?: (taskId: string, error: string) => void;
  onWorkflowComplete?: (result: string) => void;
  onWorkflowError?: (error: string) => void;
  onConfirmation?: (request: { id: string; type: string; title: string; message: string }) => void;
  onError?: (error: Error) => void;
}

/**
 * SSE Hook - 实时接收工作流执行事件
 *
 * 支持两种模式：
 * 1. useAgentSSE - 轮询模式（向后兼容）
 * 2. useRealAgentSSE - 真实 SSE 连接（推荐）
 */
export function useAgentSSE(options: UseAgentSSEOptions) {
  const {
    sessionId,
    enabled = true,
    onTaskStart,
    onTaskComplete,
    onTaskError,
    onWorkflowComplete,
    onWorkflowError,
    onConfirmation,
    onError,
  } = options;

  const store = useAgentWorkflowStore();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastStatusRef = useRef<string>('idle');

  // 处理 SSE 事件
  const handleSSEEvent = useCallback(
    (event: SSEEvent) => {
      // 调用 store 处理
      store.handleSSEEvent(event);

      // 调用回调
      switch (event.type) {
        case 'task_start':
          onTaskStart?.(event.taskId, event.agentId);
          break;
        case 'task_complete':
          onTaskComplete?.(event.taskId, event.result);
          break;
        case 'task_error':
          onTaskError?.(event.taskId, event.error);
          break;
        case 'workflow_complete':
          onWorkflowComplete?.(event.result);
          break;
        case 'workflow_error':
          onWorkflowError?.(event.error);
          break;
        case 'confirmation':
          onConfirmation?.(event.request);
          break;
      }
    },
    [store, onTaskStart, onTaskComplete, onTaskError, onWorkflowComplete, onWorkflowError, onConfirmation]
  );

  // 轮询引擎状态（模拟 SSE）
  const pollEngineStatus = useCallback(async () => {
    if (!sessionId || !enabled) return;

    try {
      const response = await agentWorkflowAPI.getEngineStatus(sessionId);

      if (!response.success || !response.data) {
        return;
      }

      const { state } = response.data;
      const currentStatus = state.status;

      // 检测状态变化
      if (currentStatus !== lastStatusRef.current) {
        lastStatusRef.current = currentStatus;

        if (currentStatus === 'completed') {
          handleSSEEvent({
            type: 'workflow_complete',
            result: '任务执行完成',
          });
        } else if (currentStatus === 'error') {
          handleSSEEvent({
            type: 'workflow_error',
            error: (state as { error?: string }).error || '执行出错',
          });
        }
      }

      // 更新进度
      if (state.iteration !== undefined) {
        const execution = store.execution;
        if (execution && execution.status === 'running') {
          // 估算进度（基于迭代次数）
          const estimatedProgress = Math.min((state.iteration / 10) * 100, 95);
          store.updateExecutionProgress(estimatedProgress, state.iteration);
        }
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Polling error'));
    }
  }, [sessionId, enabled, store, handleSSEEvent, onError]);

  // 启动/停止轮询
  useEffect(() => {
    if (!enabled || !sessionId) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // 初始轮询
    pollEngineStatus();

    // 设置轮询间隔
    pollingIntervalRef.current = setInterval(pollEngineStatus, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [sessionId, enabled, pollEngineStatus]);

  // 手动触发事件（用于模拟 SSE 事件）
  const emitEvent = useCallback((event: SSEEvent) => {
    handleSSEEvent(event);
  }, [handleSSEEvent]);

  return {
    emitEvent,
    isConnected: !!sessionId && enabled,
  };
}

// ==================== 真实 SSE 实现（预留） ====================

interface UseRealAgentSSEOptions extends Omit<UseAgentSSEOptions, 'enabled'> {
  url?: string;
}

/**
 * 真实 SSE 连接（需要后端支持 SSE）
 */
export function useRealAgentSSE(options: UseRealAgentSSEOptions) {
  const {
    sessionId,
    url,
    onTaskStart,
    onTaskComplete,
    onTaskError,
    onWorkflowComplete,
    onWorkflowError,
    onConfirmation,
    onError,
  } = options;

  const store = useAgentWorkflowStore();
  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // 使用 ref 存储回调，避免 effect 频繁重连
  const callbacksRef = useRef({
    onTaskStart,
    onTaskComplete,
    onTaskError,
    onWorkflowComplete,
    onWorkflowError,
    onConfirmation,
    onError,
  });
  useEffect(() => {
    callbacksRef.current = {
      onTaskStart,
      onTaskComplete,
      onTaskError,
      onWorkflowComplete,
      onWorkflowError,
      onConfirmation,
      onError,
    };
  });

  useEffect(() => {
    if (!sessionId) return;

    const sseUrl = url || `${BACKEND_URL}/api/multiagent/sse/${sessionId}`;

    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    // 监听各种事件（使用 ref 获取最新回调）
    eventSource.addEventListener('task_start', (e) => {
      const data = JSON.parse(e.data);
      store.handleSSEEvent({ type: 'task_start', taskId: data.taskId, agentId: data.agentId });
      callbacksRef.current.onTaskStart?.(data.taskId, data.agentId);
    });

    eventSource.addEventListener('task_complete', (e) => {
      const data = JSON.parse(e.data);
      store.handleSSEEvent({ type: 'task_complete', taskId: data.taskId, result: data.result });
      callbacksRef.current.onTaskComplete?.(data.taskId, data.result);
    });

    eventSource.addEventListener('task_error', (e) => {
      const data = JSON.parse(e.data);
      store.handleSSEEvent({ type: 'task_error', taskId: data.taskId, error: data.error });
      callbacksRef.current.onTaskError?.(data.taskId, data.error);
    });

    eventSource.addEventListener('workflow_complete', (e) => {
      const data = JSON.parse(e.data);
      store.handleSSEEvent({ type: 'workflow_complete', result: data.result });
      callbacksRef.current.onWorkflowComplete?.(data.result);
    });

    eventSource.addEventListener('workflow_error', (e) => {
      const data = JSON.parse(e.data);
      store.handleSSEEvent({ type: 'workflow_error', error: data.error });
      callbacksRef.current.onWorkflowError?.(data.error);
    });

    eventSource.addEventListener('confirmation', (e) => {
      const data = JSON.parse(e.data);
      store.handleSSEEvent({ type: 'confirmation', request: data });
      callbacksRef.current.onConfirmation?.(data);
    });

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      store.handleSSEEvent({ type: 'progress', progress: data.progress, currentTaskIndex: data.currentTaskIndex });
    });

    eventSource.addEventListener('tool_call', (e) => {
      const data = JSON.parse(e.data);
      store.handleSSEEvent({ type: 'tool_call', call: data });
    });

    eventSource.onerror = (error) => {
      callbacksRef.current.onError?.(new Error('SSE connection error'));
      eventSource.close();
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [sessionId, url, store]);

  return {
    disconnect: () => eventSourceRef.current?.close(),
    isConnected,
  };
}

export default useAgentSSE;
