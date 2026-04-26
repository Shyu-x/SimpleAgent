/**
 * 模型抽象层服务
 * 统一的聊天模型客户端接口，支持多种模型提供商
 */

import { Injectable, Logger } from '@nestjs/common';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onChunk?: (chunk: ChatChunk) => void;
}

export interface ChatChunk {
  done: boolean;
  content: string;
}

export interface ChatResult {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  stopReason?: string;
}

export interface EmbedOptions {
  model?: string;
  provider?: string;
}

export interface ModelHealth {
  available: boolean;
  error?: string;
  latency?: number;
}

// 模型选项常量
export const ModelOptions = {
  TEMPERATURE_DEFAULT: 0.7,
  TEMPERATURE_CREATIVE: 0.9,
  TEMPERATURE_PRECISE: 0.3,
  MAX_TOKENS_DEFAULT: 8192,
  MAX_TOKENS_LONG: 32000,
  MAX_TOKENS_MAX: 100000,
  TIMEOUT_DEFAULT: 120000,
  TIMEOUT_SHORT: 30000,
  TIMEOUT_LONG: 300000
};

// 流式事件类型
export const StreamEventType = {
  TEXT_DELTA: 'text_delta',
  THINKING_DELTA: 'thinking_delta',
  MESSAGE_STOP: 'message_stop',
  ERROR: 'error'
};

@Injectable()
export class ChatModelService {
  private readonly logger = new Logger(ChatModelService.name);
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;

  constructor(options: {
    apiKey?: string;
    baseURL?: string;
    defaultModel?: string;
  } = {}) {
    this.apiKey = options.apiKey || process.env.MINIMAX_API_KEY || '';
    this.baseURL = options.baseURL || process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic';
    this.defaultModel = options.defaultModel || 'MiniMax-M2.7';
  }

  getProviderName(): string {
    return 'minimax';
  }

  /**
   * 发送聊天请求
   */
  async chat(modelId: string, messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const model = modelId || this.defaultModel;
    const url = `${this.baseURL}/v1/messages`;

    const body: Record<string, any> = {
      model,
      messages,
      temperature: options.temperature ?? ModelOptions.TEMPERATURE_DEFAULT,
      max_tokens: options.maxTokens ?? ModelOptions.MAX_TOKENS_DEFAULT
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`MiniMax API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return {
        content: data.choices?.[0]?.message?.content || '',
        usage: data.usage,
        model: data.model,
        stopReason: data.choices?.[0]?.finish_reason
      };
    } catch (error) {
      this.logger.error(`Chat error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 发送流式聊天请求
   */
  async chatStream(modelId: string, messages: ChatMessage[], options: ChatOptions = {}): Promise<void> {
    const model = modelId || this.defaultModel;
    const url = `${this.baseURL}/v1/messages`;

    const body: Record<string, any> = {
      model,
      messages,
      temperature: options.temperature ?? ModelOptions.TEMPERATURE_DEFAULT,
      max_tokens: options.maxTokens ?? ModelOptions.MAX_TOKENS_DEFAULT,
      stream: true
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MiniMax API error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
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
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            if (options.onChunk) {
              options.onChunk({ done: true, content: '' });
            }
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (options.onChunk && content) {
              options.onChunk({ done: false, content });
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }

  /**
   * 生成嵌入
   */
  async embed(texts: string | string[], options: EmbedOptions = {}): Promise<number[][]> {
    const textsArr = Array.isArray(texts) ? texts : [texts];
    // 返回零向量（简化实现）
    return textsArr.map(() => new Array(1024).fill(0));
  }

  /**
   * 检查模型健康状态
   */
  async getStatus(modelId?: string): Promise<ModelHealth> {
    const start = Date.now();
    try {
      await this.chat(modelId || this.defaultModel, [{ role: 'user', content: 'ping' }], { maxTokens: 1 });
      return { available: true, latency: Date.now() - start };
    } catch (error) {
      return { available: false, error: error.message, latency: Date.now() - start };
    }
  }

  /**
   * 设置API密钥
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * 设置基础URL
   */
  setBaseURL(baseURL: string): void {
    this.baseURL = baseURL;
  }

  /**
   * 设置默认模型
   */
  setDefaultModel(model: string): void {
    this.defaultModel = model;
  }
}

/**
 * MiniMax 聊天模型客户端
 */
@Injectable()
export class MiniMaxChatModelClient extends ChatModelService {
  getProviderName(): string {
    return 'minimax';
  }
}
