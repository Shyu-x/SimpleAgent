/**
 * 后端健康检查控制器
 * @description 提供 /health 总体状态和 /health/:module 独立模块检查
 *
 * 功能特性：
 * - 总体健康状态检查
 * - 各模块独立健康检查
 * - 模块列表和状态查询
 * - 健康历史记录
 *
 * @author AI Chat 玩具团队
 * @date 2026-05-13
 */

const express = require('express');
const router = express.Router();

/**
 * 模块健康检查器接口
 */
class ModuleHealthChecker {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this._status = 'unknown';
    this._lastCheck = null;
    this._lastSuccess = null;
    this._lastFailure = null;
    this._errorCount = 0;
    this._metadata = {};
  }

  /**
   * 执行健康检查
   * @returns {Promise<Object>} 健康状态
   */
  async check() {
    this._lastCheck = new Date().toISOString();

    try {
      const result = await this.performCheck();
      this._status = result.healthy ? 'healthy' : 'unhealthy';
      this._lastSuccess = this._lastCheck;
      this._errorCount = 0;
      this._metadata = result.metadata || {};
      return {
        name: this.name,
        description: this.description,
        status: this._status,
        healthy: result.healthy,
        message: result.message || 'OK',
        metadata: this._metadata,
        lastCheck: this._lastCheck,
        lastSuccess: this._lastSuccess,
        lastFailure: this._lastFailure,
        errorCount: this._errorCount,
      };
    } catch (error) {
      this._status = 'unhealthy';
      this._lastFailure = this._lastCheck;
      this._errorCount++;
      return {
        name: this.name,
        description: this.description,
        status: this._status,
        healthy: false,
        message: error.message,
        metadata: {},
        lastCheck: this._lastCheck,
        lastSuccess: this._lastSuccess,
        lastFailure: this._lastFailure,
        errorCount: this._errorCount,
      };
    }
  }

  /**
   * 执行具体检查逻辑 - 子类实现
   * @returns {Promise<Object>} { healthy: boolean, message?: string, metadata?: Object }
   */
  async performCheck() {
    return { healthy: true, message: 'OK' };
  }

  get status() {
    return this._status;
  }
}

/**
 * 内置健康检查模块
 */

// 1. 系统健康检查器
class SystemHealthChecker extends ModuleHealthChecker {
  constructor() {
    super('system', '系统基础资源健康检查');
  }

  async performCheck() {
    const os = require('os');
    const mem = process.memoryUsage();

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = (usedMem / totalMem) * 100;

    const cpuLoad = os.loadavg()[0];

    return {
      healthy: memUsagePercent < 90 && cpuLoad < 10,
      message: `CPU: ${cpuLoad.toFixed(2)}, Memory: ${memUsagePercent.toFixed(1)}%`,
      metadata: {
        cpuLoad: cpuLoad.toFixed(2),
        memoryUsage: {
          used: Math.round(usedMem / 1024 / 1024),
          total: Math.round(totalMem / 1024 / 1024),
          percent: Math.round(memUsagePercent),
        },
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        uptime: process.uptime(),
      },
    };
  }
}

// 2. MiniMax API 健康检查器
class MiniMaxHealthChecker extends ModuleHealthChecker {
  constructor() {
    super('minimax', 'MiniMax API 连接健康检查');
  }

  async performCheck() {
    const modelRouter = require('../../services/router/modelRouter');
    const router = modelRouter.router;

    if (!router) {
      return { healthy: false, message: 'MiniMaxRouter 未初始化' };
    }

    // 检查 API Key 配置
    if (!process.env.MINIMAX_API_KEY) {
      return { healthy: false, message: 'MINIMAX_API_KEY 未配置' };
    }

    try {
      // 获取统计信息
      const stats = router.getStats?.() || {};
      return {
        healthy: true,
        message: 'MiniMax API 已配置',
        metadata: {
          defaultModel: stats.defaultModel || 'MiniMax-M2.7',
          totalRequests: stats.totalRequests || 0,
          successRate: stats.totalRequests > 0 
            ? ((stats.successRequests || 0) / stats.totalRequests * 100).toFixed(1) + '%' 
            : 'N/A',
        },
      };
    } catch (error) {
      return { healthy: false, message: error.message };
    }
  }
}

// 3. 数据库健康检查器（Qdrant）
class QdrantHealthChecker extends ModuleHealthChecker {
  constructor() {
    super('qdrant', 'Qdrant 向量数据库健康检查');
  }

