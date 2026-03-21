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
  defaultModel: 'MiniMax-M2.7-highspeed',
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

  return {
    model: model || PROVIDER.defaultModel,
    messages: messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : m.role,
      content: m.content
    })),
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

  // 思考内容处理
  if (data.type === 'content_block_delta' && data.delta?.type === 'thinking_delta') {
    // 替换思考标记，便于前端检测
    const thinkingContent = `<think>${data.delta.thinking || ''}[/THINK]`;
    return { choices: [{ delta: { content: thinkingContent } }] };
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
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: {
          message: errorData.error?.message || `MiniMax API 错误: ${response.status}`,
          type: errorData.error?.type || 'api_error',
          code: errorData.error?.code
        }
      });
    }

    if (stream) {
      // 流式响应
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      response.body.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
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
                res.write(`data: ${JSON.stringify(transformed)}\n\n`);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });

      response.body.on('end', () => {
        res.end();
      });

      response.body.on('error', (err) => {
        console.error('Stream error:', err);
        res.end();
      });
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
