import { resolveProvider } from './modelConfig';

interface SSEOptions {
  onMessage: (content: string) => void;
  onThinking?: (content: string, isEnd: boolean) => void;  // 思维链回调
  onError?: (error: Error) => void;
  onComplete?: () => void;
  signal?: AbortSignal;  // 取消信号支持
}

// 后端代理地址 - API Key 在后端安全存储
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000';

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

  console.log('[SSE] 发送请求, model:', model, 'messages:', messages.length);

  try {
    // 通过后端代理发送请求，保护 API Key
    // 后端将 proxy 路由挂载在 /api/v1 下
    const requestBody = {
      model,
      messages,
      stream: true,
      // 传递前端配置
      apiKey: apiKey || undefined,
      baseURL: baseURL || undefined,
      // 优先使用 baseURL 推断，其次回退到模型归属
      provider: resolveProvider(baseURL, model),
    };

    console.log('[SSE] 请求体:', JSON.stringify(requestBody).substring(0, 200) + '...');

    const response = await fetch(`${BACKEND_URL}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(requestBody),
      signal,  // 传递取消信号
    });

    console.log('[SSE] fetch response status:', response.status);
    console.log('[SSE] response.ok:', response.ok);
    console.log('[SSE] response.body exists:', !!response.body);

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
    let chunkCount = 0;
    let isComplete = false;  // 防止重复调用 onComplete

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        console.log('[SSE] Stream complete, chunks:', chunkCount);
        // 不在这里调用 onComplete，在循环外统一调用
        break;
      }

      chunkCount++;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          // 标记已完成但不调用 onComplete，在循环结束后统一调用
          isComplete = true;
          continue;
        }

        try {
          const json = JSON.parse(data);
          console.log('[SSE] 解析 JSON:', JSON.stringify(json).substring(0, 200));

          // 处理后端自定义消息类型
          if (json.type === 'error') {
            throw new Error(json.message || '服务器错误');
          }
          if (json.type === 'done') {
            // 标记已完成但不调用 onComplete，在循环结束后统一调用
            isComplete = true;
            continue;
          }

          // 处理思维链独立事件
          if (json.type === 'thinking_delta' && json.content) {
            onThinking?.(json.content, false);
            // 不要 return，继续处理同一批数据中可能存在的 choices
          }

          // 处理思维链事件 (Anthropic 格式，无 _delta 后缀)
          if (json.type === 'thinking' && json.content) {
            onThinking?.(json.content, false);
          }

          // 处理思维链完成事件 - 不要 return，继续处理后续 chunk
          if (json.type === 'thinking_complete') {
            onThinking?.('', true);
            // 继续处理后续事件
          }

          // Anthropic 流式格式: { type: 'chunk', content: '...' }
          if (json.type === 'chunk' && json.content) {
            console.log('[SSE] Anthropic chunk:', {
              contentLength: json.content.length,
              contentPreview: json.content.substring(0, 80),
            });
            // 检测并处理思维链标签（Anthropic 格式）
            if (json.content.includes('<think>') || json.content.includes('[/THINK]')) {
              const thinkingContent = json.content
                .replace(/<\/think>|$/g, '')
                .replace(/\[\/THINK\]/g, '')
                .replace(/<think>/g, '');
              if (thinkingContent) {
                onThinking?.(thinkingContent, json.content.includes('[/THINK]') || json.content.includes(''));
              }
              const cleanContent = json.content.replace(/<think>[\s\S]*?(\[\/THINK\]|<\/think>)/g, '');
              if (cleanContent) {
                onMessage(cleanContent);
              }
            } else {
              onMessage(json.content);
            }
          }

          // OpenAI 格式响应
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            console.log('[SSE] 收到内容块:', {
              contentLength: content.length,
              contentPreview: content.substring(0, 80),
            });
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

    // 处理 buffer 中剩余的不完整数据（可能在 [DONE] 之后到达）
    if (buffer.trim()) {
      const lines = buffer.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          // 处理思维链
          if (json.type === 'thinking_delta' && json.content) {
            onThinking?.(json.content, false);
          }
          // 处理内容块
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            onMessage(content);
          }
          // 处理 chunk 类型
          if (json.type === 'chunk' && json.content) {
            onMessage(json.content);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    // 调用完成回调 - 无论是否收到 done 信号都调用
    onComplete?.();
    isComplete = true;
  } catch (error) {
    // 忽略取消错误
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    onError?.(error instanceof Error ? error : new Error('未知错误'));
  }
}
