/**
 * MiniMax 单一架构 - API 代理
 * 仅支持 MiniMax Token Plan API
 */

const express = require('express');
const router = express.Router();

const CONFIG = {
  REQUEST_TIMEOUT: 120000, // 120秒超时
};

// MiniMax Provider (Anthropic 兼容格式)
const PROVIDER = {
  name: 'MiniMax',
  baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic',
  chatEndpoint: '/v1/messages',
  defaultModel: 'MiniMax-M2.7',
  supportsReasoning: true,
};

// 获取 MiniMax API Key
function getApiKey(req) {
  // 优先从请求体获取（前端传递）
  if (req.body.apiKey) {
    return req.body.apiKey;
  }
  // 从环境变量获取
  return process.env.MINIMAX_API_KEY || '';
}

// 转换请求（MiniMax Anthropic 兼容格式）
function transformRequest(req) {
  const { messages, model, temperature, max_tokens, stream, reasoning_split, thinking_budget } = req.body;

  // 转换消息，支持多模态内容（OpenAI格式数组）
  const transformedMessages = messages.map(m => {
    // 如果content是数组（多模态格式），直接传递
    if (Array.isArray(m.content)) {
      return {
        role: m.role === 'assistant' ? 'assistant' : m.role,
        content: m.content.map(item => {
          // image_url 类型保持原格式
          if (item.type === 'image_url') {
            return item;
          }
          // text 类型
          return { type: 'text', text: item.text || item.content || '' };
        })
      };
    }
    // 字符串内容直接传递
    return {
      role: m.role === 'assistant' ? 'assistant' : m.role,
      content: m.content
    };
  });

  return {
    model: model || PROVIDER.defaultModel,
    messages: transformedMessages,
    max_tokens: max_tokens || 8192,
    temperature: temperature !== undefined ? temperature : 0.7,
    stream: stream !== false,
    ...(reasoning_split && {
      thinking: {
        type: 'enabled',
        budget_tokens: thinking_budget || 4000
      }
    })
  };
}

// 转换流式数据块
function transformStreamChunk(data) {
  // MiniMax Anthropic 格式转换
  if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
    return { choices: [{ delta: { content: data.delta.text } }] };
  }

  // 思考内容处理 - 单独发送thinking事件
  if (data.type === 'content_block_delta' && data.delta?.type === 'thinking_delta') {
    // 发送 thinking 事件，前端可单独处理
    return {
      type: 'thinking',
      content: data.delta.thinking || ''
    };
  }

  if (data.type === 'message_stop' || data.event === 'message_stop') {
    return null;
  }

  // 透传其他事件
  return data;
}

// Token 计数
function countTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    for (const char of content) {
      total += char.charCodeAt(0) > 127 ? 1.5 : 0.25;
    }
    total += 4; // 每条消息开销
  }
  return Math.ceil(total);
}

