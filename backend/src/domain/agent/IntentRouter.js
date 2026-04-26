/**
 * 意图路由器 - IntentRouter
 *
 * 企业级设计：
 * - 根据意图类型智能分流请求到不同处理管道
 * - 支持多级意图路由（主意图 -> 子意图）
 * - 低置信度时返回澄清引导
 *
 * 路由策略：
 * - knowledge -> RAG检索管道
 * - tool_use -> 工具执行管道
 * - chat -> 对话生成管道
 * - task -> 任务执行管道
 *
 * @date 2026-04-01
 */

const EventEmitter = require('events');

/**
 * 路由目标类型
 */
const RouteTarget = {
  RAG: 'rag',
  TOOL: 'tool',
  CHAT: 'chat',
  TASK: 'task',
  CLARIFICATION: 'clarification'
};

/**
 * 意图路由器
 */
class IntentRouter extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.intentClassifier - 意图分类器实例
   * @param {Object} options.ragPipeline - RAG处理管道
   * @param {Object} options.toolExecutor - 工具执行器
   * @param {Object} options.chatModel - 对话模型客户端
   * @param {Object} options.taskOrchestrator - 任务编排器
   * @param {number} options.confidenceThreshold - 置信度阈值（默认0.5）
   */
  constructor(options = {}) {
    super();

    this.intentClassifier = options.intentClassifier;
    this.ragPipeline = options.ragPipeline || null;
    this.toolExecutor = options.toolExecutor || null;
    this.chatModel = options.chatModel || null;
    this.taskOrchestrator = options.taskOrchestrator || null;
    this.confidenceThreshold = options.confidenceThreshold || 0.5;
    this.handlers = new Map();
    this.stats = {
      totalRoutes: 0,
      byTarget: {},
      clarifications: 0
    };

    this._registerDefaultHandlers();
  }

  /**
   * 注册路由处理器
   * @param {string} target - 路由目标
   * @param {Function} handler - 处理函数
   */
  registerHandler(target, handler) {
    if (!this.handlers.has(target)) {
      this.handlers.set(target, []);
    }
    this.handlers.get(target).push(handler);
    return this;
  }

  /**
   * 注册默认处理器
   * @private
   */
  _registerDefaultHandlers() {
    this.registerHandler(RouteTarget.RAG, async (context) => {
      if (!this.ragPipeline) throw new Error('RAG pipeline not configured');
      return await this.ragPipeline.query(context.query, context.options);
    });

    this.registerHandler(RouteTarget.TOOL, async (context) => {
      if (!this.toolExecutor) throw new Error('Tool executor not configured');
      const toolCall = { name: context.subIntent, parameters: context.params || {} };
      return await this.toolExecutor.execute(toolCall, context);
    });

    this.registerHandler(RouteTarget.CHAT, async (context) => {
      if (!this.chatModel) throw new Error('Chat model not configured');
      return await this.chatModel.chat({ messages: context.messages, ...context.options });
    });

    this.registerHandler(RouteTarget.TASK, async (context) => {
      if (!this.taskOrchestrator) throw new Error('Task orchestrator not configured');
      return await this.taskOrchestrator.execute(context.task, context);
    });
  }

  /**
   * 主路由方法
   * @param {string} query - 用户查询
   * @param {Object} context - 路由上下文
   * @returns {Promise<RouteDecision>} 路由决策
   */
  async route(query, context = {}) {
    const startTime = Date.now();
    this.stats.totalRoutes++;

    try {
      const classification = await this._classifyIntent(query, context);
      const target = this._resolveTarget(classification);

      if (target === RouteTarget.CLARIFICATION || classification.clarification) {
        this.stats.clarifications++;
        return this._buildDecision({
          target: RouteTarget.CLARIFICATION,
          intent: classification.intent,
          confidence: classification.confidence,
          clarification: classification.clarification,
          context,
          duration: Date.now() - startTime
        });
      }

      const matchedHandlers = this.handlers.get(target) || [];

      return this._buildDecision({
        target,
        intent: classification.intent,
        subIntent: classification.subIntent,
        confidence: classification.confidence,
        context: { ...context, query, params: classification.params },
        handlers: matchedHandlers,
        duration: Date.now() - startTime
      });

    } catch (error) {
      console.error('[IntentRouter] Route error:', error);
      return this._buildDecision({
        target: RouteTarget.CHAT,
        intent: 'chat',
        confidence: 0.1,
        error: error.message,
        context,
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * 执行路由
   * @param {RouteDecision} decision - 路由决策
   * @returns {Promise<Object>} 执行结果
   */
  async execute(decision) {
    if (decision.target === RouteTarget.CLARIFICATION) {
      return {
        type: 'clarification',
        question: decision.clarification,
        intent: decision.intent,
        confidence: decision.confidence
      };
    }

    const handlers = decision.handlers;
    if (!handlers || handlers.length === 0) {
      throw new Error(`No handlers registered for target: ${decision.target}`);
    }

    let result;
    for (const handler of handlers) {
      result = await handler(decision.context);
    }

    return {
      type: decision.target,
      result,
      intent: decision.intent,
      subIntent: decision.subIntent,
      confidence: decision.confidence,
      duration: decision.duration
    };
  }

  /**
   * 意图分类
   * @private
   */
  async _classifyIntent(query, context = {}) {
    if (this.intentClassifier) {
      return await this.intentClassifier.classify(query, context);
    }
    return this._fallbackClassification(query);
  }

  /**
   * 简单后备分类
   * @private
   */
  _fallbackClassification(query) {
    const q = query.toLowerCase();
    const toolKeywords = ['搜索', '计算', '翻译', '生成', '获取', '查询'];
    for (const kw of toolKeywords) {
      if (q.includes(kw)) return { intent: 'tool_use', confidence: 0.7, subIntent: 'general' };
    }
    const knowledgeKeywords = ['什么是', '如何', '为什么', '原理', '介绍'];
    for (const kw of knowledgeKeywords) {
      if (q.includes(kw)) return { intent: 'knowledge', confidence: 0.7, subIntent: 'qa' };
    }
    return { intent: 'chat', confidence: 0.5 };
  }

  /**
   * 根据意图确定路由目标
   * @private
   */
  _resolveTarget(classification) {
    const { intent, confidence } = classification;
    if (confidence < this.confidenceThreshold) return RouteTarget.CLARIFICATION;
    const intentToTarget = {
      knowledge: RouteTarget.RAG,
      tool_use: RouteTarget.TOOL,
      chat: RouteTarget.CHAT,
      task: RouteTarget.TASK
    };
    return intentToTarget[intent] || RouteTarget.CHAT;
  }

  /**
   * 构建路由决策
   * @private
   */
  _buildDecision(data) {
    if (data.target) {
      this.stats.byTarget[data.target] = (this.stats.byTarget[data.target] || 0) + 1;
    }
    return {
      target: data.target,
      intent: data.intent,
      subIntent: data.subIntent || null,
      confidence: data.confidence || 0,
      clarification: data.clarification || null,
      context: data.context || {},
      handlers: data.handlers || [],
      duration: data.duration || 0,
      timestamp: Date.now()
    };
  }

  /**
   * 获取路由统计
   */
  getStats() {
    const total = this.stats.totalRoutes;
    const dist = {};
    for (const [target, count] of Object.entries(this.stats.byTarget)) {
      dist[target] = { count, percentage: total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%' };
    }
    return { ...this.stats, distribution: dist };
  }

  resetStats() {
    this.stats = { totalRoutes: 0, byTarget: {}, clarifications: 0 };
  }
}

module.exports = { IntentRouter, RouteTarget };
