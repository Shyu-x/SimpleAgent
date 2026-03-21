const express = require('express');
const router = express.Router();
const { PluginManager, PluginType, PluginStatus } = require('../services/pluginManager');

// 创建插件管理器实例
const pluginManager = new PluginManager({
  pluginsPath: process.env.PLUGINS_PATH || './plugins'
});

/**
 * 初始化插件管理器
 */
router.post('/initialize', async (req, res) => {
  try {
    await pluginManager.initialize();
    res.json({ success: true, message: 'Plugin manager initialized' });
  } catch (error) {
    console.error('Init error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 获取所有插件
 */
router.get('/plugins', (req, res) => {
  try {
    const { type, status } = req.query;
    let plugins = pluginManager.getPlugins(type);

    if (status) {
      plugins = plugins.filter(p => p.status === status);
    }

    res.json({
      success: true,
      plugins: plugins.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        description: p.description,
        version: p.version,
        status: p.status,
        author: p.author,
        loadedAt: p.loadedAt
      }))
    });
  } catch (error) {
    console.error('Get plugins error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 获取插件详情
 */
router.get('/plugins/:pluginId', (req, res) => {
  try {
    const { pluginId } = req.params;
    const plugin = pluginManager.getPlugin(pluginId);

    if (!plugin) {
      return res.status(404).json({ error: { message: 'Plugin not found' } });
    }

    res.json({
      success: true,
      plugin: {
        id: plugin.id,
        name: plugin.name,
        type: plugin.type,
        description: plugin.description,
        version: plugin.version,
        status: plugin.status,
        author: plugin.author,
        permissions: plugin.permissions,
        tool: plugin.tool ? {
          name: plugin.tool.name,
          description: plugin.tool.description,
          parameters: plugin.tool.parameters
        } : null,
        role: plugin.role,
        loadedAt: plugin.loadedAt
      }
    });
  } catch (error) {
    console.error('Get plugin error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 注册新插件
 */
router.post('/plugins', async (req, res) => {
  try {
    const { name, type, description, version, tool, role, handler, permissions, metadata } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        error: { message: 'name and type are required', type: 'validation_error' }
      });
    }

    const pluginId = await pluginManager.registerPlugin({
      id: `custom:${name.toLowerCase().replace(/\s+/g, '_')}`,
      name,
      type,
      description,
      version,
      tool,
      role,
      handler,
      permissions,
      metadata
    });

    res.json({
      success: true,
      pluginId
    });
  } catch (error) {
    console.error('Register plugin error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 启用插件
 */
router.post('/plugins/:pluginId/enable', async (req, res) => {
  try {
    const { pluginId } = req.params;
    await pluginManager.enablePlugin(pluginId);
    res.json({ success: true, message: 'Plugin enabled' });
  } catch (error) {
    console.error('Enable plugin error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 禁用插件
 */
router.post('/plugins/:pluginId/disable', async (req, res) => {
  try {
    const { pluginId } = req.params;
    await pluginManager.disablePlugin(pluginId);
    res.json({ success: true, message: 'Plugin disabled' });
  } catch (error) {
    console.error('Disable plugin error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 卸载插件
 */
router.delete('/plugins/:pluginId', async (req, res) => {
  try {
    const { pluginId } = req.params;
    await pluginManager.unloadPlugin(pluginId);
    res.json({ success: true, message: 'Plugin unloaded' });
  } catch (error) {
    console.error('Unload plugin error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 获取角色列表
 */
router.get('/roles', (req, res) => {
  try {
    const roles = pluginManager.getRoles();
    res.json({ success: true, roles });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 执行工具插件
 */
router.post('/execute/:toolName', async (req, res) => {
  try {
    const { toolName } = req.params;
    const args = req.body;

    const result = await pluginManager.executeTool(toolName, args);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Execute tool error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

module.exports = router;