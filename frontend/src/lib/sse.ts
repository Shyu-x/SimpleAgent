import { resolveProvider } from './modelConfig';
import { BACKEND_URL } from './config';

interface SSEOptions {
  onMessage: (content: string) => void;
  onThinking?: (content: string, isEnd: boolean) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  signal?: AbortSignal;
}

function extractThinkingContent(content: string): { thinking: string; clean: string } {
  const hasThinkingTags = content.includes('<think>') || content.includes('[/THINK]');
  if (!hasThinkingTags) {
    return { thinking: '', clean: content };
  }

  const thinkingContent = content
    .replace(/<\/think>/g, '')
    .replace(/\[\/THINK\]/g, '')
    .replace(/<think>/g, '');
  const cleanContent = content.replace(/<think>[\s\S]*?(\[\/THINK\]|<\/think>)/g, '');

  return { thinking: thinkingContent, clean: cleanContent };
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);

          if (json.type === 'error') {
            throw new Error(json.message || '服务器错误');
          }
          if (json.type === 'done') continue;

          if (json.type === 'thinking_delta' && json.content) {
            onThinking?.(json.content, false);
          }
          if (json.type === 'thinking' && json.content) {
            onThinking?.(json.content, false);
          }
          if (json.type === 'thinking_complete') {
            onThinking?.('', true);
          }

          if (json.type === 'chunk' && json.content) {
            const { thinking, clean } = extractThinkingContent(json.content);
            if (thinking) onThinking?.(thinking, json.content.includes('[/THINK]'));
            if (clean) onMessage(clean);
          }

          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            const { thinking, clean } = extractThinkingContent(content);
            if (thinking) onThinking?.(thinking, content.includes('[/THINK]'));
            if (clean) onMessage(clean);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    if (buffer.trim()) {
      const lines = buffer.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          if (json.type === 'thinking_delta' && json.content) {
            onThinking?.(json.content, false);
          }
          const content = json.choices?.[0]?.delta?.content;
          if (content) onMessage(content);
          if (json.type === 'chunk' && json.content) {
            onMessage(json.content);
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