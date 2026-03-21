const express = require('express');
const router = express.Router();
const { mcpManager, TOOL_DEFINITIONS } = require('../mcp');

/**
 * 获取 MCP 状态
 * GET /api/mcp/status
 */
router.get('/status', (_req, res) => {
  try {
    const status = mcpManager.getStatus();
    res.json({
      success: true,
      ...status,
      builtinTools: Object.keys(TOOL_DEFINITIONS)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 列出所有可用工具
 * GET /api/mcp/tools
 */
router.get('/tools', (_req, res) => {
  try {
    const tools = mcpManager.listTools();
    res.json({ success: true, tools });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 调用工具
 * POST /api/mcp/call
 */
router.post('/call', async (req, res) => {
  const { toolName, args } = req.body;

  if (!toolName) {
    return res.status(400).json({ success: false, error: '缺少工具名称' });
  }

  try {
    const result = await mcpManager.callTool(toolName, args || {});
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 连接到 MCP 服务器
 * POST /api/mcp/connect
 */
router.post('/connect', async (req, res) => {
  const { serverName, command, args } = req.body;

  if (!serverName || !command) {
    return res.status(400).json({ success: false, error: '缺少服务器名称或命令' });
  }

  try {
    const result = await mcpManager.connectToServer(serverName, command, args || []);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 断开 MCP 服务器连接
 * POST /api/mcp/disconnect
 */
router.post('/disconnect', async (req, res) => {
  const { serverName } = req.body;

  if (!serverName) {
    return res.status(400).json({ success: false, error: '缺少服务器名称' });
  }

  try {
    const result = await mcpManager.disconnectServer(serverName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取工具分类
 * GET /api/mcp/categories
 */
router.get('/categories', (_req, res) => {
  const categories = Object.entries(TOOL_DEFINITIONS).map(([key, value]) => ({
    id: key,
    name: value.name,
    description: value.description,
    toolsCount: value.tools.length
  }));
  res.json({ success: true, categories });
});

module.exports = router;