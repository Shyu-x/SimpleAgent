const express = require('express');
const router = express.Router();
const { PluginManager } = require('../services/pluginManager');
const { AgentLogger } = require('../infra/logger/AgentLogger');

const logger = new AgentLogger('plugins');

const pluginManager = new PluginManager({ pluginsPath: process.env.PLUGINS_PATH || './plugins' });
const ok = (res, data) => res.json({ success: true, ...data });
const err = (res, error, status = 500) => { logger.error('Plugin error', { error: error.message, stack: error.stack }); res.status(status).json({ error: { message: error.message } }); };
const mapPlugin = (p) => ({ id: p.id, name: p.name, type: p.type, description: p.description, version: p.version, status: p.status, author: p.author, loadedAt: p.loadedAt });

// 初始化
router.post('/initialize', async (req, res) => {
  try { await pluginManager.initialize(); ok(res, { message: 'Plugin manager initialized' }); }
  catch (error) { err(res, error); }
});

// 获取所有插件
router.get('/plugins', (req, res) => {
  try {
    let plugins = pluginManager.getPlugins(req.query.type);
    if (req.query.status) plugins = plugins.filter(p => p.status === req.query.status);
    ok(res, { plugins: plugins.map(mapPlugin) });
  } catch (error) { err(res, error); }
});

// 获取插件详情
router.get('/plugins/:pluginId', (req, res) => {
  try {
    const plugin = pluginManager.getPlugin(req.params.pluginId);
    plugin ? ok(res, {
      plugin: {
        ...mapPlugin(plugin),
        permissions: plugin.permissions,
        tool: plugin.tool ? { name: plugin.tool.name, description: plugin.tool.description, parameters: plugin.tool.parameters } : null,
        role: plugin.role
      }
    }) : err(res, new Error('Plugin not found'), 404);
  } catch (error) { err(res, error); }
});

// 注册插件
router.post('/plugins', async (req, res) => {
  try {
    const { name, type, description, version, tool, role, handler, permissions, metadata } = req.body;
    if (!name || !type) return err(res, new Error('name and type are required'), 400);
    const pluginId = await pluginManager.registerPlugin({ id: `custom:${name.toLowerCase().replace(/\s+/g, '_')}`, name, type, description, version, tool, role, handler, permissions, metadata });
    ok(res, { pluginId });
  } catch (error) { err(res, error); }
});

// 启用/禁用/卸载
router.post('/plugins/:pluginId/enable', async (req, res) => {
  try { await pluginManager.enablePlugin(req.params.pluginId); ok(res, { message: 'Plugin enabled' }); }
  catch (error) { err(res, error); }
});
router.post('/plugins/:pluginId/disable', async (req, res) => {
  try { await pluginManager.disablePlugin(req.params.pluginId); ok(res, { message: 'Plugin disabled' }); }
  catch (error) { err(res, error); }
});
router.delete('/plugins/:pluginId', async (req, res) => {
  try { await pluginManager.unloadPlugin(req.params.pluginId); ok(res, { message: 'Plugin unloaded' }); }
  catch (error) { err(res, error); }
});

// 角色列表
router.get('/roles', (req, res) => {
  try { ok(res, { roles: pluginManager.getRoles() }); }
  catch (error) { err(res, error); }
});

// 执行工具
router.post('/execute/:toolName', async (req, res) => {
  try { ok(res, { result: await pluginManager.executeTool(req.params.toolName, req.body) }); }
  catch (error) { err(res, error); }
});

module.exports = router;