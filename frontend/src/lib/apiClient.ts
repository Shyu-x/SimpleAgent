// lib/apiClient.ts - API 客户端（含拦截器、重试、认证）
import { API_ENDPOINTS } from './apiConfig';

const API_BASE_URL = API_ENDPOINTS.base;

// ============ Token 存储键 ============
const TOKEN_KEY = 'auth_token';

// ============ 核心类型导出 ============

/**
 * API 错误代码分类
 */
export type ApiErrorCode =
  | 'NETWORK'      // 网络错误
  | 'TIMEOUT'      // 请求超时
  | 'SERVER'       // 服务器错误 (5xx)
  | 'CLIENT'       // 客户端错误 (4xx)
  | 'UNAUTHORIZED'  // 未授权 (401)
  | 'FORBIDDEN'     // 禁止访问 (403)
  | 'NOT_FOUND'     // 资源不存在 (404)
  | 'UNKNOWN';      // 未知错误

/**
 * API 请求选项
 */
export interface FetchOptions extends RequestInit {
  /** 请求超时毫秒数（默认 30000ms） */
  timeout?: number;
  /** 是否在错误时返回 null（默认 false，抛出异常） */
  throwOnError?: boolean;
  /** 是否解析 JSON 响应（默认 true） */
  parseJson?: boolean;
  /** 是否启用自动重试（默认 true，仅对 5xx 错误重试） */
  retry?: boolean;
  /** 最大重试次数（默认 3） */
  maxRetries?: number;
}

/**
 * API 请求结果
 */
export interface ApiResult<T> {
  data: T | null;
  error: ApiError | null;
  status: number;
}

/**
 * SSE 流式请求回调
 */
export interface StreamCallbacks {
  onChunk: (content: string) => void;
  onThinking?: (thinking: string) => void;
  onDone?: () => void;
  onError?: (error: ApiError) => void;
}

/**
 * SSE 流式请求选项
 */
export interface StreamOptions {
  timeout?: number;
  retry?: boolean;
  maxRetries?: number;
}

// ============ 拦截器类型定义 ============

export interface RequestInterceptor {
  (config: RequestInit & { url: string }): RequestInit | Promise<RequestInit>;
}

export interface ResponseInterceptor {
  (response: Response, data?: unknown): Response | Promise<Response>;
}

export interface ErrorInterceptor {
  (error: ApiError, config?: RequestInit & { url: string }): void;
}

// 全局拦截器注册表
const requestInterceptors: RequestInterceptor[] = [];
const responseInterceptors: ResponseInterceptor[] = [];
const errorInterceptors: ErrorInterceptor[] = [];

// ============ 拦截器注册 API ============

export const apiClient = {
  /**
   * 添加请求拦截器
   * 用途：自动添加认证头、日志记录、请求改写
   */
  addRequestInterceptor: (interceptor: RequestInterceptor): (() => void) => {
    requestInterceptors.push(interceptor);
    return () => {
      const index = requestInterceptors.indexOf(interceptor);
      if (index > -1) requestInterceptors.splice(index, 1);
    };
  },

  /**
   * 添加响应拦截器
   * 用途：统一错误处理、响应转换、日志记录
   */
  addResponseInterceptor: (interceptor: ResponseInterceptor): (() => void) => {
    responseInterceptors.push(interceptor);
    return () => {
      const index = responseInterceptors.indexOf(interceptor);
      if (index > -1) responseInterceptors.splice(index, 1);
    };
  },

  /**
   * 添加错误拦截器
   * 用途：错误上报、错误分类处理
   */
  addErrorInterceptor: (interceptor: ErrorInterceptor): (() => void) => {
    errorInterceptors.push(interceptor);
    return () => {
      const index = errorInterceptors.indexOf(interceptor);
      if (index > -1) errorInterceptors.splice(index, 1);
    };
  },

  /**
   * 移除所有拦截器（测试用）
   */
  clearInterceptors: () => {
    requestInterceptors.length = 0;
    responseInterceptors.length = 0;
    errorInterceptors.length = 0;
  },
};

// ============ 内置拦截器 ============

// 请求计时拦截器
let requestId = 0;
apiClient.addRequestInterceptor((config) => {
  const id = ++requestId;
  console.debug(`[API] ➡️  ${config.method || 'GET'} ${config.url} [id=${id}]`);
  // @ts-expect-error - Adding custom property to track request ID
  config.__requestId = id;
  return config;
});

// 响应计时拦截器
apiClient.addResponseInterceptor((response, data) => {
  // @ts-expect-error - Custom property added by request interceptor
  const id = response.__requestId as number;
  // @ts-expect-error - Custom property added in fetchApi
  const latency = response.__latency as number;
  console.debug(`[API] ⬅️  ${response.url} [id=${id}] status=${response.status} latency=${latency}ms`);
  return response;
});

