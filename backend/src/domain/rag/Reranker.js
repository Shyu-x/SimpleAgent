/**
 * Reranker - 领域层重排序组件
 *
 * 功能说明：
 * - 对检索结果进行多维度重排序优化
 * - 支持多种重排序策略：Cross-Encoder、BM25、语义相似度、多样性提升
 * - 可配置策略组合和权重
 *
 * 企业级设计要点：
 * - 策略模式：每种重排序方法独立策略类
 * - 责任链模式：支持多策略链式执行
 * - 可插拔：策略可按需组合
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

// ==================== 常量定义 ====================

/**
 * 重排序策略类型
 */
const RERANK_STRATEGIES = {
  CROSS_ENCODER: 'cross_encoder_rerank',     // Cross-Encoder重排序
  BM25: 'bm25_score_boost',                  // BM25分数增强
  SEMANTIC: 'semantic_similarity',           // 语义相似度
  DIVERSITY: 'diversity_boost'               // 多样性提升
};
const AppError = require('../../common/errors/AppError');
const createLogger = require('../../common/logger');
const logger = createLogger('Reranker');

/**
 * 重排序结果元数据
 */
const RERANK_METADATA = {
  originalRank: 'originalRank',            // 原始排名
  rerankScore: 'rerankScore',              // 重排序分数
  crossEncoderScore: 'crossEncoderScore',  // Cross-Encoder分数
  bm25Boost: 'bm25Boost',                  // BM25增强分
  semanticScore: 'semanticScore',          // 语义相似度
  diversityScore: 'diversityScore',        // 多样性分数
  finalScore: 'finalScore'                 // 最终综合分数
};

// ==================== 基础策略类 ====================

/**
 * 重排序策略基类
 */
class BaseRerankStrategy {
  constructor(options = {}) {
    this.name = options.name || 'BaseStrategy';
    this.weight = options.weight || 1.0;
    this.enabled = options.enabled !== false;
  }

  /**
   * 执行重排序
   * @param {string} query - 查询文本
   * @param {Array} results - 检索结果
   * @returns {Promise<Array>} 添加策略分数后的结果
   */
  async rerank(query, results) {
    throw AppError.internalError('rerank() must be implemented by subclass');
  }

  /**
   * 获取策略名称
   */
  getName() {
    return this.name;
  }

  /**
   * 获取策略权重
   */
  getWeight() {
    return this.weight;
  }
}

// ==================== Cross-Encoder 重排序策略 ====================

/**
 * Cross-Encoder重排序策略
 *
 * 使用LLM评估查询与文档的相关性
 * 优点：准确性高
 * 缺点：计算量大，不适合大规模候选集
 */
class CrossEncoderRerankStrategy extends BaseRerankStrategy {
  constructor(options = {}) {
    super({ name: RERANK_STRATEGIES.CROSS_ENCODER, ...options });
    this.modelClient = options.modelClient || null;
    this.model = options.model || 'MiniMax-M2.5';
    this.batchSize = options.batchSize || 10;
    this.topK = options.topK || 20;
  }

  /**
   * 执行Cross-Encoder重排序
   *
   * @param {string} query - 查询文本
   * @param {Array} results - [{content, score, metadata}]
   * @returns {Promise<Array>} 重排序结果
   */
  async rerank(query, results) {
    if (!this.enabled || !results.length || !this.modelClient) {
      return results;
    }

    try {
      // 只对topK个结果进行重排序
      const candidates = results.slice(0, this.topK);
      const prompt = this._buildPrompt(query, candidates);

      const response = await this.modelClient.chat(
        [
          { role: 'system', content: '你是一个相关性评估助手。请评估每个结果与查询的相关性。' },
          { role: 'user', content: prompt }
        ],
        { model: this.model, temperature: 0.3, max_tokens: 500 }
      );

      const content = response.content?.[0]?.text || response.content || '';
      const relevanceScores = this._parseRelevanceScores(content);

      // 应用分数
      const scored = candidates.map((result, i) => ({
        ...result,
        metadata: {
          ...result.metadata,
          [RERANK_METADATA.crossEncoderScore]: relevanceScores[i] || 0
        },
        _crossEncoderScore: relevanceScores[i] || 0
      }));

      // 返回完整结果（未候选保留原分数）
      return [
        ...scored,
        ...results.slice(this.topK).map(r => ({
          ...r,
          metadata: { ...r.metadata, [RERANK_METADATA.crossEncoderScore]: 0 }
        }))
      ];

    } catch (error) {
      logger.warn('CrossEncoder重排序失败', { error: error.message });
      return results;
    }
  }

