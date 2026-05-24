'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isClient } from '@/lib/ssrStorage';
import { BACKEND_URL } from '@/lib/config';
import {
  HITLSSEClient,
  type HITLSSEEvent,
  type HITLCheckpoint,
  type HITLSSEClientOptions,
} from '@/lib/sse-clients';

// Re-export types for backward compatibility
export type { HITLCheckpoint } from '@/lib/sse-clients';

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  clientId?: string;
  reconnectAttempts: number;
}

// ==================== Hook ====================

export function useHITLSSE(options: HITLSSEClientOptions = {}) {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    reconnectAttempts: 0
  });
  const [pendingConfirmations, setPendingConfirmations] = useState<HITLCheckpoint[]>([]);
  const clientRef = useRef<HITLSSEClient | null>(null);

  // 使用 ref 存储选项值，避免对象引用变化导致重复连接
  const optionsRef = useRef(options);
  const autoConnectRef = useRef(options.autoConnect ?? true);
  const enabledRef = useRef(options.enabled ?? true);

  // 更新 ref（仅当值实际变化时）
  useEffect(() => {
    optionsRef.current = options;
    if (options.autoConnect !== undefined) autoConnectRef.current = options.autoConnect;
    if (options.enabled !== undefined) enabledRef.current = options.enabled;
  }, [options]);

  // 初始化 SSE 客户端
  const initClient = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }

    clientRef.current = new HITLSSEClient({
      autoConnect: options.autoConnect,
      reconnect: options.reconnect,
      reconnectInterval: options.reconnectInterval,
      maxReconnectAttempts: options.maxReconnectAttempts,
      onConnected: () => {
        setConnectionState(prev => ({ ...prev, status: 'connected' }));
        options.onConnected?.();
      },
      onDisconnected: () => {
        setConnectionState(prev => ({ ...prev, status: 'disconnected' }));
        options.onDisconnected?.();
      },
      onError: (error) => {
        setConnectionState(prev => ({ ...prev, status: 'error' }));
        options.onError?.(error);
      },
      onConfirmation: (checkpoint) => {
        setPendingConfirmations(prev => {
          // 避免重复添加
          if (prev.some(cp => cp.id === checkpoint.id)) return prev;
          return [...prev, checkpoint];
        });
        options.onConfirmation?.(checkpoint);
      },
      onApproved: (checkpoint) => {
        setPendingConfirmations(prev => prev.filter(cp => cp.id !== checkpoint.id));
        options.onApproved?.(checkpoint);
      },
      onRejected: (checkpoint) => {
        setPendingConfirmations(prev => prev.filter(cp => cp.id !== checkpoint.id));
        options.onRejected?.(checkpoint);
      },
      onTimeout: (checkpoint) => {
        setPendingConfirmations(prev => prev.filter(cp => cp.id !== checkpoint.id));
        options.onTimeout?.(checkpoint);
      }
    });
  }, [options]);

  // 连接
  const connect = useCallback(() => {
    if (!clientRef.current) {
      initClient();
    }
    clientRef.current?.connect();
    setConnectionState(prev => ({ ...prev, status: 'connecting' }));
  }, [initClient]);

  // 断开连接
  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    setConnectionState({ status: 'disconnected', reconnectAttempts: 0 });
  }, []);

  // 响应确认
  const respondToConfirmation = useCallback(async (
    checkpointId: string,
    action: 'approve' | 'reject',
    data?: { option?: string; comment?: string; reason?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const endpoint = action === 'approve'
        ? `/api/hitl/checkpoint/${checkpointId}/approve`
        : `/api/hitl/checkpoint/${checkpointId}/reject`;

      const baseUrl = BACKEND_URL;
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {})
      });

      const result = await response.json();

      if (result.success) {
        setPendingConfirmations(prev => prev.filter(cp => cp.id !== checkpointId));
      }

      return result;
    } catch (error) {
      console.error('[HITL] Failed to respond to confirmation:', error);
      return { success: false, error: (error as Error).message };
    }
  }, []);

  // 批准
  const approve = useCallback((checkpointId: string, option?: string, comment?: string) => {
    return respondToConfirmation(checkpointId, 'approve', { option, comment });
  }, [respondToConfirmation]);

  // 拒绝
  const reject = useCallback((checkpointId: string, reason?: string) => {
    return respondToConfirmation(checkpointId, 'reject', { reason });
  }, [respondToConfirmation]);

  // 清除所有待处理确认
  const clearPending = useCallback(() => {
    setPendingConfirmations([]);
  }, []);

  // 移除单个待处理确认
  const removeConfirmation = useCallback((checkpointId: string) => {
    setPendingConfirmations(prev => prev.filter(cp => cp.id !== checkpointId));
  }, []);

  // 检查是否应跳过同类操作（根据 localStorage 中的记录）
  const shouldSkipSimilar = useCallback((operationKey: string): boolean => {
    if (!isClient()) return false;
    try {
      const skipped = JSON.parse(localStorage.getItem('hitl_skipped_operations') || '{}');
      const timestamp = skipped[operationKey];
      if (!timestamp) return false;
      // 默认 24 小时内不再提示
      const dayMs = 24 * 60 * 60 * 1000;
      if (Date.now() - timestamp > dayMs) {
        // 超过 24 小时，删除记录
        delete skipped[operationKey];
        localStorage.setItem('hitl_skipped_operations', JSON.stringify(skipped));
        return false;
      }
      return true;
    } catch {
      // 忽略 localStorage 错误
      return false;
    }
  }, []);

  // 清除同类操作的跳过记录
  const clearSkipSimilar = useCallback((operationKey?: string) => {
    if (!isClient()) return;
    try {
      if (operationKey) {
        const skipped = JSON.parse(localStorage.getItem('hitl_skipped_operations') || '{}');
        delete skipped[operationKey];
        localStorage.setItem('hitl_skipped_operations', JSON.stringify(skipped));
      } else {
        localStorage.removeItem('hitl_skipped_operations');
      }
    } catch {
      // 忽略 localStorage 错误
    }
  }, []);

  // 自动连接（使用 ref 避免对象引用变化导致重复连接）
  useEffect(() => {
    if (autoConnectRef.current !== false && enabledRef.current !== false) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    // 连接状态
    connectionState,
    isConnected: connectionState.status === 'connected',

    // 待处理确认
    pendingConfirmations,
    hasPendingConfirmations: pendingConfirmations.length > 0,
    currentConfirmation: pendingConfirmations[0] || null,

    // 操作
    connect,
    disconnect,
    approve,
    reject,
    respondToConfirmation,
    clearPending,
    removeConfirmation,

    // 同类操作跳过
    shouldSkipSimilar,
    clearSkipSimilar,
  };
}