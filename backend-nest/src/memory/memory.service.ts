import { Injectable, NotFoundException } from '@nestjs/common';

export interface Note {
  id: string;
  sessionId: string;
  content: string;
  type: 'short_term' | 'long_term' | 'semantic';
  importance: 'low' | 'medium' | 'high';
  tags: string[];
  embedding?: number[];
  createdAt: number;
  updatedAt: number;
}

export interface GlobalMemory {
  id: string;
  userId: string;
  content: string;
  type: 'user_pref' | 'context' | 'knowledge' | 'task' | 'general';
  importance: 'low' | 'medium' | 'high';
  tags: string[];
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

export interface MemorySummary {
  id: string;
  sessionId: string;
  content: string;
  createdAt: number;
}

@Injectable()
export class MemoryService {
  private readonly sessionMemories: Map<string, Note[]> = new Map();
  private readonly globalMemories: Map<string, GlobalMemory> = new Map();
  private readonly memorySummaries: Map<string, MemorySummary> = new Map();

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // Session memory methods
  getSessionNotes(sessionId: string): Note[] {
    return this.sessionMemories.get(sessionId) || [];
  }

  createSessionNote(
    sessionId: string,
    dto: { content: string; type?: string; importance?: string; tags?: string[]; embedding?: number[] },
  ): Note {
    const note: Note = {
      id: this.generateId('note'),
      sessionId,
      content: dto.content,
      type: (dto.type as Note['type']) || 'short_term',
      importance: (dto.importance as Note['importance']) || 'medium',
      tags: dto.tags || [],
      embedding: dto.embedding,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const notes = this.sessionMemories.get(sessionId) || [];
    notes.push(note);
    this.sessionMemories.set(sessionId, notes);

    return note;
  }

  updateSessionNote(sessionId: string, noteId: string, updates: Partial<Note>): Note {
    const notes = this.sessionMemories.get(sessionId) || [];
    const index = notes.findIndex((n) => n.id === noteId);

    if (index === -1) {
      throw new NotFoundException('记忆不存在');
    }

    const updated: Note = {
      ...notes[index],
      ...updates,
      updatedAt: Date.now(),
    };
    notes[index] = updated;
    this.sessionMemories.set(sessionId, notes);

    return updated;
  }

  deleteSessionNote(sessionId: string, noteId?: string): void {
    if (noteId) {
      const notes = this.sessionMemories.get(sessionId) || [];
      const filtered = notes.filter((n) => n.id !== noteId);
      if (filtered.length === notes.length) {
        throw new NotFoundException('指定记忆不存在');
      }
      this.sessionMemories.set(sessionId, filtered);
    } else {
      this.sessionMemories.delete(sessionId);
    }
  }

  // Global memory methods
  getGlobalMemories(options: { type?: string; limit?: number; offset?: number } = {}): {
    data: GlobalMemory[];
    total: number;
  } {
    let memories = Array.from(this.globalMemories.values());

    if (options.type) {
      memories = memories.filter((m) => m.type === options.type);
    }

    memories.sort((a, b) => {
      const importanceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const impDiff = importanceOrder[a.importance] - importanceOrder[b.importance];
      if (impDiff !== 0) return impDiff;
      return b.accessCount - a.accessCount;
    });

    const total = memories.length;
    const offset = options.offset || 0;
    const limit = options.limit || total;
    const limited = memories.slice(offset, offset + limit);

    return { data: limited, total };
  }

  createGlobalMemory(
    dto: { content: string; type?: string; importance?: string; tags?: string[]; userId?: string },
  ): GlobalMemory {
    const memory: GlobalMemory = {
      id: this.generateId('gm'),
      userId: dto.userId || 'default',
      content: dto.content,
      type: (dto.type as GlobalMemory['type']) || 'general',
      importance: (dto.importance as GlobalMemory['importance']) || 'medium',
      tags: dto.tags || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
    };

    this.globalMemories.set(memory.id, memory);
    return memory;
  }

  updateGlobalMemory(memoryId: string, updates: Partial<GlobalMemory>): GlobalMemory {
    const memory = this.globalMemories.get(memoryId);
    if (!memory) {
      throw new NotFoundException('全局记忆不存在');
    }

    const updated: GlobalMemory = { ...memory, ...updates, updatedAt: Date.now() };
    this.globalMemories.set(memoryId, updated);
    return updated;
  }

  deleteGlobalMemory(memoryId: string): void {
    if (!this.globalMemories.has(memoryId)) {
      throw new NotFoundException('全局记忆不存在');
    }
    this.globalMemories.delete(memoryId);
  }

  accessGlobalMemory(memoryId: string): GlobalMemory {
    const memory = this.globalMemories.get(memoryId);
    if (!memory) {
      throw new NotFoundException('全局记忆不存在');
    }

    memory.lastAccessedAt = Date.now();
    memory.accessCount += 1;
    this.globalMemories.set(memoryId, memory);
    return memory;
  }

  searchGlobalMemories(query: string, limit: number = 10): GlobalMemory[] {
    const queryLower = query.toLowerCase();
    const memories = Array.from(this.globalMemories.values())
      .filter(
        (m) =>
          m.content.toLowerCase().includes(queryLower) ||
          m.tags.some((tag) => tag.toLowerCase().includes(queryLower)),
      )
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);

    // Update access count
    for (const m of memories) {
      m.lastAccessedAt = Date.now();
      m.accessCount += 1;
      this.globalMemories.set(m.id, m);
    }

    return memories;
  }

  // Summary methods
  getSummaries(sessionId?: string, limit: number = 50): MemorySummary[] {
    let summaries = Array.from(this.memorySummaries.values());

    if (sessionId) {
      summaries = summaries.filter((s) => s.sessionId === sessionId);
    }

    summaries.sort((a, b) => b.createdAt - a.createdAt);
    return summaries.slice(0, limit);
  }

  createSummary(sessionId: string, content: string): MemorySummary {
    const summary: MemorySummary = {
      id: this.generateId('sum'),
      sessionId,
      content,
      createdAt: Date.now(),
    };

    this.memorySummaries.set(summary.id, summary);
    return summary;
  }

  deleteSummary(id: string): void {
    if (!this.memorySummaries.has(id)) {
      throw new NotFoundException('记忆摘要不存在');
    }
    this.memorySummaries.delete(id);
  }

  // Stats
  getStats(): any {
    const sessionCount = this.sessionMemories.size;
    const totalSessionNotes = Array.from(this.sessionMemories.values()).reduce((sum, notes) => sum + notes.length, 0);
    const globalCount = this.globalMemories.size;
    const summaryCount = this.memorySummaries.size;

    const byType: Record<string, number> = {};
    Array.from(this.globalMemories.values()).forEach((m: GlobalMemory) => {
      byType[m.type] = (byType[m.type] || 0) + 1;
    });

    return {
      sessionCount,
      totalSessionNotes,
      globalMemoryCount: globalCount,
      summaryCount,
      byType,
    };
  }
}
