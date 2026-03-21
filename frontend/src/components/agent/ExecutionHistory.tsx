'use client';

import { memo, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
  Trash2,
  RotateCcw,
  Search,
  Calendar,
  Zap,
  Wrench,
  Brain,
  RefreshCw,
  Download,
} from 'lucide-react';

// 执行状态
export type ExecutionStatus = 'running' | 'completed' | 'error' | 'cancelled' | 'paused';

// 执行记录
export interface ExecutionRecord {
  id: string;
  taskId: string;
  taskName: string;
  status: ExecutionStatus;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  iterations: number;
  maxIterations: number;
  toolCalls: number;
  checkpoints: number;
  agentName: string;
  errorMessage?: string;
  metadata?: {
    model: string;
    tokensUsed?: number;
    cost?: number;
  };
}

// 模拟数据
const MOCK_EXECUTIONS: ExecutionRecord[] = [
  {
    id: 'exec_001',
    taskId: 'task_001',
    taskName: '搜索并总结最新 AI 新闻',
    status: 'completed',
    startedAt: Date.now() - 3600000,
    completedAt: Date.now() - 3500000,
    duration: 100000,
    iterations: 3,
    maxIterations: 10,
    toolCalls: 5,
    checkpoints: 3,
    agentName: 'research-agent',
    metadata: { model: 'claude-sonnet-4-6', tokensUsed: 2500, cost: 0.025 },
  },
  {
    id: 'exec_002',
    taskId: 'task_002',
    taskName: '分析销售数据并生成报告',
    status: 'completed',
    startedAt: Date.now() - 7200000,
    completedAt: Date.now() - 7000000,
    duration: 200000,
    iterations: 5,
    maxIterations: 10,
    toolCalls: 12,
    checkpoints: 5,
    agentName: 'data-analyst',
    metadata: { model: 'claude-sonnet-4-6', tokensUsed: 5200, cost: 0.052 },
  },
  {
    id: 'exec_003',
    taskId: 'task_003',
    taskName: '自动化测试执行',
    status: 'error',
    startedAt: Date.now() - 10800000,
    completedAt: Date.now() - 10700000,
    duration: 100000,
    iterations: 2,
    maxIterations: 10,
    toolCalls: 3,
    checkpoints: 2,
    agentName: 'test-runner',
    errorMessage: '测试超时：等待响应超过 30 秒',
    metadata: { model: 'claude-haiku-4-5', tokensUsed: 800, cost: 0.008 },
  },
  {
    id: 'exec_004',
    taskId: 'task_004',
    taskName: '代码重构优化',
    status: 'running',
    startedAt: Date.now() - 600000,
    iterations: 4,
    maxIterations: 10,
    toolCalls: 8,
    checkpoints: 4,
    agentName: 'code-optimizer',
    metadata: { model: 'claude-opus-4-6' },
  },
  {
    id: 'exec_005',
    taskId: 'task_005',
    taskName: '用户反馈分析',
    status: 'paused',
    startedAt: Date.now() - 1800000,
    iterations: 1,
    maxIterations: 10,
    toolCalls: 2,
    checkpoints: 1,
    agentName: 'sentiment-analyzer',
    metadata: { model: 'gpt-4o' },
  },
];

// 状态样式
const statusStyles: Record<ExecutionStatus, { color: string; bgColor: string; icon: React.ReactNode; label: string }> = {
  running: {
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    icon: <Loader2 size={14} className="animate-spin" />,
    label: '执行中',
  },
  completed: {
    color: 'text-[hsl(var(--success-500))]',
    bgColor: 'bg-[hsl(var(--success-500))/0.14]',
    icon: <CheckCircle2 size={14} />,
    label: '已完成',
  },
  error: {
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    icon: <XCircle size={14} />,
    label: '错误',
  },
  cancelled: {
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    icon: <AlertCircle size={14} />,
    label: '已取消',
  },
  paused: {
    color: 'text-[hsl(var(--warning-500))]',
    bgColor: 'bg-[hsl(var(--warning-500))/0.14]',
    icon: <Clock size={14} />,
    label: '已暂停',
  },
};

// 动画变体
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2 },
  },
};

