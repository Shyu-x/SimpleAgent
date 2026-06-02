/**
 * 混合检索服务
 * 实现多通道并行检索：向量 + 全文 + 意图
 * 参考 ragent 的 Agentic RAG 设计
 */

const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('hybridSearch');

class HybridSearch {
  constructor(options = {}) {
    this.vectorSearch = options.vectorSearch || null;
    this.fullTextSearch = options.fullTextSearch || null;
    this.intentSearch = options.intentSearch || null;
    this.AppError = require('../common/errors/AppError');

    // 检索配置
    this.defaultTopK = options.topK || 5;
    this.defaultChannels = options.channels || ['vector', 'fulltext'];
    this.rerankEnabled = options.rerankEnabled !== false;

    // 通道权重配置
    this.channelWeights = options.channelWeights || {
      vector: 0.5,
      fulltext: 0.3,
      intent: 0.2
    };
  }

  /**
   * 执行混合检索
   * @param {Object} params - 检索参数
   * @returns {Promise<Object>} 检索结果
   */
  async search(params) {
    const {
      query,
      knowledgeBaseId,
      channels = this.defaultChannels,
      topK = this.defaultTopK,
      filters = {},
      intent
    } = params;

    // 1. 并行执行多通道检索
    const channelResults = await this.executeChannels(channels, {
      query,
      knowledgeBaseId,
      filters,
      intent
    });

    // 2. 合并结果
    const mergedResults = this.mergeResults(channelResults, query);

    // 3. 重排序 (可选)
    let finalResults = mergedResults;
    if (this.rerankEnabled && mergedResults.length > 1) {
      finalResults = await this.rerank(mergedResults, query);
    }

    // 4. 截取 topK
    return {
      results: finalResults.slice(0, topK),
      query,
      channels: channels,
      total: finalResults.length,
      channelSummary: this.summarizeChannels(channelResults),
      intent
    };
  }