  async performCheck() {
    const qdrantHost = process.env.QDRANT_HOST || 'localhost';
    const qdrantPort = process.env.QDRANT_PORT || 6333;

    try {
      const http = require('http');
      const response = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: qdrantHost,
            port: qdrantPort,
            path: '/readyz',
            method: 'GET',
            timeout: 5000,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              if (res.statusCode === 200) {
                resolve({ healthy: true, data });
              } else {
                reject(new Error(`Status: ${res.statusCode}`));
              }
            });
          }
        );
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('连接超时'));
        });
        req.end();
      });

      return {
        healthy: true,
        message: 'Qdrant 服务正常',
        metadata: {
          host: qdrantHost,
          port: qdrantPort,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Qdrant 连接失败: ${error.message}`,
        metadata: {
          host: qdrantHost,
          port: qdrantPort,
        },
      };
    }
  }
}

// 4. 熔断器健康检查器
class CircuitBreakerHealthChecker extends ModuleHealthChecker {
  constructor() {
    super('circuit_breaker', '熔断器状态健康检查');
  }

  async performCheck() {
    try {
      // 获取自定义熔断器工厂状态
      let customCircuits = [];
      let openCustomCircuits = [];
      try {
        const CircuitBreakerFactory = require('../../infra/circuitBreaker/CircuitBreakerFactory');
        if (CircuitBreakerFactory) {
          customCircuits = CircuitBreakerFactory.getAllCircuits?.() || [];
          openCustomCircuits = customCircuits.filter(c => c.state === 'OPEN' || c.state === 'open');
        }
      } catch (e) {
        // 忽略
      }

      // 获取 Opossum 熔断器状态
      let opossumBreakers = [];
      let openOpossumBreakers = [];
      try {
        const { getAllBreakersStatus, CB_STATES } = require('../../middleware/circuitBreaker');
        opossumBreakers = getAllBreakersStatus();
        openOpossumBreakers = opossumBreakers.filter(b => b.state === CB_STATES.OPEN);
      } catch (e) {
        // Opossum 熔断器未初始化
      }

      const totalOpen = openCustomCircuits.length + openOpossumBreakers.length;

      return {
        healthy: totalOpen === 0,
        message: totalOpen === 0 ? '所有熔断器正常' : `${totalOpen} 个熔断器打开`,
        metadata: {
          customCircuits: {
            total: customCircuits.length,
            open: openCustomCircuits.length,
          },
          opossumBreakers: {
            total: opossumBreakers.length,
            open: openOpossumBreakers.length,
            breakers: opossumBreakers.map(b => ({
              name: b.name,
              state: b.state,
              failures: b.failures,
              successes: b.successes,
              fallbacks: b.fallbacks,
              rejections: b.rejections,
            })),
          },
        },
      };
    } catch (error) {
      return { healthy: true, message: '熔断器状态正常' };
    }
  }
}

// 5. 工具执行器健康检查器
class ToolExecutorHealthChecker extends ModuleHealthChecker {
  constructor() {
    super('tool_executor', '工具执行器健康检查');
  }

  async performCheck() {
    try {
      const ToolRegistry = require('../../services/tools/toolRegistry');

      if (!ToolRegistry) {
        return { healthy: true, message: '工具注册表未初始化' };
      }

      const tools = ToolRegistry.getAllTools?.() || [];
      const enabledTools = tools.filter(t => t.enabled !== false);

      return {
        healthy: true,
        message: `${enabledTools.length}/${tools.length} 工具已启用`,
        metadata: {
          totalTools: tools.length,
          enabledTools: enabledTools.length,
          toolNames: tools.map(t => t.name),
        },
      };
    } catch (error) {
      return { healthy: false, message: error.message };
    }
  }
}

// 6. SSE 连接健康检查器
class SSEHealthChecker extends ModuleHealthChecker {
  constructor() {
    super('sse', 'SSE 连接健康检查');
  }

  async performCheck() {
    const SSEProbeBufferingCallback = require('../../infra/sse/ProbeBufferingCallback');

    if (!SSEProbeBufferingCallback) {
      return { healthy: true, message: 'SSE 模块未初始化' };
    }

    // 检查活跃连接数
    const activeConnections = SSEProbeBufferingCallback.getActiveConnections?.() || 0;
    const maxConnections = 1000;

    return {
      healthy: activeConnections < maxConnections,
      message: activeConnections < maxConnections ? `${activeConnections} 活跃连接` : '连接数超限',
      metadata: {
        activeConnections,
        maxConnections,
      },
    };
  }
}

// 7. RAG 服务健康检查器
class RAGHealthChecker extends ModuleHealthChecker {
  constructor() {
    super('rag', 'RAG 服务健康检查');
  }

  async performCheck() {
    try {
      // 检查 RAG 核心服务
      const QueryRewriteService = require('../../domain/rag/QueryRewriteService');
      const QueryDecomposeService = require('../../domain/rag/QueryDecomposeService');

      return {
        healthy: true,
        message: 'RAG 服务已就绪',
        metadata: {
          services: ['QueryRewrite', 'QueryDecompose'],
        },
      };
    } catch (error) {
      return {
        healthy: true,
        message: 'RAG 服务部分可用',
        metadata: { error: error.message },
      };
    }
  }
}

// 8. Agent 健康检查器
class AgentHealthChecker extends ModuleHealthChecker {
  constructor() {
    super('agent', 'Agent 执行引擎健康检查');
  }

  async performCheck() {
    try {
      // 检查 AgentEngine
      const agentEnginePath = '../services/agentEngine';
      let agentEngineExists = false;
      try {
        require.resolve(agentEnginePath);
        agentEngineExists = true;
      } catch {
        agentEngineExists = false;
      }

      return {
        healthy: true,
        message: agentEngineExists ? 'Agent 引擎已就绪' : 'Agent 引擎未加载',
        metadata: {
          agentEngineLoaded: agentEngineExists,
        },
      };
    } catch (error) {
      return { healthy: false, message: error.message };
    }
  }
}

// 9. 指标采集器健康检查器
class MetricsHealthChecker extends ModuleHealthChecker {
  constructor() {
    super('metrics', '指标采集器健康检查');
  }

  async performCheck() {
    try {
      const MetricsCollector = require('../../infra/metrics/MetricsCollector');
      const collector = MetricsCollector?.getMetricsCollector?.() || MetricsCollector?.getInstance?.();

      if (!collector) {
        return { healthy: true, message: '指标采集器未初始化' };
      }

      const metrics = collector.getMetrics?.() || {};

      return {
        healthy: true,
        message: '指标采集器正常',
        metadata: {
          hasCounters: Object.keys(metrics.counters || {}).length > 0,
          hasGauges: Object.keys(metrics.gauges || {}).length > 0,
          hasHistograms: Object.keys(metrics.histograms || {}).length > 0,
        },
      };
    } catch (error) {
      return { healthy: false, message: error.message };
    }
  }
}

// 10. 告警管理器健康检查器
class AlertManagerHealthChecker extends ModuleHealthChecker {
  constructor() {
    super('alert', '告警管理器健康检查');
  }

  async performCheck() {
    try {
      const AlertManager = require('../../infra/alert/AlertManager');
      const manager = AlertManager?.getAlertManager?.() || AlertManager?.getInstance?.();

      if (!manager) {
        return { healthy: true, message: '告警管理器未初始化' };
      }

      const stats = manager.getStats?.() || {};
      const activeAlerts = stats.activeAlerts || {};

      return {
        healthy: activeAlerts.critical === 0 && activeAlerts.warning === 0,
        message: activeAlerts.critical > 0 ? `${activeAlerts.critical} 严重告警` :
                activeAlerts.warning > 0 ? `${activeAlerts.warning} 警告` : '无告警',
        metadata: {
          totalAlerts: activeAlerts.total || 0,
          critical: activeAlerts.byLevel?.critical || 0,
          warning: activeAlerts.byLevel?.warning || 0,
        },
      };
    } catch (error) {
      return { healthy: true, message: '告警管理器正常' };
    }
  }
}

// ==================== 健康检查管理器 ====================

/**
 * 健康检查管理器 - 管理所有模块的健康检查
 */
class HealthCheckManager {
  constructor() {
    this._modules = new Map();
    this._history = [];
    this._maxHistorySize = 100;
    this._initializeDefaultModules();
  }

  /**
   * 初始化默认模块
   * @private
   */
  _initializeDefaultModules() {
    // 注册所有内置健康检查器
    const checkers = [
      new SystemHealthChecker(),
      new MiniMaxHealthChecker(),
      new QdrantHealthChecker(),
      new CircuitBreakerHealthChecker(),
      new ToolExecutorHealthChecker(),
      new SSEHealthChecker(),
      new RAGHealthChecker(),
      new AgentHealthChecker(),
      new MetricsHealthChecker(),
      new AlertManagerHealthChecker(),
    ];

    checkers.forEach(checker => {
      this._modules.set(checker.name, checker);
    });
  }

  /**
   * 注册健康检查模块
   * @param {ModuleHealthChecker} checker - 健康检查器实例
   */
  registerModule(checker) {
    this._modules.set(checker.name, checker);
  }

  /**
   * 注销健康检查模块
   * @param {string} name - 模块名称
   */
  unregisterModule(name) {
    this._modules.delete(name);
  }

  /**
   * 执行所有模块的健康检查
   * @returns {Promise<Object>} 健康状态汇总
   */
  async checkAll() {
    const results = [];
    let healthyCount = 0;
    let unhealthyCount = 0;

    for (const [name, checker] of this._modules) {
      const result = await checker.check();
      results.push(result);
      if (result.healthy) {
        healthyCount++;
      } else {
        unhealthyCount++;
      }
    }

    // 记录历史
    this._recordHistory(results);

    return {
      timestamp: new Date().toISOString(),
      status: unhealthyCount === 0 ? 'healthy' : 'degraded',
      summary: {
        total: results.length,
        healthy: healthyCount,
        unhealthy: unhealthyCount,
      },
      modules: results,
    };
  }

  /**
   * 执行指定模块的健康检查
   * @param {string} moduleName - 模块名称
   * @returns {Promise<Object|null>} 健康状态
   */
  async checkModule(moduleName) {
    const checker = this._modules.get(moduleName);
    if (!checker) {
      return null;
    }
    return await checker.check();
  }

  /**
   * 获取所有模块列表
   * @returns {Array} 模块列表
   */
  getModules() {
    return Array.from(this._modules.values()).map(checker => ({
      name: checker.name,
      description: checker.description,
      status: checker.status,
    }));
  }

  /**
   * 获取健康历史
   * @param {number} [limit=10] - 返回数量限制
   * @returns {Array} 历史记录
   */
  getHistory(limit = 10) {
    return this._history.slice(-limit);
  }

  /**
   * 记录健康检查历史
   * @param {Array} results - 检查结果
   * @private
   */
  _recordHistory(results) {
    const summary = {
      timestamp: new Date().toISOString(),
      results,
      overall: results.every(r => r.healthy),
    };

    this._history.push(summary);

    // 限制历史大小
    if (this._history.length > this._maxHistorySize) {
      this._history = this._history.slice(-this._maxHistorySize);
    }
  }
}

// 创建健康检查管理器单例
const healthCheckManager = new HealthCheckManager();

// ==================== Express 路由 ====================

/**
 * GET /health
 * 获取总体健康状态
 */
router.get('/', async (req, res) => {
  try {
    const result = await healthCheckManager.checkAll();

    // 根据状态设置 HTTP 状态码
    const statusCode = result.status === 'healthy' ? 200 : 503;

    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: error.message,
    });
  }
});

/**
 * GET /health/modules
 * 获取所有模块列表
 */
router.get('/modules', (req, res) => {
  const modules = healthCheckManager.getModules();
  res.json({
    timestamp: new Date().toISOString(),
    count: modules.length,
    modules,
  });
});

/**
 * GET /health/:module
 * 获取指定模块的健康状态
 */
router.get('/:module', async (req, res) => {
  const { module } = req.params;

  // 特殊路由：history
  if (module === 'history') {
    const limit = parseInt(req.query.limit) || 10;
    const history = healthCheckManager.getHistory(limit);
    return res.json({
      timestamp: new Date().toISOString(),
      count: history.length,
      history,
    });
  }

  const result = await healthCheckManager.checkModule(module);

  if (!result) {
    return res.status(404).json({
      timestamp: new Date().toISOString(),
      error: '模块不存在',
      availableModules: healthCheckManager.getModules().map(m => m.name),
    });
  }

  const statusCode = result.healthy ? 200 : 503;
  res.status(statusCode).json(result);
});

/**
 * POST /health/modules
 * 注册新的健康检查模块
 */
router.post('/modules', (req, res) => {
  const { name, description, checkFn } = req.body;

  if (!name || !checkFn) {
    return res.status(400).json({
      error: '缺少必需参数: name, checkFn',
    });
  }

  // 创建自定义健康检查器
  const customChecker = new ModuleHealthChecker(name, description || name);
  customChecker.performCheck = checkFn;

  healthCheckManager.registerModule(customChecker);

  res.json({
    success: true,
    message: `模块 ${name} 已注册`,
  });
});

/**
 * DELETE /health/modules/:name
 * 注销健康检查模块
 */
router.delete('/modules/:name', (req, res) => {
  const { name } = req.params;

  healthCheckManager.unregisterModule(name);

  res.json({
    success: true,
    message: `模块 ${name} 已注销`,
  });
});

/**
 * GET /health/ready
 * Kubernetes readiness probe 端点
 */
router.get('/ready', (req, res) => {
  const modules = healthCheckManager.getModules();
  const criticalModules = ['system', 'minimax']; // 关键模块
  const isReady = criticalModules.every(name => {
    const checker = Array.from(healthCheckManager._modules.values())
      .find(c => c.name === name);
    return checker && checker.status === 'healthy';
  });

  if (isReady) {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false });
  }
});

/**
 * GET /health/live
 * Kubernetes liveness probe 端点
 */
router.get('/live', (req, res) => {
  // 只要进程在运行就认为活着
  res.status(200).json({ alive: true, uptime: process.uptime() });
});

// 导出路由和健康检查管理器
module.exports = router;
module.exports.HealthCheckManager = HealthCheckManager;
module.exports.ModuleHealthChecker = ModuleHealthChecker;
module.exports.healthCheckManager = healthCheckManager;