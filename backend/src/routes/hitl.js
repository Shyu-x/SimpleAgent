const express = require('express');
const router = express.Router();
const { hitlManager, CheckpointStatus, CheckpointType } = require('../hitl');

/**
 * 创建检查点
 * POST /api/hitl/checkpoint
 */
router.post('/checkpoint', (req, res) => {
  const { type, title, description, context, options, timeout, required } = req.body;

  if (!title) {
    return res.status(400).json({ success: false, error: 'Missing title' });
  }

  try {
    const checkpoint = hitlManager.createCheckpoint({
      type: type || CheckpointType.DECISION,
      title,
      description,
      context,
      options: options || [],
      timeout,
      required
    });

    res.json({
      success: true,
      checkpoint: checkpoint.getSummary()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取待处理检查点列表
 * GET /api/hitl/pending
 */
router.get('/pending', (_req, res) => {
  try {
    const pending = hitlManager.getPendingCheckpoints();
    res.json({
      success: true,
      checkpoints: pending,
      count: pending.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取检查点详情
 * GET /api/hitl/checkpoint/:id
 */
router.get('/checkpoint/:id', (req, res) => {
  const { id } = req.params;

  let checkpoint = hitlManager.getCheckpoint(id);
  if (!checkpoint) {
    checkpoint = hitlManager.findInHistory(id);
  }

  if (!checkpoint) {
    return res.status(404).json({ success: false, error: 'Checkpoint not found' });
  }

  res.json({
    success: true,
    checkpoint: checkpoint.getSummary ? checkpoint.getSummary() : checkpoint
  });
});

/**
 * 批准检查点
 * POST /api/hitl/checkpoint/:id/approve
 */
router.post('/checkpoint/:id/approve', (req, res) => {
  const { id } = req.params;
  const { option, comment, userId } = req.body;

  try {
    const result = hitlManager.approveCheckpoint(id, option, userId || 'user', comment || '');
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 拒绝检查点
 * POST /api/hitl/checkpoint/:id/reject
 */
router.post('/checkpoint/:id/reject', (req, res) => {
  const { id } = req.params;
  const { reason, userId } = req.body;

  try {
    const result = hitlManager.rejectCheckpoint(id, reason || '', userId || 'user');
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 等待检查点响应
 * POST /api/hitl/checkpoint/:id/wait
 */
router.post('/checkpoint/:id/wait', async (req, res) => {
  const { id } = req.params;
  const { timeout } = req.body;

  try {
    const result = await hitlManager.waitForCheckpoint(id, timeout);
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

  if (!title) {
    return res.status(400).json({ success: false, error: 'Missing title' });
  }

  try {
    const result = await hitlManager.requestConfirmation({
      type: type || CheckpointType.DECISION,
      title,
      description,
      context,
      options: options || [],
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

  try {
    const history = hitlManager.getHistory(limit);
    res.json({
      success: true,
      history,
      count: history.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取统计信息
 * GET /api/hitl/stats
 */
router.get('/stats', (_req, res) => {
  try {
    const stats = hitlManager.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 清除所有待处理检查点
 * POST /api/hitl/clear
 */
router.post('/clear', (_req, res) => {
  try {
    hitlManager.clearPending();
    res.json({
      success: true,
      message: 'All pending checkpoints cleared'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取检查点类型
 * GET /api/hitl/types
 */
router.get('/types', (_req, res) => {
  res.json({
    success: true,
    types: Object.values(CheckpointType),
    statuses: Object.values(CheckpointStatus)
  });
});

/**
 * 健康检查
 * GET /api/hitl/health
 */
router.get('/health', (_req, res) => {
  const stats = hitlManager.getStats();
  res.json({
    status: 'ok',
    service: 'human-in-the-loop',
    pending: stats.pending,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;