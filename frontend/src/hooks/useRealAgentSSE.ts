'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { agentWorkflowAPI } from '@/lib/agentWorkflowAPI';
import { retryService } from '@/lib/workflowPersistence';

// ==================== 类型定义 ====================

export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

export interface SSECredentials {
  sessionId: string;
  apiKey?: string;
}

interface SSEOptions {
  url: string;
  credentials?: SSECredentials;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onOpen?: () => void;
  onMessage?: (event: SSEEvent) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  lastEventTime: number | null;
  reconnectAttempts: number;
  error?: string;
}

// ==================== SSE 客户端类 ====================

class SSEClient {
  private eventSource: EventSource | null = null;
  private options: SSEOptions;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(options: SSEOptions) {
    this.options = {
      reconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      ...options,
    };
  }

  connect(): void {
    if (this.destroyed) return;

    const { url, credentials, reconnect, reconnectInterval, maxReconnectAttempts, onOpen, onMessage, onError, onClose } = this.options;

    try {
      // 构建URL
      const urlObj = new URL(url);
      if (credentials?.sessionId) {
        urlObj.searchParams.set('sessionId', credentials.sessionId);
      }

      // 创建 EventSource
      this.eventSource = new EventSource(urlObj.toString(), {
        withCredentials: true,
      });

      // 连接打开
      this.eventSource.onopen = () => {
        console.log('[SSE] 连接已建立');
        onOpen?.();

        // 启动心跳
        this.startHeartbeat();
      };

      // 任务开始
      this.eventSource.addEventListener('task_start', (e) => {
        const data = this.parseEventData(e);
        onMessage?.({ type: 'task_start', ...data });
      });

      // 任务进度
      this.eventSource.addEventListener('task_progress', (e) => {
        const data = this.parseEventData(e);
        onMessage?.({ type: 'task_progress', ...data });
      });

      // 任务完成
      this.eventSource.addEventListener('task_complete', (e) => {
        const data = this.parseEventData(e);
        onMessage?.({ type: 'task_complete', ...data });
      });

      // 任务错误
      this.eventSource.addEventListener('task_error', (e) => {
        const data = this.parseEventData(e);
        onMessage?.({ type: 'task_error', ...data });
      });

      // Agent状态
      this.eventSource.addEventListener('agent_status', (e) => {
        const data = this.parseEventData(e);
        onMessage?.({ type: 'agent_status', ...data });
      });

      // 工具调用
      this.eventSource.addEventListener('tool_call', (e) => {
        const data = this.parseEventData(e);
        onMessage?.({ type: 'tool_call', ...data });
      });

      // 工作流完成
      this.eventSource.addEventListener('workflow_complete', (e) => {
        const data = this.parseEventData(e);
        onMessage?.({ type: 'workflow_complete', ...data });
      });

      // 工作流错误
      this.eventSource.addEventListener('workflow_error', (e) => {
        const data = this.parseEventData(e);
        onMessage?.({ type: 'workflow_error', ...data });
      });

      // 人机确认
      this.eventSource.addEventListener('confirmation', (e) => {
        const data = this.parseEventData(e);
        onMessage?.({ type: 'confirmation', ...data });
      });

      // 进度更新
      this.eventSource.addEventListener('progress', (e) => {
        const data = this.parseEventData(e);
        onMessage?.({ type: 'progress', ...data });
      });

      // 心跳响应
      this.eventSource.addEventListener('heartbeat', (e) => {
        // 心跳响应，忽略数据
      });

      // 错误处理
      this.eventSource.onerror = (e) => {
        console.error('[SSE] 连接错误:', e);
        const error = new Error('SSE连接错误');

        if (reconnect && !this.destroyed) {
          this.scheduleReconnect();
        }

        onError?.(error);
      };

    } catch (error) {
      console.error('[SSE] 创建连接失败:', error);
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private parseEventData(e: MessageEvent): Record<string, unknown> {
    try {
      return JSON.parse(e.data);
    } catch {
      return { data: e.data };
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      // 发送心跳请求
      fetch('/api/health', { method: 'HEAD' }).catch(() => {
        // 忽略心跳错误
      });
    }, 30000); // 30秒心跳
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;

    const { reconnectInterval, maxReconnectAttempts, reconnect } = this.options;
    if (!reconnect) return;

    this.reconnectTimeout = setTimeout(() => {
      this.destroy();
      this.connect();
    }, reconnectInterval);
  }

  disconnect(): void {
    this.destroy();
  }

  private destroy(): void {
    this.destroyed = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

// ==================== Hook ====================

export function useRealAgentSSE(
  sessionId: string | null,
  options: {
    enabled?: boolean;
    reconnect?: boolean;
    onTaskStart?: (taskId: string, agentId: string) => void;
    onTaskProgress?: (taskId: string, progress: number, message?: string) => void;
    onTaskComplete?: (taskId: string, result: string) => void;
    onTaskError?: (taskId: string, error: string) => void;
    onWorkflowComplete?: (result: string) => void;
    onWorkflowError?: (error: string) => void;
    onConfirmation?: (request: { id: string; type: string; title: string; message: string }) => void;
    onError?: (error: Error) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
  } = {}
) {
  const {
    enabled = true,
    reconnect = true,
    onTaskStart,
    onTaskProgress,
    onTaskComplete,
    onTaskError,
    onWorkflowComplete,
    onWorkflowError,
    onConfirmation,
    onError,
    onConnect,
    onDisconnect,
  } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    lastEventTime: null,
    reconnectAttempts: 0,
  });

  const clientRef = useRef<SSEClient | null>(null);
  const sessionIdRef = useRef(sessionId);

  // 更新sessionIdRef
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // 创建连接
  useEffect(() => {
    if (!enabled || !sessionId) {
      // 断开连接
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
        setConnectionState((prev) => ({
          ...prev,
          status: 'disconnected',
        }));
      }
      return;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000';
    const sseUrl = `${backendUrl}/api/multiagent/sse`;

    const client = new SSEClient({
      url: sseUrl,
      credentials: { sessionId },
      reconnect,
      onOpen: () => {
        setConnectionState((prev) => ({
          ...prev,
          status: 'connected',
          reconnectAttempts: 0,
        }));
        onConnect?.();
      },
      onMessage: (event) => {
        setConnectionState((prev) => ({
          ...prev,
          lastEventTime: Date.now(),
        }));

        switch (event.type) {
          case 'task_start':
            onTaskStart?.(event.taskId as string, event.agentId as string);
            break;
          case 'task_progress':
            onTaskProgress?.(
              event.taskId as string,
              event.progress as number,
              event.message as string | undefined
            );
            break;
          case 'task_complete':
            onTaskComplete?.(event.taskId as string, event.result as string);
            break;
          case 'task_error':
            onTaskError?.(event.taskId as string, event.error as string);
            break;
          case 'workflow_complete':
            onWorkflowComplete?.(event.result as string);
            break;
          case 'workflow_error':
            onWorkflowError?.(event.error as string);
            break;
          case 'confirmation':
            onConfirmation?.(event.request as { id: string; type: string; title: string; message: string });
            break;
        }
      },
      onError: (error) => {
        setConnectionState((prev) => ({
          ...prev,
          status: 'error',
          error: error.message,
          reconnectAttempts: prev.reconnectAttempts + 1,
        }));
        onError?.(error);
      },
      onClose: () => {
        setConnectionState((prev) => ({
          ...prev,
          status: 'disconnected',
        }));
        onDisconnect?.();
      },
    });

    clientRef.current = client;
    setConnectionState((prev) => ({ ...prev, status: 'connecting' }));
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [
    enabled,
    sessionId,
    reconnect,
    onTaskStart,
    onTaskProgress,
    onTaskComplete,
    onTaskError,
    onWorkflowComplete,
    onWorkflowError,
    onConfirmation,
    onError,
    onConnect,
    onDisconnect,
  ]);

  // 手动发送确认
  const sendConfirmation = useCallback(
    async (confirmationId: string, approved: boolean = true) => {
      if (!sessionIdRef.current) return;

      return retryService.withRetry(() =>
        agentWorkflowAPI.respondToConfirmation(sessionIdRef.current!, confirmationId, approved)
      );
    },
    []
  );

  // 断开连接
  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setConnectionState((prev) => ({
      ...prev,
      status: 'disconnected',
    }));
  }, []);

