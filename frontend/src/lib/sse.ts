import { resolveProvider } from './modelConfig';
import { BACKEND_URL } from './config';

// 预编译正则表达式，避免高频调用时重复创建
const THINK_CLOSE_REGEX = /<\/think>/g;
const THINK_CLOSE_BRACKET_REGEX = /\[\/THINK\]/g;
const THINK_OPEN_REGEX = /<think>/g;
const THINK_BLOCK_REGEX = /<think>[\s\S]*?(\[\/THINK\]|<\/think>)/g;

// SSE 事件类型定义
interface SSEOptions {
  onMessage: (content: string) => void;
  onThinking?: (content: string, isComplete: boolean) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  signal?: AbortSignal;
  // 指数退避重连回调: attempt 从 1 开始, delayMs 是该次重连前等待的毫秒数
  onReconnectAttempt?: (attempt: number, delayMs: number) => void;
}

// SSE 指数退避重连配置
const MAX_RETRIES = 5;
const MAX_RETRY_DELAY_MS = 30000;
const BASE_RETRY_DELAY_MS = 1000;

/**
 * 计算指数退避延迟, 上限 30s
 * attempt 1 -> 1s, 2 -> 2s, 3 -> 4s, 4 -> 8s, 5 -> 16s, 6+ -> 30s
 */
function calculateBackoffDelay(retryCount: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** retryCount, MAX_RETRY_DELAY_MS);
}

// SSE 消息事件类型
type SSEMessage =
  | { type: 'thinking_delta'; content: string }
  | { type: 'thinking_complete' }
  | { type: 'thinking'; content: string }
  | { type: 'chunk'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' }
  | { choices: [{ delta?: { content?: string } }] };

// 回调接口
interface SSECallbacks {
  onMessage: (content: string) => void;
  onThinking?: (content: string, isComplete: boolean) => void;
}

function extractThinkingContent(content: string): { thinking: string; clean: string } {
  const hasThinkingTags = content.includes('<think>') || content.includes('[/THINK]');
  if (!hasThinkingTags) {
    return { thinking: '', clean: content };
  }

  const thinkingContent = content
    .replace(THINK_CLOSE_REGEX, '')
    .replace(THINK_CLOSE_BRACKET_REGEX, '')
    .replace(THINK_OPEN_REGEX, '');
  const cleanContent = content.replace(THINK_BLOCK_REGEX, '');

  return { thinking: thinkingContent, clean: cleanContent };
}

function parseSSEData(data: string): string | null {
  const trimmed = data.trim();
  if (!trimmed.startsWith('data:')) return null;
  const content = trimmed.slice(5).trim();
  if (content === '[DONE]') return null;
  return content;
}

function processSSEMessage(
  json: Record<string, unknown>,
  callbacks: SSECallbacks
) {
  const type = json.type as string;

  // 处理错误事件
  if (type === 'error') {
    throw new Error(String(json.message || '服务器错误'));
  }
  // 处理完成事件
  if (type === 'done') return;

  // 处理思维链事件
  if (type === 'thinking_delta' && json.content) {
    callbacks.onThinking?.(String(json.content), false);
  }
  if (type === 'thinking' && json.content) {
    callbacks.onThinking?.(String(json.content), false);
  }
  if (type === 'thinking_complete') {
    callbacks.onThinking?.('', true);
  }

  // 处理 chunk 事件
  if (type === 'chunk' && json.content) {
    const content = String(json.content);
    const { thinking, clean } = extractThinkingContent(content);
    if (thinking) callbacks.onThinking?.(thinking, content.includes('[/THINK]'));
    if (clean) callbacks.onMessage(clean);
  }

  // 处理 choices delta content (OpenAI 兼容格式)
  const choices = json.choices as Array<{ delta?: { content?: string } }> | undefined;
  const contentDelta = choices?.[0]?.delta?.content;
  if (contentDelta) {
    const { thinking, clean } = extractThinkingContent(contentDelta);
    if (thinking) callbacks.onThinking?.(thinking, contentDelta.includes('[/THINK]'));
    if (clean) callbacks.onMessage(clean);
  }
}

export async function sendSSEChatMessage(
  apiKey: string,
  baseURL: string,
  model: string,
  messages: { role: string; content: string }[],
  options: SSEOptions
): Promise<void> {
  return _sendSSEChatMessageWithRetry(
    apiKey,
    baseURL,
    model,
    messages,
    options,
    0
  );
}

async function _sendSSEChatMessageWithRetry(
  apiKey: string,
  baseURL: string,
  model: string,
  messages: { role: string; content: string }[],
  options: SSEOptions,
  retryCount: number
): Promise<void> {
  const { onMessage, onThinking, onError, onComplete, signal, onReconnectAttempt } = options;

  try {
    const requestBody = {
      model,
      messages,
      stream: true,
      apiKey: apiKey || undefined,
      baseURL: baseURL || undefined,
      provider: resolveProvider(baseURL, model),
    };

    const response = await fetch(`${BACKEND_URL}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API请求失败: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('响应体为空');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const callbacks = { onMessage, onThinking };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const data = parseSSEData(line);
        if (!data) continue;

        try {
          const json = JSON.parse(data) as Record<string, unknown>;
          processSSEMessage(json, callbacks);
        } catch {
          // Skip invalid JSON
        }
      }
    }

    if (buffer.trim()) {
      const lines = buffer.split('\n');
      for (const line of lines) {
        const data = parseSSEData(line);
        if (!data) continue;

        try {
          const json = JSON.parse(data) as Record<string, unknown>;
          const type = json.type as string;
          if (type === 'thinking_delta' && json.content) {
            onThinking?.(String(json.content), false);
          }
          const choices = json.choices as Array<{ delta?: { content?: string } }> | undefined;
          const contentDelta = choices?.[0]?.delta?.content;
          if (contentDelta) {
            const { thinking, clean } = extractThinkingContent(contentDelta);
            if (thinking) onThinking?.(thinking, contentDelta.includes('[/THINK]'));
            if (clean) onMessage(clean);
          }
          if (type === 'chunk' && json.content) {
            const content = String(json.content);
            const { thinking, clean } = extractThinkingContent(content);
            if (thinking) onThinking?.(thinking, content.includes('[/THINK]'));
            if (clean) onMessage(clean);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    onComplete?.();
  } catch (error) {
    // 用户主动中止: 不重试, 静默返回
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }

    // 指数退避重连: 最多 MAX_RETRIES 次, 间隔 1/2/4/8/16s (上限 30s)
    if (retryCount < MAX_RETRIES) {
      const delay = calculateBackoffDelay(retryCount);

      // 通知上层 UI: 第 N 次重连, 延迟 N ms
      onReconnectAttempt?.(retryCount + 1, delay);

      await new Promise<void>((resolve) => setTimeout(resolve, delay));

      // 中途被中止则停止重试
      if (signal?.aborted) {
        return;
      }

      return _sendSSEChatMessageWithRetry(
        apiKey,
        baseURL,
        model,
        messages,
        options,
        retryCount + 1
      );
    }

    // 达到最大重试次数, 上报错误
    onError?.(error instanceof Error ? error : new Error('未知错误'));
  }
}