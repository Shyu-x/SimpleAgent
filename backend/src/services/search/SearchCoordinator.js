/**
 * 检索协调器
 *
 * 为什么需要协调器：
 * 企业RAG系统通常需要多路检索并行执行，然后合并去重。
 * 如果在业务代码里写这个逻辑，会非常混乱。
 *
 * 协调器职责：
 * 1. 并行执行多个检索通道
 * 2. 按权重合并结果
 * 3. 去重
 * 4. 异常隔离（一个通道失败不影响其他）
 *
 * 使用责任链+策略模式：通道可插拔，结果可配置权重。
 */

const { SearchChannel, SearchResult } = require('./SearchChannel');
const AppError = require('../../common/errors/AppError');
const { createLogger } = require('../../infra/logger/AgentLogger');

const logger = createLogger('searchCoordinator');

class SearchCoordinator {
  constructor(options = {}) {
    this.channels = new Map(); // name -> SearchChannel
    this.defaultTopK = options.defaultTopK || 10;
    this.deduplicationThreshold = options.deduplicationThreshold || 0.95;
  }

  /**
   * 注册检索通道
   */
  registerChannel(channel) {
    if (!(channel instanceof SearchChannel)) {
      throw AppError.validationError('SearchChannel', 'Channel must be instance of SearchChannel');
    }
    this.channels.set(channel.name, channel);
    return this;
  }

  /**
   * 批量注册通道
   */
  registerChannels(channels) {
    for (const channel of channels) {
      this.registerChannel(channel);
    }
    return this;
  }

  /**
   * 移除通道
   */
  removeChannel(name) {
    return this.channels.delete(name);
  }

  /**
   * 获取通道
   */
  getChannel(name) {
    return this.channels.get(name);
  }

  /**
   * 获取所有通道信息
   */
  getChannelsInfo() {
    return Array.from(this.channels.values()).map(ch => ch.getInfo());
  }

  /**
   * 多路检索
   * @param {string} query - 查询
   * @param {Object} options - 选项 { topK, channels, weights, parallel }
   */
  async search(query, options = {}) {
    const topK = options.topK || this.defaultTopK;
    const channelNames = options.channels || Array.from(this.channels.keys());
    const parallel = options.parallel !== false; // 默认并行

    // 过滤启用的通道
    const activeChannels = channelNames
      .map(name => this.channels.get(name))
      .filter(ch => ch && ch.enabled);

    if (activeChannels.length === 0) {
      return [];
    }

    let results;

    if (parallel) {
      // 并行检索
      results = await this.searchParallel(activeChannels, query, options);
    } else {
      // 串行检索
      results = await this.searchSequential(activeChannels, query, options);
    }

    // 合并结果
    const merged = this.mergeResults(results, options.weights);

    // 去重
    const deduplicated = this.deduplicate(merged);

    // 按分数排序
    deduplicated.sort((a, b) => b.score - a.score);

    return deduplicated.slice(0, topK);
  }

  /**
   * 并行检索
   */
  async searchParallel(channels, query, options) {
    const promises = channels.map(async (channel) => {
      try {
        const timeoutPromise = this.withTimeout(
          channel.search(query, options),
          channel.timeout
        );
        const results = await timeoutPromise;
        return {
          channel: channel.name,
          weight: channel.weight,
          results
        };
      } catch (error) {
        logger.error('Channel failed', { channel: channel.name, error: error.message });
        return {
          channel: channel.name,
          weight: channel.weight,
          results: [],
          error: error.message
        };
      }
    });

    return Promise.all(promises);
  }

  /**
   * 串行检索
   */
  async searchSequential(channels, query, options) {
    const results = [];
    for (const channel of channels) {
      try {
        const timeoutPromise = this.withTimeout(
          channel.search(query, options),
          channel.timeout
        );
        const channelResults = await timeoutPromise;
        results.push({
          channel: channel.name,
          weight: channel.weight,
          results: channelResults
        });
      } catch (error) {
        logger.error('Channel failed', { channel: channel.name, error: error.message });
        results.push({
          channel: channel.name,
          weight: channel.weight,
          results: [],
          error: error.message
        });
      }
    }
    return results;
  }

  /**
   * 合并结果，按权重计算最终分数
   */
  mergeResults(channelResults, customWeights = {}) {
    const resultMap = new Map(); // id -> SearchResult

    for (const { channel, weight, results } of channelResults) {
      const effectiveWeight = customWeights[channel] || weight;

      for (const result of results) {
        const existing = resultMap.get(result.id);
        if (existing) {
          // 已有结果，累加分数
          existing.score += result.score * effectiveWeight;
          existing.metadata.channels = existing.metadata.channels || [];
          existing.metadata.channels.push(channel);
        } else {
          // 新结果
          resultMap.set(result.id, new SearchResult({
            ...result.toJSON(),
            score: result.score * effectiveWeight,
            metadata: {
              ...result.metadata,
              channels: [channel]
            }
          }));
        }
      }
    }

    return Array.from(resultMap.values());
  }

  /**
   * 去重
   */
  deduplicate(results) {
    const seen = new Map(); // contentHash -> result

    for (const result of results) {
      const hash = this.hashContent(result.content);
      const existing = seen.get(hash);

      if (!existing) {
        seen.set(hash, result);
      } else {
        // 保留分数更高的
        if (result.score > existing.score) {
          seen.set(hash, result);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * 内容hash
   */
  hashContent(content) {
    // 简单hash：取前100字符的hash
    const text = content.substring(0, 100).trim();
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * 超时包装
   */
  withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Search timeout')), ms)
      )
    ]);
  }
}

module.exports = SearchCoordinator;
