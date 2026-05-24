'use client';

import { useState, useCallback, useEffect } from 'react';
import { API_ENDPOINTS } from '@/lib/apiConfig';

// 记忆类型
export const MemoryType = {
  SHORT_TERM: 'short_term',
  LONG_TERM: 'long_term',
  EPISODIC: 'episodic',
  SEMANTIC: 'semantic',
  PROCEDURAL: 'procedural'
};

// 记忆来源
export const MemorySource = {
  USER: 'user',
  AGENT: 'agent',
  SYSTEM: 'system'
};

interface Memory {
  id: string;
  content: string;
  type: string;
  source: string;
  embedding: number[];
  metadata: Record<string, any>;
  importance: number;
  accessCount: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  sessionId: string | null;
  agentId: string | null;
  tags: string[];
}

interface SearchResult {
  memory: Memory;
  similarity: number;
}

interface SessionContext {
  sessionId: string;
  messageCount: number;
  variables: Record<string, any>;
  createdAt: number;
  lastAccessedAt: number;
}

interface MemoryStats {
  shortTermCount: number;
  longTermCount: number;
  sessionCount: number;
  initialized: boolean;
}

const API_BASE = API_ENDPOINTS.memory;

export function useEnhancedMemory() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [initialized, setInitialized] = useState(false);

  // 初始化系统
  const initialize = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/initialize`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
        setInitialized(true);
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 添加记忆
  const addMemory = useCallback(async (content: string, options: {
    type?: string;
    source?: string;
    metadata?: Record<string, any>;
    importance?: number;
    sessionId?: string;
    agentId?: string;
    tags?: string[];
  } = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, ...options })
      });
      const data = await response.json();
      if (data.success) {
        await fetchStats();
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add memory';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 获取记忆
  const getMemory = useCallback(async (memoryId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/${memoryId}`);
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get memory';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 删除记忆
  const deleteMemory = useCallback(async (memoryId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/${memoryId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        await fetchStats();
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete memory';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 搜索记忆
  const search = useCallback(async (query: string, options: {
    threshold?: number;
    limit?: number;
    types?: string[];
  } = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, ...options })
      });
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setError(message);
      return { success: false, error: message, results: [] };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 转移到长期记忆
  const promoteToLongTerm = useCallback(async (memoryId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/${memoryId}/promote`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        await fetchStats();
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to promote memory';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 会话管理
  const createSession = useCallback(async (sessionId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/session/${sessionId}`);
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get session';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addSessionMessage = useCallback(async (sessionId: string, role: string, content: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/session/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content })
      });
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add message';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setSessionVariable = useCallback(async (sessionId: string, key: string, value: unknown) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/session/${sessionId}/variable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set variable';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 清理过期记忆
  const cleanup = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/cleanup`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        await fetchStats();
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cleanup failed';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 获取统计信息
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/stats`);
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
      }
      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch stats' };
    }
  }, []);

  // 自动初始化
  useEffect(() => {
    if (!initialized) {
      initialize();
    }
  }, [initialized, initialize]);

  return {
    isLoading,
    error,
    stats,
    initialized,
    initialize,
    addMemory,
    getMemory,
    deleteMemory,
    search,
    promoteToLongTerm,
    createSession,
    getSession,
    addSessionMessage,
    setSessionVariable,
    cleanup,
    fetchStats
  };
}