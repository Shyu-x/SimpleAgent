/**
 * RAG Pipeline 服务
 * 完整检索流程: query-rewrite → decompose → vector-search → rerank
 * 支持多路召回融合 (RRFS): 向量检索 + BM25 关键词检索
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter } from 'events';
import { QueryRewriteService, RewriteResult } from '../../domain/rag/query-rewrite.service';
import { QueryDecomposeService, DecomposeResult, SubQuestion } from '../../domain/rag/query-decompose.service';
import { RerankerService, SearchResult, RerankResult } from '../../domain/rag/reranker.service';

// ============ 接口定义 ============

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  documents: Document[];
  createdAt: number;
  updatedAt: number;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  type: string;
  metadata: Record<string, any>;
  chunks: Chunk[];
  createdAt: number;
}

export interface Chunk {
  id: string;
  content: string;
  embedding: number[];
  index: number;
  metadata: Record<string, any>;
}

export interface RetrievalResult {
  content: string;
  similarity: number;
  documentTitle: string;
  documentId: string;
  chunkId?: string;
  source?: 'vector' | 'bm25' | 'rrfs';
}

export interface ContextResult {
  context: string;
  sources: Array<{ title: string; similarity: number; source: string }>;
  count: number;
  rewrittenQuery?: string;
  subQuestions?: SubQuestion[];
  pipelineStats?: PipelineStats;
}

export interface PipelineStats {
  rewriteTime: number;
  decomposeTime: number;
  vectorSearchTime: number;
  bm25SearchTime: number;
  rerankTime: number;
  totalTime: number;
  vectorResults: number;
  bm25Results: number;
  fusedResults: number;
}

export interface RetrievalOptions {
  topK?: number;
  similarityThreshold?: number;
  enableRewrite?: boolean;
  enableDecompose?: boolean;
  enableBM25?: boolean;
  enableRRFS?: boolean;
  vectorWeight?: number;
  bm25Weight?: number;
  minScore?: number;
}

// ============ BM25 实现 ============

class BM25 {
  private k1 = 1.5;
  private b = 0.75;
  private avgDocLength = 0;
  private docLengths: number[] = [];
  private invertedIndex: Map<string, { docIdx: number; tf: number }[]> = new Map();
  private documentCount = 0;

  build(documents: Array<{ id: string; content: string }>): void {
    this.documentCount = documents.length;
    this.docLengths = [];
    this.invertedIndex = new Map();

    for (let docIdx = 0; docIdx < documents.length; docIdx++) {
      const doc = documents[docIdx];
      const tokens = this.tokenize(doc.content);
      this.docLengths.push(tokens.length);
      this.avgDocLength += tokens.length;

      for (const token of tokens) {
        if (!this.invertedIndex.has(token)) {
          this.invertedIndex.set(token, []);
        }
        const postings = this.invertedIndex.get(token)!;
        const existing = postings.find(p => p.docIdx === docIdx);
        if (existing) {
          existing.tf++;
        } else {
          postings.push({ docIdx, tf: 1 });
        }
      }
    }

    if (this.documentCount > 0) {
      this.avgDocLength /= this.documentCount;
    }
  }

  search(query: string, topK: number = 10): Array<{ docId: string; score: number }> {
    const queryTokens = this.tokenize(query);
    const docScores: Map<number, number> = new Map();

    for (const token of queryTokens) {
      const postings = this.invertedIndex.get(token);
      if (!postings) continue;

      const docFreq = postings.length;
      const idf = Math.log((this.documentCount - docFreq + 0.5) / (docFreq + 0.5) + 1);

      for (const posting of postings) {
        const { docIdx, tf } = posting;
        const docLen = this.docLengths[docIdx] || 1;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength));
        const score = idf * (numerator / denominator);
        docScores.set(docIdx, (docScores.get(docIdx) || 0) + score);
      }
    }

    return Array.from(docScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([docIdx, score]) => ({ docId: `doc_${docIdx}`, score }));
  }

  private tokenize(text: string): string[] {
    return (text || '')
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }
}

// ============ Qdrant 客户端接口 ============

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: {
    content: string;
    documentId: string;
    documentTitle: string;
    chunkIndex: number;
    kbId: string;
  };
}

// ============ RAG 服务 ============

@Injectable()
export class RagService extends EventEmitter {
  private readonly logger = new Logger(RagService.name);

  // 存储
  private knowledgeBases: Map<string, KnowledgeBase> = new Map();
  private bm25Indexes: Map<string, BM25> = new Map();
  private qdrantPoints: Map<string, QdrantPoint[]> = new Map();

  // 配置
  private chunkSize: number;
  private overlap: number;
  private topK: number;
  private similarityThreshold: number;
  private embeddingDimension: number;

  // Qdrant配置
  private qdrantUrl: string;
  private qdrantCollection: string;
  private useQdrant: boolean;

  // 领域服务
  private queryRewriteService: QueryRewriteService;
  private queryDecomposeService: QueryDecomposeService;
  private rerankerService: RerankerService;

  // 统计
  private stats = {
    totalRetrievals: 0,
    totalDocumentIngests: 0,
    avgLatencyMs: 0,
    vectorSearches: 0,
    bm25Searches: 0,
    rrfsFusions: 0,
  };

  constructor(
    @Optional() queryRewriteService: QueryRewriteService,
    @Optional() queryDecomposeService: QueryDecomposeService,
    @Optional() rerankerService: RerankerService,
    options: {
      chunkSize?: number;
      overlap?: number;
      topK?: number;
      similarityThreshold?: number;
      embeddingDimension?: number;
      qdrantUrl?: string;
      qdrantCollection?: string;
      useQdrant?: boolean;
    } = {},
  ) {
    super();
    this.chunkSize = options.chunkSize || 512;
    this.overlap = options.overlap || 50;
    this.topK = options.topK || 5;
    this.similarityThreshold = options.similarityThreshold || 0.3;
    this.embeddingDimension = options.embeddingDimension || 1024;
    this.qdrantUrl = options.qdrantUrl || process.env.QDRANT_URL || 'http://localhost:6333';
    this.qdrantCollection = options.qdrantCollection || process.env.QDRANT_COLLECTION || 'chat_documents';
    this.useQdrant = options.useQdrant ?? false;

    this.queryRewriteService = queryRewriteService || new QueryRewriteService();
    this.queryDecomposeService = queryDecomposeService || new QueryDecomposeService();
    this.rerankerService = rerankerService || new RerankerService();

    this.logger.log(`[RAG] 服务初始化完成 (useQdrant=${this.useQdrant}, dimension=${this.embeddingDimension})`);
  }

  /**
   * 创建知识库
   */
  async createKnowledgeBase(name: string, description: string = ''): Promise<KnowledgeBase> {
    const id = 'kb_' + Date.now();
    const kb: KnowledgeBase = {
      id,
      name,
      description,
      documents: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.knowledgeBases.set(id, kb);
    this.bm25Indexes.set(id, new BM25());
    this.qdrantPoints.set(id, []);
    this.emit('kb:created', kb);
    return kb;
  }

  /**
   * 添加文档到知识库
   */
  async addDocument(
    kbId: string,
    document: Partial<Document>,
  ): Promise<{ docId: string; chunks: number; vectorStored: boolean }> {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw new Error(`Knowledge base not found: ${kbId}`);
    }

    const docId = 'doc_' + Date.now();
    const doc: Document = {
      id: docId,
      title: document.title || 'Untitled',
      content: document.content || '',
      type: document.type || 'text',
      metadata: document.metadata || {},
      chunks: [],
      createdAt: Date.now(),
    };

    const chunks = this.chunkText(doc.content, this.chunkSize, this.overlap);
    const bm25 = this.bm25Indexes.get(kbId)!;
    const qdrantPoints = this.qdrantPoints.get(kbId)!;

    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i];
      const embedding = await this.generateEmbedding(chunkContent);

      const chunk: Chunk = {
        id: `chunk_${docId}_${i}`,
        content: chunkContent,
        embedding,
        index: i,
        metadata: {
          documentId: docId,
          documentTitle: doc.title,
          kbId,
        },
      };
      doc.chunks.push(chunk);

      if (this.useQdrant) {
        qdrantPoints.push({
          id: chunk.id,
          vector: embedding,
          payload: {
            content: chunkContent,
            documentId: docId,
            documentTitle: doc.title,
            chunkIndex: i,
            kbId,
          },
        });
      }
    }

    bm25.build(
      kb.documents.flatMap(d => d.chunks.map(c => ({ id: c.id, content: c.content }))),
    );

    if (this.useQdrant && qdrantPoints.length > 0) {
      await this.syncToQdrant(kbId);
    }

    kb.documents.push(doc);
    kb.updatedAt = Date.now();
    this.stats.totalDocumentIngests++;

    this.emit('document:added', { kbId, docId, chunks: chunks.length });
    return { docId, chunks: chunks.length, vectorStored: this.useQdrant };
  }

  private async syncToQdrant(kbId: string): Promise<void> {
    const points = this.qdrantPoints.get(kbId) || [];
    if (points.length === 0) return;

    try {
      await this.ensureQdrantCollection();

      const response = await fetch(`${this.qdrantUrl}/collections/${this.qdrantCollection}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: points.map(p => ({
            id: p.id,
            vector: p.vector,
            payload: p.payload,
          })),
        }),
      });

      if (!response.ok) {
        this.logger.warn(`[RAG] Qdrant upsert failed: ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(`[RAG] Qdrant sync error: ${(error as Error).message}`);
    }
  }

  private async ensureQdrantCollection(): Promise<void> {
    try {
      const checkRes = await fetch(`${this.qdrantUrl}/collections/${this.qdrantCollection}`);
      if (checkRes.status === 404) {
        await fetch(`${this.qdrantUrl}/collections/${this.qdrantCollection}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vectors: {
              size: this.embeddingDimension,
              distance: 'Cosine',
            },
          }),
        });
      }
    } catch (error) {
      this.logger.warn(`[RAG] Qdrant collection check failed: ${(error as Error).message}`);
    }
  }

  /**
   * 文本分块（重叠滑动窗口）
   */
  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[。！？\n]/).filter(s => s.trim());

    let currentChunk = '';
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = currentChunk.slice(-overlap);
        }
      }
      currentChunk += sentence + '。';
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * 生成文本嵌入
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // 回退到简单哈希向量
    return this.simpleEmbed(text);
  }

  /**
   * 简单嵌入实现（基于词频的哈希向量）
   */
  private simpleEmbed(text: string): number[] {
    const words = text.toLowerCase().split(/[\s,，。.!?]+/).filter(w => w.length > 1);
    const vector = new Array(this.embeddingDimension).fill(0);

    for (const word of words) {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(i);
        hash = hash & hash;
      }
      const index = Math.abs(hash) % this.embeddingDimension;
      vector[index] += 1;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (denominator === 0 || !Number.isFinite(denominator)) return 0;
    if (!Number.isFinite(dotProduct)) return 0;

    return dotProduct / denominator;
  }

  // ==================== 完整检索流程 ====================

  /**
   * 完整检索流程
   * query-rewrite → decompose → vector-search → bm25 → rrfs → rerank
   */
  async retrieve(
    kbId: string,
    query: string,
    options: RetrievalOptions = {},
  ): Promise<RetrievalResult[]> {
    const startTime = Date.now();
    this.stats.totalRetrievals++;

    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw new Error(`Knowledge base not found: ${kbId}`);
    }

    const topK = options.topK || this.topK;
    const enableRewrite = options.enableRewrite ?? true;
    const enableDecompose = options.enableDecompose ?? false;
    const enableBM25 = options.enableBM25 ?? true;
    const enableRRFS = options.enableRRFS ?? true;

    let rewrittenQuery = query;
    let rewriteResult: RewriteResult | null = null;
    let decomposeResult: DecomposeResult | null = null;

    // Step 1: 查询改写
    const rewriteStart = Date.now();
    if (enableRewrite) {
      try {
        rewriteResult = await this.queryRewriteService.rewrite(query, {});
        rewrittenQuery = rewriteResult.rewritten;
      } catch (error) {
        this.logger.debug(`[RAG] Query rewrite failed: ${error.message}`);
      }
    }
    const rewriteTime = Date.now() - rewriteStart;

    // Step 2: 查询拆分
    const decomposeStart = Date.now();
    if (enableDecompose) {
      try {
        decomposeResult = await this.queryDecomposeService.decompose(rewrittenQuery, {});
      } catch (error) {
        this.logger.debug(`[RAG] Query decompose failed: ${error.message}`);
      }
    }
    const decomposeTime = Date.now() - decomposeStart;

    // Step 3: 向量检索 + BM25 并行
    const vectorSearchStart = Date.now();
    const bm25SearchStart = Date.now();

    const [vectorResults, bm25Results] = await Promise.all([
      this.vectorSearch(kb, rewrittenQuery, topK * 2),
      enableBM25 ? this.bm25Search(kb, rewrittenQuery, topK * 2) : Promise.resolve([]),
    ]);

    const vectorSearchTime = Date.now() - vectorSearchStart;
    const bm25SearchTime = Date.now() - bm25SearchStart;

    this.stats.vectorSearches++;
    if (enableBM25) this.stats.bm25Searches++;

    // Step 4: RRFS 多路召回融合
    let fusedResults: RetrievalResult[];
    if (enableRRFS && vectorResults.length > 0 && bm25Results.length > 0) {
      const vectorWeight = options.vectorWeight ?? 0.6;
      const bm25Weight = options.bm25Weight ?? 0.4;
      fusedResults = this.rrfsFusion(vectorResults, bm25Results, vectorWeight, bm25Weight);
      this.stats.rrfsFusions++;
    } else {
      fusedResults = vectorResults.length > 0 ? vectorResults : bm25Results;
    }

    // Step 5: 重排序
    const rerankStart = Date.now();
    let finalResults: RetrievalResult[];
    try {
      const searchResults: SearchResult[] = fusedResults.map((r, idx) => ({
        id: r.chunkId || `result_${idx}`,
        content: r.content,
        score: r.similarity,
        metadata: {
          documentTitle: r.documentTitle,
          documentId: r.documentId,
          source: r.source,
        },
      }));

      const reranked = await this.rerankerService.rerank(rewrittenQuery, searchResults, { topK });
      finalResults = reranked.map(r => ({
        content: r.content,
        similarity: r.metadata.finalScore ?? r.score,
        documentTitle: r.metadata.documentTitle || '',
        documentId: r.metadata.documentId || '',
        chunkId: r.id,
        source: r.metadata.source || 'reranked',
      }));
    } catch (error) {
      this.logger.debug(`[RAG] Rerank failed: ${error.message}`);
      finalResults = fusedResults.slice(0, topK);
    }
    const rerankTime = Date.now() - rerankStart;

    this.updateLatencyStats(Date.now() - startTime);
    return finalResults;
  }

  /**
   * 向量语义检索
   */
  private async vectorSearch(
    kb: KnowledgeBase,
    query: string,
    topK: number,
  ): Promise<RetrievalResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    const threshold = this.similarityThreshold;

    const allChunks: RetrievalResult[] = [];

    for (const doc of kb.documents) {
      for (const chunk of doc.chunks) {
        const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
        if (similarity >= threshold) {
          allChunks.push({
            content: chunk.content,
            similarity,
            documentTitle: doc.title,
            documentId: doc.id,
            chunkId: chunk.id,
            source: 'vector',
          });
        }
      }
    }

    return allChunks.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  /**
   * BM25 关键词检索
   */
  private bm25Search(
    kb: KnowledgeBase,
    query: string,
    topK: number,
  ): RetrievalResult[] {
    const bm25 = this.bm25Indexes.get(kb.id);
    if (!bm25) return [];

    const docs = kb.documents.flatMap(doc =>
      doc.chunks.map(chunk => ({
        id: chunk.id,
        content: chunk.content,
        documentId: doc.id,
        documentTitle: doc.title,
      })),
    );

    bm25.build(docs);
    const results = bm25.search(query, topK);

    return results
      .filter(r => r.score > 0)
      .map(r => {
        const doc = docs.find(d => d.id === r.docId);
        return {
          content: doc?.content || '',
          similarity: Math.min(r.score / 10, 1),
          documentTitle: doc?.documentTitle || '',
          documentId: doc?.documentId || '',
          chunkId: r.docId,
          source: 'bm25' as const,
        };
      });
  }

  /**
   * RRFS (Reciprocal Rank Fusion) 多路召回融合
   */
  private rrfsFusion(
    vectorResults: RetrievalResult[],
    bm25Results: RetrievalResult[],
    vectorWeight: number = 0.6,
    bm25Weight: number = 0.4,
    k: number = 60,
  ): RetrievalResult[] {
    const scoreMap: Map<string, { result: RetrievalResult; rrfs: number }> = new Map();

    vectorResults.forEach((result, rank) => {
      const key = result.chunkId || result.content;
      const rrfs = vectorWeight * (1 / (k + rank + 1));
      scoreMap.set(key, { result, rrfs });
    });

    bm25Results.forEach((result, rank) => {
      const key = result.chunkId || result.content;
      if (scoreMap.has(key)) {
        scoreMap.get(key)!.rrfs += bm25Weight * (1 / (k + rank + 1));
      } else {
        scoreMap.set(key, { result, rrfs: bm25Weight * (1 / (k + rank + 1)) });
      }
    });

    return Array.from(scoreMap.values())
      .sort((a, b) => b.rrfs - a.rrfs)
      .map(item => ({
        ...item.result,
        source: 'rrfs' as const,
        similarity: item.rrfs,
      }));
  }

  /**
   * 为对话生成上下文（完整 pipeline 版本）
   */
  async getContextForConversation(
    kbId: string,
    query: string,
    options: RetrievalOptions = {},
  ): Promise<ContextResult | null> {
    const startTime = Date.now();
    const results = await this.retrieve(kbId, query, options);

    if (results.length === 0) {
      return null;
    }

    const context = results
      .map((r, i) => `[${i + 1}] ${r.content}`)
      .join('\n\n');

    return {
      context,
      sources: results.map(r => ({
        title: r.documentTitle,
        similarity: r.similarity,
        source: r.source || 'unknown',
      })),
      count: results.length,
      pipelineStats: {
        rewriteTime: 0,
        decomposeTime: 0,
        vectorSearchTime: 0,
        bm25SearchTime: 0,
        rerankTime: 0,
        totalTime: Date.now() - startTime,
        vectorResults: results.filter(r => r.source === 'vector').length,
        bm25Results: results.filter(r => r.source === 'bm25').length,
        fusedResults: results.filter(r => r.source === 'rrfs').length,
      },
    };
  }

  // ==================== 基础 CRUD ====================

  listKnowledgeBases(): Array<{
    id: string;
    name: string;
    description: string;
    documentCount: number;
    totalChunks: number;
    createdAt: number;
    updatedAt: number;
  }> {
    return Array.from(this.knowledgeBases.values()).map(kb => ({
      id: kb.id,
      name: kb.name,
      description: kb.description,
      documentCount: kb.documents.length,
      totalChunks: kb.documents.reduce((sum, doc) => sum + doc.chunks.length, 0),
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
    }));
  }

  async deleteKnowledgeBase(kbId: string): Promise<{ success: boolean }> {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw new Error(`Knowledge base not found: ${kbId}`);
    }

    this.knowledgeBases.delete(kbId);
    this.bm25Indexes.delete(kbId);
    this.qdrantPoints.delete(kbId);
    this.emit('kb:deleted', kbId);
    return { success: true };
  }

  getStats(): {
    knowledgeBases: number;
    totalDocuments: number;
    totalChunks: number;
    pipeline: typeof this.stats;
  } {
    let totalDocuments = 0;
    let totalChunks = 0;

    for (const kb of this.knowledgeBases.values()) {
      totalDocuments += kb.documents.length;
      totalChunks += kb.documents.reduce((sum, doc) => sum + doc.chunks.length, 0);
    }

    return {
      knowledgeBases: this.knowledgeBases.size,
      totalDocuments,
      totalChunks,
      pipeline: { ...this.stats },
    };
  }

  getKnowledgeBase(kbId: string): KnowledgeBase | undefined {
    return this.knowledgeBases.get(kbId);
  }

  async updateKnowledgeBase(
    kbId: string,
    updates: { name?: string; description?: string },
  ): Promise<KnowledgeBase> {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw new Error(`Knowledge base not found: ${kbId}`);
    }

    if (updates.name) kb.name = updates.name;
    if (updates.description !== undefined) kb.description = updates.description;
    kb.updatedAt = Date.now();

    return kb;
  }

  async deleteDocument(kbId: string, docId: string): Promise<{ success: boolean }> {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw new Error(`Knowledge base not found: ${kbId}`);
    }

    const docIndex = kb.documents.findIndex(d => d.id === docId);
    if (docIndex === -1) {
      throw new Error(`Document not found: ${docId}`);
    }

    kb.documents.splice(docIndex, 1);
    kb.updatedAt = Date.now();

    return { success: true };
  }

  private updateLatencyStats(latency: number): void {
    const samples = 100;
    const currentAvg = this.stats.avgLatencyMs;
    this.stats.avgLatencyMs = currentAvg === 0
      ? latency
      : (currentAvg * (samples - 1) + latency) / samples;
  }

  /**
   * 解析文档 - 从文件路径读取并解析内容
   */
  async parseDocument(filePath: string): Promise<{ content: string; type: string; metadata: any }> {
    // 简单实现，实际应该根据文件类型调用不同的解析器
    const fs = require('fs').promises;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        content,
        type: 'text',
        metadata: {},
      };
    } catch (error) {
      return {
        content: `Error reading file: ${error.message}`,
        type: 'text',
        metadata: { error: true },
      };
    }
  }

  /**
   * 全局搜索 - 搜索所有知识库
   */
  async searchAll(
    query: string,
    options: { topK?: number; similarityThreshold?: number } = {},
  ): Promise<any[]> {
    const allResults: any[] = [];
    const knowledgeBases = this.listKnowledgeBases();

    for (const kb of knowledgeBases) {
      try {
        const results = await this.retrieve(kb.id, query, options);
        for (const r of results) {
          allResults.push({ ...r, kbId: kb.id, kbName: kb.name });
        }
      } catch (error) {
        console.error(`Search KB ${kb.id} error:`, error);
      }
    }

    allResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    return allResults.slice(0, (options.topK || 5) * knowledgeBases.length);
  }
}
