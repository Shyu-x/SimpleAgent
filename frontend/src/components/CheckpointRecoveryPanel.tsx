'use client';

import React, { useState, useEffect, useCallback, startTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History,
  RefreshCw,
  Play,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Pause,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { API_ENDPOINTS } from '@/lib/apiConfig';

// API 基础路径
const API_BASE = API_ENDPOINTS.base;

// 状态枚举
const SessionStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ERROR: 'error',
  CHECKPOINT: 'checkpoint'
} as const;

// 类型定义
interface Session {
  id: string;
  task: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  checkpointsCount: number;
}

interface Checkpoint {
  id: string;
  createdAt: number;
  state: {
    iteration: number;
    status: string;
    toolResults: Array<{ tool: string; input: unknown; output: unknown }>;
    error?: string;
  };
  metadata: {
    iteration: number;
    toolCallsCount: number;
  };
}

interface SessionDetail extends Session {
  checkpoints: Checkpoint[];
  currentCheckpoint: string | null;
  metadata: {
    iterations: number;
    toolCalls: number;
    errors: number;
  };
}

// 状态图标和颜色映射
const statusConfig: Record<string, { icon: React.ReactNode; color: string; bgColor: string; label: string }> = {
  pending: { icon: <Clock size={16} />, color: 'text-muted-foreground', bgColor: 'bg-muted', label: '待执行' },
  running: { icon: <Loader2 size={16} className="animate-spin" />, color: 'text-primary', bgColor: 'bg-primary/10', label: '执行中' },
  paused: { icon: <Pause size={16} />, color: 'text-[hsl(var(--warning-500))]', bgColor: 'bg-[hsl(var(--warning-500))/0.14]', label: '已暂停' },
  completed: { icon: <CheckCircle size={16} />, color: 'text-[hsl(var(--success-500))]', bgColor: 'bg-[hsl(var(--success-500))/0.14]', label: '已完成' },
  error: { icon: <XCircle size={16} />, color: 'text-destructive', bgColor: 'bg-destructive/10', label: '错误' },
  checkpoint: { icon: <RefreshCw size={16} />, color: 'text-[hsl(var(--accent-500))]', bgColor: 'bg-[hsl(var(--accent-500))/0.16]', label: '已保存' }
};

/**
 * 检查点恢复面板
 */
