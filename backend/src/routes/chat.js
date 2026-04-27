const express = require('express');
const router = express.Router();
const SSEService = require('../services/sseService');
const AgentLogger = require('../infra/logger/AgentLogger');

const logger = new AgentLogger('chat');

/** 消息格式标准化 */
const normalizeMessages = (messages, message) => {
  if (Array.isArray(messages)) return messages;
  if (typeof message === 'string' && message.trim()) {
    return [{ role: 'user', content: message.trim() }];
  }
  return null;
};

/** 验证消息数组 */
const validateMessages = (normalizedMessages) => {
  if (!normalizedMessages) {
    return { valid: false, error: { message: 'messages is required and must be an array', type: 'invalid_request_error' } };
  }
  if (normalizedMessages.length > 100) {
    return { valid: false, error: { message: 'Too many messages (max 100)', type: 'invalid_request_error' } };
  }
  return { valid: true };
};
/** 发送错误响应 */
const sendError = (res, status, message, type = 'server_error') => {
  res.status(status).json({ error: { message, type } });
};

router.post('/', async (req, res) => {
  try {
    const { messages, message, model, stream } = req.body;
    const normalizedMessages = normalizeMessages(messages, message);
    const validation = validateMessages(normalizedMessages);
    if (!validation.valid) return sendError(res, 400, validation.error.message, validation.error.type);

    if (stream !== false) {
      req.body.messages = normalizedMessages;
      return await SSEService.handleChat(req, res);
    }

    const origin = `${req.protocol}://${req.get('host')}`;
    const proxyResponse = await fetch(`${origin}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req.body, messages: normalizedMessages, stream: false })
    });

    const responseText = await proxyResponse.text();
    res.status(proxyResponse.status).setHeader('Content-Type', proxyResponse.headers.get('content-type') || 'application/json');
    return res.send(responseText);
  } catch (error) {
    logger.error('Chat error', { error: error.message, stack: error.stack });
    sendError(res, 500, error.message || 'Internal server error');
  }
});

router.post('/stop', (req, res) => SSEService.handleStop(req, res));

router.post('/completions', async (req, res) => {
  const { messages, message, model } = req.body;
  const normalizedMessages = normalizeMessages(messages, message);
  const validation = validateMessages(normalizedMessages);
  if (!validation.valid) return sendError(res, 400, validation.error.message, validation.error.type);

  req.body = { messages: normalizedMessages, model, stream: false };
  try {
    await SSEService.handleChat(req, res);
  } catch (error) {
    logger.error('Completions route error', { error: error.message, stack: error.stack });
    sendError(res, 500, error.message || 'Internal server error');
  }
});

module.exports = router;
