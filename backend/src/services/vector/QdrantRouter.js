/**
 * QdrantRouter - Qdrant 向量路由
 *
 * 功能：
 * - 文本向量化（使用 MiniMax Embedding API）
 * - 向量存储与检索（使用 Qdrant）
 * - 统一接口封装
 *
 * @module services/vector/QdrantRouter
 */

const QdrantVectorStore = require('./QdrantVectorStore');

class QdrantRouter {
  constructor(options = {}) {
    this.vectorStore = new QdrantVectorStore({
      host: options.host || process.env.QDRANT_HOST,
      port: options.port || process.env.QDRANT_PORT,
      collection: options.collection || process.env.QDRANT_COLLECTION || 'chat_documents',
      dimension: options.dimension || parseInt(process.env.QDRANT_DIMENSION) || 1024,
      apiKey: options.apiKey || process.env.QDRANT_API_KEY,
    });

    // MiniMax Embedding API 配置
    this.embeddingApiUrl = options.embeddingApiUrl || process.env.MINIMAX_EMBEDDING_URL || 'https://api.minimaxi.com/anthropic/v1/embeddings';
    this.embeddingModel = options.embeddingModel || process.env.MINIMAX_EMBEDDING_MODEL || 'embedding-multilingual';
    this.embeddingApiKey = options.embeddingApiKey || process.env.MINIMAX_API_KEY;

    this.isHealthy = false;
    this.lastHealthCheck = null;
    this.initialized = false;
  }

  /**
   * 初始化连接
   */
  async initialize() {
    if (this.initialized) {
      return { success: true };
    }

    try {
      // 连接 Qdrant
      const connectResult = await this.vectorStore.connect();
      if (!connectResult.success) {
        return connectResult;
      }

      // 创建集合（如不存在）
      await this.vectorStore.createCollection();

      this.initialized = true;
      console.log('[QdrantRouter] 初始化成功');
      return { success: true };
    } catch (error) {
      console.error(`[QdrantRouter] 初始化失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    const vectorStoreHealth = await this.vectorStore.healthCheck();
    this.isHealthy = vectorStoreHealth.success;
    this.lastHealthCheck = new Date();

    return {
      success: this.isHealthy,
      vectorStore: vectorStoreHealth,
      embeddingModel: this.embeddingModel,
    };
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      healthy: this.isHealthy,
      lastCheck: this.lastHealthCheck,
      initialized: this.initialized,
      embeddingModel: this.embeddingModel,
      collection: this.vectorStore.collectionName,
    };
  }

  /**
   * 文本向量化（使用 MiniMax API）
   * @param {string} text
   * @returns {Promise<Object>}
   */
  async embed(text) {
    try {
      if (!text || text.trim().length === 0) {
        return { success: false, error: 'Text is empty' };
      }

      const response = await fetch(this.embeddingApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.embeddingApiKey}`,
        },
        body: JSON.stringify({
          model: this.embeddingModel,
          input: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      return {
        success: true,
        embedding: data.data?.[0]?.embedding || data.embedding,
        model: data.model || this.embeddingModel,
        dimension: data.data?.[0]?.embedding?.length || data.embedding?.length || 0,
      };
    } catch (error) {
      console.error(`[QdrantRouter] Embedding failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 批量向量化
   * @param {string[]} texts
   * @returns {Promise<Object>}
   */
  async embedBatch(texts) {
    if (!texts || texts.length === 0) {
      return { success: true, embeddings: [] };
    }

    const results = [];
    const batchSize = 32;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      try {
        const response = await fetch(this.embeddingApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.embeddingApiKey}`,
          },
          body: JSON.stringify({
            model: this.embeddingModel,
            input: batch,
          }),
        });

        if (!response.ok) {
          throw new Error(`Embedding API error: ${response.status}`);
        }

        const data = await response.json();
        const embeddings = data.data || [];

        for (let j = 0; j < batch.length; j++) {
          results.push({
            index: i + j,
            text: batch[j],
            embedding: embeddings[j]?.embedding || null,
            success: !!embeddings[j]?.embedding,
          });
        }
      } catch (error) {
        console.error(`[QdrantRouter] Batch embedding failed: ${error.message}`);
        for (let j = 0; j < batch.length; j++) {
          results.push({
            index: i + j,
            text: batch[j],
            embedding: null,
            success: false,
            error: error.message,
          });
        }
      }

      if (i + batchSize < texts.length) {
        await this.sleep(100);
      }
    }

