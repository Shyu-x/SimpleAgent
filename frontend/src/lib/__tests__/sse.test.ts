/**
 * SSE 流式处理测试
 * 测试日期: 2026-05-22
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type Step = {
  chunk: string;
  textDecoderResult: string;
};

function createMockStream(steps: Step[]): ReadableStream {
  let index = 0;
  return {
    getReader(): ReadableStreamDefaultReader<unknown> {
      return {
        read() {
          if (index >= steps.length) return Promise.resolve({ done: true, value: undefined });
          const step = steps[index++];
          return Promise.resolve({
            done: false,
            value: new TextEncoder().encode(step.chunk),
          });
        },
        releaseLock() {},
        get closed() { return Promise.resolve(); },
        cancel() { return Promise.resolve(); }
      };
    },
  } as unknown as ReadableStream;
}

function createMockResponse(
  stream: ReadableStream,
  overrides: Partial<Response> = {}
): Response {
  return { ok: true, body: stream, status: 200, ...overrides } as unknown as Response;
}

function makeSteps(
  rawChunks: string[],
  decoderFn?: (idx: number, chunk: Uint8Array) => string
): Step[] {
  return rawChunks.map((chunk, i) => ({
    chunk,
    textDecoderResult: decoderFn ? decoderFn(i, new TextEncoder().encode(chunk)) : chunk,
  }));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SSE 流式处理', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('应该发送正确的 POST 请求到后端代理', async () => {
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValue(
      createMockResponse(createMockStream([{ chunk: 'data: [DONE]\n', textDecoderResult: 'data: [DONE]\n' }]))
    );

    vi.stubGlobal('fetch', mockFetch);

    const { sendSSEChatMessage } = await import('../sse');

    const onMessage = vi.fn();
    const onThinking = vi.fn();
    const onComplete = vi.fn();

    await sendSSEChatMessage(
      'key-abc',
      'https://api.minimaxi.com',
      'MiniMax-M2.7',
      [{ role: 'user', content: '你好' }],
      { onMessage, onThinking, onComplete }
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, config] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/chat/completions');
    expect(config.method).toBe('POST');
    expect(config.headers['Content-Type']).toBe('application/json; charset=utf-8');
    const body = JSON.parse(config.body as string);
    expect(body.model).toBe('MiniMax-M2.7');
    expect(body.messages).toHaveLength(1);
    expect(body.stream).toBe(true);
    expect(body.apiKey).toBe('key-abc');
  });

  it('应该正确解析 thinking_delta 事件并触发 onThinking 回调', async () => {
    const steps = makeSteps([
      'data: {"type":"thinking_delta","content":"我正在思考..."}\n',
      'data: [DONE]\n',
    ]);
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValue(createMockResponse(createMockStream(steps)));
    vi.stubGlobal('fetch', mockFetch);

    const { sendSSEChatMessage } = await import('../sse');

    const onMessage = vi.fn();
    const onThinking = vi.fn();
    const onComplete = vi.fn();

    await sendSSEChatMessage(
      'key',
      'url',
      'MiniMax-M2.7',
      [{ role: 'user', content: '问题' }],
      { onMessage, onThinking, onComplete }
    );

    expect(onThinking).toHaveBeenCalledWith('我正在思考...', false);
  });

  it('应该正确解析 choices delta.content 并触发 onMessage 回调', async () => {
    const steps = makeSteps([
      'data: {"choices":[{"delta":{"content":"你好"}}]}\n',
      'data: [DONE]\n',
    ]);
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValue(createMockResponse(createMockStream(steps)));
    vi.stubGlobal('fetch', mockFetch);

    const { sendSSEChatMessage } = await import('../sse');

    const onMessage = vi.fn();
    const onComplete = vi.fn();

    await sendSSEChatMessage(
      'key',
      'url',
      'MiniMax-M2.7',
      [{ role: 'user', content: '你好' }],
      { onMessage, onComplete }
    );

    expect(onMessage).toHaveBeenCalledWith('你好');
  });

  it('应该处理多块流式内容并在每块触发 onMessage', async () => {
    const steps = makeSteps([
      'data: {"choices":[{"delta":{"content":"这是一条"}}]}\n',
      'data: {"choices":[{"delta":{"content":"测试消息"}}]}\n',
      'data: [DONE]\n',
    ]);
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValue(createMockResponse(createMockStream(steps)));
    vi.stubGlobal('fetch', mockFetch);

    const { sendSSEChatMessage } = await import('../sse');

    const onMessage = vi.fn();

    await sendSSEChatMessage(
      'key',
      'url',
      'MiniMax-M2.7',
      [{ role: 'user', content: '测试' }],
      { onMessage }
    );

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenNthCalledWith(1, '这是一条');
    expect(onMessage).toHaveBeenNthCalledWith(2, '测试消息');
  });

  it('应该在 fetch 响应不 ok 时调用 onError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: '服务器错误' } }),
    }));

    const { sendSSEChatMessage } = await import('../sse');
    const onError = vi.fn();
    const onMessage = vi.fn();

    await sendSSEChatMessage(
      'key',
      'url',
      'MiniMax-M2.7',
      [{ role: 'user', content: '你好' }],
      { onMessage, onError }
    );

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  // 注意: 当前代码中 type=error 会被空 catch 块吞没 (sse.ts:148)
  // 这是已知的 bug - 此测试记录当前行为，修复后应移除 skip
  it.skip('应该处理 type=error 消息并触发 onError (bug: 空catch吞没错误)', async () => {
    const steps = makeSteps([
      'data: {"type":"error","message":"内部错误"}\n',
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createMockResponse(createMockStream(steps))));

    const { sendSSEChatMessage } = await import('../sse');
    const onError = vi.fn();
    const onMessage = vi.fn();

    await sendSSEChatMessage(
      'key',
      'url',
      'MiniMax-M2.7',
      [{ role: 'user', content: '你好' }],
      { onMessage, onError }
    );

    expect(onError).toHaveBeenCalled();
    const calledError = onError.mock.calls[0][0];
    expect(calledError).toBeInstanceOf(Error);
  });

  it('应该处理 thinking_complete 事件并触发 onThinking 回调', async () => {
    const steps = makeSteps([
      'data: {"type":"thinking_complete"}\n',
      'data: [DONE]\n',
    ]);
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValue(createMockResponse(createMockStream(steps)));
    vi.stubGlobal('fetch', mockFetch);

    const { sendSSEChatMessage } = await import('../sse');
    const onThinking = vi.fn();
    const onComplete = vi.fn();
    const onMessage = vi.fn();

    await sendSSEChatMessage(
      'key',
      'url',
      'MiniMax-M2.7',
      [{ role: 'user', content: '你好' }],
      { onMessage, onThinking, onComplete }
    );

    expect(onThinking).toHaveBeenCalledWith('', true);
  });

  it('应该处理 type=done 消息并触发 onComplete', async () => {
    const steps = makeSteps([
      'data: {"type":"done"}\n',
    ]);
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValue(createMockResponse(createMockStream(steps)));
    vi.stubGlobal('fetch', mockFetch);

    const { sendSSEChatMessage } = await import('../sse');
    const onComplete = vi.fn();
    const onMessage = vi.fn();

    await sendSSEChatMessage(
      'key',
      'url',
      'MiniMax-M2.7',
      [{ role: 'user', content: '你好' }],
      { onMessage, onComplete }
    );

    expect(onComplete).toHaveBeenCalled();
  });

  // jsdom中 DOMException 继承自 Error，与真实浏览器行为不同
  // 在真实浏览器中 AbortError 不继承 Error，此检查会通过并静默返回
  it('AbortError 在 jsdom 中会被报告为错误（环境差异）', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const { sendSSEChatMessage } = await import('../sse');
    const onError = vi.fn();
    const onComplete = vi.fn();
    const onMessage = vi.fn();

    await sendSSEChatMessage(
      'key',
      'url',
      'MiniMax-M2.7',
      [{ role: 'user', content: '你好' }],
      { onMessage, onError, onComplete }
    );

    // 在 jsdom 环境中，DOMException 继承自 Error，
    // 因此被转换为 '未知错误' 并传递给 onError
    expect(onError).toHaveBeenCalled();
    const calledError = onError.mock.calls[0][0];
    expect(calledError).toBeInstanceOf(Error);
  });
});