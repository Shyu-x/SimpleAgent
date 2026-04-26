/**
 * LLM 重排处理器
 * 调用 LLM 评估各结果与查询的相关性，返回重排后的结果
 */
const PostProcessor = require('./PostProcessor');

class RerankerProcessor extends PostProcessor {
  constructor(options = {}) {
    const defaultOptions = {
      // 调用 LLM 时的批次大小
      batchSize: 5,
      // 重排后保留的最大结果数
      topK: 10,
      // 相似度字段
      scoreField: 'score',
      priority: 50,
      // 是否启用
      enabled: true,
      ...options
    };
    super(defaultOptions);
  }

  shouldProcess(context) {
    // 结果数量 >= 2 且已启用
    return (
      this.options.enabled &&
      context.results &&
      context.results.length >= 2
    );
  }

  /**
   * 执行 LLM 重排
   * @param {Array} results
   * @param {Object} context - { query, llmClient?, chatModel? }
   * @returns {Promise<Array>}
   */
  async process(results, context) {
    if (!this.shouldProcess(context)) {
      return results;
    }

    const { query } = context;
    const { batchSize = 5, topK = 10 } = this.options;

    if (!query) {
      console.warn('[RerankerProcessor] 缺少 query 参数，跳过重排');
      return results;
    }

    // 获取 LLM 客户端
    const llm = this._getLLMClient(context);
    if (!llm) {
      console.warn('[RerankerProcessor] 未配置 LLM 客户端，跳过重排');
      return results;
    }

    try {
      // 批量评估每个结果的相关性
      const scoredResults = await this._scoreResults(results, query, llm, batchSize);

      // 按相关性分数降序排列
      scoredResults.sort((a, b) => b._rerankScore - a._rerankScore);

      // 保留 topK
      const reranked = scoredResults.slice(0, topK).map(r => {
        // 移除临时字段后返回
        const { _rerankScore, ...rest } = r;
        return rest;
      });

      console.log(`[RerankerProcessor] 重排完成，保留 ${reranked.length} 条结果`);
      return reranked;
    } catch (err) {
      console.error('[RerankerProcessor] 重排失败:', err.message);
      return results; // 出错时返回原始结果
    }
  }

  /**
   * 批量评估结果相关性
   * @private
   */
  async _scoreResults(results, query, llm, batchSize) {
    const scored = [];

    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);
      const scores = await Promise.all(
        batch.map(result => this._scoreOne(query, result, llm))
      );
      batch.forEach((result, j) => {
        scored.push({ ...result, _rerankScore: scores[j] });
      });
    }

    return scored;
  }

  /**
   * 评估单条结果与查询的相关性（0-10分）
   * @private
   */
  async _scoreOne(query, result, llm) {
    const content = this._extractContent(result);

    const prompt = `你是一个相关性评估器。请评估以下查询与内容的关联程度。

查询：${query}

内容：
${content.slice(0, 500)}

请仅输出一个 0 到 10 的数字评分，表示关联程度。0 表示完全不相关，10 表示完全匹配。只输出数字，不要其他内容。`;

    try {
      const response = await llm.generate({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 4,
        temperature: 0
      });

      const text = response?.content || response?.text || '';
      const match = text.toString().match(/\d+/);
      const score = match ? parseInt(match[0], 10) : 5;
      return Math.min(10, Math.max(0, score));
    } catch (err) {
      console.warn(`[RerankerProcessor] 评估失败，使用默认分 5:`, err.message);
      return 5;
    }
  }

  /**
   * 提取文本内容
   * @private
   */
  _extractContent(result) {
    return result.text || result.content || result.snippet || result.pageContent || String(result);
  }

  /**
   * 获取 LLM 客户端
   * @private
   */
  _getLLMClient(context) {
    // 优先使用传入的 llmClient
    if (context.llmClient) return context.llmClient;
    // 也支持 chatModel
    if (context.chatModel) {
      return {
        generate: async ({ messages, maxTokens, temperature }) => {
          const result = await context.chatModel.chat({ messages });
          return result;
        }
      };
    }
    return null;
  }
}

module.exports = RerankerProcessor;
