// types/api.d.ts - API 相关类型扩展

import './api-error';

/**
 * fetchApi 返回结果
 */
export interface ApiResult<T> {
  data: T | null;
  error: ApiError | null;
  status: number;
}

/**
 * SSE 流式回调
 */
export interface StreamCallbacks {
  onChunk: (content: string) => void;
  onThinking?: (thinking: string) => void;
  onDone?: () => void;
  onError?: (error: ApiError) => void;
}

/**
 * 拦截器配置
 */
export interface InterceptorConfig {
  __requestId?: number;
  __latency?: number;
}
