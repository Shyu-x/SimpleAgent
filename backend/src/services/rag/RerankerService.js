/**
 * 重排序服务
 * 使用MiniMax模型对检索结果进行相关性重排序
 */

const createLogger = require('../../common/logger');
const logger = createLogger('Reranker');

class RerankerService {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.llmClient = options.llmClient;
    this.topK = options.topK || 10;
  }

  /**
   * 对检索结果进行重排序
   * @param {string} query - 查询文本
   * @param {Array} results - 检索结果 [{content, score, metadata}]
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 重排序后的结果
   */
  async rerank(query, results, options = {}) {
    if (!this.enabled || !results.length) return results;

    const rerankTopK = options.topK || this.topK;

    try {
      // 使用LLM评估相关性
      if (this.llmClient) {
        return await this._llmRerank(query, results, rerankTopK);
      }
    } catch (error) {
      logger.warn(`LLM rerank failed, using original order: ${error.message}`);
    }

    // 回退：使用原始分数排序
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, rerankTopK);
  }

  /**
   * 使用LLM进行重排序
   */
  async _llmRerank(query, results, topK) {
    const prompt = `给定查询: "${query}"
评估以下每个结果与查询的相关性，输出JSON数组:
[{"index": 0, "relevance": 0.9}, ...]

结果:
${results.map((r, i) => `${i}: ${r.content?.substring(0, 200)}...`).join('\n')}

只输出JSON数组，按relevance降序排列。`;

    try {
      const response = await this.llmClient.chat(
        'MiniMax-M2.5',
        [{ role: 'user', content: prompt }],
        { maxTokens: 500 }
      );

      const relevanceScores = JSON.parse(response.content);

      // 应用重排序分数
      const reranked = results.map((result, i) => ({
        ...result,
        rerankScore: relevanceScores[i]?.relevance || 0
      }));

      return reranked
        .sort((a, b) => b.rerankScore - a.rerankScore)
        .slice(0, topK)
        .map(r => ({ ...r, score: r.rerankScore }));
    } catch (error) {
      throw error;
    }
  }
}

module.exports = RerankerService;
