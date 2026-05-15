/**
 * SearchCoordinator - 检索协调器
 *
 * 功能说明：
 * - 管理多个检索通道的协调执行
 * - 支持并行/串行检索策略
 * - 结果合并与去重
 * - 通道权重配置
 *
 * 设计模式：
 * - 策略模式：不同通道可插拔
 * - 组合模式：多个通道协同工作
 * - 装饰器模式：结果后处理链
 *
 * 企业级要点：
 * - 并行检索减少延迟
 * - 通道故障自动降级
 * - 结果去重避免重复
 * - 可扩展的后处理流水线
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

const { SearchResult } = require('./SearchChannel');
const ProcessorChain = require('./ProcessorChain');
const DeduplicationProcessor = require('./postProcessors/DeduplicationProcessor');
const RerankerProcessor = require('./postProcessors/RerankerProcessor');
const ThresholdFilterProcessor = require('./postProcessors/ThresholdFilterProcessor');
const { Reranker } = require('../rag/Reranker');
const AppError = require('../../common/errors/AppError');
const createLogger = require('../../common/logger');
const logger = createLogger('SearchCoordinator');

/**
 * 线程池执行器 - 控制并发数量的并行执行器
 *
 * 参考 Ragent 的 threadPoolExecutor 实现
 * 用于限制同时执行的通道数量，避免资源竞争
 */
class ThreadPoolExecutor {
  /**
   * @param {number} concurrency - 最大并发数
   */
  constructor(concurrency = 5) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
    this.results = [];
    this.errors = [];
  }

  /**
   * 添加任务
   * @param {Function} taskFn - 异步任务函数
   * @returns {Promise}
   */
  addTask(taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
      this._processQueue();
    });
  }

  /**
   * 处理队列
   * @private
   */
  _processQueue() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const { taskFn, resolve, reject } = this.queue.shift();
      this.running++;

      taskFn()
        .then(res => {
          this.results.push(res);
          resolve(res);
        })
        .catch(err => {
          this.errors.push(err);
          reject(err);
        })
        .finally(() => {
          this.running--;
          this._processQueue();
        });
    }
  }

  /**
   * 等待所有任务完成
   * @returns {Promise<Array>}
   */
  async waitForCompletion() {
    while (this.running > 0 || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return this.results;
  }

  /**
   * 获取并发数
   */
  getConcurrency() {
    return this.concurrency;
  }

  /**
   * 设置并发数
   * @param {number} concurrency
   */
  setConcurrency(concurrency) {
    this.concurrency = concurrency;
  }
}

class SearchCoordinator {
  constructor(config = {}) {
    this.channels = new Map();          // 通道注册表
    this.strategy = config.strategy || 'parallel';  // parallel | sequential | weighted
    this.defaultMaxResults = config.defaultMaxResults || 10;

    // 线程池执行器 - 控制并行通道执行的并发数量
    this._threadPool = new ThreadPoolExecutor(config.concurrency || 5);

    // 处理器链 - 后处理流水线
    this._processorChain = new ProcessorChain();

    // 领域层重排序器 - 多策略重排序
    this._domainReranker = null;
    this._rerankerEnabled = config.rerankerEnabled !== false;

    // 是否启用后处理流水线
    this._postProcessingEnabled = config.postProcessingEnabled !== false;

    // 统计信息
    this._stats = {
      totalRequests: 0,
      channelStats: new Map(),
      parallelExecutions: 0,
      sequentialExecutions: 0,
      totalLatencyMs: 0
    };

    // 初始化默认后处理器
    this._initDefaultProcessors();
  }

  /**
   * 初始化默认后处理器
   * 按照优先级顺序：
   * 1. DeduplicationProcessor (priority: 10) - 基于 Jaccard 相似度的去重
   * 2. ThresholdFilterProcessor (priority: 30) - 阈值过滤
   * 3. RerankerProcessor (priority: 50) - LLM 重排序
   * @private
   */
  _initDefaultProcessors() {
    // 默认去重处理器 - 基于内容相似度的 Jaccard 去重
    const dedupProcessor = new DeduplicationProcessor({
      threshold: 0.6,
      textField: 'content',
      truncateLength: 200,
      priority: 10,
      enabled: true
    });

    // 默认阈值过滤处理器
    const thresholdProcessor = new ThresholdFilterProcessor({
      scoreField: 'score',
      topN: 20,
      minKeep: 3,
      priority: 30,
      enabled: true
    });

    // 添加到处理器链
    this._processorChain.addProcessor(dedupProcessor);
    this._processorChain.addProcessor(thresholdProcessor);
  }

