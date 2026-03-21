/**
 * 关键词检索通道
 *
 * 基于关键词匹配的简单检索实现
 * 用于企业RAG系统的多路召回之一
 */

const { SearchChannel, SearchResult } = require('../SearchChannel');

class KeywordSearchChannel extends SearchChannel {
  constructor(options = {}) {
    super({ name: 'keyword', weight: options.weight || 1.0, ...options });
    this.documents = new Map(); // id -> { content, keywords, metadata }
  }

  /**
   * 添加文档
   */
  addDocument(id, content, metadata = {}) {
    const keywords = this.extractKeywords(content);
    this.documents.set(id, { content, keywords, metadata });
  }

  /**
   * 批量添加文档
   */
  addDocuments(documents) {
    for (const doc of documents) {
      this.addDocument(doc.id, doc.content, doc.metadata);
    }
  }

  /**
   * 检索
   */
  async search(query, options = {}) {
    const topK = options.topK || 5;
    const queryKeywords = this.extractKeywords(query);

    const results = [];
    for (const [id, doc] of this.documents) {
      const score = this.calculateScore(queryKeywords, doc.keywords);
      if (score > 0) {
        results.push(new SearchResult({
          id,
          content: doc.content,
          score,
          source: doc.metadata.source || 'unknown',
          metadata: doc.metadata,
          channel: this.name
        }));
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * 提取关键词
   * 中文：按字符分割（每2-4个字符为一个词）
   * 英文：按空格和标点分割
   */
  extractKeywords(text) {
    const freq = {};
    const lowerText = text.toLowerCase();

    // 英文分词：按空格和标点
    const englishPattern = /[a-z0-9]+/g;
    let match;
    while ((match = englishPattern.exec(lowerText)) !== null) {
      const word = match[0];
      if (word.length > 1) {
        freq[word] = (freq[word] || 0) + 1;
      }
    }

    // 中文分词：简单按2-4字符滑动窗口
    const chineseChars = lowerText.replace(/[a-z0-9\s,.!?，。！？、：；：""''（）【】《》]/g, '');
    for (let len = 2; len <= 4 && len <= chineseChars.length; len++) {
      for (let i = 0; i <= chineseChars.length - len; i++) {
        const word = chineseChars.substring(i, i + len);
        freq[word] = (freq[word] || 0) + 0.5; // 中文词权重稍低
      }
    }

    return freq;
  }

  /**
   * 计算相关性分数
   */
  calculateScore(queryKeywords, docKeywords) {
    let score = 0;
    let queryWeight = 0;

    for (const [word, freq] of Object.entries(queryKeywords)) {
      queryWeight += freq;
      if (docKeywords[word]) {
        // 命中的词频
        score += Math.min(freq, docKeywords[word]);
      }
    }

    // 归一化
    if (queryWeight === 0) return 0;
    return score / queryWeight;
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    return this.documents.size > 0;
  }

  /**
   * 获取通道信息
   */
  getInfo() {
    return {
      ...super.getInfo(),
      documentCount: this.documents.size
    };
  }
}

module.exports = KeywordSearchChannel;
