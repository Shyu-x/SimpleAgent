'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '@/lib/config';

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

interface UseAdminSSEOptions<T = unknown> {
  autoConnect?: boolean;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  endpoint?: string;
  parser?: (response: any) => T;
  interval?: number;
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
class AdminSSEClient<T = unknown> {
  private eventSource: EventSource | null = null;
  private options: Required<UseAdminSSEOptions<T>>;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private reconnectAttempts = 0;

  constructor(options: UseAdminSSEOptions<T>) {
    this.options = {
      autoConnect: true,
      reconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      endpoint: '',
      parser: (res: any) => res as T,
      interval: 0,
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
    return `${BACKEND_URL}/api/admin/stream`;
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
 * useAdminSSE - 管理后台 SSE 实时推送 Hook
 *
 * 连接 /api/admin/stream 端点，接收系统状态、Qdrant 状态等实时更新
 *
 * @example
 * const { connected, stats, qdrantStatus, connect, disconnect } = useAdminSSE({
 *   onStatsUpdate: (stats) => setSystemStats(stats),
 *   onQdrantStatusChange: (status) => setQdrantStatus(status),
 * });
 */
export function useAdminSSE<T = unknown>(options: UseAdminSSEOptions = {}): {
  connected: boolean;
  error: string | null;
  data: T | null;
  stats: SystemStats | null;
  qdrantStatus: QdrantStatus | null;
  collections: CollectionInfo[];
  loading: boolean;
  refresh: () => void;
  connect: () => void;
  disconnect: () => void;
} {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [qdrantStatus, setQdrantStatus] = useState<QdrantStatus | null>(null);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);

  const clientRef = useRef<AdminSSEClient | null>(null);

  const optionsRef = useRef(options);
  const autoConnectRef = useRef(options.autoConnect ?? true);

  // 轮询逻辑
  const fetchData = useCallback(async () => {
    if (!options.endpoint) return;
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}${options.endpoint}`);
      if (response.ok) {
        const result = await response.json();
        const parsedData = options.parser ? options.parser(result) : (result as T);
        setData(parsedData as T);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [options.endpoint, options.parser]);

  // 定时刷新
  useEffect(() => {
    if (!options.endpoint) return;
    fetchData();
    const interval = options.interval ? setInterval(fetchData, options.interval) : undefined;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [options.endpoint, options.interval, fetchData]);

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
    data,
    loading,
    stats,
    qdrantStatus,
    collections,
    refresh: fetchData,
    connect,
    disconnect
  };
}

// ==================== 轮询式通用 Hook ====================

interface UseAdminPollingOptions<T> {
  /** API 端点 */
  endpoint: string;
  /** 数据解析函数 */
  parser: (response: any) => T;
  /** 轮询间隔（毫秒），默认 30s */
  interval?: number;
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** 初始加载完成回调 */
  onInitialLoad?: (data: T) => void;
  /** 数据更新回调 */
  onUpdate?: (data: T) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
}

interface UseAdminPollingReturn<T> {
  /** 最新数据 */
  data: T | null;
  /** 是否正在加载（首次） */
  loading: boolean;
  /** 是否连接（轮询中） */
  isConnected: boolean;
  /** 手动刷新 */
  refresh: () => Promise<void>;
  /** 最后更新时间 */
  lastUpdated: Date | null;
  /** 错误信息 */
  error: Error | null;
}

/**
 * useAdminPolling - 轮询式管理后台数据更新 Hook
 *
 * 提供类似 SSE 的实时数据推送体验，底层使用 HTTP 轮询
 * 架构上与真实 SSE 完全兼容，后续可轻松切换到真正的 SSE 连接
 *
 * @example
 * const { data, isConnected, refresh } = useAdminPolling<ModelConfig[]>({
 *   endpoint: '/api/admin/models',
 *   parser: (res) => res.data?.models || [],
 *   interval: 30000,
 * });
 */
export function useAdminPolling<T>(options: UseAdminPollingOptions<T>): UseAdminPollingReturn<T> {
  const {
    endpoint,
    parser,
    interval = 30000,
    enabled = true,
    onInitialLoad,
    onUpdate,
    onError,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFirstLoadRef = useRef(true);
  const previousDataRef = useRef<T | null>(null);

  const loadData = useCallback(async (isInitial = false) => {
    if (!enabled) return;

    try {
      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await response.json();
      const parsedData = parser(json);

      if (isFirstLoadRef.current && previousDataRef.current === parsedData) {
        setLoading(false);
        setIsConnected(true);
        return;
      }

      previousDataRef.current = parsedData;
      setData(parsedData);
      setLastUpdated(new Date());
      setError(null);

      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        setLoading(false);
        setIsConnected(true);
        onInitialLoad?.(parsedData);
      } else {
        onUpdate?.(parsedData);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('未知错误');
      setError(error);
      onError?.(error);
    }
  }, [endpoint, parser, enabled, onInitialLoad, onUpdate, onError]);

  const refresh = useCallback(async () => {
    await loadData(false);
  }, [loadData]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    loadData(true);

    intervalRef.current = setInterval(() => {
      loadData(false);
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, interval, loadData]);

  return {
    data,
    loading,
    isConnected,
    refresh,
    lastUpdated,
    error,
  };
}

export default useAdminSSE;