  /**
   * 并行执行多个检索通道
   */
  async executeChannels(channels, params) {
    const results = {};

    const promises = channels.map(async (channel) => {
      try {
        const result = await this.executeChannel(channel, params);
        results[channel] = {
          success: true,
          data: result,
          count: result?.length || 0
        };
      } catch (error) {
        logger.error('Channel error', { channel, error: error.message });
        results[channel] = {
          success: false,
          error: error.message,
          count: 0,
          data: []
        };
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * 执行单个检索通道
   */
  async executeChannel(channel, params) {
    const { query, knowledgeBaseId, filters, intent } = params;

    switch (channel) {
      case 'vector':
        return this.vectorSearch
          ? await this.vectorSearch.search(query, { knowledgeBaseId, filters })
          : this.mockVectorSearch(query, knowledgeBaseId, filters);

      case 'fulltext':
        return this.fullTextSearch
          ? await this.fullTextSearch.search(query, { knowledgeBaseId, filters })
          : this.mockFullTextSearch(query, knowledgeBaseId, filters);

      case 'intent':
        return this.intentSearch
          ? await this.intentSearch.search(query, { knowledgeBaseId, intent })
          : this.mockIntentSearch(query, knowledgeBaseId, intent);

      default:
        logger.warn('Unknown channel', { channel });
        return [];
    }
  }

  /**
   * 向量检索 (当未配置向量搜索服务时抛出错误)
   */
  mockVectorSearch(query, knowledgeBaseId, filters) {
    throw this.AppError.internalError('向量搜索服务未配置，请配置 QdrantVectorStore 或其他向量搜索服务');
  }

  /**
   * 全文检索 (当未配置全文搜索服务时抛出错误)
   */
  mockFullTextSearch(query, knowledgeBaseId, filters) {
    throw this.AppError.internalError('全文搜索服务未配置，请配置全文搜索引擎');
  }

  /**
   * 意图检索 (当未配置意图搜索服务时抛出错误)
   */
  mockIntentSearch(query, knowledgeBaseId, intent) {
    throw this.AppError.internalError('意图搜索服务未配置，请配置意图分类服务');
  }

  /**
   * 合并多通道结果
   * 使用加权分数和RRF (Reciprocal Rank Fusion)
   */
  mergeResults(channelResults, query) {
    const allResults = [];
    const seenContent = new Map();

    // 收集所有结果
    for (const [channel, result] of Object.entries(channelResults)) {
      if (!result.success || !result.data) continue;

      const weight = this.channelWeights[channel] || 0.5;

      for (const item of result.data) {
        // 计算加权分数
        const weightedScore = item.score * weight;

        // 检查是否重复 (基于内容相似度)
        const contentKey = this.normalizeContent(item.content);
        if (seenContent.has(contentKey)) {
          // 合并结果，取最高分
          const existing = seenContent.get(contentKey);
          if (weightedScore > existing.score) {
            existing.score = weightedScore;
            existing.channels.push(channel);
          }
        } else {
          const mergedItem = {
            ...item,
            score: weightedScore,
            channels: [channel],
            originalScores: {
              [channel]: item.score
            }
          };
          seenContent.set(contentKey, mergedItem);
          allResults.push(mergedItem);
        }
      }
    }

    // 应用 RRF 重排序
    return this.applyRRF(allResults);
  }

  /**
   * 归一化内容用于去重
   */
  normalizeContent(content) {
    return content.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * 应用互惠排名融合 (RRF)
   * RRF score = sum(1 / (rank + k)) for each channel
   */
  applyRRF(results, k = 60) {
    if (results.length <= 1) return results;

    // 按通道分组并排序
    const byChannel = {};
    for (const result of results) {
      for (const channel of result.channels) {
        if (!byChannel[channel]) {
          byChannel[channel] = [];
        }
        byChannel[channel].push(result);
      }
    }

    // 为每个通道的结果分配排名
    for (const channel in byChannel) {
      const sorted = byChannel[channel].sort((a, b) => b.score - a.score);
      sorted.forEach((item, index) => {
        item[`rank_${channel}`] = index + 1;
      });
    }

    // 计算 RRF 分数
    for (const result of results) {
      let rrfScore = 0;
      for (const channel of result.channels) {
        const rank = result[`rank_${channel}`] || Infinity;
        if (rank !== Infinity) {
          rrfScore += 1 / (rank + k);
        }
      }
      result.rrfScore = rrfScore;
      // 综合分数
      result.finalScore = (result.score || 0) * 0.5 + rrfScore * 0.5;
    }

    // 按最终分数排序
    return results.sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * 重排序 (可扩展为使用 LLM 重排)
   */
  async rerank(results, query) {
    // 简单的相关性重排: 查询词在结果中出现的次数
    const queryTerms = query.toLowerCase().split(/\s+/);

    for (const result of results) {
      const content = result.content.toLowerCase();
      let matchCount = 0;

      for (const term of queryTerms) {
        if (content.includes(term)) {
          matchCount++;
        }
      }

      // 增强匹配项的分数
      if (matchCount > 0) {
        result.finalScore = (result.finalScore || result.score) * (1 + matchCount * 0.1);
      }
    }

    return results.sort((a, b) => (b.finalScore || b.score) - (a.finalScore || a.score));
  }

  /**
   * 汇总通道结果
   */
  summarizeChannels(channelResults) {
    const summary = {};

    for (const [channel, result] of Object.entries(channelResults)) {
      summary[channel] = {
        success: result.success,
        count: result.count,
        error: result.error || null
      };
    }

    return summary;
  }

  /**
   * 设置向量检索器
   */
  setVectorSearch(vectorSearch) {
    this.vectorSearch = vectorSearch;
  }

  /**
   * 设置全文检索器
   */
  setFullTextSearch(fullTextSearch) {
    this.fullTextSearch = fullTextSearch;
  }

  /**
   * 设置意图检索器
   */
  setIntentSearch(intentSearch) {
    this.intentSearch = intentSearch;
  }

  /**
   * 更新通道权重
   */
  setChannelWeights(weights) {
    this.channelWeights = { ...this.channelWeights, ...weights };
  }

  /**
   * 获取检索统计信息
   */
  getStats() {
    return {
      channels: Object.keys(this.channelWeights),
      weights: this.channelWeights,
      defaultTopK: this.defaultTopK,
      rerankEnabled: this.rerankEnabled
    };
  }
}

/**
 * 向量检索接口 (供实际实现时继承)
 */
class VectorSearchInterface {
  async search(query, options) {
    throw this.AppError.internalError('Not implemented');
  }
}

/**
 * 全文检索接口 (供实际实现时继承)
 */
class FullTextSearchInterface {
  async search(query, options) {
    throw this.AppError.internalError('Not implemented');
  }
}

/**
 * 意图检索接口 (供实际实现时继承)
 */
class IntentSearchInterface {
  async search(query, options) {
    throw this.AppError.internalError('Not implemented');
  }
}

module.exports = {
  HybridSearch,
  VectorSearchInterface,
  FullTextSearchInterface,
  IntentSearchInterface
};
