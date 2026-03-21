'use client';

import { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Brain,
  Cpu,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  History,
  Wrench,
  GitBranch,
  PauseCircle,
  Play,
  RotateCcw,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Download,
  Info,
  AlertTriangle,
  CheckCircle,
  Terminal,
  Trash2,
  BarChart3,
  Timer,
  TrendingUp,
  Star,
  X,
  Search,
  RefreshCw,
} from 'lucide-react';
import AgentStatusIndicator, {
  AgentStatusPanel,
  AgentInfo
} from './AgentStatusIndicator';
import {
  ToolCallList,
  ToolCallInfo,
} from './ToolCallDisplay';
import {
  CheckpointTimeline
} from '../CheckpointTimeline';

// ============ 执行历史记录 ============

// 执行状态
export type ExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

// 工具使用统计
export interface ToolUsageStat {
  toolName: string;
  callCount: number;
  totalDuration: number; // ms
  successCount: number;
  failCount: number;
}

// 执行历史记录
export interface ExecutionHistoryRecord {
  id: string;
  taskTitle: string;          // 任务标题（取自第一条用户消息前30字）
  status: ExecutionStatus;
  startedAt: number;
  completedAt: number | null;
  duration: number;           // 耗时 ms
  toolCalls: ToolCallInfo[];
  thinkingSteps: ThinkingStep[];
  checkpoints: CheckpointData[];
  logs: LogEntry[];
  activeAgent: AgentInfo | null;
  allAgents: AgentInfo[];
  currentIteration: number;
  maxIterations: number;
  errorMessage?: string;
  success: boolean;           // 是否成功完成
  toolUsageStats: ToolUsageStat[];
}

// 思考过程步骤
export interface ThinkingStep {
  id: string;
  content: string;
  timestamp: number;
  type: 'thought' | 'decision' | 'action' | 'observation';
}

// 检查点数据
export interface CheckpointData {
  id: string;
  sessionId: string;
  timestamp: number;
  status: string;
  iteration: number;
  summary?: string;
}

// 日志级别
export type LogLevel = 'info' | 'warning' | 'error' | 'success';

// 日志条目
export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

// Agent 执行状态
export interface AgentExecutionState {
  status: ExecutionStatus;
  currentIteration: number;
  maxIterations: number;
  activeAgent: AgentInfo | null;
  allAgents: AgentInfo[];
  toolCalls: ToolCallInfo[];
  thinkingSteps: ThinkingStep[];
  checkpoints: CheckpointData[];
  currentCheckpointId?: string;
  startedAt?: number;
  completedAt?: number;
  errorMessage?: string;
  logs?: LogEntry[];
}

// ThinkProcessProps 接口
interface ThinkingProcessProps {
  steps: ThinkingStep[];
  maxHeight?: string;
}

// ============ 历史记录管理 Hook ============

const HISTORY_STORAGE_KEY = 'agent_execution_history';
const MAX_HISTORY_RECORDS = 50;
const HISTORY_EXPIRE_DAYS = 7;

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// 计算工具使用统计
function calculateToolUsageStats(toolCalls: ToolCallInfo[]): ToolUsageStat[] {
  const statsMap = new Map<string, ToolUsageStat>();

  for (const call of toolCalls) {
    const name = call.name || 'unknown';
    const existing = statsMap.get(name);
    const duration = call.result?.duration || 0;
    if (existing) {
      existing.callCount++;
      existing.totalDuration += duration;
      if (call.result?.success !== false) existing.successCount++;
      else existing.failCount++;
    } else {
      statsMap.set(name, {
        toolName: name,
        callCount: 1,
        totalDuration: duration,
        successCount: call.result?.success !== false ? 1 : 0,
        failCount: call.result?.success === false ? 1 : 0,
      });
    }
  }

  return Array.from(statsMap.values()).sort((a, b) => b.callCount - a.callCount);
}

// 加载历史记录
function loadHistory(): ExecutionHistoryRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const records: ExecutionHistoryRecord[] = JSON.parse(raw);
    const now = Date.now();
    const expireMs = HISTORY_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
    // 过滤过期记录
    return records.filter(r => now - r.startedAt < expireMs);
  } catch {
    return [];
  }
}

