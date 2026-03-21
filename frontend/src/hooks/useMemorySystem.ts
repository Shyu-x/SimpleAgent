'use client';

import { useCallback, useEffect } from 'react';
import { useChatStore } from '@/store/chatStore';
import { Note, MemoryType, MemoryImportance, GlobalMemory } from '@/types';

// 记忆类型配置
export const MEMORY_TYPE_CONFIG: Record<MemoryType, { label: string; color: string; icon: string }> = {
  user_pref: { label: '用户偏好', color: 'blue', icon: 'user' },
  context: { label: '上下文', color: 'purple', icon: 'link' },
  knowledge: { label: '知识', color: 'green', icon: 'lightbulb' },
  task: { label: '任务', color: 'orange', icon: 'check' },
  general: { label: '一般', color: 'gray', icon: 'file-text' },
};

// 重要性配置
export const IMPORTANCE_CONFIG: Record<MemoryImportance, { label: string; color: string }> = {
  high: { label: '重要', color: 'red' },
  medium: { label: '一般', color: 'yellow' },
  low: { label: '低', color: 'gray' },
};

// 生成简单的语义哈希（简化版向量）
function generateSemanticHash(content: string): number[] {
  const hash: number[] = new Array(128).fill(0);
  const words = content.toLowerCase().split(/\s+/);

  words.forEach((word, idx) => {
    for (let i = 0; i < word.length; i++) {
      const charCode = word.charCodeAt(i);
      hash[(idx + charCode) % 128] += 1;
      hash[(i * 7 + charCode) % 128] += charCode % 10;
    }
  });

  const max = Math.max(...hash);
  return hash.map((h) => h / (max || 1));
}

// 计算余弦相似度
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

type SessionMemoryMetadata = Partial<Pick<Note, 'type' | 'importance' | 'tags' | 'embedding'>>;

