/**
 * MiniMax MCP 路由
 * 提供 MiniMax 图像生成、语音合成、MCP Server 连接功能
 */

const express = require('express');
const router = express.Router();
const { mcpManager } = require('../mcp');
const miniMaxService = require('../services/miniMaxService');

// MCP Server 连接状态
let mcpConnection = { connected: false, serverName: null, tools: [], error: null };

/**
 * POST /api/minimax/image
 * MiniMax 图像生成
 */
router.post('/image', async (req, res) => {
  const { prompt, aspect_ratio = '1:1', apiKey } = req.body;
  if (!prompt) {
    return res.status(400).json({ success: false, error: { message: 'prompt 参数必填' } });
  }
  try {
    const result = await miniMaxService.generateImage(prompt, aspect_ratio, apiKey);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: { message: `图像生成失败: ${error.message}` } });
  }
});

/**
 * POST /api/minimax/tts
 * MiniMax 语音合成
 */
router.post('/tts', async (req, res) => {
  const { text, voice_id = 'male-qn-qingse', apiKey } = req.body;
  if (!text) {
    return res.status(400).json({ success: false, error: { message: 'text 参数必填' } });
  }
  try {
    const result = await miniMaxService.synthesizeSpeech(text, voice_id, apiKey);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: { message: `语音合成失败: ${error.message}` } });
  }
});

/**
 * POST /api/minimax/connect
 * 连接 MiniMax MCP Server
 */
router.post('/connect', async (req, res) => {
  if (mcpConnection.connected && mcpConnection.serverName) {
    try { await mcpManager.disconnectFromServer(mcpConnection.serverName); } catch (e) { /* ignore */ }
  }

  const { apiKey, apiHost } = req.body;
  const key = apiKey || process.env.MINIMAX_API_KEY;
  const host = apiHost || process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com';

  if (!key) {
    return res.status(400).json({ success: false, error: { message: 'MiniMax API Key 未配置' } });
  }

  const serverName = 'minimax';
  try {
    await mcpManager.connectToServer(serverName, 'npx', ['-y', 'minimax-mcp-js']);

    const tools = [];
    for (const [name, tool] of mcpManager.tools) {
      if (tool.serverName === serverName) {
        tools.push({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema });
      }
    }

    mcpConnection = { connected: true, serverName, tools, error: null };
    res.json({ success: true, message: 'MiniMax MCP Server 连接成功', server_name: serverName, tools_count: tools.length, tools: tools.map(t => t.name) });
  } catch (error) {
    mcpConnection = { connected: false, serverName: null, tools: [], error: error.message };
    res.status(500).json({ success: false, error: { message: `MCP Server 连接失败: ${error.message}` } });
  }
});

/**
 * GET /api/minimax/status
 * 获取 MCP 连接状态
 */
router.get('/status', (_req, res) => {
  const registeredTools = [];
  for (const [name, tool] of mcpManager.tools) {
    if (tool.serverName === 'minimax' || tool.category === 'minimax') {
      registeredTools.push({ name: tool.name, description: tool.description });
    }
  }
  res.json({
    success: true,
    mcp_server: { connected: mcpConnection.connected, server_name: mcpConnection.serverName, tools_count: registeredTools.length, error: mcpConnection.error },
    registered_tools: registeredTools,
    api_config: { api_host: process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com', has_api_key: !!process.env.MINIMAX_API_KEY }
  });
});

/**
 * POST /api/minimax/disconnect
 * 断开 MCP Server 连接
 */
router.post('/disconnect', async (_req, res) => {
  if (!mcpConnection.connected || !mcpConnection.serverName) {
    return res.json({ success: true, message: '未连接到 MiniMax MCP Server' });
  }
  try {
    await mcpManager.disconnectFromServer(mcpConnection.serverName);
    mcpConnection = { connected: false, serverName: null, tools: [], error: null };
    res.json({ success: true, message: '已断开 MiniMax MCP Server 连接' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: `断开连接失败: ${error.message}` } });
  }
});

module.exports = router;
