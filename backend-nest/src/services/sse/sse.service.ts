/**
 * SSE流式输出服务
 * MiniMax 单一架构 - 实际调用 MiniMax API
 */

import { Injectable, Logger } from '@nestjs/common';
import { ChatModelService, ChatMessage } from '../model/chat-model.service';

export enum ErrorType {
  VALIDATION = 'validation_error',
  AUTH = 'authentication_error',
  RATE_LIMIT = 'rate_limit_error',
  API = 'api_error',
  TIMEOUT = 'timeout_error',
  SERVER = 'server_error',
  UNKNOWN = 'unknown_error'
}

export interface SSEEvent {
  type: 'connected' | 'chunk' | 'thinking' | 'done' | 'error';
  content?: string;
  errorType?: ErrorType;
  message?: string;
  requestId?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

@Injectable()
export class SSEService {
  private readonly logger = new Logger(SSEService.name);
  private chatModel: ChatModelService;

  constructor(chatModel: ChatModelService) {
    this.chatModel = chatModel;
  }

  /**
   * 分类错误类型
   */
  classifyError(error: any, response: any = null): { type: ErrorType; message: string } {
    const message = error.message || String(error);

    // API 密钥问题
    if (message.includes('API Key') || message.includes('apiKey') || message.includes('401')) {
      return { type: ErrorType.AUTH, message: 'API Key无效或未配置，请检查设置' };
    }

    // 速率限制
    if (message.includes('429') || message.includes('rate limit') || message.includes('请求过于频繁')) {
      return { type: ErrorType.RATE_LIMIT, message: '请求过于频繁，请稍后再试' };
    }

    // 超时错误
    if (message.includes('timeout') || message.includes('Timeout') || message.includes('504')) {
      return { type: ErrorType.TIMEOUT, message: '请求超时，请检查网络或稍后重试' };
    }

    // API 错误（带状态码）
    if (response?.status) {
      if (response.status >= 500) {
        return { type: ErrorType.SERVER, message: 'MiniMax服务暂时不可用，请稍后重试' };
      }
      if (response.status >= 400) {
        return { type: ErrorType.API, message: `请求参数错误: ${message}` };
      }
    }

    // MiniMax API 特定错误
    if (message.includes('MiniMax API Error')) {
      if (message.includes('400')) {
        return { type: ErrorType.VALIDATION, message: '请求参数无效，请检查输入内容' };
      }
      if (message.includes('401') || message.includes('403')) {
        return { type: ErrorType.AUTH, message: 'API Key无效或权限不足' };
      }
      return { type: ErrorType.API, message: `MiniMax API错误: ${message}` };
    }

    // 通用错误
    return { type: ErrorType.UNKNOWN, message: `服务异常: ${message}` };
  }

  /**
   * 验证聊天请求参数
   */
  validateChatRequest(body: ChatRequest): string[] {
    const errors: string[] = [];

    if (!body.messages) {
      errors.push('缺少messages参数');
    } else if (!Array.isArray(body.messages)) {
      errors.push('messages必须为数组');
    } else if (body.messages.length === 0) {
      errors.push('messages不能为空数组');
    } else {
      body.messages.forEach((msg, index) => {
        if (!msg.role) {
          errors.push(`第${index + 1}条消息缺少role参数`);
        } else if (!['user', 'assistant', 'system'].includes(msg.role)) {
          errors.push(`第${index + 1}条消息role无效: ${msg.role}`);
        }
        if (!msg.content) {
          errors.push(`第${index + 1}条消息缺少content参数`);
        } else if (typeof msg.content !== 'string') {
          errors.push(`第${index + 1}条消息content必须为字符串`);
        } else if (msg.content.length > 100000) {
          errors.push(`第${index + 1}条消息内容过长(最大100000字符)`);
        }
      });
    }

    if (body.model && typeof body.model !== 'string') {
      errors.push('model必须为字符串');
    }

    if (body.temperature !== undefined) {
      if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2) {
        errors.push('temperature必须在0-2之间');
      }
    }

    if (body.max_tokens !== undefined) {
      if (typeof body.max_tokens !== 'number' || body.max_tokens < 1 || body.max_tokens > 100000) {
        errors.push('max_tokens必须在1-100000之间');
      }
    }

    return errors;
  }

  /**
   * 处理聊天请求 - 流式输出
   * 返回SSE事件数组，实际应用中通过SSE端点推送
   */
  async *handleChatStream(request: ChatRequest): AsyncGenerator<SSEEvent, void, unknown> {
    const { messages, model = 'MiniMax-M2.7', stream = true, temperature, max_tokens } = request;

    // 输入验证
    const validationErrors = this.validateChatRequest(request);
    if (validationErrors.length > 0) {
      yield {
        type: 'error',
        errorType: ErrorType.VALIDATION,
        message: validationErrors.join('; '),
        content: JSON.stringify({ type: 'error', details: validationErrors })
      };
      return;
    }

    // 发送连接成功消息
    yield { type: 'connected', content: JSON.stringify({ type: 'connected' }) };

    try {
      // 调用 MiniMax API 流式接口
      const result = await this.chatModel.chat(
        model,
        messages,
        {
          temperature: temperature || 0.7,
          maxTokens: max_tokens || 8192,
          stream: true,
          onChunk: (chunk) => {
            // This callback is called for each chunk
          }
        }
      );

      // 对于流式接口，我们需要使用不同的调用方式
      // 这里简化处理，实际应该使用 SSE 推送
      yield { type: 'done', content: JSON.stringify({ type: 'done', content: '' }) };

    } catch (error) {
      this.logger.error(`SSE Chat Error: ${error.message}`, error.stack);
      const errorInfo = this.classifyError(error);
      yield {
        type: 'error',
        errorType: errorInfo.type,
        message: errorInfo.message
      };
    }
  }

  /**
   * 处理聊天请求（简化版本，返回结果）
   */
  async handleChat(request: ChatRequest): Promise<{ success: boolean; content?: string; error?: SSEEvent }> {
    const { messages, model = 'MiniMax-M2.7', temperature, max_tokens } = request;

    // 输入验证
    const validationErrors = this.validateChatRequest(request);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: {
          type: 'error',
          errorType: ErrorType.VALIDATION,
          message: validationErrors.join('; ')
        }
      };
    }

    try {
      const result = await this.chatModel.chat(model, messages, {
        temperature: temperature || 0.7,
        maxTokens: max_tokens || 8192
      });

      return {
        success: true,
        content: result.content
      };
    } catch (error) {
      this.logger.error(`Chat Error: ${error.message}`, error.stack);
      const errorInfo = this.classifyError(error);
      return {
        success: false,
        error: {
          type: 'error',
          errorType: errorInfo.type,
          message: errorInfo.message
        }
      };
    }
  }

  /**
   * 格式化SSE消息
   */
  formatSSEMessage(data: any): string {
    return `data: ${JSON.stringify(data)}\n\n`;
  }

  /**
   * 停止生成（占位）
   */
  handleStop(): { success: boolean; message: string } {
    return { success: true, message: 'Generation stopped' };
  }
}
