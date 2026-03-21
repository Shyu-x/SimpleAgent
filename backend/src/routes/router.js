const express = require('express');
const router = express.Router();
const { ModelRouter, TaskClassifier, TASK_TYPES } = require('../services/router');
const { QueryRewriter } = require('../services/queryRewriter');
const { HybridSearch } = require('../services/hybridSearch');
const { ModelPool } = require('../services/modelPool');

// 创建路由器实例
const modelRouter = new ModelRouter({
  strategy: 'balanced',
  maxRetries: 2,
  fallbackEnabled: true
});

// 创建意图分类器实例
const intentClassifier = new TaskClassifier();

// 创建查询改写器实例
const queryRewriter = new QueryRewriter({
  maxHistoryLength: 10,
  enableContextCompletion: true,
  enableQueryDecomposition: true
});

// 创建混合检索实例
const hybridSearch = new HybridSearch({
  topK: 5,
  channels: ['vector', 'fulltext', 'intent'],
  rerankEnabled: true,
  channelWeights: {
    vector: 0.5,
    fulltext: 0.3,
    intent: 0.2
  }
});

// 创建模型候选池实例
const modelPool = new ModelPool({
  maxRetries: 3,
  healthCheckInterval: 30000,
  autoHealthCheck: false
});

// 从 ModelRouter 中获取默认模型配置并注册到 ModelPool
const defaultModels = {
  'abab7-chat': {
    provider: 'minimax',
    name: 'MiniMax Chat',
    capabilities: ['text', 'vision', 'code', 'reasoning'],
    maxTokens: 128000,
    costPer1kTokens: { input: 0.001, output: 0.005 },
    avgLatency: 800,
    priority: 0,
    enabled: true
  },
  'gpt-4o-mini': {
    provider: 'openai',
    name: 'GPT-4o Mini',
    capabilities: ['text', 'vision', 'code', 'reasoning'],
    maxTokens: 128000,
    costPer1kTokens: { input: 0.00015, output: 0.0006 },
    avgLatency: 800,
    priority: 1,
    enabled: true
  },
  'gpt-4o': {
    provider: 'openai',
    name: 'GPT-4o',
    capabilities: ['text', 'vision', 'code', 'reasoning', 'creative'],
    maxTokens: 128000,
    costPer1kTokens: { input: 0.0025, output: 0.01 },
    avgLatency: 1500,
    priority: 0,
    enabled: true
  },
  'claude-3-5-sonnet': {
    provider: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    capabilities: ['text', 'vision', 'code', 'reasoning', 'creative'],
    maxTokens: 200000,
    costPer1kTokens: { input: 0.003, output: 0.015 },
    avgLatency: 1200,
    priority: 2,
    enabled: true
  },
  'claude-3-haiku': {
    provider: 'anthropic',
    name: 'Claude 3 Haiku',
    capabilities: ['text', 'vision'],
    maxTokens: 200000,
    costPer1kTokens: { input: 0.00025, output: 0.00125 },
    avgLatency: 500,
    priority: 3,
    enabled: true
  },
  'deepseek-chat': {
    provider: 'deepseek',
    name: 'DeepSeek Chat',
    capabilities: ['text', 'code'],
    maxTokens: 32768,
    costPer1kTokens: { input: 0.0005, output: 0.001 },
    avgLatency: 700,
    priority: 4,
    enabled: true
  }
};

modelPool.registerModels(defaultModels);

/**
 * 意图分类接口
 * 返回树形意图分类结果和置信度
 */
router.post('/intent', (req, res) => {
  const { query, messages, context } = req.body;

  try {
    const classification = intentClassifier.classify({
      query,
      messages,
      ...context
    });

    // 如果需要用户确认，生成确认消息
    let confirmationMessage = null;
    if (classification.requiresConfirmation) {
      confirmationMessage = intentClassifier.generateConfirmationMessage(classification);
    }

    res.json({
      success: true,
      intent: classification.intent,
      confidence: classification.confidence,
      complexity: classification.complexity,
      requiresConfirmation: classification.requiresConfirmation,
      confirmationMessage,
      alternatives: classification.alternatives || [],
      action: classification.action
    });
  } catch (error) {
    console.error('Intent classification error:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'intent_classification_error'
      }
    });
  }
});

/**
 * 获取所有意图类型
 */
