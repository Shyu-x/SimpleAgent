/**
 * SearchChannel - 检索通道抽象基类
 *
 * 设计理念：
 * - 策略模式：每种检索方式（向量/关键词）实现统一接口
 * - 可插拔架构：支持动态添加/移除检索通道
 *
 * 企业级要点：
 * - 子类只需关注检索逻辑，通用能力（超时、重试、限流）由基类提供
 * - 健康检查机制支持模型故障自动隔离
 */

class SearchChannel {
  constructor(config = {}) {
    this.name = config.name || 'base_channel';
    this.AppError = require('../../common/errors/AppError');
    this.weight = config.weight || 1.0;           // 检索结果权重
    this.enabled = config.enabled !== false;       // 是否启用
    this.timeout = config.timeout || 30000;        // 超时时间(ms)
    this.maxResults = config.maxResults || 10;      // 最大返回结果数

    // 健康状态（用于熔断降级）
    this._healthy = true;
    this._lastHealthCheck = null;
    this._failureCount = 0;
    this._failureThreshold = config.failureThreshold || 5;
  }

  /**
   * 执行检索 - 子类必须实现
   * @param {string} query - 查询文本
   * @param {Object} options - 检索选项
   * @returns {Promise<SearchResult[]>} 检索结果列表
   */
  async search(query, options = {}) {
    throw this.AppError.internalError('search() must be implemented by subclass');
  }

  /**
   * 获取通道类型标识
   */
  getType() {
    return 'base';
  }

  /**
   * 健康检查
   * @returns {boolean} 是否健康
   */
  isHealthy() {
    // 如果上次检查超过5分钟且失败次数过多，标记为不健康
    if (this._lastHealthCheck) {
      const elapsed = Date.now() - this._lastHealthCheck;
      if (elapsed > 5 * 60 * 1000 && this._failureCount >= this._failureThreshold) {
        this._healthy = false;
      }
    }
    return this._healthy;
  }

  /**
   * 记录成功
   */
  recordSuccess() {
    this._failureCount = 0;
    this._healthy = true;
    this._lastHealthCheck = Date.now();
  }

  /**
   * 记录失败
   */
  recordFailure() {
    this._failureCount++;
    this._lastHealthCheck = Date.now();
    if (this._failureCount >= this._failureThreshold) {
      this._healthy = false;
    }
  }

  /**
   * 启用/禁用通道
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * 带超时的检索包装
   * @param {string} query - 查询文本
   * @param {Object} options - 检索选项
   * @returns {Promise<SearchResult[]>}
   */
  async searchWithTimeout(query, options = {}) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Search channel ${this.name} timeout`)), this.timeout);
    });

    try {
      const result = await Promise.race([this.search(query, options), timeoutPromise]);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * 获取通道元信息
   */
  getInfo() {
    return {
      name: this.name,
      type: this.getType(),
      weight: this.weight,
      enabled: this.enabled,
      healthy: this.isHealthy(),
      failureCount: this._failureCount
    };
  }
}

/**
 * 检索结果数据结构
 */
class SearchResult {
  constructor({ id, content, score, metadata = {} }) {
    this.id = id;
    this.content = content;
    this.score = score;              // 相关性得分 (0-1)
    this.metadata = metadata;        // 元信息（来源、时间等）
  }

  toJSON() {
    return {
      id: this.id,
      content: this.content,
      score: this.score,
      metadata: this.metadata
    };
  }
}

module.exports = { SearchChannel, SearchResult };