export function useMemorySystem() {
  const conversations = useChatStore((state) => state.conversations);
  const globalMemories = useChatStore((state) => state.globalMemories);

  const addNote = useChatStore((state) => state.addNote);
  const updateNote = useChatStore((state) => state.updateNote);
  const deleteNote = useChatStore((state) => state.deleteNote);

  const addGlobalMemoryToStore = useChatStore((state) => state.addGlobalMemory);
  const updateGlobalMemoryToStore = useChatStore((state) => state.updateGlobalMemory);
  const deleteGlobalMemoryToStore = useChatStore((state) => state.deleteGlobalMemory);
  const bumpGlobalMemoryAccess = useChatStore((state) => state.bumpGlobalMemoryAccess);
  const hydrateGlobalMemories = useChatStore((state) => state.hydrateGlobalMemories);

  const isLoading = false;

  // 兼容旧架构：将 localStorage 的 global_memories 迁移到统一 store
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (globalMemories.length > 0) return;

    const legacy = window.localStorage.getItem('global_memories');
    if (!legacy) return;

    try {
      const parsed = JSON.parse(legacy) as GlobalMemory[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        hydrateGlobalMemories(parsed);
      }
      window.localStorage.removeItem('global_memories');
    } catch (error) {
      console.error('Failed to migrate legacy global memories:', error);
    }
  }, [globalMemories.length, hydrateGlobalMemories]);

  // 会话记忆：统一从 chatStore 读取
  const getSessionMemories = useCallback((conversationId: string): Note[] => {
    const conversation = conversations.find((item) => item.id === conversationId);
    return conversation?.notes || [];
  }, [conversations]);

  // 会话记忆：统一写入路径
  const addSessionMemory = useCallback((
    conversationId: string,
    content: string,
    metadata: SessionMemoryMetadata = {}
  ) => {
    addNote(conversationId, content, metadata);
  }, [addNote]);

  const updateSessionMemory = useCallback((
    conversationId: string,
    noteId: string,
    updates: string | Partial<Omit<Note, 'id' | 'createdAt'>>
  ) => {
    updateNote(conversationId, noteId, updates);
  }, [updateNote]);

  const deleteSessionMemory = useCallback((conversationId: string, noteId: string) => {
    deleteNote(conversationId, noteId);
  }, [deleteNote]);

  // 全局记忆：统一走 chatStore
  const addGlobalMemory = useCallback((
    content: string,
    type: MemoryType = 'general',
    importance: MemoryImportance = 'medium',
    tags: string[] = []
  ) => {
    return addGlobalMemoryToStore(content, type, importance, tags);
  }, [addGlobalMemoryToStore]);

  const updateGlobalMemory = useCallback((
    id: string,
    updates: Partial<Omit<GlobalMemory, 'id' | 'userId'>>
  ) => {
    updateGlobalMemoryToStore(id, updates);
  }, [updateGlobalMemoryToStore]);

  const deleteGlobalMemory = useCallback((id: string) => {
    deleteGlobalMemoryToStore(id);
  }, [deleteGlobalMemoryToStore]);

  // 语义搜索记忆
  const searchMemories = useCallback((query: string, limit = 5): GlobalMemory[] => {
    const queryHash = generateSemanticHash(query);

    const scored = globalMemories.map((memory) => {
      const embedding = generateSemanticHash(memory.content);
      return {
        memory,
        score: cosineSimilarity(queryHash, embedding),
      };
    });

    const now = Date.now();
    const topMatches = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.memory);

    topMatches.forEach((memory) => bumpGlobalMemoryAccess(memory.id));

    return topMatches.map((memory) => ({
      ...memory,
      accessCount: memory.accessCount + 1,
      lastAccessedAt: now,
    }));
  }, [globalMemories, bumpGlobalMemoryAccess]);

  // 获取相关记忆（基于标签或类型）
  const getRelatedMemories = useCallback((
    type?: MemoryType,
    tags?: string[],
    limit = 10
  ): GlobalMemory[] => {
    let filtered = globalMemories;

    if (type) {
      filtered = filtered.filter((memory) => memory.type === type);
    }

    if (tags && tags.length > 0) {
      filtered = filtered.filter((memory) =>
        tags.some((tag) => memory.tags.includes(tag))
      );
    }

    return filtered
      .sort((a, b) => {
        const importanceOrder = { high: 0, medium: 1, low: 2 };
        const importanceDiff = importanceOrder[a.importance] - importanceOrder[b.importance];
        if (importanceDiff !== 0) return importanceDiff;
        return b.accessCount - a.accessCount;
      })
      .slice(0, limit);
  }, [globalMemories]);

  // 获取用户偏好记忆
  const getUserPreferences = useCallback((): GlobalMemory[] => {
    return globalMemories.filter((memory) => memory.type === 'user_pref');
  }, [globalMemories]);

  // 将会话记忆转换为全局记忆
  const convertNoteToMemory = useCallback((
    note: Note,
    conversationId: string
  ) => {
    return addGlobalMemory(
      `[对话 ${conversationId}] ${note.content}`,
      note.type || 'context',
      note.importance || 'medium',
      note.tags || []
    );
  }, [addGlobalMemory]);

  // 自动提取用户偏好（简化版）
  const extractUserPreference = useCallback((content: string) => {
    const prefPatterns = [
      { pattern: /喜欢|偏好|更喜欢/i, type: 'user_pref' as MemoryType },
      { pattern: /讨厌|不喜欢|不要/i, type: 'user_pref' as MemoryType },
      { pattern: /记住|别忘了/i, type: 'task' as MemoryType },
      { pattern: /知识|科普|告诉我/i, type: 'knowledge' as MemoryType },
    ];

    for (const { pattern, type } of prefPatterns) {
      if (pattern.test(content)) {
        return type;
      }
    }

    return 'general' as MemoryType;
  }, []);

  return {
    // 统一架构：会话记忆 + 全局记忆都从同一 store 读取
    globalMemories,
    isLoading,
    getSessionMemories,
    addSessionMemory,
    updateSessionMemory,
    deleteSessionMemory,
    addGlobalMemory,
    updateGlobalMemory,
    deleteGlobalMemory,
    searchMemories,
    getRelatedMemories,
    getUserPreferences,
    convertNoteToMemory,
    extractUserPreference,
  };
}

// 记忆检索 Hook
export function useMemorySearch() {
  const { searchMemories, globalMemories } = useMemorySystem();

  const search = useCallback((query: string) => {
    if (!query.trim()) return [];
    return searchMemories(query);
  }, [searchMemories]);

  const getContextForConversation = useCallback((conversationId: string) => {
    const related = globalMemories
      .filter((memory) => memory.content.includes(conversationId) || memory.type === 'context')
      .sort((a, b) => (b.importance === 'high' ? 1 : -1))
      .slice(0, 3);

    return related.map((memory) => memory.content).join('\n');
  }, [globalMemories]);

  return {
    search,
    getContextForConversation,
  };
}
