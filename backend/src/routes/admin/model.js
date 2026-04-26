/**
 * 模型管理 API
 * 提供模型配置、健康检查、路由策略管理
 *
 * @date 2026-04-01
 *
 * @swagger
 * tags:
 *   - name: admin
 *     description: 管理后台接口
 *   - name: models
 *     description: 模型配置管理
 */

const express = require('express');
const router = express.Router();
const { MiniMaxRouter, MINIMAX_MODELS, DEFAULT_MODEL } = require('../../services/router/modelRouter');
const { MiniMaxChatModelClient } = require('../../domain/model/ChatModelClient');
const { breakerFactory } = require('../../common/CircuitBreaker');

// 单例路由器
let modelRouter = null;

/**
 * 获取路由器实例
 */
function getRouter() {
  if (!modelRouter) {
    modelRouter = new MiniMaxRouter();
  }
  return modelRouter;
}

/**
 * GET /api/admin/models
 * 获取模型列表
 */
router.get('/', (req, res) => {
  try {
    const router = getRouter();
    const models = router.getAvailableModels();

    // 转换为前端期望的格式
    const modelsWithStats = models.map(model => ({
      id: model.id,
      name: model.name,
      provider: 'minimax',
      model: model.model,
      enabled: true,
      priority: model.priority || 0,
      maxTokens: model.maxTokens || 100000,
      timeout: model.timeout || 30000,
      maxConcurrent: model.maxConcurrent || 10,
      healthStatus: 'unknown',
      stats: {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        avgLatency: 0,
        p50Latency: 0,
        p99Latency: 0,
        totalTokens: 0
      },
      circuitBreaker: {
        state: 'closed',
        failureCount: 0,
        lastFailure: null,
        recoveryTimeout: 30000
      }
    }));

    res.json({
      success: true,
      data: {
        models: modelsWithStats,
        total: modelsWithStats.length,
        defaultModel: router.defaultModel
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/models/stats
 * 获取模型统计
 */
router.get('/stats', (req, res) => {
  try {
    const router = getRouter();
    const stats = router.getStats();

    // 获取熔断器状态
    const circuitBreakerStates = {};
    for (const [modelId, config] of Object.entries(MINIMAX_MODELS)) {
      const breaker = breakerFactory.get(`model_${modelId}`, {
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 30000
      });
      circuitBreakerStates[modelId] = {
        state: breaker.state || 'CLOSED',
        failures: breaker.failures || 0,
        successes: breaker.successes || 0
      };
    }

    // 返回前端期望的格式
    const response = {
      totalRequests: stats.totalRequests || 0,
      totalTokens: stats.totalTokens || 0,
      avgLatency: stats.avgLatency || 0,
      successRate: stats.successRate || 0,
      topModels: stats.topModels || [],
      circuitBreakers: circuitBreakerStates
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/models/:name
 * 获取指定模型详情
 */
router.get('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const modelConfig = MINIMAX_MODELS[name];

    if (!modelConfig) {
      return res.status(404).json({
        success: false,
        error: `模型 ${name} 不存在`
      });
    }

    // 获取熔断器状态
    const breaker = breakerFactory.get(`model_${name}`, {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 30000
    });

    res.json({
      success: true,
      data: {
        id: name,
        ...modelConfig,
        circuitBreaker: {
          state: breaker.state || 'CLOSED',
          failures: breaker.failures || 0,
          successes: breaker.successes || 0,
          lastFailure: breaker.lastFailure || null
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/admin/models/:name
 * 更新模型配置
 */
router.put('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const { defaultModel, enabled } = req.body;

    if (!MINIMAX_MODELS[name]) {
      return res.status(404).json({
        success: false,
        error: `模型 ${name} 不存在`
      });
    }

    const router = getRouter();

    // 设置默认模型
    if (defaultModel !== undefined && MINIMAX_MODELS[defaultModel]) {
      router.defaultModel = defaultModel;
    }

    // 重置熔断器
    if (req.body.resetCircuit) {
      const breaker = breakerFactory.get(`model_${name}`, {
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 30000
      });
      breaker.reset && breaker.reset();
    }

    res.json({
      success: true,
      data: {
        id: name,
        updated: {
          defaultModel: router.defaultModel,
          resetCircuit: !!req.body.resetCircuit
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/admin/models/:name
 * 更新模型启用状态
 */
router.patch('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const { enabled } = req.body;

    if (!MINIMAX_MODELS[name]) {
      return res.status(404).json({
        success: false,
        error: `模型 ${name} 不存在`
      });
    }

    res.json({
      success: true,
      data: {
        id: name,
        enabled: enabled !== undefined ? enabled : true
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/models/:name/circuit-breaker
 * 重置熔断器
 */
router.post('/:name/circuit-breaker', (req, res) => {
  try {
    const { name } = req.params;

    if (!MINIMAX_MODELS[name]) {
      return res.status(404).json({
        success: false,
        error: `模型 ${name} 不存在`
      });
    }

    const breaker = breakerFactory.get(`model_${name}`, {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 30000
    });
    breaker.reset && breaker.reset();

    res.json({
      success: true,
      data: {
        id: name,
        circuitBreaker: {
          state: 'closed',
          failureCount: 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/models/:name/health
 * 健康检查
 */
router.post('/:name/health', async (req, res) => {
  try {
    const { name } = req.params;

    if (!MINIMAX_MODELS[name]) {
      return res.status(404).json({
        success: false,
        error: `模型 ${name} 不存在`
      });
    }

    // 创建临时客户端进行健康检查
    const client = new MiniMaxChatModelClient({ model: name });
    const startTime = Date.now();

    let healthy = false;
    let error = null;
    let latency = 0;

    try {
      healthy = await client.healthCheck();
      latency = Date.now() - startTime;
    } catch (err) {
      error = err.message;
      latency = Date.now() - startTime;
    }

    res.json({
      success: true,
      data: {
        model: name,
        healthy,
        latency,
        error,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/models/health-all
 * 批量健康检查
 */
router.post('/health-all', async (req, res) => {
  try {
    const results = [];
    const startTime = Date.now();

    for (const [modelId, config] of Object.entries(MINIMAX_MODELS)) {
      const client = new MiniMaxChatModelClient({ model: modelId });
      const modelStart = Date.now();

      let healthy = false;
      let error = null;

      try {
        healthy = await client.healthCheck();
      } catch (err) {
        error = err.message;
      }

      results.push({
        model: modelId,
        name: config.name,
        healthy,
        latency: Date.now() - modelStart,
        error
      });
    }

    res.json({
      success: true,
      data: {
        results,
        totalLatency: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
