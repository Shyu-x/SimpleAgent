/**
 * KeywordSearchChannel - 关键词检索通道（BM25算法）
 *
 * 功能说明：
 * - 基于 BM25 算法的关键词检索
 * - 不依赖向量计算，适合精确匹配场景
 *
 * BM25 算法公式：
 * score(t,d) = IDF(t) * (tf(t,d) * (k+1)) / (tf(t,d) + k * (1 - b + b * |d|/avgdl))
 *
 * 其中：
 * - IDF(t) = log((N - n(t) + 0.5) / (n(t) + 0.5))
 * - tf(t,d) = 词项 t 在文档 d 中的出现次数
 * - |d| = 文档长度
 * - avgdl = 平均文档长度
 * - k, b = 调参（通常 k=1.5, b=0.75）
 *
 * 企业级要点：
 * - 倒排索引优化检索性能
 * - IDF 预计算避免重复计算
 * - 支持文档动态更新
 */

const { SearchChannel, SearchResult } = require('../SearchChannel');

class KeywordSearchChannel extends SearchChannel {
  constructor(config = {}) {
    super({
      name: config.name || 'keyword_search',
      weight: config.weight || 0.8,
      enabled: config.enabled !== false,
      timeout: config.timeout || 10000,    // BM25 计算快，超时设短
      maxResults: config.maxResults || 10,
      failureThreshold: config.failureThreshold || 5
    });

    // 文档存储
    this.documents = new Map();      // docId -> { content, tokens, metadata }
    this.invertedIndex = new Map();  // term -> Map(docId -> tf)

    // BM25 参数
    this.k1 = config.k1 || 1.5;     // 词频饱和参数
    this.b = config.b || 0.75;      // 文档长度归一化参数

    // 统计信息
    this._avgDocLength = 0;
    this._totalDocLength = 0;
    this._docCount = 0;
  }

  getType() {
    return 'keyword';
  }

  /**
   * 执行 BM25 检索
   * @param {string} query - 查询文本
   * @param {Object} options - { maxResults, filters }
   */
  async search(query, options = {}) {
    if (this.documents.size === 0) {
      return [];
    }

    const maxResults = options.maxResults || this.maxResults;

    // 1. 分词
    const queryTokens = this._tokenize(query);

    // 2. 计算每个文档的 BM25 得分
    const scoredResults = [];

    for (const [docId, doc] of this.documents.entries()) {
      // 应用过滤器
      if (options.filters && !this._matchFilters(doc, options.filters)) {
        continue;
      }

      // 计算 BM25 得分
      const score = this._calculateBM25(queryTokens, doc);

      if (score > 0) {
        scoredResults.push(new SearchResult({
          id: docId,
          content: doc.content,
          score,
          metadata: {
            ...doc.metadata,
            channel: this.name,
            type: 'keyword'
          }
        }));
      }
    }

    // 3. 排序并返回 TopK
    scoredResults.sort((a, b) => b.score - a.score);
    return scoredResults.slice(0, maxResults);
  }

  /**
   * 添加文档
   * @param {string} id - 文档ID
   * @param {string} content - 文档内容
   * @param {Object} metadata - 元信息
   */
  addDocument(id, content, metadata = {}) {
    // 删除旧文档（如果存在）
    if (this.documents.has(id)) {
      this._removeFromIndex(id);
    }

    // 分词
    const tokens = this._tokenize(content);
    const docLength = tokens.length;

    // 存储文档
    this.documents.set(id, { content, tokens, metadata });

    // 更新倒排索引
    this._addToIndex(id, tokens);

    // 更新统计
    this._totalDocLength += docLength;
    this._docCount++;
    this._avgDocLength = this._totalDocLength / this._docCount;
  }

  /**
   * 批量添加文档
   */
  addDocuments(docs) {
    for (const doc of docs) {
      this.addDocument(doc.id, doc.content, doc.metadata);
    }
  }

  /**
   * 删除文档
   */
  deleteDocument(id) {
    if (this.documents.has(id)) {
      this._removeFromIndex(id);
      const doc = this.documents.get(id);
      this._totalDocLength -= doc.tokens.length;
      this._docCount--;
      this._avgDocLength = this._docCount > 0 ? this._totalDocLength / this._docCount : 0;
      this.documents.delete(id);
    }
  }

  /**
   * 清空索引
   */
  clear() {
    this.documents.clear();
    this.invertedIndex.clear();
    this._avgDocLength = 0;
    this._totalDocLength = 0;
    this._docCount = 0;
  }

  /**
   * 获取索引统计
   */
  getStats() {
    return {
      channel: this.name,
      type: 'keyword',
      documentCount: this.documents.size,
      vocabularySize: this.invertedIndex.size,
      avgDocLength: Math.round(this._avgDocLength * 100) / 100,
      healthy: this.isHealthy()
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 简单中文/英文分词
   * - 中文：基于字符 n-gram + 简单词典
   * - 英文：基于空格和标点
   */
  _tokenize(text) {
    const tokens = [];

    // 简单预处理：转小写、去除特殊字符
    const normalized = text.toLowerCase().replace(/[^\w\s\u4e00-\u9fa5]/g, ' ');

    // 英文分词
    const englishWords = normalized.match(/[a-z0-9]+/g) || [];
    tokens.push(...englishWords);

    // 中文处理：简单的bigram（实际应用中应使用 jieba 等专业分词器）
    const chineseChars = normalized.replace(/[a-z0-9\s]/g, '');
    for (let i = 0; i < chineseChars.length - 1; i++) {
      tokens.push(chineseChars.slice(i, i + 2));
    }

    return tokens;
  }

  /**
   * 添加到倒排索引
   */
  _addToIndex(docId, tokens) {
    // 统计词频
    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // 更新倒排索引
    for (const [term, count] of tf.entries()) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Map());
      }
      this.invertedIndex.get(term).set(docId, count);
    }
  }

  /**
   * 从倒排索引移除
   */
  _removeFromIndex(docId) {
    const doc = this.documents.get(docId);
    if (!doc) return;

    for (const token of doc.tokens) {
      const posting = this.invertedIndex.get(token);
      if (posting) {
        posting.delete(docId);
        if (posting.size === 0) {
          this.invertedIndex.delete(token);
        }
      }
    }
  }

  /**
   * 计算 IDF 值
   * IDF(t) = log((N - n(t) + 0.5) / (n(t) + 0.5))
   */
  _calculateIDF(term) {
    const n_t = this.invertedIndex.get(term)?.size || 0;  // 包含词项的文档数
    const N = this._docCount;                              // 总文档数

    // 平滑处理：避免 n(t)=0 时 IDF 无穷大
    return Math.log((N - n_t + 0.5) / (n_t + 0.5) + 1);
  }

  /**
   * 计算单个文档对查询的 BM25 得分
   */
  _calculateBM25(queryTokens, doc) {
    let score = 0;
    const docLength = doc.tokens.length;
    const docTf = new Map();

    // 统计文档中每个查询词的词频
    for (const token of queryTokens) {
      const tf = doc.tokens.filter(t => t === token).length;
      if (tf > 0) {
        docTf.set(token, tf);
      }
    }

    // 计算每个词项的 BM25 得分并求和
    for (const [token, tf] of docTf.entries()) {
      const idf = this._calculateIDF(token);
      const numerator = tf * (this.k1 + 1);
      const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / (this._avgDocLength || 1)));
      score += idf * (numerator / denominator);
    }

    return score;
  }

  /**
   * 元数据过滤
   */
  _matchFilters(doc, filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (doc.metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }
}

module.exports = KeywordSearchChannel;
