/**
 * ContextAssembler - 上下文组装器
 *
 * 功能说明：
 * - 组装用户 query、记忆、知识库、工具结果等到完整上下文
 * - Token 数量控制与优先级排序
 * - 构建最终 Prompt
 *
 * 设计模式：
 * - 组合模式：多源上下文组合
 * - 策略模式：不同组装策略
 * - 装饰器模式：上下文增强
 *
 * 企业级要点：
 * - 控制 Token 消耗在预算内
 * - 优先级：最新记忆 > 知识库 > 工具结果
 * - 支持多种上下文来源灵活组合
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

const EventEmitter = require('events');
const AppError = require('../../common/errors/AppError');
const createLogger = require('../../common/logger');
const logger = createLogger('ContextAssembler');

// Token 估算平均值（中文约 2 字符/token，英文约 4 字符/token）
const AVG_CHARS_PER_TOKEN = 3;

// 默认 Token 预算分配
const DEFAULT_TOKEN_BUDGET = {
  system: 2000,
  memory: 4000,
  knowledge: 3000,
  toolResults: 2000,
  currentQuery: 500,
  reserved: 1500  // 保留空间
};

// 上下文项
class ContextItem {
  constructor(type, content, metadata = {}) {
    this.type = type;
    this.content = content;
    this.metadata = metadata;
    this.tokenCount = null;
  }

  /**
   * 计算 Token 数
   */
  calculateTokens() {
    if (this.tokenCount !== null) {
      return this.tokenCount;
    }
    const text = typeof this.content === 'string'
      ? this.content
      : JSON.stringify(this.content);
    this.tokenCount = Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
    return this.tokenCount;
  }

  /**
   * 截断内容以适应 Token 限制
   */
  truncate(maxTokens) {
    if (this.calculateTokens() <= maxTokens) {
      return this;
    }
    const maxChars = maxTokens * AVG_CHARS_PER_TOKEN;
    let truncated;
    if (typeof this.content === 'string') {
      truncated = this.content.substring(0, maxChars) + '...';
    } else {
      truncated = this.content;
    }
    return new ContextItem(this.type, truncated, {
      ...this.metadata,
      truncated: true,
      originalTokens: this.calculateTokens(),
      maxTokens
    });
  }
}

/**
 * 组装上下文配置
 */
class AssemblyConfig {
  constructor(options = {}) {
    this.tokenBudget = options.tokenBudget || { ...DEFAULT_TOKEN_BUDGET };
    this.enableMemory = options.enableMemory !== false;
    this.enableKnowledge = options.enableKnowledge !== false;
    this.enableToolResults = options.enableToolResults !== false;
    this.priorityOrder = options.priorityOrder || ['memory', 'knowledge', 'toolResults'];
    this.maxContextItems = options.maxContextItems || 20;
  }

  /**
   * 获取总 Token 预算
   */
  getTotalBudget() {
    return Object.values(this.tokenBudget).reduce((sum, val) => sum + val, 0);
  }
}

/**
 * 上下文组装器
 */
