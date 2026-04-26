import { Injectable } from '@nestjs/common';

/**
 * Token 估算平均值（中文约 2 字符/token，英文约 4 字符/token）
 */
const AVG_CHARS_PER_TOKEN = 3;

/**
 * 默认 Token 预算分配
 */
export const DEFAULT_TOKEN_BUDGET = {
  system: 2000,
  memory: 4000,
  knowledge: 3000,
  toolResults: 2000,
  currentQuery: 500,
  reserved: 1500,
};

/**
 * 组装上下文配置接口
 */
export interface AssemblyConfig {
  tokenBudget: Record<string, number>;
  enableMemory: boolean;
  enableKnowledge: boolean;
  enableToolResults: boolean;
  priorityOrder: string[];
  maxContextItems: number;
}

/**
 * 上下文项接口
 */
export interface ContextItem {
  type: string;
  content: any;
  metadata: Record<string, any>;
  tokenCount: number | null;
}

/**
 * 组装结果接口
 */
export interface AssemblyResult {
  context: ContextItem[];
  prompt: string;
  metadata: {
    totalTokens: number;
    itemCount: number;
    config: AssemblyConfig;
    assemblyTime: number;
  };
}

/**
 * 上下文组装服务
 * 组装用户 query、记忆、知识库、工具结果等到完整上下文
 */
@Injectable()
export class ContextAssemblerService {
  private defaultTokenLimit = 10000;
  private memoryService: any = null;
  private knowledgeService: any = null;
  private toolExecutor: any = null;
  private systemPromptTemplate: string | null = null;
  private contextItems: Map<string, ContextItem> = new Map();

  private stats = {
    totalAssemblies: 0,
    totalTokens: 0,
    averageTokens: 0,
    truncationCount: 0,
  };