  /**
   * 注册检索通道
   * @param {SearchChannel} channel - 检索通道实例
   */
  registerChannel(channel) {
    if (!channel || !channel.name) {
      throw AppError.validationError('name', 'Invalid channel: must have a name');
    }
    this.channels.set(channel.name, channel);
    this._stats.channelStats.set(channel.name, {
      requests: 0,
      failures: 0,
      avgLatency: 0,
      totalLatency: 0
    });
    return this;
  }

  /**
   * 设置领域层重排序器
   * @param {Reranker} reranker - 领域重排序器实例
   * @returns {SearchCoordinator} this
   */
  setDomainReranker(reranker) {
    this._domainReranker = reranker;
    return this;
  }

  /**
   * 获取领域层重排序器
   * @returns {Reranker|null}
   */
  getDomainReranker() {
    return this._domainReranker;
  }

  /**
   * 启用/禁用领域重排序器
   * @param {boolean} enabled
   * @returns {SearchCoordinator} this
   */
  setRerankerEnabled(enabled) {
    this._rerankerEnabled = enabled;
    return this;
  }

  /**
   * 添加后处理器到处理器链
   * @param {PostProcessor} processor
   * @returns {SearchCoordinator} this
   */
  addProcessor(processor) {
    this._processorChain.addProcessor(processor);
    return this;
  }

  /**
   * 获取处理器链
   * @returns {ProcessorChain}
   */
  getProcessorChain() {
    return this._processorChain;
  }

  /**
   * 启用/禁用后处理流水线
   * @param {boolean} enabled
   * @returns {SearchCoordinator} this
   */
  setPostProcessingEnabled(enabled) {
    this._postProcessingEnabled = enabled;
    return this;
  }

  /**
   * 设置线程池并发数
   * @param {number} concurrency
   * @returns {SearchCoordinator} this
   */
  setConcurrency(concurrency) {
    this._threadPool.setConcurrency(concurrency);
    return this;
  }

  /**
   * 注销检索通道
   */
  unregisterChannel(name) {
    const removed = this.channels.delete(name);
    if (removed) {
      this._stats.channelStats.delete(name);
    }
    return removed;
  }

  /**
   * 获取通道列表
   */
  getChannels() {
    return Array.from(this.channels.values()).map(ch => ch.getInfo());
  }

