import { Injectable, NotFoundException } from '@nestjs/common';

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
  chunks: Chunk[];
  metadata: Record<string, any>;
  createdAt: number;
}

export interface Chunk {
  id: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, any>;
}

export interface RetrieveResult {
  chunkId: string;
  content: string;
  similarity: number;
  metadata: Record<string, any>;
  documentId: string;
  documentTitle: string;
}

@Injectable()
export class RagService {
  private readonly knowledgeBases: Map<string, KnowledgeBase> = new Map();

  private generateId(): string {
    return `kb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private docId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private chunkId(): string {
    return `chunk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async createKnowledgeBase(name: string, description?: string): Promise<KnowledgeBase> {
    const kb: KnowledgeBase = {
      id: this.generateId(),
      name,
      description: description || '',
      documents: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.knowledgeBases.set(kb.id, kb);
    return kb;
  }

  listKnowledgeBases(): KnowledgeBase[] {
    return Array.from(this.knowledgeBases.values());
  }

  getKnowledgeBase(kbId: string): KnowledgeBase | undefined {
    return this.knowledgeBases.get(kbId);
  }

  async deleteKnowledgeBase(kbId: string): Promise<void> {
    if (!this.knowledgeBases.has(kbId)) {
      throw new NotFoundException('知识库不存在');
    }
    this.knowledgeBases.delete(kbId);
  }

  async addDocument(
    kbId: string,
    dto: { title: string; content: string; type?: string; metadata?: Record<string, any> },
  ): Promise<{ docId: string; chunks: number }> {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw new NotFoundException('知识库不存在');
    }

    const chunkSize = 500;
    const overlap = 50;
    const content = dto.content;
    const chunks: Chunk[] = [];

    // Simple chunking logic
    for (let i = 0; i < content.length; i += chunkSize - overlap) {
      const chunkContent = content.substring(i, i + chunkSize);
      if (chunkContent.trim()) {
        chunks.push({
          id: this.chunkId(),
          content: chunkContent,
          metadata: { index: chunks.length, start: i },
        });
      }
    }

    const doc: Document = {
      id: this.docId(),
      title: dto.title,
      content: dto.content,
      type: dto.type || 'text',
      chunks,
      metadata: dto.metadata || {},
      createdAt: Date.now(),
    };

    kb.documents.push(doc);
    kb.updatedAt = Date.now();

    return { docId: doc.id, chunks: chunks.length };
  }

  async retrieve(
    kbId: string,
    query: string,
    options: { topK?: number; similarityThreshold?: number } = {},
  ): Promise<RetrieveResult[]> {
    const kb = this.knowledgeBases.get(kbId);
    if (!kb) {
      throw new NotFoundException('知识库不存在');
    }

    const topK = options.topK || 5;
    const similarityThreshold = options.similarityThreshold || 0.3;
    const results: RetrieveResult[] = [];

    // Simple keyword-based similarity (in production, use embeddings)
    const queryWords = query.toLowerCase().split(/\s+/);

    for (const doc of kb.documents) {
      for (const chunk of doc.chunks) {
        const contentLower = chunk.content.toLowerCase();
        let matchCount = 0;
        for (const word of queryWords) {
          if (contentLower.includes(word)) {
            matchCount++;
          }
        }
        const similarity = queryWords.length > 0 ? matchCount / queryWords.length : 0;

        if (similarity >= similarityThreshold) {
          results.push({
            chunkId: chunk.id,
            content: chunk.content,
            similarity,
            metadata: chunk.metadata,
            documentId: doc.id,
            documentTitle: doc.title,
          });
        }
      }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  async getContextForConversation(
    kbId: string,
    query: string,
    options: { topK?: number; similarityThreshold?: number } = {},
  ): Promise<{ context: string; sources: any[]; count: number } | null> {
    const results = await this.retrieve(kbId, query, options);
    if (results.length === 0) {
      return null;
    }

    const context = results.map((r) => r.content).join('\n\n');
    const sources = results.map((r) => ({
      documentId: r.documentId,
      title: r.documentTitle,
      similarity: r.similarity,
    }));

    return { context, sources, count: results.length };
  }

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

  getStats(): any {
    const kbs = this.listKnowledgeBases();
    let totalDocs = 0;
    let totalChunks = 0;

    for (const kb of kbs) {
      totalDocs += kb.documents.length;
      totalChunks += kb.documents.reduce((sum, doc) => sum + doc.chunks.length, 0);
    }

    return {
      totalKnowledgeBases: kbs.length,
      totalDocuments: totalDocs,
      totalChunks: totalChunks,
      knowledgeBases: kbs.map((kb) => ({
        id: kb.id,
        name: kb.name,
        documentCount: kb.documents.length,
        totalChunks: kb.documents.reduce((sum, doc) => sum + doc.chunks.length, 0),
      })),
    };
  }

  async parseDocument(_filePath: string): Promise<{ content: string; type: string; metadata: any }> {
    // Placeholder for document parsing
    return {
      content: 'Parsed document content',
      type: 'text',
      metadata: {},
    };
  }
}
