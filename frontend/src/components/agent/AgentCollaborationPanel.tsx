'use client';

import { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Users,
  Workflow,
  Settings,
  ChevronDown,
  ChevronRight,
  Play,
  Pause,
  Square,
  RefreshCw,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  Layers,
  Send,
  Radio,
  ListTodo,
  MessageSquare,
  ArrowRight,
  X,
  Wifi,
  WifiOff,
  Circle,
  Loader2
} from 'lucide-react';
import AgentStatusIndicator, {
  AgentStatusPanel,
  AgentInfo
} from './AgentStatusIndicator';
import ToolCallDisplay, {
  ToolCallList,
  ToolCallInfo
} from './ToolCallDisplay';
import ErrorRecoveryUI, {
  ErrorList,
  ErrorInfo,
  RecoveryStrategy
} from './ErrorRecoveryUI';
import HumanConfirmationDialog, {
  ConfirmationRequest,
  ConfirmationResponse
} from './HumanConfirmationDialog';
import { BACKEND_URL } from '@/lib/config';

// A2A 消息类型
type A2AMessageType =
  | 'task.delegate'
  | 'result.return'
  | 'status.sync'
  | 'progress.update'
  | 'error.notify'
  | 'message.send';

// A2A 任务状态
type A2ATaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

// A2A Agent 信息
interface A2AAgentInfo {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline';
  endpoint?: string;
  capabilities?: string[];
  lastSeen?: number;
}

// A2A 消息
interface A2AMessage {
  id: string;
  type: A2AMessageType;
  from: string;
  to: string;
  taskId?: string;
  payload: Record<string, unknown>;
  status?: A2ATaskStatus;
  timestamp: number;
  replyTo?: string;
}

// A2A 任务
interface A2ATask {
  id: string;
  type: string;
  title: string;
  description?: string;
  from: string;
  to: string;
  status: A2ATaskStatus;
  progress: number;
  result?: unknown;
  error?: string;
  createdAt: number;
  completedAt?: number;
  tags?: string[];
}

// A2A Tab Props
interface A2ATabProps {
  backendUrl: string;
  currentAgentId: string;
  onError?: (error: string) => void;
}

// Agent 工作流状态
export type WorkflowStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

// 工作流配置
export interface WorkflowConfig {
  id: string;
  name: string;
  description?: string;
  process: 'sequential' | 'hierarchical' | 'parallel';
  agents: AgentInfo[];
  tasks: TaskInfo[];
}

// 任务信息
export interface TaskInfo {
  id: string;
  name: string;
  description?: string;
  agentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  dependencies?: string[];
  order: number;
}

// 工作流执行状态
export interface WorkflowExecutionState {
  status: WorkflowStatus;
  currentTaskIndex: number;
  progress: number;
  startedAt?: string;
  completedAt?: string;
  errors: ErrorInfo[];
  toolCalls: ToolCallInfo[];
  pendingConfirmations: ConfirmationRequest[];
}

// 动画变体
const panelVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: 'easeOut' as const }
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: 0.2 }
  }
} as const;

const taskVariants = {
  pending: { opacity: 0.5 },
  running: { opacity: 1, scale: [1, 1.02, 1] },
  completed: { opacity: 1 },
  failed: { opacity: 1, x: [0, -2, 2, -2, 2, 0] }
};

// Agent 协作面板
interface AgentCollaborationPanelProps {
  workflow: WorkflowConfig;
  executionState: WorkflowExecutionState;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  onConfirm?: (response: ConfirmationResponse) => void;
  onErrorRecovery?: (errorId: string, strategy: RecoveryStrategy) => void;
  onDismissError?: (errorId: string) => void;
  collapsed?: boolean;
}

