'use client';

import { useState, useCallback, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { API_ENDPOINTS } from '@/lib/apiConfig';

// 检查点类型
export const CheckpointType = {
  DECISION: 'decision',
  ACTION: 'action',
  DATA_ACCESS: 'data_access',
  HIGH_RISK: 'high_risk',
  COST_LIMIT: 'cost_limit'
};

// 检查点状态
export const CheckpointStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled'
};

interface Checkpoint {
  id: string;
  type: string;
  title: string;
  description?: string;
  status: string;
  createdAt: number;
  respondedAt?: number;
  response?: {
    option?: string;
    comment?: string;
    reason?: string;
  };
  options?: Array<{
    label: string;
    value: string;
  }>;
  context?: Record<string, any>;
}

interface CheckpointStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  timeout: number;
}

const API_BASE = API_ENDPOINTS.hitl;

export function useHumanInTheLoop() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCheckpoints, setPendingCheckpoints] = useState<Checkpoint[]>([]);
  const [history, setHistory] = useState<Checkpoint[]>([]);
  const [stats, setStats] = useState<CheckpointStats | null>(null);

  // 获取待处理检查点
  const fetchPending = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/pending`);
      const data = await response.json();
      if (data.success) {
        setPendingCheckpoints(data.checkpoints);
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch pending checkpoints';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 创建检查点
  const createCheckpoint = useCallback(async (config: {
    type?: string;
    title: string;
    description?: string;
    context?: Record<string, any>;
    options?: Array<{ label: string; value: string }>;
    timeout?: number;
    required?: boolean;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await response.json();
      if (data.success) {
        await fetchPending();
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create checkpoint';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [fetchPending]);

  // 批准检查点
  const approveCheckpoint = useCallback(async (
    checkpointId: string,
    option?: string,
    comment?: string
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/checkpoint/${checkpointId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option, comment })
      });
      const data = await response.json();
      if (data.success) {
        await fetchPending();
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve checkpoint';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [fetchPending]);

  // 拒绝检查点
  const rejectCheckpoint = useCallback(async (
    checkpointId: string,
    reason?: string
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/checkpoint/${checkpointId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const data = await response.json();
      if (data.success) {
        await fetchPending();
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject checkpoint';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [fetchPending]);

  // 请求确认（创建并等待）
  const requestConfirmation = useCallback(async (config: {
    type?: string;
    title: string;
    description?: string;
    context?: Record<string, any>;
    options?: Array<{ label: string; value: string }>;
    timeout?: number;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request confirmation';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 获取历史记录
  const fetchHistory = useCallback(async (limit = 50) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/history?limit=${limit}`);
      const data = await response.json();
      if (data.success) {
        setHistory(data.history);
      }
      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch history' };
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

  // 清除所有待处理检查点
  const clearPending = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/clear`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        setPendingCheckpoints([]);
      }
      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to clear' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 定期轮询待处理检查点
  useEffect(() => {
    fetchPending();
    fetchStats();

    // 每30秒轮询一次
    const interval = setInterval(() => {
      fetchPending();
      fetchStats();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchPending, fetchStats]);

  return {
    isLoading,
    error,
    pendingCheckpoints,
    history,
    stats,
    fetchPending,
    createCheckpoint,
    approveCheckpoint,
    rejectCheckpoint,
    requestConfirmation,
    fetchHistory,
    fetchStats,
    clearPending
  };
}

// 检查点确认弹窗组件
import { motion, AnimatePresence } from 'framer-motion';

interface CheckpointModalProps {
  checkpoint: Checkpoint | null;
  onApprove: (option?: string, comment?: string) => void;
  onReject: (reason?: string) => void;
  isLoading?: boolean;
}

export function CheckpointModal({
  checkpoint,
  onApprove,
  onReject,
  isLoading = false
}: CheckpointModalProps) {
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [comment, setComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  if (!checkpoint) return null;

  const handleApprove = () => {
    onApprove(selectedOption || undefined, comment || undefined);
  };

  const handleReject = () => {
    if (showRejectInput) {
      onReject(rejectReason || undefined);
    } else {
      setShowRejectInput(true);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-md bg-background rounded-xl shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 border-b border-border bg-[hsl(var(--warning-500))/0.14]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[hsl(var(--warning-500))]" />
              <h3 className="font-semibold text-lg">需要确认</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {checkpoint.title}
            </p>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {checkpoint.description && (
              <p className="text-sm text-muted-foreground">
                {checkpoint.description}
              </p>
            )}

            {/* Options */}
            {checkpoint.options && checkpoint.options.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">选择选项：</label>
                <div className="space-y-2">
                  {checkpoint.options.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-muted/80"
                    >
                      <input
                        type="radio"
                        name="checkpointOption"
                        value={opt.value}
                        checked={selectedOption === opt.value}
                        onChange={(e) => setSelectedOption(e.target.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Comment */}
            <div>
              <label className="text-sm font-medium">备注（可选）：</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-background"
                rows={2}
                placeholder="添加备注..."
              />
            </div>

            {/* Reject Input */}
            {showRejectInput && (
              <div>
                <label className="text-sm font-medium text-destructive">拒绝原因：</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-destructive/30 rounded-lg text-sm bg-background"
                  rows={2}
                  placeholder="请输入拒绝原因..."
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-border flex gap-2">
            <button
              onClick={handleReject}
              disabled={isLoading}
              className="flex-1 px-4 py-2 border border-destructive/30 text-destructive rounded-lg hover:bg-destructive/20 disabled:opacity-50"
            >
              {showRejectInput ? '确认拒绝' : '拒绝'}
            </button>
            <button
              onClick={handleApprove}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-[hsl(var(--success-500))] text-primary-foreground rounded-lg hover:bg-[hsl(var(--success-600))] disabled:opacity-50"
            >
              批准
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