  /**
   * 主组装接口
   */
  async assemble(
    query: string,
    options: {
      memory?: any[];
      knowledge?: any[];
      toolResults?: any[];
      systemPrompt?: string;
      tokenLimit?: number;
      tokenBudget?: Record<string, number>;
      assemblyConfig?: AssemblyConfig;
    } = {},
  ): Promise<AssemblyResult> {
    const startTime = Date.now();
    this.stats.totalAssemblies++;

    try {
      const config = options.assemblyConfig || this.createDefaultConfig(options.tokenBudget);
      const tokenLimit = options.tokenLimit || this.defaultTokenLimit;

      // 重置上下文项
      this.contextItems.clear();

      // 1. 添加工具结果
      if (config.enableToolResults && options.toolResults) {
        await this.addToolResults(options.toolResults, config.tokenBudget.toolResults);
      }

      // 2. 添加记忆
      if (config.enableMemory && options.memory) {
        await this.addMemory(options.memory, config.tokenBudget.memory);
      }

      // 3. 添加知识库结果
      if (config.enableKnowledge && options.knowledge) {
        await this.addKnowledge(options.knowledge, config.tokenBudget.knowledge);
      }

      // 4. 添加系统提示
      if (options.systemPrompt) {
        this.addItem('system', options.systemPrompt, config.tokenBudget.system);
      } else if (this.systemPromptTemplate) {
        this.addItem('system', this.systemPromptTemplate, config.tokenBudget.system);
      }

      // 5. 添加当前查询
      this.addItem('query', query, config.tokenBudget.currentQuery);

      // 6. 按优先级排序并裁剪
      const assembled = this.prioritizeAndTrim(config, tokenLimit);

      // 7. 构建最终 Prompt
      const prompt = this.buildPrompt(assembled);

      // 8. 记录统计
      const tokens = this.countTotalTokens(assembled);
      this.stats.totalTokens += tokens;
      this.stats.averageTokens = (this.stats.averageTokens * (this.stats.totalAssemblies - 1) + tokens) / this.stats.totalAssemblies;

      return {
        context: assembled,
        prompt,
        metadata: {
          totalTokens: tokens,
          itemCount: assembled.length,
          config,
          assemblyTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 创建默认配置
   */
  private createDefaultConfig(tokenBudget?: Record<string, number>): AssemblyConfig {
    return {
      tokenBudget: tokenBudget || { ...DEFAULT_TOKEN_BUDGET },
      enableMemory: true,
      enableKnowledge: true,
      enableToolResults: true,
      priorityOrder: ['memory', 'knowledge', 'toolResults'],
      maxContextItems: 20,
    };
  }

  /**
   * 添加记忆上下文
   */
  async addMemory(messages: any[], maxTokens: number): Promise<void> {
    if (!messages || messages.length === 0) return;

    if (this.memoryService) {
      try {
        const memories = await this.memoryService.getRecentMessages(messages, { maxTokens });
        this.addItem('memory', memories, maxTokens);
      } catch (error) {
        console.warn('[ContextAssembler] Memory service error:', error.message);
        this.addContextArray('memory', messages, maxTokens);
      }
    } else {
      this.addContextArray('memory', messages, maxTokens);
    }
  }

  /**
   * 添加知识库结果
   */
  async addKnowledge(docs: any[], maxTokens: number): Promise<void> {
    if (!docs || docs.length === 0) return;

    if (this.knowledgeService) {
      try {
        if (typeof docs === 'string') {
          const results = await this.knowledgeService.search(docs, { maxTokens });
          this.addItem('knowledge', results, maxTokens);
        } else {
          this.addContextArray('knowledge', docs, maxTokens);
        }
      } catch (error) {
        console.warn('[ContextAssembler] Knowledge service error:', error.message);
        this.addContextArray('knowledge', typeof docs === 'string' ? [] : docs, maxTokens);
      }
    } else {
      this.addContextArray('knowledge', typeof docs === 'string' ? [] : docs, maxTokens);
    }
  }

  /**
   * 添加工具执行结果
   */
  async addToolResults(results: any[], maxTokens: number): Promise<void> {
    if (!results || results.length === 0) return;

    const sorted = [...results].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    this.addContextArray('toolResults', sorted, maxTokens);
  }

  /**
   * 添加上下文项
   */
  private addItem(type: string, content: any, maxTokens?: number): void {
    if (!content) return;

    const item: ContextItem = {
      type,
      content,
      metadata: {},
      tokenCount: null,
    };

    item.tokenCount = this.calculateTokens(content);

    if (maxTokens && item.tokenCount > maxTokens) {
      const truncated = this.truncate(content, maxTokens);
      item.content = truncated;
      item.metadata = { ...item.metadata, truncated: true };
      item.tokenCount = maxTokens;
      this.stats.truncationCount++;
    }

    this.contextItems.set(type, item);
  }

  /**
   * 添加上下文数组
   */
  private addContextArray(type: string, items: any[], maxTokens: number): void {
    if (!items || items.length === 0) return;

    let totalTokens = 0;
    const selectedItems: any[] = [];
    const maxItems = 10;

    for (let i = 0; i < Math.min(items.length, maxItems); i++) {
      const item = items[i];
      const content = typeof item === 'string' ? item : JSON.stringify(item);
      const itemTokens = Math.ceil(content.length / AVG_CHARS_PER_TOKEN);

      if (totalTokens + itemTokens <= maxTokens || selectedItems.length === 0) {
        selectedItems.push(item);
        totalTokens += itemTokens;
      } else {
        break;
      }
    }

    if (selectedItems.length > 0) {
      this.stats.truncationCount++;
      const merged = items.length > selectedItems.length ? { items: selectedItems, truncated: true, originalCount: items.length } : selectedItems;
      this.addItem(type, merged, maxTokens);
    }
  }

  /**
   * 按优先级排序并裁剪
   */
  private prioritizeAndTrim(config: AssemblyConfig, tokenLimit: number): ContextItem[] {
    const orderedTypes = ['system', ...config.priorityOrder, 'query'];
    const sorted: ContextItem[] = [];

    for (const type of orderedTypes) {
      const item = this.contextItems.get(type);
      if (item) {
        sorted.push(item);
      }
    }

    let totalTokens = this.countTotalTokens(sorted);

    if (totalTokens <= tokenLimit) {
      return sorted;
    }

    // 从低优先级开始裁剪
    const lowPriorityFirst = [...sorted].reverse();
    const trimmed: ContextItem[] = [];

    for (const item of lowPriorityFirst) {
      if (totalTokens <= tokenLimit) {
        trimmed.unshift(item);
        continue;
      }

      const remaining = tokenLimit - this.countTotalTokens(trimmed) - 500;
      if (remaining > 1000) {
        const truncated = this.truncate(item.content, remaining);
        trimmed.unshift({ ...item, content: truncated, metadata: { ...item.metadata, truncated: true } });
        totalTokens = this.countTotalTokens(trimmed);
        this.stats.truncationCount++;
      }
    }

    return trimmed;
  }

  /**
   * 构建最终 Prompt
   */
  buildPrompt(context: ContextItem[]): string {
    if (!context || context.length === 0) {
      return '';
    }

    const parts: string[] = [];

    for (const item of context) {
      switch (item.type) {
        case 'system':
          parts.push(`[系统提示]\n${item.content}`);
          break;
        case 'memory':
          parts.push(`[相关记忆]\n${this.formatMemory(item.content)}`);
          break;
        case 'knowledge':
          parts.push(`[知识库]\n${this.formatKnowledge(item.content)}`);
          break;
        case 'toolResults':
          parts.push(`[工具执行结果]\n${this.formatToolResults(item.content)}`);
          break;
        case 'query':
          parts.push(`[用户查询]\n${item.content}`);
          break;
        default:
          parts.push(`[${item.type}]\n${item.content}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * 格式化记忆内容
   */
  private formatMemory(memory: any): string {
    if (Array.isArray(memory)) {
      return memory
        .map((m) => {
          const role = m.role || 'user';
          const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          return `${role === 'user' ? '用户' : '助手'}: ${content}`;
        })
        .join('\n');
    }
    return String(memory);
  }

  /**
   * 格式化知识库内容
   */
  private formatKnowledge(knowledge: any): string {
    if (Array.isArray(knowledge)) {
      return knowledge
        .map((doc, idx) => {
          const content = doc.content || doc.text || JSON.stringify(doc);
          const source = doc.source || doc.url || '';
          const score = doc.score !== undefined ? ` (相关度: ${(doc.score * 100).toFixed(1)}%)` : '';
          return `[${idx + 1}] ${content}${source ? `\n来源: ${source}` : ''}${score}`;
        })
        .join('\n\n');
    }
    return String(knowledge);
  }

  /**
   * 格式化工具执行结果
   */
  private formatToolResults(results: any): string {
    if (Array.isArray(results)) {
      return results
        .map((r) => {
          const name = r.name || r.tool || 'unknown';
          const status = r.success !== false ? '成功' : '失败';
          const content = r.result || r.output || JSON.stringify(r);
          return `工具: ${name} [${status}]\n结果: ${content}`;
        })
        .join('\n\n');
    }
    return String(results);
  }

  /**
   * 计算 Token 数
   */
  private calculateTokens(content: any): number {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
  }

  /**
   * 截断内容
   */
  private truncate(content: any, maxTokens: number): any {
    const maxChars = maxTokens * AVG_CHARS_PER_TOKEN;
    if (typeof content === 'string') {
      return content.substring(0, maxChars) + '...';
    }
    return content;
  }

  /**
   * 计算总 Token 数
   */
  private countTotalTokens(items: ContextItem[]): number {
    return items.reduce((sum, item) => sum + (item.tokenCount || 0), 0);
  }

  /**
   * 设置系统提示模板
   */
  setSystemPromptTemplate(template: string): void {
    this.systemPromptTemplate = template;
  }

  /**
   * 设置记忆服务
   */
  setMemoryService(service: any): void {
    this.memoryService = service;
  }

  /**
   * 设置知识库服务
   */
  setKnowledgeService(service: any): void {
    this.knowledgeService = service;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      currentContextItems: this.contextItems.size,
    };
  }
}
