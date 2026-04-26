import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  HttpStatus,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { ChatMessageDto, StopGenerationDto } from './dto/chat-message.dto';
import { MiniMaxRouter } from '../common/router/minimax-router';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);
  private readonly miniMaxRouter: MiniMaxRouter;

  constructor(private readonly chatService: ChatService) {
    this.miniMaxRouter = new MiniMaxRouter({
      defaultModel: 'MiniMax-M2.7',
      enableFirstChunkProbe: true,
      enableMultiModelFallback: true,
    });
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'SSE 流式聊天接口', description: 'OpenAI 兼容格式的聊天接口，支持 SSE 流式响应' })
  @ApiResponse({ status: 200, description: 'SSE 流式响应' })
  @ApiResponse({ status: 400, description: '参数错误' })
  @ApiResponse({ status: 500, description: '服务器错误' })
  async sendMessage(@Body() chatMessageDto: ChatMessageDto, @Res() res: Response) {
    const { messages, message, model, stream, temperature, max_tokens, reasoning_split, thinking_budget } = chatMessageDto;

    // 规范化消息
    const normalizedMessages = this.chatService.normalizeMessages({ messages, message });

    // 验证请求
    if (!normalizedMessages) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: {
          message: 'messages is required and must be an array, or message must be a non-empty string',
          type: 'invalid_request_error',
        },
      });
    }

    // 消息数量限制
    if (normalizedMessages.length > 100) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: {
          message: 'Too many messages (max 100)',
          type: 'invalid_request_error',
        },
      });
    }

    // 如果 stream 不为 false，使用 SSE 流式响应
    if (stream !== false) {
      return this.handleSSEStream(res, {
        messages: normalizedMessages,
        model: model || 'MiniMax-M2.7',
        stream: true,
        temperature: temperature || 0.7,
        max_tokens: max_tokens || 8192,
        reasoning_split,
        thinking_budget,
      });
    }

    // 非流式响应
    return this.handleNonStream(res, {
      messages: normalizedMessages,
      model: model || 'MiniMax-M2.7',
      stream: false,
      temperature: temperature || 0.7,
      max_tokens: max_tokens || 8192,
      reasoning_split,
      thinking_budget,
    });
  }

  /**
   * 处理 SSE 流式响应
   */
  private async handleSSEStream(res: Response, request: any) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 设置 SSE 响应头
    res.writeHead(HttpStatus.OK, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // 发送连接成功消息
    res.write(`data: ${JSON.stringify({ type: 'connected', requestId })}\n\n`);

    try {
      // 调用 MiniMax API
      const result = await this.miniMaxRouter.execute({
        messages: request.messages,
        model: request.model,
        stream: true,
        options: {
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          reasoning_split: request.reasoning_split,
          thinking_budget: request.thinking_budget,
        },
      });

      if (!result.success) {
        const errorInfo = this.chatService.classifyError(new Error(result.error));
        res.write(`data: ${JSON.stringify({
          type: 'error',
          errorType: errorInfo.type,
          message: errorInfo.message,
          requestId: result.requestId,
        })}\n\n`);
        res.end();
        return;
      }

      // 获取流式响应
      const responseStream = result.result;

      if (!responseStream || typeof responseStream.getReader !== 'function') {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          errorType: 'server_error',
          message: '服务内部错误：无效的响应流',
        })}\n\n`);
        res.end();
        return;
      }

      // 读取流并发送到客户端
      const reader = responseStream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            res.write(`data: ${JSON.stringify({ type: 'done', content: '' })}\n\n`);
            break;
          }

          // 解码数据
          buffer += decoder.decode(value, { stream: true });

          // 按行处理
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') {
                    res.write(`data: ${JSON.stringify({ type: 'done', content: '' })}\n\n`);
                  } else {
                    // 尝试解析 JSON
                    try {
                      const jsonData = JSON.parse(data);
                      // 转换格式
                      if (jsonData.type === 'content_block_delta') {
                        if (jsonData.delta?.type === 'text_delta') {
                          res.write(`data: ${JSON.stringify({ type: 'chunk', content: jsonData.delta.text })}\n\n`);
                        } else if (jsonData.delta?.type === 'thinking_delta') {
                          res.write(`data: ${JSON.stringify({ type: 'thinking', content: jsonData.delta.thinking })}\n\n`);
                        }
                      } else if (jsonData.type === 'message_stop') {
                        res.write(`data: ${JSON.stringify({ type: 'done', content: '' })}\n\n`);
                      } else {
                        res.write(`data: ${data}\n\n`);
                      }
                    } catch {
                      // 非 JSON，直接发送
                      res.write(`data: ${JSON.stringify({ type: 'chunk', content: line })}\n\n`);
                    }
                  }
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      this.logger.error('SSE Chat Error:', error);
      const errorInfo = this.chatService.classifyError(error as Error);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        errorType: errorInfo.type,
        message: errorInfo.message,
        requestId,
      })}\n\n`);
    }

    res.end();
  }

  /**
   * 处理非流式响应
   */
  private async handleNonStream(res: Response, request: any) {
    try {
      const result = await this.miniMaxRouter.execute(request);

      if (!result.success) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: {
            message: result.error || 'Internal server error',
            type: 'server_error',
          },
        });
      }

      // 非流式响应直接返回 JSON
      const responseData = await this.parseNonStreamResponse(result.result);
      return res.status(HttpStatus.OK).json(responseData);
    } catch (error) {
      this.logger.error('Non-stream Chat Error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: {
          message: (error as Error).message || 'Internal server error',
          type: 'server_error',
        },
      });
    }
  }

  /**
   * 解析非流式响应
   */
  private async parseNonStreamResponse(result: any): Promise<any> {
    if (result && typeof result === 'object') {
      // 如果是已经解析的 JSON 对象
      if (result.content && Array.isArray(result.content)) {
        return {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'MiniMax-M2.7',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: result.content.map((c: any) => c.text || c.content || '').join(''),
            },
            finish_reason: 'stop',
          }],
        };
      }
      return result;
    }
    return result;
  }

  @Post('stop')
  @ApiOperation({ summary: '停止生成', description: '停止当前正在进行的生成任务' })
  @ApiResponse({ status: 200, description: '成功停止' })
  stopGeneration(@Body() stopDto: StopGenerationDto, @Res() res: Response) {
    const result = this.chatService.stopGeneration(stopDto.sessionId, stopDto.requestId);
    return res.status(HttpStatus.OK).json(result);
  }

  @Post('completions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'OpenAI 兼容格式', description: '兼容 OpenAI 的 /v1/chat/completions 端点' })
  @ApiResponse({ status: 200, description: '聊天完成' })
  @ApiResponse({ status: 400, description: '参数错误' })
  async completions(@Body() chatMessageDto: ChatMessageDto, @Res() res: Response) {
    // 复用主聊天接口逻辑
    return this.sendMessage(chatMessageDto, res);
  }
}