  return {
    connectionState,
    sendConfirmation,
    disconnect,
  };
}

// ==================== 多路复用 SSE Hook ====================

interface MultiChannelSSE {
  id: string;
  sessionId: string;
  client: SSEClient;
}

export function useMultiChannelSSE() {
  const channelsRef = useRef<Map<string, MultiChannelSSE>>(new Map());
  const [channels, setChannels] = useState<Array<{ id: string; status: ConnectionState['status'] }>>([]);

  const createChannel = useCallback(
    (id: string, sessionId: string, handlers: SSEOptions) => {
      // 关闭已有通道
      const existing = channelsRef.current.get(id);
      if (existing) {
        existing.client.disconnect();
      }

      // 创建新通道
      const client = new SSEClient({
        ...handlers,
        url: `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000'}/api/multiagent/sse`,
        credentials: { sessionId },
      });

      client.connect();
      channelsRef.current.set(id, { id, sessionId, client });

      setChannels(Array.from(channelsRef.current.entries()).map(([id]) => ({
        id,
        status: 'connected',
      })));

      return () => {
        const channel = channelsRef.current.get(id);
        if (channel) {
          channel.client.disconnect();
          channelsRef.current.delete(id);
        }
        setChannels(Array.from(channelsRef.current.entries()).map(([id]) => ({
          id,
          status: 'disconnected',
        })));
      };
    },
    []
  );

  const closeChannel = useCallback((id: string) => {
    const channel = channelsRef.current.get(id);
    if (channel) {
      channel.client.disconnect();
      channelsRef.current.delete(id);
      setChannels(Array.from(channelsRef.current.entries()).map(([id]) => ({
        id,
        status: 'disconnected',
      })));
    }
  }, []);

  const closeAll = useCallback(() => {
    channelsRef.current.forEach((channel) => {
      channel.client.disconnect();
    });
    channelsRef.current.clear();
    setChannels([]);
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      closeAll();
    };
  }, [closeAll]);

  return {
    channels,
    createChannel,
    closeChannel,
    closeAll,
  };
}