class ContextAssembler extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.memoryService - 记忆服务（可选）
   * @param {Object} options.knowledgeService - 知识库服务（可选）
   * @param {Object} options.toolExecutor - 工具执行器（可选）
   * @param {number} options.defaultTokenLimit - 默认 Token 限制
   */
  constructor(options = {}) {
    super();

    this.memoryService = options.memoryService || null;
    this.knowledgeService = options.knowledgeService || null;
    this.toolExecutor = options.toolExecutor || null;
    this.defaultTokenLimit = options.defaultTokenLimit || 10000;

    // 上下文项存储
    this.contextItems = new Map();

    // 系统提示模板
    this.systemPromptTemplate = options.systemPromptTemplate || null;

    // 统计信息
    this.stats = {
      totalAssemblies: 0,
      totalTokens: 0,
      averageTokens: 0,
      truncationCount: 0
    };
  }

  /**
   * 主组装接口
   * @param {string} query - 用户查询
   * @param {Object} options - {
   *   memory?: Message[],       // 记忆消息
   *   knowledge?: Object[],     // 知识库结果
   *   toolResults?: Object[],   // 工具执行结果
   *   systemPrompt?: string,     // 系统提示
   *   tokenLimit?: number,      // Token 限制
   *   assemblyConfig?: AssemblyConfig  // 组装配置
   * }
   * @returns {Promise<Object>} 组装后的上下文
   */
  async assemble(query, options = {}) {
    const startTime = Date.now();
    this.stats.totalAssemblies++;

    try {
      // 1. 解析配置
      const config = options.assemblyConfig || new AssemblyConfig({
        tokenBudget: options.tokenBudget
      });

      const tokenLimit = options.tokenLimit || this.defaultTokenLimit;

      // 2. 重置上下文项
      this.contextItems.clear();

      // 3. 添加工具结果（最先添加，因为时效性最高）
      if (config.enableToolResults && options.toolResults) {
        await this.addToolResults(options.toolResults, config.tokenBudget.toolResults);
      }

      // 4. 添加记忆
      if (config.enableMemory && options.memory) {
        await this.addMemory(options.memory, config.tokenBudget.memory);
      }

      // 5. 添加知识库结果
      if (config.enableKnowledge && options.knowledge) {
        await this.addKnowledge(options.knowledge, config.tokenBudget.knowledge);
      }

      // 6. 添加系统提示
      if (options.systemPrompt) {
        this._addItem('system', options.systemPrompt, config.tokenBudget.system);
      } else if (this.systemPromptTemplate) {
        const rendered = this.systemPromptTemplate;
        this._addItem('system', rendered, config.tokenBudget.system);
      }

      // 7. 添加当前查询
      this._addItem('query', query, config.tokenBudget.currentQuery);

      // 8. 按优先级排序并裁剪
      const assembled = this._prioritizeAndTrim(config, tokenLimit);

      // 9. 构建最终 Prompt
      const prompt = this.buildPrompt(assembled);

      // 10. 记录统计
      const tokens = this._countTotalTokens(assembled);
      this._recordStats(tokens, startTime);

      return {
        context: assembled,
        prompt,
        metadata: {
          totalTokens: tokens,
          itemCount: assembled.length,
          config,
          assemblyTime: Date.now() - startTime
        }
      };

    } catch (error) {
      this.emit('assembly_error', { query, error: error.message });
      throw AppError.fromError(error, 'SYS_INTERNAL');
    }
  }

  /**
   * 添加记忆上下文
   * @param {Array} messages - 记忆消息
   * @param {number} maxTokens - 最大 Token 数
   */
  async addMemory(messages, maxTokens) {
    if (!messages || messages.length === 0) {
      return this;
    }

    // 如果有记忆服务，使用服务获取
    if (this.memoryService) {
      try {
        const memories = await this.memoryService.getRecentMessages(messages, {
          maxTokens
        });
        this._addItem('memory', memories, maxTokens);
      } catch (error) {
        logger.warn('Memory service error', { error: error.message });
        // 后备：直接使用传入的消息
        this._addContextArray('memory', messages, maxTokens);
      }
    } else {
      // 直接使用传入的消息
      this._addContextArray('memory', messages, maxTokens);
    }

    return this;
  }

  /**
   * 添加知识库结果
   * @param {Array} docs - 知识库文档
   * @param {number} maxTokens - 最大 Token 数
   */
  async addKnowledge(docs, maxTokens) {
    if (!docs || docs.length === 0) {
      return this;
    }

    // 如果有知识库服务，使用服务检索
    if (this.knowledgeService) {
      try {
        // 如果 docs 是查询字符串，重新检索
        if (typeof docs === 'string') {
          const results = await this.knowledgeService.search(docs, { maxTokens });
          this._addItem('knowledge', results, maxTokens);
        } else {
          // 使用已有的检索结果
          this._addContextArray('knowledge', docs, maxTokens);
        }
      } catch (error) {
        logger.warn('Knowledge service error', { error: error.message });
        this._addContextArray('knowledge', typeof docs === 'string' ? [] : docs, maxTokens);
      }
    } else {
      this._addContextArray('knowledge', typeof docs === 'string' ? [] : docs, maxTokens);
    }

    return this;
  }

  /**
   * 添加工具执行结果
   * @param {Array} results - 工具执行结果
   * @param {number} maxTokens - 最大 Token 数
   */
  async addToolResults(results, maxTokens) {
    if (!results || results.length === 0) {
      return this;
    }

    // 按时间排序（最新的在前）
    const sorted = [...results].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    this._addContextArray('toolResults', sorted, maxTokens);

    return this;
  }

  /**
   * 构建最终 Prompt
   * @param {Array} context - 已组装的上下文项
   * @returns {string} 格式化后的 Prompt
   */
  buildPrompt(context) {
    if (!context || context.length === 0) {
      return '';
    }

    const parts = [];

    for (const item of context) {
      switch (item.type) {
        case 'system':
          parts.push(`[系统提示]\n${item.content}`);
          break;

        case 'memory':
          parts.push(`[相关记忆]\n${this._formatMemory(item.content)}`);
          break;

        case 'knowledge':
          parts.push(`[知识库]\n${this._formatKnowledge(item.content)}`);
          break;

        case 'toolResults':
          parts.push(`[工具执行结果]\n${this._formatToolResults(item.content)}`);
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
   * @private
   */
  _formatMemory(memory) {
    if (Array.isArray(memory)) {
      return memory
        .map(m => {
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
   * @private
   */
  _formatKnowledge(knowledge) {
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
   * @private
   */
  _formatToolResults(results) {
    if (Array.isArray(results)) {
      return results
        .map(r => {
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
   * 添加上下文项
   * @private
   */
  _addItem(type, content, maxTokens) {
    if (!content) return;

    const item = new ContextItem(type, content);
    item.calculateTokens();

    // 如果超出限制，截断
    if (maxTokens && item.tokenCount > maxTokens) {
      const truncated = item.truncate(maxTokens);
      this.stats.truncationCount++;
      this.contextItems.set(type, truncated);
    } else {
      this.contextItems.set(type, item);
    }
  }

  /**
   * 添加上下文数组
   * @private
   */
  _addContextArray(type, items, maxTokens) {
    if (!items || items.length === 0) return;

    let totalTokens = 0;
    const selectedItems = [];
    const maxItems = 10; // 最多保留 10 项

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
      const merged = Array.isArray(items) && items.length > selectedItems.length
        ? { items: selectedItems, truncated: true, originalCount: items.length }
        : selectedItems;
      this._addItem(type, merged, maxTokens);
    }
  }

  /**
   * 按优先级排序并裁剪
   * @private
   */
  _prioritizeAndTrim(config, tokenLimit) {
    // 1. 按优先级排序
    const orderedTypes = ['system', ...config.priorityOrder, 'query'];
    const sorted = [];

    for (const type of orderedTypes) {
      const item = this.contextItems.get(type);
      if (item) {
        sorted.push(item);
      }
    }

    // 2. 如果超出限制，逐步裁剪
    let totalTokens = this._countTotalTokens(sorted);

    if (totalTokens <= tokenLimit) {
      return sorted;
    }

    // 从低优先级开始裁剪
    const lowPriorityFirst = [...sorted].reverse();
    const trimmed = [];

    for (const item of lowPriorityFirst) {
      if (totalTokens <= tokenLimit) {
        trimmed.unshift(item);
        continue;
      }

      const remaining = tokenLimit - this._countTotalTokens(trimmed) - 500; // 保留一些空间
      if (remaining > 1000) {
        const truncated = item.truncate(remaining);
        totalTokens = this._countTotalTokens([...trimmed, truncated]);
        trimmed.unshift(truncated);
        this.stats.truncationCount++;
      }
    }

    return trimmed;
  }

  /**
   * 计算总 Token 数
   * @private
   */
  _countTotalTokens(items) {
    return items.reduce((sum, item) => sum + item.calculateTokens(), 0);
  }

  /**
   * 记录统计信息
   * @private
   */
  _recordStats(tokens, startTime) {
    this.stats.totalTokens += tokens;
    this.stats.averageTokens =
      (this.stats.averageTokens * (this.stats.totalAssemblies - 1) + tokens)
      / this.stats.totalAssemblies;
  }

  /**
   * 设置系统提示模板
   * @param {string} template - 系统提示模板
   */
  setSystemPromptTemplate(template) {
    this.systemPromptTemplate = template;
    return this;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      currentContextItems: this.contextItems.size
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalAssemblies: 0,
      totalTokens: 0,
      averageTokens: 0,
      truncationCount: 0
    };
    return this;
  }
}

module.exports = {
  ContextAssembler,
  ContextItem,
  AssemblyConfig,
  DEFAULT_TOKEN_BUDGET,
  AVG_CHARS_PER_TOKEN
};