  /**
   * 执行检索 - 多通道检索入口
   *
   * 检索流程：
   * 1. retrieveKnowledgeChannels() - 构建 SearchContext，确定目标通道
   * 2. executeSearchChannels() - 并行/串行执行所有通道
   * 3. executePostProcessors() - 后处理链（去重 → 过滤 → 重排序）
   * 4. executeDomainReranker() - 领域层多策略重排序
   *
   * @param {string} query - 查询文本
   * @param {Object} options - {
   *   channels: string[],      // 指定通道，默认全部
   *   maxResults: number,     // 最大结果数
   *   strategy: string,       // 检索策略: parallel | sequential | weighted
   *   filters: Object,        // 过滤器
   *   enableRerank: boolean,  // 是否启用重排序
   *   fusionType: string,    // 融合方式: RRFS | RRF | weighted
   *   concurrency: number     // 并发数
   * }
   * @returns {Promise<Object>} - { query, results, metadata }
   */
  async search(query, options = {}) {
    const startTime = Date.now();
    this._stats.totalRequests++;

    // 确定要使用的通道
    const targetChannels = this._getTargetChannels(options.channels);

    // 如果没有可用通道，返回空结果
    if (targetChannels.length === 0) {
      logger.warn('没有可用的检索通道');
      return {
        query,
        results: [],
        metadata: {
          totalResults: 0,
          channelsUsed: [],
          latency: Date.now() - startTime,
          strategy: options.strategy || this.strategy
        }
      };
    }

    // 根据策略执行检索
    let channelResults;
    switch (options.strategy || this.strategy) {
      case 'parallel':
        this._stats.parallelExecutions++;
        channelResults = await this._executeSearchChannelsParallel(query, targetChannels, options);
        break;
      case 'sequential':
        this._stats.sequentialExecutions++;
        channelResults = await this._executeSearchChannelsSequential(query, targetChannels, options);
        break;
      case 'weighted':
        this._stats.parallelExecutions++;
        channelResults = await this._executeSearchChannelsWeighted(query, targetChannels, options);
        break;
      default:
        this._stats.parallelExecutions++;
        channelResults = await this._executeSearchChannelsParallel(query, targetChannels, options);
    }

    // 结果融合
    let fusedResults = this._fuseResults(channelResults, options.fusionType || 'RRFS');

    // 后处理流水线执行
    if (this._postProcessingEnabled) {
      fusedResults = await this._executePostProcessors(fusedResults, {
        query,
        ...options
      });
    }

    // 领域层重排序（多策略）
    if (this._rerankerEnabled && this._domainReranker) {
      fusedResults = await this._executeDomainReranker(query, fusedResults, options);
    }

    // 截取最终结果
    const maxResults = options.maxResults || this.defaultMaxResults;
    const finalResults = fusedResults.slice(0, maxResults);

    // 记录统计
    const latency = Date.now() - startTime;
    this._stats.totalLatencyMs += latency;
    this._recordLatencyStats(targetChannels, latency);

    return {
      query,
      results: finalResults,
      metadata: {
        totalResults: finalResults.length,
        channelsUsed: targetChannels.map(ch => ch.name),
        latency,
        strategy: options.strategy || this.strategy,
        postProcessingEnabled: this._postProcessingEnabled,
        rerankerEnabled: this._rerankerEnabled
      }
    };
  }

  /**
   * 并行执行所有检索通道（使用线程池控制并发）
   *
   * 参考 Ragent 的 threadPoolExecutor 实现
   *
   * @param {string} query - 查询文本
   * @param {Array} channels - 目标通道列表
   * @param {Object} options - 检索选项
   * @returns {Promise<Array>} - 各通道的检索结果
   * @private
   */
  async _executeSearchChannelsParallel(query, channels, options) {
    const healthyChannels = channels.filter(ch => ch.enabled && ch.isHealthy());

    if (healthyChannels.length === 0) {
      logger.warn('没有健康的通道可执行并行检索');
      return [];
    }

    // 并行执行通道 - operational info

    // 使用线程池执行器并行执行通道
    const promises = healthyChannels.map(channel =>
      this._threadPool.addTask(() => this._searchChannel(channel, query, options))
    );

    const channelResults = await Promise.allSettled(promises);

    // 收集成功的结果
    const successfulResults = channelResults
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    // 记录失败的通道
    channelResults
      .filter(r => r.status === 'rejected')
      .forEach((r, idx) => {
        const channelName = healthyChannels[idx]?.name;
        logger.error(`通道 ${channelName} 执行失败`, { error: r.reason?.message });
      });

    // 并行检索完成 - operational info

    return successfulResults;
  }

  /**
   * 串行执行检索通道（逐个查询，找到足够结果就停止）
   *
   * @param {string} query - 查询文本
   * @param {Array} channels - 目标通道列表
   * @param {Object} options - 检索选项
   * @returns {Promise<Array>} - 各通道的检索结果
   * @private
   */
  async _executeSearchChannelsSequential(query, channels, options) {
    const maxResults = options.maxResults || this.defaultMaxResults;
    const results = [];

    // 开始串行执行 - operational info

    for (const channel of channels) {
      if (!channel.enabled || !channel.isHealthy()) {
        // 跳过通道 - operational info
        continue;
      }

      try {
        const channelResult = await this._searchChannel(channel, query, options);
        results.push(channelResult);

        // 如果结果足够，停止检索
        const totalResults = results.reduce((sum, cr) => sum + (cr.results?.length || 0), 0);
        if (totalResults >= maxResults * 2) {
          // 串行检索结果已足够 - operational info
          break;
        }
      } catch (error) {
        logger.error(`通道 ${channel.name} 执行失败`, { error: error.message });
      }
    }

    // 串行检索完成 - operational info

    return results;
  }