    const successful = results.filter((r) => r.success);

    return {
      success: successful.length === texts.length,
      embeddings: results,
      stats: {
        total: texts.length,
        successful: successful.length,
        failed: texts.length - successful.length,
      },
    };
  }

  /**
   * 文档向量化入库
   * @param {string} document - 文档内容
   * @param {Object} options - { chunkSize, overlap, metadata }
   */
  async embedDocument(document, options = {}) {
    const { chunkSize = 512, overlap = 50, metadata = {} } = options;

    // 文本分块
    const chunks = this.splitText(document, chunkSize, overlap);

    // 批量向量化
    const embedResult = await this.embedBatch(chunks);

    // 插入 Qdrant
    const vectors = embedResult.embeddings
      .filter((e) => e.success)
      .map((e) => e.embedding);

    const texts = embedResult.embeddings
      .filter((e) => e.success)
      .map((e) => e.text);

    if (vectors.length === 0) {
      return {
        success: false,
        error: 'Failed to generate any embeddings',
        chunks: [],
      };
    }

    const insertResult = await this.vectorStore.insertBatch({
      vectors,
      texts,
      metadata: { ...metadata, source: 'document' },
    });

    return {
      success: insertResult.success,
      chunks: embedResult.embeddings.map((e, i) => ({
        content: e.text,
        index: i,
        embedding: e.embedding,
        embedded: e.success,
      })),
      insertedCount: insertResult.insertedCount,
      stats: embedResult.stats,
    };
  }

  /**
   * 搜索相似文档
   * @param {string} query - 查询文本
   * @param {Object} options - { topK, filters }
   */
  async search(query, options = {}) {
    const topK = options.topK || 10;

    try {
      // 查询文本向量化
      const embedResult = await this.embed(query);
      if (!embedResult.success) {
        return { success: false, error: embedResult.error };
      }

      // Qdrant 搜索
      const searchResult = await this.vectorStore.search({
        queryVector: embedResult.embedding,
        topK,
        filter: options.filter,
      });

      return {
        success: searchResult.success,
        results: searchResult.results || [],
        query,
        topK,
      };
    } catch (error) {
      console.error(`[QdrantRouter] Search failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除文档
   * @param {string[]} ids
   */
  async deleteDocuments(ids) {
    return this.vectorStore.delete({ ids });
  }

  /**
   * 获取存储统计
   */
  async getStats() {
    const stats = await this.vectorStore.getStats();
    return {
      ...stats,
      embeddingModel: this.embeddingModel,
    };
  }

  /**
   * 文本分块
   */
  splitText(text, chunkSize, overlap) {
    if (text.length <= chunkSize) {
      return [text];
    }

    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = start + chunkSize;

      if (end < text.length) {
        const sentenceEnd = text.lastIndexOf(/[.!?。！？]\s/.source, end);
        const newlineEnd = text.lastIndexOf('\n', end);

        if (sentenceEnd > start + chunkSize / 2) {
          end = sentenceEnd + 1;
        } else if (newlineEnd > start + chunkSize / 2) {
          end = newlineEnd + 1;
        }
      }

      chunks.push(text.slice(start, end).trim());
      start = end - overlap;

      if (start >= text.length - chunkSize) {
        const lastChunk = text.slice(start).trim();
        if (lastChunk.length > overlap) {
          chunks.push(lastChunk);
        }
        break;
      }
    }

    return chunks;
  }

  /**
   * 延迟
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 单例模式
let instance = null;

function getQdrantRouter(options = {}) {
  if (!instance) {
    instance = new QdrantRouter(options);

    // 异步初始化（不阻塞路由创建）
    setImmediate(() => {
      instance.initialize().catch((err) => {
        console.warn(`[QdrantRouter] Initial initialization failed: ${err.message}`);
      });
    });
  }
  return instance;
}

/**
 * 重置单例
 */
function resetQdrantRouter() {
  if (instance) {
    instance.vectorStore.disconnect();
    instance = null;
  }
}

module.exports = {
  QdrantRouter,
  getQdrantRouter,
  resetQdrantRouter,
};