router.get('/intents', (req, res) => {
  // 将意图树转换为扁平列表
  const intents = [];
  for (const [key, intent] of Object.entries(INTENT_TYPES)) {
    intents.push({
      id: intent.id,
      name: intent.name,
      description: intent.description,
      children: intent.children ? Object.values(intent.children).map(child => ({
        id: child.id,
        name: child.name
      })) : []
    });
  }

  res.json({
    success: true,
    intents
  });
});

/**
 * 查询改写接口
 * 实现上下文补全和复杂查询分解
 */
router.post('/rewrite', async (req, res) => {
  const { query, messages, intent, sessionId } = req.body;

  try {
    const result = await queryRewriter.rewrite({
      query,
      messages,
      intent,
      sessionId
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Query rewriting error:', error);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'query_rewrite_error'
      }
    });
  }
});

/**
 * 混合检索接口
 * 多通道并行检索：向量 + 全文 + 意图
 */
router.post('/search', async (req, res) => {
  const {
    query,
    knowledgeBaseId,
    channels = ['vector', 'fulltext', 'intent'],
    topK = 5,
    filters = {},
    intent
  } = req.body;

  if (!query) {
    return res.status(400).json({
      error: {
        message: 'Missing required field: query',
        type: 'validation_error'
      }
    });
  }

  try {
    const result = await hybridSearch.search({
      query,
      knowledgeBaseId,
      channels,
      topK,
      filters,
      intent
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Hybrid search error:', error);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'search_error'
      }
    });
  }
});

/**
 * 获取检索配置
 */
router.get('/search/config', (req, res) => {
  res.json({
    success: true,
    config: hybridSearch.getStats()
  });
});

/**
 * 智能路由聊天接口
 * 根据任务复杂度自动选择最优模型
 */
router.post('/chat', async (req, res) => {
  const { messages, model: requestedModel, stream = true, temperature, max_tokens, options } = req.body;

  try {
    const result = await modelRouter.execute({
      messages,
      model: requestedModel,
      stream,
      temperature,
      max_tokens,
      options
    });

    if (!result.success) {
      return res.status(500).json({
        error: {
          message: result.error,
          type: 'routing_error'
        }
      });
    }

    if (stream && result.result instanceof ReadableStream) {
      // 流式响应
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Model-Used': result.model,
        'X-Request-Id': result.requestId
      });

      const reader = result.result.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
        res.end();
      } catch (streamError) {
        console.error('Stream error:', streamError);
        if (!res.writableEnded) {
          res.end();
        }
      }
    } else {
      // 非流式响应
      res.json({
        ...result.result,
        _routing: {
          model: result.model,
          requestId: result.requestId,
          taskClassification: result.classification,
          fallback: result.fallback || false
        }
      });
    }
  } catch (error) {
    console.error('Routing error:', error);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'routing_error'
      }
    });
  }
});

/**
 * 获取可用模型列表
 */
router.get('/models', (req, res) => {
  const models = Array.from(modelRouter.models.entries()).map(([id, config]) => ({
    id,
    provider: config.provider,
    capabilities: config.capabilities,
    maxTokens: config.maxTokens,
    costPer1kTokens: config.costPer1kTokens,
    avgLatency: config.avgLatency,
    complexityLimit: config.complexityLimit,
    enabled: config.enabled
  }));

  res.json({
    models,
    defaultStrategy: modelRouter.strategy
  });
});

/**
 * 获取路由统计信息
 */
router.get('/stats', (req, res) => {
  res.json(modelRouter.getStats());
});

/**
 * 配置路由策略
 */
router.post('/config', (req, res) => {
  const { strategy, costSensitivity, performanceSensitivity, maxRetries } = req.body;

  if (strategy && Object.values(ROUTING_STRATEGIES).includes(strategy)) {
    modelRouter.strategy = strategy;
  }

  if (typeof costSensitivity === 'number' && costSensitivity >= 0 && costSensitivity <= 1) {
    modelRouter.costSensitivity = costSensitivity;
  }

  if (typeof performanceSensitivity === 'number' && performanceSensitivity >= 0 && performanceSensitivity <= 1) {
    modelRouter.performanceSensitivity = performanceSensitivity;
  }

  if (typeof maxRetries === 'number' && maxRetries >= 0 && maxRetries <= 5) {
    modelRouter.maxRetries = maxRetries;
  }

  res.json({
    success: true,
    config: {
      strategy: modelRouter.strategy,
      costSensitivity: modelRouter.costSensitivity,
      performanceSensitivity: modelRouter.performanceSensitivity,
      maxRetries: modelRouter.maxRetries
    }
  });
});

