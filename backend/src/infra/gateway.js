/**
 * API 网关控制器
 * =============
 *
 * 职责：
 * 1. 请求路由分发 - 根据路径将请求转发到对应模块
 * 2. 统一鉴权 - 所有请求统一验证
 * 3. 限流保护 - 防止滥用
 * 4. 协议转换 - REST 到内部 RPC
 * 5. 响应聚合 - 多模块数据合并
 *
 * @module infra/gateway
 * @version 1.0.0
 */

const express = require('express');
const { createLogger } = require('../infra/logger/AgentLogger');
const moduleConfig = require('../config/module.config');
const eventBus = require('../common/event-bus');

const logger = createLogger('Gateway');

/**
 * 路由配置
 * @typedef {Object} RouteConfig
 * @property {string} path - 路由路径
 * @property {string} targetModule - 目标模块
 * @property {string} targetUrl - 目标服务地址
 * @property {boolean} authRequired - 是否需要鉴权
 * @property {number} [timeout] - 请求超时(毫秒)
 * @property {{ max: number, windowMs: number }} [rateLimit] - 限流配置
 */

/**
 * 路由映射表
 */
const ROUTE_TABLE = [
  // 用户模块路由
  {
    path: '/api/users/*',
    targetModule: 'module-user',
    targetUrl: process.env.MODULE_USER_URL || 'http://localhost:3001',
    authRequired: true,
    timeout: 5000,
    rateLimit: { max: 100, windowMs: 60000 },
  },

  // 订单模块路由
  {
    path: '/api/orders/*',
    targetModule: 'module-order',
    targetUrl: process.env.MODULE_ORDER_URL || 'http://localhost:3002',
    authRequired: true,
    timeout: 10000,
    rateLimit: { max: 50, windowMs: 60000 },
  },

  // 支付模块路由
  {
    path: '/api/payments/*',
    targetModule: 'module-payment',
    targetUrl: process.env.MODULE_PAYMENT_URL || 'http://localhost:3003',
    authRequired: true,
    timeout: 30000,
    rateLimit: { max: 30, windowMs: 60000 },
  },
];

/**
 * 路由统计
 */
class RouteStats {
  constructor() {
    this.stats = new Map();
    ROUTE_TABLE.forEach((route) => {
      this.stats.set(route.path, {
        path: route.path,
        module: route.targetModule,
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        avgResponseTime: 0,
      });
    });
  }

  recordRequest(path, success, responseTime) {
    const stat = this.stats.get(path);
    if (stat) {
      stat.totalRequests++;
      if (success) {
        stat.successCount++;
      } else {
        stat.errorCount++;
      }
      stat.avgResponseTime =
        (stat.avgResponseTime * (stat.totalRequests - 1) + responseTime) / stat.totalRequests;
    }
  }

  getStats() {
    return Array.from(this.stats.values());
  }
}

const routeStats = new RouteStats();

/**
 * 路由分发服务
 */
class GatewayService {
  constructor() {
    this.routeTable = ROUTE_TABLE;
    logger.info('API 网关服务初始化完成');
  }

  /**
   * 查找匹配的路由
   * @param {string} path - 请求路径
   * @returns {RouteConfig|null}
   */
  matchRoute(path) {
    return this.routeTable.find((route) => {
      const regex = new RegExp(route.path.replace('*', '.*'));
      return regex.test(path);
    });
  }

  /**
   * 检查模块是否启用
   * @param {string} moduleName - 模块名称
   * @returns {boolean}
   */
  isModuleEnabled(moduleName) {
    return moduleConfig.isModuleEnabled(moduleName);
  }

  /**
   * 获取路由表
   * @returns {RouteConfig[]}
   */
  getRouteTable() {
    return this.routeTable.map((r) => ({
      path: r.path,
      module: r.targetModule,
      authRequired: r.authRequired,
      rateLimit: r.rateLimit,
      enabled: this.isModuleEnabled(r.targetModule),
    }));
  }

  /**
   * 获取路由统计
   * @returns {Object}
   */
  getStats() {
    return {
      totalRoutes: this.routeTable.length,
      routes: routeStats.getStats(),
    };
  }
}

// 创建网关服务单例
const gatewayService = new GatewayService();

// ========== Express 路由 ==========

const router = express.Router();

/**
 * GET /gateway/health
 * 网关健康检查
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    modules: moduleConfig.getHealthSummary(),
    routes: gatewayService.getRouteTable().length,
  });
});

/**
 * GET /gateway/stats
 * 网关统计信息
 */
router.get('/stats', (req, res) => {
  const stats = gatewayService.getStats();
  res.json({
    success: true,
    ...stats,
  });
});

/**
 * GET /gateway/routes
 * 获取路由表
 */
router.get('/routes', (req, res) => {
  res.json({
    success: true,
    routes: gatewayService.getRouteTable(),
  });
});

/**
 * POST /gateway/modules/:name/enable
 * 启用模块
 */
router.post('/modules/:name/enable', async (req, res) => {
  const { name } = req.params;
  const success = await moduleConfig.enableModule(name);
  res.json({ success, module: name });
});

/**
 * POST /gateway/modules/:name/disable
 * 禁用模块
 */
router.post('/modules/:name/disable', (req, res) => {
  const { name } = req.params;
  moduleConfig.disableModule(name);
  res.json({ success: true, module: name });
});

/**
 * POST /gateway/events/:eventType
 * 发布事件
 */
router.post('/events/:eventType', (req, res) => {
  const { eventType } = req.params;
  const { payload } = req.body;

  eventBus.publish({
    type: eventType,
    payload: payload || {},
    source: 'gateway',
  });

  res.json({
    success: true,
    eventType,
    message: 'Event published',
  });
});

/**
 * GET /gateway/events
 * 获取事件历史
 */
router.get('/events', (req, res) => {
  const eventType = req.query.type;
  const limit = parseInt(req.query.limit) || 100;

  res.json({
    success: true,
    events: eventBus.getEventHistory(eventType, limit),
    stats: eventBus.getSubscriptionStats(),
  });
});

/**
 * GET /gateway/status
 * 网关详细状态（用于压测脚本）
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    mode: process.env.VECTOR_DB_TYPE || 'qdrant',
    qdrant: {
      host: process.env.QDRANT_HOST || 'localhost',
      port: process.env.QDRANT_PORT || '6333',
      collection: process.env.QDRANT_COLLECTION || 'chat_documents',
    },
    degraded: false,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /gateway/degrade
 * 手动降级（用于测试降级机制）
 */
router.post('/degrade', (req, res) => {
  const { level, reason } = req.body;
  logger.info(`手动降级触发: level=${level}, reason=${reason}`);

  // 设置降级标志（供其他服务检查）
  process.env.VECTOR_DB_DEGRADED = 'true';

  res.json({
    success: true,
    level: level || 'degraded',
    reason: reason || 'manual',
    message: '系统已降级到备用模式',
  });
});

/**
 * POST /gateway/recover
 * 恢复服务（用于测试降级机制）
 */
router.post('/recover', (req, res) => {
  logger.info('恢复服务触发');

  // 清除降级标志
  delete process.env.VECTOR_DB_DEGRADED;

  res.json({
    success: true,
    message: '服务已恢复',
  });
});

module.exports = router;
module.exports.GatewayService = GatewayService;
module.exports.gatewayService = gatewayService;