// Chat Completions 代理
router.post('/chat/completions', async (req, res) => {
  const apiKey = getApiKey(req);

  if (!apiKey) {
    return res.status(401).json({
      error: {
        message: 'MiniMax API Key 未配置',
        type: 'authentication_error',
        code: 'missing_api_key'
      }
    });
  }

  const { baseURL, stream = true } = req.body;
  const targetUrl = (baseURL || PROVIDER.baseUrl) + PROVIDER.chatEndpoint;
  const requestBody = transformRequest(req);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      timeout: CONFIG.REQUEST_TIMEOUT
    });

    if (!response.ok) {
      let errorData = {};
      let errorText = '';

      // 尝试解析错误响应
      try {
        errorText = await response.text();
        errorData = JSON.parse(errorText);
      } catch (e) {
        // 无法解析，使用状态码和原始文本
        errorData = {
          error: {
            message: errorText || `MiniMax API 错误: ${response.status}`,
            type: response.status >= 500 ? 'server_error' : 'api_error'
          }
        };
      }

      // 根据状态码分类错误类型
      let errorType = 'api_error';
      if (response.status === 401 || response.status === 403) {
        errorType = 'authentication_error';
      } else if (response.status === 429) {
        errorType = 'rate_limit_error';
      } else if (response.status >= 500) {
        errorType = 'server_error';
      } else if (response.status === 400) {
        errorType = 'validation_error';
      }

      return res.status(response.status).json({
        error: {
          message: errorData.error?.message || `MiniMax API 错误: ${response.status}`,
          type: errorData.error?.type || errorType,
          code: errorData.error?.code
        }
      });
    }

    if (stream) {
      // 流式响应 - 使用 Node.js 18+ ReadableStream
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedThinking = ''; // 累积思维链内容
      let thinkingBlockCount = 0;   // 思维块计数

      const readChunk = async () => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            // 发送思维链摘要（如果有）
            if (accumulatedThinking) {
              res.write(`data: ${JSON.stringify({
                type: 'thinking_complete',
                thinkingCount: thinkingBlockCount,
                thinkingPreview: accumulatedThinking.substring(0, 500)
              })}\n\n`);
            }
            // 处理缓冲区中剩余的数据
            if (buffer.trim()) {
              const lines = buffer.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim();
                  if (jsonStr === '[DONE]') {
                    res.write('data: [DONE]\n\n');
                    continue;
                  }
                  try {
                    const data = JSON.parse(jsonStr);
                    const transformed = transformStreamChunk(data);
                    if (transformed) {
                      // 如果是thinking事件，累积内容
                      if (transformed.type === 'thinking') {
                        accumulatedThinking += transformed.content;
                        thinkingBlockCount++;
                        // 发送thinking事件
                        res.write(`data: ${JSON.stringify({
                          type: 'thinking_delta',
                          content: transformed.content,
                          blockIndex: thinkingBlockCount
                        })}\n\n`);
                      } else {
                        res.write(`data: ${JSON.stringify(transformed)}\n\n`);
                      }
                    }
                  } catch (e) {
                    // 忽略解析错误
                  }
                }
              }
            }
            res.end();
            return;
          }

          buffer += decoder.decode(value, { stream: true });

          // 处理完整行
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') {
                res.write('data: [DONE]\n\n');
                continue;
              }
              try {
                const data = JSON.parse(jsonStr);
                const transformed = transformStreamChunk(data);
                if (transformed) {
                  // 如果是thinking事件，累积内容并发送
                  if (transformed.type === 'thinking') {
                    accumulatedThinking += transformed.content;
                    thinkingBlockCount++;
                    // 发送thinking事件
                    res.write(`data: ${JSON.stringify({
                      type: 'thinking_delta',
                      content: transformed.content,
                      blockIndex: thinkingBlockCount
                    })}\n\n`);
                  } else {
                    res.write(`data: ${JSON.stringify(transformed)}\n\n`);
                  }
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }

          // 继续读取
          readChunk();
        } catch (err) {
          console.error('Stream read error:', err);
          res.end();
        }
      };

      readChunk();
    } else {
      // 非流式响应
      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    console.error('MiniMax proxy error:', error);
    res.status(500).json({
      error: {
        message: `请求错误: ${error.message}`,
        type: 'proxy_error'
      }
    });
  }
});

// 简单聊天接口 (非流式)
router.post('/chat', async (req, res) => {
  const apiKey = getApiKey(req);

  if (!apiKey) {
    return res.status(401).json({
      error: {
        message: 'MiniMax API Key 未配置',
        type: 'authentication_error'
      }
    });
  }

  const { messages, model, temperature, max_tokens } = req.body;
  const requestBody = transformRequest({
    body: { messages, model, temperature, max_tokens, stream: false }
  });

  try {
    const response = await fetch(PROVIDER.baseUrl + PROVIDER.chatEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      timeout: CONFIG.REQUEST_TIMEOUT
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: {
          message: errorData.error?.message || `MiniMax API 错误: ${response.status}`,
          type: errorData.error?.type || 'api_error'
        }
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('MiniMax chat error:', error);
    res.status(500).json({
      error: {
        message: `请求错误: ${error.message}`,
        type: 'proxy_error'
      }
    });
  }
});

// 健康检查
router.get('/health', (req, res) => {
  const apiKey = getApiKey(req);
  res.json({
    status: 'ok',
    provider: PROVIDER.name,
    configured: !!apiKey,
    baseUrl: PROVIDER.baseUrl,
    defaultModel: PROVIDER.defaultModel
  });
});

module.exports = router;