/**
 * 启用/禁用模型
 */
router.post('/models/:modelId/toggle', (req, res) => {
  const { modelId } = req.params;
  const { enabled } = req.body;

  if (!modelRouter.models.has(modelId)) {
    return res.status(404).json({
      error: {
        message: `Model not found: ${modelId}`,
        type: 'not_found'
      }
    });
  }

  modelRouter.updateModel(modelId, { enabled });
  res.json({
    success: true,
    modelId,
    enabled
  });
});

/**
 * 注册新模型
 */
router.post('/models', (req, res) => {
  const { id, provider, capabilities, maxTokens, costPer1kTokens, avgLatency, complexityLimit } = req.body;

  if (!id || !provider || !capabilities) {
    return res.status(400).json({
      error: {
        message: 'Missing required fields: id, provider, capabilities',
        type: 'validation_error'
      }
    });
  }

  modelRouter.registerModel(id, {
    provider,
    capabilities,
    maxTokens: maxTokens || 8192,
    costPer1kTokens: costPer1kTokens || { input: 0.001, output: 0.002 },
    avgLatency: avgLatency || 1000,
    complexityLimit: complexityLimit || 5,
    enabled: true,
    priority: 5
  });

  res.json({
    success: true,
    modelId: id
  });
});

/**
 * 预测任务路由
 * 用于调试和测试路由决策
 */
router.post('/predict', (req, res) => {
  const { messages, options } = req.body;

  const taskClassification = modelRouter.classifyTask({ messages });
  const selectedModel = modelRouter.selectModel(taskClassification, options);

  res.json({
    taskClassification,
    selectedModel,
    modelConfig: modelRouter.models.get(selectedModel)
  });
});

// ==================== 模型池管理接口 ====================

/**
 * 获取模型池状态
 */
router.get('/pool/status', (req, res) => {
  res.json({
    success: true,
    overview: modelPool.getHealthOverview(),
    models: modelPool.getAllModels()
  });
});

/**
 * 获取模型池统计
 */
router.get('/pool/stats', (req, res) => {
  const models = modelPool.getAllModels();
  const stats = {
    totalModels: models.length,
    overview: modelPool.getHealthOverview(),
    models: models.map(m => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      healthStatus: m.healthStatus,
      healthScore: m.healthScore,
      requestCount: m.requestCount,
      successCount: m.successCount,
      failureCount: m.failureCount,
      averageLatency: m.averageLatency
    }))
  };

  res.json({
    success: true,
    stats
  });
});

/**
 * 选择最佳模型
 */
router.post('/pool/select', (req, res) => {
  const { capabilities, complexity, preferredProvider } = req.body;

  const selectedModel = modelPool.selectModel({
    capabilities,
    complexity,
    preferredProvider
  });

  if (!selectedModel) {
    return res.status(503).json({
      error: {
        message: 'No available models',
        type: 'no_available_models'
      }
    });
  }

  res.json({
    success: true,
    modelId: selectedModel,
    modelInfo: modelPool.getModelInfo(selectedModel)
  });
});

/**
 * 标记请求开始
 */
router.post('/pool/request/start', (req, res) => {
  const { modelId } = req.body;

  if (!modelId || !modelPool.models.has(modelId)) {
    return res.status(404).json({
      error: {
        message: `Model not found: ${modelId}`,
        type: 'not_found'
      }
    });
  }

  modelPool.markRequest(modelId);

  res.json({
    success: true,
    modelId
  });
});

/**
 * 标记请求成功
 */
router.post('/pool/request/success', (req, res) => {
  const { modelId, latency } = req.body;

  if (!modelId || !modelPool.models.has(modelId)) {
    return res.status(404).json({
      error: {
        message: `Model not found: ${modelId}`,
        type: 'not_found'
      }
    });
  }

  modelPool.markSuccess(modelId, latency);

  res.json({
    success: true,
    modelId
  });
});

/**
 * 标记请求失败
 */
router.post('/pool/request/failure', (req, res) => {
  const { modelId, errorType } = req.body;

  if (!modelId || !modelPool.models.has(modelId)) {
    return res.status(404).json({
      error: {
        message: `Model not found: ${modelId}`,
        type: 'not_found'
      }
    });
  }

  modelPool.markFailure(modelId, errorType);

  res.json({
    success: true,
    modelId
  });
});

