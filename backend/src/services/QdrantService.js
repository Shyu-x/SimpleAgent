/**
 * QdrantService - Qdrant 向量数据库业务逻辑
 * 封装 QdrantRouter 的高级操作
 *
 * 注意：每个 collection 使用独立的 QdrantVectorStore 实例
 * 以避免单例模式导致的 collection 冲突问题
 */
const { QdrantRouter } = require('./vector/QdrantRouter');

class QdrantService {
  // 缓存不同 collection 的 router 实例
  _routerCache = new Map();

  // 并发控制信号量（防止高并发压垮 Qdrant）
  static _semaphore = { maxConcurrent: 50, current: 0, queue: [] };

  /**
   * 带信号量的并发控制
   * @private
   */
  async _withSemaphore(fn) {
    const Sema = QdrantService._semaphore;

    // 如果已达最大并发，加入队列等待
    if (Sema.current >= Sema.maxConcurrent) {
      await new Promise((resolve) => Sema.queue.push(resolve));
    }

    Sema.current++;

    try {
      return await fn();
    } finally {
      Sema.current--;
      // 释放后唤醒下一个等待的请求
      const next = Sema.queue.shift();
      if (next) next();
    }
  }

  /**
   * 获取带 collection 的 router
   * 每个 collection 使用独立实例，避免单例冲突
   */
  _getRouter(collection) {
    const collectionName = collection || process.env.QDRANT_COLLECTION || 'chat_documents';

    // 检查缓存
    if (this._routerCache.has(collectionName)) {
      return this._routerCache.get(collectionName);
    }

    // 创建新的 router 实例（每个 collection 独立）
    const router = new QdrantRouter({
      collection: collectionName,
      host: process.env.QDRANT_HOST,
      port: process.env.QDRANT_PORT,
      dimension: parseInt(process.env.QDRANT_DIMENSION) || 1024,
    });

    // 异步初始化
    setImmediate(() => {
      router.initialize().catch((err) => {
        console.warn(`QdrantService: Router initialization failed for ${collectionName}: ${err.message}`);
      });
    });

    this._routerCache.set(collectionName, router);
    return router;
  }

  /**
   * 获取服务状态
   */
  async getStatus() {
    const router = this._getRouter();
    const health = await router.healthCheck();
    return {
      success: health.success,
      healthy: health.success,
      status: health.vectorStore,
      collection: router.vectorStore.collectionName
    };
  }

  /**
   * 列表集合
   */
  async listCollections() {
    return this._getRouter().vectorStore.listCollections();
  }

  /**
   * 获取集合信息
   */
  async getCollectionInfo(collection) {
    const router = this._getRouter(collection);
    return router.vectorStore.getCollectionInfo();
  }

  /**
   * 删除集合
   */
  async dropCollection(collection) {
    const router = this._getRouter(collection);
    return router.vectorStore.dropCollection();
  }

  /**
   * 创建集合（支持生产级 HNSW + 量化参数）
   */
  async createCollection(options = {}) {
    const {
      collection,
      dimension = 1024,
      distance = 'Cosine',
      hnswM = 32,
      hnswEfConstruction = 128,
      hnswFullScanThreshold = 10000,
      hnswOnDisk = false,
      quantizationEnabled = true,
      quantile = 0.99,
      compression = 'compression16'
    } = options;

    const collectionName = collection || process.env.QDRANT_COLLECTION || 'chat_documents';

    // 使用独立实例而非单例，避免缓存冲突
    const router = new QdrantRouter({
      collection: collectionName,
      host: process.env.QDRANT_HOST,
      port: process.env.QDRANT_PORT,
      dimension,
    });

    return this._withSemaphore(async () => {
      const connectResult = await router.vectorStore.connect();
      if (!connectResult.success) return { success: false, error: connectResult.error };

      const createResult = await router.vectorStore.createCollectionWithProductionParams();
      return {
        success: createResult.success,
        collection: collectionName,
        dimension,
        distance,
        hnsw: { m: hnswM, efConstruction: hnswEfConstruction, fullScanThreshold: hnswFullScanThreshold, onDisk: hnswOnDisk },
        quantization: { enabled: quantizationEnabled, quantile, compression },
        message: createResult.exists ? 'Collection already exists' : 'Collection created with production params'
      };
    });
  }

  /**
   * 获取集合参数
   */
  async getCollectionParams(collection) {
    const router = this._getRouter(collection);
    return router.vectorStore.getCollectionParams();
  }

  /**
   * 更新 HNSW 参数
   */
  async updateHNSWParams(collection, params) {
    const router = this._getRouter(collection);
    return router.vectorStore.updateHNSWParams(params);
  }

  /**
   * 更新量化参数
   */
  async updateQuantizationParams(collection, params) {
    const router = this._getRouter(collection);
    return router.vectorStore.updateQuantizationParams(params);
  }

  /**
   * 获取优化建议
   */
  async getOptimizeSuggestions(collection) {
    const router = this._getRouter(collection);
    return router.vectorStore.getOptimizeSuggestions();
  }

  /**
   * 插入单个文档
   */
  async insertDocument(collection, document, options = {}) {
    const { chunkSize = 512, chunkOverlap = 50, metadata = {} } = options;
    const router = this._getRouter(collection);
    return this._withSemaphore(() => router.embedDocument(document, { chunkSize, overlap: chunkOverlap, metadata }));
  }

  /**
   * 批量插入文档
   */
  async batchInsertDocuments(documents, options = {}) {
    const { collection, metadata = {} } = options;
    const router = this._getRouter(collection);

    return this._withSemaphore(async () => {
      // 直接批量向量化 + 批量插入
      const texts = documents.map((doc) => (typeof doc === 'string' ? doc : doc.text));
      const embedResult = await router.embedBatch(texts);

      const vectors = [];
      const successfulTexts = [];
      const results = [];

      for (let i = 0; i < documents.length; i++) {
        const embed = embedResult.embeddings[i];
        const doc = documents[i];
        const meta = typeof doc === 'object' ? doc.metadata || {} : {};

        results.push({
          index: i,
          success: embed?.success || false,
          error: embed?.error,
        });

        if (embed?.success) {
          vectors.push(embed.embedding);
          successfulTexts.push(texts[i]);
        }
      }

      if (vectors.length === 0) {
        return { success: false, totalInserted: 0, documentCount: documents.length, results };
      }

      const insertResult = await router.vectorStore.insertBatch({
        vectors,
        texts: successfulTexts,
        metadata,
      });

      return {
        success: insertResult.success,
        totalInserted: insertResult.insertedCount || 0,
        documentCount: documents.length,
        results,
      };
    });
  }

  /**
   * 搜索
   */
  async search(collection, query, options = {}) {
    const router = this._getRouter(collection);
    return this._withSemaphore(() => router.search(query, options));
  }

  /**
   * 删除文档
   */
  async deleteDocuments(collection, ids) {
    const router = this._getRouter(collection);
    return this._withSemaphore(() => router.deleteDocuments(ids));
  }

  /**
   * 获取统计
   */
  async getStats(collection) {
    const router = this._getRouter(collection);
    return router.getStats();
  }
}

module.exports = new QdrantService();