// 执行项组件
interface ExecutionItemProps {
  record: ExecutionRecord;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  onViewDetails?: (record: ExecutionRecord) => void;
}

const ExecutionItem = memo(function ExecutionItem({
  record,
  onRestore,
  onDelete,
  onViewDetails,
}: ExecutionItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const status = statusStyles[record.status];

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <motion.div
      className="rounded-lg border bg-card overflow-hidden"
      variants={itemVariants}
      layout
    >
      {/* 主行 */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* 状态图标 */}
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${status.bgColor} ${status.color}`}>
          {status.icon}
          <span>{status.label}</span>
        </div>

        {/* 任务信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{record.taskName}</span>
            <span className="text-xs text-muted-foreground">by {record.agentName}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {formatTime(record.startedAt)}
            </span>
            {record.duration && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {formatDuration(record.duration)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Zap size={10} />
              {record.iterations}/{record.maxIterations} 迭代
            </span>
          </div>
        </div>

        {/* 统计 */}
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Wrench size={12} />
            {record.toolCalls}
          </span>
          <span className="flex items-center gap-1 text-[hsl(var(--accent-500))]">
            <RefreshCw size={12} />
            {record.checkpoints}
          </span>
        </div>

        {/* 操作 */}
        <div className="flex items-center gap-1">
          {(record.status === 'paused' || record.status === 'error') && onRestore && (
            <motion.button
              onClick={(e) => { e.stopPropagation(); onRestore(record.id); }}
              className="p-1.5 rounded hover:bg-muted text-primary"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="恢复执行"
            >
              <RotateCcw size={14} />
            </motion.button>
          )}
          <motion.button
            onClick={(e) => { e.stopPropagation(); onDelete?.(record.id); }}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="删除"
          >
            <Trash2 size={14} />
          </motion.button>
          <motion.div animate={{ rotate: isExpanded ? 90 : 0 }}>
            <ChevronRight size={16} className="text-muted-foreground" />
          </motion.div>
        </div>
      </div>

      {/* 展开详情 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t"
          >
            <div className="p-4 space-y-3 bg-muted/20">
              {/* 错误信息 */}
              {record.errorMessage && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertCircle size={14} />
                    错误信息
                  </div>
                  <p className="mt-1 text-xs">{record.errorMessage}</p>
                </div>
              )}

              {/* 详细信息网格 */}
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-xs text-muted-foreground">执行 ID</div>
                  <div className="font-mono text-xs truncate">{record.id}</div>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-xs text-muted-foreground">模型</div>
                  <div className="text-xs truncate">{record.metadata?.model || '-'}</div>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-xs text-muted-foreground">Tokens</div>
                  <div className="text-xs">{record.metadata?.tokensUsed?.toLocaleString() || '-'}</div>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-xs text-muted-foreground">成本</div>
                  <div className="text-xs">{record.metadata?.cost ? `$${record.metadata.cost.toFixed(4)}` : '-'}</div>
                </div>
              </div>

              {/* 进度条 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>执行进度</span>
                  <span>{record.iterations}/{record.maxIterations} 迭代</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${
                      record.status === 'completed' ? 'bg-[hsl(var(--success-500))]' :
                      record.status === 'error' ? 'bg-destructive' :
                      'bg-primary'
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${(record.iterations / record.maxIterations) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => onViewDetails?.(record)}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs border rounded-lg hover:bg-muted transition-colors"
                >
                  <Brain size={12} />
                  查看详情
                </button>
                <button
                  onClick={() => {
                    const data = JSON.stringify(record, null, 2);
                    const blob = new Blob([data], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `execution_${record.id}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center justify-center px-3 py-1.5 text-xs border rounded-lg hover:bg-muted transition-colors"
                >
                  <Download size={12} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// 主组件
interface ExecutionHistoryProps {
  className?: string;
}

export const ExecutionHistory = memo(function ExecutionHistory({
  className='',
}: ExecutionHistoryProps) {
  const [executions, setExecutions] = useState<ExecutionRecord[]>(MOCK_EXECUTIONS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | 'all'>('all');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all');

  // 过滤执行记录
  const filteredExecutions = useMemo(() => {
    return executions.filter((exec) => {
      // 搜索过滤
      const matchesSearch = searchQuery === '' ||
        exec.taskName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exec.agentName.toLowerCase().includes(searchQuery.toLowerCase());

      // 状态过滤
      const matchesStatus = statusFilter === 'all' || exec.status === statusFilter;

      // 日期过滤
      let matchesDate = true;
      const now = Date.now();
      if (dateRange === 'today') {
        matchesDate = now - exec.startedAt < 86400000;
      } else if (dateRange === 'week') {
        matchesDate = now - exec.startedAt < 604800000;
      } else if (dateRange === 'month') {
        matchesDate = now - exec.startedAt < 2592000000;
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [executions, searchQuery, statusFilter, dateRange]);

  // 统计
  const stats = useMemo(() => {
    const total = executions.length;
    const completed = executions.filter(e => e.status === 'completed').length;
    const failed = executions.filter(e => e.status === 'error').length;
    const running = executions.filter(e => e.status === 'running').length;
    const totalTokens = executions.reduce((sum, e) => sum + (e.metadata?.tokensUsed || 0), 0);
    const totalCost = executions.reduce((sum, e) => sum + (e.metadata?.cost || 0), 0);
    return { total, completed, failed, running, totalTokens, totalCost };
  }, [executions]);

  // 恢复执行
  const handleRestore = useCallback((id: string) => {
    setExecutions(prev => prev.map(e =>
      e.id === id ? { ...e, status: 'running' as ExecutionStatus } : e
    ));
  }, []);

  // 删除执行记录
  const handleDelete = useCallback((id: string) => {
    setExecutions(prev => prev.filter(e => e.id !== id));
  }, []);

  return (
    <motion.div
      className={`flex flex-col bg-background border rounded-xl overflow-hidden ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <History size={20} className="text-primary" />
          <span className="font-medium">执行历史</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{stats.completed}/{stats.total} 完成</span>
          <span>{stats.totalTokens.toLocaleString()} tokens</span>
          <span>${stats.totalCost.toFixed(3)}</span>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-3 p-4 border-b">
        <div className="text-center p-2 rounded-lg bg-muted/30">
          <div className="text-lg font-semibold">{stats.total}</div>
          <div className="text-xs text-muted-foreground">总执行</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-[hsl(var(--success-500))/0.14]">
          <div className="text-lg font-semibold text-[hsl(var(--success-500))]">{stats.completed}</div>
          <div className="text-xs text-muted-foreground">成功</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-destructive/10">
          <div className="text-lg font-semibold text-destructive">{stats.failed}</div>
          <div className="text-xs text-muted-foreground">失败</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-primary/10">
          <div className="text-lg font-semibold text-primary">{stats.running}</div>
          <div className="text-xs text-muted-foreground">运行中</div>
        </div>
      </div>

      {/* 过滤器 */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b">
        {/* 搜索 */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索任务..."
            className="w-full h-8 pl-8 pr-4 text-sm border rounded-lg bg-background"
          />
        </div>

        {/* 状态过滤 */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ExecutionStatus | 'all')}
          className="h-8 px-3 text-sm border rounded-lg bg-background"
        >
          <option value="all">所有状态</option>
          <option value="running">执行中</option>
          <option value="completed">已完成</option>
          <option value="error">错误</option>
          <option value="paused">已暂停</option>
        </select>

        {/* 日期过滤 */}
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
          className="h-8 px-3 text-sm border rounded-lg bg-background"
        >
          <option value="all">所有时间</option>
          <option value="today">今天</option>
          <option value="week">本周</option>
          <option value="month">本月</option>
        </select>
      </div>

      {/* 执行列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredExecutions.length > 0 ? (
          <motion.div
            className="space-y-3"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {filteredExecutions.map((exec) => (
              <ExecutionItem
                key={exec.id}
                record={exec}
                onRestore={handleRestore}
                onDelete={handleDelete}
              />
            ))}
          </motion.div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <History size={32} className="mb-2 opacity-50" />
            <p className="text-sm">没有找到匹配的执行记录</p>
          </div>
        )}
      </div>
    </motion.div>
  );
});

export default ExecutionHistory;
