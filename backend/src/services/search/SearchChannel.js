/**
 * 检索通道接口
 *
 * 为什么需要检索通道抽象：
 * 企业RAG系统通常需要多路检索（关键词 + 向量 + 意图定向等）
 * 如果每种检索都写死代码，后续加新通道要改核心流程。
 *
 * 使用策略模式：不同检索通道实现同一接口，SearchCoordinator 统一调度。
 * 不用这个模式的问题：加一个检索通道要改一堆地方，很容易引入bug。
 */

class SearchChannel {
  constructor(options = {}) {
    this.name = options.name || 'unknown';
    this.AppError = require('../../common/errors/AppError');
    this.weight = options.weight || 1.0;
    this.timeout = options.timeout || 30000;
    this.enabled = options.enabled !== false;
  }

  /**
   * 检索
   * @param {string} query - 查询文本
   * @param {Object} options - 选项 { topK, filters, ... }
   * @returns {Promise<SearchResult[]>}
   */
  async search(query, options = {}) {
    throw this.AppError.internalError(`SearchChannel[${this.name}].search() must be implemented`);
  }

  /**
   * 批量检索
   * @param {string[]} queries - 查询列表
   * @param {Object} options - 选项
   */
  async searchBatch(queries, options = {}) {
    const results = [];
    for (const query of queries) {
      results.push(await this.search(query, options));
    }
    return results;
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    return true;
  }

  /**
   * 获取通道信息
   */
  getInfo() {
    return {
      name: this.name,
      weight: this.weight,
      timeout: this.timeout,
      enabled: this.enabled
    };
  }
}

/**
 * 检索结果
 */
class SearchResult {
  constructor(data) {
    this.id = data.id || '';
    this.content = data.content || '';
    this.score = data.score || 0;
    this.source = data.source || 'unknown';
    this.metadata = data.metadata || {};
    this.channel = data.channel || 'unknown';
  }

  /**
   * 是否可信
   */
  isTrusted(threshold = 0.5) {
    return this.score >= threshold;
  }

  toJSON() {
    return {
      id: this.id,
      content: this.content,
      score: this.score,
      source: this.source,
      metadata: this.metadata,
      channel: this.channel
    };
  }
}

module.exports = {
  SearchChannel,
  SearchResult
};