const AgentCollaborationPanel = memo(function AgentCollaborationPanel({
  workflow,
  executionState,
  onStart,
  onPause,
  onResume,
  onStop,
  onRetry,
  onConfirm,
  onErrorRecovery,
  onDismissError,
  collapsed = false,
}: AgentCollaborationPanelProps) {
  const [activeTab, setActiveTab] = useState<'agents' | 'tasks' | 'tools' | 'errors' | 'a2a'>('agents');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['agents']));

  // 计算统计信息
  const stats = useMemo(() => {
    const activeAgents = workflow.agents.filter(a => a.status !== 'idle').length;
    const completedTasks = workflow.tasks.filter(t => t.status === 'completed').length;
    const runningTasks = workflow.tasks.filter(t => t.status === 'running').length;
    const failedTasks = workflow.tasks.filter(t => t.status === 'failed').length;

    return {
      activeAgents,
      completedTasks,
      runningTasks,
      failedTasks,
      totalProgress: workflow.tasks.length > 0
        ? (completedTasks / workflow.tasks.length) * 100
        : 0
    };
  }, [workflow.agents, workflow.tasks]);

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

  // 获取当前确认请求
  const currentConfirmation = executionState.pendingConfirmations[0];

  return (
    <motion.div
      className="flex flex-col h-full bg-background border-l"
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-primary" />
          <span className="font-medium text-sm">{workflow.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* 控制按钮 */}
          {executionState.status === 'idle' && (
            <motion.button
              onClick={onStart}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Play size={14} />
              开始
            </motion.button>
          )}
          {executionState.status === 'running' && (
            <motion.button
              onClick={onPause}
              className="flex items-center gap-1 px-3 py-1.5 bg-[hsl(var(--warning-500))] text-primary-foreground rounded-lg text-xs font-medium"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Pause size={14} />
              暂停
            </motion.button>
          )}
          {executionState.status === 'paused' && (
            <motion.button
              onClick={onResume}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Play size={14} />
              继续
            </motion.button>
          )}
          {executionState.status === 'error' && (
            <motion.button
              onClick={onRetry}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <RefreshCw size={14} />
              重试
            </motion.button>
          )}
          {(executionState.status === 'running' || executionState.status === 'paused') && (
            <motion.button
              onClick={onStop}
              className="flex items-center gap-1 px-3 py-1.5 bg-destructive text-destructive-foreground rounded-lg text-xs font-medium"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Square size={14} />
              停止
            </motion.button>
          )}
        </div>
      </div>

      {/* 进度条 */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">执行进度</span>
          <span className="text-xs font-medium">{Math.round(executionState.progress)}%</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${executionState.progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 size={12} className="text-[hsl(var(--success-500))]" />
            {stats.completedTasks}/{workflow.tasks.length} 任务
          </span>
          {stats.runningTasks > 0 && (
            <span className="flex items-center gap-1 text-primary">
              <RefreshCw size={12} className="animate-spin" />
              {stats.runningTasks} 执行中
            </span>
          )}
          {executionState.errors.length > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle size={12} />
              {executionState.errors.length} 错误
            </span>
          )}
        </div>
      </div>

      {/* 标签页 */}
      <div className="flex border-b">
        {[
          { id: 'agents', label: 'Agents', icon: <Users size={14} /> },
          { id: 'tasks', label: '任务', icon: <Zap size={14} /> },
          { id: 'tools', label: '工具', icon: <Settings size={14} /> },
          ...(executionState.errors.length > 0 ? [{ id: 'errors', label: '错误', icon: <AlertCircle size={14} /> }] : []),
          { id: 'a2a', label: 'A2A', icon: <Radio size={14} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'errors' && executionState.errors.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px]">
                {executionState.errors.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          {activeTab === 'agents' && (
            <motion.div
              key="agents"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <AgentStatusPanel
                agents={workflow.agents}
                title="Agent 团队"
                compact={false}
              />
            </motion.div>
          )}

          {activeTab === 'tasks' && (
            <motion.div
              key="tasks"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-2"
            >
              {workflow.tasks.map((task, index) => {
                const agent = workflow.agents.find(a => a.id === task.agentId);
                return (
                  <motion.div
                    key={task.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      task.status === 'running' ? 'bg-primary/5 border-primary/30' : 'bg-muted/30'
                    }`}
                    variants={taskVariants}
                    animate={task.status}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{task.name}</div>
                      {task.description && (
                        <div className="text-xs text-muted-foreground truncate">{task.description}</div>
                      )}
                    </div>
                    {agent && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Bot size={12} />
                        {agent.name}
                      </div>
                    )}
                    <div className={`flex items-center gap-1 text-xs ${
                      task.status === 'completed' ? 'text-[hsl(var(--success-500))]' :
                      task.status === 'failed' ? 'text-destructive' :
                      task.status === 'running' ? 'text-primary' : 'text-muted-foreground'
                    }`}>
                      {task.status === 'completed' && <CheckCircle2 size={14} />}
                      {task.status === 'failed' && <AlertCircle size={14} />}
                      {task.status === 'running' && <RefreshCw size={14} className="animate-spin" />}
                      {task.status === 'pending' && <Clock size={14} />}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}

          {activeTab === 'tools' && (
            <motion.div
              key="tools"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {executionState.toolCalls.length > 0 ? (
                <ToolCallList
                  toolCalls={executionState.toolCalls}
                  defaultExpanded={false}
                  showTimestamp={true}
                />
              ) : (
                <div className="text-center text-muted-foreground text-sm py-8">
                  暂无工具调用记录
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'errors' && (
            <motion.div
              key="errors"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ErrorList
                errors={executionState.errors}
                onRecovery={onErrorRecovery}
                onDismiss={onDismissError}
              />
            </motion.div>
          )}
          {activeTab === 'a2a' && (
            <motion.div
              key="a2a"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <A2ATab
                backendUrl={BACKEND_URL}
                currentAgentId="frontend-user"
                onError={(e) => console.error('[A2A]', e)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 人机确认对话框 */}
      <AnimatePresence>
        {currentConfirmation && onConfirm && (
          <HumanConfirmationDialog
            request={currentConfirmation}
            onConfirm={onConfirm}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// 工作流可视化组件（用于消息中）
interface WorkflowVisualizationProps {
  workflow: WorkflowConfig;
  executionState: WorkflowExecutionState;
  compact?: boolean;
}

export const WorkflowVisualization = memo(function WorkflowVisualization({
  workflow,
  executionState,
  compact = true,
}: WorkflowVisualizationProps) {
  const [expanded, setExpanded] = useState(!compact);

  return (
    <motion.div
      className="rounded-xl border bg-muted/30 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* 头部 */}
      <button
        className="flex items-center justify-between w-full p-3 hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Workflow size={16} className="text-primary" />
          <span className="text-sm font-medium">{workflow.name}</span>
          <span className="text-xs text-muted-foreground">
            {workflow.process === 'sequential' ? '顺序执行' :
             workflow.process === 'parallel' ? '并行执行' : '层级执行'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">
            {Math.round(executionState.progress)}%
          </div>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {/* 进度条 */}
      <div className="px-3 pb-2">
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            animate={{ width: `${executionState.progress}%` }}
          />
        </div>
      </div>

      {/* 展开内容 */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {/* Agent 状态迷你列表 */}
            <div className="px-3 pb-3">
              <div className="flex flex-wrap gap-2">
                {workflow.agents.map((agent) => (
                  <AgentStatusIndicator
                    key={agent.id}
                    agent={agent}
                    compact
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// Agent 协作流图（可视化流程）
interface WorkflowFlowChartProps {
  workflow: WorkflowConfig;
  executionState: WorkflowExecutionState;
}

export const WorkflowFlowChart = memo(function WorkflowFlowChart({
  workflow,
  executionState,
}: WorkflowFlowChartProps) {
  return (
    <div className="relative">
      {/* 任务节点 */}
      <div className="flex flex-col gap-4">
        {workflow.tasks.map((task, index) => {
          const agent = workflow.agents.find(a => a.id === task.agentId);
          const isActive = task.status === 'running';
          const isCompleted = task.status === 'completed';
          const isFailed = task.status === 'failed';

          return (
            <motion.div
              key={task.id}
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              {/* 连接线 */}
              {index > 0 && (
                <div className="absolute left-4 -mt-8 w-0.5 h-8 bg-muted" />
              )}

              {/* 节点 */}
              <motion.div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                  isCompleted ? 'bg-[hsl(var(--success-500))/0.14] border-[hsl(var(--success-500))/0.32]' :
                  isFailed ? 'bg-destructive/20 border-destructive' :
                  isActive ? 'bg-primary/20 border-primary' : 'bg-muted border-muted-foreground/30'
                }`}
                animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 1, repeat: isActive ? Infinity : 0 }}
              >
                {isCompleted ? (
                  <CheckCircle2 size={16} className="text-[hsl(var(--success-500))]" />
                ) : isFailed ? (
                  <AlertCircle size={16} className="text-destructive" />
                ) : (
                  <span className="text-xs font-medium">{index + 1}</span>
                )}
              </motion.div>

              {/* 任务信息 */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{task.name}</div>
                {agent && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Bot size={10} />
                    {agent.name}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
});

export default AgentCollaborationPanel;

// ============================================================================
// A2A (Agent-to-Agent) 协议面板组件
// ============================================================================

/**
 * A2A 协议面板
 * 提供 Agent 注册、消息发送、任务委托、结果回传功能
 */
function A2ATab({ backendUrl, currentAgentId, onError }: A2ATabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'agents' | 'messages' | 'tasks' | 'send'>('agents');
  const [agents, setAgents] = useState<A2AAgentInfo[]>([]);
  const [messages, setMessages] = useState<A2AMessage[]>([]);
  const [tasks, setTasks] = useState<A2ATask[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [messageInput, setMessageInput] = useState('');
  const [taskInput, setTaskInput] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<{ onlineAgents: number; pendingTasks: number } | null>(null);
  const [selectedTask, setSelectedTask] = useState<A2ATask | null>(null);
  const [taskResult, setTaskResult] = useState<string>('');
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 加载 Agent 列表
  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/a2a/agents`);
      const data = await res.json();
      if (data.success) {
        setAgents(data.agents || []);
        if (data.onlineAgents !== undefined) {
          setServiceStatus({ onlineAgents: data.onlineAgents, pendingTasks: data.pendingTasks || 0 });
        }
      }
    } catch {
      // 静默失败
    }
  }, [backendUrl]);

  // 加载任务列表
  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/a2a/tasks`);
      const data = await res.json();
      if (data.success) {
        setTasks(data.tasks || []);
      }
    } catch {
      // 静默失败
    }
  }, [backendUrl]);

  // 加载消息
  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/a2a/receive?agentId=${encodeURIComponent(currentAgentId)}&limit=20&clear=false`);
      const data = await res.json();
      if (data.success) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMsgs = (data.messages || []).filter((m: A2AMessage) => !existingIds.has(m.id));
          return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
        });
      }
    } catch {
      // 静默失败
    }
  }, [backendUrl, currentAgentId]);

  // 发送消息
  const handleSendMessage = useCallback(async () => {
    if (!selectedAgent || !messageInput.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${backendUrl}/api/a2a/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: currentAgentId,
          to: selectedAgent,
          type: 'message.send',
          payload: { content: messageInput.trim() }
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, {
          id: data.messageId,
          type: 'message.send',
          from: currentAgentId,
          to: selectedAgent,
          payload: { content: messageInput.trim() },
          timestamp: Date.now()
        }]);
        setMessageInput('');
      }
    } catch (err) {
      onError?.('消息发送失败');
    } finally {
      setSending(false);
    }
  }, [backendUrl, currentAgentId, selectedAgent, messageInput, onError]);

  // 委托任务
  const handleDelegateTask = useCallback(async () => {
    if (!selectedAgent || !taskInput.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${backendUrl}/api/a2a/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: currentAgentId,
          to: selectedAgent,
          type: 'task.delegate',
          payload: {
            title: taskInput.trim(),
            description: taskDescription.trim(),
            input: { task: taskInput.trim(), description: taskDescription.trim() }
          },
          priority: 1
        })
      });
      const data = await res.json();
      if (data.success) {
        await loadTasks();
        setTaskInput('');
        setTaskDescription('');
      } else {
        onError?.('任务委托失败');
      }
    } catch {
      onError?.('任务委托失败');
    } finally {
      setSending(false);
    }
  }, [backendUrl, currentAgentId, selectedAgent, taskInput, taskDescription, onError, loadTasks]);

  // 注册 Agent
  const handleRegister = useCallback(async () => {
    setLoading(true);
    try {
      await fetch(`${backendUrl}/api/a2a/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentAgentId,
          name: '前端用户代理',
          type: 'frontend',
          capabilities: ['chat', 'ui']
        })
      });
      await loadAgents();
    } catch {
      onError?.('Agent 注册失败');
    } finally {
      setLoading(false);
    }
  }, [backendUrl, currentAgentId, loadAgents, onError]);

  // 初始加载
  useEffect(() => {
    loadAgents();
    loadTasks();
    loadMessages();

    // 注册 Agent
    handleRegister();

    // 定时轮询
    pollIntervalRef.current = setInterval(() => {
      loadAgents();
      loadMessages();
    }, 5000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [loadAgents, loadTasks, loadMessages, handleRegister]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  const messageTypeLabel: Record<A2AMessageType, string> = {
    'task.delegate': '任务委托',
    'result.return': '结果回传',
    'status.sync': '状态同步',
    'progress.update': '进度更新',
    'error.notify': '错误通知',
    'message.send': '消息'
  };

  const taskStatusLabel: Record<A2ATaskStatus, string> = {
    pending: '等待中',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  };

  const taskStatusColor: Record<A2ATaskStatus, string> = {
    pending: 'text-muted-foreground',
    running: 'text-primary',
    completed: 'text-[hsl(var(--success-500))]',
    failed: 'text-destructive',
    cancelled: 'text-muted-foreground'
  };

  return (
    <div className="space-y-3">
      {/* 服务状态 */}
      {serviceStatus && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Radio size={12} className="text-[hsl(var(--success-500))]" />
          <span>A2A 在线</span>
          <span>|</span>
          <span>Agent: {serviceStatus.onlineAgents}</span>
          <span>|</span>
          <span>待处理任务: {serviceStatus.pendingTasks}</span>
        </div>
      )}

      {/* 子标签页 */}
      <div className="flex gap-1 border-b pb-1">
        {[
          { id: 'agents', label: 'Agents', icon: <Users size={12} /> },
          { id: 'messages', label: '消息', icon: <MessageSquare size={12} /> },
          { id: 'tasks', label: '任务', icon: <ListTodo size={12} /> },
          { id: 'send', label: '发送', icon: <Send size={12} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              activeSubTab === tab.id
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Agent 列表 */}
      {activeSubTab === 'agents' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">在线 Agents ({agents.length})</span>
            <button
              onClick={loadAgents}
              className="p-1 hover:bg-muted rounded"
              title="刷新"
            >
              <RefreshCw size={12} className="text-muted-foreground" />
            </button>
          </div>
          {agents.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-4">
              <WifiOff size={20} className="mx-auto mb-1 opacity-40" />
              暂无在线 Agent
            </div>
          ) : (
            agents.map(agent => (
              <div key={agent.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setSelectedAgent(agent.id)}
              >
                <div className={`w-2 h-2 rounded-full ${agent.status === 'online' ? 'bg-[hsl(var(--success-500))]' : 'bg-muted-foreground/30'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{agent.name || agent.id}</div>
                  <div className="text-[10px] text-muted-foreground">{agent.type}</div>
                </div>
                {selectedAgent === agent.id && (
                  <ArrowRight size={12} className="text-primary" />
                )}
              </div>
            ))
          )}
          {selectedAgent && (
            <div className="text-xs text-muted-foreground p-2 bg-primary/5 rounded">
              已选择: <span className="font-medium text-primary">{selectedAgent}</span>
            </div>
          )}
        </div>
      )}

      {/* 消息列表 */}
      {activeSubTab === 'messages' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">消息 ({messages.length})</span>
            <button onClick={loadMessages} className="p-1 hover:bg-muted rounded" title="刷新">
              <RefreshCw size={12} className="text-muted-foreground" />
            </button>
          </div>
          {messages.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-4">
              暂无消息
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {messages.slice(-20).reverse().map(msg => (
                <div key={msg.id} className="text-xs p-2 rounded bg-muted/30">
                  <div className="flex items-center gap-1 mb-1">
                    <span className={`font-medium ${
                      msg.from === currentAgentId ? 'text-primary' : 'text-[hsl(var(--success-500))]'
                    }`}>{msg.from === currentAgentId ? '我' : msg.from}</span>
                    <ArrowRight size={8} className="text-muted-foreground" />
                    <span className="text-muted-foreground">{msg.to}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
                  </div>
                  <div className="text-muted-foreground">{messageTypeLabel[msg.type] || msg.type}</div>
                  {msg.payload && typeof msg.payload === 'object' && (
                    <div className="mt-1 text-muted-foreground/70 truncate">
                      {JSON.stringify(msg.payload).substring(0, 80)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 任务列表 */}
      {activeSubTab === 'tasks' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">任务 ({tasks.length})</span>
            <button onClick={loadTasks} className="p-1 hover:bg-muted rounded" title="刷新">
              <RefreshCw size={12} className="text-muted-foreground" />
            </button>
          </div>
          {tasks.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-4">
              <ListTodo size={20} className="mx-auto mb-1 opacity-40" />
              暂无任务
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {tasks.map(task => (
                <div
                  key={task.id}
                  className={`p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedTask?.id === task.id ? 'ring-1 ring-primary/30' : ''
                  }`}
                  onClick={() => {
                    setSelectedTask(task);
                    setTaskResult(task.result ? JSON.stringify(task.result, null, 2) : task.error || '');
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${taskStatusColor[task.status]}`}>
                      {taskStatusLabel[task.status]}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{formatTime(task.createdAt)}</span>
                  </div>
                  <div className="text-xs truncate">{task.title}</div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[10px] text-muted-foreground">从: {task.from}</span>
                    <ArrowRight size={8} className="text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">到: {task.to}</span>
                  </div>
                  {task.progress > 0 && task.progress < 100 && (
                    <div className="w-full h-1 bg-muted rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${task.progress}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {selectedTask && taskResult && (
            <div className="mt-2 p-2 rounded bg-muted/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">任务结果</span>
                <button onClick={() => setSelectedTask(null)} className="p-0.5 hover:bg-muted rounded">
                  <X size={10} />
                </button>
              </div>
              <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {taskResult.substring(0, 500)}{taskResult.length > 500 ? '...' : ''}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 发送消息/委托任务 */}
      {activeSubTab === 'send' && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">选择目标 Agent</label>
            <select
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded border bg-background"
            >
              <option value="">-- 选择 Agent --</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name || a.id} ({a.type})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">发送消息</label>
            <textarea
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              placeholder="输入要发送的消息..."
              className="w-full px-2 py-1.5 text-xs rounded border bg-background resize-none"
              rows={2}
            />
            <button
              onClick={handleSendMessage}
              disabled={sending || !selectedAgent || !messageInput.trim()}
              className="mt-1 w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium disabled:opacity-40"
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              发送消息
            </button>
          </div>

          <div className="border-t pt-3">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">委托任务</label>
            <input
              type="text"
              value={taskInput}
              onChange={e => setTaskInput(e.target.value)}
              placeholder="任务标题..."
              className="w-full px-2 py-1.5 text-xs rounded border bg-background mb-1"
            />
            <textarea
              value={taskDescription}
              onChange={e => setTaskDescription(e.target.value)}
              placeholder="任务描述（可选）..."
              className="w-full px-2 py-1.5 text-xs rounded border bg-background resize-none"
              rows={2}
            />
            <button
              onClick={handleDelegateTask}
              disabled={sending || !selectedAgent || !taskInput.trim()}
              className="mt-1 w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-[hsl(var(--success-500))] text-primary-foreground rounded text-xs font-medium disabled:opacity-40"
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <ListTodo size={12} />}
              委托任务
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
