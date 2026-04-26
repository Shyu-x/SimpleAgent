/**
 * 去重处理器 - 基于 Jaccard 相似度
 * 计算文本间的 Jaccard 相似度，去除重复或高度相似的结果
 */
const PostProcessor = require('./PostProcessor');

class DeduplicationProcessor extends PostProcessor {
  constructor(options = {}) {
    // Jaccard 相似度阈值，默认 0.6
    const defaultOptions = {
      threshold: 0.6,
      // 文本字段名
      textField: 'text',
      // 用于相似度计算的文本长度截断
      truncateLength: 200,
      priority: 10, // 优先执行
      ...options
    };
    super(defaultOptions);
  }

  /**
   * 判断是否应该处理
   * @param {Object} context
   * @returns {boolean}
   */
  shouldProcess(context) {
    // 结果数量大于 1 时才需要去重
    return context.results && context.results.length > 1;
  }

  /**
   * 执行去重处理
   * @param {Array} results
   * @param {Object} context
   * @returns {Promise<Array>}
   */
  async process(results, context) {
    if (!this.shouldProcess(context)) {
      return results;
    }

    const { threshold = 0.6, textField = 'text', truncateLength = 200 } = this.options;

    // 计算每条结果的特征向量（分词集合）
    const itemsWithFeatures = results.map((item, index) => {
      const text = this._getText(item, textField, truncateLength);
      const tokens = this._tokenize(text);
      return { item, index, tokens };
    });

    // 使用贪心算法选择不重复的结果
    const selected = [];
    const usedIndices = new Set();

    // 按文本长度降序排列，优先保留长文本
    itemsWithFeatures.sort((a, b) => b.tokens.size - a.tokens.size);

    for (const { item, index, tokens } of itemsWithFeatures) {
      if (usedIndices.has(index)) continue;

      // 检查与已选结果是否相似
      let isDuplicate = false;
      for (const selectedIndex of selected) {
        const selectedItem = results[selectedIndex];
        const selectedText = this._getText(selectedItem, textField, truncateLength);
        const selectedTokens = this._tokenize(selectedText);
        const similarity = this._jaccardSimilarity(tokens, selectedTokens);

        if (similarity >= threshold) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        selected.push(index);
        usedIndices.add(index);
      }
    }

    // 按原始顺序返回
    selected.sort((a, b) => a - b);
    const deduplicated = selected.map(i => results[i]);

    console.log(`[DeduplicationProcessor] 原始 ${results.length} 条，去重后 ${deduplicated.length} 条`);

    return deduplicated;
  }

  /**
   * 获取文本内容
   * @private
   */
  _getText(item, textField, truncateLength) {
    let text = item[textField] || item.content || item.snippet || String(item);
    text = text.slice(0, truncateLength);
    return text;
  }

  /**
   * 简单分词（中文按字符，英文按空格）
   * @private
   */
  _tokenize(text) {
    if (!text) return new Set();
    // 支持中文单字和英文单词
    const tokens = text.toLowerCase().match(/[\u4e00-\u9fff]|[a-z]+/g) || [];
    return new Set(tokens);
  }

  /**
   * 计算 Jaccard 相似度
   * Jaccard = |A ∩ B| / |A ∪ B|
   * @private
   */
  _jaccardSimilarity(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 1.0;
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }
}

module.exports = DeduplicationProcessor;
