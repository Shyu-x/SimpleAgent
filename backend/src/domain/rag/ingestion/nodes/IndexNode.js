/**
 * IndexNode - 索引节点
 *
 * 职责：
 * - 将带embedding的chunks写入向量索引
 * - 支持多种索引后端（内存、文件、向量数据库）
 * - 提供索引元数据记录
 * - 支持索引更新和删除
 *
 * 支持的索引类型：
 * 1. memory: 内存索引（测试/小数据量）
 * 2. file: 本地文件持久化
 * 3. vector_db: 向量数据库（Qdrant等）
 */

const { IngestionNode } = require('../IngestionNode');
const AppError = require('../../common/errors/AppError');

class IndexNode extends IngestionNode {
  constructor(options = {}) {
    super('IndexNode', options);
    this.requiredFields = ['chunks'];
    this.options = {
      indexType: options.indexType || 'memory',
      indexName: options.indexName || 'default',
      persistPath: options.persistPath || './data/indices',
      ...options,
    };

    // 内存索引存储
    this.memoryIndex = new Map();
  }

  /**
   * 核心索引逻辑
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async _process(context) {
    const { chunks, parsedMetadata } = context;

    if (!chunks || chunks.length === 0) {
      throw AppError.ragError('INDEX_FAILED', '没有可索引的chunks');
    }

    this.logger.info(`[IndexNode] 开始索引 ${chunks.length} 个chunks`);

    // 过滤出带有embedding的chunks
    const chunksWithEmbedding = chunks.filter((c) => c.embedding);

    if (chunksWithEmbedding.length === 0) {
      throw AppError.ragError('INDEX_FAILED', '没有chunks包含embedding，请先执行EmbeddingNode');
    }

    // 按索引类型处理
    let indexResult;

    switch (this.options.indexType) {
      case 'file':
        indexResult = await this._indexToFile(chunksWithEmbedding);
        break;
      case 'vector_db':
        indexResult = await this._indexToVectorDB(chunksWithEmbedding);
        break;
      case 'memory':
      default:
        indexResult = await this._indexToMemory(chunksWithEmbedding);
    }

    // 记录索引元数据
    const indexMetadata = {
      indexName: this.options.indexName,
      indexType: this.options.indexType,
      indexedAt: new Date().toISOString(),
      chunkCount: chunksWithEmbedding.length,
      documentCount: 1,
      source: parsedMetadata?.source || 'unknown',
      embeddingDimension: indexResult.dimension,
      totalTokensUsed: chunksWithEmbedding.reduce(
        (sum, c) => sum + (c.embeddingTokenUsage || 0),
        0
      ),
      indexSize: indexResult.size,
    };

    this.logger.info(`[IndexNode] 索引完成`, indexMetadata);

    return {
      indexMetadata,
      indexedChunkCount: chunksWithEmbedding.length,
      indexId: this._generateIndexId(),
    };
  }

  /**
   * 内存索引
   * @param {Object[]} chunks
   * @returns {Promise<Object>}
   */
  async _indexToMemory(chunks) {
    const indexKey = this.options.indexName;
    let existingIndex = this.memoryIndex.get(indexKey) || {
      chunks: [],
      metadata: {},
    };

    // 添加新chunks
    for (const chunk of chunks) {
      existingIndex.chunks.push({
        ...chunk,
        indexedAt: new Date().toISOString(),
      });
    }

    // 更新索引
    existingIndex.metadata = {
      lastUpdated: new Date().toISOString(),
      chunkCount: existingIndex.chunks.length,
      dimension: chunks[0]?.embedding?.length || 0,
    };

    this.memoryIndex.set(indexKey, existingIndex);

    return {
      dimension: existingIndex.metadata.dimension,
      size: existingIndex.chunks.length,
    };
  }