  /**
   * 加权执行检索通道（考虑通道权重）
   *
   * @param {string} query - 查询文本
   * @param {Array} channels - 目标通道列表
   * @param {Object} options - 检索选项
   * @returns {Promise<Array>} - 各通道的检索结果
   * @private
   */
  async _executeSearchChannelsWeighted(query, channels, options) {
    // 加权模式下，先并行查询，再根据权重调整得分
    return this._executeSearchChannelsParallel(query, channels, options);
  }

  /**
   * 执行单个检索通道
   *
   * @param {SearchChannel} channel - 检索通道
   * @param {string} query - 查询文本
   * @param {Object} options - 检索选项
   * @returns {Promise<Object>} - { channel, type, weight, results, error? }
   * @private
   */
  async _searchChannel(channel, query, options) {
    const channelStart = Date.now();

    try {
      // 多取一些结果用于融合和后处理
      const results = await channel.searchWithTimeout(query, {
        maxResults: (options.maxResults || this.defaultMaxResults) * 3,
        filters: options.filters
      });

      // 记录成功
      const stats = this._stats.channelStats.get(channel.name);
      if (stats) {
        stats.requests++;
        stats.totalLatency += Date.now() - channelStart;
      }

      return {
        channel: channel.name,
        type: channel.getType(),
        weight: channel.weight,
        results
      };
    } catch (error) {
      // 记录失败
      const stats = this._stats.channelStats.get(channel.name);
      if (stats) {
        stats.failures++;
        stats.totalLatency += Date.now() - channelStart;
      }

      logger.error(`通道 ${channel.name} 检索失败`, { error: error.message });

      return {
        channel: channel.name,
        type: channel.getType(),
        weight: channel.weight,
        results: [],
        error: error.message
      };
    }
  }

  /**
   * 执行后处理流水线
   *
   * 流水线顺序（按优先级）：
   * 1. DeduplicationProcessor - Jaccard 相似度去重
   * 2. ThresholdFilterProcessor - 阈值过滤
   * 3. RerankerProcessor - LLM 重排序
   *
   * @param {Array} results - 待处理结果
   * @param {Object} context - 上下文信息
   * @returns {Promise<Array>} - 处理后的结果
   * @private
   */
  async _executePostProcessors(results, context) {
    if (!results || results.length === 0) {
      return results;
    }

    // 开始后处理流水线 - operational info
    this._processorChain.describe();

    try {
      // 通过处理器链执行
      const processedResults = await this._processorChain.execute(results, context);
      // 后处理流水线完成 - operational info
      return processedResults;
    } catch (error) {
      logger.error('后处理流水线执行异常', { error: error.message });
      return results;
    }
  }

  /**
   * 执行领域层重排序（多策略）
   *
   * 使用领域层 Reranker 进行多策略重排序：
   * - CrossEncoderRerankStrategy: LLM 评估相关性
   * - BM25RerankStrategy: BM25 分数增强
   * - SemanticRerankStrategy: 语义相似度
   * - DiversityRerankStrategy: 多样性提升
   *
   * @param {string} query - 查询文本
   * @param {Array} results - 待重排序结果
   * @param {Object} options - 选项
   * @returns {Promise<Array>} - 重排序后的结果
   * @private
   */
  async _executeDomainReranker(query, results, options = {}) {
    if (!this._domainReranker || !results || results.length === 0) {
      return results;
    }

    // 开始领域层重排序 - operational info

    try {
      // 使用领域重排序器
      const topK = options.maxResults || this.defaultMaxResults;
      const rerankedResults = await this._domainReranker.rerank(query, results, { topK });

      // 领域层重排序完成 - operational info
      return rerankedResults;
    } catch (error) {
      logger.error('领域层重排序异常', { error: error.message });
      return results;
    }
  }

