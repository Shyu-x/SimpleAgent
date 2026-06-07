/**
 * SSE 工具模块
 * 统一管理 SSE 连接逻辑，避免代码重复
 */

import { BACKEND_URL } from './config';

// SSE 客户端接口
export interface SSEClientConfig {
  /** SSE 端点路径 */
  endpoint: string;
  /** 重连间隔（毫秒） */
  reconnectInterval?: number;
  /** 最大重连次数 */
  maxReconnectAttempts?: number;
  /** 连接超时（毫秒） */
  connectionTimeout?: number;
  /** 是否自动重连 */
  autoReconnect?: boolean;
}

// 重连状态
export interface ReconnectState {
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
  connectionTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * 创建重连状态
 */
export function createReconnectState(): ReconnectState {
  return {
    attempts: 0,
    timer: null,
    connectionTimer: null,
  };
}

/**
 * 构建 SSE URL
 */
export function buildSSEUrl(endpoint: string, baseUrl: string = BACKEND_URL): string {
  if (endpoint.startsWith('http')) {
    return endpoint;
  }
  return `${baseUrl}${endpoint}`;
}

/**
 * SSE 事件解析器
 * 将 EventSource 事件解析为统一格式
 */
export function parseSSEResponse(eventType: string, data: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return {
      type: eventType,
      ...parsed,
    };
  } catch {
    return null;
  }
}

/**
 * 连接超时检查
 */
export function checkConnectionTimeout(
  eventSource: EventSource,
  timeout: number,
  onTimeout: () => void
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    if (eventSource.readyState === EventSource.CONNECTING) {
      eventSource.close();
      onTimeout();
    }
  }, timeout);
}

/**
 * 重连调度器
 */
export function scheduleReconnect(
  state: ReconnectState,
  maxAttempts: number,
  interval: number,
  onReconnect: () => void,
  onMaxAttemptsReached: () => void
): void {
  if (state.attempts >= maxAttempts) {
    onMaxAttemptsReached();
    return;
  }

  state.attempts++;
  state.timer = setTimeout(() => {
    onReconnect();
  }, interval);
}

/**
 * 清理 SSE 连接资源
 */
export function cleanupSSEConnection(
  eventSource: EventSource | null,
  reconnectTimer: ReturnType<typeof setTimeout> | null,
  connectionTimer: ReturnType<typeof setTimeout> | null
): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  if (connectionTimer) {
    clearTimeout(connectionTimer);
  }
  if (eventSource) {
    eventSource.close();
  }
}

/**
 * 连接状态枚举
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';