import { Injectable, NotFoundException } from '@nestjs/common';
import { ListDocsDto, SearchDocsDto, UploadDocDto, DeleteDocDto, ReindexDto } from './dto';

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  totalChunks: number;
  createdAt: number;
  updatedAt: number;
  documents: any[];
}

interface Document {
  id: string;
  title: string;
  type: string;
  chunks: any[];
  metadata: Record<string, any>;
  createdAt: number;
}

interface SearchResult {
  chunkId: string;
  content: string;
  similarity: number;
  documentId: string;
  kbId: string;
  kbName: string;
}

@Injectable()
export class KnowledgeService {
  private knowledgeBases: Map<string, KnowledgeBase> = new Map();
  private storagePath: string;
  private chunkSize: number;
  private overlap: number;
  private topK: number;

  constructor() {
    this.storagePath = process.env.RAG_STORAGE_PATH || './data/rag';
    this.chunkSize = 500;
    this.overlap = 50;
    this.topK = 5;
    this.initDefaultKnowledgeBase();
  }

  private initDefaultKnowledgeBase(): void {
    const defaultKb: KnowledgeBase = {
      id: 'default',
      name: 'default',
      description: '默认知识库',
      documentCount: 0,
      totalChunks: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      documents: [],
    };
    this.knowledgeBases.set('default', defaultKb);
  }

  listKnowledgeBases(): KnowledgeBase[] {
    return Array.from(this.knowledgeBases.values()).map(kb => ({
      id: kb.id,
      name: kb.name,
      description: kb.description,
      documentCount: kb.documents.length,
      totalChunks: kb.documents.reduce((sum, doc) => sum + doc.chunks.length, 0),
      createdAt: kb.createdAt,
      updatedAt: kb.updatedAt,
      documents: kb.documents,
    }));
  }