// 错误日志拦截器
apiClient.addErrorInterceptor((error) => {
  console.error(`[API] ❌ ${error.url} - ${error.message}`, {
    status: error.status,
    code: error.code,
  });
});

// Bearer Token 认证拦截器
apiClient.addRequestInterceptor((config) => {
  // SSR 保护：sessionStorage 在服务端不可用
  const token = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;
  if (token) {
    const headers = new Headers(config.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return { ...config, headers };
  }
  return config;
});

// ============ API 错误类 ============

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public url?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromResponse(response: Response, data?: { error?: { message?: string; code?: string } }): ApiError {
    const message = data?.error?.message || `HTTP ${response.status}`;
    const code = data?.error?.code;
    return new ApiError(message, response.status, code, response.url);
  }

  /** 判断是否为网络错误（status === 0） */
  isNetworkError(): boolean {
    return this.status === 0 || !this.status;
  }

  /** 判断是否为超时错误 */
  isTimeout(): boolean {
    return this.code === 'TIMEOUT' || this.message.includes('timeout');
  }

  /** 判断是否为服务器错误 (5xx) */
  isServerError(): boolean {
    return this.status >= 500 && this.status < 600;
  }

  /** 判断是否为客户端错误 (4xx) */
  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /** 判断是否为未授权错误 (401) */
  isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** 判断是否为禁止访问错误 (403) */
  isForbidden(): boolean {
    return this.status === 403;
  }

  /** 判断是否为资源不存在错误 (404) */
  isNotFound(): boolean {
    return this.status === 404;
  }

  /** 获取错误类型分类 */
  getErrorType(): ApiErrorCode {
    if (this.isNetworkError()) return 'NETWORK';
    if (this.isTimeout()) return 'TIMEOUT';
    if (this.isUnauthorized()) return 'UNAUTHORIZED';
    if (this.isForbidden()) return 'FORBIDDEN';
    if (this.isNotFound()) return 'NOT_FOUND';
    if (this.isServerError()) return 'SERVER';
    if (this.isClientError()) return 'CLIENT';
    return 'UNKNOWN';
  }
}

// ============ 重试配置 ============

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 基础延迟 1s

/**
 * 计算指数退避延迟
 * @param attempt 当前尝试次数（从 1 开始）
 * @param baseDelay 基础延迟毫秒数
 * @returns 延迟毫秒数
 */
function calculateBackoffDelay(attempt: number, baseDelay: number = DEFAULT_RETRY_DELAY): number {
  // 指数退避: 1s, 2s, 4s, 8s...
  return baseDelay * Math.pow(2, attempt - 1);
}

// ============ 拦截器处理 ============

async function processRequestInterceptors(config: RequestInit & { url: string }): Promise<RequestInit> {
  let result = { ...config };
  for (const interceptor of requestInterceptors) {
    result = (await interceptor(result)) as RequestInit & { url: string };
  }
  return result;
}

async function processResponseInterceptors(response: Response, data: unknown): Promise<Response> {
  let result = response;
  for (const interceptor of responseInterceptors) {
    result = (await interceptor(result, data)) as Response;
  }
  return result;
}

function processErrorInterceptors(error: ApiError): void {
  for (const interceptor of errorInterceptors) {
    try {
      interceptor(error);
    } catch (interceptorError) {
      console.error('[ApiClient] Error interceptor threw:', interceptorError);
    }
  }
}

// ============ 核心请求函数 ============

/**
 * 核心 fetch 封装函数
 *
 * 功能：
 * - 自动 JSON 序列化/反序列化
 * - Bearer Token 认证（自动从 sessionStorage 获取）
 * - 请求/响应/错误拦截器支持
 * - 超时控制
 * - 自动重试（5xx 错误，指数退避）
 * - 统一错误处理
 * - 计时日志
 */