// 保存历史记录
function saveHistory(records: ExecutionHistoryRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = records.slice(0, MAX_HISTORY_RECORDS);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save execution history:', e);
  }
}

// 从执行状态创建历史记录
function createHistoryRecord(
  state: AgentExecutionState,
  taskTitle: string
): ExecutionHistoryRecord {
  const duration = state.startedAt && state.completedAt
    ? state.completedAt - state.startedAt
    : state.startedAt ? Date.now() - state.startedAt : 0;

  return {
    id: generateId(),
    taskTitle,
    status: state.status,
    startedAt: state.startedAt || Date.now(),
    completedAt: state.completedAt || null,
    duration,
    toolCalls: [...state.toolCalls],
    thinkingSteps: [...state.thinkingSteps],
    checkpoints: [...state.checkpoints],
    logs: [...(state.logs || [])],
    activeAgent: state.activeAgent,
    allAgents: [...state.allAgents],
    currentIteration: state.currentIteration,
    maxIterations: state.maxIterations,
    errorMessage: state.errorMessage,
    success: state.status === 'completed',
    toolUsageStats: calculateToolUsageStats(state.toolCalls),
  };
}

// 从执行状态快照创建历史记录（用于实时保存进行中的任务）
function createHistorySnapshot(
  state: AgentExecutionState,
  taskTitle: string,
  existingId?: string
): ExecutionHistoryRecord {
  return createHistoryRecord(state, taskTitle);
}

// ============ 执行统计 Hook ============

export interface ExecutionStats {
  totalExecutions: number;
  successCount: number;
  failCount: number;
  successRate: number;
  avgDuration: number;
  totalToolCalls: number;
  toolRanking: ToolUsageStat[];
}

// 计算执行统计
function calculateStats(records: ExecutionHistoryRecord[]): ExecutionStats {
  const completed = records.filter(r => r.status === 'completed' || r.status === 'error');
  const successCount = records.filter(r => r.status === 'completed').length;
  const failCount = records.filter(r => r.status === 'error').length;

  const durations = records.filter(r => r.duration > 0).map(r => r.duration);
  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  // 合并工具排行
  const toolMap = new Map<string, ToolUsageStat>();
  for (const record of records) {
    for (const stat of record.toolUsageStats) {
      const existing = toolMap.get(stat.toolName);
      if (existing) {
        existing.callCount += stat.callCount;
        existing.totalDuration += stat.totalDuration;
        existing.successCount += stat.successCount;
        existing.failCount += stat.failCount;
      } else {
        toolMap.set(stat.toolName, { ...stat });
      }
    }
  }

  const toolRanking = Array.from(toolMap.values())
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, 10);

  return {
    totalExecutions: records.length,
    successCount,
    failCount,
    successRate: records.length > 0 ? (successCount / records.length) * 100 : 0,
    avgDuration,
    totalToolCalls: records.reduce((sum, r) => sum + r.toolCalls.length, 0),
    toolRanking,
  };
}

// ============ useExecutionHistory Hook ============

