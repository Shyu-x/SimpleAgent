/**
 * MiniMax API 代理路由
 * 仅支持 MiniMax Token Plan API (Anthropic 兼容格式)
 */

const express = require('express');
const router = express.Router();
const AgentLogger = require('../infra/logger/AgentLogger');

const logger = new AgentLogger('proxy');

const PROVIDER = {
  name: 'MiniMax',
  baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic',
  chatEndpoint: '/v1/messages',
  defaultModel: 'MiniMax-M2.7'
};

// 获取 API Key
function getApiKey(req) {
  return req.body.apiKey || process.env.MINIMAX_API_KEY || '';
}

// 转换请求格式
function transformRequest(req) {
  const { messages, model, temperature, max_tokens, stream, reasoning_split, thinking_budget } = req.body;
  return {
    model: model || PROVIDER.defaultModel,
    messages: messages.map(m => {
      if (Array.isArray(m.content)) {
        return { role: m.role === 'assistant' ? 'assistant' : m.role, content: m.content };
      }
      return { role: m.role === 'assistant' ? 'assistant' : m.role, content: m.content };
    }),
    max_tokens: max_tokens || 8192,
    temperature: temperature !== undefined ? temperature : 0.7,
    stream: stream !== false,
    ...(reasoning_split && { thinking: { type: 'enabled', budget_tokens: thinking_budget || 4000 } })
  };
}

// POST /chat/completions - 流式代理
router.post('/chat/completions', async (req, res) => {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: { message: 'MiniMax API Key 未配置', type: 'authentication_error' } });
  }

  const targetUrl = PROVIDER.baseUrl + PROVIDER.chatEndpoint;
  const requestBody = transformRequest(req);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      timeout: 120000
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: { message: errorData.error?.message || `API 错误: ${response.status}`, type: 'api_error' }
      });
    }

    // 流式响应
    if (req.body.stream !== false) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const readChunk = async () => {
        try {
          const { done, value } = await reader.read();
          if (done) { res.end(); return; }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') { res.write('data: [DONE]\n\n'); continue; }
              try {
                const data = JSON.parse(jsonStr);
                if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: data.delta.text } }] })}\n\n`);
                } else if (data.type === 'content_block_delta' && data.delta?.type === 'thinking_delta') {
                  res.write(`data: ${JSON.stringify({ type: 'thinking_delta', content: data.delta.thinking })}\n\n`);
                }
              } catch (e) { /* ignore */ }
            }
          }
          readChunk();
        } catch (err) { logger.error('Stream error', { error: err.message, stack: err.stack }); res.end(); }
      };
      readChunk();
    } else {
      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    logger.error('Proxy error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: { message: error.message, type: 'proxy_error' } });
  }
});

// POST /chat - 简单聊天接口 (非流式)
router.post('/chat', async (req, res) => {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: { message: 'MiniMax API Key 未配置', type: 'authentication_error' } });
  }

  const { messages, model, temperature, max_tokens } = req.body;
  const requestBody = transformRequest({ body: { messages, model, temperature, max_tokens, stream: false } });

  try {
    const response = await fetch(PROVIDER.baseUrl + PROVIDER.chatEndpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      timeout: 120000
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: { message: errorData.error?.message || `API 错误: ${response.status}`, type: 'api_error' } });
    }
    res.json(await response.json());
  } catch (error) {
    logger.error('Chat error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: { message: error.message, type: 'proxy_error' } });
  }
});

// GET /health - 健康检查
router.get('/health', (req, res) => {
  res.json({ status: 'ok', provider: PROVIDER.name, configured: !!getApiKey(req), baseUrl: PROVIDER.baseUrl, defaultModel: PROVIDER.defaultModel });
});

module.exports = router;
