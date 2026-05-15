/**
 * QdrantVectorStore - Qdrant 向量数据库客户端
 *
 * 功能：
 * - 连接 Qdrant 向量数据库
 * - 向量插入、删除、搜索
 * - 集合管理
 *
 * @module services/vector/QdrantVectorStore
 */

const { createLogger } = require('../../infra/logger/AgentLogger');
const logger = createLogger('QdrantVectorStore');
const AppError = require('../../common/errors/AppError');

class QdrantVectorStore {
  constructor(options = {}) {
    this.host = options.host || process.env.QDRANT_HOST || 'localhost';
    this.port = options.port || process.env.QDRANT_PORT || '6333';
    this.url = `http://${this.host}:${this.port}`;
    this.collectionName = options.collection || process.env.QDRANT_COLLECTION || 'chat_documents';
    this.dimension = options.dimension || parseInt(process.env.QDRANT_DIMENSION) || 1024;
    this.distance = options.distance || 'Cosine';
    this.apiKey = options.apiKey || process.env.QDRANT_API_KEY || null;

    // HNSW 索引配置 (生产级参数)
    this.hnswConfig = {
      m: options.hnswM || parseInt(process.env.QDRANT_HNSW_M) || 32,           // 节点连接数 (16-64, 生产建议32)
      efConstruction: options.hnswEfConstruction || parseInt(process.env.QDRANT_HNSW_EF_CONSTRUCTION) || 128,  // 构建时搜索深度 (64-512, 生产建议128)
      fullScanThreshold: options.hnswFullScanThreshold || parseInt(process.env.QDRANT_HNSW_FULL_SCAN) || 10000, // 全表扫描阈值
      onDisk: options.hnswOnDisk || process.env.QDRANT_HNSW_ON_DISK === 'true' || false,  // 是否在磁盘存储索引
    };

    // PQ 量化配置 (生产级参数)
    this.quantizationConfig = {
      enabled: options.quantizationEnabled || process.env.QDRANT_QUANTIZATION_ENABLED !== 'false',
      quantile: options.quantile || parseFloat(process.env.QDRANT_QUANTILE) || 0.99,      // 保留信息量 (0.99 = 99%)
      compression: options.compression || process.env.QDRANT_COMPRESSION || 'compression16', // 压缩比 (compression16/32/64)
      ram: options.quantizationRam || process.env.QDRANT_QUANTIZATION_RAM !== 'false',   // 是否使用RAM存储
    };

    // 连接池配置 (生产级参数)
    this.poolConfig = {
      maxConnections: options.maxConnections || parseInt(process.env.QDRANT_POOL_MAX) || 50,    // 最大连接数
      timeout: options.poolTimeout || parseInt(process.env.QDRANT_POOL_TIMEOUT) || 30000,     // 连接超时(ms)
      retryAttempts: options.retryAttempts || parseInt(process.env.QDRANT_RETRY_ATTEMPTS) || 3, // 重试次数
      retryDelay: options.retryDelay || parseInt(process.env.QDRANT_RETRY_DELAY) || 1000,     // 重试延迟(ms)
    };

    this.connected = false;
    this.connectionPool = [];
  }

