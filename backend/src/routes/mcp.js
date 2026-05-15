/**
 * MCP 工具管理路由
 */
const express = require('express');
const router = express.Router();
const { mcpManager, TOOL_DEFINITIONS } = require('../mcp');
const { MCPService } = require('../services/mcp');
const toolRegistryService = require('../services/toolRegistryService');
const mcpService = new MCPService({ name: 'MCP Tool Service' });
const { AppError } = require('../common/errors');
const { sendError } = require('../middleware/errorHandler');

router.get('/status', (_req, res) => {
  try { res.json({ success: true, ...mcpManager.getStatus(), serviceStats: mcpService.getStatus(), builtinTools: Object.keys(TOOL_DEFINITIONS) }); }
  catch (error) { sendError(res, 500, 6000, error.message); }
});

router.get('/tools', async (_req, res) => {
  try {
    const discoverResult = mcpManager.discoverTools();
    const customTools = await toolRegistryService.getCustomTools();
    const allTools = [...discoverResult.tools, ...customTools.map(t => ({ name: t.name, description: t.description, category: 'custom', inputSchema: t.inputSchema, source: 'custom' }))];
    res.json({ success: true, tools: allTools, total: allTools.length, protocolVersion: discoverResult.protocolVersion });
  } catch (error) { sendError(res, 500, 5100, error.message); }
});

router.get('/tools/:name', async (req, res) => {
  const { name } = req.params;
  let schema = mcpManager.getToolSchema(name);
  if (!schema) { const customTool = await toolRegistryService.findCustomTool(name); if (customTool) schema = { name: customTool.name, description: customTool.description, category: 'custom', inputSchema: customTool.inputSchema, source: 'custom' }; }
  if (!schema) return sendError(res, 404, 5001, `工具 ${name} 不存在`);
  res.json({ success: true, tool: schema });
});

router.post('/tools', async (req, res) => {
  const { name, description, inputSchema, category = 'custom' } = req.body;
  if (!name || !description || !inputSchema) return sendError(res, 400, 1001, '缺少必填字段: name, description, inputSchema');
  if (mcpManager.getToolSchema(name)) return sendError(res, 409, 5002, `工具 ${name} 已存在（内置工具）`);
  const existing = await toolRegistryService.findCustomTool(name);
  if (existing) return sendError(res, 409, 5002, `工具 ${name} 已在自定义工具中存在`);
  const newTool = { name, description, inputSchema, category, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await toolRegistryService.addTool(newTool);
  res.status(201).json({ success: true, message: `工具 ${name} 注册成功`, tool: newTool });
});

router.put('/tools/:name', async (req, res) => {
  const { name } = req.params;
  const { description, inputSchema, category } = req.body;
  const updated = await toolRegistryService.updateTool(name, { description, inputSchema, category });
  if (!updated) return sendError(res, 404, 5001, `自定义工具 ${name} 不存在`);
  res.json({ success: true, message: `工具 ${name} 更新成功`, tool: updated });
});

router.delete('/tools/:name', async (req, res) => {
  const { name } = req.params;
  const deleted = await toolRegistryService.deleteTool(name);
  if (!deleted) return sendError(res, 404, 5001, `自定义工具 ${name} 不存在`);
  res.json({ success: true, message: `工具 ${name} 删除成功` });
});

router.post('/tools/:name/test', async (req, res) => {
  const { name } = req.params;
  const { args = {}, timeout = 30000 } = req.body;
  let toolSchema = mcpManager.getToolSchema(name);
  if (!toolSchema) { const customTool = await toolRegistryService.findCustomTool(name); if (customTool) toolSchema = { name: customTool.name, description: customTool.description, category: 'custom', inputSchema: customTool.inputSchema }; }
  if (!toolSchema) return sendError(res, 404, 5001, `工具 ${name} 不存在`);
  try { const result = await mcpService.executeWithTimeout(name, args, timeout); res.json(result); }
  catch (error) { sendError(res, 500, 5003, `测试失败: ${error.message}`, { code: 'TEST_FAILED' }); }
});

router.post('/call', async (req, res) => {
  const { toolName, args, timeout = 30000 } = req.body;
  if (!toolName) return sendError(res, 400, 1001, '缺少工具名称');
  try {
    const result = await mcpManager.callTool(toolName, args || {});
    res.json({ success: result.success, tool: toolName, result: result.result, error: result.error, executionTime: 0, timestamp: new Date().toISOString() });
  } catch (error) { sendError(res, 500, 5003, `执行失败: ${error.message}`, { code: 'EXECUTION_FAILED' }); }
});

router.get('/stats', (_req, res) => { try { res.json({ success: true, stats: mcpService.getExecutionStats() }); } catch (error) { sendError(res, 500, 6000, error.message); } });

router.post('/connect', async (req, res) => {
  const { serverName, command, args } = req.body;
  if (!serverName || !command) return sendError(res, 400, 1001, '缺少服务器名称或命令');
  try { const result = await mcpManager.connectToServer(serverName, command, args || []); res.json(result); }
  catch (error) { sendError(res, 500, 5101, `连接失败: ${error.message}`); }
});

router.post('/disconnect', async (req, res) => {
  const { serverName } = req.body;
  if (!serverName) return sendError(res, 400, 1001, '缺少服务器名称');
  try { const result = await mcpManager.disconnectServer(serverName); res.json(result); }
  catch (error) { sendError(res, 500, 5100, `断开失败: ${error.message}`); }
});

router.get('/categories', (_req, res) => {
  const categories = Object.entries(TOOL_DEFINITIONS).map(([key, value]) => ({ id: key, name: value.name, description: value.description, toolsCount: value.tools.length }));
  categories.push({ id: 'custom', name: 'Custom Tools', description: '用户自定义工具', toolsCount: 0 });
  res.json({ success: true, categories });
});

module.exports = router;
