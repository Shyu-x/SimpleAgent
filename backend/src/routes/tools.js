const express = require('express');
const router = express.Router();

/**
 * 获取工具注册表列表
 * GET /api/tools
 */
router.get('/', (req, res) => {
  try {
    const registry = req.app.get('toolRegistry');
    if (!registry) {
      return res.status(503).json({ success: false, error: 'Tool registry not initialized' });
    }
    const tools = registry.listTools();
    res.json({
      success: true,
      tools: tools,
      total: tools.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 执行工具
 * POST /api/tools/execute
 */
router.post('/execute', async (req, res) => {
  try {
    const registry = req.app.get('toolRegistry');
    if (!registry) {
      return res.status(503).json({ success: false, error: 'Tool registry not initialized' });
    }

    const { tool: toolName, params, options } = req.body;
    if (!toolName) {
      return res.status(400).json({ success: false, error: 'Missing tool name' });
    }

    const result = await registry.executeTool(toolName, params || {}, options || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 批量执行工具
 * POST /api/tools/execute/batch
 */
router.post('/execute/batch', async (req, res) => {
  try {
    const registry = req.app.get('toolRegistry');
    if (!registry) {
      return res.status(503).json({ success: false, error: 'Tool registry not initialized' });
    }

    const { tools } = req.body;
    if (!tools || !Array.isArray(tools)) {
      return res.status(400).json({ success: false, error: 'Missing tools array' });
    }

    const results = await registry.executeTools(tools);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取工具执行统计
 * GET /api/tools/stats/:toolName
 */
router.get('/stats/:toolName', (req, res) => {
  try {
    const registry = req.app.get('toolRegistry');
    if (!registry) {
      return res.status(503).json({ success: false, error: 'Tool registry not initialized' });
    }

    const stats = registry.getToolStats(req.params.toolName);
    if (!stats) {
      return res.status(404).json({ success: false, error: 'Tool not found' });
    }

    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
