/**
 * QueryRewriteService - 问题重写/补全上下文服务 (DI版本)
 *
 * 企业级设计：
 * - 补全上下文：利用会话历史恢复省略信息（代词、缩写等）
 * - 省略信息恢复：从上文中推断缺失的主语、宾语、时态
 * - 语义增强：对模糊查询进行语义扩展，提高检索召回率
 * - 依赖注入：通过 DI 容器解析依赖，符合分层架构
 *
 * 使用场景：
 * - 用户说"它的缺点是什么" -> 需要从上文推断"它"指代什么
 * - 用户说"继续" -> 需要补充为完整操作指令
 * - 用户说"更便宜" -> 需要语义扩展为"价格更低、性价比更高"等
 *
 * @example
 * // DI 容器注册
 * container.register('modelClient', MiniMaxChatClient)
 *   .singleton()
 *   .inject({ apiKey: 'env:MINIMAX_API_KEY' });
 *
 * container.register('queryRewriteService', QueryRewriteService)
 *   .inject({ modelClient: 'modelClient' });
 *
 * // 解析使用
 * const service = container.resolve('queryRewriteService');
 * const rewritten = await service.rewrite('它的优势是什么', { messages: [...] });
 */

/**
 * 重写类型枚举
 */
const REWRITE_TYPES = {
  /** 上下文补全：从历史消息恢复省略信息 */
  CONTEXTUAL_COMPLETION: 'contextual_completion',
  /** 语义扩展：扩展关键词同义词、近义词 */
  SEMANTIC_EXPANSION: 'semantic_expansion',
  /** 意图保持：保持原查询核心意图的同时规范化表达 */
  INTENT_PRESERVATION: 'intent_preservation',
  /** 歧义消除：消除指代歧义 */
  DISAMBIGUATION: 'disambiguation',
};

/**
 * 置信度阈值
 */
const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.3,
};

/**
 * QueryRewriteService
 *
 * 支持通过 DI 容器注入依赖：
 * @param {Object} options - 依赖配置（由 DI 容器注入）
 * @param {Object} options.modelClient - ChatModelClient 实例
 * @param {string} options.defaultModel - 默认模型
 * @param {boolean} options.enableContextCompletion - 启用上下文补全
 * @param {boolean} options.enableSemanticExpansion - 启用语义扩展
 * @param {number} options.maxHistoryMessages - 最大历史消息数
 * @param {number} options.confidenceThreshold - 置信度阈值
 */
class QueryRewriteService {
  /**
   * 构造函数接受 DI 注入的依赖
   *
   * @param {Object} options - DI 依赖对象
   * @param {Object} [options.modelClient] - 模型客户端（可选，用于兼容旧代码）
   * @param {string} [options.defaultModel='MiniMax-M2.7'] - 默认模型
   * @param {boolean} [options.enableContextCompletion=true] - 启用上下文补全
   * @param {boolean} [options.enableSemanticExpansion=true] - 启用语义扩展
   * @param {number} [options.maxHistoryMessages=10] - 最大历史消息数
   * @param {number} [options.confidenceThreshold=0.5] - 置信度阈值
   */
  constructor(options = {}) {
    // 模型客户端 - 优先使用注入的依赖，否则兼容旧代码模式
    this.modelClient = options.modelClient || null;

    // 配置参数 - 支持注入或直接传入
    this.defaultModel = options.defaultModel || 'MiniMax-M2.7';
    this.enableContextCompletion = options.enableContextCompletion !== false;
    this.enableSemanticExpansion = options.enableSemanticExpansion !== false;
    this.maxHistoryMessages = options.maxHistoryMessages || 10;
    this.confidenceThreshold = options.confidenceThreshold || CONFIDENCE_THRESHOLDS.MEDIUM;

    // 统计信息
    this.stats = {
      totalRewrites: 0,
      contextCompletions: 0,
      semanticExpansions: 0,
      intentPreservations: 0,
      failures: 0,
      averageLatencyMs: 0,
    };
  }