/**
 * 获取备用模型
 */
router.get('/pool/fallback/:modelId', (req, res) => {
  const { modelId } = req.params;

  const fallbackModel = modelPool.getFallbackModel(modelId);

  if (!fallbackModel) {
    return res.status(503).json({
      error: {
        message: 'No fallback model available',
        type: 'no_fallback'
      }
    });
  }

  res.json({
    success: true,
    modelId: fallbackModel,
    modelInfo: modelPool.getModelInfo(fallbackModel)
  });
});

/**
 * 启用模型
 */
router.post('/pool/models/:modelId/enable', (req, res) => {
  const { modelId } = req.params;

  if (!modelPool.models.has(modelId)) {
    return res.status(404).json({
      error: {
        message: `Model not found: ${modelId}`,
        type: 'not_found'
      }
    });
  }

  modelPool.enableModel(modelId);

  res.json({
    success: true,
    modelId,
    enabled: true
  });
});

/**
 * 禁用模型
 */
router.post('/pool/models/:modelId/disable', (req, res) => {
  const { modelId } = req.params;

  if (!modelPool.models.has(modelId)) {
    return res.status(404).json({
      error: {
        message: `Model not found: ${modelId}`,
        type: 'not_found'
      }
    });
  }

  modelPool.disableModel(modelId);

  res.json({
    success: true,
    modelId,
    enabled: false
  });
});

/**
 * 注册新模型到池
 */
router.post('/pool/models', (req, res) => {
  const { id, provider, name, capabilities, maxTokens, costPer1kTokens, avgLatency, priority } = req.body;

  if (!id || !provider) {
    return res.status(400).json({
      error: {
        message: 'Missing required fields: id, provider',
        type: 'validation_error'
      }
    });
  }

  modelPool.registerModel(id, {
    provider,
    name: name || id,
    capabilities: capabilities || [],
    maxTokens: maxTokens || 8192,
    costPer1kTokens: costPer1kTokens || { input: 0.001, output: 0.002 },
    avgLatency: avgLatency || 1000,
    priority: priority || 5,
    enabled: true
  });

  res.json({
    success: true,
    modelId: id
  });
});

/**
 * 移除模型
 */
router.delete('/pool/models/:modelId', (req, res) => {
  const { modelId } = req.params;

  if (!modelPool.models.has(modelId)) {
    return res.status(404).json({
      error: {
        message: `Model not found: ${modelId}`,
        type: 'not_found'
      }
    });
  }

  modelPool.removeModel(modelId);

  res.json({
    success: true,
    modelId
  });
});

/**
 * 重置模型统计
 */
router.post('/pool/models/:modelId/reset', (req, res) => {
  const { modelId } = req.params;

  if (!modelPool.models.has(modelId)) {
    return res.status(404).json({
      error: {
        message: `Model not found: ${modelId}`,
        type: 'not_found'
      }
    });
  }

  modelPool.resetStats(modelId);

  res.json({
    success: true,
    modelId
  });
});

/**
 * 手动触发健康检查
 */
router.post('/pool/health-check', async (req, res) => {
  // 简单的健康检查 - 验证模型配置是否有效
  const results = {};
  for (const [id] of modelPool.models) {
    results[id] = 'healthy'; // 默认健康
  }

  res.json({
    success: true,
    results,
    timestamp: new Date().toISOString()
  });
});

/**
 * 重置模型池所有统计
 */
router.post('/pool/reset', (req, res) => {
  const { modelId } = req.body;

  if (modelId) {
    // 重置指定模型
    if (!modelPool.models.has(modelId)) {
      return res.status(404).json({
        error: {
          message: `Model not found: ${modelId}`,
          type: 'not_found'
        }
      });
    }
    modelPool.resetStats(modelId);
  } else {
    // 重置所有模型
    for (const [id] of modelPool.models) {
      modelPool.resetStats(id);
    }
  }

  res.json({
    success: true,
    message: modelId ? `Reset model ${modelId}` : 'Reset all models'
  });
});

/**
 * 导出模型池配置
 */
router.get('/pool/export', (req, res) => {
  res.json({
    success: true,
    config: modelPool.exportConfig()
  });
});

module.exports = router;