  async listDocs(query: ListDocsDto): Promise<any> {
    const { kbId, page = 1, pageSize = 20 } = query;
    let docs: any[] = [];

    if (kbId) {
      const kb = this.knowledgeBases.get(kbId);
      if (!kb) {
        throw new NotFoundException('知识库不存在');
      }
      docs = kb.documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        type: doc.type,
        kbId: kb.id,
        kbName: kb.name,
        chunks: doc.chunks.length,
        metadata: doc.metadata,
        createdAt: doc.createdAt,
      }));
    } else {
      for (const [id, kb] of this.knowledgeBases) {
        for (const doc of kb.documents) {
          docs.push({
            id: doc.id,
            title: doc.title,
            type: doc.type,
            kbId: id,
            kbName: kb.name,
            chunks: doc.chunks.length,
            metadata: doc.metadata,
            createdAt: doc.createdAt,
          });
        }
      }
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paged = docs.slice(start, end);

    return {
      documents: paged.map(doc => ({ ...doc, name: doc.title })),
      total: docs.length,
      page,
      pageSize,
      totalPages: Math.ceil(docs.length / pageSize),
    };
  }

  async search(query: SearchDocsDto): Promise<any> {
    const { q, kbId, topK = 10 } = query;

    if (!q) {
      throw new Error('缺少查询参数 q');
    }

    const kbsToSearch = kbId
      ? [{ id: kbId, name: this.knowledgeBases.get(kbId)?.name }]
      : this.listKnowledgeBases();

    const allResults: SearchResult[] = [];

    for (const kb of kbsToSearch) {
      if (!kbId && !this.knowledgeBases.get(kb.id)) continue;
      try {
        const results = await this.retrieve(kb.id, q, { topK });
        for (const r of results) {
          allResults.push({ ...r, kbId: kb.id, kbName: kb.name });
        }
      } catch {
        // 忽略单个知识库搜索失败
      }
    }

    allResults.sort((a, b) => b.similarity - a.similarity);
    const merged = allResults.slice(0, topK);

    return {
      query: q,
      results: merged,
      count: merged.length,
    };
  }

  async retrieve(kbId: string, query: string, options: { topK: number }): Promise<any[]> {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw new NotFoundException('知识库不存在');
    }

    // 简化检索 - 基于关键词匹配
    const results: any[] = [];
    const queryLower = query.toLowerCase();

    for (const doc of kb.documents) {
      for (const chunk of doc.chunks) {
        const contentLower = chunk.content?.toLowerCase() || '';
        if (contentLower.includes(queryLower)) {
          const similarity = this.calculateSimilarity(queryLower, contentLower);
          results.push({
            chunkId: chunk.id,
            content: chunk.content,
            similarity,
            documentId: doc.id,
            documentTitle: doc.title,
          });
        }
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, options.topK);
  }

  private calculateSimilarity(query: string, content: string): number {
    const queryWords = query.split(/\s+/);
    const contentWords = content.split(/\s+/);
    const matches = queryWords.filter(word => contentWords.includes(word));
    return matches.length / queryWords.length;
  }

  async getStats(): Promise<any> {
    let totalDocs = 0;
    let totalChunks = 0;

    for (const kb of this.knowledgeBases.values()) {
      totalDocs += kb.documents.length;
      totalChunks += kb.documents.reduce((sum, doc) => sum + doc.chunks.length, 0);
    }

    return {
      totalDocuments: totalDocs,
      totalChunks: totalChunks,
      knowledgeBaseCount: this.knowledgeBases.size,
    };
  }

  async upload(dto: UploadDocDto, file?: any): Promise<any> {
    let targetKbId = dto.kbId;

    if (!targetKbId) {
      const kbs = this.listKnowledgeBases();
      let defaultKb = kbs.find(kb => kb.name === (dto.kbName || 'default'));
      if (!defaultKb) {
        const created = await this.createKnowledgeBase(dto.kbName || 'default', '自动创建的知识库');
        targetKbId = created.id;
      } else {
        targetKbId = defaultKb.id;
      }
    }

    const kb = this.knowledgeBases.get(targetKbId);
    if (!kb) {
      throw new NotFoundException('知识库不存在');
    }

    // 文件上传模式
    if (file) {
      const parsed = await this.parseDocument(file.path);
      const docId = this.generateId();
      const chunks = this.chunkText(parsed.content);

      const doc: Document = {
        id: docId,
        title: dto.title || file.originalname.replace(/\.[^.]+$/, ''),
        type: parsed.type || 'text',
        chunks: chunks.map((content, i) => ({ id: `${docId}_${i}`, content })),
        metadata: { originalFilename: file.originalname, ...parsed.metadata },
        createdAt: Date.now(),
      };

      kb.documents.push(doc);
      kb.updatedAt = Date.now();

      return {
        documentId: docId,
        chunks: chunks.length,
        kbId: targetKbId,
      };
    }

    // 文本内容模式
    if (!dto.content) {
      throw new Error('缺少文件或内容');
    }

    const docId = this.generateId();
    const chunks = this.chunkText(dto.content);

    const doc: Document = {
      id: docId,
      title: dto.title || 'Untitled',
      type: dto.type || 'text',
      chunks: chunks.map((content, i) => ({ id: `${docId}_${i}`, content })),
      metadata: dto.metadata || {},
      createdAt: Date.now(),
    };

    kb.documents.push(doc);
    kb.updatedAt = Date.now();

    return {
      documentId: docId,
      chunks: chunks.length,
      kbId: targetKbId,
    };
  }

  private chunkText(content: string, size: number = 500, overlap: number = 50): string[] {
    const chunks: string[] = [];
    const words = content.split(/\s+/);
    let start = 0;

    while (start < words.length) {
      const end = Math.min(start + size, words.length);
      chunks.push(words.slice(start, end).join(' '));
      start = end - overlap;
      if (start >= words.length) break;
    }

    return chunks;
  }

  private async parseDocument(filePath: string): Promise<{ content: string; type: string; metadata: any }> {
    const fs = require('fs');
    const path = require('path');
    const ext = path.extname(filePath).toLowerCase();

    let content = '';
    let type = 'text';

    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      content = '';
    }

    switch (ext) {
      case '.pdf':
        type = 'pdf';
        break;
      case '.doc':
      case '.docx':
        type = 'word';
        break;
      case '.html':
        type = 'html';
        break;
      case '.csv':
        type = 'csv';
        break;
      case '.md':
        type = 'markdown';
        break;
      case '.json':
        type = 'json';
        break;
      default:
        type = 'text';
    }

    return { content, type, metadata: {} };
  }

  async delete(dto: DeleteDocDto): Promise<any> {
    const { id, kbId } = dto;

    if (!kbId) {
      throw new Error('缺少 kbId 参数');
    }

    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw new NotFoundException('知识库不存在');
    }

    const docIndex = kb.documents.findIndex(doc => doc.id === id);
    if (docIndex === -1) {
      throw new NotFoundException('文档不存在');
    }

    const [removed] = kb.documents.splice(docIndex, 1);
    kb.updatedAt = Date.now();

    return { documentId: id, title: removed.title };
  }

  async reindex(dto: ReindexDto): Promise<any> {
    const { kbId } = dto;

    if (kbId) {
      const kb = this.knowledgeBases.get(kbId);
      if (!kb) {
        throw new NotFoundException('知识库不存在');
      }
      kb.updatedAt = Date.now();
      const totalChunks = kb.documents.reduce((sum, doc) => sum + doc.chunks.length, 0);
      return { kbId, documents: kb.documents.length, chunks: totalChunks };
    } else {
      const kbs = this.listKnowledgeBases();
      let totalDocs = 0;
      let totalChunks = 0;
      for (const kbMeta of kbs) {
        const kb = this.knowledgeBases.get(kbMeta.id);
        if (kb) {
          kb.updatedAt = Date.now();
          totalDocs += kb.documents.length;
          totalChunks += kbMeta.totalChunks;
        }
      }
      return { knowledgeBases: kbs.length, documents: totalDocs, chunks: totalChunks };
    }
  }

  async createKnowledgeBase(name: string, description: string): Promise<KnowledgeBase> {
    const kb: KnowledgeBase = {
      id: this.generateId(),
      name,
      description,
      documentCount: 0,
      totalChunks: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      documents: [],
    };
    this.knowledgeBases.set(kb.id, kb);
    return kb;
  }

  async saveKnowledgeBase(kb: KnowledgeBase): Promise<void> {
    this.knowledgeBases.set(kb.id, kb);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
