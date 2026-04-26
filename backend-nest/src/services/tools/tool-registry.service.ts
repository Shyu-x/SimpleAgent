/**
 * 工具注册中心服务
 * 管理所有可用工具的注册和调用
 * 支持关键词匹配 + LLM语义匹配
 */

import { Injectable, Logger } from '@nestjs/common';

// 默认超时配置（毫秒）
const DEFAULT_TIMEOUT = 30000;
const TOOL_TIMEOUTS: Record<string, number> = {
  web_search: 15000,
  http_request: 10000,
  code_execution: 30000,
  file_operations: 5000,
  calculator: 1000,
  default: DEFAULT_TIMEOUT
};

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    properties?: Record<string, any>;
    required?: string[];
  };
  execute: (params: Record<string, any>) => Promise<any>;
  category?: string;
  keywords?: string[];
  examples?: string[];
}

export interface ToolExecutionResult {
  success: boolean;
  tool: string;
  result?: any;
  error?: string;
  errorType?: string;
  executionTime?: number;
  validationErrors?: Array<{ field: string; message: string }>;
}

export interface ToolRecommendation {
  name: string;
  description: string;
  reason: string;
  confidence: number;
}

// ToolResult 导出 (供其他工具使用)
export type ToolResult = ToolExecutionResult;

