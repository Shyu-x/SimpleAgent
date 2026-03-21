'use client';

import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  CheckCircle2,
  Loader2,
  AlertCircle,
  PauseCircle,
  Clock,
  Zap,
  Brain,
  Wrench,
  FileText,
  Code,
  Search,
  MessageSquare,
  Cpu
} from 'lucide-react';

// Agent 状态类型
export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'completed' | 'error';

// Agent 工具类型
export type AgentTool = 'search' | 'code' | 'file' | 'brain' | 'message' | 'general';

// Agent 信息接口
export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  icon?: string;
  color?: string;
  status: AgentStatus;
  currentTask?: string;
  progress?: number; // 0-100
  tools?: AgentTool[];
  lastActivity?: string;
  error?: string;
}

// 状态颜色映射
const statusColors: Record<AgentStatus, { bg: string; text: string; pulse: string }> = {
  idle: { bg: 'bg-muted', text: 'text-muted-foreground', pulse: '' },
  thinking: { bg: 'bg-primary/10', text: 'text-primary', pulse: 'animate-pulse' },
  executing: { bg: 'bg-primary/20', text: 'text-primary', pulse: '' },
  waiting: { bg: 'bg-[hsl(var(--warning-500))/0.14]', text: 'text-[hsl(var(--warning-500))]', pulse: '' },
  completed: { bg: 'bg-[hsl(var(--success-500))/0.14]', text: 'text-[hsl(var(--success-500))]', pulse: '' },
  error: { bg: 'bg-destructive/20', text: 'text-destructive', pulse: '' },
};

// 状态图标映射
const statusIcons: Record<AgentStatus, React.ReactNode> = {
  idle: <Clock size={14} />,
  thinking: <Brain size={14} className="animate-pulse" />,
  executing: <Loader2 size={14} className="animate-spin" />,
  waiting: <PauseCircle size={14} />,
  completed: <CheckCircle2 size={14} />,
  error: <AlertCircle size={14} />,
};

// 工具图标映射
const toolIcons: Record<AgentTool, React.ReactNode> = {
  search: <Search size={12} />,
  code: <Code size={12} />,
  file: <FileText size={12} />,
  brain: <Brain size={12} />,
  message: <MessageSquare size={12} />,
  general: <Wrench size={12} />,
};

// 状态文本映射
const statusText: Record<AgentStatus, string> = {
  idle: '空闲',
  thinking: '思考中',
  executing: '执行中',
  waiting: '等待中',
  completed: '已完成',
  error: '错误',
};

// 动画变体
const indicatorVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 400, damping: 25 }
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: { duration: 0.2 }
  },
} as const;

const pulseVariants = {
  pulse: {
    scale: [1, 1.1, 1] as [number, number, number],
    opacity: [0.5, 1, 0.5] as [number, number, number],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut' as const,
    }
  }
};

// 单个 Agent 状态指示器
interface AgentStatusIndicatorProps {
  agent: AgentInfo;
  compact?: boolean;
  showProgress?: boolean;
  showTools?: boolean;
}

const AgentStatusIndicator = memo(function AgentStatusIndicator({
  agent,
  compact = false,
  showProgress = true,
  showTools = false,
}: AgentStatusIndicatorProps) {
  const colors = statusColors[agent.status];
  const StatusIcon = statusIcons[agent.status];

  // 进度条动画
  const progressWidth = useMemo(() => {
    return agent.progress !== undefined ? `${agent.progress}%` : '0%';
  }, [agent.progress]);

  if (compact) {
    return (
      <motion.div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${colors.bg} ${colors.text}`}
        variants={indicatorVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {StatusIcon}
        <span className="text-xs font-medium truncate max-w-[80px]">{agent.name}</span>
        {agent.status === 'thinking' && (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-current"
            variants={pulseVariants}
            animate="pulse"
          />
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`flex flex-col gap-2 p-3 rounded-xl ${colors.bg} border border-current/10`}
      variants={indicatorVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      layout
    >
      {/* 头部：名称和状态 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors.bg}`}>
            {agent.icon ? (
              <span className="text-lg">{agent.icon}</span>
            ) : (
              <Bot size={18} className={colors.text} />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{agent.name}</span>
            <span className="text-xs text-muted-foreground">{agent.role}</span>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 ${colors.text}`}>
          {StatusIcon}
          <span className="text-xs font-medium">{statusText[agent.status]}</span>
        </div>
      </div>

      {/* 当前任务 */}
      {agent.currentTask && (
        <div className="text-xs text-muted-foreground truncate">
          <Zap size={10} className="inline mr-1" />
          {agent.currentTask}
        </div>
      )}

      {/* 进度条 */}
      {showProgress && agent.progress !== undefined && (
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${colors.text.replace('text-', 'bg-')}`}
            initial={{ width: 0 }}
            animate={{ width: progressWidth }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      )}

      {/* 工具标签 */}
      {showTools && agent.tools && agent.tools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.tools.map((tool) => (
            <span
              key={tool}
              className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-muted/50 text-muted-foreground"
            >
              {toolIcons[tool]}
              {tool}
            </span>
          ))}
        </div>
      )}

      {/* 错误信息 */}
      {agent.status === 'error' && agent.error && (
        <div className="text-xs text-destructive bg-destructive/10 px-2 py-1 rounded">
          {agent.error}
        </div>
      )}

      {/* 最后活动时间 */}
      {agent.lastActivity && (
        <div className="text-xs text-muted-foreground/60 text-right">
          {agent.lastActivity}
        </div>
      )}
    </motion.div>
  );
});

// 多 Agent 状态面板
interface AgentStatusPanelProps {
  agents: AgentInfo[];
  title?: string;
  compact?: boolean;
}

export const AgentStatusPanel = memo(function AgentStatusPanel({
  agents,
  title = 'Agent 状态',
  compact = false,
}: AgentStatusPanelProps) {
  const activeAgents = agents.filter(a => a.status !== 'idle');
  const hasActiveAgents = activeAgents.length > 0;

  return (
    <motion.div
      className="flex flex-col gap-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-primary" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        {hasActiveAgents && (
          <motion.div
            className="flex items-center gap-1 text-xs text-primary"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            {activeAgents.length} 个活跃
          </motion.div>
        )}
      </div>

      {/* Agent 列表 */}
      <div className="grid gap-2">
        <AnimatePresence mode="popLayout">
          {agents.map((agent) => (
            <AgentStatusIndicator
              key={agent.id}
              agent={agent}
              compact={compact}
              showProgress={!compact}
              showTools={!compact}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

// 迷你状态指示器（用于消息中）
interface MiniStatusIndicatorProps {
  status: AgentStatus;
  label?: string;
}

export const MiniStatusIndicator = memo(function MiniStatusIndicator({
  status,
  label,
}: MiniStatusIndicatorProps) {
  const colors = statusColors[status];
  const StatusIcon = statusIcons[status];

  return (
    <motion.span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${colors.bg} ${colors.text}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {StatusIcon}
      {label && <span>{label}</span>}
    </motion.span>
  );
});

export default AgentStatusIndicator;