  /**
   * 构建评估提示
   */
  _buildPrompt(query, candidates) {
    const items = candidates.map((r, i) =>
      `${i}: "${r.content?.substring(0, 150)}..."`
    ).join('\n');

    return `查询: "${query}"

评估以下每个结果与查询的相关性（0-1之间的分数）：
${items}

请以JSON格式返回：
[{"index": 0, "relevance": 0.9}, ...]

只返回JSON数组。`;
  }

  /**
   * 解析相关性分数
   */
  _parseRelevanceScores(content) {
    try {
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        const scores = JSON.parse(match[0]);
        return scores.sort((a, b) => a.index - b.index).map(s => s.relevance);
      }
    } catch {
      logger.warn('CrossEncoder JSON解析失败');
    }
    return [];
  }
}

// ==================== BM25 分数增强策略 ====================

/**
 * BM25分数增强策略
 *
 * 使用BM25算法增强关键词匹配结果
 * 优点：计算效率高，适合大规模候选集
 * 缺点：对长文档和罕见词处理不佳
 */
class BM25RerankStrategy extends BaseRerankStrategy {
  constructor(options = {}) {
    super({ name: RERANK_STRATEGIES.BM25, ...options });
    this.k1 = options.k1 || 1.5;    // 词频饱和参数
    this.b = options.b || 0.75;     // 文档长度归一化参数
    this.avgDocLength = options.avgDocLength || 100;
  }

  /**
   * 执行BM25重排序
   *
   * @param {string} query - 查询文本
   * @param {Array} results - [{content, score, metadata}]
   * @returns {Array} 重排序结果
   */
  rerank(query, results) {
    if (!this.enabled || !results.length) {
      return results;
    }

    const queryTerms = this._tokenize(query);
    const docLengths = results.map(r => this._getDocLength(r.content));

    // 计算每个文档的BM25分数
    return results.map((result, i) => {
      const docLength = docLengths[i];
      const content = result.content || '';

      let bm25Score = 0;
      let matchedTerms = 0;

      for (const term of queryTerms) {
        const tf = this._countTermFrequency(term, content);
        if (tf > 0) {
          matchedTerms++;
          // 简化的BM25计算
          const numerator = tf * (this.k1 + 1);
          const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
          bm25Score += numerator / denominator;
        }
      }

      // 归一化并结合原始分数
      const normalizedBoost = matchedTerms > 0
        ? (bm25Score / queryTerms.length) * 0.3
        : 0;

      return {
        ...result,
        metadata: {
          ...result.metadata,
          [RERANK_METADATA.bm25Boost]: normalizedBoost,
          matchedTerms
        },
        _bm25Boost: normalizedBoost
      };
    });
  }

  /**
   * 分词（简单实现）
   */
  _tokenize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  /**
   * 获取文档长度
   */
  _getDocLength(content) {
    return this._tokenize(content).length;
  }

  /**
   * 计算词频
   */
  _countTermFrequency(term, content) {
    const tokens = this._tokenize(content);
    return tokens.filter(t => t.includes(term)).length;
  }
}

// ==================== 语义相似度策略 ====================

/**
 * 语义相似度重排序策略
 *
 * 使用向量相似度增强结果
 * 优点：捕获语义相关性
 * 缺点：依赖embedding质量
 */
class SemanticRerankStrategy extends BaseRerankStrategy {
  constructor(options = {}) {
    super({ name: RERANK_STRATEGIES.SEMANTIC, ...options });
    this.embeddingClient = options.embeddingClient || null;
    this.weight = options.weight || 0.4;
  }

  /**
   * 执行语义相似度重排序
   *
   * @param {string} query - 查询文本
   * @param {Array} results - [{content, score, metadata, embedding?}]
   * @returns {Promise<Array>} 重排序结果
   */
  async rerank(query, results) {
    if (!this.enabled || !results.length) {
      return results;
    }

    // 如果结果已有embedding，直接计算
    if (results[0]?.embedding) {
      return this._rerankWithEmbeddings(query, results);
    }

    // 如果有embedding客户端，获取query embedding
    if (this.embeddingClient) {
      return this._rerankWithClient(query, results);
    }

    return results;
  }

