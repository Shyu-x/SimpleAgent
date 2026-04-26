const express = require('express');
const router = express.Router();
const { mcpManager, TOOL_DEFINITIONS } = require('../mcp');
const { MCPService } = require('../services/mcp');
const fs = require('fs').promises;
const path = require('path');

/**
 * 工具注册表文件路径
 */
const TOOL_REGISTRY_PATH = path.join(__dirname, '../../data/tool-registry.json');

/**
 * MCP 服务实例
 */
const mcpService = new MCPService({ name: 'MCP Tool Service' });

/**
 * 加载工具注册表
 */
async function loadToolRegistry() {
  try {
    const data = await fs.readFile(TOOL_REGISTRY_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // 文件不存在或解析失败，返回空注册表
    return { tools: [], customTools: [] };
  }
}

/**
 * 保存工具注册表
 */
async function saveToolRegistry(registry) {
  const dir = path.dirname(TOOL_REGISTRY_PATH);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(TOOL_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (error) {
    console.error('[MCP] 保存工具注册表失败:', error.message);
  }
}

/**
 * 获取 MCP 状态
 * GET /api/mcp/status
 */
router.get('/status', (_req, res) => {
  try {
    const status = mcpManager.getStatus();
    const serviceStatus = mcpService.getStatus();
    res.json({
      success: true,
      ...status,
      serviceStats: serviceStatus,
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
router.get('/tools', async (_req, res) => {
  try {
    const discoverResult = mcpManager.discoverTools();
    const registry = await loadToolRegistry();

    // 合并内置工具和自定义工具
    const allTools = [...discoverResult.tools, ...registry.customTools.map(t => ({
      name: t.name,
      description: t.description,
      category: 'custom',
      inputSchema: t.inputSchema,
      source: 'custom'
    }))];

    res.json({
      success: true,
      tools: allTools,
      total: allTools.length,
      protocolVersion: discoverResult.protocolVersion
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个工具详情
 * GET /api/mcp/tools/:name
 */
router.get('/tools/:name', async (req, res) => {
  const { name } = req.params;

  try {
    // 先查找内置工具
    let schema = mcpManager.getToolSchema(name);

    // 再查找自定义工具
    if (!schema) {
      const registry = await loadToolRegistry();
      const customTool = registry.customTools.find(t => t.name === name);
      if (customTool) {
        schema = {
          name: customTool.name,
          description: customTool.description,
          category: 'custom',
          inputSchema: customTool.inputSchema,
          source: 'custom'
        };
      }
    }

    if (!schema) {
      return res.status(404).json({ success: false, error: `工具 ${name} 不存在` });
    }

    res.json({ success: true, tool: schema });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 注册新工具
 * POST /api/mcp/tools
 */
router.post('/tools', async (req, res) => {
  const { name, description, inputSchema, category = 'custom' } = req.body;

  // 参数验证
  if (!name || !description || !inputSchema) {
    return res.status(400).json({
      success: false,
      error: '缺少必填字段: name, description, inputSchema'
    });
  }

  // 检查工具是否已存在
  const existingSchema = mcpManager.getToolSchema(name);
  if (existingSchema) {
    return res.status(409).json({
      success: false,
      error: `工具 ${name} 已存在（内置工具）`
    });
  }

  try {
    const registry = await loadToolRegistry();

    // 检查自定义工具是否已存在
    if (registry.customTools.some(t => t.name === name)) {
      return res.status(409).json({
        success: false,
        error: `工具 ${name} 已在自定义工具中存在`
      });
    }

    // 添加新工具
    const newTool = {
      name,
      description,
      inputSchema,
      category,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    registry.customTools.push(newTool);
    await saveToolRegistry(registry);

    res.status(201).json({
      success: true,
      message: `工具 ${name} 注册成功`,
      tool: newTool
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新工具
 * PUT /api/mcp/tools/:name
 */
router.put('/tools/:name', async (req, res) => {
  const { name } = req.params;
  const { description, inputSchema, category } = req.body;

  try {
    const registry = await loadToolRegistry();
    const toolIndex = registry.customTools.findIndex(t => t.name === name);

    if (toolIndex === -1) {
      return res.status(404).json({
        success: false,
        error: `自定义工具 ${name} 不存在`
      });
    }

    // 更新工具
    const updatedTool = {
      ...registry.customTools[toolIndex],
      description: description || registry.customTools[toolIndex].description,
      inputSchema: inputSchema || registry.customTools[toolIndex].inputSchema,
      category: category || registry.customTools[toolIndex].category,
      updatedAt: new Date().toISOString()
    };

    registry.customTools[toolIndex] = updatedTool;
    await saveToolRegistry(registry);

    res.json({
      success: true,
      message: `工具 ${name} 更新成功`,
      tool: updatedTool
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除工具
 * DELETE /api/mcp/tools/:name
 */
router.delete('/tools/:name', async (req, res) => {
  const { name } = req.params;

  try {
    const registry = await loadToolRegistry();
    const toolIndex = registry.customTools.findIndex(t => t.name === name);

    if (toolIndex === -1) {
      return res.status(404).json({
        success: false,
        error: `自定义工具 ${name} 不存在`
      });
    }

    registry.customTools.splice(toolIndex, 1);
    await saveToolRegistry(registry);

    res.json({
      success: true,
      message: `工具 ${name} 删除成功`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 测试工具执行
 * POST /api/mcp/tools/:name/test
 */
router.post('/tools/:name/test', async (req, res) => {
  const { name } = req.params;
  const { args = {}, timeout = 30000 } = req.body;

  try {
    // 查找工具
    let toolSchema = mcpManager.getToolSchema(name);

    if (!toolSchema) {
      const registry = await loadToolRegistry();
      const customTool = registry.customTools.find(t => t.name === name);
      if (customTool) {
        toolSchema = {
          name: customTool.name,
          description: customTool.description,
          category: 'custom',
          inputSchema: customTool.inputSchema
        };
      }
    }

    if (!toolSchema) {
      return res.status(404).json({ success: false, error: `工具 ${name} 不存在` });
    }

    // 执行工具（使用超时保护）
    const result = await mcpService.executeWithTimeout(name, args, timeout);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'TEST_FAILED', message: error.message }
    });
  }
});

/**
 * 调用工具
 * POST /api/mcp/call
 */
router.post('/call', async (req, res) => {
  const { toolName, args, timeout = 30000 } = req.body;

  if (!toolName) {
    return res.status(400).json({ success: false, error: '缺少工具名称' });
  }

  try {
    // 使用 MCP Service 执行（带超时保护）
    const result = await mcpService.executeWithTimeout(toolName, args || {}, timeout);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'EXECUTION_FAILED', message: error.message }
    });
  }
});

/**
 * 获取执行统计
 * GET /api/mcp/stats
 */
router.get('/stats', (_req, res) => {
  try {
    const stats = mcpService.getExecutionStats();
    res.json({ success: true, stats });
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

  // 添加自定义分类
  categories.push({
    id: 'custom',
    name: 'Custom Tools',
    description: '用户自定义工具',
    toolsCount: 0
  });

  res.json({ success: true, categories });
});

module.exports = router;