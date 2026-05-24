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
  const { onMessage, onThinking, onError, onComplete, signal } = options;

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
          if (contentDelta) onMessage(contentDelta);
          if (type === 'chunk' && json.content) {
            onMessage(String(json.content));
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    onComplete?.();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    onError?.(error instanceof Error ? error : new Error('未知错误'));
  }
}