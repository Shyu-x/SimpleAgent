/**
 * MCP 工具管理路由
 * 提供工具注册、查询、执行接口
 */

const express = require('express');
const router = express.Router();
const { mcpManager, TOOL_DEFINITIONS } = require('../mcp');
const { MCPService } = require('../services/mcp');
const toolRegistryService = require('../services/toolRegistryService');

const mcpService = new MCPService({ name: 'MCP Tool Service' });

/** GET /api/mcp/status */
router.get('/status', (_req, res) => {
  try {
    res.json({ success: true, ...mcpManager.getStatus(), serviceStats: mcpService.getStatus(), builtinTools: Object.keys(TOOL_DEFINITIONS) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** GET /api/mcp/tools */
router.get('/tools', async (_req, res) => {
  try {
    const discoverResult = mcpManager.discoverTools();
    const customTools = await toolRegistryService.getCustomTools();
    const allTools = [...discoverResult.tools, ...customTools.map(t => ({ name: t.name, description: t.description, category: 'custom', inputSchema: t.inputSchema, source: 'custom' }))];
    res.json({ success: true, tools: allTools, total: allTools.length, protocolVersion: discoverResult.protocolVersion });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** GET /api/mcp/tools/:name */
router.get('/tools/:name', async (req, res) => {
  const { name } = req.params;
  let schema = mcpManager.getToolSchema(name);
  if (!schema) {
    const customTool = await toolRegistryService.findCustomTool(name);
    if (customTool) schema = { name: customTool.name, description: customTool.description, category: 'custom', inputSchema: customTool.inputSchema, source: 'custom' };
  }
  if (!schema) return res.status(404).json({ success: false, error: `工具 ${name} 不存在` });
  res.json({ success: true, tool: schema });
});

/** POST /api/mcp/tools */
router.post('/tools', async (req, res) => {
  const { name, description, inputSchema, category = 'custom' } = req.body;
  if (!name || !description || !inputSchema) return res.status(400).json({ success: false, error: '缺少必填字段: name, description, inputSchema' });
  if (mcpManager.getToolSchema(name)) return res.status(409).json({ success: false, error: `工具 ${name} 已存在（内置工具）` });
  const existing = await toolRegistryService.findCustomTool(name);
  if (existing) return res.status(409).json({ success: false, error: `工具 ${name} 已在自定义工具中存在` });

  const newTool = { name, description, inputSchema, category, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await toolRegistryService.addTool(newTool);
  res.status(201).json({ success: true, message: `工具 ${name} 注册成功`, tool: newTool });
});

/** PUT /api/mcp/tools/:name */
router.put('/tools/:name', async (req, res) => {
  const { name } = req.params;
  const { description, inputSchema, category } = req.body;
  const updated = await toolRegistryService.updateTool(name, { description, inputSchema, category });
  if (!updated) return res.status(404).json({ success: false, error: `自定义工具 ${name} 不存在` });
  res.json({ success: true, message: `工具 ${name} 更新成功`, tool: updated });
});

/** DELETE /api/mcp/tools/:name */
router.delete('/tools/:name', async (req, res) => {
  const { name } = req.params;
  const deleted = await toolRegistryService.deleteTool(name);
  if (!deleted) return res.status(404).json({ success: false, error: `自定义工具 ${name} 不存在` });
  res.json({ success: true, message: `工具 ${name} 删除成功` });
});

/** POST /api/mcp/tools/:name/test */
router.post('/tools/:name/test', async (req, res) => {
  const { name } = req.params;
  const { args = {}, timeout = 30000 } = req.body;
  let toolSchema = mcpManager.getToolSchema(name);
  if (!toolSchema) {
    const customTool = await toolRegistryService.findCustomTool(name);
    if (customTool) toolSchema = { name: customTool.name, description: customTool.description, category: 'custom', inputSchema: customTool.inputSchema };
  }
  if (!toolSchema) return res.status(404).json({ success: false, error: `工具 ${name} 不存在` });
  try {
    const result = await mcpService.executeWithTimeout(name, args, timeout);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'TEST_FAILED', message: error.message } });
  }
});

/** POST /api/mcp/call */
router.post('/call', async (req, res) => {
  const { toolName, args, timeout = 30000 } = req.body;
  if (!toolName) return res.status(400).json({ success: false, error: '缺少工具名称' });
  try {
    const result = await mcpService.executeWithTimeout(toolName, args || {}, timeout);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'EXECUTION_FAILED', message: error.message } });
  }
});

/** GET /api/mcp/stats */
router.get('/stats', (_req, res) => {
  try { res.json({ success: true, stats: mcpService.getExecutionStats() }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

/** POST /api/mcp/connect */
router.post('/connect', async (req, res) => {
  const { serverName, command, args } = req.body;
  if (!serverName || !command) return res.status(400).json({ success: false, error: '缺少服务器名称或命令' });
  try {
    const result = await mcpManager.connectToServer(serverName, command, args || []);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** POST /api/mcp/disconnect */
router.post('/disconnect', async (req, res) => {
  const { serverName } = req.body;
  if (!serverName) return res.status(400).json({ success: false, error: '缺少服务器名称' });
  try {
    const result = await mcpManager.disconnectServer(serverName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** GET /api/mcp/categories */
router.get('/categories', (_req, res) => {
  const categories = Object.entries(TOOL_DEFINITIONS).map(([key, value]) => ({ id: key, name: value.name, description: value.description, toolsCount: value.tools.length }));
  categories.push({ id: 'custom', name: 'Custom Tools', description: '用户自定义工具', toolsCount: 0 });
  res.json({ success: true, categories });
});

module.exports = router;
