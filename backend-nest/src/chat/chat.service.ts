import { Injectable, Logger } from '@nestjs/common';
import { ChatMessageDto } from './dto/chat-message.dto';

export interface ChatStreamResult {
  success: boolean;
  requestId?: string;
  model?: string;
  stream?: ReadableStream;
  error?: string;
}

export interface SSEEvent {
  type: 'connected' | 'chunk' | 'thinking' | 'done' | 'error';
  content?: string;
  errorType?: string;
  message?: string;
  requestId?: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  /**
   * 验证聊天请求
   */
  validateChatRequest(body: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!body.messages && !body.message) {
      errors.push('messages 或 message 必须提供其一');
    }

    if (body.messages) {
      if (!Array.isArray(body.messages)) {
        errors.push('messages 必须为数组');
      } else if (body.messages.length === 0) {
        errors.push('messages 不能为空数组');
      } else if (body.messages.length > 100) {
        errors.push('消息数量过多 (最多 100 条)');
      } else {
        body.messages.forEach((msg: any, index: number) => {
          if (!msg.role) {
            errors.push(`第 ${index + 1} 条消息缺少 role 参数`);
          } else if (!['user', 'assistant', 'system'].includes(msg.role)) {
            errors.push(`第 ${index + 1} 条消息 role 无效: ${msg.role}`);
          }
          if (!msg.content) {
            errors.push(`第 ${index + 1} 条消息缺少 content 参数`);
          } else if (typeof msg.content !== 'string') {
            errors.push(`第 ${index + 1} 条消息 content 必须为字符串`);
          } else if (msg.content.length > 100000) {
            errors.push(`第 ${index + 1} 条消息内容过长 (最大 100000 字符)`);
          }
        });
      }
    } else if (body.message && typeof body.message !== 'string') {
      errors.push('message 必须为字符串');
    }

    if (body.temperature !== undefined) {
      if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2) {
        errors.push('temperature 必须在 0-2 之间');
      }
    }

    if (body.max_tokens !== undefined) {
      if (typeof body.max_tokens !== 'number' || body.max_tokens < 1 || body.max_tokens > 100000) {
        errors.push('max_tokens 必须在 1-100000 之间');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 规范化消息格式
   */
  normalizeMessages(body: any): any[] | null {
    if (Array.isArray(body.messages)) {
      return body.messages;
    }

    if (typeof body.message === 'string' && body.message.trim()) {
      return [{ role: 'user', content: body.message.trim() }];
    }

    return null;
  }

  /**
   * 分类错误类型
   */
  classifyError(error: Error): { type: string; message: string } {
    const message = error.message || String(error);

    if (message.includes('API Key') || message.includes('apiKey') || message.includes('401')) {
      return { type: 'authentication_error', message: 'API Key 无效或未配置，请检查设置' };
    }

    if (message.includes('429') || message.includes('rate limit') || message.includes('请求过于频繁')) {
      return { type: 'rate_limit_error', message: '请求过于频繁，请稍后再试' };
    }

    if (message.includes('timeout') || message.includes('Timeout') || message.includes('504')) {
      return { type: 'timeout_error', message: '请求超时，请检查网络或稍后重试' };
    }

    if (message.includes('MiniMax API Error')) {
      if (message.includes('400')) {
        return { type: 'validation_error', message: '请求参数无效，请检查输入内容' };
      }
      if (message.includes('401') || message.includes('403')) {
        return { type: 'authentication_error', message: 'API Key 无效或权限不足' };
      }
      return { type: 'api_error', message: `MiniMax API 错误: ${message}` };
    }

    return { type: 'unknown_error', message: `服务异常: ${message}` };
  }

  /**
   * 停止生成
   */
  stopGeneration(sessionId?: string, requestId?: string): { success: boolean; message: string } {
    this.logger.log(`Stop generation requested - sessionId: ${sessionId}, requestId: ${requestId}`);
    return { success: true, message: 'Generation stopped' };
  }
}