export function CheckpointRecoveryPanel() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [recoverableSessions, setRecoverableSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  // 获取会话列表
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionsRes, recoverableRes] = await Promise.all([
        fetch(`${API_BASE}/enhanced-agent/persistence/sessions`),
        fetch(`${API_BASE}/enhanced-agent/persistence/recoverable`)
      ]);

      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        startTransition(() => {
          setSessions(data.sessions || []);
        });
      }

      if (recoverableRes.ok) {
        const data = await recoverableRes.json();
        startTransition(() => {
          setRecoverableSessions(data.recoverableSessions || []);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取会话列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 获取会话详情
  const fetchSessionDetail = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE}/enhanced-agent/status/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        startTransition(() => {
          setSelectedSession(data.status);
        });
      }
    } catch (err) {
      console.error('Failed to fetch session detail:', err);
    }
  }, []);

  // 从检查点恢复
  const handleRestore = useCallback(async (sessionId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/enhanced-agent/persistence/resume/${sessionId}`, {
        method: 'POST'
      });

      if (res.ok) {
        const data = await res.json();
        await fetchSessions();
      } else {
        const errData = await res.json();
        setError(errData.error || '恢复失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败');
    } finally {
      setLoading(false);
    }
  }, [fetchSessions]);

  // 删除会话
  const handleDelete = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE}/enhanced-agent/persistence/session/${sessionId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        await fetchSessions();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }, [fetchSessions]);

  // 切换展开状态
  const toggleExpand = useCallback((sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
        fetchSessionDetail(sessionId);
      }
      return next;
    });
  }, [fetchSessionDetail]);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 初始加载
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="bg-background rounded-xl shadow-lg border border-border">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <History className="text-primary" size={20} />
          <h2 className="text-lg font-semibold text-foreground">检查点恢复</h2>
        </div>
        <button
          onClick={fetchSessions}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-muted rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="p-4 bg-destructive/10 border-b border-destructive/30">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={16} />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* 可恢复会话提示 */}
      {recoverableSessions.length > 0 && (
        <div className="p-4 bg-[hsl(var(--warning-500))/0.14] border-b border-[hsl(var(--warning-500))/0.32]">
          <div className="flex items-center gap-2 text-[hsl(var(--warning-500))]">
            <AlertTriangle size={16} />
            <span className="text-sm font-medium">
              有 {recoverableSessions.length} 个可恢复的会话
            </span>
          </div>
        </div>
      )}

      {/* 会话列表 */}
      <div className="divide-y divide-border">
        {loading && sessions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 size={24} className="animate-spin mx-auto mb-2" />
            <p>加载中...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <History size={32} className="mx-auto mb-2 opacity-50" />
            <p>暂无历史会话</p>
            <p className="text-sm mt-1">执行 Agent 任务时将自动创建检查点</p>
          </div>
        ) : (
          <AnimatePresence>
            {sessions.map((session) => {
              const status = statusConfig[session.status] || statusConfig.pending;
              const isExpanded = expandedSessions.has(session.id);
              const isRecoverable = recoverableSessions.some(s => s.id === session.id);

              return (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-4"
                >
                  {/* 会话头部 */}
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => toggleExpand(session.id)}
                  >
                    <button className="text-muted-foreground hover:text-foreground">
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>

                    {/* 状态图标 */}
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${status.bgColor} ${status.color}`}>
                      {status.icon}
                      <span>{status.label}</span>
                    </div>

                    {/* 任务描述 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {session.task || '未命名任务'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(session.createdAt)} · {session.checkpointsCount} 个检查点
                      </p>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2">
                      {isRecoverable && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestore(session.id);
                          }}
                          disabled={loading}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
                        >
                          <Play size={14} />
                          恢复
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(session.id);
                        }}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* 展开的详情 */}
                  <AnimatePresence>
                    {isExpanded && selectedSession?.id === session.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 ml-8 p-4 bg-muted rounded-lg">
                          <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                            <div>
                              <span className="text-muted-foreground">迭代次数</span>
                              <p className="font-medium text-foreground">
                                {selectedSession.metadata?.iterations || 0}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">工具调用</span>
                              <p className="font-medium text-foreground">
                                {selectedSession.metadata?.toolCalls || 0}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">错误次数</span>
                              <p className="font-medium text-foreground">
                                {selectedSession.metadata?.errors || 0}
                              </p>
                            </div>
                          </div>

                          {/* 检查点列表 */}
                          {selectedSession.checkpoints && selectedSession.checkpoints.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                                检查点历史
                              </h4>
                              <div className="space-y-2">
                                {selectedSession.checkpoints.map((cp, index) => (
                                  <div
                                    key={cp.id}
                                    className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                                      cp.id === selectedSession.currentCheckpoint
                                        ? 'bg-primary/10 border border-primary/30'
                                        : 'bg-background border border-border'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">#{index + 1}</span>
                                      <span className="text-muted-foreground">
                                        迭代 {cp.metadata?.iteration || 0}
                                      </span>
                                      <span className="text-muted-foreground">
                                        {formatTime(cp.createdAt)}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => handleRestore(session.id)}
                                      className="px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"
                                    >
                                      恢复
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* 底部操作 */}
      <div className="p-4 border-t border-border">
        <button
          onClick={async () => {
            try {
              await fetch(`${API_BASE}/enhanced-agent/persistence/cleanup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ maxAgeDays: 7 })
              });
              fetchSessions();
            } catch (err) {
              console.error('Cleanup failed:', err);
            }
          }}
          className="text-sm text-muted-foreground hover:text-destructive transition-colors"
        >
          清理过期会话 (7天前)
        </button>
      </div>
    </div>
  );
}

/**
 * 简洁版检查点状态指示器
 */
export function CheckpointStatusBadge({
  count,
  onClick
}: {
  count: number;
  onClick?: () => void;
}) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 text-xs bg-[hsl(var(--accent-500))/0.16] text-[hsl(var(--accent-500))] rounded-full hover:bg-[hsl(var(--accent-500))/0.22] transition-colors"
    >
      <RefreshCw size={12} />
      {count} 个检查点
    </button>
  );
}

export default CheckpointRecoveryPanel;
