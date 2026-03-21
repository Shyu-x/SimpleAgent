'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_ENDPOINTS } from '@/lib/apiConfig';

// ==================== 类型定义 ====================

export type RiskLevel = 'high' | 'medium' | 'low';

export interface OperationImpact {
  scope?: string;
  affectedFiles?: string[];
  affectedSystems?: string[];
  dataChanges?: string;
  sideEffects?: string[];
}

export interface HITLCheckpoint {
  id: string;
  type: string;
  title: string;
  description?: string;
  status: 'pending' | 'approved' | 'rejected' | 'timeout' | 'cancelled';
  createdAt: number;
  respondedAt?: number;
  response?: {
    option?: string;
    comment?: string;
    reason?: string;
  };
  context?: Record<string, unknown>;
  // 新增字段
  riskLevel?: RiskLevel;
  estimatedTime?: string;
  impact?: OperationImpact;
  command?: string;
  warnings?: string[];
  similarOperationKey?: string;
}

export interface HITLSSEEvent {
  type: 'connected' | 'pending_checkpoints' | 'confirmation' | 'error';
  clientId?: string;
  checkpoints?: HITLCheckpoint[];
  subtype?: 'created' | 'approved' | 'rejected' | 'timeout';
  checkpoint?: HITLCheckpoint;
  message?: string;
}

interface UseHITLSSEOptions {
  enabled?: boolean;
  autoConnect?: boolean;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onConfirmation?: (checkpoint: HITLCheckpoint) => void;
  onApproved?: (checkpoint: HITLCheckpoint) => void;
  onRejected?: (checkpoint: HITLCheckpoint) => void;
  onTimeout?: (checkpoint: HITLCheckpoint) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  clientId?: string;
  reconnectAttempts: number;
}

// ==================== SSE 客户端类 ====================

class HITLSSEClient {
  private eventSource: EventSource | null = null;
  private options: UseHITLSSEOptions;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private baseUrl: string;

  constructor(options: UseHITLSSEOptions) {
    this.options = {
      enabled: true,
      autoConnect: true,
      reconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      ...options
    };
    this.baseUrl = this._getBaseUrl();
  }

  private _getBaseUrl(): string {
    if (typeof window === 'undefined') return '';
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000';
    return `${host}/api/hitl/sse`;
  }

  connect(): void {
    if (this.destroyed || !this.options.enabled) return;
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      this.eventSource = new EventSource(this.baseUrl);

      this.eventSource.onopen = () => {
        console.log('[HITL SSE] Connected');
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data: HITLSSEEvent = JSON.parse(event.data);
          this._handleEvent(data);
        } catch (error) {
          console.error('[HITL SSE] Failed to parse message:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('[HITL SSE] Error:', error);
        this.options.onError?.(new Error('SSE connection error'));

        // 尝试重连
        if (!this.destroyed && this.options.autoConnect) {
          this._scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('[HITL SSE] Failed to connect:', error);
      this.options.onError?.(error as Error);
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(() => {
      if (!this.destroyed) {
        console.log('[HITL SSE] Reconnecting...');
        this.connect();
      }
    }, this.options.reconnectInterval || 3000);
  }

  private _handleEvent(data: HITLSSEEvent): void {
    switch (data.type) {
      case 'connected':
        console.log('[HITL SSE] Connection confirmed, clientId:', data.clientId);
        this.options.onConnected?.();
        break;

      case 'pending_checkpoints':
        console.log('[HITL SSE] Pending checkpoints:', data.checkpoints?.length);
        break;

      case 'confirmation':
        if (data.checkpoint) {
          switch (data.subtype) {
            case 'created':
              console.log('[HITL SSE] Confirmation requested:', data.checkpoint.title);
              this.options.onConfirmation?.(data.checkpoint);
              break;
            case 'approved':
              console.log('[HITL SSE] Confirmation approved:', data.checkpoint.id);
              this.options.onApproved?.(data.checkpoint);
              break;
            case 'rejected':
              console.log('[HITL SSE] Confirmation rejected:', data.checkpoint.id);
              this.options.onRejected?.(data.checkpoint);
              break;
            case 'timeout':
              console.log('[HITL SSE] Confirmation timeout:', data.checkpoint.id);
              this.options.onTimeout?.(data.checkpoint);
              break;
          }
        }
        break;
    }
  }

  disconnect(): void {
    this.destroyed = true;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.options.onDisconnected?.();
  }

  isConnected(): boolean {
    return this.eventSource !== null && !this.destroyed;
  }
}

// ==================== Hook ====================

export function useHITLSSE(options: UseHITLSSEOptions = {}) {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    reconnectAttempts: 0
  });
  const [pendingConfirmations, setPendingConfirmations] = useState<HITLCheckpoint[]>([]);
  const clientRef = useRef<HITLSSEClient | null>(null);

  // 初始化 SSE 客户端
  const initClient = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }

    clientRef.current = new HITLSSEClient({
      ...options,
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

      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000';
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
      return false;
    }
  }, []);

  // 清除同类操作的跳过记录
  const clearSkipSimilar = useCallback((operationKey?: string) => {
    try {
      if (operationKey) {
        const skipped = JSON.parse(localStorage.getItem('hitl_skipped_operations') || '{}');
        delete skipped[operationKey];
        localStorage.setItem('hitl_skipped_operations', JSON.stringify(skipped));
      } else {
        localStorage.removeItem('hitl_skipped_operations');
      }
    } catch {
      // Handle silently
    }
  }, []);

  // 自动连接
  useEffect(() => {
    if (options.autoConnect !== false && options.enabled !== false) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [options.autoConnect, options.enabled, connect, disconnect]);

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
