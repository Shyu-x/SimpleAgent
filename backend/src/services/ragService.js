/**
 * RAG 知识注入服务
 * 支持文档上传、向量化存储、语义检索
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

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

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
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

    // 确保存储目录存在
    this.ensureStoragePath();
  }

  ensureStoragePath() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
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
    this.saveKnowledgeBase(kb);

    this.emit('kb:created', kb);
    return kb;
  }

  /**
   * 添加文档到知识库
   */
  async addDocument(kbId, document) {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw new Error(`Knowledge base not found: ${kbId}`);
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

    this.saveKnowledgeBase(kb);

    this.emit('document:added', { kbId, docId, chunks: chunks.length });
    return { docId, chunks: chunks.length };
  }

  /**
   * 生成文本嵌入
   */
  async generateEmbedding(text) {
    // 优先使用 OpenAI 嵌入API
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

    // 回退到简单嵌入
    return simpleEmbed(text);
  }

  /**
   * 检索相关知识
   */
  async retrieve(kbId, query, options = {}) {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw new Error(`Knowledge base not found: ${kbId}`);
    }

    const topK = options.topK || this.topK;
    const threshold = options.similarityThreshold || this.similarityThreshold;

    // 生成查询嵌入
    const queryEmbedding = await this.generateEmbedding(query);

    // 收集所有块并计算相似度
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

    // 按相似度排序
    allChunks.sort((a, b) => b.similarity - a.similarity);

    // 返回topK结果
    const results = allChunks.slice(0, topK).map(chunk => ({
      content: chunk.content,
      similarity: chunk.similarity,
      documentTitle: chunk.documentTitle,
      documentId: chunk.documentId
    }));

    return results;
  }

  /**
   * 为对话生成上下文
   */
  async getContextForConversation(kbId, query, options = {}) {
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
  saveKnowledgeBase(kb) {
    const filePath = path.join(this.storagePath, `${kb.id}.json`);

    // 保存精简版（不保存嵌入以节省空间）
    const saveData = {
      ...kb,
      documents: kb.documents.map(doc => ({
        ...doc,
        chunks: doc.chunks.map(chunk => ({
          id: chunk.id,
          content: chunk.content,
          index: chunk.index,
          metadata: chunk.metadata
          // 嵌入向量不持久化，重新生成
        }))
      }))
    };

    fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
  }

  /**
   * 从文件加载知识库
   */
  loadKnowledgeBase(kbId) {
    const filePath = path.join(this.storagePath, `${kbId}.json`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // 重新生成嵌入
    for (const doc of data.documents) {
      for (const chunk of doc.chunks) {
        chunk.embedding = simpleEmbed(chunk.content);
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
      throw new Error(`Knowledge base not found: ${kbId}`);
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
}

module.exports = RAGService;