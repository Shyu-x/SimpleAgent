import { resolveProvider } from './modelConfig';

interface SSEOptions {
  onMessage: (content: string) => void;
  onThinking?: (content: string, isEnd: boolean) => void;  // 思维链回调
  onError?: (error: Error) => void;
  onComplete?: () => void;
  signal?: AbortSignal;  // 取消信号支持
}

// 后端代理地址 - API Key 在后端安全存储
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

/**
 * 通过后端代理发送 SSE 聊天请求
 * API Key 由后端管理，前端不再直接暴露敏感信息
 */
export async function sendSSEChatMessage(
  apiKey: string,  // 优先使用前端传递的API Key
  baseURL: string, // 优先使用前端传递的Base URL
  model: string,
  messages: { role: string; content: string }[],
  options: SSEOptions
): Promise<void> {
  const { onMessage, onThinking, onError, onComplete, signal } = options;

  try {
    // 通过后端代理发送请求，保护 API Key
    // 后端将 proxy 路由挂载在 /api/v1 下
    const response = await fetch(`${BACKEND_URL}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        // 传递前端配置
        apiKey: apiKey || undefined,
        baseURL: baseURL || undefined,
        // 优先使用 baseURL 推断，其次回退到模型归属
        provider: resolveProvider(baseURL, model),
      }),
      signal,  // 传递取消信号
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

      if (done) {
        onComplete?.();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          onComplete?.();
          return;
        }

        try {
          const json = JSON.parse(data);

          // 处理后端自定义消息类型
          if (json.type === 'error') {
            throw new Error(json.message || '服务器错误');
          }
          if (json.type === 'done') {
            onComplete?.();
            return;
          }

          // 处理思维链独立事件（来自 reasoning_split 的 thinking_delta）
          if (json.type === 'thinking_delta' && json.content) {
            onThinking?.(json.content, false);
            return;
          }

          // 处理思维链完成事件
          if (json.type === 'thinking_complete') {
            onThinking?.('', true);
            return;
          }

          // OpenAI 格式响应
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            // 检测并处理思维链标签
            if (content.includes('<think>') || content.includes('[/THINK]')) {
              // 提取并清理思维链内容
              const thinkingContent = content
                .replace(/<\/think>|$/g, '')  // 移除 </think> 结束标签（兼容性）
                .replace(/\[\/THINK\]/g, '')  // 移除 [/THINK] 结束标签
                .replace(/<think>/g, '');      // 移除开始标签
              if (thinkingContent) {
                onThinking?.(thinkingContent, content.includes('[/THINK]') || content.includes('</think>'));
              }
              // 提取纯回复内容（移除所有思维链标签）
              const cleanContent = content
                .replace(/<think>[\s\S]*?(\[\/THINK\]|<\/think>)/g, '');
              if (cleanContent) {
                onMessage(cleanContent);
              }
            } else {
              onMessage(content);
            }
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } catch (error) {
    // 忽略取消错误
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    onError?.(error instanceof Error ? error : new Error('未知错误'));
  }
}
