/**
 * VectorSearchChannel - 向量检索通道
 *
 * 功能说明：
 * - 基于向量相似度的语义检索
 * - 使用余弦相似度计算相关性
 * - 支持 Qdrant 向量数据库后端
 * - 默认使用 Qdrant，Qdrant 不可用时降级到内存模式
 *
 * 企业级要点：
 * - Embedding 模型抽象：可接入外部 Embedding 服务
 * - 支持批量检索优化
 * - 向量缓存减少重复计算
 * - Qdrant 优先，降级到 memory
 */

const { SearchChannel, SearchResult } = require('../SearchChannel');
const AppError = require('../../../common/errors/AppError');
const createLogger = require('../../../common/logger');
const logger = createLogger('VectorSearchChannel');

class VectorSearchChannel extends SearchChannel {
  constructor(config = {}) {
    super({
      name: config.name || 'vector_search',
      weight: config.weight || 1.0,
      enabled: config.enabled !== false,
      timeout: config.timeout || 30000,
      maxResults: config.maxResults || 10,
      failureThreshold: config.failureThreshold || 5
    });

    // 向量数据库类型: 'qdrant' (默认) | 'memory' (降级)
    // 优先使用 Qdrant，Qdrant 不可用时降级到内存
    this.vectorDbType = config.vectorDbType || process.env.VECTOR_DB_TYPE || 'qdrant';

    // Qdrant 路由
    this.qdrantRouter = config.qdrantRouter || null;

    // 内存向量存储（备用，降级模式）
    this.memoryStore = new Map();

    // Embedding 模型客户端（用于内存模式）
    this.embeddingModel = config.embeddingModel || null;

    this.dimension = config.dimension || 1024;           // 向量维度
    this._embeddingCache = new Map();                     // Embedding 缓存

    // 是否已降级到内存模式
    this.degradedToMemory = false;
  }

  getType() {
    return 'vector';
  }

  /**
   * 执行向量检索
   * @param {string} query - 查询文本
   * @param {Object} options - { maxResults, filters, includeVectors }
   */
  async search(query, options = {}) {
    const maxResults = options.maxResults || this.maxResults;

    // 首次尝试 Qdrant 模式
    if (this.vectorDbType === 'qdrant' && this.qdrantRouter) {
      // 首次搜索前检查连接状态
      if (!this.degradedToMemory) {
        const health = await this.qdrantRouter.healthCheck();
        if (!health.success) {
          logger.warn(`Qdrant 健康检查失败，降级到内存模式`);
          this.degradedToMemory = true;
        }
      }

      if (!this.degradedToMemory) {
        try {
          return await this._searchWithQdrant(query, options);
        } catch (error) {
          logger.warn(`Qdrant 不可用，降级到内存模式`, { error: error.message });
          this.degradedToMemory = true;
        }
      }
    }

    // 降级到内存模式
    if (this.degradedToMemory || this.vectorDbType === 'memory') {
      logger.debug('使用内存向量存储模式');
      return this._searchWithMemory(query, options);
    }

    return [];
  }

  /**
   * 使用 Qdrant 进行搜索
   */
  async _searchWithQdrant(query, options = {}) {
    try {
      const result = await this.qdrantRouter.search(query, {
        topK: options.maxResults || this.maxResults,
        filter: options.filters,
      });

      if (!result.success) {
        logger.error(`Qdrant搜索失败`, { error: result.error });
        return [];
      }

      return result.results.map((item) => new SearchResult({
        id: item.id,
        content: item.text,
        score: item.score,
        metadata: {
          ...item.metadata,
          channel: this.name,
          type: 'vector',
          vectorDb: 'qdrant',
        },
      }));
    } catch (error) {
      logger.error(`Qdrant搜索异常`, { error: error.message });
      return [];
    }
  }

  /**
   * 使用内存存储进行搜索
   */
  async _searchWithMemory(query, options = {}) {
    const maxResults = options.maxResults || this.maxResults;

    // 1. 查询文本向量化
    const queryVector = await this._embed(query);

    // 2. 计算与所有文档的相似度
    const scoredResults = [];
    for (const [id, doc] of this.memoryStore.entries()) {
      // 应用过滤器
      if (options.filters && !this._matchFilters(doc, options.filters)) {
        continue;
      }

      // 计算余弦相似度
      const similarity = this._cosineSimilarity(queryVector, doc.vector);
      scoredResults.push(new SearchResult({
        id,
        content: doc.content,
        score: similarity,
        metadata: {
          ...doc.metadata,
          channel: this.name,
          type: 'vector',
          vectorDb: 'memory',
        },
      }));
    }

    // 3. 排序并返回 TopK
    scoredResults.sort((a, b) => b.score - a.score);
    return scoredResults.slice(0, maxResults);
  }

