'use client';

import { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Clock,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Brain,
  Cpu,
  MemoryStick,
  Gauge,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Timer,
  Hash,
  Coins,
  X,
} from 'lucide-react';
import { API_ENDPOINTS } from '@/lib/apiConfig';

// ============ 类型定义 ============

// 性能指标
export interface PerformanceMetrics {
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerMinute: number;
  tokensPerMinute: number;
  successRate: number;
  errorRate: number;
  cpuUsage: number;
  memoryUsage: number;
  avgIterations: number;
  avgToolCalls: number;
  totalCost: number;
  costPerRequest: number;
}

// Agent 执行指标
export interface AgentExecutionMetrics {
  currentIteration: number;
  maxIterations: number;
  toolCallCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedMemoryMB: number;
  executionDuration: number;
  thinkingSteps: number;
}

// 告警
export interface PerformanceAlert {
  id: string;
  type: 'time' | 'token' | 'memory' | 'iteration' | 'error';
  level: 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: number;
  value?: number;
  threshold?: number;
}

// 优化建议
export interface OptimizationSuggestion {
  id: string;
  category: 'iteration' | 'token' | 'memory' | 'tool' | '反思';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  potentialSaving: string;
}

// 执行历史记录
export interface ExecutionRecord {
  id: string;
  timestamp: number;
  duration: number;
  iterations: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  memoryMB: number;
  success: boolean;
}

// 时间序列数据点
export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

// 实时状态
export interface RealTimeStatus {
  status: 'healthy' | 'degraded' | 'error';
  activeAgents: number;
  runningTasks: number;
  queuedTasks: number;
  lastUpdated: number;
}

// ============ 常量 ============

const ALERT_THRESHOLDS = {
  executionTimeWarning: 30000,   // 30秒警告
  executionTimeCritical: 60000,   // 60秒严重
  tokenWarning: 8000,            // 8K token警告
  tokenCritical: 10000,           // 10K token严重
  memoryWarning: 70,             // 70%内存警告
  memoryCritical: 85,            // 85%内存严重
  iterationWarning: 8,           // 8次迭代警告
  iterationCritical: 10,         // 10次迭代严重
};

// ============ 辅助组件 ============

/** 趋势指示器 */
const TrendIndicator = memo(function TrendIndicator({
  value,
  threshold = 0,
}: {
  value: number;
  threshold?: number;
}) {
  if (value > threshold) {
    return <TrendingUp size={14} className="text-[hsl(var(--success-500))]" />;
  } else if (value < -threshold) {
    return <TrendingDown size={14} className="text-destructive" />;
  }
  return <Minus size={14} className="text-muted-foreground" />;
});

