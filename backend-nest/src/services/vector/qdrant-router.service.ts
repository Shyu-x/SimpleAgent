/**
 * QdrantRouter - Qdrant 向量存储路由
 *
 * 功能：
 * - 连接 Qdrant 云端向量数据库
 * - 文本向量化（使用 MiniMax Embedding API）
 * - 向量 upsert 写入
 * - 向量 search 检索
 * - 向量 delete 删除
 *
 * @module services/vector/qdrant-router.service
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

export interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload: {
    text?: string;
    metadata?: Record<string, any>;
  };
}

export interface SearchResult {
  id: string | number;
  score: number;
  text: string;
  metadata: Record<string, any>;
}

export interface UpsertResult {
  success: boolean;
  insertedCount?: number;
  ids?: (string | number)[];
  error?: string;
}

export interface SearchQueryResult {
  success: boolean;
  results?: SearchResult[];
  query?: string;
  topK?: number;
  error?: string;
}

export interface DeleteResult {
  success: boolean;
  deletedCount?: number;
  error?: string;
}

export interface EmbedResult {
  success: boolean;
  embedding?: number[];
  model?: string;
  dimension?: number;
  error?: string;
}

export interface BatchEmbedResult {
  success: boolean;
  embeddings?: Array<{
    index: number;
    text: string;
    embedding: number[] | null;
    success: boolean;
    error?: string;
  }>;
  stats?: {
    total: number;
    successful: number;
    failed: number;
  };
  error?: string;
}

@Injectable()
export class QdrantRouterService implements OnModuleInit {
  private readonly logger = new Logger(QdrantRouterService.name);

  private host: string;
  private port: string;
  private url: string;
  private collectionName: string;
  private dimension: number;
  private distance: string;
  private apiKey: string | null;

  // MiniMax Embedding API 配置
  private embeddingApiUrl: string;
  private embeddingModel: string;
  private embeddingApiKey: string;

  private connected = false;
  private initialized = false;

  constructor() {
    // Qdrant 配置
    this.host = process.env.QDRANT_HOST || 'localhost';
    this.port = process.env.QDRANT_PORT || '6333';
    this.url = `http://${this.host}:${this.port}`;
    this.collectionName = process.env.QDRANT_COLLECTION || 'chat_documents';
    this.dimension = parseInt(process.env.QDRANT_DIMENSION || '1024', 10);
    this.distance = 'Cosine';
    this.apiKey = process.env.QDRANT_API_KEY || null;

    // MiniMax Embedding API 配置
    this.embeddingApiUrl = process.env.MINIMAX_EMBEDDING_URL || 'https://api.minimaxi.com/anthropic/v1/embeddings';
    this.embeddingModel = process.env.MINIMAX_EMBEDDING_MODEL || 'embedding-multilingual';
    this.embeddingApiKey = process.env.MINIMAX_API_KEY || '';
  }

  async onModuleInit() {
    await this.initialize();
  }

  /**
   * 初始化连接
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    if (this.initialized) {
      return { success: true };
    }

    try {
      // 连接 Qdrant
      const connectResult = await this.connect();
      if (!connectResult.success) {
        return connectResult;
      }

      // 创建集合（如不存在）
      await this.createCollection();

      this.initialized = true;
      this.logger.log('QdrantRouter 初始化成功');
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`QdrantRouter 初始化失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * 连接 Qdrant
   */
  async connect(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.url}/collections`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        this.connected = true;
        this.logger.log(`Qdrant 连接成功: ${this.url}`);
        return { success: true };
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Qdrant 连接失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    this.initialized = false;
    this.logger.log('Qdrant 已断开连接');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    success: boolean;
    status?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.url}/health`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      return {
        success: response.ok,
        status: response.ok ? 'healthy' : 'unhealthy',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        status: 'unhealthy',
        error: message,
      };
    }
  }

  /**
   * 创建集合
   */
  async createCollection(): Promise<{ success: boolean; error?: string }> {
    try {
      // 检查集合是否存在
      const response = await fetch(`${this.url}/collections/${this.collectionName}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.result) {
          this.logger.log(`Qdrant 集合已存在: ${this.collectionName}`);
          return { success: true };
        }
      }

      // 创建集合
      const createResponse = await fetch(`${this.url}/collections/${this.collectionName}`, {
        method: 'PUT',
        headers: this.getHeaders(),
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

      this.logger.log(`Qdrant 集合创建成功: ${this.collectionName}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Qdrant 创建集合失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * 获取集合信息
   */
  async getCollectionInfo(): Promise<{
    success: boolean;
    info?: any;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.url}/collections/${this.collectionName}`, {
        method: 'GET',
        headers: this.getHeaders(),
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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Qdrant 获取集合信息失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * 获取集合统计
   */
  async getStats(): Promise<{
    success: boolean;
    rowCount?: number;
    collectionName?: string;
    dimension?: number;
    distance?: string;
    error?: string;
  }> {
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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Qdrant 获取统计失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * 列出所有集合
   */
  async listCollections(): Promise<{
    success: boolean;
    collections?: string[];
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.url}/collections`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const collections = data.result?.collections || [];

      return {
        success: true,
        collections: collections.map((c: { name: string }) => c.name),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Qdrant 列出集合失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * 删除集合
   */
  async dropCollection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.url}/collections/${this.collectionName}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      if (!response.ok && response.status !== 404) {
        const error = await response.text();
        throw new Error(error);
      }

      this.logger.log(`Qdrant 集合已删除: ${this.collectionName}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Qdrant 删除集合失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * 获取请求头
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }
    return headers;
  }

  /**
   * 生成 UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * 向量 upsert 写入（插入或更新）
   * @param vectors 向量数组
   * @param texts 对应的文本数组
   * @param metadata 元数据
   */
  async upsert(
    vectors: number[][],
    texts: string[],
    metadata: Record<string, any> = {},
  ): Promise<UpsertResult> {
    try {
      if (vectors.length !== texts.length) {
        return {
          success: false,
          error: 'Vectors and texts length mismatch',
        };
      }

      // 使用 UUID 作为 Qdrant 点 ID
      const ids = vectors.map(() => this.generateUUID());

      const points: QdrantPoint[] = vectors.map((vector, i) => ({
        id: ids[i],
        vector,
        payload: {
          text: texts[i] || '',
          metadata,
        },
      }));

      const response = await fetch(`${this.url}/collections/${this.collectionName}/points`, {
        method: 'PUT',
        headers: this.getHeaders(),
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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Qdrant upsert 失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * 向量 search 检索
   * @param query 查询向量
   * @param topK 返回数量
   * @param filter 过滤条件
   */
  async search(
    query: number[],
    topK: number = 10,
    filter: Record<string, any> | null = null,
  ): Promise<SearchQueryResult> {
    try {
      const searchBody: Record<string, any> = {
        vector: query,
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
          headers: this.getHeaders(),
          body: JSON.stringify(searchBody),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const data = await response.json();

      if (!data.result || data.result.length === 0) {
        return { success: true, results: [] };
      }

      const results: SearchResult[] = data.result.map((item: any) => ({
        id: item.id,
        score: item.score,
        text: item.payload?.text || '',
        metadata: item.payload?.metadata || {},
      }));

      return { success: true, results };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Qdrant search 失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * 向量 delete 删除
   * @param ids 要删除的向量 ID 数组
   */
  async delete(ids: (string | number)[]): Promise<DeleteResult> {
    try {
      const response = await fetch(
        `${this.url}/collections/${this.collectionName}/points/delete`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            points: ids,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      return { success: true, deletedCount: ids.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Qdrant delete 失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * 文本向量化（使用 MiniMax API）
   * @param text 文本
   */
  async embed(text: string): Promise<EmbedResult> {
    try {
      if (!text || text.trim().length === 0) {
        return { success: false, error: 'Text is empty' };
      }

      const response = await fetch(this.embeddingApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.embeddingApiKey}`,
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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`QdrantRouter Embedding failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * 批量向量化
   * @param texts 文本数组
   */
  async embedBatch(texts: string[]): Promise<BatchEmbedResult> {
    if (!texts || texts.length === 0) {
      return { success: true, embeddings: [] };
    }

    const results: Array<{
      index: number;
      text: string;
      embedding: number[] | null;
      success: boolean;
      error?: string;
    }> = [];

    const batchSize = 32;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      try {
        const response = await fetch(this.embeddingApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.embeddingApiKey}`,
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
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`QdrantRouter Batch embedding failed: ${message}`);
        for (let j = 0; j < batch.length; j++) {
          results.push({
            index: i + j,
            text: batch[j],
            embedding: null,
            success: false,
            error: message,
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
   * 搜索相似文档（文本查询）
   * @param query 查询文本
   * @param topK 返回数量
   * @param filter 过滤条件
   */
  async searchByText(
    query: string,
    topK: number = 10,
    filter: Record<string, any> | null = null,
  ): Promise<SearchQueryResult> {
    try {
      // 查询文本向量化
      const embedResult = await this.embed(query);
      if (!embedResult.success) {
        return { success: false, error: embedResult.error };
      }

      // Qdrant 搜索
      const searchResult = await this.search(embedResult.embedding!, topK, filter);

      return {
        success: searchResult.success,
        results: searchResult.results,
        query,
        topK,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`QdrantRouter Search failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * 文档向量化入库
   * @param document 文档内容
   * @param options 分块选项
   */
  async embedDocument(
    document: string,
    options: {
      chunkSize?: number;
      overlap?: number;
      metadata?: Record<string, any>;
    } = {},
  ): Promise<{
    success: boolean;
    chunks?: Array<{
      content: string;
      index: number;
      embedding: number[] | null;
      embedded: boolean;
    }>;
    insertedCount?: number;
    stats?: {
      total: number;
      successful: number;
      failed: number;
    };
    error?: string;
  }> {
    const { chunkSize = 512, overlap = 50, metadata = {} } = options;

    // 文本分块
    const chunks = this.splitText(document, chunkSize, overlap);

    // 批量向量化
    const embedResult = await this.embedBatch(chunks);

    // 插入 Qdrant
    const embeddings = embedResult.embeddings || [];
    const vectors = embeddings
      .filter((e) => e.success)
      .map((e) => e.embedding!);

    const texts = embeddings
      .filter((e) => e.success)
      .map((e) => e.text);

    if (vectors.length === 0) {
      return {
        success: false,
        error: 'Failed to generate any embeddings',
        chunks: [],
      };
    }

    const insertResult = await this.upsert(vectors, texts, {
      ...metadata,
      source: 'document',
    });

    return {
      success: insertResult.success,
      chunks: embeddings.map((e, i) => ({
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
   * 文本分块
   */
  private splitText(text: string, chunkSize: number, overlap: number): string[] {
    if (text.length <= chunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + chunkSize;

      if (end < text.length) {
        // 尝试在句子边界分割
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
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取服务状态
   */
  getStatus(): {
    healthy: boolean;
    connected: boolean;
    initialized: boolean;
    embeddingModel: string;
    collection: string;
  } {
    return {
      healthy: this.connected,
      connected: this.connected,
      initialized: this.initialized,
      embeddingModel: this.embeddingModel,
      collection: this.collectionName,
    };
  }
}
