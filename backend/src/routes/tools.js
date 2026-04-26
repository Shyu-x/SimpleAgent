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

module.exports = router;