  /**
   * 使用已有embedding重排序
   */
  async _rerankWithEmbeddings(query, results) {
    // 简化：使用长度和内容密度作为代理
    return results.map(result => {
      const content = result.content || '';
      const density = this._calculateDensity(content);

      return {
        ...result,
        metadata: {
          ...result.metadata,
          [RERANK_METADATA.semanticScore]: density
        },
        _semanticScore: density
      };
    });
  }

  /**
   * 使用embedding客户端
   */
  async _rerankWithClient(query, results) {
    try {
      // 获取query embedding
      const queryEmbedding = await this.embeddingClient.embed(query);

      // 计算与每个结果的相似度
      return results.map(result => {
        const docEmbedding = result.embedding;
        const similarity = docEmbedding
          ? this._cosineSimilarity(queryEmbedding, docEmbedding)
          : 0;

        return {
          ...result,
          metadata: {
            ...result.metadata,
            [RERANK_METADATA.semanticScore]: similarity
          },
          _semanticScore: similarity
        };
      });

    } catch (error) {
      logger.warn('Semantic重排序失败', { error: error.message });
      return results;
    }
  }

  /**
   * 计算余弦相似度
   */
  _cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * 计算内容密度（简化语义分数）
   */
  _calculateDensity(content) {
    if (!content) return 0;
    // 密度 = 独特词数 / 总词数
    const words = content.toLowerCase().split(/\s+/);
    const unique = new Set(words);
    return words.length > 0 ? unique.size / words.length : 0;
  }
}

// ==================== 多样性提升策略 ====================

/**
 * 多样性提升重排序策略
 *
 * 减少检索结果中的冗余，提升覆盖度
 * 优点：避免结果重复，提升多样性
 * 缺点：可能降低相关性
 */
class DiversityRerankStrategy extends BaseRerankStrategy {
  constructor(options = {}) {
    super({ name: RERANK_STRATEGIES.DIVERSITY, ...options });
    this.diversityThreshold = options.diversityThreshold || 0.8;  // 相似度阈值
    this.decayFactor = options.decayFactor || 0.9;               // 衰减因子
  }

  /**
   * 执行多样性重排序
   *
   * @param {string} query - 查询文本
   * @param {Array} results - [{content, score, metadata}]
   * @returns {Array} 重排序结果
   */
  rerank(query, results) {
    if (!this.enabled || results.length < 2) {
      return results;
    }

    const scored = results.map((r, i) => ({
      ...r,
      _originalIndex: i,
      _diversityScore: 0
    }));

    // MMR（最大边际相关）算法
    const selected = [];
    const remaining = [...scored];

    while (remaining.length > 0) {
      let bestScore = -Infinity;
      let bestIdx = 0;

      for (let i = 0; i < remaining.length; i++) {
        const result = remaining[i];

        // 基础分数（归一化）
        const baseScore = result.score || 0;

        // 多样性分数（与已选结果的最大相似度）
        let maxSimilarity = 0;
        for (const sel of selected) {
          const similarity = this._calculateSimilarity(result.content, sel.content);
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }

        // MMR分数 = lambda * 相关性 - (1-lambda) * 多样性惩罚
        const lambda = this.diversityThreshold;
        const mmrScore = lambda * baseScore - (1 - lambda) * maxSimilarity;

        // 应用位置衰减
        const positionPenalty = Math.pow(this.decayFactor, selected.length);
        const finalScore = mmrScore * positionPenalty;

        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestIdx = i;
        }
      }

      // 移动到已选列表
      const selectedItem = remaining.splice(bestIdx, 1)[0];
      selectedItem._diversityScore = bestScore;
      selected.push(selectedItem);
    }

