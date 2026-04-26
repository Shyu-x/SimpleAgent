/**
 * EmbeddingNode - 向量化节点
 *
 * 职责：
 * - 将文本chunk转换为向量嵌入
 * - 支持批量处理优化性能
 * - 支持多种embedding模型
 * - 处理embedding服务不可用的情况
 *
 * 设计考量：
 * - 批量处理减少API调用次数
 * - 并行请求提升吞吐量
 * - 失败重试保证可靠性
 */

const { IngestionNode } = require('../IngestionNode');

class EmbeddingNode extends IngestionNode {
  constructor(options = {}) {
    super('EmbeddingNode', options);
    this.requiredFields = ['chunks'];
    this.options = {
      batchSize: options.batchSize || 32, // 每批处理数量
      maxRetries: options.maxRetries || 3,
      model: options.model || 'embedding-multilingual',
      apiUrl: options.apiUrl, // 可配置embedding服务
      ...options,
    };
  }

  /**
   * 核心向量化逻辑
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async _process(context) {
    const { chunks } = context;

    if (!chunks || chunks.length === 0) {
      throw new Error('没有可向量化的chunks');
    }

    this.logger.info(`[EmbeddingNode] 开始向量化 ${chunks.length} 个chunks`);

    // 分批处理
    const batches = this._createBatches(chunks, this.options.batchSize);
    const allEmbeddings = [];
    const allFailures = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.logger.info(`[EmbeddingNode] 处理批次 ${i + 1}/${batches.length}`, {
        batchSize: batch.length,
      });

      const { successEmbeddings, failures } = await this._processBatch(batch);

      allEmbeddings.push(...successEmbeddings);
      allFailures.push(...failures);

      // 批次间延迟，避免限流
      if (i < batches.length - 1) {
        await this._sleep(100);
      }
    }

    this.logger.info(`[EmbeddingNode] 向量化完成`, {
      successCount: allEmbeddings.length,
      failureCount: allFailures.length,
    });

    // 合并embedding到chunks
    const enrichedChunks = this._mergeEmbeddings(context.chunks, allEmbeddings);

    return {
      chunks: enrichedChunks,
      embeddingCount: allEmbeddings.length,
      embeddingDimension: allEmbeddings[0]?.vector?.length || 0,
      failedChunks: allFailures,
    };
  }

  /**
   * 处理单个批次
   * @param {Object[]} batch
   * @returns {Promise<Object>}
   */
  async _processBatch(batch) {
    const successEmbeddings = [];
    const failures = [];

    // 并行请求（受限于API限制）
    const results = await Promise.allSettled(
      batch.map((chunk) => this._embedChunk(chunk))
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successEmbeddings.push(result.value);
      } else {
        failures.push({
          chunk: batch[index],
          error: result.reason.message,
        });
      }
    });

    return { successEmbeddings, failures };
  }

  /**
   * 单个chunk向量化（子类可覆盖）
   * @param {Object} chunk
   * @returns {Promise<Object>}
   */
  async _embedChunk(chunk) {
    const text = chunk.content;

    // 构建embedding请求
    const embeddingData = await this._callEmbeddingAPI(text);

    return {
      chunkId: chunk.id,
      vector: embeddingData.vector,
      model: embeddingData.model,
      tokenUsage: embeddingData.tokenUsage,
    };
  }

  /**
   * 调用embedding API
   * @param {string} text
   * @returns {Promise<Object>}
   */
  async _callEmbeddingAPI(text) {
    const apiUrl = this.options.apiUrl || process.env.EMBEDDING_API_URL;

    if (!apiUrl) {
      // 无API时生成伪向量（用于测试）
      return this._generateMockEmbedding(text);
    }

    let lastError;

    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.EMBEDDING_API_KEY && {
              Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}`,
            }),
          },
          body: JSON.stringify({
            input: text,
            model: this.options.model,
          }),
        });

        if (!response.ok) {
          throw new Error(`Embedding API错误: ${response.status}`);
        }

        const data = await response.json();

        return {
          vector: data.data?.[0]?.embedding || data.embedding,
          model: data.model || this.options.model,
          tokenUsage: data.usage?.total_tokens || 0,
        };
      } catch (error) {
        lastError = error;
        this.logger.warn(`[EmbeddingNode] API调用失败 (${attempt + 1})`, {
          error: error.message,
        });

        if (attempt < this.options.maxRetries - 1) {
          await this._sleep(1000 * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error('Embedding API调用失败');
  }

  /**
   * 生成伪向量（当无API时）
   * @param {string} text
   * @returns {Object}
   */
  _generateMockEmbedding(text) {
    // 生成固定维度的伪向量（用于测试）
    const dimension = 1536;
    const seed = this._hashString(text);

    const vector = Array.from({ length: dimension }, (_, i) => {
      // 简单的伪随机生成
      const x = Math.sin(seed + i * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    });

    return {
      vector,
      model: 'mock-embedding',
      tokenUsage: Math.ceil(text.length / 4),
    };
  }

  /**
   * 字符串哈希
   * @param {string} str
   * @returns {number}
   */
  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * 创建批次
   * @param {any[]} array
   * @param {number} batchSize
   * @returns {any[][]}
   */
  _createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 合并embedding到chunks
   * @param {Object[]} chunks
   * @param {Object[]} embeddings
   * @returns {Object[]}
   */
  _mergeEmbeddings(chunks, embeddings) {
    const embeddingMap = new Map(
      embeddings.map((e) => [e.chunkId, e])
    );

    return chunks.map((chunk) => {
      const embedding = embeddingMap.get(chunk.id);
      if (embedding) {
        return {
          ...chunk,
          embedding: embedding.vector,
          embeddingModel: embedding.model,
          embeddingTokenUsage: embedding.tokenUsage,
        };
      }
      return chunk;
    });
  }

  /**
   * 延迟
   * @param {number} ms
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 后置验证
   * @param {Object} result
   * @param {Object} context
   */
  async _postValidate(result, context) {
    if (result.embeddingCount === 0) {
      throw new Error('没有成功生成任何embedding');
    }
    if (result.embeddingDimension === 0) {
      throw new Error('Embedding维度无效');
    }
    // 警告：部分失败
    if (result.failedChunks && result.failedChunks.length > 0) {
      this.logger.warn(`[EmbeddingNode] ${result.failedChunks.length} 个chunks向量化失败`);
    }
  }
}

module.exports = EmbeddingNode;
