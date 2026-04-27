/**
 * HITL SSE 路由 - 前端订阅人机确认事件
 * GET /api/hitl/sse - 建立 SSE 连接，实时接收确认请求
 */

const express = require('express');
const router = express.Router();
const { hitlManager } = require('../hitl');
const AgentLogger = require('../infra/logger/AgentLogger');

const logger = new AgentLogger('hitlSSE');

// 存储所有 SSE 连接
const sseClients = new Map();

/**
 * SSE 健康检查（心跳）
 */
function sendHeartbeat(res) {
  res.write(': heartbeat\n\n');
}

/**
 * 广播消息到所有连接的客户端
 */
function broadcast(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const [clientId, res] of sseClients) {
    try {
      res.write(message);
    } catch (error) {
      logger.error(`Failed to send to client ${clientId}`, { error: error.message });
      // 移除断开的客户端
      sseClients.delete(clientId);
    }
  }
}

/**
 * 建立 SSE 连接
 * GET /api/hitl/sse
 */
router.get('/sse', (req, res) => {
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // 发送连接成功消息
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

  // 存储客户端
  sseClients.set(clientId, res);

  logger.info(`Client connected`, { clientId, totalClients: sseClients.size });

  // 发送当前待处理的检查点
  const pending = hitlManager.getPendingCheckpoints();
  if (pending.length > 0) {
    res.write(`data: ${JSON.stringify({ type: 'pending_checkpoints', checkpoints: pending })}\n\n`);
  }

  // 启动心跳
  const heartbeatInterval = setInterval(() => {
    try {
      sendHeartbeat(res);
    } catch (error) {
      clearInterval(heartbeatInterval);
      sseClients.delete(clientId);
      logger.info(`Client disconnected (heartbeat failed)`, { clientId });
    }
  }, 30000);

  // 监听检查点事件
  const handleCheckpointCreated = (checkpoint) => {
    try {
      res.write(`data: ${JSON.stringify({
        type: 'confirmation',
        subtype: 'created',
        checkpoint: checkpoint.getSummary ? checkpoint.getSummary() : checkpoint
      })}\n\n`);
    } catch (error) {
      logger.error(`Failed to send checkpoint event`, { clientId, error: error.message });
    }
  };

  const handleCheckpointApproved = (checkpoint) => {
    try {
      res.write(`data: ${JSON.stringify({
        type: 'confirmation',
        subtype: 'approved',
        checkpoint: checkpoint.getSummary ? checkpoint.getSummary() : checkpoint
      })}\n\n`);
    } catch (error) {
      logger.error(`Failed to send approved event`, { clientId, error: error.message });
    }
  };

  const handleCheckpointRejected = (checkpoint) => {
    try {
      res.write(`data: ${JSON.stringify({
        type: 'confirmation',
        subtype: 'rejected',
        checkpoint: checkpoint.getSummary ? checkpoint.getSummary() : checkpoint
      })}\n\n`);
    } catch (error) {
      logger.error(`Failed to send rejected event`, { clientId, error: error.message });
    }
  };

  const handleCheckpointTimeout = (checkpoint) => {
    try {
      res.write(`data: ${JSON.stringify({
        type: 'confirmation',
        subtype: 'timeout',
        checkpoint: checkpoint.getSummary ? checkpoint.getSummary() : checkpoint
      })}\n\n`);
    } catch (error) {
      logger.error(`Failed to send timeout event`, { clientId, error: error.message });
    }
  };

  // 注册事件监听器
  hitlManager.on('checkpoint:created', handleCheckpointCreated);
  hitlManager.on('checkpoint:approved', handleCheckpointApproved);
  hitlManager.on('checkpoint:rejected', handleCheckpointRejected);
  hitlManager.on('checkpoint:timeout', handleCheckpointTimeout);

  // 处理客户端断开
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    sseClients.delete(clientId);
    hitlManager.off('checkpoint:created', handleCheckpointCreated);
    hitlManager.off('checkpoint:approved', handleCheckpointApproved);
    hitlManager.off('checkpoint:rejected', handleCheckpointRejected);
    hitlManager.off('checkpoint:timeout', handleCheckpointTimeout);
    logger.info(`Client disconnected`, { clientId, remainingClients: sseClients.size });
  });

  req.on('error', (error) => {
    clearInterval(heartbeatInterval);
    sseClients.delete(clientId);
    hitlManager.off('checkpoint:created', handleCheckpointCreated);
    hitlManager.off('checkpoint:approved', handleCheckpointApproved);
    hitlManager.off('checkpoint:rejected', handleCheckpointRejected);
    hitlManager.off('checkpoint:timeout', handleCheckpointTimeout);
    logger.error(`Client error`, { clientId, error: error.message });
  });
});

/**
 * 获取当前连接的客户端数量（调试用）
 * GET /api/hitl/sse/clients
 */
router.get('/sse/clients', (_req, res) => {
  res.json({
    success: true,
    count: sseClients.size,
    clients: sseClients.size
  });
});

/**
 * 手动触发广播（用于调试）
 * POST /api/hitl/sse/broadcast
 */
router.post('/sse/broadcast', (req, res) => {
  const { type, data } = req.body;

  if (!type) {
    return res.status(400).json({ success: false, error: 'Missing type' });
  }

  broadcast({ type, ...data });
  res.json({ success: true, clients: sseClients.size });
});

module.exports = router;
