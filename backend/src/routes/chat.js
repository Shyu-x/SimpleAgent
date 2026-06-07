/**
 * Chat Routes - 聊天接口层
 * 纯路由：参数校验 + 响应组装，业务逻辑委托给 services
 */
const express = require('express');
const router = express.Router();
const SSEService = require('../services/sseService');
const { AgentLogger } = require('../infra/logger/AgentLogger');
const chatService = require('../services/chatService');

// 导入限流器
const { chatRateLimiter } = require('../common/rate-limiter/integration');

// 导入指标采集器
const { getMetricsCollector } = require('../infra/metrics');

const logger = new AgentLogger('chat');

// 应用限流器（每分钟 60 请求）
router.use(chatRateLimiter);

/**
 * POST /api/chat
 * 聊天接口 - 支持 SSE 流式响应
 */
router.post('/', async (req, res) => {
  const collector = getMetricsCollector();
  const startTime = Date.now();
  const requestId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // 记录请求开始
  collector.startRequest(requestId, { endpoint: '/api/chat', method: 'POST' });

  try {
    const { messages, message, model, stream } = req.body;

    // 委托给 chatService 处理消息标准化和验证
    const result = chatService.normalizeAndValidate(messages, message);
    if (!result.success) {
      collector.endRequest(requestId, 400);
      return chatService.sendError(res, 400, result.error.message, result.error.type);
    }

    if (stream !== false) {
      req.body.messages = result.data;

      // SSE 流式响应 - 直接调用 SSEService（熔断器在 MiniMaxRouter 内部处理）
      try {
        const result = await SSEService.handleChat(req, res);
        const latency = Date.now() - startTime;
        collector.incrementCounter('http_requests_total', { endpoint: '/api/chat', status: 200 });
        collector.recordHistogram('http_request_duration_seconds', latency / 1000, { endpoint: '/api/chat' });
        return result;
      } catch (error) {
        logger.error('SSE Chat error', { error: error.message, stack: error.stack });
        collector.endRequest(requestId, 500);
        return;
      }
    }

    const origin = `${req.protocol}://${req.get('host')}`;
    const proxyResponse = await fetch(`${origin}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req.body, messages: result.data, stream: false })
    });

    const latency = Date.now() - startTime;
    collector.incrementCounter('http_requests_total', { endpoint: '/api/chat', status: proxyResponse.status });
    collector.recordHistogram('http_request_duration_seconds', latency / 1000, { endpoint: '/api/chat' });
    collector.endRequest(requestId, proxyResponse.status);

    const responseText = await proxyResponse.text();
    res.status(proxyResponse.status).setHeader('Content-Type', proxyResponse.headers.get('content-type') || 'application/json');
    return res.send(responseText);
  } catch (error) {
    const latency = Date.now() - startTime;
    collector.incrementCounter('http_requests_total', { endpoint: '/api/chat', status: 500 });
    collector.recordHistogram('http_request_duration_seconds', latency / 1000, { endpoint: '/api/chat' });
    collector.endRequest(requestId, 500);
    logger.error('Chat error', { error: error.message, stack: error.stack });
    chatService.sendError(res, 500, error.message || 'Internal server error');
  }
});

/**
 * POST /api/chat/stop
 * 停止聊天
 */
router.post('/stop', (req, res) => SSEService.handleStop(req, res));

/**
 * POST /api/chat/completions
 * 聊天补全接口
 */
router.post('/completions', async (req, res) => {
  const collector = getMetricsCollector();
  const startTime = Date.now();
  const requestId = `completions_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  collector.startRequest(requestId, { endpoint: '/api/chat/completions', method: 'POST' });

  const { messages, message, model } = req.body;

  // 委托给 chatService 处理消息标准化和验证
  const result = chatService.normalizeAndValidate(messages, message);
  if (!result.success) {
    collector.endRequest(requestId, 400);
    return chatService.sendError(res, 400, result.error.message, result.error.type);
  }

  req.body = { messages: result.data, model, stream: false };
  try {
    // 直接调用 SSEService（熔断器在 MiniMaxRouter 内部处理）
    const result = await SSEService.handleChat(req, res);
    const latency = Date.now() - startTime;
    collector.incrementCounter('http_requests_total', { endpoint: '/api/chat/completions', status: 200 });
    collector.recordHistogram('http_request_duration_seconds', latency / 1000, { endpoint: '/api/chat/completions' });
    collector.endRequest(requestId, 200);
    return result;
  } catch (error) {
    const latency = Date.now() - startTime;
    collector.incrementCounter('http_requests_total', { endpoint: '/api/chat/completions', status: 500 });
    collector.recordHistogram('http_request_duration_seconds', latency / 1000, { endpoint: '/api/chat/completions' });
    collector.endRequest(requestId, 500);
    logger.error('Completions route error', { error: error.message, stack: error.stack });
    chatService.sendError(res, 500, error.message || 'Internal server error');
  }
});

module.exports = router;