  /**
   * 获取目标通道列表
   * @private
   */
  _getTargetChannels(channelNames) {
    if (!channelNames || channelNames.length === 0) {
      return Array.from(this.channels.values());
    }
    return channelNames
      .map(name => this.channels.get(name))
      .filter(Boolean);
  }

  /**
   * 统计总结果数
   */
  _countResults(channelResults) {
    return channelResults.reduce((sum, cr) => sum + (cr.results?.length || 0), 0);
  }

  /**
   * 记录延迟统计
   */
  _recordLatencyStats(channels, latency) {
    for (const ch of channels) {
      const stats = this._stats.channelStats.get(ch.name);
      if (stats) {
        // 滑动平均
        stats.avgLatency = stats.totalLatency / Math.max(stats.requests, 1);
      }
    }
  }

  /**
   * 结果融合
   * 支持多种融合算法：
   * - RRFS: Reciprocal Rank Fusion (倒数排名融合)
   * - RRF: 简化版 RRF
   * - weighted: 加权得分融合
   *
   * @param {Array} channelResults - 各通道的检索结果
   * @param {string} fusionType - 融合类型
   * @returns {Array} - 融合后的结果
   */
  _fuseResults(channelResults, fusionType = 'RRFS') {
    if (!channelResults || channelResults.length === 0) return [];
    if (channelResults.length === 1) return channelResults[0].results || [];

    const seen = new Map();  // id -> { result, sources }

    // 收集所有结果
    for (const cr of channelResults) {
      const results = cr.results || [];
      for (let rank = 0; rank < results.length; rank++) {
        const result = results[rank];
        const id = result.id;

        if (!seen.has(id)) {
          seen.set(id, { result: { ...result }, sources: [] });
        }

        const entry = seen.get(id);
        entry.sources.push({
          channel: cr.channel,
          rank: rank + 1,
          weight: cr.weight,
          type: cr.type
        });

        // 融合得分
        const fusedScore = this._calculateFusedScore(rank + 1, cr.weight, fusionType);
        entry.result.score = (entry.result.score || 0) + fusedScore;
      }
    }

    // 转换为结果数组
    const fused = Array.from(seen.values()).map(entry => ({
      ...entry.result,
      sources: entry.sources,
      fusedScore: entry.result.score
    }));

    // 按融合得分排序
    fused.sort((a, b) => b.score - a.score);

    return fused;
  }

  /**
   * 计算融合得分
   * RRFS 公式: score += weight / (k + rank)
   * k 通常为 60
   */
  _calculateFusedScore(rank, weight, fusionType) {
    const k = 60;

    switch (fusionType) {
      case 'RRFS':
        return weight / (k + rank);
      case 'RRF':
        return 1 / (k + rank);
      case 'weighted':
        return weight * (1 / rank);
      default:
        return 1 / (k + rank);
    }
  }

  /**
   * 记录延迟统计（保留兼容性）
   * @deprecated 使用 _recordLatencyStats 替代
   */
  _recordLatency(channels, latency) {
    this._recordLatencyStats(channels, latency);
  }

  /**
   * 获取协调器统计信息
   */
  getStats() {
    const channelStatsObj = {};
    for (const [name, stats] of this._stats.channelStats.entries()) {
      channelStatsObj[name] = {
        ...stats,
        avgLatency: stats.requests > 0 ? stats.totalLatency / stats.requests : 0
      };
    }

    return {
      totalRequests: this._stats.totalRequests,
      registeredChannels: this.channels.size,
      parallelExecutions: this._stats.parallelExecutions,
      sequentialExecutions: this._stats.sequentialExecutions,
      avgLatencyMs: this._stats.totalRequests > 0
        ? this._stats.totalLatencyMs / this._stats.totalRequests
        : 0,
      channelStats: channelStatsObj,
      threadPoolConcurrency: this._threadPool.getConcurrency(),
      postProcessingEnabled: this._postProcessingEnabled,
      rerankerEnabled: this._rerankerEnabled
    };
  }
}

module.exports = SearchCoordinator;
