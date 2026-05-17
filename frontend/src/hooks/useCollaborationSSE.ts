'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { API_ENDPOINTS } from '@/lib/apiConfig';

export interface TaskUpdateEvent {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  result?: string;
  timestamp: number;
}

export interface UseCollaborationSSEOptions {
  taskId: string;
  onTaskUpdate?: (data: TaskUpdateEvent) => void;
  onTaskComplete?: (data: TaskUpdateEvent) => void;
  onError?: (error: Event) => void;
  onConnected?: () => void;
}

export interface UseCollaborationSSEReturn {
  connect: () => void;
  disconnect: () => void;
  isConnected: boolean;
  error: Error | null;
}

export function useCollaborationSSE({
  taskId,
  onTaskUpdate,
  onTaskComplete,
  onError,
  onConnected
}: UseCollaborationSSEOptions): UseCollaborationSSEReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `${API_ENDPOINTS.base}/api/a2a/collaboration/${taskId}/subscribe`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      onConnected?.();
    };

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.event === 'connected') {
          // 连接建立
        } else if (parsed.event === 'task_update') {
          onTaskUpdate?.(parsed.data);
        } else if (parsed.event === 'task_complete') {
          onTaskComplete?.(parsed.data);
        }
      } catch (e) {
        console.error('[useCollaborationSSE] Parse error:', e);
      }
    };

    eventSource.onerror = (e) => {
      setIsConnected(false);
      setError(new Error('SSE connection error'));
      onError?.(e);
    };
  }, [taskId, onTaskUpdate, onTaskComplete, onError, onConnected]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return { connect, disconnect, isConnected, error };
}