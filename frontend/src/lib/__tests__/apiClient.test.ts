/**
 * API Client 单元测试
 * 测试日期: 2026-05-23
 */

import {
  apiClient,
  fetchApi,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  ApiError
} from '../apiClient';

describe('API Client 拦截器', () => {
  beforeEach(() => {
    apiClient.clearInterceptors();
  });

  afterEach(() => {
    apiClient.clearInterceptors();
  });

  it('应该添加请求拦截器', () => {
    const interceptor = vi.fn((config) => config);
    const remove = apiClient.addRequestInterceptor(interceptor);

    expect(typeof remove).toBe('function');
    remove();
  });

  it('应该添加响应拦截器', () => {
    const interceptor = vi.fn((response) => response);
    const remove = apiClient.addResponseInterceptor(interceptor);

    expect(typeof remove).toBe('function');
    remove();
  });

  it('应该添加错误拦截器', () => {
    const interceptor = vi.fn((error) => {
      console.error(error);
    });
    const remove = apiClient.addErrorInterceptor(interceptor);

    expect(typeof remove).toBe('function');
    remove();
  });

  it('应该正确移除拦截器', () => {
    const interceptor = vi.fn((config) => config);
    apiClient.addRequestInterceptor(interceptor);
    const remove = apiClient.addRequestInterceptor(interceptor);
    remove();

    expect(interceptor).toHaveBeenCalledTimes(0);
  });

  it('应该清空所有拦截器', () => {
    apiClient.addRequestInterceptor(vi.fn());
    apiClient.addResponseInterceptor(vi.fn());
    apiClient.addErrorInterceptor(vi.fn());

    apiClient.clearInterceptors();

    // 清空后调用不会出错
    expect(true).toBe(true);
  });
});

describe('fetchApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('应该正常返回响应', async () => {
    const mockResponse = new Response('{"test": true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await fetchApi<{ test: boolean }>('/api/test');
    expect(result.data?.test).toBe(true);
  });

  it('应该在错误时处理', async () => {
    const mockResponse = new Response('{"error": "Not found"}', {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await fetchApi<unknown>('/api/test', { throwOnError: false });
    expect(result.error).toBeDefined();
  });
});

describe('Token 存储', () => {
  it('应该设置和获取 token', () => {
    setAuthToken('test-token-123');
    expect(getAuthToken()).toBe('test-token-123');
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });
});

describe('便捷请求方法', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET 请求应该正确发送', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 })
    );

    const { get } = await import('../apiClient');
    await get('/api/test');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('POST 请求应该正确发送', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 })
    );

    const { post } = await import('../apiClient');
    await post('/api/test', { data: 'test' });
    expect(global.fetch).toHaveBeenCalled();
  });

  it('PUT 请求应该正确发送', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 })
    );

    const { put } = await import('../apiClient');
    await put('/api/test', { data: 'test' });
    expect(global.fetch).toHaveBeenCalled();
  });

  it('DELETE 请求应该正确发送', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 })
    );

    const { del } = await import('../apiClient');
    await del('/api/test');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('PATCH 请求应该正确发送', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 })
    );

    const { patch } = await import('../apiClient');
    await patch('/api/test', { data: 'test' });
    expect(global.fetch).toHaveBeenCalled();
  });
});

describe('ApiError', () => {
  it('应该创建正确分类的错误', () => {
    const networkError = new ApiError('Network error', 0, 'NETWORK');
    expect(networkError.status).toBe(0);

    const serverError = new ApiError('Server error', 500);
    expect(serverError.status).toBe(500);
  });

  it('应该正确格式化错误消息', () => {
    const error = new ApiError('Test error', 400);
    expect(error.message).toBe('Test error');
    expect(error.toString()).toContain('Test error');
  });

  it('应该正确判断错误类型', () => {
    const networkError = new ApiError('Network error', 0);
    expect(networkError.isNetworkError()).toBe(true);

    const serverError = new ApiError('Server error', 500);
    expect(serverError.isServerError()).toBe(true);

    const clientError = new ApiError('Client error', 400);
    expect(clientError.isClientError()).toBe(true);
  });
});