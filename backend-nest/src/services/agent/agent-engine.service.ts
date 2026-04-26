/**
 * Agent执行引擎服务 - 智能化升级版本
 * 核心循环：思考(Reason) -> 行动(Act) -> 观察(Observe) -> 反思(Reflect) -> 决策(Continue)
 * 支持LLM推理、ReAct模式、反思机制
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

// ReAct阶段
export enum ReactPhase {
  REASON = 'reason',
  ACT = 'act',
  OBSERVE = 'observe',
  REFLECT = 'reflect',
  CONTINUE = 'continue'
}

// 错误分类
export enum ErrorClassification {
  TRANSIENT = 'transient',
  RESOURCE = 'resource',
  PARAMETER = 'parameter',
  AUTHENTICATION = 'auth',
  RATE_LIMIT = 'rate_limit',
  UNKNOWN = 'unknown'
}

// 工具执行结果质量等级
export enum ResultQuality {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  INCOMPLETE = 'incomplete',
  ERROR = 'error',
  EMPTY = 'empty'
}

// 重试策略配置
const RETRY_STRATEGY = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
  errorTypes: {
    [ErrorClassification.TRANSIENT]: { maxRetries: 3, backoffMultiplier: 1 },
    [ErrorClassification.RESOURCE]: { maxRetries: 2, backoffMultiplier: 1.5 },
    [ErrorClassification.RATE_LIMIT]: { maxRetries: 5, backoffMultiplier: 2 }
  }
};

// 最大反思次数
const MAX_REFLECTIONS = 3;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: Record<string, any>) => Promise<any>;
  category?: string;
  keywords?: string[];
  examples?: string[];
}

export interface AgentState {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  iteration: number;
  tools: string[];
  history: any[];
  context: Record<string, any>;
  toolResults: any[];
  pendingAction: any;
  reactPhase: ReactPhase;
  reflectionCount: number;
  lastToolSuccess: boolean | null;
}

export interface AgentExecutionResult {
  success: boolean;
  finalResult: any;
  iterations: number;
  toolCalls: any[];
  error: string | null;
  sessionId: string;
  cancelled?: boolean;
  paused?: boolean;
  resumed?: boolean;
}

export interface Thought {
  type: 'finish' | 'action';
  content?: string;
  tool?: string;
  input?: Record<string, any>;
  reasoning?: string;
  confidence?: number;
}

@Injectable()
export class AgentEngineService extends EventEmitter {
  private readonly logger = new Logger(AgentEngineService.name);
  private agents: Map<string, AgentContext> = new Map();

  constructor() {
    super();
  }

  /**
   * 创建取消事件
   */
  createCancelEvent(sessionId: string): CancelEvent {
    const cancelEvent = { cancelled: false };
    const context = this.agents.get(sessionId);
    if (context) {
      context.cancelEvent = cancelEvent;
    }
    return cancelEvent;
  }

  /**
   * 触发取消
   */
  cancel(sessionId: string): void {
    const context = this.agents.get(sessionId);
    if (context && context.cancelEvent) {
      context.cancelEvent.cancelled = true;
    }
  }

  /**
   * 检查是否已取消
   */
  private checkCancelled(context: AgentContext): boolean {
    if (context.cancelEvent && context.cancelEvent.cancelled) {
      return true;
    }
    return false;
  }

  /**
   * 执行Agent循环
   */
  async executeAgent(
    sessionId: string,
    task: string,
    context: Record<string, any> = {}
  ): Promise<AgentExecutionResult> {
    const agentContext = this.getOrCreateContext(sessionId);
    agentContext.state.status = 'running';
    agentContext.state.iteration = 0;
    agentContext.state.history = [];
    agentContext.state.context = context;
    agentContext.state.toolResults = [];

    const results: AgentExecutionResult = {
      success: false,
      finalResult: null,
      iterations: 0,
      toolCalls: [],
      error: null,
      sessionId
    };

    try {
      for (let i = 0; i < agentContext.maxIterations; i++) {
        // 取消检查
        if (this.checkCancelled(agentContext)) {
          this.logger.warn(`[Agent] Task cancelled for session: ${sessionId}`);
          results.finalResult = 'Task cancelled';
          results.cancelled = true;
          agentContext.state.status = 'idle';
          break;
        }

        agentContext.state.iteration = i + 1;
        results.iterations = i + 1;

        // 思考阶段
        const thought = await this.think(agentContext, task);

        // 决策判断
        if (thought.type === 'finish') {
          results.success = true;
          results.finalResult = thought.content;
          agentContext.state.status = 'completed';
          break;
        }

        if (thought.type === 'action') {
          // 执行行动
          const actionResult = await this.act(agentContext, thought.tool, thought.input);
          results.toolCalls.push({
            tool: thought.tool,
            input: thought.input,
            output: actionResult,
            reasoning: thought.reasoning
          });

          // 观察阶段
          agentContext.state.toolResults.push({
            tool: thought.tool,
            input: thought.input,
            output: actionResult,
            timestamp: Date.now()
          });

          // 反思阶段
          if (agentContext.llmEnabled) {
            const reflection = await this.reflect(
              agentContext,
              thought.tool,
              thought.input,
              actionResult
            );

            if (reflection.action === 'retry' && reflection.newTool) {
              const retryResult = await this.act(agentContext, reflection.newTool, thought.input);
              agentContext.state.toolResults.push({
                tool: reflection.newTool,
                input: thought.input,
                output: retryResult,
                timestamp: Date.now(),
                isRetry: true,
                originalTool: thought.tool
              });
              results.toolCalls.push({
                tool: reflection.newTool,
                input: thought.input,
                output: retryResult,
                isRetry: true,
                originalTool: thought.tool
              });
            } else if (reflection.action === 'stop') {
              results.success = false;
              results.finalResult = reflection.response;
              agentContext.state.status = 'completed';
              break;
            } else if (reflection.action === 'finish') {
              results.success = true;
              results.finalResult = reflection.response;
              agentContext.state.status = 'completed';
              break;
            }
          }
        }
      }

      if (agentContext.state.status !== 'completed') {
        results.finalResult = '达到最大迭代次数，任务未完成';
        agentContext.state.status = 'completed';
      }
    } catch (error) {
      results.error = error.message;
      agentContext.state.status = 'error';
      this.logger.error(`Agent execution error: ${error.message}`, error.stack);
    }

    agentContext.state.history = [...results.toolCalls];
    return results;
  }

  /**
   * 思考阶段
   */
  private async think(context: AgentContext, task: string): Promise<Thought> {
    context.state.reactPhase = ReactPhase.REASON;
    const { toolResults = [] } = context.state.context;

    // 如果有LLM，使用LLM推理
    if (context.llmIntentClassifier && context.llmEnabled) {
      return this.thinkWithLLM(context, task, toolResults);
    }

    // 回退到规则匹配
    return this.thinkWithRules(context, task, toolResults);
  }

  /**
   * 使用LLM推理
   */
  private async thinkWithLLM(
    context: AgentContext,
    task: string,
    toolResults: any[]
  ): Promise<Thought> {
    // 1. Reason - 分析任务
    const reasoning = await this.reason(context, task, toolResults);

    // 2. 决定是否结束
    if (reasoning.shouldFinish) {
      return {
        type: 'finish',
        content: reasoning.response,
        reasoning: reasoning.explanation
      };
    }

    // 3. 选择工具
    const toolSelection = await this.selectToolWithLLM(context, task, reasoning, toolResults);

    if (!toolSelection.tool) {
      return {
        type: 'finish',
        content: reasoning.response || '我理解了您的任务。' + (reasoning.suggestion || ''),
        reasoning: reasoning.explanation
      };
    }

    // 4. Act - 返回行动
    return {
      type: 'action',
      tool: toolSelection.tool,
      input: toolSelection.parameters,
      reasoning: reasoning.explanation,
      confidence: toolSelection.confidence
    };
  }

  /**
   * Reason - 分析任务并决定下一步
   */
  private async reason(
    context: AgentContext,
    task: string,
    toolResults: any[]
  ): Promise<any> {
    const contextText = toolResults.length > 0
      ? `\n\n之前的工具执行结果:\n${toolResults.map(r => `[${r.tool}]: ${JSON.stringify(r.output)}`).join('\n')}`
      : '';

    const prompt = `你是一个智能助手，正在帮助用户完成任务。

用户任务: ${task}
${contextText}

请分析当前情况并决定下一步行动。

以JSON格式返回分析结果:
{
  "shouldFinish": true/false,
  "response": "如果应该结束，返回最终响应",
  "explanation": "你的推理过程",
  "suggestion": "如果需要更多信息，给出建议"
}

只返回JSON，不要其他内容。`;

    try {
      const result = await context.llmIntentClassifier.analyze(prompt);
      return this.parseJsonResponse(result);
    } catch (error) {
      this.logger.warn(`LLM reasoning failed, falling back to rules: ${error.message}`);
      return this.reasonWithRules(task, toolResults);
    }
  }

  /**
   * 使用LLM选择工具
   */
  private async selectToolWithLLM(
    context: AgentContext,
    task: string,
    reasoning: any,
    toolResults: any[]
  ): Promise<{ tool: string | null; parameters: Record<string, any>; confidence: number }> {
    try {
      const availableTools = context.toolRegistry.listTools();
      const result = await context.llmIntentClassifier.selectTool(task, availableTools, {
        task,
        toolResults,
        reasoning: reasoning.explanation
      });

      return {
        tool: result.selectedTool,
        parameters: result.parameters || {},
        confidence: result.confidence
      };
    } catch (error) {
      this.logger.warn(`LLM tool selection failed, falling back to rules: ${error.message}`);
      return this.selectToolWithRules(task);
    }
  }

  /**
   * 规则匹配推理
   */
  private thinkWithRules(
    context: AgentContext,
    task: string,
    toolResults: any[]
  ): Thought {
    // 如果是第一次迭代，生成初始响应
    if (toolResults.length === 0) {
      const taskLower = task.toLowerCase();

      // 搜索类任务
      if (taskLower.includes('搜索') || taskLower.includes('查找') || taskLower.includes('search') ||
          taskLower.includes('天气') || taskLower.includes('weather')) {
        const searchQuery = this.extractSearchQuery(task);
        return {
          type: 'action',
          tool: 'web_search',
          input: { query: searchQuery }
        };
      }

      // 计算类任务
      if (taskLower.includes('计算') || taskLower.includes('等于') ||
          taskLower.includes('+') || taskLower.includes('-') ||
          taskLower.includes('*') || taskLower.includes('/')) {
        return {
          type: 'action',
          tool: 'calculator',
          input: { expression: task }
        };
      }

      // 默认结束
      return {
        type: 'finish',
        content: `我理解了您的任务：${task}。请告诉我更多细节以便更好地帮助您。`
      };
    }

    // 检查最近的工具结果
    if (toolResults.length > 0) {
      const lastResult = toolResults[toolResults.length - 1];
      if (lastResult.output && (lastResult.output.success !== false)) {
        return {
          type: 'finish',
          content: this.formatResult(lastResult.output)
        };
      }
    }

    return {
      type: 'finish',
      content: '任务处理完成'
    };
  }

  /**
   * 规则匹配选择工具
   */
  private selectToolWithRules(task: string): { tool: string | null; parameters: Record<string, any>; confidence: number } {
    const taskLower = task.toLowerCase();

    if (taskLower.includes('搜索') || taskLower.includes('查找') || taskLower.includes('search')) {
      return { tool: 'web_search', parameters: { query: this.extractSearchQuery(task) }, confidence: 0.8 };
    }
    if (taskLower.includes('计算')) {
      return { tool: 'calculator', parameters: { expression: task }, confidence: 0.9 };
    }

    return { tool: null, parameters: {}, confidence: 0 };
  }

  /**
   * 规则推理
   */
  private reasonWithRules(task: string, toolResults: any[]): any {
    if (toolResults.length > 0) {
      const lastResult = toolResults[toolResults.length - 1];
      if (lastResult.output && lastResult.output.success !== false) {
        return { shouldFinish: true, response: this.formatResult(lastResult.output), explanation: '工具执行成功' };
      }
    }
    return { shouldFinish: false, explanation: '需要继续执行工具' };
  }

  /**
   * Act - 执行行动
   */
  private async act(
    context: AgentContext,
    toolName: string | undefined,
    input: Record<string, any> | undefined
  ): Promise<any> {
    if (!toolName) {
      context.state.lastToolSuccess = false;
      return { success: false, error: 'No tool specified' };
    }

    context.state.reactPhase = ReactPhase.ACT;

    try {
      const tool = context.toolRegistry.get(toolName);
      if (!tool) {
        context.state.lastToolSuccess = false;
        return { success: false, error: `Tool not found: ${toolName}` };
      }

      context.state.tools.push(toolName);
      context.state.reactPhase = ReactPhase.OBSERVE;

      this.logger.debug(`Executing tool: ${toolName} with input: ${JSON.stringify(input)}`);

      // 带超时的工具执行
      const result = await this.executeToolWithTimeout(
        () => tool.execute(input || {}),
        context.toolRegistry.defaultTimeout,
        toolName
      );

      context.state.lastToolSuccess = result.success !== false;
      return result;
    } catch (error) {
      context.state.lastToolSuccess = false;
      this.logger.error(`Tool execution error: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * 带超时的工具执行
   */
  private async executeToolWithTimeout(
    fn: () => Promise<any>,
    timeout: number,
    toolName: string
  ): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool "${toolName}" execution timeout after ${timeout}ms`));
      }, timeout);

      try {
        const result = await fn();
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Reflect - 反思工具执行结果
   */
  private async reflect(
    context: AgentContext,
    toolName: string | undefined,
    input: Record<string, any> | undefined,
    output: any
  ): Promise<any> {
    context.state.reactPhase = ReactPhase.REFLECT;
    context.state.reflectionCount++;

    const quality = this.evaluateResultQuality(output);
    const errorType = this.classifyError(output.error);

    // 工具执行失败
    if (output.success === false) {
      const shouldRetry = context.state.reflectionCount < context.maxReflections &&
        errorType !== ErrorClassification.AUTHENTICATION &&
        errorType !== ErrorClassification.PARAMETER;

      if (shouldRetry) {
        return {
          shouldContinue: true,
          action: 'retry',
          reason: `工具执行失败 (${errorType}): ${output.error}`,
          newTool: this.findAlternativeTool(context, toolName || '', output.error),
          errorType
        };
      }

      return {
        shouldContinue: false,
        action: 'stop',
        reason: `工具多次失败 (${errorType}): ${output.error}`,
        response: `抱歉，工具执行遇到问题: ${output.error}`
      };
    }

    // 结果质量好
    if (quality === ResultQuality.GOOD || quality === ResultQuality.EXCELLENT) {
      return {
        shouldContinue: false,
        action: 'finish',
        reason: '工具执行成功',
        response: this.formatResult(output)
      };
    }

    // 结果不够好，可能需要继续
    if (context.state.reflectionCount < context.maxReflections) {
      return {
        shouldContinue: true,
        action: 'refine',
        reason: quality
      };
    }

    return {
      shouldContinue: false,
      action: 'finish',
      reason: '达到最大反思次数',
      response: this.formatResult(output)
    };
  }

  /**
   * 评估工具执行结果质量
   */
  private evaluateResultQuality(output: any): ResultQuality {
    if (!output) {
      return ResultQuality.EMPTY;
    }

    const resultText = typeof output === 'string'
      ? output
      : JSON.stringify(output);

    if (output.success === false) {
      return ResultQuality.ERROR;
    }

    if (!resultText || resultText === '{}' || resultText === '[]' || resultText === '""') {
      return ResultQuality.EMPTY;
    }

    const errorPatterns = ['error', 'failed', 'failure', '错误', '失败', '无法', 'exception'];
    const lowerText = resultText.toLowerCase();
    for (const pattern of errorPatterns) {
      if (lowerText.includes(pattern) && !lowerText.includes('error handling')) {
        return ResultQuality.INCOMPLETE;
      }
    }

    if (resultText.length < 10) {
      return ResultQuality.INCOMPLETE;
    }

    return ResultQuality.GOOD;
  }

  /**
   * 分类错误类型
   */
  private classifyError(error: any): ErrorClassification {
    if (!error) return ErrorClassification.UNKNOWN;

    const errorMsg = typeof error === 'string' ? error : error.message || '';

    if (errorMsg.includes('401') || errorMsg.includes('403') ||
        errorMsg.includes('unauthorized') || errorMsg.includes('forbidden')) {
      return ErrorClassification.AUTHENTICATION;
    }

    if (errorMsg.includes('invalid') || errorMsg.includes('parameter') ||
        errorMsg.includes('argument') || errorMsg.includes('validation')) {
      return ErrorClassification.PARAMETER;
    }

    if (errorMsg.includes('rate limit') || errorMsg.includes('too many requests')) {
      return ErrorClassification.RATE_LIMIT;
    }

    if (errorMsg.includes('timeout') || errorMsg.includes('network') ||
        errorMsg.includes('ECONNREFUSED')) {
      return ErrorClassification.TRANSIENT;
    }

    return ErrorClassification.UNKNOWN;
  }

  /**
   * 查找替代工具
   */
  private findAlternativeTool(context: AgentContext, failedTool: string, error: any): string | null {
    const availableTools = context.toolRegistry.listTools();
    const searchTools = availableTools.filter(t =>
      t.name.includes('search') || t.name.includes('web') || t.name.includes('find')
    );

    if (failedTool !== 'web_search' && searchTools.length > 0) {
      return searchTools[0].name;
    }

    const otherTools = availableTools.filter(t => t.name !== failedTool);
    return otherTools.length > 0 ? otherTools[0].name : null;
  }

  /**
   * 解析JSON响应
   */
  private parseJsonResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      return JSON.parse(jsonStr);
    } catch (error) {
      this.logger.error(`JSON parsing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 提取搜索查询
   */
  private extractSearchQuery(task: string): string {
    const match = task.match(/["'](.+?)["']/);
    if (match) return match[1];

    const removeWords = ['搜索', '查找', '帮我', '请', 'search', 'find'];
    let query = task;
    removeWords.forEach(word => {
      query = query.replace(new RegExp(word, 'gi'), '');
    });
    return query.trim();
  }

  /**
   * 格式化结果
   */
  private formatResult(output: any): string {
    if (typeof output === 'string') return output;
    if (output.data) return JSON.stringify(output.data, null, 2);
    if (output.result) return output.result;
    return JSON.stringify(output);
  }

  /**
   * 获取或创建Agent上下文
   */
  private getOrCreateContext(sessionId: string): AgentContext {
    if (!this.agents.has(sessionId)) {
      this.agents.set(sessionId, {
        sessionId,
        maxIterations: 10,
        toolRegistry: new ToolRegistryService(),
        memory: null,
        state: this.createInitialState(),
        cancelEvent: null,
        maxReflections: MAX_REFLECTIONS,
        reflectionThreshold: 0.6,
        llmEnabled: false,
        llmIntentClassifier: null
      });
    }
    return this.agents.get(sessionId)!;
  }

  /**
   * 创建初始状态
   */
  private createInitialState(): AgentState {
    return {
      status: 'idle',
      iteration: 0,
      tools: [],
      history: [],
      context: {},
      toolResults: [],
      pendingAction: null,
      reactPhase: ReactPhase.REASON,
      reflectionCount: 0,
      lastToolSuccess: null
    };
  }

  /**
   * 获取Agent状态
   */
  getAgentState(sessionId: string): AgentState | null {
    const context = this.agents.get(sessionId);
    return context ? context.state : null;
  }

  /**
   * 注册工具到Agent
   */
  registerTool(sessionId: string, tool: ToolDefinition): void {
    const context = this.getOrCreateContext(sessionId);
    context.toolRegistry.register(tool);
  }
}

interface CancelEvent {
  cancelled: boolean;
}

interface AgentContext {
  sessionId: string;
  maxIterations: number;
  toolRegistry: ToolRegistryService;
  memory: any;
  state: AgentState;
  cancelEvent: CancelEvent | null;
  maxReflections: number;
  reflectionThreshold: number;
  llmEnabled: boolean;
  llmIntentClassifier: any;
}

/**
 * 工具注册表服务
 */
@Injectable()
export class ToolRegistryService {
  private tools: Map<string, ToolDefinition> = new Map();
  private intentToolMapping: Record<string, string[]> = {};

  // 默认超时时间 30秒
  readonly defaultTimeout = 30000;

  constructor() {
    this.initIntentMapping();
  }

  private initIntentMapping(): void {
    this.intentToolMapping = {
      'search': ['web_search', 'http_request'],
      'find': ['web_search', 'http_request'],
      '查询': ['web_search', 'http_request'],
      '搜索': ['web_search'],
      'code': ['code_execution'],
      '编程': ['code_execution'],
      '运行': ['code_execution'],
      'execute': ['code_execution'],
      'calculate': ['calculator'],
      '计算': ['calculator'],
      '等于': ['calculator'],
      'file': ['file_operations'],
      '文件': ['file_operations'],
      '读取': ['file_operations'],
      '写入': ['file_operations'],
      'data': ['data_processing'],
      '分析': ['data_processing'],
      '处理': ['data_processing'],
      'datetime': ['datetime'],
      '时间': ['datetime'],
      '日期': ['datetime'],
      'weather': ['web_search'],
      '天气': ['web_search']
    };
  }

  register(tool: ToolDefinition): void {
    if (!tool.name || !tool.execute) {
      throw new Error('Tool must have name and execute function');
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  clear(): void {
    this.tools.clear();
  }

  recommendTools(query: string): ToolDefinition[] {
    const recommendations: ToolDefinition[] = [];
    const queryLower = query.toLowerCase();

    for (const [keyword, toolNames] of Object.entries(this.intentToolMapping)) {
      if (queryLower.includes(keyword)) {
        for (const toolName of toolNames) {
          const tool = this.tools.get(toolName);
          if (tool && !recommendations.find(t => t.name === toolName)) {
            recommendations.push(tool);
          }
        }
      }
    }

    return recommendations;
  }

  selectBestTool(query: string): ToolDefinition | null {
    const recommendations = this.recommendTools(query);
    return recommendations.length > 0 ? recommendations[0] : null;
  }

  async executeTool(
    toolName: string,
    params: Record<string, any> = {},
    options: { timeout?: number; skipValidation?: boolean } = {}
  ): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { success: false, error: `Tool not found: ${toolName}` };
    }

    try {
      const result = await tool.execute(params);
      return { success: true, tool: toolName, result };
    } catch (error) {
      return { success: false, tool: toolName, error: error.message };
    }
  }

  getStats(): { total: number; byCategory: Record<string, number> } {
    const stats = {
      total: this.tools.size,
      byCategory: {} as Record<string, number>
    };

    for (const tool of this.tools.values()) {
      const category = tool.category || 'general';
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    }

    return stats;
  }
}
