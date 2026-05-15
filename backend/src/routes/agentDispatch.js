/**
 * Agent 分发 API
 */

const express = require('express');
const router = express.Router();
const {
  DISPATCH_STRATEGIES,
  registerAgent,
  unregisterAgent,
  dispatchTask,
  onTaskComplete,
  getPoolStatus,
  getAllPresetAgents,
  getAllCapabilities
} = require('../services/agentDispatchService');

/**
 * 获取预置角色列表
 */
router.get('/roles', (req, res) => {
  const roles = getAllPresetAgents();
  res.json({
    success: true,
    data: roles,
    total: roles.length
  });
});

/**
 * 获取所有可用能力
 */
router.get('/capabilities', (req, res) => {
  const capabilities = getAllCapabilities();
  res.json({
    success: true,
    data: capabilities
  });
});

/**
 * 获取 Agent 池状态
 */
router.get('/pool/status', (req, res) => {
  res.json({
    success: true,
    data: getPoolStatus()
  });
});

/**
 * 注册 Agent
 */
router.post('/pool/register', (req, res) => {
  const { agentId, capabilities = [], metadata = {} } = req.body;
  if (!agentId) {
    return res.status(400).json({ success: false, error: 'agentId required' });
  }
  registerAgent(agentId, capabilities, metadata);
  res.json({ success: true, message: `Agent ${agentId} registered` });
});

/**
 * 注销 Agent
 */
router.post('/pool/unregister', (req, res) => {
  const { agentId } = req.body;
  if (!agentId) {
    return res.status(400).json({ success: false, error: 'agentId required' });
  }
  unregisterAgent(agentId);
  res.json({ success: true, message: `Agent ${agentId} unregistered` });
});

/**
 * 分发任务
 */
router.post('/dispatch', async (req, res) => {
  const { task, requiredCapabilities = [], strategy = 'hybrid' } = req.body;

  const result = await dispatchTask({
    task,
    timestamp: Date.now()
  }, {
    requiredCapabilities,
    strategy: DISPATCH_STRATEGIES[strategy.toUpperCase()] || DISPATCH_STRATEGIES.HYBRID
  });

  res.json(result);
});

/**
 * 任务完成
 */
router.post('/complete/:agentId', (req, res) => {
  const { agentId } = req.params;
  onTaskComplete(agentId);
  res.json({ success: true });
});

module.exports = router;