  /**
   * 文件持久化索引
   * @param {Object[]} chunks
   * @returns {Promise<Object>}
   */
  async _indexToFile(chunks) {
    const fs = require('fs').promises;
    const path = require('path');

    const indexDir = path.join(this.options.persistPath, this.options.indexName);
    const indexFile = path.join(indexDir, 'index.jsonl');
    const metadataFile = path.join(indexDir, 'metadata.json');

    // 确保目录存在
    await fs.mkdir(indexDir, { recursive: true });

    // 写入chunks（JSONL格式，每行一个chunk）
    const writeStream = await this._createWriteStream(indexFile);
    for (const chunk of chunks) {
      const indexRecord = {
        ...chunk,
        indexedAt: new Date().toISOString(),
      };
      // 移除大字段，保存引用
      await writeStream.write(JSON.stringify({
        id: indexRecord.id,
        content: indexRecord.content.substring(0, 500), // 截断保存
        embeddingLength: indexRecord.embedding?.length || 0,
        metadata: indexRecord.metadata,
      }) + '\n');
    }
    await writeStream.end();

    // 更新元数据
    const existingMetadata = await this._loadMetadata(metadataFile);
    const metadata = {
      ...existingMetadata,
      lastUpdated: new Date().toISOString(),
      chunkCount: (existingMetadata.chunkCount || 0) + chunks.length,
      dimension: chunks[0]?.embedding?.length || 0,
    };
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));

    return {
      dimension: metadata.dimension,
      size: metadata.chunkCount,
    };
  }

  /**
   * 向量数据库索引
   * @param {Object[]} chunks
   * @returns {Promise<Object>}
   */
  async _indexToVectorDB(chunks) {
    // 向量数据库集成（支持Qdrant等）
    const vectorDBUrl = process.env.VECTOR_DB_URL;

    if (!vectorDBUrl) {
      this.logger.warn('[IndexNode] 未配置VECTOR_DB_URL，退化为内存索引');
      return this._indexToMemory(chunks);
    }

    const vectors = chunks.map((c) => ({
      id: c.id,
      vector: c.embedding,
      metadata: {
        content: c.content.substring(0, 1000),
        ...c.metadata,
      },
    }));

    try {
      const response = await fetch(`${vectorDBUrl}/upsert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.VECTOR_DB_API_KEY && {
            Authorization: `Bearer ${process.env.VECTOR_DB_API_KEY}`,
          }),
        },
        body: JSON.stringify({
          collectionName: this.options.indexName,
          vectors,
        }),
      });

      if (!response.ok) {
        throw AppError.ragError('VECTOR_SEARCH_FAILED', `Vector DB错误: ${response.status}`);
      }

      const result = await response.json();

      return {
        dimension: chunks[0]?.embedding?.length || 0,
        size: chunks.length,
        vectorDBResult: result,
      };
    } catch (error) {
      this.logger.error('[IndexNode] Vector DB索引失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 创建写流
   * @param {string} filePath
   * @returns {Promise<Object>}
   */
  async _createWriteStream(filePath) {
    const fs = require('fs');
    return fs.createWriteStream(filePath, { flags: 'a' });
  }

  /**
   * 加载元数据
   * @param {string} filePath
   * @returns {Promise<Object>}
   */
  async _loadMetadata(filePath) {
    const fs = require('fs').promises;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * 生成索引ID
   * @returns {string}
   */
  _generateIndexId() {
    return `idx-${this.options.indexName}-${Date.now()}`;
  }

  /**
   * 获取内存索引（供查询使用）
   * @param {string} indexName
   * @returns {Object}
   */
  getMemoryIndex(indexName) {
    return this.memoryIndex.get(indexName);
  }

  /**
   * 清空内存索引
   * @param {string} indexName
   */
  clearMemoryIndex(indexName) {
    if (indexName) {
      this.memoryIndex.delete(indexName);
    } else {
      this.memoryIndex.clear();
    }
  }

  /**
   * 后置验证
   * @param {Object} result
   * @param {Object} context
   */
  async _postValidate(result, context) {
    if (result.indexedChunkCount === 0) {
      throw AppError.ragError('INDEX_FAILED', '没有成功索引任何chunk');
    }
    if (!result.indexMetadata) {
      throw AppError.ragError('INDEX_FAILED', '索引元数据缺失');
    }
  }
}

module.exports = IndexNode;