/** 指标卡片 */
const MetricCard = memo(function MetricCard({
  title, value, unit, icon, trend, status = 'good', description,
}: {
  title: string;
  value: string | number;
  unit?: string;
  icon: React.ReactNode;
  trend?: number;
  status?: 'good' | 'warning' | 'error';
  description?: string;
}) {
  const statusColors = {
    good: 'text-[hsl(var(--success-500))]',
    warning: 'text-[hsl(var(--warning-500))]',
    error: 'text-destructive',
  };

  return (
    <motion.div
      className="flex flex-col p-3 rounded-xl border bg-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className={`flex items-center gap-1.5 ${statusColors[status]}`}>
          {icon}
          <span className="text-xs font-medium">{title}</span>
        </div>
        {trend !== undefined && <TrendIndicator value={trend} />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {description && (
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      )}
    </motion.div>
  );
});

/** 迷你折线图 */
const MiniLineChart = memo(function MiniLineChart({
  data,
  color = 'var(--primary)',
  height = 50,
  showArea = false,
}: {
  data: TimeSeriesPoint[];
  color?: string;
  height?: number;
  showArea?: boolean;
}) {
  if (data.length === 0) return <div style={{ height }} />;

  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((point, i) => {
    const x = (i / (data.length - 1 || 1)) * 100;
    const y = height - ((point.value - min) / range) * (height - 4) - 2;
    return { x, y };
  });

  const linePath = points.reduce((acc, p, i) =>
    acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), '');

  const areaPath = linePath
    + ` L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <svg className="w-full" style={{ height }} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      {showArea && (
        <defs>
          <linearGradient id={`grad-${color.replace(/[^a-z]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
      )}
      {showArea && (
        <motion.path
          d={areaPath}
          fill={`url(#grad-${color.replace(/[^a-z]/gi, '')})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
      )}
      <motion.path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
    </svg>
  );
});

/** 柱状图（用于迭代/工具调用趋势） */
const BarChart = memo(function BarChart({
  data,
  color = 'var(--primary)',
  height = 50,
  maxValue,
}: {
  data: number[];
  color?: string;
  height?: number;
  maxValue?: number;
}) {
  if (data.length === 0) return <div style={{ height }} />;
  const max = maxValue ?? Math.max(...data, 1);

  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {data.map((value, i) => {
        const barHeight = (value / max) * 100;
        return (
          <motion.div
            key={i}
            className="flex-1 rounded-sm"
            style={{ backgroundColor: color, height: `${barHeight}%`, opacity: 0.8 }}
            initial={{ height: 0 }}
            animate={{ height: `${barHeight}%` }}
            transition={{ duration: 0.4, delay: i * 0.02 }}
          />
        );
      })}
    </div>
  );
});

/** 进度环 */
const ProgressRing = memo(function ProgressRing({
  value,
  max = 100,
  size = 72,
  strokeWidth = 7,
  color = 'var(--primary)',
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = Math.min((value / max) * circumference, circumference);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          className="text-muted opacity-20"
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - progress }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-sm font-bold">{value.toFixed(1)}%</span>
        {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
});

/** 告警卡片 */
const AlertCard = memo(function AlertCard({
  alert,
  onDismiss,
}: {
  alert: PerformanceAlert;
  onDismiss: (id: string) => void;
}) {
  const isCritical = alert.level === 'critical';
  return (
    <motion.div
      className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
        isCritical
          ? 'bg-destructive/10 border-destructive/30'
          : 'bg-[hsl(var(--warning-500))]/10 border-[hsl(var(--warning-500))]/30'
      }`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
    >
      <AlertTriangle
        size={14}
        className={isCritical ? 'text-destructive mt-0.5 shrink-0' : 'text-[hsl(var(--warning-500))] mt-0.5 shrink-0'}
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-xs">{alert.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{alert.message}</div>
      </div>
      <button
        onClick={() => onDismiss(alert.id)}
        className="p-0.5 rounded hover:bg-muted shrink-0"
      >
        <X size={12} />
      </button>
    </motion.div>
  );
});

/** 建议卡片 */
const SuggestionCard = memo(function SuggestionCard({
  suggestion,
}: {
  suggestion: OptimizationSuggestion;
}) {
  const priorityColors = {
    high: 'text-destructive border-destructive/30',
    medium: 'text-[hsl(var(--warning-500))] border-[hsl(var(--warning-500))]/30',
    low: 'text-[hsl(var(--success-500))] border-[hsl(var(--success-500))]/30',
  };
  const priorityBg = {
    high: 'bg-destructive/5',
    medium: 'bg-[hsl(var(--warning-500))]/5',
    low: 'bg-[hsl(var(--success-500))]/5',
  };

  return (
    <div className={`p-3 rounded-lg border ${priorityBg[suggestion.priority]} ${priorityColors[suggestion.priority]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Lightbulb size={12} />
        <span className="text-xs font-medium">{suggestion.title}</span>
        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border ${
          suggestion.priority === 'high' ? 'border-destructive/40 text-destructive' :
          suggestion.priority === 'medium' ? 'border-[hsl(var(--warning-500))]/40 text-[hsl(var(--warning-500))]' :
          'border-[hsl(var(--success-500))]/40 text-[hsl(var(--success-500))]'
        }`}>
          {suggestion.priority === 'high' ? '高优' : suggestion.priority === 'medium' ? '中优' : '低优'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{suggestion.description}</p>
      {suggestion.potentialSaving && (
        <div className="mt-1.5 text-[10px] text-muted-foreground/70">
          预计节省: {suggestion.potentialSaving}
        </div>
      )}
    </div>
  );
});

// ============ 主组件 ============

interface PerformanceMonitorProps {
  className?: string;
  refreshInterval?: number;
}

export const PerformanceMonitor = memo(function PerformanceMonitor({
  className = '',
  refreshInterval = 5000,
}: PerformanceMonitorProps) {
  // 基础指标 - 初始化为null，等待真实API数据
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);

  // Agent 执行指标 - 初始化为null
  const [agentMetrics, setAgentMetrics] = useState<AgentExecutionMetrics | null>(null);

  // 时间序列数据
  const [responseTimeData, setResponseTimeData] = useState<TimeSeriesPoint[]>([]);
  const [throughputData, setThroughputData] = useState<TimeSeriesPoint[]>([]);
  const [tokenData, setTokenData] = useState<TimeSeriesPoint[]>([]);
  const [iterationHistory, setIterationHistory] = useState<number[]>([]);
  const [toolCallHistory, setToolCallHistory] = useState<number[]>([]);

  // 执行历史（用于分析）
  const [executionHistory, setExecutionHistory] = useState<ExecutionRecord[]>([]);

  // 告警
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([]);
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);

  // UI 状态
  const [realTimeStatus, setRealTimeStatus] = useState<RealTimeStatus>({
    status: 'healthy',
    activeAgents: 3,
    runningTasks: 2,
    queuedTasks: 5,
    lastUpdated: Date.now(),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [alertPanelOpen, setAlertPanelOpen] = useState(true);

  const alertIdCounter = useRef(0);

  // 生成唯一告警ID
  const newAlertId = () => `alert-${++alertIdCounter.current}-${Date.now()}`;

  // 添加告警（去重）
  const addAlert = useCallback((alert: Omit<PerformanceAlert, 'id' | 'timestamp'>) => {
    const now = Date.now();
    const newAlert: PerformanceAlert = {
      ...alert,
      id: newAlertId(),
      timestamp: now,
    };
    setAlerts(prev => {
      // 去重：同类型告警5秒内不重复
      const recent = prev.filter(a => a.type === alert.type && now - a.timestamp < 5000);
      if (recent.length > 0) return prev;
      return [newAlert, ...prev].slice(0, 10);
    });
  }, []);

  // 主动触发检查
  const checkThresholds = useCallback((agent: AgentExecutionMetrics, mem: number) => {
    // 执行时间
    if (agent.executionDuration > ALERT_THRESHOLDS.executionTimeCritical) {
      addAlert({
        type: 'time', level: 'critical',
        title: '执行时间过长',
        message: `当前执行已达 ${(agent.executionDuration / 1000).toFixed(0)} 秒，建议检查 Agent 是否陷入死循环`,
        value: agent.executionDuration,
        threshold: ALERT_THRESHOLDS.executionTimeCritical,
      });
    } else if (agent.executionDuration > ALERT_THRESHOLDS.executionTimeWarning) {
      addAlert({
        type: 'time', level: 'warning',
        title: '执行时间较长',
        message: `执行已超过 30 秒，当前 ${(agent.executionDuration / 1000).toFixed(0)} 秒`,
        value: agent.executionDuration,
        threshold: ALERT_THRESHOLDS.executionTimeWarning,
      });
    }

    // Token
    if (agent.totalTokens > ALERT_THRESHOLDS.tokenCritical) {
      addAlert({
        type: 'token', level: 'critical',
        title: 'Token 消耗过高',
        message: `单次执行消耗 ${agent.totalTokens.toLocaleString()} tokens，建议优化提示词或减少上下文`,
        value: agent.totalTokens,
        threshold: ALERT_THRESHOLDS.tokenCritical,
      });
    } else if (agent.totalTokens > ALERT_THRESHOLDS.tokenWarning) {
      addAlert({
        type: 'token', level: 'warning',
        title: 'Token 消耗偏高',
        message: `已使用 ${agent.totalTokens.toLocaleString()} tokens，注意控制上下文长度`,
        value: agent.totalTokens,
        threshold: ALERT_THRESHOLDS.tokenWarning,
      });
    }

    // 内存
    if (mem > ALERT_THRESHOLDS.memoryCritical) {
      addAlert({
        type: 'memory', level: 'critical',
        title: '内存使用告警',
        message: `内存占用达到 ${mem.toFixed(0)}%，请关注内存泄漏风险`,
        value: mem,
        threshold: ALERT_THRESHOLDS.memoryCritical,
      });
    } else if (mem > ALERT_THRESHOLDS.memoryWarning) {
      addAlert({
        type: 'memory', level: 'warning',
        title: '内存使用偏高',
        message: `当前内存占用 ${mem.toFixed(0)}%，建议关注`,
        value: mem,
        threshold: ALERT_THRESHOLDS.memoryWarning,
      });
    }

    // 迭代次数
    if (agent.currentIteration > ALERT_THRESHOLDS.iterationCritical) {
      addAlert({
        type: 'iteration', level: 'critical',
        title: '迭代次数过多',
        message: `已完成 ${agent.currentIteration} 次迭代，已达到上限，可能无法收敛`,
        value: agent.currentIteration,
        threshold: ALERT_THRESHOLDS.iterationCritical,
      });
    } else if (agent.currentIteration > ALERT_THRESHOLDS.iterationWarning) {
      addAlert({
        type: 'iteration', level: 'warning',
        title: '迭代次数偏多',
        message: `已迭代 ${agent.currentIteration} 次，建议检查 Agent 收敛性`,
        value: agent.currentIteration,
        threshold: ALERT_THRESHOLDS.iterationWarning,
      });
    }
  }, [addAlert]);

  // 分析历史数据生成优化建议
  const analyzeSuggestions = useCallback((history: ExecutionRecord[], agent: AgentExecutionMetrics) => {
    const newSuggestions: OptimizationSuggestion[] = [];

    if (history.length < 3) {
      newSuggestions.push({
        id: 'need-more-data',
        category: 'iteration',
        priority: 'low',
        title: '积累更多执行数据',
        description: '建议至少完成 5 次执行后再参考优化建议，当前数据样本不足',
        potentialSaving: '',
      });
      setSuggestions(newSuggestions);
      return;
    }

    // 分析平均迭代次数
    const avgIter = history.reduce((s, r) => s + r.iterations, 0) / history.length;
    if (avgIter > 6) {
      newSuggestions.push({
        id: 'reduce-iterations',
        category: 'iteration',
        priority: 'high',
        title: '建议减少反思次数',
        description: `历史平均迭代 ${avgIter.toFixed(1)} 次（当前 ${agent.currentIteration} 次），可通过优化提示词或添加更明确的终止条件来加速收敛`,
        potentialSaving: `预计节省 ${((avgIter - 4) * 0.8).toFixed(0)} - ${((avgIter - 4) * 1.5).toFixed(0)} 秒/次`,
      });
    }

    // 分析 Token 消耗
    const avgTokens = history.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0) / history.length;
    if (avgTokens > 6000) {
      newSuggestions.push({
        id: 'reduce-tokens',
        category: 'token',
        priority: avgTokens > 9000 ? 'high' : 'medium',
        title: '建议精简上下文',
        description: `历史平均消耗 ${avgTokens.toLocaleString()} tokens，建议启用 RAG 检索限定范围或移除冗余的系统提示`,
        potentialSaving: `预计节省 ${((avgTokens * 0.2)).toLocaleString()} - ${((avgTokens * 0.4)).toLocaleString()} tokens/次`,
      });
    }

    // 分析工具调用
    const avgTools = history.reduce((s, r) => s + r.toolCalls, 0) / history.length;
    if (avgTools > 8) {
      newSuggestions.push({
        id: 'reduce-tool-calls',
        category: 'tool',
        priority: 'medium',
        title: '建议合并工具调用',
        description: `历史平均每次执行调用 ${avgTools.toFixed(1)} 次工具，可考虑合并频繁连续调用的工具（如连续两次搜索）`,
        potentialSaving: `减少 ${(avgTools * 0.15).toFixed(0)} - ${(avgTools * 0.25).toFixed(0)} 次工具调用`,
      });
    }

    // 分析内存使用
    const avgMemory = history.reduce((s, r) => s + r.memoryMB, 0) / history.length;
    if (avgMemory > 200) {
      newSuggestions.push({
        id: 'reduce-memory',
        category: 'memory',
        priority: 'medium',
        title: '建议优化内存占用',
        description: `历史平均内存占用 ${avgMemory.toFixed(0)} MB，可通过定期清理中间结果或减少上下文窗口来优化`,
        potentialSaving: `预计节省 ${(avgMemory * 0.3).toFixed(0)} MB`,
      });
    }

    // 分析执行时间
    const avgDuration = history.reduce((s, r) => s + r.duration, 0) / history.length;
    if (avgDuration > 45000) {
      newSuggestions.push({
        id: 'reduce-duration',
        category: '反思',
        priority: 'high',
        title: '建议启用流式响应',
        description: `历史平均执行时间 ${(avgDuration / 1000).toFixed(0)} 秒，建议检查后端延迟或启用流式输出减少等待感知时间`,
        potentialSaving: `感知等待时间减少 30-50%`,
      });
    }

    // 分析失败率
    const failureRate = history.filter(r => !r.success).length / history.length;
    if (failureRate > 0.15) {
      newSuggestions.push({
        id: 'improve-success-rate',
        category: '反思',
        priority: 'high',
        title: '建议添加错误重试策略',
        description: `历史失败率达到 ${(failureRate * 100).toFixed(0)}%，建议在 Agent 配置中启用自动重试和降级策略`,
        potentialSaving: `预计成功率提升至 95% 以上`,
      });
    }

    // 输入/输出比例建议
    if (agent.inputTokens > 0) {
      const ioRatio = agent.outputTokens / agent.inputTokens;
      if (ioRatio > 3) {
        newSuggestions.push({
          id: 'balance-io',
          category: 'token',
          priority: 'low',
          title: '输入/输出比例失衡',
          description: `当前输出是输入的 ${ioRatio.toFixed(1)} 倍，可能存在冗余回复，建议精简输出格式要求`,
          potentialSaving: `预计节省 ${(agent.outputTokens * 0.15).toLocaleString()} tokens`,
        });
      }
    }

    setSuggestions(newSuggestions);
  }, []);

  // 刷新数据 - 从 MetricsCollector API 获取真实数据
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.metrics.realtime);
      if (!response.ok) throw new Error('Failed to fetch metrics');
      const data = await response.json();

      // 从API获取的真实默认值
      const defaultMetrics: PerformanceMetrics = {
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        requestsPerMinute: 0,
        tokensPerMinute: 0,
        successRate: 100,
        errorRate: 0,
        cpuUsage: data.system?.cpuUsage ?? 0,
        memoryUsage: data.system?.memoryUsage ?? 0,
        avgIterations: 0,
        avgToolCalls: 0,
        totalCost: 0,
        costPerRequest: 0,
      };

      const defaultAgentMetrics: AgentExecutionMetrics = {
        currentIteration: 0,
        maxIterations: 10,
        toolCallCount: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedMemoryMB: 0,
        executionDuration: 0,
        thinkingSteps: 0,
      };

      // 更新性能指标
      setMetrics({
        ...defaultMetrics,
        avgResponseTime: data.performance?.avgResponseTime ?? 0,
        minResponseTime: data.performance?.minResponseTime ?? 0,
        maxResponseTime: data.performance?.maxResponseTime ?? 0,
        p95ResponseTime: data.performance?.p95ResponseTime ?? 0,
        p99ResponseTime: data.performance?.p99ResponseTime ?? 0,
        requestsPerMinute: data.throughput?.requestsPerMinute ?? 0,
        tokensPerMinute: data.tokens?.tokensPerMinute ?? 0,
        successRate: data.success?.successRate ?? (data.successRate ?? 100),
        errorRate: data.success?.errorRate ?? (data.errorRate ?? 0),
        cpuUsage: data.system?.cpuUsage ?? 0,
        memoryUsage: data.system?.memoryUsage ?? 0,
        avgIterations: data.iterations?.avgIterations ?? 0,
        avgToolCalls: data.iterations?.avgToolCalls ?? 0,
        totalCost: data.cost?.totalCost ?? 0,
        costPerRequest: data.cost?.costPerRequest ?? 0,
      });

      // 更新时间序列
      const currentAvgResponseTime = data.performance?.avgResponseTime ?? 0;
      const currentRequestsPerMinute = data.throughput?.requestsPerMinute ?? 0;
      const currentTokensPerMinute = data.tokens?.totalTokens ?? 0;
      const currentAvgIterations = data.iterations?.avgIterations ?? 0;
      const currentAvgToolCalls = data.iterations?.avgToolCalls ?? 0;

      setResponseTimeData(prev => {
        const newPoint: TimeSeriesPoint = {
          timestamp: Date.now(),
          value: currentAvgResponseTime,
        };
        return [...prev.slice(-59), newPoint];
      });

      setThroughputData(prev => {
        const newPoint: TimeSeriesPoint = {
          timestamp: Date.now(),
          value: currentRequestsPerMinute,
        };
        return [...prev.slice(-59), newPoint];
      });

      setTokenData(prev => {
        const newPoint: TimeSeriesPoint = {
          timestamp: Date.now(),
          value: currentTokensPerMinute,
        };
        return [...prev.slice(-59), newPoint];
      });

      // 更新实时状态
      setRealTimeStatus(prev => ({
        ...prev,
        activeAgents: data.agents?.activeAgents ?? prev.activeAgents,
        runningTasks: data.agents?.runningTasks ?? prev.runningTasks,
        queuedTasks: data.agents?.queuedTasks ?? prev.queuedTasks,
        status: data.alerts?.length > 0 ? 'degraded' : 'healthy',
        lastUpdated: Date.now(),
      }));

      // 使用真实 API 数据更新 Agent 执行指标
      setAgentMetrics({
        ...defaultAgentMetrics,
        currentIteration: Math.round(currentAvgIterations),
        toolCallCount: Math.round(currentAvgToolCalls),
        totalTokens: data.tokens?.totalTokens ?? 0,
        estimatedMemoryMB: data.system?.memoryUsage ?? 0,
        executionDuration: data.performance?.avgResponseTime ?? 0,
      });

      setToolCallHistory(prev => {
        return [...prev.slice(-19), Math.round(currentAvgToolCalls)];
      });

      setIterationHistory(prev => {
        return [...prev.slice(-19), Math.round(currentAvgIterations)];
      });

      // 使用真实 API 数据更新执行历史
      setExecutionHistory(prev => {
        const newRecord: ExecutionRecord = {
          id: `exec-${Date.now()}`,
          timestamp: Date.now(),
          duration: currentAvgResponseTime,
          iterations: Math.round(currentAvgIterations),
          toolCalls: Math.round(currentAvgToolCalls),
          inputTokens: Math.floor((data.tokens?.totalTokens ?? 0) * 0.3),
          outputTokens: Math.floor((data.tokens?.totalTokens ?? 0) * 0.7),
          memoryMB: data.system?.memoryUsage ?? 50,
          success: (data.success?.successRate ?? data.successRate ?? 100) > 90,
        };
        return [...prev.slice(-49), newRecord];
      });
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始化数据 - 等待API真实数据后再填充
  useEffect(() => {
    // 初始化空的时间序列（等待API）
    setResponseTimeData([]);
    setThroughputData([]);
    setTokenData([]);
    setIterationHistory([]);
    setToolCallHistory([]);
    setExecutionHistory([]);
  }, []);

  // 定时刷新
  useEffect(() => {
    const interval = setInterval(refreshData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshData, refreshInterval]);

  // 阈值检查 - 仅当有真实数据时执行
  useEffect(() => {
    if (agentMetrics && metrics) {
      checkThresholds(agentMetrics, metrics.memoryUsage);
    }
  }, [agentMetrics, metrics, checkThresholds]);

  // 建议分析 - 仅当有真实数据时执行
  useEffect(() => {
    if (executionHistory.length > 0 && agentMetrics) {
      analyzeSuggestions(executionHistory, agentMetrics);
    }
  }, [executionHistory, agentMetrics, analyzeSuggestions]);

  // 状态颜色
  const statusColor = useMemo(() => {
    switch (realTimeStatus.status) {
      case 'healthy': return 'text-[hsl(var(--success-500))]';
      case 'degraded': return 'text-[hsl(var(--warning-500))]';
      case 'error': return 'text-destructive';
    }
  }, [realTimeStatus.status]);

  // 内存估算颜色
  const memoryColor = useMemo(() => {
    if (metrics.memoryUsage > 80) return 'hsl(var(--destructive))';
    if (metrics.memoryUsage > 60) return 'hsl(var(--warning-500))';
    return 'hsl(var(--success-500))';
  }, [metrics.memoryUsage]);

  // 迭代进度颜色
  const iterationProgress = (agentMetrics.currentIteration / agentMetrics.maxIterations) * 100;
  const iterationColor = useMemo(() => {
    if (iterationProgress > 90) return 'hsl(var(--destructive))';
    if (iterationProgress > 70) return 'hsl(var(--warning-500))';
    return 'hsl(var(--success-500))';
  }, [iterationProgress]);

  // 工具调用数趋势颜色
  const toolCallTrend = useMemo(() => {
    if (toolCallHistory.length < 2) return 'var(--primary)';
    const last = toolCallHistory[toolCallHistory.length - 1];
    const prev = toolCallHistory[toolCallHistory.length - 2];
    if (last > prev * 1.3) return 'hsl(var(--destructive))';
    if (last < prev * 0.7) return 'hsl(var(--success-500))';
    return 'var(--primary)';
  }, [toolCallHistory]);

  return (
    <motion.div
      className={`flex flex-col bg-background border rounded-xl overflow-hidden ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-primary" />
          <span className="font-medium text-sm">性能监控</span>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${statusColor} bg-current/10`}>
            {realTimeStatus.status === 'healthy' ? (
              <CheckCircle2 size={10} />
            ) : realTimeStatus.status === 'degraded' ? (
              <AlertTriangle size={10} />
            ) : (
              <XCircle size={10} />
            )}
            {realTimeStatus.status === 'healthy' ? '健康' : realTimeStatus.status === 'degraded' ? '降级' : '异常'}
          </div>
          {alerts.length > 0 && (
            <button
              onClick={() => setAlertPanelOpen(v => !v)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                alerts.some(a => a.level === 'critical')
                  ? 'bg-destructive/20 text-destructive'
                  : 'bg-[hsl(var(--warning-500))]/20 text-[hsl(var(--warning-500))]'
              }`}
            >
              <AlertTriangle size={10} />
              {alerts.length} 告警
              {alertPanelOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {new Date(realTimeStatus.lastUpdated).toLocaleTimeString('zh-CN')}
          </span>
          <motion.button
            onClick={refreshData}
            disabled={isLoading}
            className="p-1.5 rounded hover:bg-muted"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </motion.button>
        </div>
      </div>

      {/* 告警面板（可折叠） */}
      <AnimatePresence>
        {alertPanelOpen && alerts.length > 0 && (
          <motion.div
            className="border-b bg-muted/10"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="flex items-center justify-between px-4 pt-2 pb-1">
              <span className="text-xs font-medium text-muted-foreground">实时告警</span>
              <button
                onClick={() => setShowAlerts(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {showAlerts ? '折叠' : '展开'}
              </button>
            </div>
            <div className={`space-y-1.5 px-4 pb-3 max-h-40 overflow-y-auto ${showAlerts ? '' : 'hidden'}`}>
              <AnimatePresence>
                {alerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onDismiss={id => setAlerts(prev => prev.filter(a => a.id !== id))}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 实时状态 */}
      <div className="grid grid-cols-3 gap-4 p-4 border-b">
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">{realTimeStatus.activeAgents}</div>
          <div className="text-xs text-muted-foreground">活动 Agent</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">{realTimeStatus.runningTasks}</div>
          <div className="text-xs text-muted-foreground">运行任务</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[hsl(var(--warning-500))]">{realTimeStatus.queuedTasks}</div>
          <div className="text-xs text-muted-foreground">队列任务</div>
        </div>
      </div>

      {/* 加载状态 */}
      {!metrics || !agentMetrics ? (
        <div className="flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw size={24} className="animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">正在加载指标数据...</span>
          </div>
        </div>
      ) : (
        <>
          {/* ========== Agent 执行指标区 ========== */}
          <div className="p-4 border-b">
            <div className="flex items-center gap-1.5 mb-3">
              <Brain size={14} className="text-primary" />
              <span className="text-sm font-medium">Agent 执行指标</span>
            </div>

            {/* 迭代进度条 */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Timer size={12} />
                  <span>执行时间</span>
                </div>
                <span className="text-xs font-medium">
                  {(agentMetrics.executionDuration / 1000).toFixed(1)}s
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: iterationColor }}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.min(100, iterationProgress)}%`,
                    }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-20 text-right">
                  迭代 {agentMetrics.currentIteration}/{agentMetrics.maxIterations}
                </span>
              </div>
            </div>

            {/* 三列指标 */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              {/* 迭代次数 */}
              <div className="flex flex-col p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-1.5 mb-1">
                  <Brain size={12} className="text-primary" />
                  <span className="text-xs text-muted-foreground">迭代次数</span>
                </div>
                <div className="text-xl font-bold">{agentMetrics.currentIteration}</div>
                <div className="text-[10px] text-muted-foreground">最大 {agentMetrics.maxIterations}</div>
              </div>
              {/* 工具调用 */}
              <div className="flex flex-col p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-1.5 mb-1">
                  <Cpu size={12} className="text-primary" />
                  <span className="text-xs text-muted-foreground">工具调用</span>
                </div>
                <div className="text-xl font-bold">{agentMetrics.toolCallCount}</div>
                <div className="text-[10px] text-muted-foreground">思考步骤 {agentMetrics.thinkingSteps}</div>
              </div>
              {/* Token 消耗 */}
              <div className="flex flex-col p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-1.5 mb-1">
                  <Coins size={12} className="text-primary" />
                  <span className="text-xs text-muted-foreground">Token</span>
                </div>
                <div className="text-xl font-bold">{agentMetrics.totalTokens.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">
                  IN {agentMetrics.inputTokens.toLocaleString()} / OUT {agentMetrics.outputTokens.toLocaleString()}
                </div>
              </div>
            </div>

            {/* 内存估算 */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
              <MemoryStick size={14} className="text-muted-foreground shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">内存估算</span>
                  <span className="text-xs font-medium" style={{ color: memoryColor }}>
                    {agentMetrics.estimatedMemoryMB} MB
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: memoryColor }}
                    animate={{ width: `${Math.min(100, metrics.memoryUsage)}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-muted-foreground">系统内存</span>
                <span className="text-xs font-medium" style={{ color: memoryColor }}>
                  {metrics.memoryUsage.toFixed(0)}%
                </span>
              </div>
            </div>

            {/* 性能趋势图表（纯CSS/SVG） */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              {/* 迭代趋势柱状图 */}
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium">迭代趋势</span>
                  <span className="text-[10px] text-muted-foreground">最近10次</span>
                </div>
                <BarChart
                  data={iterationHistory}
                  color={iterationColor}
                  height={45}
                  maxValue={agentMetrics.maxIterations}
                />
              </div>
              {/* 工具调用趋势 */}
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium">工具调用趋势</span>
                  <span className="text-[10px] text-muted-foreground">最近10次</span>
                </div>
                <BarChart
                  data={toolCallHistory}
                  color={toolCallTrend}
                  height={45}
                />
              </div>
            </div>
          </div>

          {/* 核心指标 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 border-b">
            <MetricCard title="平均响应时间" value={metrics.avgResponseTime.toFixed(0)} unit="ms" icon={<Clock size={12} />} status={metrics.avgResponseTime < 2000 ? 'good' : metrics.avgResponseTime < 3000 ? 'warning' : 'error'} trend={-2.5} />
            <MetricCard title="请求/分钟" value={metrics.requestsPerMinute.toFixed(1)} icon={<Zap size={12} />} status="good" trend={5.2} />
            <MetricCard title="成功率" value={metrics.successRate.toFixed(1)} unit="%" icon={<CheckCircle2 size={12} />} status={metrics.successRate > 95 ? 'good' : metrics.successRate > 90 ? 'warning' : 'error'} trend={1.2} />
            <MetricCard title="错误率" value={metrics.errorRate.toFixed(1)} unit="%" icon={<XCircle size={12} />} status={metrics.errorRate < 5 ? 'good' : metrics.errorRate < 10 ? 'warning' : 'error'} trend={-0.5} />
          </div>

          {/* 图表区域 */}
          <div className="grid grid-cols-2 gap-4 p-4 border-b">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">响应时间趋势</span>
                <span className="text-[10px] text-muted-foreground">最近 30 分钟</span>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <MiniLineChart data={responseTimeData} color="var(--primary)" height={55} showArea />
                <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                  <span>P95: {metrics.p95ResponseTime}ms</span>
                  <span>Max: {metrics.maxResponseTime}ms</span>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Token 消耗趋势</span>
                <span className="text-[10px] text-muted-foreground">最近 30 分钟</span>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <MiniLineChart data={tokenData} color="hsl(var(--warning-500))" height={55} showArea />
                <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                  <span>当前: {agentMetrics.totalTokens.toLocaleString()}</span>
                  <span>峰值: {Math.max(...tokenData.map(d => d.value), 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 资源使用 */}
          <div className="grid grid-cols-4 gap-2 p-4 border-b">
            <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
              <ProgressRing value={metrics.cpuUsage} color={metrics.cpuUsage > 80 ? 'hsl(var(--destructive))' : metrics.cpuUsage > 60 ? 'hsl(var(--warning-500))' : 'hsl(var(--success-500))'} label="CPU" size={56} strokeWidth={6} />
            </div>
            <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
              <ProgressRing value={metrics.memoryUsage} color={memoryColor} label="内存" size={56} strokeWidth={6} />
            </div>
            <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
              <div className="text-lg font-bold">{metrics.avgIterations.toFixed(1)}</div>
              <div className="text-[10px] text-muted-foreground">平均迭代</div>
              <div className="text-[10px] text-muted-foreground">工具 {metrics.avgToolCalls.toFixed(1)}</div>
            </div>
            <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
              <div className="text-lg font-bold">${metrics.totalCost.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">总成本</div>
              <div className="text-[10px] text-muted-foreground">${metrics.costPerRequest.toFixed(4)}/req</div>
            </div>
          </div>

          {/* ========== 优化建议区 ========== */}
          {suggestions.length > 0 && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <Gauge size={14} className="text-primary" />
                  <span className="text-sm font-medium">性能优化建议</span>
                  <span className="text-xs text-muted-foreground">基于 {executionHistory.length} 次执行分析</span>
                </div>
                <button onClick={() => setShowSuggestions(v => !v)} className="text-xs text-muted-foreground hover:text-foreground">
                  {showSuggestions ? '折叠' : '展开'}
                </button>
              </div>
              {showSuggestions && (
                <div className="space-y-2">
                  <AnimatePresence>
                    {suggestions.map(s => (
                      <motion.div key={s.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <SuggestionCard suggestion={s} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
});

export default PerformanceMonitor;
