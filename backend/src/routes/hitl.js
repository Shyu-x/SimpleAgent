const express = require('express');
const router = express.Router();
const hitlService = require('../services/hitl/HitlService');
const { CheckpointType } = require('../hitl');

/**
 * @swagger
 * tags:
 *   - name: hitl
 *     description: HITL人机协作确认系统
 */

/**
 * @swagger
 * /api/hitl/checkpoint:
 *   post:
 *     tags: [hitl]
 *     summary: 创建检查点
 *     description: 创建人机协作确认检查点
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [DECISION, APPROVAL, REJECTION, CONFIRMATION]
 *                 description: 检查点类型
 *               title:
 *                 type: string
 *                 description: 检查点标题
 *               description:
 *                 type: string
 *                 description: 检查点描述
 *               context:
 *                 type: object
 *                 description: 上下文数据
 *               options:
 *                 type: array
 *                 items:
 *                   type: object
 *                 description: 可选项列表
 *               timeout:
 *                 type: number
 *                 description: 超时时间(毫秒)
 *               required:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: 检查点创建成功
 *       400:
 *         description: 参数错误
 */
router.post('/checkpoint', (req, res) => {
  const { type, title, description, context, options, timeout, required } = req.body;

  const result = hitlService.createCheckpoint({
    type,
    title,
    description,
    context,
    options,
    timeout,
    required
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

/**
 * 获取待处理检查点列表
 * GET /api/hitl/pending
 */
router.get('/pending', (_req, res) => {
  res.json(hitlService.getPendingCheckpoints());
});

/**
 * 获取检查点详情
 * GET /api/hitl/checkpoint/:id
 */
router.get('/checkpoint/:id', (req, res) => {
  const result = hitlService.getCheckpoint(req.params.id);

  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
});

/**
 * 批准检查点
 * POST /api/hitl/checkpoint/:id/approve
 */
router.post('/checkpoint/:id/approve', (req, res) => {
  const { option, comment, userId } = req.body;
  const result = hitlService.approveCheckpoint(req.params.id, option, userId, comment);

  if (!result.success) {
    return res.status(500).json(result);
  }

  res.json(result);
});

/**
 * 拒绝检查点
 * POST /api/hitl/checkpoint/:id/reject
 */
router.post('/checkpoint/:id/reject', (req, res) => {
  const { reason, userId } = req.body;
  const result = hitlService.rejectCheckpoint(req.params.id, reason, userId);

  if (!result.success) {
    return res.status(500).json(result);
  }

  res.json(result);
});

/**
 * 等待检查点响应
 * POST /api/hitl/checkpoint/:id/wait
 */
router.post('/checkpoint/:id/wait', async (req, res) => {
  const { timeout } = req.body;

  try {
    const result = await hitlService.waitForCheckpoint(req.params.id, timeout);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建确认请求
 * POST /api/hitl/request
 */
router.post('/request', async (req, res) => {
  const { type, title, description, context, options, timeout, required } = req.body;

  try {
    const result = await hitlService.requestConfirmationWithTimeout({
      type,
      title,
      description,
      context,
      options,
      timeout,
      required
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建并等待确认（一次性操作）
 * POST /api/hitl/confirm
 */
router.post('/confirm', async (req, res) => {
  const { type, title, description, context, options, timeout, required } = req.body;

  try {
    const result = await hitlService.requestConfirmation({
      type,
      title,
      description,
      context,
      options,
      timeout,
      required
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取历史记录
 * GET /api/hitl/history
 */
router.get('/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(hitlService.getHistory(limit));
});

/**
 * 获取统计信息
 * GET /api/hitl/stats
 */
router.get('/stats', (_req, res) => {
  res.json(hitlService.getStats());
});

/**
 * 清除所有待处理检查点
 * POST /api/hitl/clear
 */
router.post('/clear', (_req, res) => {
  res.json(hitlService.clearPending());
});

/**
 * 获取检查点类型
 * GET /api/hitl/types
 */
router.get('/types', (_req, res) => {
  res.json(hitlService.getTypes());
});

/**
 * 健康检查
 * GET /api/hitl/health
 */
router.get('/health', (_req, res) => {
  res.json(hitlService.healthCheck());
});

/**
 * 状态检查（/health 的别名）
 * GET /api/hitl/status
 */
router.get('/status', (_req, res) => {
  res.json(hitlService.healthCheck());
});

/**
 * SSE 连接
 * GET /api/hitl/sse
 */
router.get('/sse', (req, res) => {
  const hitlManager = require('../../hitl').hitlManager;
  const handlers = hitlService.createSSEHandlers(hitlManager);

  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[HITL SSE] Client connected: ${clientId}`);

  // 发送连接成功事件
  res.write(`data: ${JSON.stringify(handlers.createConnectedEvent(clientId))}\n\n`);

  // 发送待处理检查点
  const pending = hitlManager.getPendingCheckpoints();
  if (pending.length > 0) {
    res.write(`data: ${JSON.stringify(handlers.createPendingCheckpointsEvent(pending))}\n\n`);
  }

  // 注册事件处理器，实时推送检查点变化
  const handleCreated = (checkpoint) => {
    res.write(`data: ${JSON.stringify(handlers.handleCreated(checkpoint))}\n\n`);
  };

  const handleApproved = (checkpoint) => {
    res.write(`data: ${JSON.stringify(handlers.handleApproved(checkpoint))}\n\n`);
  };

  const handleRejected = (checkpoint) => {
    res.write(`data: ${JSON.stringify(handlers.handleRejected(checkpoint))}\n\n`);
  };

  const handleTimeout = (checkpoint) => {
    res.write(`data: ${JSON.stringify(handlers.handleTimeout(checkpoint))}\n\n`);
  };

  hitlManager.on('checkpoint:created', handleCreated);
  hitlManager.on('checkpoint:approved', handleApproved);
  hitlManager.on('checkpoint:rejected', handleRejected);
  hitlManager.on('checkpoint:timeout', handleTimeout);

  // 心跳保活
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  // 客户端断开连接
  req.on('close', () => {
    console.log(`[HITL SSE] Client disconnected: ${clientId}`);
    clearInterval(heartbeat);
    hitlManager.off('checkpoint:created', handleCreated);
    hitlManager.off('checkpoint:approved', handleApproved);
    hitlManager.off('checkpoint:rejected', handleRejected);
    hitlManager.off('checkpoint:timeout', handleTimeout);
  });
});

module.exports = router;