  /**
   * 主重写接口
   * 结合上下文补全、语义扩展、意图保持等多种策略
   *
   * @param {string} query - 用户查询
   * @param {Object} context - 上下文信息
   * @param {Array<{role: string, content: string}>} context.messages - 历史消息列表
   * @param {Object} [context.metadata] - 额外元数据
   * @returns {Promise<Object>} { rewritten: string, type: string, confidence: number, changes: string[] }
   */
  async rewrite(query, context = {}) {
    const startTime = Date.now();
    this.stats.totalRewrites++;

    try {
      if (!query || query.trim() === '') {
        return {
          rewritten: query,
          type: REWRITE_TYPES.INTENT_PRESERVATION,
          confidence: 1.0,
          changes: [],
        };
      }

      const trimmedQuery = query.trim();

      // 1. 判断是否需要重写（上下文补全）
      let needsContextCompletion = false;
      if (this.enableContextCompletion && context.messages && context.messages.length > 0) {
        needsContextCompletion = this._needsContextCompletion(trimmedQuery);
      }

      // 2. 判断是否需要语义扩展
      let needsSemanticExpansion = this._needsSemanticExpansion(trimmedQuery);

      // 3. 根据情况选择重写策略
      let rewrittenQuery = trimmedQuery;
      let rewriteType = REWRITE_TYPES.INTENT_PRESERVATION;
      const changes = [];

      if (needsContextCompletion) {
        // 上下文补全
        const result = await this._completeContext(trimmedQuery, context.messages || []);
        rewrittenQuery = result.query;
        rewriteType = REWRITE_TYPES.CONTEXTUAL_COMPLETION;
        changes.push(`上下文补全: "${result.reason}"`);
        this.stats.contextCompletions++;
      } else if (needsSemanticExpansion) {
        // 语义扩展
        const result = await this._semanticExpansion(trimmedQuery);
        rewrittenQuery = result.query;
        rewriteType = REWRITE_TYPES.SEMANTIC_EXPANSION;
        changes.push(`语义扩展: ${result.expansions.join(', ')}`);
        this.stats.semanticExpansions++;
      } else {
        // 意图保持（轻微规范化）
        const result = await this._intentPreservation(trimmedQuery);
        rewrittenQuery = result.query;
        if (result.changed) {
          changes.push(`规范化: ${result.reason}`);
        }
        this.stats.intentPreservations++;
      }

      // 计算置信度
      const confidence = this._calculateConfidence(trimmedQuery, rewrittenQuery, needsContextCompletion, needsSemanticExpansion);

      // 更新延迟统计
      this._updateLatency(startTime);

      return {
        rewritten: rewrittenQuery,
        type: rewriteType,
        confidence,
        changes,
        original: trimmedQuery,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.stats.failures++;
      console.error('[QueryRewriteService] Rewrite error:', error);

      // 降级：返回原始查询
      return {
        rewritten: query,
        type: REWRITE_TYPES.INTENT_PRESERVATION,
        confidence: 0.3,
        changes: [],
        error: error.message,
      };
    }
  }

  /**
   * 扩展查询（专门用于语义扩展）
   * 将查询扩展为多个相关表达，提高检索召回率
   *
   * @param {string} query - 用户查询
   * @param {Object} [options]
   * @param {number} [options.maxExpansions=5] - 最大扩展数量
   * @returns {Promise<Object>} { query: string, expansions: string[], confidence: number }
   */
  async expand(query, options = {}) {
    if (!this.modelClient) {
      throw new Error('[QueryRewriteService] modelClient not injected. Please use DI container or provide modelClient in constructor.');
    }

    const maxExpansions = options.maxExpansions || 5;

    try {
      const prompt = `你是一个查询扩展专家。请为给定查询生成多个语义相近的表达变体。

## 查询
"${query}"

## 要求
1. 生成 ${maxExpansions} 个语义相近但表达不同的查询变体
2. 每个变体应该从不同角度描述同一主题
3. 可以包含同义词、反义词对比、上下位词等
4. 只返回查询，不要解释

## 格式要求
返回JSON数组格式：
["扩展1", "扩展2", "扩展3", ...]`;

      const response = await this.modelClient.chat({
        messages: [
          { role: 'system', content: '你是一个JSON生成助手，只返回有效的JSON数组，不要其他内容。' },
          { role: 'user', content: prompt },
        ],
        model: this.defaultModel,
        options: {
          temperature: 0.7,
          max_tokens: 500,
        },
      });

      const content = response.content?.[0]?.text || response.content || '';
      const expansions = this._parseJSONArray(content);

      // 合并原始查询和扩展
      const allQueries = [query, ...expansions.slice(0, maxExpansions)];
      const mergedQuery = allQueries.join(' | ');

      return {
        query: mergedQuery,
        expansions,
        confidence: expansions.length > 0 ? 0.8 : 0.5,
      };
    } catch (error) {
      console.error('[QueryRewriteService] Expand error:', error);
      return {
        query,
        expansions: [],
        confidence: 0.3,
      };
    }
  }

  /**
   * 补全省略信息（专门用于上下文补全）
   *
   * @param {string} query - 可能包含省略信息的查询
   * @param {Array<{role: string, content: string}>} messages - 历史消息
   * @returns {Promise<Object>} { query: string, filledParts: Object, confidence: number }
   */
  async complete(query, messages = []) {
    if (!this.modelClient) {
      throw new Error('[QueryRewriteService] modelClient not injected. Please use DI container or provide modelClient in constructor.');
    }

    if (!query || query.trim() === '') {
      return { query, filledParts: {}, confidence: 1.0 };
    }

    try {
      // 构建上下文摘要
      const contextSummary = this._buildContextSummary(messages);

      if (!contextSummary) {
        return { query, filledParts: {}, confidence: 0.5 };
      }

      const prompt = `你是一个上下文补全专家。请根据对话历史补全用户查询中的省略信息。

## 对话历史
${contextSummary}

## 当前查询
"${query}"

## 补全规则
1. 如果查询是完整的，返回原查询
2. 如果查询包含代词（它、这个、那个、这、那等），根据上下文推断指代对象
3. 如果查询包含省略的主语或宾语，根据话题连贯性补全
4. 如果查询表达不完整（如"继续"、"然后呢"），根据上下文推断完整意图

## 返回格式
{
  "completed_query": "补全后的完整查询",
  "filled_parts": {
    "代词/省略": "推断的实际指代"
  },
  "confidence": 0.0-1.0
}`;

      const response = await this.modelClient.chat({
        messages: [
          { role: 'system', content: '你是一个JSON生成助手，只返回有效的JSON，不要其他内容。' },
          { role: 'user', content: prompt },
        ],
        model: this.defaultModel,
        options: {
          temperature: 0.3,
          max_tokens: 500,
        },
      });

      const content = response.content?.[0]?.text || response.content || '';
      const parsed = this._parseJSONResponse(content);

      return {
        query: parsed.completed_query || query,
        filledParts: parsed.filled_parts || {},
        confidence: parsed.confidence || 0.5,
      };
    } catch (error) {
      console.error('[QueryRewriteService] Complete error:', error);
      return { query, filledParts: {}, confidence: 0.3 };
    }
  }

  /**
   * 判断是否需要上下文补全
   * @private
   */
  _needsContextCompletion(query) {
    // 代词和指示词模式
    const pronounPatterns = [
      /^(它|这个|那个|这|那|这些|那些)/,
      /^(他们|她们|它们|各位|大家)/,
      /^(我|你|他|她)/,
      /^(上述|前述|上面|刚才|之前)/,
      /继续[吗|啊|呀]?/,
      /然后[呢|的]?/,
      /还有呢/,
      /除此之外/,
      /^同上$/,
    ];

    // 省略主语模式
    const ellipsisPatterns = [
      /^[能会要请帮给将].{0,5}$/,
      /^[是很有有没有].{0,10}$/,
      /^[好吗对吗可以吗]$/,
    ];

    return (
      pronounPatterns.some(p => p.test(query)) ||
      ellipsisPatterns.some(p => p.test(query)) ||
      query.length < 5
    );
  }

  /**
   * 判断是否需要语义扩展
   * @private
   */
  _needsSemanticExpansion(query) {
    // 短查询或模糊概念
    const shortQuery = query.length < 15;
    const vaguePatterns = [
      /^(什么是|如何|怎么|怎样)/,
      /[东西事]/,
      /(好|坏|优|缺)/,
      /(便宜|贵|快|慢)/,
    ];

    return shortQuery && vaguePatterns.some(p => p.test(query));
  }

  /**
   * 上下文补全
   * @private
   */
  async _completeContext(query, messages) {
    const result = await this.complete(query, messages.slice(-this.maxHistoryMessages));
    return {
      query: result.query,
      reason: Object.entries(result.filledParts).map(([k, v]) => `"${k}" -> "${v}"`).join(', ') || '代词补全',
    };
  }

  /**
   * 语义扩展
   * @private
   */
  async _semanticExpansion(query) {
    const result = await this.expand(query, { maxExpansions: 3 });
    return {
      query: result.query.split(' | ')[0], // 使用第一个扩展作为主查询
      expansions: result.expansions.slice(0, 3),
    };
  }

  /**
   * 意图保持（轻微规范化）
   * @private
   */
  async _intentPreservation(query) {
    // 轻微规范化：去除多余空格、标点
    const normalized = query
      .replace(/\s+/g, ' ')
      .replace(/[。！？]+$/, '')
      .trim();

    return {
      query: normalized,
      changed: normalized !== query,
      reason: '轻微规范化',
    };
  }

  /**
   * 计算置信度
   * @private
   */
  _calculateConfidence(original, rewritten, needsContext, needsExpansion) {
    let confidence = 0.8;

    if (needsContext) confidence += 0.1;
    if (needsExpansion) confidence += 0.05;
    if (rewritten !== original) confidence += 0.05;
    if (rewritten.length < original.length * 0.5) confidence -= 0.2;
    if (rewritten.length > original.length * 3) confidence -= 0.1;

    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * 构建上下文摘要
   * @private
   */
  _buildContextSummary(messages) {
    if (!messages || messages.length === 0) return null;

    const recentMessages = messages.slice(-this.maxHistoryMessages);
    return recentMessages
      .map((m, i) => `${i === recentMessages.length - 1 ? '>>> ' : ''}[${m.role}]: ${typeof m.content === 'string' ? m.content.substring(0, 200) : '[多模态内容]'}`)
      .join('\n');
  }

  /**
   * 更新延迟统计
   * @private
   */
  _updateLatency(startTime) {
    const latency = Date.now() - startTime;
    const total = this.stats.totalRewrites;
    this.stats.averageLatencyMs = (this.stats.averageLatencyMs * (total - 1) + latency) / total;
  }

  /**
   * 解析 JSON 响应
   * @private
   */
  _parseJSONResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(response);
    } catch (error) {
      // 尝试修复常见 JSON 错误
      const fixed = response
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
      try {
        return JSON.parse(fixed);
      } catch {
        throw new Error(`[QueryRewriteService] Failed to parse JSON: ${response.substring(0, 200)}`);
      }
    }
  }

  /**
   * 解析 JSON 数组响应
   * @private
   */
  _parseJSONArray(response) {
    try {
      const arrayMatch = response.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalRewrites > 0
        ? ((1 - this.stats.failures / this.stats.totalRewrites) * 100).toFixed(1) + '%'
        : '0%',
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalRewrites: 0,
      contextCompletions: 0,
      semanticExpansions: 0,
      intentPreservations: 0,
      failures: 0,
      averageLatencyMs: 0,
    };
    return this;
  }
}

module.exports = {
  QueryRewriteService,
  REWRITE_TYPES,
  CONFIDENCE_THRESHOLDS,
};