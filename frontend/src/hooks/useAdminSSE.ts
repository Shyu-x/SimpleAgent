'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { fetchApi } from '@/lib/apiClient';

/**
 * useAdminSSE - 管理后台实时数据更新 Hook
 *
 * 提供类似 SSE 的实时数据推送体验，底层使用 HTTP 轮询
 * 架构上与真实 SSE 完全兼容，后续可轻松切换到真正的 SSE 连接
 *
 * @example
 * const { data, isConnected, refresh } = useAdminSSE<T>({
 *   endpoint: '/api/admin/models',
 *   parser: (res) => res.data?.models || [],
 *   interval: 30000,
 *   enabled: true,
 * });
 */

interface UseAdminSSEOptions<T> {
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

interface UseAdminSSEReturn<T> {
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
 * 管理后台 SSE Hook
 */
export function useAdminSSE<T>(options: UseAdminSSEOptions<T>): UseAdminSSEReturn<T> {
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

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoadRef = useRef(true);
  const previousDataRef = useRef<T | null>(null);

  // 加载数据的核心函数
  const loadData = useCallback(async (isInitial = false) => {
    if (!enabled) return;

    try {
      const response = await fetchApi(endpoint);
      if (response.error) {
        throw new Error(response.error.message || '加载失败');
      }

      const parsedData = parser(response);

      // 跳过首次相同数据（避免重复渲染）
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

  // 手动刷新
  const refresh = useCallback(async () => {
    await loadData(false);
  }, [loadData]);

  // 启动轮询
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    // 初始加载
    loadData(true);

    // 设置定时轮询
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

/**
 * useAdminSSEBatch - 批量管理后台 SSE Hook
 *
 * 用于同时订阅多个数据源
 *
 * @example
 * const results = useAdminSSEBatch({
 *   models: { endpoint: '/api/admin/models', parser: (r) => r.data?.models || [] },
 *   stats: { endpoint: '/api/admin/models/stats', parser: (r) => r.data },
 *   interval: 30000,
 * });
 * // results.models.data, results.stats.data
 */

interface UseAdminSSEBatchOptions {
  [key: string]: {
    endpoint: string;
    parser: (response: any) => any;
    interval?: number;
    enabled?: boolean;
  };
}

interface UseAdminSSEBatchReturn {
  [key: string]: {
    data: any | null;
    loading: boolean;
    isConnected: boolean;
    refresh: () => Promise<void>;
    lastUpdated: Date | null;
    error: Error | null;
  };
}

export function useAdminSSEBatch<T extends UseAdminSSEBatchOptions>(
  options: T
): { [K in keyof T]: UseAdminSSEReturn<T[K]['parser'] extends (r: any) => infer R ? R : never> } {
  const keys = Object.keys(options);
  const results = keys.map((key) => {
    const opt = options[key as keyof T];
    return useAdminSSE({
      endpoint: opt.endpoint,
      parser: opt.parser as any,
      interval: opt.interval,
      enabled: opt.enabled,
    });
  });

  return keys.reduce((acc, key, index) => {
    acc[key as keyof typeof acc] = results[index] as any;
    return acc;
  }, {} as any);
}

export default useAdminSSE;