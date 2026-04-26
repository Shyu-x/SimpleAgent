/**
 * SSE流式输出服务
 * MiniMax 单一架构 - 实际调用 MiniMax API
 */

const { MiniMaxRouter } = require('./router/modelRouter');

// 创建路由器实例
const miniMaxRouter = new MiniMaxRouter({
  defaultModel: 'MiniMax-M2.7',
  enableFirstChunkProbe: true,
  enableMultiModelFallback: true
});

// 错误类型分类
const ErrorType = {
  VALIDATION: 'validation_error',
  AUTH: 'authentication_error',
  RATE_LIMIT: 'rate_limit_error',
  API: 'api_error',
  TIMEOUT: 'timeout_error',
  SERVER: 'server_error',
  UNKNOWN: 'unknown_error'
};

/**
 * 分类错误类型
 */
function classifyError(error, response = null) {
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
function validateChatRequest(body) {
  const errors = [];

  if (!body.messages) {
    errors.push('缺少messages参数');
  } else if (!Array.isArray(body.messages)) {
    errors.push('messages必须为数组');
  } else if (body.messages.length === 0) {
    errors.push('messages不能为空数组');
  } else {
    // 检查每条消息的格式
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

// SSE流式输出服务
class SSEService {
  /**
   * 处理聊天请求 - 实际调用 MiniMax API
   */
  static async handleChat(req, res) {
    const { messages, model = 'MiniMax-M2.7', stream = true, temperature, max_tokens } = req.body;

    // 输入验证
    const validationErrors = validateChatRequest(req.body);
    if (validationErrors.length > 0) {
      res.writeHead(400, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      });
      res.write(`data: ${JSON.stringify({
        type: 'error',
        errorType: ErrorType.VALIDATION,
        message: validationErrors.join('; '),
        details: validationErrors
      })}\n\n`);
      res.end();
      return;
    }

    // 设置SSE响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // 发送连接成功消息
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    try {
      // 调用 MiniMax API
      const result = await miniMaxRouter.execute({
        messages,
        model,
        stream: true,
        options: {
          temperature: temperature || 0.7,
          max_tokens: max_tokens || 8192
        }
      });

      if (!result.success) {
        const errorInfo = classifyError(new Error(result.error));
        res.write(`data: ${JSON.stringify({
          type: 'error',
          errorType: errorInfo.type,
          message: errorInfo.message,
          requestId: result.requestId
        })}\n\n`);
        res.end();
        return;
      }

      // 获取流式响应 - execute 返回的是 result.result
      const responseStream = result.result;

      if (!responseStream || typeof responseStream.getReader !== 'function') {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          errorType: ErrorType.SERVER,
          message: '服务内部错误：无效的响应流'
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
      console.error('SSE Chat Error:', error);
      const errorInfo = classifyError(error);
      const requestId = req.body?.requestId || 'unknown';
      res.write(`data: ${JSON.stringify({
        type: 'error',
        errorType: errorInfo.type,
        message: errorInfo.message,
        requestId
      })}\n\n`);
    }

    res.end();
  }

  /**
   * 停止生成
   */
  static handleStop(req, res) {
    res.json({ success: true, message: 'Generation stopped' });
  }
}

module.exports = SSEService;