function useExecutionHistory() {
  const [history, setHistory] = useState<ExecutionHistoryRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ExecutionHistoryRecord | null>(null);
  const [stats, setStats] = useState<ExecutionStats>({
    totalExecutions: 0,
    successCount: 0,
    failCount: 0,
    successRate: 0,
    avgDuration: 0,
    totalToolCalls: 0,
    toolRanking: [],
  });

  // 初始化加载
  useEffect(() => {
    const records = loadHistory();
    setHistory(records);
    setStats(calculateStats(records));
  }, []);

  // 添加记录
  const addRecord = useCallback((state: AgentExecutionState, taskTitle: string) => {
    const record = createHistoryRecord(state, taskTitle);
    setHistory(prev => {
      const updated = [record, ...prev].slice(0, MAX_HISTORY_RECORDS);
      saveHistory(updated);
      return updated;
    });
    setStats(prev => calculateStats([record, ...history]));
  }, [history]);

  // 删除记录
  const deleteRecord = useCallback((id: string) => {
    setHistory(prev => {
      const updated = prev.filter(r => r.id !== id);
      saveHistory(updated);
      setStats(calculateStats(updated));
      return updated;
    });
    if (selectedRecord?.id === id) {
      setSelectedRecord(null);
    }
  }, [selectedRecord]);

  // 清空历史
  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
    setStats({
      totalExecutions: 0,
      successCount: 0,
      failCount: 0,
      successRate: 0,
      avgDuration: 0,
      totalToolCalls: 0,
      toolRanking: [],
    });
    setSelectedRecord(null);
  }, []);

  // 选中记录
  const selectRecord = useCallback((record: ExecutionHistoryRecord | null) => {
    setSelectedRecord(record);
  }, []);

  // 导出单条记录
  const exportRecord = useCallback((record: ExecutionHistoryRecord) => {
    const data = {
      exportedAt: new Date().toISOString(),
      record: {
        ...record,
        startedAtISO: new Date(record.startedAt).toISOString(),
        completedAtISO: record.completedAt ? new Date(record.completedAt).toISOString() : null,
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `execution_${record.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // 导出全部历史
  const exportAllHistory = useCallback(() => {
    const data = {
      exportedAt: new Date().toISOString(),
      totalRecords: history.length,
      records: history.map(r => ({
        ...r,
        startedAtISO: new Date(r.startedAt).toISOString(),
        completedAtISO: r.completedAt ? new Date(r.completedAt).toISOString() : null,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `execution_history_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [history]);

  return {
    history,
    stats,
    selectedRecord,
    addRecord,
    deleteRecord,
    clearHistory,
    selectRecord,
    exportRecord,
    exportAllHistory,
  };
}

// ============ 面板属性 ============
interface AgentExecutionPanelProps {
  state: AgentExecutionState;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  onRestoreCheckpoint?: (checkpointId: string) => void;
  onDeleteCheckpoint?: (checkpointId: string) => void;
  onLog?: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  // 历史记录相关
  history?: ExecutionHistoryRecord[];
  stats?: ExecutionStats;
  onAddHistory?: (state: AgentExecutionState, taskTitle: string) => void;
  onDeleteHistory?: (id: string) => void;
  onClearHistory?: () => void;
  onSelectHistory?: (record: ExecutionHistoryRecord | null) => void;
  onExportHistory?: (record: ExecutionHistoryRecord) => void;
  onReExecute?: (record: ExecutionHistoryRecord) => void;
  className?: string;
}

// 动画变体
const panelVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' as const }
  },
  exit: {
    opacity: 0,
    y: 20,
    transition: { duration: 0.2 }
  }
} as const;

const sectionVariants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.25, ease: 'easeOut' as const }
  }
} as const;

// 思考步骤图标
const thinkingStepIcons = {
  thought: <Brain size={12} className="text-[hsl(var(--accent-500))]" />,
  decision: <GitBranch size={12} className="text-primary" />,
  action: <Zap size={12} className="text-[hsl(var(--warning-500))]" />,
  observation: <Clock size={12} className="text-[hsl(var(--success-500))]" />,
};

// 思考步骤标签
const thinkingStepLabels = {
  thought: '思考',
  decision: '决策',
  action: '行动',
  observation: '观察',
};

// 执行状态样式
const executionStatusStyles: Record<ExecutionStatus, { color: string; icon: React.ReactNode; label: string }> = {
  idle: { color: 'text-muted-foreground', icon: <PauseCircle size={16} />, label: '空闲' },
  running: { color: 'text-primary', icon: <Loader2 size={16} className="animate-spin" />, label: '执行中' },
  paused: { color: 'text-[hsl(var(--warning-500))]', icon: <PauseCircle size={16} />, label: '已暂停' },
  completed: { color: 'text-[hsl(var(--success-500))]', icon: <CheckCircle2 size={16} />, label: '已完成' },
  error: { color: 'text-destructive', icon: <AlertCircle size={16} />, label: '错误' },
};

