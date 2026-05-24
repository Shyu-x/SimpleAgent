'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { agentWorkflowAPI } from '@/lib/agentWorkflowAPI';
import { retryService } from '@/lib/workflowPersistence';
import { BACKEND_URL } from '@/lib/config';
import {
  AgentSSEClient,
  type AgentSSEEvent,
  type AgentSSEClientOptions,
  type ConnectionState,
} from '@/lib/sse-clients';

// ==================== 类型定义 ====================

export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

export interface SSECredentials {
  sessionId: string;
  apiKey?: string;
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

  const clientRef = useRef<AgentSSEClient | null>(null);
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

    const backendUrl = BACKEND_URL;
    const sseUrl = `${backendUrl}/api/multiagent/sse`;

    const client = new AgentSSEClient({
      sessionId,
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
  client: AgentSSEClient;
}

interface ChannelStatus {
  id: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
}

export function useMultiChannelSSE() {
  const channelsRef = useRef<Map<string, MultiChannelSSE>>(new Map());
  const [channels, setChannels] = useState<ChannelStatus[]>([]);

  const createChannel = useCallback(
    (id: string, sessionId: string, handlers: AgentSSEClientOptions) => {
      // 关闭已有通道
      const existing = channelsRef.current.get(id);
      if (existing) {
        existing.client.disconnect();
      }

      // 创建新通道 - 使用解构避免 sessionId 重复
      const { sessionId: _, ...restHandlers } = handlers;
      const client = new AgentSSEClient({
        ...restHandlers,
        sessionId,
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