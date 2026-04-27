/**
 * HITL 人机协作确认路由
 * 业务逻辑已迁移至 services/hitl/HitlService.js
 */

const express = require('express');
const router = express.Router();
const hitlService = require('../services/hitl/HitlService');
const { validateBody, validateParams, validateQuery } = require('../common/middleware/validate');
const {
  createCheckpointSchema,
  getCheckpointSchema,
  approveCheckpointSchema,
  rejectCheckpointSchema,
  waitCheckpointSchema,
  historySchema
} = require('../schemas/hitl');

// POST /api/hitl/checkpoint - 创建检查点
router.post('/checkpoint', validateBody(createCheckpointSchema), (req, res) => {
  const result = hitlService.createCheckpoint(req.body);
  res.status(result.success ? 200 : 400).json(result);
});

// GET /api/hitl/pending - 获取待处理检查点列表
router.get('/pending', (_req, res) => {
  res.json(hitlService.getPendingCheckpoints());
});

// GET /api/hitl/checkpoint/:id - 获取检查点详情
router.get('/checkpoint/:id', validateParams(getCheckpointSchema), (req, res) => {
  const result = hitlService.getCheckpoint(req.params.id);
  res.status(result.success ? 200 : 404).json(result);
});

// POST /api/hitl/checkpoint/:id/approve - 批准检查点
router.post('/checkpoint/:id/approve',
  validateParams(getCheckpointSchema),
  validateBody(approveCheckpointSchema),
  (req, res) => {
    const { option, comment, userId } = req.body;
    const result = hitlService.approveCheckpoint(req.params.id, option, userId, comment);
    res.status(result.success ? 200 : 500).json(result);
  }
);

// POST /api/hitl/checkpoint/:id/reject - 拒绝检查点
router.post('/checkpoint/:id/reject',
  validateParams(getCheckpointSchema),
  validateBody(rejectCheckpointSchema),
  (req, res) => {
    const { reason, userId } = req.body;
    const result = hitlService.rejectCheckpoint(req.params.id, reason, userId);
    res.status(result.success ? 200 : 500).json(result);
  }
);

// POST /api/hitl/checkpoint/:id/wait - 等待检查点响应
router.post('/checkpoint/:id/wait',
  validateParams(getCheckpointSchema),
  validateBody(waitCheckpointSchema),
  async (req, res) => {
    try {
      const result = await hitlService.waitForCheckpoint(req.params.id, req.body.timeout);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// POST /api/hitl/request - 创建确认请求
router.post('/request', validateBody(createCheckpointSchema), async (req, res) => {
  try {
    const result = await hitlService.requestConfirmationWithTimeout(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/hitl/confirm - 创建并等待确认（一次性操作）
router.post('/confirm', validateBody(createCheckpointSchema), async (req, res) => {
  try {
    const result = await hitlService.requestConfirmation(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/hitl/history - 获取历史记录
router.get('/history', validateQuery(historySchema), (req, res) => {
  res.json(hitlService.getHistory(req.query.limit));
});

// GET /api/hitl/stats - 获取统计信息
router.get('/stats', (_req, res) => {
  res.json(hitlService.getStats());
});

// POST /api/hitl/clear - 清除所有待处理检查点
router.post('/clear', (_req, res) => {
  res.json(hitlService.clearPending());
});

// GET /api/hitl/types - 获取检查点类型
router.get('/types', (_req, res) => {
  res.json(hitlService.getTypes());
});

// GET /api/hitl/health - 健康检查
router.get('/health', (_req, res) => {
  res.json(hitlService.healthCheck());
});

// GET /api/hitl/status - 状态检查（/health 的别名）
router.get('/status', (_req, res) => {
  res.json(hitlService.healthCheck());
});

// GET /api/hitl/sse - SSE 连接
router.get('/sse', (req, res) => {
  hitlService.setupSSEConnection(req, res);
});

module.exports = router;
