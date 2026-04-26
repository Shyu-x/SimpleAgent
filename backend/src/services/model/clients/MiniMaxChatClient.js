/**
 * MiniMax ChatModelClient 实现
 *
 * 实现 ChatModelClient 接口，封装 MiniMax API 调用
 */

const { ChatModelClient, ModelOptions, StreamEventType } = require('../ChatModelClient');

class MiniMaxChatClient extends ChatModelClient {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || process.env.MINIMAX_API_KEY;
    this.baseUrl = options.baseUrl || process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic';
    this.defaultModel = options.defaultModel || 'MiniMax-M2.7';
    this.timeout = options.timeout || ModelOptions.TIMEOUT_DEFAULT;

    // 模型配置
    this.modelConfig = {
      'MiniMax-M2.7': {
        name: 'MiniMax M2.7 旗舰编程',
        capabilities: ['text', 'vision', 'code', 'reasoning'],
        maxTokens: 100000
      },
      'MiniMax-M2.5': {
        name: 'MiniMax M2.5',
        capabilities: ['text', 'code', 'reasoning'],
        maxTokens: 100000
      },
      'MiniMax-VL-01': {
        name: 'MiniMax VL 01 多模态',
        capabilities: ['text', 'vision'],
        maxTokens: 32000
      },
      'MiniMax-Text-01': {
        name: 'MiniMax Text 01',
        capabilities: ['text'],
        maxTokens: 400000
      }
    };
  }

  /**
   * 聊天请求
   */
  async chat(request) {
    const { messages, model, options = {} } = request;
    const modelId = model || this.defaultModel;

    if (!this.apiKey) {
      throw new Error('MINIMAX_API_KEY not configured');
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages: messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : m.role,
          content: m.content
        })),
        max_tokens: options.max_tokens || ModelOptions.MAX_TOKENS_DEFAULT,
        temperature: options.temperature !== undefined ? options.temperature : ModelOptions.TEMPERATURE_DEFAULT,
        stream: false,
        ...(options.reasoning_split && {
          thinking: {
            type: 'enabled',
            budget_tokens: options.thinking_budget || 4000
          }
        })
      }),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MiniMax API Error ${response.status}: ${error}`);
    }

    return await response.json();
  }

  /**
   * 流式聊天
   */
  async chatStream(request, onChunk, onComplete, onError) {
    const { messages, model, options = {} } = request;
    const modelId = model || this.defaultModel;

    if (!this.apiKey) {
      onError?.(new Error('MINIMAX_API_KEY not configured'));
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelId,
          messages: messages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : m.role,
            content: m.content
          })),
          max_tokens: options.max_tokens || ModelOptions.MAX_TOKENS_DEFAULT,
          temperature: options.temperature !== undefined ? options.temperature : ModelOptions.TEMPERATURE_DEFAULT,
          stream: true,
          ...(options.reasoning_split && {
            thinking: {
              type: 'enabled',
              budget_tokens: options.thinking_budget || 4000
            }
          })
        }),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        const error = await response.text();
        onError?.(new Error(`MiniMax API Error ${response.status}: ${error}`));
        return;
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
          if (line.trim() && line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') {
              onComplete?.();
              continue;
            }

            try {
              const data = JSON.parse(dataStr);
              // 文本块
              if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                onChunk?.({
                  type: StreamEventType.TEXT_DELTA,
                  text: data.delta.text
                });
              }
              // 思考块
              else if (data.type === 'content_block_delta' && data.delta?.type === 'thinking_delta') {
                onChunk?.({
                  type: StreamEventType.THINKING_DELTA,
                  thinking: data.delta.thinking || ''
                });
              }
              // 消息停止
              else if (data.type === 'message_stop' || data.event === 'message_stop') {
                onComplete?.();
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error) {
      onError?.(error);
    }
  }

  /**
   * 获取模型信息
   */
  getModelInfo() {
    return {
      provider: 'minimax',
      defaultModel: this.defaultModel,
      models: Object.entries(this.modelConfig).map(([id, config]) => ({
        id,
        ...config
      }))
    };
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.defaultModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1
        }),
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

module.exports = MiniMaxChatClient;