  /**
   * 添加文档到向量存储
   * @param {string} id - 文档ID
   * @param {string} content - 文档内容
   * @param {Object} metadata - 元信息
   */
  async addDocument(id, content, metadata = {}) {
    // Qdrant 模式
    if (this.vectorDbType === 'qdrant' && this.qdrantRouter) {
      return this._addDocumentToQdrant(id, content, metadata);
    }

    // 内存模式
    const vector = await this._embed(content);
    this.memoryStore.set(id, { content, vector, metadata });
    return { id, vector: vector.slice(0, 5) + '...' };  // 返回向量预览
  }

  /**
   * 添加文档到 Qdrant
   */
  async _addDocumentToQdrant(id, content, metadata = {}) {
    try {
      // 向量化
      const embedResult = await this.qdrantRouter.embed(content);
      if (!embedResult.success) {
        return { success: false, error: embedResult.error };
      }

      // 插入 Qdrant
      const insertResult = await this.qdrantRouter.vectorStore.insert({
        id,
        vector: embedResult.embedding,
        text: content,
        metadata,
      });

      return {
        success: insertResult.success,
        id,
        vector: embedResult.embedding.slice(0, 5) + '...',
      };
    } catch (error) {
      logger.error(`添加文档到Qdrant失败`, { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 批量添加文档（优化大规模入库）
   */
  async addDocuments(docs) {
    const results = [];

    // Qdrant 批量插入优化
    if (this.vectorDbType === 'qdrant' && this.qdrantRouter) {
      const texts = docs.map((d) => d.content);
      const embedResult = await this.qdrantRouter.embedBatch(texts);

      const vectors = [];
      const successfulDocs = [];

      for (let i = 0; i < docs.length; i++) {
        const embed = embedResult.embeddings[i];
        if (embed && embed.success) {
          vectors.push(embed.embedding);
          successfulDocs.push(docs[i]);
        }
      }

      if (vectors.length > 0) {
        const insertResult = await this.qdrantRouter.vectorStore.insertBatch({
          vectors,
          texts: successfulDocs.map((d) => d.content),
          metadata: {},
        });

        return {
          success: insertResult.success,
          insertedCount: insertResult.insertedCount,
          results: docs.map((d, i) => ({
            id: d.id,
            success: embedResult.embeddings[i]?.success,
          })),
        };
      }
    }

    // 内存模式
    for (const doc of docs) {
      const result = await this.addDocument(doc.id, doc.content, doc.metadata);
      results.push(result);
    }
    return results;
  }

  /**
   * 删除文档
   */
  async deleteDocument(id) {
    // Qdrant 模式
    if (this.vectorDbType === 'qdrant' && this.qdrantRouter) {
      return this.qdrantRouter.deleteDocuments([id]);
    }

    // 内存模式
    return this.memoryStore.delete(id);
  }

  /**
   * 清空向量存储
   */
  async clear() {
    this._embeddingCache.clear();

    // Qdrant 模式：删除集合
    if (this.vectorDbType === 'qdrant' && this.qdrantRouter) {
      await this.qdrantRouter.vectorStore.dropCollection();
      await this.qdrantRouter.vectorStore.createCollection();
      await this.qdrantRouter.vectorStore.createIndex();
      await this.qdrantRouter.vectorStore.loadCollection();
      return;
    }

    // 内存模式
    this.memoryStore.clear();
  }

  /**
   * 获取存储统计
   */
  async getStats() {
    // Qdrant 模式
    if (this.vectorDbType === 'qdrant' && this.qdrantRouter) {
      const stats = await this.qdrantRouter.vectorStore.getStats();
      return {
        channel: this.name,
        type: 'vector',
        vectorDb: 'qdrant',
        ...stats,
        healthy: this.isHealthy(),
      };
    }

    return {
      channel: this.name,
      type: 'vector',
      vectorDb: this.vectorDbType,
      documentCount: this.memoryStore.size,
      dimension: this.dimension,
      healthy: this.isHealthy(),
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 文本向量化（带缓存）
   */
  async _embed(text) {
    // 检查缓存
    const cacheKey = text.slice(0, 100);
    if (this._embeddingCache.has(cacheKey)) {
      return this._embeddingCache.get(cacheKey);
    }

    // 使用 Embedding 模型或内置简单向量化
    let vector;
    if (this.embeddingModel) {
      vector = await this.embeddingModel.embed(text);
    } else {
      // 使用内置简单向量化
      vector = this._simpleEmbed(text);
    }

    // 存入缓存
    this._embeddingCache.set(cacheKey, vector);
    return vector;
  }

  /**
   * 内置简单向量化
   */
  _simpleEmbed(text) {
    const words = text.toLowerCase().split(/[\s,，。.!?]+/).filter(w => w.length > 1);
    const vector = new Array(384).fill(0);
    for (const word of words) {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(i);
        hash = hash & hash;
      }
      const index = Math.abs(hash) % 384;
      vector[index] += 1;
    }
    const magnitude = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) vector[i] /= magnitude;
    }
    return vector;
  }

  /**
   * 余弦相似度计算
   */
  _cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw AppError.internalError(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
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

module.exports = VectorSearchChannel;
