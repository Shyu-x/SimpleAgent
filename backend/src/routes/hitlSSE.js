/**
 * HITL SSE 路由 - 前端订阅人机确认事件
 * GET /api/hitl/sse - 建立 SSE 连接，实时接收确认请求
 */

const express = require('express');
const router = express.Router();
const { hitlManager } = require('../hitl');
const { sseClientManager } = require('../services/hitlSSEService');
const { AgentLogger } = require('../infra/logger/AgentLogger');

const logger = new AgentLogger('hitlSSE');

/**
 * 建立 SSE 连接
 * GET /api/hitl/sse
 */
router.get('/sse', (req, res) => {
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);
  sseClientManager.addClient(clientId, res);

  // 发送待处理检查点
  const pending = hitlManager.getPendingCheckpoints();
  if (pending.length > 0) {
    res.write(`data: ${JSON.stringify({ type: 'pending_checkpoints', checkpoints: pending })}\n\n`);
  }

  // 心跳
  const heartbeatInterval = setInterval(() => {
    try {
      sseClientManager.sendHeartbeat(res);
    } catch (error) {
      clearInterval(heartbeatInterval);
      sseClientManager.removeClient(clientId);
    }
  }, 30000);

  // 事件监听器
  const wrapHandler = (subtype) => (checkpoint) => {
    try {
      res.write(`data: ${JSON.stringify({
        type: 'confirmation',
        subtype,
        checkpoint: checkpoint.getSummary ? checkpoint.getSummary() : checkpoint
      })}\n\n`);
    } catch (error) {
      logger.error(`Failed to send ${subtype} event`, { clientId, error: error.message });
    }
  };

  hitlManager.on('checkpoint:created', wrapHandler('created'));
  hitlManager.on('checkpoint:approved', wrapHandler('approved'));
  hitlManager.on('checkpoint:rejected', wrapHandler('rejected'));
  hitlManager.on('checkpoint:timeout', wrapHandler('timeout'));

  // 断开处理
  const cleanup = () => {
    clearInterval(heartbeatInterval);
    sseClientManager.removeClient(clientId);
    hitlManager.off('checkpoint:created', wrapHandler('created'));
    hitlManager.off('checkpoint:approved', wrapHandler('approved'));
    hitlManager.off('checkpoint:rejected', wrapHandler('rejected'));
    hitlManager.off('checkpoint:timeout', wrapHandler('timeout'));
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
});

/**
 * 获取当前连接的客户端数量
 * GET /api/hitl/sse/clients
 */
router.get('/sse/clients', (_req, res) => {
  res.json({ success: true, count: sseClientManager.getClientCount() });
});

/**
 * 手动触发广播
 * POST /api/hitl/sse/broadcast
 */
router.post('/sse/broadcast', (req, res) => {
  const { type, data } = req.body;
  if (!type) return res.status(400).json({ success: false, error: 'Missing type' });
  sseClientManager.broadcast({ type, ...data });
  res.json({ success: true, clients: sseClientManager.getClientCount() });
});

module.exports = router;