'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { API_ENDPOINTS } from '@/lib/apiConfig';
import type { ConfirmationRequest } from '@/store/agentWorkflowStore';

const API_BASE = API_ENDPOINTS.enhancedAgent;

// ==================== Types ====================

/**
 * 检查点类型
 */
export interface Checkpoint {
  id: string;
  timestamp: number;
  state: Record<string, unknown>;
  description?: string;
}

/**
 * 记忆项类型
 */
export interface MemoryItem {
  id: string;
  content?: string;
  type?: string;
  timestamp: number;
  importance?: 'high' | 'medium' | 'low';
  accessCount?: number;
  metadata?: Record<string, unknown>;
}

/**
 * 增强版 Agent Hook
 * 支持：检查点、人机协作、双记忆系统
 */
export function useEnhancedAgent() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'waiting_confirmation' | 'completed' | 'error'>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [pendingConfirmations, setPendingConfirmations] = useState<ConfirmationRequest[]>([]);
  const [memoryStats, setMemoryStats] = useState<object | null>(null);

  // 轮询检查待确认请求
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 执行任务
   */
  const execute = useCallback(async (task: string, context: Record<string, unknown> = {}) => {
    setIsLoading(true);
    setError(null);
    setStatus('running');

    try {
      const response = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, task, context })
      });

      const data = await response.json();

      if (data.success) {
        setSessionId(data.sessionId);
        setResult(data.result);
        setStatus(data.result.error ? 'error' : 'completed');

        // 更新检查点
        if (data.result.checkpoints) {
          setCheckpoints(prev => [...prev, ...data.result.checkpoints]);
        }

        // 更新确认请求
        if (data.result.humanConfirmations) {
          setPendingConfirmations(data.result.humanConfirmations);
        }
      } else {
        setError(data.error);
        setStatus('error');
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Execution failed';
      setError(message);
      setStatus('error');
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  /**
   * 暂停执行
   */
  const pause = useCallback(async () => {
    if (!sessionId) return { success: false, error: 'No active session' };

    try {
      const response = await fetch(`${API_BASE}/pause/${sessionId}`, { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        setStatus('paused');
      }

      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Pause failed' };
    }
  }, [sessionId]);

  /**
   * 恢复执行
   */
  const resume = useCallback(async () => {
    if (!sessionId) return { success: false, error: 'No active session' };

    try {
      const response = await fetch(`${API_BASE}/resume/${sessionId}`, { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        setStatus('running');
      }

      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Resume failed' };
    }
  }, [sessionId]);

  /**
   * 保存检查点
   */
  const saveCheckpoint = useCallback(async () => {
    if (!sessionId) return { success: false, error: 'No active session' };

    try {
      const response = await fetch(`${API_BASE}/checkpoint/${sessionId}`, { method: 'POST' });
      const data = await response.json();

      if (data.success && data.checkpoint) {
        setCheckpoints(prev => [...prev, data.checkpoint]);
      }

      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Save checkpoint failed' };
    }
  }, [sessionId]);

  /**
   * 获取检查点列表
   */
  const fetchCheckpoints = useCallback(async () => {
    if (!sessionId) return [];

    try {
      const response = await fetch(`${API_BASE}/checkpoints/${sessionId}`);
      const data = await response.json();

      if (data.success) {
        setCheckpoints(data.checkpoints);
      }

      return data.checkpoints || [];
    } catch (err) {
      return [];
    }
  }, [sessionId]);

  /**
   * 从检查点恢复
   */
  const restoreCheckpoint = useCallback(async (checkpointId: string) => {
    if (!sessionId) return { success: false, error: 'No active session' };

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/restore/${sessionId}/${checkpointId}`, { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        setStatus('paused');
        // 可以继续执行
      }

      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Restore failed' };
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  /**
   * 获取待确认请求
   */
  const fetchPendingConfirmations = useCallback(async () => {
    if (!sessionId) return [];

    try {
      const response = await fetch(`${API_BASE}/confirmations/${sessionId}`);
      const data = await response.json();

      if (data.success) {
        setPendingConfirmations(data.pending);

        if (data.pending.length > 0) {
          setStatus('waiting_confirmation');
        }
      }

      return data.pending || [];
    } catch (err) {
      return [];
    }
  }, [sessionId]);

  /**
   * 响应确认请求
   */
  const respondToConfirmation = useCallback(async (
    confirmationId: string,
    approved: boolean,
    modifiedInput?: Record<string, unknown>
  ) => {
    if (!sessionId) return { success: false, error: 'No active session' };

    try {
      const response = await fetch(`${API_BASE}/confirm/${sessionId}/${confirmationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, modifiedInput })
      });

      const data = await response.json();

      if (data.success) {
        // 移除已处理的确认
        setPendingConfirmations(prev => prev.filter(c => c.id !== confirmationId));

        // 如果没有更多待确认，恢复运行状态
        if (pendingConfirmations.length <= 1) {
          setStatus('running');
        }
      }

      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Confirm failed' };
    }
  }, [sessionId, pendingConfirmations.length]);

  /**
   * 搜索记忆
   */
  const searchMemory = useCallback(async (query: string, limit = 5) => {
    if (!sessionId) return [];

    try {
      const response = await fetch(`${API_BASE}/memory/${sessionId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit })
      });

      const data = await response.json();
      return data.success ? data.results : [];
    } catch (err) {
      return [];
    }
  }, [sessionId]);

  /**
   * 提升记忆到长期存储
   */
  const promoteMemory = useCallback(async (
    content: string,
    type: string = 'general',
    importance: 'high' | 'medium' | 'low' = 'medium'
  ) => {
    if (!sessionId) return { success: false, error: 'No active session' };

    try {
      const response = await fetch(`${API_BASE}/memory/${sessionId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, type, importance })
      });

      return await response.json();
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Promote failed' };
    }
  }, [sessionId]);

  /**
   * 获取状态
   */
  const fetchStatus = useCallback(async () => {
    if (!sessionId) return null;

    try {
      const response = await fetch(`${API_BASE}/status/${sessionId}`);
      const data = await response.json();

      if (data.success) {
        setStatus(data.status.status);
        setMemoryStats(data.status.memory);
      }

      return data.success ? data.status : null;
    } catch (err) {
      return null;
    }
  }, [sessionId]);

  /**
   * 清理会话
   */
  const cleanup = useCallback(async () => {
    if (!sessionId) return { success: true };

    try {
      const response = await fetch(`${API_BASE}/session/${sessionId}`, { method: 'DELETE' });
      const data = await response.json();

      if (data.success) {
        setSessionId(null);
        setStatus('idle');
        setResult(null);
        setCheckpoints([]);
        setPendingConfirmations([]);
        setMemoryStats(null);
      }

      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Cleanup failed' };
    }
  }, [sessionId]);

  // 启动轮询检查待确认请求
  useEffect(() => {
    if (status === 'waiting_confirmation' && sessionId) {
      pollingRef.current = setInterval(() => {
        fetchPendingConfirmations();
      }, 2000);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [status, sessionId, fetchPendingConfirmations]);

  return {
    sessionId,
    status,
    isLoading,
    error,
    result,
    checkpoints,
    pendingConfirmations,
    memoryStats,

    // Actions
    execute,
    pause,
    resume,
    saveCheckpoint,
    fetchCheckpoints,
    restoreCheckpoint,
    fetchPendingConfirmations,
    respondToConfirmation,
    searchMemory,
    promoteMemory,
    fetchStatus,
    cleanup
  };
}

/**
 * 人机协作确认组件 Hook
 */
export function useHumanLoopConfirmation() {
  const [confirmations, setConfirmations] = useState<ConfirmationRequest[]>([]);

  const addConfirmation = useCallback((confirmation: ConfirmationRequest) => {
    setConfirmations(prev => [...prev, confirmation]);
  }, []);

  const removeConfirmation = useCallback((id: string) => {
    setConfirmations(prev => prev.filter(c => c.id !== id));
  }, []);

  const approve = useCallback((id: string) => {
    removeConfirmation(id);
    return { approved: true };
  }, [removeConfirmation]);

  const reject = useCallback((id: string) => {
    removeConfirmation(id);
    return { approved: false };
  }, [removeConfirmation]);

  const modifyAndApprove = useCallback((id: string, modifiedInput: Record<string, unknown>) => {
    removeConfirmation(id);
    return { approved: true, modifiedInput };
  }, [removeConfirmation]);

  return {
    confirmations,
    addConfirmation,
    removeConfirmation,
    approve,
    reject,
    modifyAndApprove,
    hasPending: confirmations.length > 0
  };
}

/**
 * 检查点管理 Hook
 */
export function useCheckpointManager() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string | null>(null);

  const addCheckpoint = useCallback((checkpoint: Checkpoint) => {
    setCheckpoints(prev => [...prev, checkpoint]);
  }, []);

  const listCheckpoints = useCallback(() => {
    return checkpoints;
  }, [checkpoints]);

  const getCheckpoint = useCallback((id: string) => {
    return checkpoints.find(c => c.id === id);
  }, [checkpoints]);

  const clearCheckpoints = useCallback(() => {
    setCheckpoints([]);
    setSelectedCheckpoint(null);
  }, []);

  return {
    checkpoints,
    selectedCheckpoint,
    setSelectedCheckpoint,
    addCheckpoint,
    listCheckpoints,
    getCheckpoint,
    clearCheckpoints
  };
}

