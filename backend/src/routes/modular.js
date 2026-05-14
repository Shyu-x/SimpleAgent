/**
 * 模块化架构 - 路由集成
 * =====================
 *
 * 提供模块化架构的路由端点
 *
 * @module routes/modular
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();

const moduleConfig = require('../config/module.config');
const eventBus = require('../common/event-bus');
const dataRouter = require('../config/data-isolation');
const healthCheckManager = require('../infra/monitoring/health.controller').healthCheckManager;

/**
 * GET /api/modular/modules
 * 获取所有模块配置
 */
router.get('/modules', (req, res) => {
  const modules = moduleConfig.getAllModules();
  res.json({
    success: true,
    count: modules.length,
    modules: modules.map((m) => ({
      name: m.name,
      displayName: m.displayName,
      version: m.version,
      description: m.description,
      enabled: m.enabled,
      startupPriority: m.startupPriority,
      status: moduleConfig.getModuleStatus(m.name),
      dependencies: m.dependencies,
    })),
  });
});

/**
 * GET /api/modular/modules/:name
 * 获取单个模块配置
 */
router.get('/modules/:name', (req, res) => {
  const { name } = req.params;
  const module = moduleConfig.getModule(name);

  if (!module) {
    return res.status(404).json({
      success: false,
      error: `模块 ${name} 不存在`,
    });
  }

  res.json({
    success: true,
    module: {
      ...module,
      status: moduleConfig.getModuleStatus(name),
      config: undefined, // 敏感配置不返回
    },
  });
});

/**
 * GET /api/modular/dependency-graph
 * 获取模块依赖图
 */
router.get('/dependency-graph', (req, res) => {
  const graph = moduleConfig.getDependencyGraph();
  res.json({
    success: true,
    graph,
  });
});

/**
 * POST /api/modular/modules/:name/enable
 * 启用模块
 */
router.post('/modules/:name/enable', async (req, res) => {
  const { name } = req.params;
  const success = await moduleConfig.enableModule(name);

  if (success) {
    res.json({
      success: true,
      message: `模块 ${name} 已启用`,
    });
  } else {
    res.status(400).json({
      success: false,
      error: `模块 ${name} 启用失败，请检查依赖`,
    });
  }
});

/**
 * POST /api/modular/modules/:name/disable
 * 禁用模块
 */
router.post('/modules/:name/disable', (req, res) => {
  const { name } = req.params;
  moduleConfig.disableModule(name);

  res.json({
    success: true,
    message: `模块 ${name} 已禁用`,
  });
});

/**
 * GET /api/modular/data-routing/stats
 * 获取数据路由统计
 */
router.get('/data-routing/stats', (req, res) => {
  const stats = dataRouter.getRoutingStats();
  res.json({
    success: true,
    stats,
  });
});

/**
 * GET /api/modular/data-routing/rules
 * 获取所有路由规则
 */
router.get('/data-routing/rules', (req, res) => {
  const rules = dataRouter.getAllRoutingRules();
  res.json({
    success: true,
    count: rules.length,
    rules,
  });
});

/**
 * GET /api/modular/data-routing/sharding
 * 获取所有分片策略
 */
router.get('/data-routing/sharding', (req, res) => {
  const strategies = dataRouter.getAllShardingStrategies();
  res.json({
    success: true,
    count: strategies.length,
    strategies,
  });
});

/**
 * GET /api/modular/events/stats
 * 获取事件总线统计
 */
router.get('/events/stats', (req, res) => {
  const stats = eventBus.getStats();
  res.json({
    success: true,
    stats,
  });
});

/**
 * GET /api/modular/events/history
 * 获取事件历史
 */
router.get('/events/history', (req, res) => {
  const eventType = req.query.type;
  const limit = parseInt(req.query.limit) || 100;
  const history = eventBus.getEventHistory(eventType, limit);

  res.json({
    success: true,
    count: history.length,
    history,
  });
});

/**
 * POST /api/modular/events/publish
 * 发布事件（测试用）
 */
router.post('/events/publish', (req, res) => {
  const { type, payload, source } = req.body;

  if (!type || !payload) {
    return res.status(400).json({
      success: false,
      error: '缺少必需参数: type, payload',
    });
  }

  eventBus.publish({
    type,
    payload,
    source: source || 'api',
  });

  res.json({
    success: true,
    message: `事件 ${type} 已发布`,
  });
});

/**
 * GET /api/modular/health
 * 模块化架构健康检查
 */
router.get('/health', async (req, res) => {
  try {
    const moduleHealth = moduleConfig.getHealthSummary();
    const eventBusStats = eventBus.getStats();
    const routingStats = dataRouter.getRoutingStats();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      modules: moduleHealth,
      eventBus: eventBusStats,
      dataRouting: routingStats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/modular/validate
 * 验证模块依赖关系
 */
router.post('/validate', (req, res) => {
  const result = moduleConfig.validateDependencies();

  res.json({
    success: result.valid,
    errors: result.errors,
    message: result.valid ? '依赖验证通过' : '依赖验证失败',
  });
});

/**
 * POST /api/modular/startup-order
 * 打印模块启动顺序
 */
router.post('/startup-order', (req, res) => {
  moduleConfig.logStartupOrder();

  const enabledModules = moduleConfig.getEnabledModules();

  res.json({
    success: true,
    message: '启动顺序已打印到日志',
    order: enabledModules.map((m, i) => ({
      order: i + 1,
      name: m.name,
      displayName: m.displayName,
      priority: m.startupPriority,
    })),
  });
});

module.exports = router;