export async function fetchApi<T = unknown>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<ApiResult<T>> {
  const {
    timeout = 30000,
    throwOnError = false,
    parseJson = true,
    retry = true,
    maxRetries = DEFAULT_MAX_RETRIES,
    ...fetchOptions
  } = options;

  const url = `${API_BASE_URL}${endpoint}`;
  const startTime = Date.now();

  // 构建最终配置
  let config: RequestInit = {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  };

  // 应用请求拦截器
  config = await processRequestInterceptors({ ...config, url }) as RequestInit;

  let controller: AbortController | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // 超时控制
  if (timeout > 0) {
    controller = new AbortController();
    config.signal = controller.signal;
    timeoutId = setTimeout(() => {
      controller?.abort();
    }, timeout);
  }

  let lastError: ApiError | null = null;

  // 重试循环
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    // 重试时使用新的 AbortController
    if (attempt > 1 && controller) {
      controller = new AbortController();
      config.signal = controller.signal;
    }

    try {
      const response = await fetch(url, config);

      // 记录延迟
      const latency = Date.now() - startTime;
      // @ts-expect-error - Custom property for tracking latency
      response.__latency = latency;

      if (timeoutId) clearTimeout(timeoutId);

      let data: unknown = undefined;
      if (parseJson && response.status !== 204) {
        try {
          data = await response.json();
        } catch {
          data = await response.text();
        }
      }

      // 应用响应拦截器
      await processResponseInterceptors(response, data);

      // 检查是否需要重试（5xx 错误且启用了重试）
      if (!response.ok && response.status >= 500 && retry && attempt <= maxRetries) {
        const retryDelay = calculateBackoffDelay(attempt);
        console.warn(`[API] ⏳ 服务器错误 ${response.status}，${retryDelay}ms 后重试 (${attempt}/${maxRetries})`);
        await sleep(retryDelay);
        continue;
      }

      if (!response.ok) {
        const error = ApiError.fromResponse(
          response,
          typeof data === 'object' ? (data as { error?: { message?: string; code?: string } }) : undefined
        );
        error.url = url;

        processErrorInterceptors(error);

        if (throwOnError) throw error;

        return { data: null, error, status: response.status };
      }

      return { data: data as T, error: null, status: response.status };
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);

      let apiError: ApiError;

      if (err instanceof ApiError) {
        apiError = err;
      } else if (err instanceof Error) {
        if (err.name === 'AbortError') {
          apiError = new ApiError('请求超时', 0, 'TIMEOUT', url);
        } else {
          apiError = new ApiError(err.message, 0, 'NETWORK', url);
        }
      } else {
        apiError = new ApiError('未知错误', 0, 'UNKNOWN', url);
      }

      lastError = apiError;

      // 网络错误或超时且启用了重试
      const shouldRetry = (apiError.isNetworkError() || apiError.isTimeout()) && retry && attempt <= maxRetries;

      if (shouldRetry) {
        const retryDelay = calculateBackoffDelay(attempt);
        console.warn(`[API] ⏳ ${apiError.isTimeout() ? '超时' : '网络错误'}，${retryDelay}ms 后重试 (${attempt}/${maxRetries})`);
        await sleep(retryDelay);
      } else {
        break;
      }
    }
  }

  // 所有重试都失败
  processErrorInterceptors(lastError!);

  if (throwOnError) throw lastError;

  return { data: null, error: lastError, status: lastError?.status || 0 };
}

// ============ SSE 流式请求 ============

/**
 * SSE 流式请求
 *
 * 支持：
 * - Bearer Token 认证（自动从 sessionStorage 获取）
 * - 流式数据解析（data: {...} 格式）
 * - thinking 内容提取（MiniMax 思维链）
 * - 自动超时控制
 * - 5xx 错误自动重试
 */
