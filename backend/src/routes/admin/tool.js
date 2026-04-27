/**
 * Tool 管理 API
 * 提供工具注册、配置、状态管理
 *
 * @date 2026-04-01
 *
 * @swagger
 * tags:
 *   - name: admin
 *     description: 管理后台接口
 *   - name: tools
 *     description: 工具注册管理
 */

const express = require('express');
const router = express.Router();
const AgentLogger = require('../../infra/logger/AgentLogger');

const logger = new AgentLogger('admin-tool');

/**
 * 获取工具注册表实例
 */
function getRegistry(req) {
  const registry = req.app.get('toolRegistry');
  if (!registry) {
    throw new Error('Tool registry not initialized');
  }
  return registry;
}

/**
 * GET /api/admin/tools/categories
 * 获取工具分类列表
 */
router.get('/categories', (req, res) => {
  try {
    const registry = getRegistry(req);
    const tools = registry.listTools();
    const categories = [...new Set(tools.map(t => t.category))];

    res.json({
      success: true,
      data: {
        categories: categories.map(cat => ({
          id: cat,
          name: cat,
          icon: '🛠️',
          count: tools.filter(t => t.category === cat).length
        }))
      }
    });
  } catch (error) {
    logger.error('Categories error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/tools
 * 获取工具列表
 */
router.get('/', (req, res) => {
  try {
    const registry = getRegistry(req);
    const { category, keyword } = req.query;
    let tools = registry.listTools();

    // 按分类过滤
    if (category) {
      tools = tools.filter(t => t.category === category);
    }

    // 按关键词搜索
    if (keyword) {
      const kw = keyword.toLowerCase();
      tools = tools.filter(t =>
        t.name.toLowerCase().includes(kw) ||
        t.description.toLowerCase().includes(kw) ||
        (t.keywords || []).some(k => k.toLowerCase().includes(kw))
      );
    }

    // 补充执行统计
    const toolsWithStats = tools.map(t => ({
      ...t,
      stats: registry.getToolStats(t.name)
    }));

    res.json({
      success: true,
      data: {
        tools: toolsWithStats,
        total: toolsWithStats.length,
        categories: [...new Set(tools.map(t => t.category))]
      }
    });
  } catch (error) {
    logger.error('List tools error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/tools/stats
 * 获取工具统计
 */
router.get('/stats', (req, res) => {
  try {
    const registry = getRegistry(req);
    const allStats = registry.getAllStats();
    const summary = registry.getStats();

    res.json({
      success: true,
      data: {
        summary,
        tools: allStats
      }
    });
  } catch (error) {
    logger.error('Tool stats error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/tools/:name
 * 获取工具详情
 */
router.get('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const registry = getRegistry(req);
    const tool = registry.get(name);

    if (!tool) {
      return res.status(404).json({ success: false, error: `工具 ${name} 不存在` });
    }

    res.json({
      success: true,
      data: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        category: tool.category,
        keywords: tool.keywords,
        examples: tool.examples,
        stats: registry.getToolStats(name)
      }
    });
  } catch (error) {
    logger.error('Get tool error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/tools/register
 * 注册工具
 */
router.post('/register', (req, res) => {
  try {
    const registry = getRegistry(req);
    const { name, description, parameters, category, keywords, examples, execute } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: '工具名称不能为空' });
    }

    if (registry.has(name)) {
      return res.status(409).json({ success: false, error: `工具 ${name} 已存在` });
    }

    // 构建工具对象
    const tool = {
      name,
      description: description || '',
      parameters: parameters || {},
      category: category || 'general',
      keywords: keywords || [],
      examples: examples || [],
      // 如果提供了execute函数字符串，尝试使用全局函数
      execute: typeof execute === 'function'
        ? execute
        : (typeof execute === 'string' && typeof global[execute] === 'function')
          ? global[execute]
          : null
    };

    if (!tool.execute) {
      return res.status(400).json({
        success: false,
        error: 'execute 函数必须提供（支持全局函数名或直接传递函数）'
      });
    }

    registry.register(tool);

    res.json({
      success: true,
      data: {
        name: tool.name,
        category: tool.category,
        registeredAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Register tool error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/admin/tools/:name
 * 更新工具启用状态
 */
router.patch('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const { enabled } = req.body;
    const registry = getRegistry(req);

    if (!registry.has(name)) {
      return res.status(404).json({ success: false, error: `工具 ${name} 不存在` });
    }

    const tool = registry.get(name);

    // 处理 enabled 字段
    if (enabled !== undefined) {
      tool.enabled = enabled;
    }

    res.json({
      success: true,
      data: {
        name: tool.name,
        enabled: tool.enabled,
        category: tool.category
      }
    });
  } catch (error) {
    logger.error('Patch tool error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/admin/tools/:name
 * 更新工具配置
 */
router.put('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const registry = getRegistry(req);
    const tool = registry.get(name);

    if (!tool) {
      return res.status(404).json({ success: false, error: `工具 ${name} 不存在` });
    }

    const { description, parameters, category, keywords, examples } = req.body;
    const updates = {};

    if (description !== undefined) {
      tool.description = description;
      updates.description = true;
    }
    if (parameters !== undefined) {
      tool.parameters = parameters;
      updates.parameters = true;
    }
    if (category !== undefined) {
      tool.category = category;
      updates.category = true;
    }
    if (keywords !== undefined) {
      tool.keywords = keywords;
      updates.keywords = true;
    }
    if (examples !== undefined) {
      tool.examples = examples;
      updates.examples = true;
    }

    res.json({
      success: true,
      data: {
        name,
        updates,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Update tool error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/tools/:name
 * 删除工具
 */
router.delete('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const registry = getRegistry(req);

    if (!registry.has(name)) {
      return res.status(404).json({ success: false, error: `工具 ${name} 不存在` });
    }

    registry.unregister(name);

    res.json({
      success: true,
      data: { name, unregistered: true }
    });
  } catch (error) {
    logger.error('Delete tool error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/tools/:name/test
 * 测试工具
 */
router.post('/:name/test', async (req, res) => {
  try {
    const { name } = req.params;
    const { params = {}, timeout } = req.body;
    const registry = getRegistry(req);

    if (!registry.has(name)) {
      return res.status(404).json({ success: false, error: `工具 ${name} 不存在` });
    }

    const startTime = Date.now();

    // 执行工具
    const result = await registry.executeTool(name, params, {
      timeout: timeout || undefined,
      skipValidation: false
    });

    const latency = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        name,
        params,
        latency,
        ...result
      }
    });
  } catch (error) {
    logger.error('Test tool error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/tools/categories
 * 获取所有分类列表
 */
router.get('/categories', (req, res) => {
  try {
    const registry = getRegistry(req);
    const tools = registry.listTools();
    const categories = [...new Set(tools.map(t => t.category || 'general'))];

    res.json({
      success: true,
      data: {
        categories
      }
    });
  } catch (error) {
    logger.error('Categories error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/tools/categories/list
 * 按分类获取工具列表
 */
router.get('/categories/list', (req, res) => {
  try {
    const registry = getRegistry(req);
    const tools = registry.listTools();
    const byCategory = {};

    for (const tool of tools) {
      const cat = tool.category || 'general';
      if (!byCategory[cat]) {
        byCategory[cat] = [];
      }
      byCategory[cat].push({
        name: tool.name,
        description: tool.description,
        keywords: tool.keywords,
        stats: registry.getToolStats(tool.name)
      });
    }

    res.json({
      success: true,
      data: {
        categories: Object.keys(byCategory),
        byCategory
      }
    });
  } catch (error) {
    logger.error('Categories error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/tools/recommend
 * 工具推荐测试
 */
router.post('/recommend', (req, res) => {
  try {
    const registry = getRegistry(req);
    const { query, intent } = req.body;

    if (!query && !intent) {
      return res.status(400).json({ success: false, error: 'query 或 intent 至少需要一个' });
    }

    const recommendations = registry.recommendTools({ query, intent });

    res.json({
      success: true,
      data: {
        query,
        intent,
        recommendations
      }
    });
  } catch (error) {
    logger.error('Recommend error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
