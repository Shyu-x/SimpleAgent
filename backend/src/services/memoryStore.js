/**
 * MemoryStoreService - 记忆系统存储服务
 * 提供会话记忆和全局记忆的持久化存储
 *
 * 特性：
 * - 会话记忆存储（按sessionId组织）
 * - 全局记忆存储（跨会话）
 * - 记忆摘要管理
 * - 访问计数和排序
 */

class MemoryStoreService {
  constructor() {
    this.sessionMemories = new Map(); // key: sessionId, value: Note[]
    this.globalMemories = new Map();  // key: memoryId, value: GlobalMemory
    this.memorySummaries = new Map(); // key: summaryId, value: Summary
  }

  // 生成唯一ID
  generateId(prefix = 'mem') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ============ 会话记忆操作 ============

  /**
   * 获取指定会话的所有记忆
   */
  getSessionNotes(sessionId) {
    return this.sessionMemories.get(sessionId) || [];
  }

  /**
   * 保存会话记忆
   */
  createSessionNote(sessionId, data) {
    const { content, type = 'short_term', importance = 'medium', tags = [], embedding } = data;

    const note = {
      id: this.generateId('note'),
      sessionId,
      content,
      type,
      importance,
      tags,
      embedding,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const notes = this.sessionMemories.get(sessionId) || [];
    notes.push(note);
    this.sessionMemories.set(sessionId, notes);

    return note;
  }

  /**
   * 更新会话记忆
   */
  updateSessionNote(sessionId, noteId, updates) {
    const notes = this.sessionMemories.get(sessionId) || [];
    const noteIndex = notes.findIndex(n => n.id === noteId);

    if (noteIndex === -1) {
      return { success: false, error: 'not_found' };
    }

    const updatedNote = {
      ...notes[noteIndex],
      updatedAt: Date.now()
    };

    if (updates.content !== undefined) updatedNote.content = updates.content;
    if (updates.type !== undefined) updatedNote.type = updates.type;
    if (updates.importance !== undefined) updatedNote.importance = updates.importance;
    if (updates.tags !== undefined) updatedNote.tags = updates.tags;

    notes[noteIndex] = updatedNote;
    this.sessionMemories.set(sessionId, notes);

    return { success: true, note: updatedNote };
  }

  /**
   * 删除会话记忆
   */
  deleteSessionNote(sessionId, noteId) {
    if (!this.sessionMemories.has(sessionId)) {
      return { success: false, error: 'session_not_found' };
    }

    const notes = this.sessionMemories.get(sessionId);
    const filtered = notes.filter(n => n.id !== noteId);

    if (filtered.length === notes.length) {
      return { success: false, error: 'note_not_found' };
    }

    this.sessionMemories.set(sessionId, filtered);
    return { success: true, deletedId: noteId };
  }

  /**
   * 清除会话所有记忆
   */
  clearSessionNotes(sessionId) {
    const existed = this.sessionMemories.has(sessionId);
    if (existed) {
      this.sessionMemories.delete(sessionId);
    }
    return { success: true, cleared: existed };
  }

  // ============ 全局记忆操作 ============

  /**
   * 获取所有全局记忆
   */
  getGlobalMemories(options = {}) {
    const { type, limit, offset = 0 } = options;
    let memories = Array.from(this.globalMemories.values());

    if (type) {
      memories = memories.filter(m => m.type === type);
    }

    // 按重要性排序
    memories.sort((a, b) => {
      const importanceOrder = { high: 0, medium: 1, low: 2 };
      const impDiff = importanceOrder[a.importance] - importanceOrder[b.importance];
      if (impDiff !== 0) return impDiff;
      return b.accessCount - a.accessCount;
    });

    const total = memories.length;
    const limited = limit ? memories.slice(Number(offset), Number(offset) + Number(limit)) : memories;

    return {
      data: limited,
      total,
      offset: Number(offset),
      limit: Number(limit) || total
    };
  }

  /**
   * 创建全局记忆
   */
  createGlobalMemory(data) {
    const { content, type = 'general', importance = 'medium', tags = [], userId = 'default' } = data;

    const memory = {
      id: this.generateId('gm'),
      userId,
      content,
      type,
      importance,
      tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0
    };

    this.globalMemories.set(memory.id, memory);
    return memory;
  }

  /**
   * 更新全局记忆
   */
  updateGlobalMemory(memoryId, updates) {
    const memory = this.globalMemories.get(memoryId);
    if (!memory) {
      return { success: false, error: 'not_found' };
    }

    const updated = {
      ...memory,
      updatedAt: Date.now()
    };

    if (updates.content !== undefined) updated.content = updates.content;
    if (updates.type !== undefined) updated.type = updates.type;
    if (updates.importance !== undefined) updated.importance = updates.importance;
    if (updates.tags !== undefined) updated.tags = updates.tags;

    this.globalMemories.set(memoryId, updated);
    return { success: true, memory: updated };
  }

  /**
   * 删除全局记忆
   */
  deleteGlobalMemory(memoryId) {
    if (!this.globalMemories.has(memoryId)) {
      return { success: false, error: 'not_found' };
    }

    this.globalMemories.delete(memoryId);
    return { success: true, deletedId: memoryId };
  }

  /**
   * 访问全局记忆（更新访问计数）
   */
  accessGlobalMemory(memoryId) {
    const memory = this.globalMemories.get(memoryId);
    if (!memory) {
      return { success: false, error: 'not_found' };
    }

    memory.lastAccessedAt = Date.now();
    memory.accessCount += 1;
    this.globalMemories.set(memoryId, memory);

    return { success: true, memory };
  }

  /**
   * 搜索全局记忆
   */
  searchGlobalMemories(query, options = {}) {
    const { limit = 10 } = options;
    const queryLower = query.toLowerCase();

    const memories = Array.from(this.globalMemories.values())
      .filter(m =>
        m.content.toLowerCase().includes(queryLower) ||
        m.tags.some(tag => tag.toLowerCase().includes(queryLower))
      )
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, Number(limit));

    // 更新访问计数
    memories.forEach(m => {
      m.lastAccessedAt = Date.now();
      m.accessCount += 1;
      this.globalMemories.set(m.id, m);
    });

    return {
      data: memories,
      total: memories.length,
      query
    };
  }