// 日志级别配置
const logLevelConfig: Record<LogLevel, { icon: React.ReactNode; color: string; bgColor: string; borderColor: string; label: string }> = {
  info: {
    icon: <Info size={12} />,
    color: 'text-[hsl(var(--info-500))]',
    bgColor: 'bg-[hsl(var(--info-500))]/5',
    borderColor: 'border-[hsl(var(--info-500))]/30',
    label: '信息',
  },
  warning: {
    icon: <AlertTriangle size={12} />,
    color: 'text-[hsl(var(--warning-500))]',
    bgColor: 'bg-[hsl(var(--warning-500))]/5',
    borderColor: 'border-[hsl(var(--warning-500))]/30',
    label: '警告',
  },
  error: {
    icon: <AlertCircle size={12} />,
    color: 'text-destructive',
    bgColor: 'bg-destructive/5',
    borderColor: 'border-destructive/30',
    label: '错误',
  },
  success: {
    icon: <CheckCircle size={12} />,
    color: 'text-[hsl(var(--success-500))]',
    bgColor: 'bg-[hsl(var(--success-500))]/5',
    borderColor: 'border-[hsl(var(--success-500))]/30',
    label: '成功',
  },
};

const MAX_LOG_ENTRIES = 100;

// 日志面板组件
interface LogPanelProps {
  logs: LogEntry[];
  isExpanded: boolean;
  onToggle: () => void;
  onClear: () => void;
  onExport: () => void;
}

