/**
 * RAG 知识注入服务
 * 支持文档上传、向量化存储、语义检索
 *
 * 优化 (2026-05-15):
 * - 查询超时控制
 * - 分页查询支持
 * - 缓存索引优化
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { QueryRewriteService } = require('../domain/rag/QueryRewriteService');
const { QueryDecomposeService } = require('../domain/rag/QueryDecomposeService');
const RerankerService = require('./rag/RerankerService');
const AppError = require('../common/errors/AppError');
const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('RAGService');

// 查询超时配置
const RAG_QUERY_TIMEOUT_MS = 10000;

// 缓存索引管理器
const cacheIndexManager = {
  _indexes: new Map(),
  _timestamps: new Map(),
  TTL: 30000,

  setIndex(key, data) {
    this._indexes.set(key, data);
    this._timestamps.set(key, Date.now());
  },

  getIndex(key) {
    const entry = this._indexes.get(key);
    if (!entry) return null;

    const age = Date.now() - (this._timestamps.get(key) || 0);
    if (age > this.TTL) {
      this._indexes.delete(key);
      this._timestamps.delete(key);
      return null;
    }

    return entry;
  },

  invalidate(key) {
    this._indexes.delete(key);
    this._timestamps.delete(key);
  }
};

// 指标采集器（延迟初始化）
let _metricsCollector = null;
function getCollector() {
  if (!_metricsCollector) {
    try {
      const { getMetricsCollector } = require('../infra/metrics');
      _metricsCollector = getMetricsCollector();
    } catch (e) {
      // 指标采集器未初始化
    }
  }
  return _metricsCollector;
}

// 简单的文本分块
function chunkText(text, chunkSize = 500, overlap = 50) {
  const chunks = [];
  const sentences = text.split(/[。！？\n]/).filter(s => s.trim());

  let currentChunk = '';
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        // 保留最后overlap个字符作为下一块的开始
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

// 简单的文本嵌入（基于TF-IDF的简化实现）
// 实际生产中应使用专门的嵌入API如 OpenAI text-embedding-ada-002
function simpleEmbed(text) {
  // 简单实现：基于关键词的哈希向量
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

  // 归一化
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= magnitude;
    }
  }

  return vector;
}

// 计算余弦相似度
function cosineSimilarity(vec1, vec2) {
  if (vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  // 修复: 防止除零和浮点精度问题导致 NaN
  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0 || !Number.isFinite(denominator)) return 0;
  if (!Number.isFinite(dotProduct)) return 0;

  return dotProduct / denominator;
}

class RAGService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.storagePath = options.storagePath || './data/rag';
    this.chunkSize = options.chunkSize || 500;
    this.overlap = options.overlap || 50;
    this.topK = options.topK || 5;
    this.similarityThreshold = options.similarityThreshold || 0.3;

    // 知识库存储
    this.knowledgeBases = new Map();

    // 查询改写服务
    this.queryRewriteService = new QueryRewriteService({
      enabled: options.enableQueryRewrite !== false,
      llmClient: options.llmClient
    });

    // 查询拆分服务
    this.queryDecomposeService = new QueryDecomposeService({
      enabled: options.enableQueryRewrite !== false,
      llmClient: options.llmClient
    });

    // 重排序服务
    this.rerankerService = new RerankerService({
      enabled: options.enableRerank !== false,
      llmClient: options.llmClient,
      topK: options.topK || 10
    });

    // 确保存储目录存在
    this.ensureStoragePath();
  }

  ensureStoragePath() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * 启动时加载所有知识库到内存
   */
  async loadAllKnowledgeBases() {
    try {
      const files = fs.readdirSync(this.storagePath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const filePath = path.join(this.storagePath, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (data && data.id) {
            // 重新生成嵌入
            for (const doc of data.documents || []) {
              for (const chunk of doc.chunks || []) {
                chunk.embedding = await this.generateEmbedding(chunk.content);
              }
            }
            this.knowledgeBases.set(data.id, data);
          }
        } catch (e) {
          // 忽略解析失败的文件
        }
      }
    } catch (error) {
      // 目录不存在时忽略
    }
  }

  /**
   * 创建知识库
   */
  async createKnowledgeBase(name, description = '') {
    const id = 'kb_' + Date.now();
    const kb = {
      id,
      name,
      description,
      documents: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.knowledgeBases.set(id, kb);
    await this.saveKnowledgeBase(kb);

    this.emit('kb:created', kb);
    return kb;
  }

  /**
   * 添加文档到知识库
   */
  async addDocument(kbId, document) {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw AppError.ragError('NOT_FOUND', `Knowledge base not found: ${kbId}`);
    }

    const docId = 'doc_' + Date.now();
    const doc = {
      id: docId,
      title: document.title || 'Untitled',
      content: document.content,
      type: document.type || 'text',
      metadata: document.metadata || {},
      chunks: [],
      createdAt: Date.now()
    };

    // 分块
    const chunks = chunkText(doc.content, this.chunkSize, this.overlap);

    // 为每个块生成嵌入
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await this.generateEmbedding(chunk);

      doc.chunks.push({
        id: `chunk_${docId}_${i}`,
        content: chunk,
        embedding,
        index: i,
        metadata: {
          documentId: docId,
          documentTitle: doc.title
        }
      });
    }

    kb.documents.push(doc);
    kb.updatedAt = Date.now();

    await this.saveKnowledgeBase(kb);

    this.emit('document:added', { kbId, docId, chunks: chunks.length });
    return { docId, chunks: chunks.length };
  }

  /**
   * 生成文本嵌入
   */
  async generateEmbedding(text) {
    // 尝试 OpenAI 嵌入API
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'text-embedding-ada-002',
            input: text
          })
        });

        if (response.ok) {
          const data = await response.json();
          return data.data[0].embedding;
        }
      } catch (error) {
        console.warn('OpenAI embedding failed, using simple embedding');
      }
    }

    // 最终回退到简单嵌入
    return simpleEmbed(text);
  }

  /**
   * 检索相关知识
   * 优化：查询超时控制
   */
  async retrieve(kbId, query, options = {}) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`RAG retrieve timeout after ${RAG_QUERY_TIMEOUT_MS}ms`));
      }, RAG_QUERY_TIMEOUT_MS);

      try {
        const result = await this._doRetrieve(kbId, query, options);
        clearTimeout(timer);
        resolve(result);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * 实际检索逻辑
   */
  async _doRetrieve(kbId, query, options = {}) {
    const collector = getCollector();
    const startTime = Date.now();

    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw AppError.ragError('NOT_FOUND', `Knowledge base not found: ${kbId}`);
    }

    const topK = options.topK || this.topK;
    const threshold = options.similarityThreshold || this.similarityThreshold;

    // 查询改写：真实调用LLM补全上下文
    let rewrittenQuery = query;
    let rewriteMeta = null;

    if (this.queryRewriteService) {
      try {
        const rewriteResult = await this.queryRewriteService.rewrite(query, {
          messages: options.messages || [],
          topic: kb.name
        });
        rewrittenQuery = rewriteResult.rewritten;
        rewriteMeta = {
          originalQuery: query,
          rewrittenQuery: rewriteResult.rewritten,
          rewriteType: rewriteResult.type,
          confidence: rewriteResult.confidence,
          changes: rewriteResult.changes || []
        };
      } catch (err) {
        console.warn('[RAGService] Query rewrite failed, using original query:', err.message);
      }
    }

    // 语义扩展
    let expandedQuery = rewrittenQuery;
    if (this.queryRewriteService && options.enableExpansion) {
      try {
        const expandResult = await this.queryRewriteService.expand(rewrittenQuery);
        expandedQuery = expandResult.query;
      } catch (err) {
        console.warn('[RAGService] Query expansion failed:', err.message);
      }
    }

    // 拆分子问题（用于多路检索）
    let subQueries = [expandedQuery];
    if (this.queryDecomposeService) {
      try {
        const decomposeResult = await this.queryDecomposeService.decompose(expandedQuery);
        if (decomposeResult && decomposeResult.subQuestions?.length > 0) {
          subQueries = decomposeResult.subQuestions;
        }
      } catch (err) {
        console.warn('[RAGService] Query decomposition failed:', err.message);
      }
    }

    // 多路检索：并行执行子查询检索
    const searchPromises = subQueries.map(async (sq) => {
      const queryEmbedding = await this.generateEmbedding(sq);
      return this._searchChunks(kb, queryEmbedding, threshold);
    });

    const searchResults = await Promise.all(searchPromises);

    // 合并去重
    const allChunks = [];
    const seen = new Set();
    for (const results of searchResults) {
      for (const chunk of results) {
        if (!seen.has(chunk.id)) {
          seen.add(chunk.id);
          allChunks.push(chunk);
        }
      }
    }

    // 按相似度排序
    allChunks.sort((a, b) => b.similarity - a.similarity);

    // 返回topK结果
    let results = allChunks.slice(0, topK).map(chunk => ({
      content: chunk.content,
      similarity: chunk.similarity,
      documentTitle: chunk.documentTitle,
      documentId: chunk.documentId
    }));

    // 使用重排序服务进一步优化
    results = await this.rerankerService.rerank(query, results, { topK });

    // 记录 RAG 检索指标
    if (collector) {
      const latency = Date.now() - startTime;
      collector.recordHistogram('rag_retrieve_duration_seconds', latency / 1000, { kb_id: kbId });
      collector.incrementCounter('rag_retrieve_total', { kb_id: kbId, result_count: results.length });
      if (rewriteMeta) {
        collector.recordHistogram('rag_query_rewrite_duration_seconds', latency / 1000, { rewrite_type: rewriteMeta.rewriteType });
      }
    }

    return {
      results,
      meta: rewriteMeta
    };
  }

  /**
   * 内部方法：搜索块
   * @private
   */
  async _searchChunks(kb, queryEmbedding, threshold) {
    const allChunks = [];
    for (const doc of kb.documents) {
      for (const chunk of doc.chunks) {
        const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
        if (similarity >= threshold) {
          allChunks.push({
            ...chunk,
            similarity,
            documentTitle: doc.title,
            documentId: doc.id
          });
        }
      }
    }
    return allChunks;
  }

  /**
   * 为对话生成上下文
   */
  async getContextForConversation(kbId, query, options = {}) {
    const retrieveResult = await this.retrieve(kbId, query, options);
    const results = retrieveResult.results || retrieveResult;

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
        similarity: r.similarity
      })),
      count: results.length
    };
  }

  /**
   * 解析文档内容
   */
  async parseDocument(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');

    switch (ext) {
      case '.md':
      case '.txt':
        return { content, type: 'text' };

      case '.json':
        const json = JSON.parse(content);
        return {
          content: this.extractTextFromJSON(json),
          type: 'json',
          metadata: json
        };

      default:
        return { content, type: 'text' };
    }
  }

  extractTextFromJSON(obj, depth = 0) {
    if (depth > 5) return JSON.stringify(obj);

    if (typeof obj === 'string') return obj;
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);

    if (Array.isArray(obj)) {
      return obj.map(item => this.extractTextFromJSON(item, depth + 1)).join(' ');
    }

    if (typeof obj === 'object' && obj !== null) {
      const textFields = ['title', 'name', 'description', 'content', 'text', 'body'];
      let text = '';

      for (const key of textFields) {
        if (obj[key]) {
          text += this.extractTextFromJSON(obj[key], depth + 1) + ' ';
        }
      }

      if (!text) {
        text = Object.values(obj)
          .map(v => this.extractTextFromJSON(v, depth + 1))
          .join(' ');
      }

      return text;
    }

    return '';
  }

  /**
   * 保存知识库到文件
   */
  async saveKnowledgeBase(kb) {
    const filePath = path.join(this.storagePath, `${kb.id}.json`);

    // 保存知识库（嵌入向量不持久化，加载时重新生成以保证一致性）
    const saveData = {
      id: kb.id,
      name: kb.name,
      description: kb.description,
      documents: kb.documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        type: doc.type,
        metadata: doc.metadata,
        createdAt: doc.createdAt,
        chunks: doc.chunks.map(chunk => ({
          id: chunk.id,
          content: chunk.content,
          index: chunk.index,
          metadata: chunk.metadata
          // 嵌入向量不持久化，加载时使用 generateEmbedding 重新生成
        }))
      })),
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt
    };

    fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
  }

  /**
   * 从文件加载知识库
   */
  async loadKnowledgeBase(kbId) {
    const filePath = path.join(this.storagePath, `${kbId}.json`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // 使用 generateEmbedding 重新生成嵌入（支持 OpenAI/简单嵌入）
    for (const doc of data.documents) {
      for (const chunk of doc.chunks) {
        chunk.embedding = await this.generateEmbedding(chunk.content);
      }
    }

    return data;
  }

  /**
   * 列出所有知识库
   */
  listKnowledgeBases() {
    const kbs = [];

    for (const [id, kb] of this.knowledgeBases) {
      kbs.push({
        id: kb.id,
        name: kb.name,
        description: kb.description,
        documentCount: kb.documents.length,
        totalChunks: kb.documents.reduce((sum, doc) => sum + doc.chunks.length, 0),
        createdAt: kb.createdAt,
        updatedAt: kb.updatedAt
      });
    }

    return kbs;
  }

  /**
   * 删除知识库
   */
  async deleteKnowledgeBase(kbId) {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw AppError.ragError('NOT_FOUND', `Knowledge base not found: ${kbId}`);
    }

    this.knowledgeBases.delete(kbId);

    // 删除文件
    const filePath = path.join(this.storagePath, `${kbId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    this.emit('kb:deleted', kbId);
    return { success: true };
  }

  /**
   * 获取知识库统计
   */
  getStats() {
    let totalDocuments = 0;
    let totalChunks = 0;

    for (const [, kb] of this.knowledgeBases) {
      totalDocuments += kb.documents.length;
      for (const doc of kb.documents) {
        totalChunks += doc.chunks.length;
      }
    }

    return {
      knowledgeBases: this.knowledgeBases.size,
      totalDocuments,
      totalChunks,
      storagePath: this.storagePath
    };
  }

  /**
   * 网页抓取（直接内容）
   */
  async fetchUrl(url) {
    const IngestionPipeline = require('../domain/rag/ingestion/IngestionPipeline');
    const UrlFetchNode = require('../domain/rag/ingestion/nodes/UrlFetchNode');
    const EnhanceNode = require('../domain/rag/ingestion/nodes/EnhanceNode');
    const pipeline = new IngestionPipeline({ logger: console });
    pipeline.use(new UrlFetchNode({ timeout: 30000, maxContentLength: 10 * 1024 * 1024 }));
    pipeline.use(new EnhanceNode({ autoDetectType: true, extractEntities: true }));
    const context = await pipeline.run({ url });
    if (context.errors && context.errors.length > 0) {
      throw AppError.ragError('RETRIEVAL_FAILED', context.errors[0].message || '抓取失败');
    }
    return {
      content: context.enhancedContent,
      metadata: { ...context.fetchMetadata, ...context.enhancedMetadata },
      images: context.images || [],
      links: context.links || [],
      traceId: context.traceId,
      duration: context.duration
    };
  }

  /**
   * 网页抓取（添加到知识库）
   */
  async fetchUrlToKB(kbId, url, title) {
    if (!this.knowledgeBases.get(kbId)) {
      throw AppError.ragError('NOT_FOUND', '知识库不存在');
    }
    const { content, metadata } = await this.fetchUrl(url);
    const docTitle = title || metadata?.title || new URL(url).hostname;
    return this.addDocument(kbId, {
      title: docTitle,
      content,
      type: 'article',
      metadata: { url, ...metadata }
    });
  }
}

module.exports = RAGService;