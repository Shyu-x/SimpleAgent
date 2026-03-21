'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAgentWorkflowStore, type WorkflowDefinition, type AgentConfig, type TaskConfig, type WorkflowExecution } from '@/store/agentWorkflowStore';
import { agentWorkflowAPI } from '@/lib/agentWorkflowAPI';

// ==================== 高可用性配置 ====================

interface HAConfig {
  maxRetries: number;
  retryDelay: number;
  checkpointInterval: number;
  syncInterval: number;
  heartbeatTimeout: number;
}

const DEFAULT_HA_CONFIG: HAConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  checkpointInterval: 30000, // 30秒
  syncInterval: 5000, // 5秒
  heartbeatTimeout: 60000, // 60秒
};

// ==================== 存储服务 ====================

class WorkflowStorageService {
  private storageKey = 'agent-workflow-storage';
  private executionHistoryKey = 'agent-execution-history';
  private maxHistorySize = 50;

  // 保存工作流
  saveWorkflows(workflows: WorkflowDefinition[]): void {
    try {
      const data = {
        version: '1.0',
        timestamp: Date.now(),
        workflows,
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('保存工作流失败:', error);
      // 如果存储已满，尝试清理
      this.cleanup();
      this.saveWorkflows(workflows);
    }
  }

  // 加载工作流
  loadWorkflows(): WorkflowDefinition[] {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return parsed.workflows || [];
    } catch (error) {
      console.error('加载工作流失败:', error);
      return [];
    }
  }

  // 保存执行历史
  saveExecutionHistory(execution: WorkflowExecution): void {
    try {
      const history = this.loadExecutionHistory();
      history.unshift({
        ...execution,
        savedAt: Date.now(),
      });
      // 限制历史记录数量
      const trimmed = history.slice(0, this.maxHistorySize);
      localStorage.setItem(this.executionHistoryKey, JSON.stringify(trimmed));
    } catch (error) {
      console.error('保存执行历史失败:', error);
    }
  }

  // 加载执行历史
  loadExecutionHistory(): Array<WorkflowExecution & { savedAt: number }> {
    try {
      const data = localStorage.getItem(this.executionHistoryKey);
      if (!data) return [];
      return JSON.parse(data);
    } catch (error) {
      console.error('加载执行历史失败:', error);
      return [];
    }
  }

  // 清理过期数据
  cleanup(): void {
    try {
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天

      // 清理旧的工作流
      const workflows = this.loadWorkflows();
      const recentWorkflows = workflows.filter(
        (w) => now - w.updatedAt < maxAge
      );
      if (recentWorkflows.length !== workflows.length) {
        this.saveWorkflows(recentWorkflows);
      }

      // 清理执行历史
      const history = this.loadExecutionHistory();
      const recentHistory = history.filter(
        (h) => now - h.savedAt < maxAge
      );
      if (recentHistory.length !== history.length) {
        localStorage.setItem(this.executionHistoryKey, JSON.stringify(recentHistory));
      }
    } catch (error) {
      console.error('清理过期数据失败:', error);
    }
  }