    // 返回按MMR分数排序的结果
    return selected.sort((a, b) => b._diversityScore - a._diversityScore).map((r, i) => ({
      ...r,
      metadata: {
        ...r.metadata,
        [RERANK_METADATA.diversityScore]: r._diversityScore,
        diversityRank: i
      }
    }));
  }

  /**
   * 计算内容相似度（简化实现）
   */
  _calculateSimilarity(contentA, contentB) {
    if (!contentA || !contentB) return 0;

    const wordsA = new Set(contentA.toLowerCase().split(/\s+/));
    const wordsB = new Set(contentB.toLowerCase().split(/\s+/));

    // Jaccard相似度
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

// ==================== 主类实现 ====================

/**
 * 领域层重排序器
 *
 * 组合多种重排序策略，提供统一的接口
 */
class Reranker {
  /**
   * 构造函数
   *
   * @param {Object} options - 配置选项
   * @param {Object} options.modelClient - LLM模型客户端（用于Cross-Encoder）
   * @param {Object} options.embeddingClient - Embedding客户端（用于语义重排序）
   * @param {number} options.topK - 返回结果数量（默认10）
   * @param {boolean} options.enabled - 是否启用重排序（默认true）
   */
  constructor(options = {}) {
    this.modelClient = options.modelClient || null;
    this.embeddingClient = options.embeddingClient || null;
    this.topK = options.topK || 10;
    this.enabled = options.enabled !== false;

    // 策略注册表
    this.strategies = new Map();
    this.strategyOrder = [];

    // 策略权重配置
    this.strategyWeights = {
      [RERANK_STRATEGIES.CROSS_ENCODER]: 0.5,
      [RERANK_STRATEGIES.BM25]: 0.2,
      [RERANK_STRATEGIES.SEMANTIC]: 0.2,
      [RERANK_STRATEGIES.DIVERSITY]: 0.1
    };

    // 统计信息
    this.stats = {
      totalReranks: 0,
      strategyUsage: {},
      averageLatencyMs: 0
    };
  }

  /**
   * 注册重排序策略
   *
   * @param {string} name - 策略名称
   * @param {BaseRerankStrategy} strategy - 策略实例
   * @param {number} weight - 策略权重
   * @returns {Reranker} this
   */
  registerStrategy(name, strategy, weight = 1.0) {
    this.strategies.set(name, strategy);
    this.strategyWeights[name] = weight;
    if (!this.strategyOrder.includes(name)) {
      this.strategyOrder.push(name);
    }
    return this;
  }

  /**
   * 移除重排序策略
   *
   * @param {string} name - 策略名称
   * @returns {Reranker} this
   */
  removeStrategy(name) {
    this.strategies.delete(name);
    this.strategyOrder = this.strategyOrder.filter(n => n !== name);
    return this;
  }

  /**
   * 启用/禁用策略
   *
   * @param {string} name - 策略名称
   * @param {boolean} enabled - 是否启用
   * @returns {Reranker} this
   */
  setStrategyEnabled(name, enabled) {
    const strategy = this.strategies.get(name);
    if (strategy) {
      strategy.enabled = enabled;
    }
    return this;
  }

  /**
   * 执行重排序
   *
   * @param {string} query - 查询文本
   * @param {Array} results - 检索结果 [{content, score, metadata}]
   * @param {Object} options - 选项
   * @param {number} options.topK - 返回数量
   * @param {Array} options.strategies - 使用的策略列表
   * @returns {Promise<Array>} 重排序结果
   */
  async rerank(query, results, options = {}) {
    const startTime = Date.now();
    this.stats.totalReranks++;

    if (!this.enabled || !results || results.length === 0) {
      return results;
    }

    const topK = options.topK || this.topK;
    const strategyList = options.strategies || this.strategyOrder;

    try {
      // 按顺序执行各策略
      let currentResults = [...results];

      for (const strategyName of strategyList) {
        const strategy = this.strategies.get(strategyName);
        if (!strategy || !strategy.enabled) {
          continue;
        }

        // 策略特定处理
        if (strategy instanceof CrossEncoderRerankStrategy) {
          strategy.modelClient = this.modelClient;
        }
        if (strategy instanceof SemanticRerankStrategy) {
          strategy.embeddingClient = this.embeddingClient;
        }

        const strategyStart = Date.now();
        currentResults = await strategy.rerank(query, currentResults);
        const strategyLatency = Date.now() - strategyStart;

        // 更新策略使用统计
        if (!this.stats.strategyUsage[strategyName]) {
          this.stats.strategyUsage[strategyName] = { count: 0, totalLatencyMs: 0 };
        }
        this.stats.strategyUsage[strategyName].count++;
        this.stats.strategyUsage[strategyName].totalLatencyMs += strategyLatency;
      }

      // 综合评分并排序
      const finalResults = this._computeFinalScores(currentResults, strategyList);

      // 截取topK
      const topResults = finalResults
        .sort((a, b) => b._finalScore - a._finalScore)
        .slice(0, topK)
        .map((r, i) => ({
          ...r,
          rerankRank: i,
          metadata: {
            ...r.metadata,
            [RERANK_METADATA.originalRank]: r._originalIndex,
            [RERANK_METADATA.finalScore]: r._finalScore
          }
        }));

      // 更新延迟统计
      const latency = Date.now() - startTime;
      const total = this.stats.totalReranks;
      this.stats.averageLatencyMs =
        (this.stats.averageLatencyMs * (total - 1) + latency) / total;

      return topResults;

    } catch (error) {
      logger.error('重排序异常', { error: error.message });
      // 出错时返回原始分数排序结果
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }
  }

  /**
   * 计算最终综合分数
   *
   * @private
   * @param {Array} results - 当前结果
   * @param {Array} strategyList - 策略列表
   * @returns {Array} 添加最终分数的结果
   */
  _computeFinalScores(results, strategyList) {
    const totalWeight = strategyList.reduce((sum, name) => {
      const strategy = this.strategies.get(name);
      return sum + (strategy?.enabled ? this.strategyWeights[name] : 0);
    }, 0);

    return results.map(result => {
      let weightedScore = 0;
      let usedWeight = 0;

      for (const strategyName of strategyList) {
        const strategy = this.strategies.get(strategyName);
        if (!strategy?.enabled) continue;

        let strategyScore = 0;
        let weight = this.strategyWeights[strategyName] || 1;

        // 获取各策略分数
        switch (strategyName) {
          case RERANK_STRATEGIES.CROSS_ENCODER:
            strategyScore = result._crossEncoderScore || result.metadata?.[RERANK_METADATA.crossEncoderScore] || 0;
            break;
          case RERANK_STRATEGIES.BM25:
            strategyScore = result._bm25Boost || result.metadata?.[RERANK_METADATA.bm25Boost] || 0;
            break;
          case RERANK_STRATEGIES.SEMANTIC:
            strategyScore = result._semanticScore || result.metadata?.[RERANK_METADATA.semanticScore] || 0;
            break;
          case RERANK_STRATEGIES.DIVERSITY:
            strategyScore = result._diversityScore || result.metadata?.[RERANK_METADATA.diversityScore] || 0;
            break;
          default:
            strategyScore = 0;
        }

        // 归一化策略分数到0-1范围
        const normalizedScore = Math.min(Math.max(strategyScore, 0), 1);
        weightedScore += normalizedScore * weight;
        usedWeight += weight;
      }

      // 结合原始检索分数
      const originalScore = result.score || 0;
      const normalizedWeight = usedWeight / totalWeight;
      const finalScore = normalizedWeight * (weightedScore / usedWeight) + (1 - normalizedWeight) * originalScore;

      return {
        ...result,
        _finalScore: finalScore
      };
    });
  }

  /**
   * 初始化默认策略
   *
   * @returns {Reranker} this
   */
  initDefaultStrategies() {
    this.registerStrategy(
      RERANK_STRATEGIES.BM25,
      new BM25RerankStrategy(),
      this.strategyWeights[RERANK_STRATEGIES.BM25]
    );

    this.registerStrategy(
      RERANK_STRATEGIES.SEMANTIC,
      new SemanticRerankStrategy(),
      this.strategyWeights[RERANK_STRATEGIES.SEMANTIC]
    );

    this.registerStrategy(
      RERANK_STRATEGIES.DIVERSITY,
      new DiversityRerankStrategy(),
      this.strategyWeights[RERANK_STRATEGIES.DIVERSITY]
    );

    return this;
  }

  /**
   * 启用Cross-Encoder策略
   *
   * @param {Object} options - 配置选项
   * @returns {Reranker} this
   */
  enableCrossEncoder(options = {}) {
    this.registerStrategy(
      RERANK_STRATEGIES.CROSS_ENCODER,
      new CrossEncoderRerankStrategy(options),
      options.weight || this.strategyWeights[RERANK_STRATEGIES.CROSS_ENCODER]
    );
    return this;
  }

  /**
   * 获取统计信息
   *
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      strategyWeights: { ...this.strategyWeights },
      registeredStrategies: Array.from(this.strategies.keys()),
      averageLatencyMs: this.stats.averageLatencyMs.toFixed(2)
    };
  }

  /**
   * 重置统计
   *
   * @returns {Reranker} this
   */
  resetStats() {
    this.stats = {
      totalReranks: 0,
      strategyUsage: {},
      averageLatencyMs: 0
    };
    return this;
  }
}

// ==================== 导出 ====================

module.exports = {
  Reranker,
  BaseRerankStrategy,

  // 策略类
  CrossEncoderRerankStrategy,
  BM25RerankStrategy,
  SemanticRerankStrategy,
  DiversityRerankStrategy,

  // 常量
  RERANK_STRATEGIES,
  RERANK_METADATA
};
