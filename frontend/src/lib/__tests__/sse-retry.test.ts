/**
 * SSE 指数退避自动重连测试
 * 测试日期: 2026-06-03
 *
 * 覆盖场景:
 *   1. 前 2 次 fetch 失败, 第 3 次成功 -> 应触发 3 次 fetch + 2 次 onReconnectAttempt + onComplete
 *   2. 5 次重试用尽 -> 应触发 6 次 fetch + 5 次 onReconnectAttempt + 1 次 onError
 *   3. AbortError 不重试, 立即静默返回
 *   4. 重试延迟符合 1s/2s 指数退避
 *   5. 中途被 signal.abort 应停止后续重试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function createMockStream(chunks: string[]): ReadableStream {
  let idx = 0;
  return {
    getReader() {
      return {
        read() {
          if (idx >= chunks.length) {
            return Promise.resolve({ done: true, value: undefined });
          }
          const c = chunks[idx++];
          return Promise.resolve({ done: false, value: new TextEncoder().encode(c) });
        },
        releaseLock() {},
        get closed() { return Promise.resolve(); },
        cancel() { return Promise.resolve(); },
      };
    },
  } as unknown as ReadableStream;
}

function createMockResponse(stream: ReadableStream): Response {
  return { ok: true, body: stream, status: 200 } as unknown as Response;
}

describe('SSE 指数退避自动重连', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('前 2 次 fetch 失败, 第 3 次成功: 触发 3 次 fetch + 2 次 onReconnectAttempt + onComplete', async () => {
    const mockFetch = vi.fn();
    // 第 1 次: 网络错误
    mockFetch.mockRejectedValueOnce(new TypeError('NetworkError: fetch failed'));
    // 第 2 次: 网络错误
    mockFetch.mockRejectedValueOnce(new TypeError('NetworkError: fetch failed'));
    // 第 3 次: 成功 (含正常 SSE 流)
    mockFetch.mockResolvedValue(createMockResponse(createMockStream(['data: [DONE]\n'])));

    vi.stubGlobal('fetch', mockFetch);
    const { sendSSEChatMessage } = await import('../sse');

    const onMessage = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onReconnectAttempt = vi.fn();

    // 不 await, 改为手动驱动 fake timers
    const promise = sendSSEChatMessage(
      'key',
      'url',
      'MiniMax-M2.7',
      [{ role: 'user', content: 'hi' }],
      { onMessage, onComplete, onError, onReconnectAttempt }
    );

    // 初始 fetch 立即失败 -> 进入 1s 退避
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 1s 后第 1 次重试, 立即失败 -> 进入 2s 退避
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // 2s 后第 2 次重试, 成功
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    await promise;

    // 应触发 2 次重连尝试通知, 延迟分别为 1s/2s
    expect(onReconnectAttempt).toHaveBeenCalledTimes(2);
    expect(onReconnectAttempt).toHaveBeenNthCalledWith(1, 1, 1000);
    expect(onReconnectAttempt).toHaveBeenNthCalledWith(2, 2, 2000);

    // 成功路径: onComplete 触发, onError 不触发
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('达到最大重试次数 (5) 后调用 onError, 不再重试', async () => {
    // 持续失败
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('NetworkError: fetch failed'));
    vi.stubGlobal('fetch', mockFetch);
    const { sendSSEChatMessage } = await import('../sse');

    const onError = vi.fn();
    const onComplete = vi.fn();
    const onReconnectAttempt = vi.fn();
    const onMessage = vi.fn();

    const promise = sendSSEChatMessage(
      'key',
      'url',
      'MiniMax-M2.7',
      [{ role: 'user', content: 'hi' }],
      { onMessage, onError, onComplete, onReconnectAttempt }
    );

    // 1+2+4+8+16 = 31s, 总计 5 次重试
    // 推进总时间 31s (略大于 31s 以确保所有 timer 触发)
    await vi.advanceTimersByTimeAsync(31000);
    await promise;

    // 1 初始 + 5 重试 = 6 次 fetch
    expect(mockFetch).toHaveBeenCalledTimes(6);
    // 5 次 onReconnectAttempt, 延迟分别为 1/2/4/8/16s
    expect(onReconnectAttempt).toHaveBeenCalledTimes(5);
    expect(onReconnectAttempt).toHaveBeenNthCalledWith(1, 1, 1000);
    expect(onReconnectAttempt).toHaveBeenNthCalledWith(2, 2, 2000);
    expect(onReconnectAttempt).toHaveBeenNthCalledWith(3, 3, 4000);
    expect(onReconnectAttempt).toHaveBeenNthCalledWith(4, 4, 8000);
    expect(onReconnectAttempt).toHaveBeenNthCalledWith(5, 5, 16000);

    // 1 次 onError, 0 次 onComplete
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('AbortError 不重试, 立即静默返回 (不调用 onError)', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    const mockFetch = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal('fetch', mockFetch);
    const { sendSSEChatMessage } = await import('../sse');

    const onError = vi.fn();
    const onReconnectAttempt = vi.fn();
    const onComplete = vi.fn();

    await sendSSEChatMessage(
      'key',
      'url',
      'MiniMax-M2.7',
      [{ role: 'user', content: 'hi' }],
      { onMessage: vi.fn(), onError, onComplete, onReconnectAttempt }
    );

    // 只调用了 1 次 fetch, 没有触发重试
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(onReconnectAttempt).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('成功路径下不应触发 onReconnectAttempt', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockResponse(createMockStream(['data: {"choices":[{"delta":{"content":"ok"}}]}\n', 'data: [DONE]\n']))
    );
    vi.stubGlobal('fetch', mockFetch);
    const { sendSSEChatMessage } = await import('../sse');

    const onMessage = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onReconnectAttempt = vi.fn();

    await sendSSEChatMessage(
      'key',
      'url',
      'MiniMax-M2.7',
      [{ role: 'user', content: 'hi' }],
      { onMessage, onComplete, onError, onReconnectAttempt }
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith('ok');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onReconnectAttempt).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('中途 signal.abort 应停止后续重试, 不调用 onError', async () => {
    const controller = new AbortController();
    const mockFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      }
      return Promise.reject(new TypeError('NetworkError'));
    });
    vi.stubGlobal('fetch', mockFetch);
    const { sendSSEChatMessage } = await import('../sse');

    const onError = vi.fn();
    const onReconnectAttempt = vi.fn();

    const promise = sendSSEChatMessage(
      'key',
      'url',
      'MiniMax-M2.7',
      [{ role: 'user', content: 'hi' }],
      {
        onMessage: vi.fn(),
        onError,
        onReconnectAttempt,
        signal: controller.signal,
      }
    );

    // 初始 fetch 失败
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 用户在第 1 次退避期间中止
    controller.abort();

    // 1s 后: 退避结束, 检测到 signal.aborted, 直接 return, 不再 fetch
    await vi.advanceTimersByTimeAsync(1000);

    await promise;

    // 总共 1 次 fetch (初始), 退避后因 abort 停止后续重试
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // 1 次 onReconnectAttempt (退避前已通知), onError 不调用
    expect(onReconnectAttempt).toHaveBeenCalledTimes(1);
    expect(onReconnectAttempt).toHaveBeenCalledWith(1, 1000);
    expect(onError).not.toHaveBeenCalled();
  });
});
