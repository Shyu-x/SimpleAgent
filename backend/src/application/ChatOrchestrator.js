/**
 * 聊天编排器 - 负责聊天相关业务逻辑
 * 将 routes/router.js 中的业务逻辑抽取到此处
 *
 * 新增功能：
 * - 意图置信度检查与主动澄清引导
 * - 当意图识别置信度不足时，主动生成引导问题
 */

const { ModelRouter, TaskClassifier } = require('../services/router');
const { QueryRewriter } = require('../services/queryRewriter');
const { HybridSearch } = require('../services/hybridSearch');
const { ModelPool } = require('../services/modelPool');
const { IntentGuidanceService, GUIDANCE_THRESHOLDS } = require('../domain/rag/IntentGuidanceService');

// 单例实例
let _instance = null;

class ChatOrchestrator {
  constructor() {
    // 模型路由器
    this.modelRouter = new ModelRouter({
      strategy: 'balanced',
      maxRetries: 2,
      fallbackEnabled: true
    });

    // 意图分类器
    this.intentClassifier = new TaskClassifier();

    // 意图澄清引导服务
    this.intentGuidance = new IntentGuidanceService({
      confidenceThreshold: GUIDANCE_THRESHOLDS.MEDIUM_CONFIDENCE,
      enableMultiLevel: true
    });

    // 查询改写器
    this.queryRewriter = new QueryRewriter({
      maxHistoryLength: 10,
      enableContextCompletion: true,
      enableQueryDecomposition: true
    });

    // 混合检索
    this.hybridSearch = new HybridSearch({
      topK: 5,
      channels: ['vector', 'fulltext', 'intent'],
      rerankEnabled: true,
      channelWeights: { vector: 0.5, fulltext: 0.3, intent: 0.2 }
    });

    // 模型池
    this.modelPool = new ModelPool({
      maxRetries: 3,
      healthCheckInterval: 30000,
      autoHealthCheck: false
    });

    this._initModelPool();
  }

  static getInstance() {
    if (!_instance) {
      _instance = new ChatOrchestrator();
    }
    return _instance;
  }

  _initModelPool() {
    const defaultModels = {
      'abab7-chat': {
        provider: 'minimax', name: 'MiniMax Chat',
        capabilities: ['text', 'vision', 'code', 'reasoning'],
        maxTokens: 128000, costPer1kTokens: { input: 0.001, output: 0.005 },
        avgLatency: 800, priority: 0, enabled: true
      },
      'gpt-4o-mini': {
        provider: 'openai', name: 'GPT-4o Mini',
        capabilities: ['text', 'vision', 'code', 'reasoning'],
        maxTokens: 128000, costPer1kTokens: { input: 0.00015, output: 0.0006 },
        avgLatency: 800, priority: 1, enabled: true
      },
      'gpt-4o': {
        provider: 'openai', name: 'GPT-4o',
        capabilities: ['text', 'vision', 'code', 'reasoning', 'creative'],
        maxTokens: 128000, costPer1kTokens: { input: 0.0025, output: 0.01 },
        avgLatency: 1500, priority: 0, enabled: true
      },
      'claude-3-5-sonnet': {
        provider: 'anthropic', name: 'Claude 3.5 Sonnet',
        capabilities: ['text', 'vision', 'code', 'reasoning', 'creative'],
        maxTokens: 200000, costPer1kTokens: { input: 0.003, output: 0.015 },
        avgLatency: 1200, priority: 2, enabled: true
      },
      'claude-3-haiku': {
        provider: 'anthropic', name: 'Claude 3 Haiku',
        capabilities: ['text', 'vision'],
        maxTokens: 200000, costPer1kTokens: { input: 0.00025, output: 0.00125 },
        avgLatency: 500, priority: 3, enabled: true
      },
      'deepseek-chat': {
        provider: 'deepseek', name: 'DeepSeek Chat',
        capabilities: ['text', 'code'],
        maxTokens: 32768, costPer1kTokens: { input: 0.0005, output: 0.001 },
        avgLatency: 700, priority: 4, enabled: true
      }
    };
    this.modelPool.registerModels(defaultModels);
  }

  // ==================== 意图分类 ====================

  classifyIntent({ query, messages, context = {} }) {
    return this.intentClassifier.classify({ query, messages, ...context });
  }

  // ==================== 意图引导 ====================

  /**
   * 检查是否需要澄清引导
   *
   * @param {Object} intentResult - 意图分类结果
   * @returns {boolean} 是否需要引导
   */
  needsGuidance(intentResult) {
    return this.intentGuidance.needsGuidance(intentResult);
  }

  /**
   * 生成澄清引导
   *
   * @param {Object} intentResult - 意图分类结果
   * @param {Object} context - 上下文信息
   * @returns {Object} 引导结果
   */
  generateGuidance(intentResult, context = {}) {
    return this.intentGuidance.generateGuidanceQuestion(intentResult, context);
  }

  /**
   * 应用用户选择，生成修正后的意图
   *
   * @param {Object} intentResult - 原始意图结果
   * @param {string} selectedValue - 用户选择的选项值
   * @returns {Object} 修正后的意图结果
   */
  applyUserSelection(intentResult, selectedValue) {
    return this.intentGuidance.applyUserSelection(intentResult, selectedValue);
  }