export interface ToolStats {
  toolName: string;
  totalCalls: number;
  successCalls: number;
  failureCalls: number;
  successRate: string;
  avgExecutionTime: string;
  lastError: string | null;
}

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private tools: Map<string, ToolDefinition> = new Map();
  private intentToolMapping: Map<string, string[]> = new Map();
  private llmClassifier: any = null;
  private semanticThreshold: number = 0.6;
  private defaultTimeout: number = DEFAULT_TIMEOUT;
  private toolTimeouts: Map<string, number> = new Map(Object.entries(TOOL_TIMEOUTS));
  private executionStats: Map<string, ToolExecutionStats> = new Map();

  constructor(options: {
    semanticThreshold?: number;
    defaultTimeout?: number;
  } = {}) {
    this.semanticThreshold = options.semanticThreshold || 0.6;
    this.defaultTimeout = options.defaultTimeout || DEFAULT_TIMEOUT;
    this.initIntentMapping();
  }

  private initIntentMapping(): void {
    this.intentToolMapping = new Map([
      // 搜索相关意图
      ['search', ['web_search', 'http_request']],
      ['find', ['web_search', 'http_request']],
      ['查询', ['web_search', 'http_request']],
      ['搜索', ['web_search']],
      ['查找', ['web_search']],

      // 代码相关意图
      ['code', ['code_execution']],
      ['编程', ['code_execution']],
      ['运行', ['code_execution']],
      ['执行', ['code_execution']],

      // 计算相关意图
      ['calculate', ['calculator']],
      ['计算', ['calculator']],
      ['等于', ['calculator']],
      ['加', ['calculator']],
      ['减', ['calculator']],
      ['乘', ['calculator']],
      ['除', ['calculator']],

      // 文件相关意图
      ['file', ['file_operations']],
      ['文件', ['file_operations']],
      ['读取', ['file_operations']],
      ['写入', ['file_operations']],

      // 数据处理意图
      ['data', ['data_processing']],
      ['分析', ['data_processing']],
      ['处理', ['data_processing']],

      // 日期时间意图
      ['datetime', ['datetime']],
      ['时间', ['datetime']],
      ['日期', ['datetime']],

      // 天气相关意图
      ['weather', ['web_search']],
      ['天气', ['web_search']]
    ]);
  }

  /**
   * 设置LLM分类器
   */
  setLLMClassifier(classifier: any): void {
    this.llmClassifier = classifier;
  }

  /**
   * 注册工具
   */
  register(tool: ToolDefinition): void {
    if (!tool.name || !tool.execute) {
      throw new Error('Tool must have name and execute function');
    }

    this.tools.set(tool.name, {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || {},
      execute: tool.execute.bind(tool),
      category: tool.category || 'general',
      keywords: tool.keywords || [],
      examples: tool.examples || []
    });

    this.logger.log(`Tool registered: ${tool.name}`);
  }

  /**
   * 批量注册工具
   */
  registerMany(tools: ToolDefinition[]): void {
    tools.forEach(tool => this.register(tool));
  }

  /**
   * 获取工具
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * 列出所有工具
   */
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取分类工具
   */
  getByCategory(category: string): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter(tool => tool.category === category);
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 移除工具
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 清除所有工具
   */
  clear(): void {
    this.tools.clear();
    this.executionStats.clear();
  }

  /**
   * 智能工具推荐
   */
  recommendTools(context: { query?: string; intent?: any; messages?: any[] }): ToolRecommendation[] {
    const { query, intent } = context;
    const recommendations: ToolRecommendation[] = [];

    if (!query && !intent) {
      return recommendations;
    }

    const queryLower = (query || '').toLowerCase();

    // 1. 基于查询关键词推荐工具
    for (const [keyword, toolNames] of this.intentToolMapping.entries()) {
      if (queryLower.includes(keyword)) {
        for (const toolName of toolNames) {
          const tool = this.tools.get(toolName);
          if (tool && !recommendations.find(t => t.name === toolName)) {
            recommendations.push({
              name: tool.name,
              description: tool.description,
              reason: `关键词 "${keyword}" 匹配`,
              confidence: 0.8
            });
          }
        }
      }
    }

    // 2. 基于意图类型推荐
    if (intent) {
      const intentToolMap: Record<string, string[]> = {
        'tool_use': ['web_search', 'calculator', 'code_execution'],
        'knowledge': ['web_search', 'http_request'],
        'creative': [],
        'task': ['web_search', 'data_processing'],
        'conversation': []
      };

      const intentTools = intentToolMap[intent.type] || [];
      for (const toolName of intentTools) {
        const tool = this.tools.get(toolName);
        if (tool && !recommendations.find(t => t.name === toolName)) {
          recommendations.push({
            name: tool.name,
            description: tool.description,
            reason: `意图 "${intent.name}" 匹配`,
            confidence: 0.7
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * 自动选择最佳工具
   */
  selectBestTool(context: { query?: string; intent?: any; messages?: any[] }): ToolRecommendation | null {
    const recommendations = this.recommendTools(context);

    if (recommendations.length === 0) {
      return null;
    }

    // 按置信度排序
    recommendations.sort((a, b) => b.confidence - a.confidence);

    return recommendations[0];
  }

  /**
   * 获取工具超时时间
   */
  private getToolTimeout(toolName: string): number {
    if (this.toolTimeouts.has(toolName)) {
      return this.toolTimeouts.get(toolName)!;
    }
    const tool = this.tools.get(toolName);
    if (tool && this.toolTimeouts.has(tool.category || 'default')) {
      return this.toolTimeouts.get(tool.category || 'default')!;
    }
    return this.defaultTimeout;
  }

  /**
   * 带超时的执行包装
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number, toolName: string): Promise<T> {
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
   * 验证工具参数
   */
  private validateParameters(tool: ToolDefinition, params: Record<string, any>): { valid: boolean; errors: Array<{ field: string; message: string }> } {
    const errors: Array<{ field: string; message: string }> = [];
    const { parameters } = tool;

    if (!parameters || !parameters.properties) {
      return { valid: true, errors: [] };
    }

    const required = parameters.required || [];
    const properties = parameters.properties;

    // 检查必需参数
    for (const field of required) {
      if (params[field] === undefined || params[field] === null) {
        errors.push({
          field,
          message: `Missing required parameter: ${field}`
        });
      }
    }

    // 检查参数类型
    for (const [key, value] of Object.entries(params)) {
      if (properties[key]) {
        const expectedType = properties[key].type;
        const actualType = typeof value;

        if (value !== null && value !== undefined) {
          if (expectedType === 'number' && actualType !== 'number') {
            errors.push({
              field: key,
              message: `Parameter "${key}" should be number, got ${actualType}`
            });
          } else if (expectedType === 'string' && actualType !== 'string') {
            errors.push({
              field: key,
              message: `Parameter "${key}" should be string, got ${actualType}`
            });
          } else if (expectedType === 'boolean' && actualType !== 'boolean') {
            errors.push({
              field: key,
              message: `Parameter "${key}" should be boolean, got ${actualType}`
            });
          } else if (expectedType === 'array' && !Array.isArray(value)) {
            errors.push({
              field: key,
              message: `Parameter "${key}" should be array, got ${actualType}`
            });
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 更新工具超时配置
   */
  setToolTimeout(toolNameOrCategory: string, timeout: number): void {
    this.toolTimeouts.set(toolNameOrCategory, timeout);
  }

  /**
   * 设置全局默认超时
   */
  setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
    this.toolTimeouts.set('default', timeout);
  }

  /**
   * 获取全局默认超时时间（毫秒）
   */
  getDefaultTimeout(): number {
    return this.defaultTimeout;
  }

  /**
   * 执行工具（带参数提取和超时控制）
   */
  async executeTool(
    toolName: string,
    params: Record<string, any> = {},
    options: { timeout?: number; skipValidation?: boolean } = {}
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        tool: toolName,
        error: `Tool not found: ${toolName}`
      };
    }

    // 参数验证
    if (options.skipValidation !== true) {
      const validation = this.validateParameters(tool, params);
      if (!validation.valid) {
        return {
          success: false,
          tool: toolName,
          error: 'Parameter validation failed',
          validationErrors: validation.errors
        };
      }
    }

    // 获取超时时间
    const timeout = options.timeout || this.getToolTimeout(toolName);

    // 记录执行统计
    this.recordExecutionStart(toolName);

    const startTime = Date.now();

    try {
      // 带超时的执行
      const result = await this.executeWithTimeout(
        () => tool.execute(params),
        timeout,
        toolName
      );

      // 记录成功
      this.recordExecutionEnd(toolName, true);

      return {
        success: true,
        tool: toolName,
        result,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      // 记录失败
      this.recordExecutionEnd(toolName, false, error.message);

      let errorType = 'unknown';
      if (error.message.includes('timeout')) {
        errorType = 'timeout';
      } else if (error.message.includes('validation')) {
        errorType = 'validation';
      }

      return {
        success: false,
        tool: toolName,
        error: error.message,
        errorType,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * 并行执行多个工具（结果合并）
   */
  async executeTools(toolCalls: Array<{ name: string; params?: Record<string, any>; options?: any }>): Promise<ToolExecutionResult[]> {
    const results = await Promise.all(
      toolCalls.map(({ name, params, options }) =>
        this.executeTool(name, params || {}, options || {})
      )
    );

    return results;
  }

  /**
   * 记录执行开始
   */
  private recordExecutionStart(toolName: string): void {
    if (!this.executionStats.has(toolName)) {
      this.executionStats.set(toolName, {
        totalCalls: 0,
        successCalls: 0,
        failureCalls: 0,
        totalTime: 0,
        lastStartTime: null,
        lastError: null
      });
    }
    const stats = this.executionStats.get(toolName)!;
    stats.totalCalls++;
    stats.lastStartTime = Date.now();
  }

  /**
   * 记录执行结束
   */
  private recordExecutionEnd(toolName: string, success: boolean, errorMessage?: string): void {
    const stats = this.executionStats.get(toolName);
    if (stats && stats.lastStartTime) {
      const duration = Date.now() - stats.lastStartTime;
      stats.totalTime += duration;
      if (success) {
        stats.successCalls++;
      } else {
        stats.failureCalls++;
        stats.lastError = errorMessage || null;
      }
    }
  }

  /**
   * 获取工具执行统计
   */
  getToolStats(toolName: string): ToolStats | null {
    const stats = this.executionStats.get(toolName);
    if (!stats) return null;

    return {
      toolName,
      totalCalls: stats.totalCalls,
      successCalls: stats.successCalls,
      failureCalls: stats.failureCalls,
      successRate: stats.totalCalls > 0
        ? ((stats.successCalls / stats.totalCalls) * 100).toFixed(2) + '%'
        : 'N/A',
      avgExecutionTime: stats.totalCalls > 0
        ? (stats.totalTime / stats.totalCalls).toFixed(2) + 'ms'
        : 'N/A',
      lastError: stats.lastError
    };
  }

  /**
   * 获取所有工具统计
   */
  getAllStats(): Record<string, ToolStats> {
    const stats: Record<string, ToolStats> = {};
    for (const toolName of this.tools.keys()) {
      const toolStats = this.getToolStats(toolName);
      if (toolStats) {
        stats[toolName] = toolStats;
      }
    }
    return stats;
  }

  /**
   * 获取工具使用统计摘要
   */
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

  /**
   * 语义搜索工具（使用LLM）
   */
  async semanticSearchTools(query: string, limit: number = 5): Promise<ToolRecommendation[]> {
    if (this.llmClassifier) {
      try {
        const availableTools = this.listTools();
        const result = await this.llmClassifier.selectTool(query, availableTools, {});

        if (result.selectedTool) {
          const tool = this.get(result.selectedTool);
          return [{
            name: tool!.name,
            description: tool!.description,
            confidence: result.confidence,
            reason: result.reasoning || '语义匹配'
          }];
        }
      } catch (error) {
        this.logger.warn(`Semantic search failed: ${error.message}`);
      }
    }

    // 回退到关键词搜索
    return this.recommendTools({ query }).slice(0, limit);
  }

  /**
   * 批量选择工具（多候选）
   */
  selectMultipleTools(context: { query?: string; intent?: any; messages?: any[] }, maxTools: number = 3): ToolRecommendation[] {
    const recommendations = this.recommendTools(context);

    // 合并相似工具
    const merged: ToolRecommendation[] = [];
    const seen = new Set<string>();

    for (const rec of recommendations) {
      if (!seen.has(rec.name)) {
        merged.push(rec);
        seen.add(rec.name);
      }
    }

    // 按置信度排序
    merged.sort((a, b) => b.confidence - a.confidence);

    return merged.slice(0, maxTools);
  }
}

interface ToolExecutionStats {
  totalCalls: number;
  successCalls: number;
  failureCalls: number;
  totalTime: number;
  lastStartTime: number | null;
  lastError: string | null;
}
