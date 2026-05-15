/**
 * 阈值过滤处理器
 * 根据相关性分数阈值过滤结果，支持绝对阈值和相对阈值
 */
const PostProcessor = require('./PostProcessor');
const createLogger = require('../../../common/logger');
const logger = createLogger('ThresholdFilterProcessor');

class ThresholdFilterProcessor extends PostProcessor {
  constructor(options = {}) {
    const defaultOptions = {
      // 分数字段名
      scoreField: 'score',
      // 绝对阈值：分数低于此值的结果将被过滤
      absoluteThreshold: null,
      // 相对阈值：保留前 topN 条（如果设置）
      topN: null,
      // 最低保留数量（相对阈值模式下，即使分数较低也保留至少这些结果）
      minKeep: 1,
      // 是否启用
      enabled: true,
      priority: 30,
      ...options
    };
    super(defaultOptions);
  }

  shouldProcess(context) {
    return this.options.enabled && context.results && context.results.length > 0;
  }

  /**
   * 执行阈值过滤
   * @param {Array} results
   * @param {Object} context
   * @returns {Promise<Array>}
   */
  async process(results, context) {
    if (!this.shouldProcess(context)) {
      return results;
    }

    const {
      scoreField = 'score',
      absoluteThreshold,
      topN,
      minKeep = 1
    } = this.options;

    let filtered = results;

    // 1. 绝对阈值过滤
    if (absoluteThreshold !== null && absoluteThreshold !== undefined) {
      const before = filtered.length;
      filtered = filtered.filter(r => {
        const score = this._getScore(r, scoreField);
        return score >= absoluteThreshold;
      });
      // 确保至少保留 minKeep 条
      if (filtered.length < minKeep && results.length >= minKeep) {
        logger.debug(`绝对阈值过滤后结果过少，回退到保留 top ${minKeep} 条`);
        filtered = results.slice(0, minKeep);
      }
    }

    // 2. 相对阈值（topN）
    if (topN !== null && topN !== undefined) {
      const topResults = filtered.slice(0, topN);
      // 检查 topN 结果的最低分数是否过低
      const minScoreInTop = topResults.length > 0
        ? Math.min(...topResults.map(r => this._getScore(r, scoreField)))
        : 0;
      const avgScore = filtered.length > 0
        ? filtered.reduce((sum, r) => sum + this._getScore(r, scoreField), 0) / filtered.length
        : 0;

      // 如果 topN 结果的最低分远低于平均分，过滤掉低质量结果
      if (minScoreInTop < avgScore * 0.3 && topResults.length >= minKeep) {
        filtered = topResults;
      } else if (topResults.length >= minKeep) {
        filtered = topResults;
      }
    }

    logger.debug(
      `原始 ${results.length} 条，` +
      `过滤后 ${filtered.length} 条` +
      (absoluteThreshold !== null ? ` (绝对阈值 >= ${absoluteThreshold})` : '') +
      (topN !== null ? ` (topN = ${topN})` : '')
    );

    return filtered;
  }

  /**
   * 获取分数，支持嵌套字段
   * @private
   */
  _getScore(result, scoreField) {
    const score = result[scoreField];
    if (score !== undefined && score !== null) {
      return typeof score === 'number' ? score : parseFloat(score) || 0;
    }
    // 尝试从 metadata 中获取
    if (result.metadata && result.metadata[scoreField] !== undefined) {
      return parseFloat(result.metadata[scoreField]) || 0;
    }
    // 尝试从 _score 字段（Elasticsearch 风格）
    if (result._score !== undefined) {
      return parseFloat(result._score) || 0;
    }
    return 0;
  }
}

module.exports = ThresholdFilterProcessor;