  /**
   * 生成 UUID v4
   */
  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 获取请求头
   */
  _getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }
    return headers;
  }

  /**
   * 创建带生产级参数的集合 (HNSW + PQ量化)
   */
  async createCollectionWithProductionParams() {
    try {
      // 检查集合是否存在
      const response = await fetch(`${this.url}/collections/${this.collectionName}`, {
        method: 'GET',
        headers: this._getHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.result) {
          logger.info(`集合已存在: ${this.collectionName}`);
          return { success: true, exists: true };
        }
      }

      // 构建生产级集合配置
      const collectionConfig = {
        vectors: {
          size: this.dimension,
          distance: this.distance,
        },
      };

      // 添加 HNSW 索引配置
      if (this.hnswConfig) {
        collectionConfig.hnsw_config = {
          m: this.hnswConfig.m,
          ef_construction: this.hnswConfig.efConstruction,
          full_scan_threshold: this.hnswConfig.fullScanThreshold,
          on_disk: this.hnswConfig.onDisk,
        };
      }

      // 添加 PQ 量化配置
      if (this.quantizationConfig && this.quantizationConfig.enabled) {
        collectionConfig.quantization = {
          scalar: {
            type: this.quantizationConfig.compression === 'compression32' ? 'quantile32' :
                 this.quantizationConfig.compression === 'compression64' ? 'quantile64' : 'quantile',
            quantile: this.quantizationConfig.quantile,
          },
        };
      }

      logger.info(`创建生产级集合: ${this.collectionName}`, {
        hnsw: { m: this.hnswConfig.m, efConstruction: this.hnswConfig.efConstruction },
        quantization: { quantile: this.quantizationConfig.quantile, compression: this.quantizationConfig.compression }
      });

      // 创建集合
      const createResponse = await fetch(`${this.url}/collections/${this.collectionName}`, {
        method: 'PUT',
        headers: this._getHeaders(),
        body: JSON.stringify(collectionConfig),
      });

      if (!createResponse.ok) {
        const error = await createResponse.text();
        throw AppError.ragError('VECTOR_SEARCH_FAILED', error);
      }

      logger.info(`生产级集合创建成功: ${this.collectionName}`);
      return { success: true, created: true, config: collectionConfig };
    } catch (error) {
      logger.error(`创建生产级集合失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 更新集合的 HNSW 参数 (运行时调整)
   */
  async updateHNSWParams(params = {}) {
    try {
      const { m, ef_construction, full_scan_threshold, on_disk } = params;

      const updateConfig = {
        hnsw_config: {
          ...(m !== undefined && { m }),
          ...(ef_construction !== undefined && { ef_construction }),
          ...(full_scan_threshold !== undefined && { full_scan_threshold }),
          ...(on_disk !== undefined && { on_disk }),
        },
      };

      const response = await fetch(`${this.url}/collections/${this.collectionName}`, {
        method: 'PUT',
        headers: this._getHeaders(),
        body: JSON.stringify(updateConfig),
      });

      if (!response.ok) {
        const error = await response.text();
        throw AppError.ragError('VECTOR_SEARCH_FAILED', error);
      }

      // 更新本地配置
      if (m !== undefined) this.hnswConfig.m = m;
      if (ef_construction !== undefined) this.hnswConfig.efConstruction = ef_construction;
      if (full_scan_threshold !== undefined) this.hnswConfig.fullScanThreshold = full_scan_threshold;
      if (on_disk !== undefined) this.hnswConfig.onDisk = on_disk;

      logger.info(`HNSW 参数更新成功: m=${this.hnswConfig.m}, ef=${this.hnswConfig.efConstruction}`);
      return { success: true, hnswConfig: this.hnswConfig };
    } catch (error) {
      logger.error(`更新 HNSW 参数失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 更新集合的量化参数 (运行时调整)
   */
  async updateQuantizationParams(params = {}) {
    try {
      const { quantile, compression, enabled } = params;

      if (enabled === false) {
        // 禁用量化
        const response = await fetch(`${this.url}/collections/${this.collectionName}/collections`, {
          method: 'PATCH',
          headers: this._getHeaders(),
          body: JSON.stringify({ quantization: null }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw AppError.ragError('VECTOR_SEARCH_FAILED', error);
        }

        this.quantizationConfig.enabled = false;
        return { success: true, quantization: { enabled: false } };
      }

      const updateConfig = {
        quantization: {
          scalar: {
            type: compression === 'compression32' ? 'quantile32' :
                 compression === 'compression64' ? 'quantile64' : 'quantile',
            quantile: quantile || this.quantizationConfig.quantile,
            compression: compression || this.quantizationConfig.compression,
          },
        },
      };

      const response = await fetch(`${this.url}/collections/${this.collectionName}`, {
        method: 'PUT',
        headers: this._getHeaders(),
        body: JSON.stringify(updateConfig),
      });

      if (!response.ok) {
        const error = await response.text();
        throw AppError.ragError('VECTOR_SEARCH_FAILED', error);
      }

      // 更新本地配置
      if (quantile !== undefined) this.quantizationConfig.quantile = quantile;
      if (compression !== undefined) this.quantizationConfig.compression = compression;

      logger.info(`量化参数更新成功: quantile=${this.quantizationConfig.quantile}`);
      return { success: true, quantization: this.quantizationConfig };
    } catch (error) {
      logger.error(`更新量化参数失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取当前集合的 HNSW 和量化配置
   */
  async getCollectionParams() {
    try {
      const info = await this.getCollectionInfo();
      if (!info.success) {
        return { success: false, error: 'Collection not found' };
      }

      return {
        success: true,
        hnswConfig: this.hnswConfig,
        quantizationConfig: this.quantizationConfig,
        collectionInfo: info.info,
      };
    } catch (error) {
      logger.error(`获取集合参数失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取优化建议
   */
  async getOptimizeSuggestions() {
    try {
      const info = await this.getCollectionInfo();
      if (!info.success) {
        return { success: false, error: 'Collection not found' };
      }

      const suggestions = [];
      const pointCount = info.info.points_count || 0;

      // 根据数据量给出建议
      if (pointCount < 1000) {
        suggestions.push({
          type: 'hnsw',
          message: '数据量较小，可以降低 HNSW 参数以节省资源',
          current: `m=${this.hnswConfig.m}, ef=${this.hnswConfig.efConstruction}`,
          suggested: 'm=16, ef=64',
        });
      } else if (pointCount > 100000) {
        suggestions.push({
          type: 'hnsw',
          message: '数据量较大，建议增加 ef_construction 以提高召回率',
          current: `ef=${this.hnswConfig.efConstruction}`,
          suggested: 'ef=256',
        });
      }

      // 量化建议
      if (!this.quantizationConfig.enabled) {
        suggestions.push({
          type: 'quantization',
          message: '建议启用 PQ 量化以减少内存占用',
          current: 'disabled',
          suggested: 'enabled with quantile=0.99',
        });
      } else if (pointCount > 50000 && this.quantizationConfig.quantile < 0.95) {
        suggestions.push({
          type: 'quantization',
          message: '高精度场景建议使用 0.99 quantile',
          current: `quantile=${this.quantizationConfig.quantile}`,
          suggested: 'quantile=0.99',
        });
      }

      return {
        success: true,
        pointCount,
        suggestions,
      };
    } catch (error) {
      logger.error(`获取优化建议失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 连接 Qdrant
   */
  async connect() {
    try {
      const response = await fetch(`${this.url}/collections`, {
        method: 'GET',
        headers: this._getHeaders(),
      });

      if (response.ok) {
        this.connected = true;
        logger.info(`连接成功: ${this.url}`);
        return { success: true };
      } else {
        throw AppError.ragError('VECTOR_SEARCH_FAILED', `HTTP ${response.status}`);
      }
    } catch (error) {
      logger.error(`连接失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 创建集合
   */
  async createCollection() {
    try {
      // 检查集合是否存在
      const response = await fetch(`${this.url}/collections/${this.collectionName}`, {
        method: 'GET',
        headers: this._getHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.result) {
          logger.info(`集合已存在: ${this.collectionName}`);
          return { success: true, exists: true };
        }
      }

      // 创建集合
      const createResponse = await fetch(`${this.url}/collections/${this.collectionName}`, {
        method: 'PUT',
        headers: this._getHeaders(),
        body: JSON.stringify({
          vectors: {
            size: this.dimension,
            distance: this.distance,
          },
        }),
      });

      if (!createResponse.ok) {
        const error = await createResponse.text();
        throw AppError.ragError('VECTOR_SEARCH_FAILED', error);
      }

      logger.info(`集合创建成功: ${this.collectionName}`);
      return { success: true, created: true };
    } catch (error) {
      logger.error(`创建集合失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 创建索引（Qdrant 自动管理索引）
   */
  async createIndex(field = 'vector', indexType = null, metricType = null) {
    // Qdrant 不需要手动创建索引，自动处理
    logger.debug(`索引管理: Qdrant 自动处理`);
    return { success: true };
  }

  /**
   * 加载集合到内存（Qdrant 总是加载）
   */
  async loadCollection() {
    // Qdrant 总是将数据加载到内存中
    return { success: true };
  }

  /**
   * 插入单个向量
   */
  async insert({ id, vector, text, metadata = {} }) {
    try {
      // Qdrant 要求 ID 为无符号整数或 UUID
      const pointId = id ? (Number.isInteger(id) ? id : this._generateUUID()) : this._generateUUID();

      const response = await fetch(`${this.url}/collections/${this.collectionName}/points`, {
        method: 'PUT',
        headers: this._getHeaders(),
        body: JSON.stringify({
          points: [
            {
              id: pointId,
              vector: vector,
              payload: {
                text: text,
                metadata: metadata,
              },
            },
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw AppError.ragError('VECTOR_SEARCH_FAILED', error);
      }

      return {
        success: true,
        insertedCount: 1,
        id: id,
      };
    } catch (error) {
      logger.error(`插入失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 批量插入向量
   */
  async insertBatch({ vectors, texts, metadata = {} }) {
    try {
      // 使用 UUID 作为 Qdrant 点 ID
      const ids = vectors.map(() => this._generateUUID());

      const points = vectors.map((vector, i) => ({
        id: ids[i],
        vector: vector,
        payload: {
          text: texts[i] || '',
          metadata: metadata,
        },
      }));

      const response = await fetch(`${this.url}/collections/${this.collectionName}/points`, {
        method: 'PUT',
        headers: this._getHeaders(),
        body: JSON.stringify({ points }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw AppError.ragError('VECTOR_SEARCH_FAILED', error);
      }

      return {
        success: true,
        insertedCount: vectors.length,
        ids,
      };
    } catch (error) {
      logger.error(`批量插入失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 相似度搜索
   */
  async search({ queryVector, topK = 10, filter = null }) {
    try {
      const searchBody = {
        vector: queryVector,
        limit: topK,
        with_payload: true,
      };

      // 添加过滤条件
      if (filter) {
        searchBody.filter = filter;
      }

      const response = await fetch(
        `${this.url}/collections/${this.collectionName}/points/search`,
        {
          method: 'POST',
          headers: this._getHeaders(),
          body: JSON.stringify(searchBody),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw AppError.ragError('VECTOR_SEARCH_FAILED', error);
      }

      const data = await response.json();

      if (!data.result || data.result.length === 0) {
        return { success: true, results: [] };
      }

      const results = data.result.map((item) => ({
        id: item.id,
        score: item.score,
        text: item.payload?.text || '',
        metadata: item.payload?.metadata || {},
      }));

      return { success: true, results };
    } catch (error) {
      logger.error(`搜索失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除向量
   */
  async delete({ ids }) {
    try {
      const response = await fetch(`${this.url}/collections/${this.collectionName}/points/delete`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify({
          points: ids,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw AppError.ragError('VECTOR_SEARCH_FAILED', error);
      }

      return { success: true, deletedCount: ids.length };
    } catch (error) {
      logger.error(`删除失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 清空集合
   */
  async dropCollection() {
    try {
      const response = await fetch(`${this.url}/collections/${this.collectionName}`, {
        method: 'DELETE',
        headers: this._getHeaders(),
      });

      if (!response.ok && response.status !== 404) {
        const error = await response.text();
        throw AppError.ragError('VECTOR_SEARCH_FAILED', error);
      }

      logger.info(`集合已删除: ${this.collectionName}`);
      return { success: true };
    } catch (error) {
      logger.error(`删除集合失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取集合信息
   */
  async getCollectionInfo() {
    try {
      const response = await fetch(`${this.url}/collections/${this.collectionName}`, {
        method: 'GET',
        headers: this._getHeaders(),
      });

      if (!response.ok) {
        throw AppError.ragError('VECTOR_SEARCH_FAILED', `HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        info: data.result || {},
      };
    } catch (error) {
      logger.error(`获取集合信息失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取集合统计
   */
  async getStats() {
    try {
      const info = await this.getCollectionInfo();
      if (!info.success) {
        return info;
      }

      return {
        success: true,
        rowCount: info.info.points_count || 0,
        collectionName: this.collectionName,
        dimension: this.dimension,
        distance: this.distance,
      };
    } catch (error) {
      logger.error(`获取统计失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      // Qdrant 没有 /health 端点，使用 /collections 判断
      const response = await fetch(`${this.url}/collections`, {
        method: 'GET',
        headers: this._getHeaders(),
      });

      if (!response.ok) {
        throw AppError.ragError('VECTOR_SEARCH_FAILED', `HTTP ${response.status}`);
      }

      const data = await response.json();
      const collections = data.result?.collections || [];

      this.connected = true;
      return {
        success: true,
        status: 'healthy',
        collections: collections.map(c => c.name),
        count: collections.length,
      };
    } catch (error) {
      this.connected = false;
      return {
        success: false,
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  /**
   * 列出所有集合
   */
  async listCollections() {
    try {
      const response = await fetch(`${this.url}/collections`, {
        method: 'GET',
        headers: this._getHeaders(),
      });

      if (!response.ok) {
        throw AppError.ragError('VECTOR_SEARCH_FAILED', `HTTP ${response.status}`);
      }

      const data = await response.json();
      const collections = data.result?.collections || [];

      return {
        success: true,
        collections: collections.map((c) => c.name),
      };
    } catch (error) {
      logger.error(`列出集合失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    this.connected = false;
    this.connectionPool = [];
    logger.info('已断开连接');
  }

  /**
   * 执行带重试的请求
   * @param {Function} requestFn - 请求函数
   * @param {Object} options - 重试选项
   */
  async executeWithRetry(requestFn, options = {}) {
    const maxAttempts = options.maxAttempts || this.poolConfig.retryAttempts;
    const retryDelay = options.retryDelay || this.poolConfig.retryDelay;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        logger.warn(`请求失败 (${attempt}/${maxAttempts}): ${error.message}`);

        if (attempt < maxAttempts) {
          // 指数退避
          const delay = retryDelay * Math.pow(2, attempt - 1);
          await this._sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * 批量删除向量
   */
  async deleteBatch(ids) {
    const BATCH_SIZE = 100;
    let totalDeleted = 0;

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const result = await this.executeWithRetry(() => this.delete({ ids: batch }));
      if (result.success) {
        totalDeleted += result.deletedCount || 0;
      }
    }

    return { success: true, deletedCount: totalDeleted };
  }

  /**
   * 获取连接池状态
   */
  getPoolStatus() {
    return {
      maxConnections: this.poolConfig.maxConnections,
      currentConnections: this.connectionPool.length,
      enabled: this.poolConfig.maxConnections > 0,
    };
  }

  /**
   * 辅助方法：睡眠
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = QdrantVectorStore;
