import { Injectable } from '@nestjs/common';

/**
 * 路由目标类型
 */
export enum RouteTarget {
  RAG = 'rag',
  TOOL = 'tool',
  CHAT = 'chat',
  TASK = 'task',
  CLARIFICATION = 'clarification',
}

/**
 * 路由决策接口
 */
export interface RouteDecision {
  target: RouteTarget;
  intent: string;
  subIntent: string | null;
  confidence: number;
  clarification: string | null;
  context: Record<string, any>;
  handlers: ((context: any) => Promise<any>)[];
  duration: number;
  timestamp: number;
}

/**
 * 意图路由服务
 * 根据意图类型智能分流请求到不同处理管道
 */
@Injectable()
export class IntentRouterService {
  private confidenceThreshold = 0.5;
  private handlers: Map<RouteTarget, ((context: any) => Promise<any>)[]> = new Map();
  private intentClassifier: any = null;
  private ragPipeline: any = null;
  private toolExecutor: any = null;
  private chatModel: any = null;
  private taskOrchestrator: any = null;

  private stats = {
    totalRoutes: 0,
    byTarget: {} as Record<string, number>,
    clarifications: 0,
  };

  constructor() {
    this.registerDefaultHandlers();
  }

  /**
   * 注册路由处理器
   */
  registerHandler(target: RouteTarget, handler: (context: any) => Promise<any>): void {
    if (!this.handlers.has(target)) {
      this.handlers.set(target, []);
    }
    this.handlers.get(target)!.push(handler);
  }

  /**
   * 注册默认处理器
   */
  private registerDefaultHandlers(): void {
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
   */
  async route(query: string, context: any = {}): Promise<RouteDecision> {
    const startTime = Date.now();
    this.stats.totalRoutes++;

    try {
      const classification = await this.classifyIntent(query, context);
      const target = this.resolveTarget(classification);

      if (target === RouteTarget.CLARIFICATION || classification.clarification) {
        this.stats.clarifications++;
        return this.buildDecision({
          target: RouteTarget.CLARIFICATION,
          intent: classification.intent,
          confidence: classification.confidence,
          clarification: classification.clarification,
          context,
          duration: Date.now() - startTime,
        });
      }

      const matchedHandlers = this.handlers.get(target) || [];

      return this.buildDecision({
        target,
        intent: classification.intent,
        subIntent: classification.subIntent,
        confidence: classification.confidence,
        context: { ...context, query, params: classification.params },
        handlers: matchedHandlers,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      console.error('[IntentRouter] Route error:', error);
      return this.buildDecision({
        target: RouteTarget.CHAT,
        intent: 'chat',
        confidence: 0.1,
        error: error.message,
        context,
        duration: Date.now() - startTime,
      });
    }
  }

  /**
   * 执行路由
   */
  async execute(decision: RouteDecision): Promise<any> {
    if (decision.target === RouteTarget.CLARIFICATION) {
      return {
        type: 'clarification',
        question: decision.clarification,
        intent: decision.intent,
        confidence: decision.confidence,
      };
    }

    const handlers = decision.handlers;
    if (!handlers || handlers.length === 0) {
      throw new Error(`No handlers registered for target: ${decision.target}`);
    }

    let result: any;
    for (const handler of handlers) {
      result = await handler(decision.context);
    }

    return {
      type: decision.target,
      result,
      intent: decision.intent,
      subIntent: decision.subIntent,
      confidence: decision.confidence,
      duration: decision.duration,
    };
  }

  /**
   * 意图分类
   */
  private async classifyIntent(query: string, context: any = {}): Promise<any> {
    if (this.intentClassifier) {
      return await this.intentClassifier.classify(query, context);
    }
    return this.fallbackClassification(query);
  }

  /**
   * 简单后备分类
   */
  private fallbackClassification(query: string): any {
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
   */
  private resolveTarget(classification: any): RouteTarget {
    const { intent, confidence } = classification;
    if (confidence < this.confidenceThreshold) return RouteTarget.CLARIFICATION;

    const intentToTarget: Record<string, RouteTarget> = {
      knowledge: RouteTarget.RAG,
      tool_use: RouteTarget.TOOL,
      chat: RouteTarget.CHAT,
      task: RouteTarget.TASK,
    };

    return intentToTarget[intent] || RouteTarget.CHAT;
  }

  /**
   * 构建路由决策
   */
  private buildDecision(data: any): RouteDecision {
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
      timestamp: Date.now(),
    };
  }

  /**
   * 设置意图分类器
   */
  setIntentClassifier(classifier: any): void {
    this.intentClassifier = classifier;
  }

  /**
   * 设置 RAG 管道
   */
  setRagPipeline(pipeline: any): void {
    this.ragPipeline = pipeline;
  }

  /**
   * 设置工具执行器
   */
  setToolExecutor(executor: any): void {
    this.toolExecutor = executor;
  }

  /**
   * 设置对话模型
   */
  setChatModel(model: any): void {
    this.chatModel = model;
  }

  /**
   * 设置任务编排器
   */
  setTaskOrchestrator(orchestrator: any): void {
    this.taskOrchestrator = orchestrator;
  }

  /**
   * 获取路由统计
   */
  getStats() {
    const total = this.stats.totalRoutes;
    const dist: Record<string, { count: number; percentage: string }> = {};

    for (const [target, count] of Object.entries(this.stats.byTarget)) {
      dist[target] = {
        count,
        percentage: total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%',
      };
    }

    return { ...this.stats, distribution: dist };
  }
}