  /**
   * 执行聊天（带意图检查和澄清引导）
   *
   * @param {Object} params - 执行参数
   * @param {Array} params.messages - 消息列表
   * @param {string} params.query - 当前查询
   * @param {Object} params.context - 上下文
   * @param {Object} params.options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async executeWithGuidance({ messages, query, context = {}, options = {} }) {
    // 1. 意图分类
    const intentResult = this.classifyIntent({ query, messages, context });

    // 2. 检查是否需要澄清引导
    if (this.needsGuidance(intentResult)) {
      // 生成引导问题
      const guidance = this.generateGuidance(intentResult, context);

      // 返回引导响应（不继续执行聊天）
      return {
        type: 'guidance',
        needsGuidance: true,
        intent: intentResult,
        guidance: guidance,
        message: guidance.question,
        options: guidance.options,
        timestamp: Date.now()
      };
    }

    // 3. 置信度足够，继续正常执行
    return {
      type: 'proceed',
      needsGuidance: false,
      intent: intentResult,
      timestamp: Date.now()
    };
  }

  // ==================== 查询改写 ====================

  async rewriteQuery({ query, messages, intent, sessionId }) {
    return this.queryRewriter.rewrite({ query, messages, intent, sessionId });
  }

  // ==================== 混合检索 ====================

  async search({ query, knowledgeBaseId, channels, topK, filters, intent }) {
    return this.hybridSearch.search({ query, knowledgeBaseId, channels, topK, filters, intent });
  }

  getSearchStats() {
    return this.hybridSearch.getStats();
  }

  // ==================== 聊天执行 ====================

  async executeChat({ messages, model, stream, temperature, max_tokens, options }) {
    return this.modelRouter.execute({ messages, model, stream, temperature, max_tokens, options });
  }

  // ==================== 模型管理 ====================

  getModels() {
    return Array.from(this.modelRouter.models.entries()).map(([id, config]) => ({
      id,
      provider: config.provider,
      capabilities: config.capabilities,
      maxTokens: config.maxTokens,
      costPer1kTokens: config.costPer1kTokens,
      avgLatency: config.avgLatency,
      complexityLimit: config.complexityLimit,
      enabled: config.enabled
    }));
  }

  getStats() {
    return this.modelRouter.getStats();
  }

  configure({ strategy, costSensitivity, performanceSensitivity, maxRetries }) {
    if (strategy) this.modelRouter.strategy = strategy;
    if (typeof costSensitivity === 'number') this.modelRouter.costSensitivity = costSensitivity;
    if (typeof performanceSensitivity === 'number') this.modelRouter.performanceSensitivity = performanceSensitivity;
    if (typeof maxRetries === 'number') this.modelRouter.maxRetries = maxRetries;
    return {
      strategy: this.modelRouter.strategy,
      costSensitivity: this.modelRouter.costSensitivity,
      performanceSensitivity: this.modelRouter.performanceSensitivity,
      maxRetries: this.modelRouter.maxRetries
    };
  }

  toggleModel(modelId, enabled) {
    if (!this.modelRouter.models.has(modelId)) return false;
    this.modelRouter.updateModel(modelId, { enabled });
    return true;
  }

  registerModel(id, config) {
    this.modelRouter.registerModel(id, { ...config, enabled: true, priority: 5 });
  }

  predictModel(messages, options) {
    const taskClassification = this.modelRouter.classifyTask({ messages });
    const selectedModel = this.modelRouter.selectModel(taskClassification, options);
    return { taskClassification, selectedModel, modelConfig: this.modelRouter.models.get(selectedModel) };
  }

  // ==================== 模型池 ====================

  getPoolStatus() {
    return { overview: this.modelPool.getHealthOverview(), models: this.modelPool.getAllModels() };
  }

  getPoolStats() {
    const models = this.modelPool.getAllModels();
    return {
      totalModels: models.length,
      overview: this.modelPool.getHealthOverview(),
      models: models.map(m => ({
        id: m.id, name: m.name, provider: m.provider,
        healthStatus: m.healthStatus, healthScore: m.healthScore,
        requestCount: m.requestCount, successCount: m.successCount,
        failureCount: m.failureCount, averageLatency: m.averageLatency
      }))
    };
  }

  selectPoolModel({ capabilities, complexity, preferredProvider }) {
    return this.modelPool.selectModel({ capabilities, complexity, preferredProvider });
  }

  markPoolRequest(modelId) { this.modelPool.markRequest(modelId); }
  markPoolSuccess(modelId, latency) { this.modelPool.markSuccess(modelId, latency); }
  markPoolFailure(modelId, errorType) { this.modelPool.markFailure(modelId, errorType); }

  getPoolFallback(modelId) {
    return this.modelPool.getFallbackModel(modelId);
  }

  enablePoolModel(modelId) { this.modelPool.enableModel(modelId); }
  disablePoolModel(modelId) { this.modelPool.disableModel(modelId); }

  registerPoolModel(id, config) {
    this.modelPool.registerModel(id, { ...config, enabled: true });
  }

  removePoolModel(modelId) { this.modelPool.removeModel(modelId); }
  resetPoolStats(modelId) { this.modelPool.resetStats(modelId); }
  resetAllPoolStats() {
    for (const [id] of this.modelPool.models) this.modelPool.resetStats(id);
  }

  exportPoolConfig() {
    return this.modelPool.exportConfig();
  }

  // ==================== 引导服务统计 ====================

  getGuidanceStats() {
    return this.intentGuidance.getStats();
  }

  resetGuidanceStats() {
    this.intentGuidance.resetStats();
  }
}

module.exports = { ChatOrchestrator };
