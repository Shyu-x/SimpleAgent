'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000';

/**
 * 系统统计数据
 */
export interface SystemStats {
  totalRequests: number;
  successRate: number;
  avgLatency: number;
  activeSessions: number;
  modelCalls: { model: string; count: number }[];
  toolCalls: { tool: string; count: number }[];
  knowledgeBases: { name: string; docCount: number }[];
}

/**
 * Qdrant 状态
 */
export interface QdrantStatus {
  success: boolean;
  healthy: boolean;
  status: string;
  collection: string;
}

/**
 * 集合信息
 */
export interface CollectionInfo {
  name: string;
  vectorsCount: number;
  pointsCount: number;
  status: string;
  indexed: boolean;
}

/**
 * SSE 事件类型
 */
export interface AdminSSEEvent {
  type: 'connected' | 'stats' | 'qdrant_status' | 'qdrant_collections' | 'heartbeat' | 'error';
  clientId?: string;
  data?: SystemStats | QdrantStatus | CollectionInfo[];
  timestamp?: number;
  message?: string;
}

interface UseAdminSSEOptions {
  autoConnect?: boolean;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  onStatsUpdate?: (stats: SystemStats) => void;
  onQdrantStatusChange?: (status: QdrantStatus) => void;
  onCollectionsUpdate?: (collections: CollectionInfo[]) => void;
}

/**
 * Admin SSE 客户端类
 */
class AdminSSEClient {
  private eventSource: EventSource | null = null;
  private options: Required<UseAdminSSEOptions>;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private reconnectAttempts = 0;

  constructor(options: UseAdminSSEOptions) {
    this.options = {
      autoConnect: true,
      reconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      onConnected: () => {},
      onDisconnected: () => {},
      onError: () => {},
      onStatsUpdate: () => {},
      onQdrantStatusChange: () => {},
      onCollectionsUpdate: () => {},
      ...options
    };
  }

  private getBaseUrl(): string {
    return `${API_BASE}/api/admin/stream`;
  }

  connect(): void {
    if (this.destroyed || !this.options.autoConnect) return;
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      this.eventSource = new EventSource(this.getBaseUrl());

      this.eventSource.onopen = () => {
        console.log('[AdminSSE] Connected');
        this.reconnectAttempts = 0;
        this.options.onConnected();
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data: AdminSSEEvent = JSON.parse(event.data);
          this._handleEvent(data);
        } catch (error) {
          console.error('[AdminSSE] Failed to parse message:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('[AdminSSE] Error:', error);
        this.options.onError(new Error('SSE connection error'));

        if (!this.destroyed && this.options.reconnect) {
          this._scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('[AdminSSE] Failed to connect:', error);
      this.options.onError(error as Error);
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.log('[AdminSSE] Max reconnect attempts reached');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    console.log(`[AdminSSE] Reconnecting... (${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      if (!this.destroyed) {
        this.connect();
      }
    }, this.options.reconnectInterval);
  }

  private _handleEvent(data: AdminSSEEvent): void {
    switch (data.type) {
      case 'connected':
        console.log('[AdminSSE] Connection confirmed, clientId:', data.clientId);
        break;

      case 'stats':
        if (data.data) {
          this.options.onStatsUpdate(data.data as SystemStats);
        }
        break;

      case 'qdrant_status':
        if (data.data) {
          this.options.onQdrantStatusChange(data.data as QdrantStatus);
        }
        break;

      case 'qdrant_collections':
        if (data.data) {
          this.options.onCollectionsUpdate(data.data as CollectionInfo[]);
        }
        break;

      case 'heartbeat':
        break;

      case 'error':
        console.error('[AdminSSE] Server error:', data.message);
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
    this.options.onDisconnected();
  }

  isConnected(): boolean {
    return this.eventSource !== null && !this.destroyed;
  }
}

/**
 * useAdminSSE Hook
 * 管理后台 SSE 实时推送钩子
 */
export function useAdminSSE(options: UseAdminSSEOptions = {}) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [qdrantStatus, setQdrantStatus] = useState<QdrantStatus | null>(null);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);

  const clientRef = useRef<AdminSSEClient | null>(null);

  const optionsRef = useRef(options);
  const autoConnectRef = useRef(options.autoConnect ?? true);

  useEffect(() => {
    optionsRef.current = options;
    if (options.autoConnect !== undefined) autoConnectRef.current = options.autoConnect;
  });

  const initClient = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }

    clientRef.current = new AdminSSEClient({
      ...options,
      onConnected: () => {
        setConnected(true);
        setError(null);
        options.onConnected?.();
      },
      onDisconnected: () => {
        setConnected(false);
        options.onDisconnected?.();
      },
      onError: (err) => {
        setError(err.message);
        options.onError?.(err);
      },
      onStatsUpdate: (newStats) => {
        setStats(newStats);
        options.onStatsUpdate?.(newStats);
      },
      onQdrantStatusChange: (newStatus) => {
        setQdrantStatus(newStatus);
        options.onQdrantStatusChange?.(newStatus);
      },
      onCollectionsUpdate: (newCollections) => {
        setCollections(newCollections);
        options.onCollectionsUpdate?.(newCollections);
      }
    });
  }, [options]);

  const connect = useCallback(() => {
    if (!clientRef.current) {
      initClient();
    }
    clientRef.current?.connect();
  }, [initClient]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  useEffect(() => {
    if (autoConnectRef.current) {
      initClient();
      connect();
    }

    return () => {
      clientRef.current?.disconnect();
    };
  }, [initClient, connect]);

  return {
    connected,
    error,
    stats,
    qdrantStatus,
    collections,
    connect,
    disconnect
  };
}

export default useAdminSSE;