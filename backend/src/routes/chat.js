const express = require('express');
const router = express.Router();
const SSEService = require('../services/sseService');

/**
 * @swagger
 * /api/chat:
 *   post:
 *     tags: [chat]
 *     summary: SSE流式聊天接口
 *     description: OpenAI兼容格式的聊天接口，支持SSE流式响应
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messages
 *             properties:
 *               messages:
 *                 type: array
 *                 description: 消息数组
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [system, user, assistant]
 *                       description: 角色
 *                     content:
 *                       type: string
 *                       description: 消息内容
 *               message:
 *                 type: string
 *                 description: 简化的单条消息格式（与messages二选一）
 *               model:
 *                 type: string
 *                 description: 模型名称，默认MiniMax-M2.7
 *               stream:
 *                 type: boolean
 *                 default: true
 *                 description: 是否使用SSE流式响应
 *     responses:
 *       200:
 *         description: SSE流式响应
 *       400:
 *         description: 参数错误
 *       500:
 *         description: 服务器错误
 */
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

/**
 * @swagger
 * /api/chat/stop:
 *   post:
 *     tags: [chat]
 *     summary: 停止生成
 *     description: 停止当前正在进行的生成任务
 *     responses:
 *       200:
 *         description: 成功停止
 */
router.post('/stop', (req, res) => {
  SSEService.handleStop(req, res);
});

// 兼容OpenAI格式 - /v1/chat/completions
// 注意：此路由会被 proxy.js 中的 /api/v1/chat/completions 覆盖
// 这里仅作为备用实现
router.post('/completions', async (req, res) => {
  // 直接调用主聊天接口逻辑（非流式）
  const { messages, message, model } = req.body;
  const normalizedMessages = Array.isArray(messages)
    ? messages
    : typeof message === 'string' && message.trim()
      ? [{ role: 'user', content: message.trim() }]
      : null;

  if (!normalizedMessages) {
    return res.status(400).json({
      error: {
        message: 'messages is required and must be an array',
        type: 'invalid_request_error'
      }
    });
  }

  // 调用 SSE Service（非流式）
  req.body = { messages: normalizedMessages, model, stream: false };
  try {
    await SSEService.handleChat(req, res);
  } catch (error) {
    console.error('Completions route error:', error);
    res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'server_error'
      }
    });
  }
});

module.exports = router;