export async function fetchStream(
  endpoint: string,
  body: Record<string, unknown>,
  callbacks: StreamCallbacks,
  options: StreamOptions = {}
): Promise<void> {
  const { timeout = 60000, retry = true, maxRetries = DEFAULT_MAX_RETRIES } = options;

  let controller: AbortController | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // 获取 token（用于重试时重新创建请求）
  // SSR 保护：sessionStorage 在服务端不可用
  const token = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const doFetch = async (): Promise<Response> => {
    controller = new AbortController();
    timeoutId = setTimeout(() => controller?.abort(), timeout);

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId ?? undefined);
    return response;
  };

  // 重试循环
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const response = await doFetch();

      if (!response.ok) {
        // 5xx 错误且启用重试
        if (response.status >= 500 && retry && attempt <= maxRetries) {
          const retryDelay = calculateBackoffDelay(attempt);
          console.warn(`[API] ⏳ SSE 服务器错误 ${response.status}，${retryDelay}ms 后重试 (${attempt}/${maxRetries})`);
          await sleep(retryDelay);
          continue;
        }

        const data = await response.json().catch(() => ({}));
        const error = ApiError.fromResponse(
          response,
          typeof data === 'object' ? (data as { error?: { message?: string; code?: string } }) : undefined
        );
        callbacks.onError?.(error);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError?.(new ApiError('无法读取响应流', 0, 'STREAM', endpoint));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            // [DONE] 表示流结束，先处理 buffer 中剩余的不完整数据
            const lastLine = buffer.trim();
            if (lastLine && lastLine.startsWith('data: ')) {
              const lastData = lastLine.slice(6);
              if (lastData !== '[DONE]') {
                try {
                  const parsed = JSON.parse(lastData) as Record<string, unknown>;
                  const type = parsed.type as string;
                  const content = parsed.content as string;

                  if (type === 'thinking' && content) {
                    callbacks.onThinking?.(content);
                  } else if ((type === 'chunk' || type === 'content') && content) {
                    callbacks.onChunk(content);
                  } else if (parsed.thinking && typeof parsed.thinking === 'string') {
                    callbacks.onThinking?.(parsed.thinking as string);
                  } else if (parsed.content && typeof parsed.content === 'string' && !type) {
                    callbacks.onChunk(parsed.content as string);
                  }
                } catch {
                  // 忽略解析错误
                }
              }
            }
            callbacks.onDone?.();
            return;
          }

          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;

            // 后端 SSE 格式: { type: 'chunk', content: 'xxx' } 或 { type: 'thinking', content: 'xxx' }
            const type = parsed.type as string;
            const content = parsed.content as string;

            if (type === 'thinking' && content) {
              callbacks.onThinking?.(content);
            } else if ((type === 'chunk' || type === 'content') && content) {
              callbacks.onChunk(content);
            }

            // 兼容旧格式: { content: 'xxx' } 或 { thinking: 'xxx' }
            if (parsed.thinking && typeof parsed.thinking === 'string') {
              callbacks.onThinking?.(parsed.thinking as string);
            }
            if (parsed.content && typeof parsed.content === 'string' && !type) {
              callbacks.onChunk(parsed.content as string);
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      callbacks.onDone?.();
      return;
    } catch (err) {
      // 处理中止/超时
      if (err instanceof Error && err.name === 'AbortError') {
        // 检查是否是超时
        const isTimeout = timeoutId !== null;
        if (isTimeout && retry && attempt <= maxRetries) {
          const retryDelay = calculateBackoffDelay(attempt);
          console.warn(`[API] ⏳ SSE 超时，${retryDelay}ms 后重试 (${attempt}/${maxRetries})`);
          await sleep(retryDelay);
          continue;
        }

        const error = new ApiError('请求超时', 0, 'TIMEOUT', endpoint);
        callbacks.onError?.(error);
        return;
      }

      // 网络错误且启用重试
      if (retry && attempt <= maxRetries) {
        const retryDelay = calculateBackoffDelay(attempt);
        console.warn(`[API] ⏳ SSE 网络错误，${retryDelay}ms 后重试 (${attempt}/${maxRetries})`);
        await sleep(retryDelay);
        continue;
      }

      const error = err instanceof Error
        ? new ApiError(err.message, 0, 'NETWORK', endpoint)
        : new ApiError('未知错误', 0, 'UNKNOWN', endpoint);
      callbacks.onError?.(error);
      return;
    }
  }
}

// ============ 辅助函数 ============

/**
 * 休眠指定毫秒数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Token 管理 ============

/**
 * 设置认证 Token
 */
export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
}

/**
 * 获取当前认证 Token
 */
export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem(TOKEN_KEY);
  }
  return null;
}

/**
 * 清除认证 Token
 */
export function clearAuthToken(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

// ============ 便捷请求方法 ============

/**
 * GET 请求
 */
export async function get<T = unknown>(
  endpoint: string,
  options?: Omit<FetchOptions, 'method'>
): Promise<ApiResult<T>> {
  return fetchApi<T>(endpoint, { ...options, method: 'GET' });
}

/**
 * POST 请求
 */
export async function post<T = unknown>(
  endpoint: string,
  data?: Record<string, unknown>,
  options?: Omit<FetchOptions, 'method' | 'body'>
): Promise<ApiResult<T>> {
  return fetchApi<T>(endpoint, {
    ...options,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * PUT 请求
 */
export async function put<T = unknown>(
  endpoint: string,
  data?: Record<string, unknown>,
  options?: Omit<FetchOptions, 'method' | 'body'>
): Promise<ApiResult<T>> {
  return fetchApi<T>(endpoint, {
    ...options,
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * DELETE 请求
 */
export async function del<T = unknown>(
  endpoint: string,
  options?: Omit<FetchOptions, 'method'>
): Promise<ApiResult<T>> {
  return fetchApi<T>(endpoint, { ...options, method: 'DELETE' });
}

/**
 * PATCH 请求
 */
export async function patch<T = unknown>(
  endpoint: string,
  data?: Record<string, unknown>,
  options?: Omit<FetchOptions, 'method' | 'body'>
): Promise<ApiResult<T>> {
  return fetchApi<T>(endpoint, {
    ...options,
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  });
}

// ============ 导出 API 配置（方便外部使用） ============
export { API_ENDPOINTS };
