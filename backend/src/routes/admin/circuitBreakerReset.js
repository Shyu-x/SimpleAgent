/**
 * 熔断器管理路由
 * 提供熔断器状态查看和重置功能
 */
const express = require('express');
const router = express.Router();
const { AgentLogger } = require('../../infra/logger/AgentLogger');

const logger = new AgentLogger('circuit-breaker-reset');

// 引入各模块的熔断器
const { getAllBreakersStatus, resetAllBreakers } = require('../../middleware/circuitBreaker');
const { breakerFactory } = require('../../common/CircuitBreaker');
const { resetMultiModelRouter, getMultiModelRouter } = require('../../services/router/MultiModelRouter');

/**
 * GET /api/admin/circuit-breakers/status
 * 获取所有熔断器状态
 */
router.get('/status', (req, res) => {
  try {
    const middlewareBreakers = getAllBreakersStatus();
    const commonBreakers = breakerFactory.getAllStates();
    const multiModelRouter = getMultiModelRouter();
    const multiModelStatus = multiModelRouter.getStatus();

    res.json({
      success: true,
      data: {
        middleware: middlewareBreakers,
        common: commonBreakers,
        multiModelRouter: {
          state: multiModelStatus.state,
          circuits: multiModelStatus.circuits
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get circuit breaker status', { error: error.message });
    res.status(500).json({
      success: false,
      error: { message: '获取熔断器状态失败: ' + error.message }
    });
  }
});

/**
 * POST /api/admin/circuit-breakers/reset
 * 重置所有熔断器
 */
router.post('/reset', (req, res) => {
  try {
    logger.info('Resetting all circuit breakers...');

    // 重置 middleware 熔断器
    resetAllBreakers();

    // 重置 common 熔断器
    breakerFactory.resetAll();

    // 重置 MultiModelRouter 熔断器
    const multiModelRouter = getMultiModelRouter();
    multiModelRouter.resetAllCircuits();

    logger.info('All circuit breakers reset successfully');

    res.json({
      success: true,
      message: '所有熔断器已重置',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to reset circuit breakers', { error: error.message });
    res.status(500).json({
      success: false,
      error: { message: '重置熔断器失败: ' + error.message }
    });
  }
});

/**
 * POST /api/admin/circuit-breakers/reset/:name
 * 重置指定名称的熔断器
 */
router.post('/reset/:name', (req, res) => {
  try {
    const { name } = req.params;
    logger.info(`Resetting circuit breaker: ${name}`);

    // 在 MultiModelRouter 中重置指定模型
    const multiModelRouter = getMultiModelRouter();
    if (name.startsWith('model_')) {
      const modelId = name.replace('model_', '');
      multiModelRouter.resetCircuit(modelId);
    }

    res.json({
      success: true,
      message: `熔断器 ${name} 已重置`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to reset circuit breaker', { error: error.message });
    res.status(500).json({
      success: false,
      error: { message: '重置熔断器失败: ' + error.message }
    });
  }
});

module.exports = router;