const LogPanel = memo(function LogPanel({
  logs,
  isExpanded,
  onToggle,
  onClear,
  onExport,
}: LogPanelProps) {
  const levelConfig = logLevelConfig;

  return (
    <div className="border-t">
      {/* 折叠头部 */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">执行日志</span>
          {logs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] text-muted-foreground">
              {logs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isExpanded && logs.length > 0 && (
            <>
              <motion.button
                onClick={(e) => { e.stopPropagation(); onExport(); }}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                title="导出日志"
              >
                <Download size={12} />
              </motion.button>
              <motion.button
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                title="清空日志"
              >
                <Trash2 size={12} />
              </motion.button>
            </>
          )}
          {isExpanded ? (
            <ChevronUp size={14} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={14} className="text-muted-foreground" />
          )}
        </div>
      </button>

      {/* 日志内容 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="h-48 overflow-y-auto p-2 space-y-1">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs">
                  <Terminal size={20} className="mb-1 opacity-40" />
                  <span>暂无日志记录</span>
                </div>
              ) : (
                logs.map((log) => {
                  const config = levelConfig[log.level];
                  return (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex items-start gap-2 px-2 py-1.5 rounded border text-xs ${config.bgColor} ${config.borderColor}`}
                    >
                      <div className={`shrink-0 mt-0.5 ${config.color}`}>
                        {config.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] font-medium ${config.color}`}>
                            [{config.label}]
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(log.timestamp).toLocaleTimeString('zh-CN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: false,
                            })}
                          </span>
                        </div>
                        <p className="text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                          {log.message}
                        </p>
                        {log.meta && Object.keys(log.meta).length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                              详情
                            </summary>
                            <pre className="mt-1 p-1.5 rounded bg-muted/50 text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(log.meta, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

const ThinkingProcess = memo(function ThinkingProcess({
  steps,
  maxHeight = '200px',
}: ThinkingProcessProps) {
  if (steps.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        暂无思考过程记录
      </div>
    );
  }

  return (
    <div
      className="space-y-2 overflow-y-auto"
      style={{ maxHeight }}
    >
      <AnimatePresence mode="popLayout">
        {steps.map((step, index) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-start gap-2 p-2 rounded-lg bg-muted/30"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted shrink-0">
              {thinkingStepIcons[step.type]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-medium">
                  {thinkingStepLabels[step.type]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(step.timestamp).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                {step.content}
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
});

// ============ 执行历史面板 ============

interface ExecutionHistoryPanelProps {
  history: ExecutionHistoryRecord[];
  selectedId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelect: (record: ExecutionHistoryRecord | null) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onExport: (record: ExecutionHistoryRecord) => void;
  onReExecute?: (record: ExecutionHistoryRecord) => void;
  onExportAll: () => void;
}

const ExecutionHistoryPanel = memo(function ExecutionHistoryPanel({
  history,
  selectedId,
  searchQuery,
  onSearchChange,
  onSelect,
  onDelete,
  onClear,
  onExport,
  onReExecute,
  onExportAll,
}: ExecutionHistoryPanelProps) {
  // 过滤历史记录
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const query = searchQuery.toLowerCase();
    return history.filter(r =>
      r.taskTitle.toLowerCase().includes(query) ||
      r.status.toLowerCase().includes(query) ||
      r.errorMessage?.toLowerCase().includes(query)
    );
  }, [history, searchQuery]);

  // 选中记录
  const selectedRecord = useMemo(() =>
    history.find(r => r.id === selectedId) || null,
    [history, selectedId]
  );

  // 格式化耗时
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) +
           ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-2">
      {/* 搜索和操作栏 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索历史记录..."
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-muted/50 rounded-md border border-transparent focus:border-primary/30 outline-none"
          />
        </div>
        {history.length > 0 && (
          <>
            <motion.button
              onClick={onExportAll}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="导出全部"
            >
              <Download size={14} />
            </motion.button>
            <motion.button
              onClick={onClear}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="清空历史"
            >
              <Trash2 size={14} />
            </motion.button>
          </>
        )}
      </div>

      {/* 历史列表 */}
      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {filteredHistory.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Clock size={24} className="mx-auto mb-2 opacity-50" />
            <p>{searchQuery ? '未找到匹配的历史记录' : '暂无执行历史'}</p>
          </div>
        ) : (
          filteredHistory.map((record) => {
            const statusStyle = executionStatusStyles[record.status];
            const isSelected = record.id === selectedId;
            return (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-primary/10 border-primary/30'
                    : 'bg-muted/30 border-transparent hover:bg-muted/50 hover:border-border'
                }`}
                onClick={() => onSelect(isSelected ? null : record)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`flex items-center gap-1 text-[10px] ${statusStyle.color}`}>
                        {statusStyle.icon}
                        {statusStyle.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(record.startedAt)}
                      </span>
                    </div>
                    <p className="text-xs truncate">{record.taskTitle}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Timer size={10} />
                        {formatDuration(record.duration)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Wrench size={10} />
                        {record.toolCalls.length}
                      </span>
                      {record.thinkingSteps.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Brain size={10} />
                          {record.thinkingSteps.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {onReExecute && (
                      <motion.button
                        onClick={(e) => { e.stopPropagation(); onReExecute(record); }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        title="重新执行"
                      >
                        <RefreshCw size={12} />
                      </motion.button>
                    )}
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); onExport(record); }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      title="导出"
                    >
                      <Download size={12} />
                    </motion.button>
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); onDelete(record.id); }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      title="删除"
                    >
                      <Trash2 size={12} />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* 详情面板 */}
      <AnimatePresence>
        {selectedRecord && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t pt-2 mt-2"
          >
            <div className="text-xs font-medium mb-2 flex items-center justify-between">
              <span>执行详情</span>
              <button
                onClick={() => onSelect(null)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">状态:</span>
                <span className={executionStatusStyles[selectedRecord.status].color}>
                  {executionStatusStyles[selectedRecord.status].label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">开始时间:</span>
                <span>{new Date(selectedRecord.startedAt).toLocaleString('zh-CN')}</span>
              </div>
              {selectedRecord.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">完成时间:</span>
                  <span>{new Date(selectedRecord.completedAt).toLocaleString('zh-CN')}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">总耗时:</span>
                <span>{formatDuration(selectedRecord.duration)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">迭代次数:</span>
                <span>{selectedRecord.currentIteration}/{selectedRecord.maxIterations}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">工具调用:</span>
                <span>{selectedRecord.toolCalls.length} 次</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">思考步骤:</span>
                <span>{selectedRecord.thinkingSteps.length} 步</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">检查点:</span>
                <span>{selectedRecord.checkpoints.length} 个</span>
              </div>
              {selectedRecord.errorMessage && (
                <div className="mt-1">
                  <span className="text-muted-foreground">错误信息:</span>
                  <p className="text-destructive mt-0.5">{selectedRecord.errorMessage}</p>
                </div>
              )}
              {selectedRecord.toolUsageStats.length > 0 && (
                <div className="mt-1">
                  <span className="text-muted-foreground">工具使用:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedRecord.toolUsageStats.slice(0, 5).map((stat, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                        {stat.toolName}: {stat.callCount}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ============ 执行统计面板 ============

interface ExecutionStatsPanelProps {
  stats: ExecutionStats;
}

const ExecutionStatsPanel = memo(function ExecutionStatsPanel({ stats }: ExecutionStatsPanelProps) {
  // 格式化耗时
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <div className="space-y-4">
      {/* 概览统计 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-lg bg-muted/30 border">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={14} className="text-primary" />
            <span className="text-xs text-muted-foreground">总执行次数</span>
          </div>
          <div className="text-xl font-bold">{stats.totalExecutions}</div>
        </div>

        <div className="p-3 rounded-lg bg-muted/30 border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-[hsl(var(--success-500))]" />
            <span className="text-xs text-muted-foreground">成功率</span>
          </div>
          <div className="text-xl font-bold text-[hsl(var(--success-500))]">
            {stats.successRate.toFixed(1)}%
          </div>
        </div>

        <div className="p-3 rounded-lg bg-muted/30 border">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={14} className="text-[hsl(var(--success-500))]" />
            <span className="text-xs text-muted-foreground">成功</span>
          </div>
          <div className="text-xl font-bold text-[hsl(var(--success-500))]">{stats.successCount}</div>
        </div>

        <div className="p-3 rounded-lg bg-muted/30 border">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={14} className="text-destructive" />
            <span className="text-xs text-muted-foreground">失败</span>
          </div>
          <div className="text-xl font-bold text-destructive">{stats.failCount}</div>
        </div>
      </div>

      {/* 平均执行时间 */}
      <div className="p-3 rounded-lg bg-muted/30 border">
        <div className="flex items-center gap-2 mb-2">
          <Timer size={14} className="text-[hsl(var(--warning-500))]" />
          <span className="text-xs text-muted-foreground">平均执行时间</span>
        </div>
        <div className="text-xl font-bold">{formatDuration(stats.avgDuration)}</div>
        <div className="text-[10px] text-muted-foreground mt-1">
          总工具调用: {stats.totalToolCalls} 次
        </div>
      </div>

      {/* 工具使用排行榜 */}
      {stats.toolRanking.length > 0 && (
        <div className="p-3 rounded-lg bg-muted/30 border">
          <div className="flex items-center gap-2 mb-2">
            <Star size={14} className="text-[hsl(var(--accent-500))]" />
            <span className="text-xs text-muted-foreground">工具使用排行榜</span>
          </div>
          <div className="space-y-1.5">
            {stats.toolRanking.map((stat, index) => {
              const maxCount = stats.toolRanking[0]?.callCount || 1;
              const percentage = (stat.callCount / maxCount) * 100;
              return (
                <div key={stat.toolName} className="flex items-center gap-2">
                  <span className="w-4 text-[10px] text-muted-foreground text-center">
                    {index + 1}
                  </span>
                  <span className="flex-1 text-xs truncate">{stat.toolName}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {stat.callCount} 次
                  </span>
                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stats.totalExecutions === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <BarChart3 size={24} className="mx-auto mb-2 opacity-50" />
          <p>暂无统计数据</p>
          <p className="text-xs mt-1">完成一些执行任务后查看统计</p>
        </div>
      )}
    </div>
  );
});

// 主面板组件
const AgentExecutionPanel = memo(function AgentExecutionPanel({
  state,
  onPause,
  onResume,
  onStop,
  onRetry,
  onRestoreCheckpoint,
  onDeleteCheckpoint,
  onLog,
  history = [],
  stats,
  onAddHistory,
  onDeleteHistory,
  onClearHistory,
  onSelectHistory,
  onExportHistory,
  onReExecute,
  className='',
}: AgentExecutionPanelProps) {
  const [activeSection, setActiveSection] = useState<'agents' | 'tools' | 'thinking' | 'checkpoints' | 'history' | 'stats'>('agents');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['agents']));
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [localLogs, setLocalLogs] = useState<LogEntry[]>(state.logs || []);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  // 内部历史 hook（如果外部没有传入历史记录）
  const internalHistory = useExecutionHistory();
  const effectiveHistory = history.length > 0 ? history : internalHistory.history;
  const effectiveStats = stats || internalHistory.stats;

  // 同步外部 logs 到本地
  useEffect(() => {
    if (state.logs) {
      setLocalLogs(state.logs);
    }
  }, [state.logs]);

  // 监听执行完成，自动保存历史
  useEffect(() => {
    if ((state.status === 'completed' || state.status === 'error') && state.startedAt) {
      // 从 toolCalls 或 thinkingSteps 提取任务标题
      const firstToolCall = state.toolCalls[0];
      const firstThought = state.thinkingSteps[0];
      const taskTitle = firstThought?.content?.slice(0, 30) ||
                       (firstToolCall?.params && JSON.stringify(firstToolCall.params).slice(0, 30)) ||
                       'Agent 任务';
      if (onAddHistory) {
        onAddHistory(state, taskTitle);
      } else {
        internalHistory.addRecord(state, taskTitle);
      }
    }
  }, [state.status, state.startedAt]);

  const statusStyle = executionStatusStyles[state.status];

  // 计算进度百分比
  const progressPercent = useMemo(() => {
    if (state.maxIterations === 0) return 0;
    return Math.round((state.currentIteration / state.maxIterations) * 100);
  }, [state.currentIteration, state.maxIterations]);

  // 切换展开状态
  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  // 格式化时间
  const formatDuration = (start?: number, end?: number) => {
    if (!start) return '--';
    const duration = (end || Date.now()) - start;
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // 添加日志条目（同时通知父组件）
  const addLogEntry = useCallback((level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      level,
      message,
      meta,
    };
    setLocalLogs(prev => {
      const updated = [entry, ...prev];
      return updated.length > MAX_LOG_ENTRIES ? updated.slice(0, MAX_LOG_ENTRIES) : updated;
    });
    if (onLog) {
      onLog({ level, message, meta });
    }
  }, [onLog]);

  // 清空日志
  const handleClearLogs = useCallback(() => {
    setLocalLogs([]);
  }, []);

  // 导出日志
  const handleExportLogs = useCallback(() => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      executionStatus: state.status,
      totalEntries: localLogs.length,
      logs: localLogs.map(log => ({
        ...log,
        timestampISO: new Date(log.timestamp).toISOString(),
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow_log_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [localLogs, state.status]);

  return (
    <motion.div
      className={`flex flex-col bg-background border rounded-xl overflow-hidden shadow-lg ${className}`}
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      layout
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Cpu size={18} className="text-primary" />
          <span className="font-medium text-sm">Agent 执行面板</span>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${statusStyle.color} bg-current/10`}>
            {statusStyle.icon}
            {statusStyle.label}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* 控制按钮 */}
          {state.status === 'running' && onPause && (
            <motion.button
              onClick={onPause}
              className="p-1.5 rounded-md hover:bg-muted text-[hsl(var(--warning-500))]"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="暂停"
            >
              <PauseCircle size={16} />
            </motion.button>
          )}
          {state.status === 'paused' && onResume && (
            <motion.button
              onClick={onResume}
              className="p-1.5 rounded-md hover:bg-muted text-primary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="继续"
            >
              <Play size={16} />
            </motion.button>
          )}
          {state.status === 'error' && onRetry && (
            <motion.button
              onClick={onRetry}
              className="p-1.5 rounded-md hover:bg-muted text-primary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="重试"
            >
              <RotateCcw size={16} />
            </motion.button>
          )}
          <motion.button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={isFullscreen ? '退出全屏' : '全屏'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </motion.button>
        </div>
      </div>

      {/* 进度条区域 */}
      <div className="px-3 py-2 border-b bg-muted/20">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">迭代进度</span>
            <span className="font-medium">{state.currentIteration}/{state.maxIterations}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {formatDuration(state.startedAt, state.completedAt)}
            </span>
            <span>{progressPercent}%</span>
          </div>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* 当前活动 Agent */}
      {state.activeAgent && (
        <div className="px-3 py-2 border-b">
          <div className="text-xs text-muted-foreground mb-1.5">当前活动 Agent</div>
          <AgentStatusIndicator agent={state.activeAgent} compact />
        </div>
      )}

      {/* 错误信息 */}
      {state.status === 'error' && state.errorMessage && (
        <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{state.errorMessage}</p>
          </div>
        </div>
      )}

      {/* 标签页导航 */}
      <div className="flex border-b">
        {[
          { id: 'agents', label: 'Agents', icon: <Bot size={14} />, count: state.allAgents.length },
          { id: 'tools', label: '工具', icon: <Wrench size={14} />, count: state.toolCalls.length },
          { id: 'thinking', label: '思考', icon: <Brain size={14} />, count: state.thinkingSteps.length },
          { id: 'checkpoints', label: '检查点', icon: <History size={14} />, count: state.checkpoints.length },
          { id: 'history', label: '历史', icon: <Clock size={14} />, count: effectiveHistory.length },
          { id: 'stats', label: '统计', icon: <BarChart3 size={14} />, count: 0 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as typeof activeSection)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeSection === tab.id
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px]">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-3" style={{ maxHeight: isFullscreen ? 'none' : '300px' }}>
        <AnimatePresence mode="wait">
          {activeSection === 'agents' && (
            <motion.div
              key="agents"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {state.allAgents.length > 0 ? (
                <AgentStatusPanel agents={state.allAgents} title="Agent 团队" compact />
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  暂无 Agent 信息
                </div>
              )}
            </motion.div>
          )}

          {activeSection === 'tools' && (
            <motion.div
              key="tools"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {state.toolCalls.length > 0 ? (
                <ToolCallList
                  toolCalls={state.toolCalls}
                  showTimestamp
                  maxHeight="250px"
                />
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  暂无工具调用记录
                </div>
              )}
            </motion.div>
          )}

          {activeSection === 'thinking' && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ThinkingProcess steps={state.thinkingSteps} maxHeight="250px" />
            </motion.div>
          )}

          {activeSection === 'checkpoints' && (
            <motion.div
              key="checkpoints"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {state.checkpoints.length > 0 ? (
                <CheckpointTimeline
                  checkpoints={state.checkpoints}
                  currentCheckpointId={state.currentCheckpointId}
                  onRestore={onRestoreCheckpoint || (() => {})}
                  onDelete={onDeleteCheckpoint}
                />
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <History size={24} className="mx-auto mb-2 opacity-50" />
                  <p>暂无检查点</p>
                  <p className="text-xs mt-1">执行任务时将自动创建检查点</p>
                </div>
              )}
            </motion.div>
          )}

          {activeSection === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ExecutionHistoryPanel
                history={effectiveHistory}
                selectedId={selectedHistoryId}
                searchQuery={historySearch}
                onSearchChange={setHistorySearch}
                onSelect={(record) => {
                  setSelectedHistoryId(record?.id || null);
                  if (onSelectHistory) onSelectHistory(record);
                  else internalHistory.selectRecord(record);
                }}
                onDelete={(id) => {
                  if (onDeleteHistory) onDeleteHistory(id);
                  else internalHistory.deleteRecord(id);
                }}
                onClear={() => {
                  if (onClearHistory) onClearHistory();
                  else internalHistory.clearHistory();
                }}
                onExport={(record) => {
                  if (onExportHistory) onExportHistory(record);
                  else internalHistory.exportRecord(record);
                }}
                onReExecute={onReExecute}
                onExportAll={() => internalHistory.exportAllHistory()}
              />
            </motion.div>
          )}

          {activeSection === 'stats' && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ExecutionStatsPanel stats={effectiveStats} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 日志面板 */}
      <LogPanel
        logs={localLogs}
        isExpanded={isLogExpanded}
        onToggle={() => setIsLogExpanded(v => !v)}
        onClear={handleClearLogs}
        onExport={handleExportLogs}
      />
    </motion.div>
  );
});

// 迷你执行状态指示器（用于消息中嵌入）
interface MiniExecutionIndicatorProps {
  status: ExecutionStatus;
  iteration?: number;
  maxIterations?: number;
  toolCount?: number;
  onClick?: () => void;
}

export const MiniExecutionIndicator = memo(function MiniExecutionIndicator({
  status,
  iteration,
  maxIterations,
  toolCount,
  onClick,
}: MiniExecutionIndicatorProps) {
  const style = executionStatusStyles[status];

  return (
    <motion.button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs bg-muted/50 hover:bg-muted transition-colors ${style.color}`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {style.icon}
      <span>{style.label}</span>
      {iteration !== undefined && maxIterations !== undefined && (
        <span className="text-muted-foreground">
          ({iteration}/{maxIterations})
        </span>
      )}
      {toolCount !== undefined && toolCount > 0 && (
        <span className="flex items-center gap-0.5 text-muted-foreground">
          <Wrench size={10} />
          {toolCount}
        </span>
      )}
    </motion.button>
  );
});

export default AgentExecutionPanel;
export { useExecutionHistory };
