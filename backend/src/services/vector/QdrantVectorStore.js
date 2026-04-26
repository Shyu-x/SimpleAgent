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

class QdrantVectorStore {
  constructor(options = {}) {
    this.host = options.host || process.env.QDRANT_HOST || 'localhost';
    this.port = options.port || process.env.QDRANT_PORT || '6333';
    this.url = `http://${this.host}:${this.port}`;
    this.collectionName = options.collection || process.env.QDRANT_COLLECTION || 'chat_documents';
    this.dimension = options.dimension || parseInt(process.env.QDRANT_DIMENSION) || 1024;
    this.distance = options.distance || 'Cosine';
    this.apiKey = options.apiKey || process.env.QDRANT_API_KEY || null;

    this.connected = false;
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
        console.log(`[QdrantVectorStore] 连接成功: ${this.url}`);
        return { success: true };
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error(`[QdrantVectorStore] 连接失败: ${error.message}`);
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
          console.log(`[QdrantVectorStore] 集合已存在: ${this.collectionName}`);
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
        throw new Error(error);
      }

      console.log(`[QdrantVectorStore] 集合创建成功: ${this.collectionName}`);
      return { success: true, created: true };
    } catch (error) {
      console.error(`[QdrantVectorStore] 创建集合失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 创建索引（Qdrant 自动管理索引）
   */
  async createIndex(field = 'vector', indexType = null, metricType = null) {
    // Qdrant 不需要手动创建索引，自动处理
    console.log(`[QdrantVectorStore] 索引管理: Qdrant 自动处理`);
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
        throw new Error(error);
      }

      return {
        success: true,
        insertedCount: 1,
        id: id,
      };
    } catch (error) {
      console.error(`[QdrantVectorStore] 插入失败: ${error.message}`);
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
        throw new Error(error);
      }

      return {
        success: true,
        insertedCount: vectors.length,
        ids,
      };
    } catch (error) {
      console.error(`[QdrantVectorStore] 批量插入失败: ${error.message}`);
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
        throw new Error(error);
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
      console.error(`[QdrantVectorStore] 搜索失败: ${error.message}`);
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
        throw new Error(error);
      }

      return { success: true, deletedCount: ids.length };
    } catch (error) {
      console.error(`[QdrantVectorStore] 删除失败: ${error.message}`);
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
        throw new Error(error);
      }

      console.log(`[QdrantVectorStore] 集合已删除: ${this.collectionName}`);
      return { success: true };
    } catch (error) {
      console.error(`[QdrantVectorStore] 删除集合失败: ${error.message}`);
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
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        info: data.result || {},
      };
    } catch (error) {
      console.error(`[QdrantVectorStore] 获取集合信息失败: ${error.message}`);
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
      console.error(`[QdrantVectorStore] 获取统计失败: ${error.message}`);
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
        throw new Error(`HTTP ${response.status}`);
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
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const collections = data.result?.collections || [];

      return {
        success: true,
        collections: collections.map((c) => c.name),
      };
    } catch (error) {
      console.error(`[QdrantVectorStore] 列出集合失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    this.connected = false;
    console.log('[QdrantVectorStore] 已断开连接');
  }
}

module.exports = QdrantVectorStore;