  // 导出数据
  exportData(): string {
    return JSON.stringify({
      workflows: this.loadWorkflows(),
      executionHistory: this.loadExecutionHistory(),
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  // 导入数据
  importData(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (data.workflows && Array.isArray(data.workflows)) {
        this.saveWorkflows(data.workflows);
        return true;
      }
      return false;
    } catch (error) {
      console.error('导入数据失败:', error);
      return false;
    }
  }
}

export const storageService = new WorkflowStorageService();

// ==================== 重试服务 ====================

class RetryService {
  async withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<HAConfig> = {}
  ): Promise<T> {
    const { maxRetries, retryDelay } = { ...DEFAULT_HA_CONFIG, ...config };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          await this.delay(retryDelay * Math.pow(2, attempt)); // 指数退避
        }
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const retryService = new RetryService();

// ==================== 检查点服务 ====================

class CheckpointService {
  private checkpointKey = 'agent-workflow-checkpoint';

  saveCheckpoint(
    workflowId: string,
    execution: WorkflowExecution,
    taskResults: Map<string, string>
  ): void {
    try {
      const checkpoint = {
        workflowId,
        execution,
        taskResults: Object.fromEntries(taskResults),
        savedAt: Date.now(),
      };
      localStorage.setItem(this.checkpointKey, JSON.stringify(checkpoint));
    } catch (error) {
      console.error('保存检查点失败:', error);
    }
  }

  loadCheckpoint(): {
    workflowId: string;
    execution: WorkflowExecution;
    taskResults: Map<string, string>;
    savedAt: number;
  } | null {
    try {
      const data = localStorage.getItem(this.checkpointKey);
      if (!data) return null;
      const checkpoint = JSON.parse(data);
      return {
        ...checkpoint,
        taskResults: new Map(Object.entries(checkpoint.taskResults || {})),
      };
    } catch (error) {
      console.error('加载检查点失败:', error);
      return null;
    }
  }

  clearCheckpoint(): void {
    localStorage.removeItem(this.checkpointKey);
  }

  hasCheckpoint(): boolean {
    return localStorage.getItem(this.checkpointKey) !== null;
  }
}

export const checkpointService = new CheckpointService();

// ==================== 健康检查服务 ====================

interface HealthStatus {
  backend: boolean;
  lastChecked: number;
  latency?: number;
  error?: string;
}

class HealthCheckService {
  private status: HealthStatus = {
    backend: false,
    lastChecked: 0,
  };
  private listeners: Set<(status: HealthStatus) => void> = new Set();
  private checkInterval: NodeJS.Timeout | null = null;

  // 开始健康检查
  start(interval = 30000): void {
    this.check(interval);
    this.checkInterval = setInterval(() => this.check(interval), interval);
  }

  // 停止健康检查
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // 执行检查
  private async check(interval: number): Promise<void> {
    const start = Date.now();
    try {
      const response = await retryService.withRetry(() =>
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000'}/api/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      if (response.ok) {
        this.status = {
          backend: true,
          lastChecked: Date.now(),
          latency: Date.now() - start,
        };
      } else {
        this.status = {
          backend: false,
          lastChecked: Date.now(),
          error: `HTTP ${response.status}`,
        };
      }
    } catch (error) {
      this.status = {
        backend: false,
        lastChecked: Date.now(),
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }

    this.notifyListeners();
  }

  // 获取状态
  getStatus(): HealthStatus {
    return { ...this.status };
  }

  // 订阅状态变化
  subscribe(listener: (status: HealthStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.status));
  }
}

export const healthCheckService = new HealthCheckService();

// ==================== Hooks ====================

export function useWorkflowPersistence() {
  const workflows = useAgentWorkflowStore((s) => s.workflows);
  const saveWorkflows = useAgentWorkflowStore((s) => s.createWorkflow);
  const deleteWorkflow = useAgentWorkflowStore((s) => s.deleteWorkflow);

  // 监听工作流变化并持久化
  useEffect(() => {
    storageService.saveWorkflows(workflows);
  }, [workflows]);

  // 定期清理
  useEffect(() => {
    storageService.cleanup();
    const interval = setInterval(() => storageService.cleanup(), 24 * 60 * 60 * 1000); // 每天
    return () => clearInterval(interval);
  }, []);

  return { storageService };
}

export function useHealthCheck() {
  const [status, setStatus] = useState<HealthStatus>({
    backend: false,
    lastChecked: 0,
  });

  useEffect(() => {
    healthCheckService.start();
    const unsubscribe = healthCheckService.subscribe(setStatus);
    return () => {
      unsubscribe();
      healthCheckService.stop();
    };
  }, []);

  return status;
}

export function useExecutionHistory() {
  const [history, setHistory] = useState<Array<WorkflowExecution & { savedAt: number }>>([]);

  useEffect(() => {
    setHistory(storageService.loadExecutionHistory());
  }, []);

  const addToHistory = useCallback((execution: WorkflowExecution) => {
    storageService.saveExecutionHistory(execution);
    setHistory(storageService.loadExecutionHistory());
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem('agent-execution-history');
    setHistory([]);
  }, []);

  return { history, addToHistory, clearHistory };
}

import { useState } from 'react';

// ==================== 自动保存 Hook ====================

export function useAutoSave(
  workflow: WorkflowDefinition | null,
  interval = 10000
) {
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveKey = `auto-save-${workflow?.id}`;

  // 加载自动保存
  useEffect(() => {
    if (!workflow) return;
    const saved = localStorage.getItem(autoSaveKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 可以提示用户是否恢复
        console.log('找到自动保存:', new Date(parsed.timestamp));
      } catch (e) {
        // 忽略
      }
    }
  }, [workflow?.id, autoSaveKey]);

  // 定时保存
  useEffect(() => {
    if (!workflow) return;

    const intervalId = setInterval(() => {
      setIsSaving(true);
      try {
        localStorage.setItem(
          autoSaveKey,
          JSON.stringify({
            workflow,
            timestamp: Date.now(),
          })
        );
        setLastSaved(Date.now());
      } finally {
        setIsSaving(false);
      }
    }, interval);

    return () => clearInterval(intervalId);
  }, [workflow, autoSaveKey, interval]);

  // 清除自动保存
  const clearAutoSave = useCallback(() => {
    localStorage.removeItem(autoSaveKey);
    setLastSaved(null);
  }, [autoSaveKey]);

  return { lastSaved, isSaving, clearAutoSave };
}

// ==================== 状态同步 Hook ====================

interface SyncState {
  isOnline: boolean;
  lastSynced: number | null;
  pendingChanges: number;
}

export function useStateSync() {
  const [syncState, setSyncState] = useState<SyncState>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    lastSynced: null,
    pendingChanges: 0,
  });

  useEffect(() => {
    const handleOnline = () => {
      setSyncState((prev) => ({ ...prev, isOnline: true }));
    };

    const handleOffline = () => {
      setSyncState((prev) => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const markSynced = useCallback(() => {
    setSyncState((prev) => ({
      ...prev,
      lastSynced: Date.now(),
      pendingChanges: 0,
    }));
  }, []);

  const markPending = useCallback(() => {
    setSyncState((prev) => ({
      ...prev,
      pendingChanges: prev.pendingChanges + 1,
    }));
  }, []);

  return { ...syncState, markSynced, markPending };
}