  // ============ 记忆摘要操作 ============

  /**
   * 获取记忆摘要列表
   */
  getSummaries(options = {}) {
    const { sessionId, limit = 50 } = options;
    let summaries = Array.from(this.memorySummaries.values());

    if (sessionId) {
      summaries = summaries.filter(s => s.sessionId === sessionId);
    }

    summaries.sort((a, b) => b.createdAt - a.createdAt);
    return summaries.slice(0, Number(limit));
  }

  /**
   * 创建记忆摘要
   */
  createSummary(data) {
    const { sessionId, content } = data;

    const summary = {
      id: this.generateId('sum'),
      sessionId,
      content,
      createdAt: Date.now()
    };

    this.memorySummaries.set(summary.id, summary);
    return summary;
  }

  /**
   * 删除记忆摘要
   */
  deleteSummary(id) {
    if (!this.memorySummaries.has(id)) {
      return { success: false, error: 'not_found' };
    }

    this.memorySummaries.delete(id);
    return { success: true, deletedId: id };
  }

  // ============ 统计操作 ============

  /**
   * 获取统计信息
   */
  getStats() {
    const sessionCount = this.sessionMemories.size;
    const totalSessionNotes = Array.from(this.sessionMemories.values()).reduce((sum, notes) => sum + notes.length, 0);
    const globalCount = this.globalMemories.size;
    const summaryCount = this.memorySummaries.size;

    // 按类型统计全局记忆
    const byType = {};
    this.globalMemories.values().forEach(m => {
      byType[m.type] = (byType[m.type] || 0) + 1;
    });

    return {
      sessionCount,
      totalSessionNotes,
      globalMemoryCount: globalCount,
      summaryCount,
      byType
    };
  }
}

// 导出单例
const memoryStoreService = new MemoryStoreService();

module.exports = {
  MemoryStoreService,
  memoryStoreService
};