const express = require('express');
const router = express.Router();
const { n8nClient, N8N_CONFIG } = require('../n8n');

/**
 * n8n 配置
 * GET /api/n8n/config
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    config: {
      baseUrl: N8N_CONFIG.baseUrl,
      hasApiKey: !!N8N_CONFIG.apiKey
    }
  });
});

/**
 * 测试 n8n 连接
 * GET /api/n8n/test
 */
router.get('/test', async (req, res) => {
  try {
    const result = await n8nClient.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取工作流列表
 * GET /api/n8n/workflows
 */
router.get('/workflows', async (req, res) => {
  try {
    const result = await n8nClient.getWorkflows();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取工作流详情
 * GET /api/n8n/workflows/:id
 */
router.get('/workflows/:id', async (req, res) => {
  try {
    const result = await n8nClient.getWorkflow(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 执行工作流
 * POST /api/n8n/execute
 */
router.post('/execute', async (req, res) => {
  const { workflowId, data } = req.body;

  if (!workflowId) {
    return res.status(400).json({ success: false, error: 'Missing workflowId' });
  }

  try {
    const result = await n8nClient.executeWorkflow(workflowId, data || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 触发 Webhook
 * POST /api/n8n/webhook
 */
router.post('/webhook', async (req, res) => {
  const { webhookUrl, data } = req.body;

  if (!webhookUrl) {
    return res.status(400).json({ success: false, error: 'Missing webhookUrl' });
  }

  try {
    const result = await n8nClient.triggerWebhook(webhookUrl, data || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取执行历史
 * GET /api/n8n/executions
 */
router.get('/executions', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await n8nClient.getExecutions(limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;