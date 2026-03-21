const express = require('express');
const router = express.Router();
const SSEService = require('../services/sseService');

// SSE流式聊天接口 - OpenAI兼容格式
router.post('/', async (req, res) => {
  try {
    const { messages, message, model, stream } = req.body;
    const normalizedMessages = Array.isArray(messages)
      ? messages
      : typeof message === 'string' && message.trim()
        ? [{ role: 'user', content: message.trim() }]
        : null;

    // 验证必要参数
    if (!normalizedMessages) {
      return res.status(400).json({
        error: {
          message: 'messages is required and must be an array',
          type: 'invalid_request_error'
        }
      });
    }

    // 消息数量限制
    if (normalizedMessages.length > 100) {
      return res.status(400).json({
        error: {
          message: 'Too many messages (max 100)',
          type: 'invalid_request_error'
        }
      });
    }

    // 如果stream不为false，使用SSE流式响应
    if (stream !== false) {
      req.body.messages = normalizedMessages;
      return await SSEService.handleChat(req, res);
    }

    // 非流式响应：复用 /api/v1/chat/completions 代理能力
    const origin = `${req.protocol}://${req.get('host')}`;
    const proxyResponse = await fetch(`${origin}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req.body, messages: normalizedMessages, stream: false })
    });

    const responseText = await proxyResponse.text();
    const contentType = proxyResponse.headers.get('content-type') || 'application/json';

    res.status(proxyResponse.status);
    res.setHeader('Content-Type', contentType);
    return res.send(responseText);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'server_error'
      }
    });
  }
});

// 停止生成
router.post('/stop', (req, res) => {
  SSEService.handleStop(req, res);
});

// 兼容OpenAI格式 - /v1/chat/completions
// 注意：此路由会被 proxy.js 中的 /api/v1/chat/completions 覆盖
// 这里仅作为备用实现
router.post('/completions', async (req, res) => {
  // 重用主聊天接口逻辑
  req.url = '/';
  return router.handle(req, res, (err) => {
    if (err) {
      console.error('Completions route error:', err);
      res.status(500).json({
        error: {
          message: 'Internal server error',
          type: 'server_error'
        }
      });
    }
  });
});

module.exports = router;