/**
 * 双记忆系统 Hook
 */
export function useDualMemory() {
  const [shortTermMemory, setShortTermMemory] = useState<MemoryItem[]>([]);
  const [longTermMemory, setLongTermMemory] = useState<MemoryItem[]>([]);

  const addToShortTerm = useCallback((item: Partial<MemoryItem>) => {
    const memoryItem: MemoryItem = {
      content: item.content,
      type: item.type,
      importance: item.importance,
      metadata: item.metadata,
      id: `stm_${Date.now()}`,
      timestamp: Date.now()
    };
    setShortTermMemory(prev => [...prev, memoryItem]);
    return memoryItem;
  }, []);

  const addToLongTerm = useCallback((item: Partial<MemoryItem>) => {
    const memoryItem: MemoryItem = {
      content: item.content,
      type: item.type,
      importance: item.importance,
      metadata: item.metadata,
      id: `ltm_${Date.now()}`,
      timestamp: Date.now(),
      accessCount: 0
    };
    setLongTermMemory(prev => [...prev, memoryItem]);
    return memoryItem;
  }, []);

  const promoteToLongTerm = useCallback((id: string) => {
    const item = shortTermMemory.find(m => m.id === id);
    if (item) {
      addToLongTerm(item);
      setShortTermMemory(prev => prev.filter(m => m.id !== id));
      return true;
    }
    return false;
  }, [shortTermMemory, addToLongTerm]);

  const clearShortTerm = useCallback(() => {
    setShortTermMemory([]);
  }, []);

  const clearLongTerm = useCallback(() => {
    setLongTermMemory([]);
  }, []);

  const getMemoryStats = useCallback(() => {
    return {
      shortTerm: shortTermMemory.length,
      longTerm: longTermMemory.length
    };
  }, [shortTermMemory.length, longTermMemory.length]);

  return {
    shortTermMemory,
    longTermMemory,
    addToShortTerm,
    addToLongTerm,
    promoteToLongTerm,
    clearShortTerm,
    clearLongTerm,
    getMemoryStats
  };
}