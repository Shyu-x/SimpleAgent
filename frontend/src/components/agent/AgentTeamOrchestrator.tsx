'use client';

import { memo, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Plus,
  Settings,
  Brain,
  Cpu,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Search,
  Filter,
  X,
  ArrowRight,
  Target,
  GitBranch,
  Download,
  RefreshCw,
  Layers,
  Grid3x3,
  SplitSquareHorizontal,
  Maximize2,
  Bot,
  MessageSquare,
  Activity,
} from 'lucide-react';
import { fetchApi } from '@/lib/apiClient';

// ==================== 类型定义 ====================

export type AgentRole = 'researcher' | 'coder' | 'reviewer' | 'planner' | 'executor';
export type AgentStatus = 'idle' | 'thinking' | 'working' | 'waiting' | 'completed' | 'error';
export type TaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'failed';
export type CoordinationMode = 'team_leader' | 'collaborative' | 'autonomous';
export type LayoutMode = 'single' | 'dual' | 'grid-2x2' | 'grid-3x3';

export interface TeamAgent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  avatar?: string;
  currentTask?: string;
  progress: number;
  capabilities: string[];
  result?: string;
  lastActive: number;
}

export interface TeamTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: 'critical' | 'high' | 'medium' | 'low';
  assignedAgent?: string;
  dependencies: string[];
  result?: string;
  error?: string;
  progress: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface CollaborationResult {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  summary: {
    totalTasks: number;
    completed: number;
    failed: number;
    skipped: number;
    successRate: number;
  };
  results: TaskResult[];
  duration: number;
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  status: TaskStatus;
  result?: string;
  error?: string;
  duration: number;
}

// ==================== 常量 ====================

const ROLE_CONFIG: Record<AgentRole, { label: string; color: string; bg: string; icon: typeof Bot }> = {
  researcher: { label: '调研', color: 'text-blue-400', bg: 'bg-blue-400/20', icon: Search },
  coder: { label: '开发', color: 'text-green-400', bg: 'bg-green-400/20', icon: Cpu },
  reviewer: { label: '评审', color: 'text-amber-400', bg: 'bg-amber-400/20', icon: CheckCircle2 },
  planner: { label: '规划', color: 'text-purple-400', bg: 'bg-purple-400/20', icon: Target },
  executor: { label: '执行', color: 'text-cyan-400', bg: 'bg-cyan-400/20', icon: Zap },
};

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; bg: string; icon: typeof Bot }> = {
  idle: { label: '空闲', color: 'text-slate-400', bg: 'bg-slate-400/20', icon: Clock },
  thinking: { label: '思考中', color: 'text-cyan-400', bg: 'bg-cyan-400/20', icon: Brain },
  working: { label: '工作中', color: 'text-blue-400', bg: 'bg-blue-400/20', icon: Loader2 },
  waiting: { label: '等待中', color: 'text-amber-400', bg: 'bg-amber-400/20', icon: Clock },
  completed: { label: '已完成', color: 'text-emerald-400', bg: 'bg-emerald-400/20', icon: CheckCircle2 },
  error: { label: '错误', color: 'text-red-400', bg: 'bg-red-400/20', icon: AlertCircle },
};

const PRIORITY_CONFIG = {
  critical: { label: '紧急', color: 'text-red-400', bg: 'bg-red-400/15', border: 'border-red-400/40' },
  high: { label: '高', color: 'text-orange-400', bg: 'bg-orange-400/15', border: 'border-orange-400/40' },
  medium: { label: '中', color: 'text-amber-400', bg: 'bg-amber-400/15', border: 'border-amber-400/40' },
  low: { label: '低', color: 'text-emerald-400', bg: 'bg-emerald-400/15', border: 'border-emerald-400/40' },
};

// ==================== 预设模板 ====================

const AGENT_TEMPLATES: Record<string, { name: string; role: AgentRole; capabilities: string[] }[]> = {
  research: [
    { name: '技术调研员', role: 'researcher', capabilities: ['web_search', 'documentation', 'analysis'] },
    { name: '市场调研员', role: 'researcher', capabilities: ['web_search', 'data_analysis'] },
  ],
  development: [
    { name: '前端开发', role: 'coder', capabilities: ['code_write', 'code_review', 'testing'] },
    { name: '后端开发', role: 'coder', capabilities: ['api_design', 'database', 'testing'] },
    { name: '架构师', role: 'planner', capabilities: ['system_design', 'code_review'] },
  ],
  fullstack: [
    { name: '全栈开发', role: 'coder', capabilities: ['frontend', 'backend', 'database'] },
    { name: '测试工程师', role: 'reviewer', capabilities: ['unit_test', 'integration_test'] },
    { name: 'DevOps', role: 'executor', capabilities: ['deployment', 'monitoring'] },
  ],
};

// ==================== 辅助函数 ====================

const generateId = () => `agent_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
};

// ==================== Agent 卡片组件 ====================

interface AgentCardProps {
  agent: TeamAgent;
  isSelected: boolean;
  onSelect: (agent: TeamAgent) => void;
  onStartTask: (agentId: string) => void;
  compact?: boolean;
}

const AgentCard = memo(function AgentCard({ agent, isSelected, onSelect, onStartTask, compact }: AgentCardProps) {
  const roleConfig = ROLE_CONFIG[agent.role];
  const statusConfig = STATUS_CONFIG[agent.status];
  const StatusIcon = statusConfig.icon;
  const RoleIcon = roleConfig.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onClick={() => onSelect(agent)}
      className={`
        relative p-3 rounded-xl border cursor-pointer transition-all duration-200
        ${isSelected ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'}
        ${agent.status === 'working' || agent.status === 'thinking' ? 'ring-1 ring-primary/50' : ''}
      `}
    >
      {/* 状态指示灯 */}
      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
        agent.status === 'working' || agent.status === 'thinking' ? 'bg-primary animate-pulse' :
        agent.status === 'completed' ? 'bg-emerald-400' :
        agent.status === 'error' ? 'bg-red-400' : 'bg-slate-500'
      }`} />

      {/* 内容 */}
      <div className="flex items-start gap-3">
        {/* 头像 */}
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${roleConfig.bg}`}>
          <RoleIcon size={18} className={roleConfig.color} />
        </div>

        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium text-sm text-white truncate">{agent.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-1.5 py-0.5 rounded ${roleConfig.bg} ${roleConfig.color}`}>
              {roleConfig.label}
            </span>
            <span className={`flex items-center gap-1 text-xs ${statusConfig.color}`}>
              <StatusIcon size={10} className={agent.status === 'working' || agent.status === 'thinking' ? 'animate-spin' : ''} />
              {statusConfig.label}
            </span>
          </div>
        </div>
      </div>

      {/* 当前任务 */}
      {agent.currentTask && (
        <div className="mt-2 text-xs text-slate-400 truncate">
          任务: {agent.currentTask}
        </div>
      )}

      {/* 进度条 */}
      {(agent.status === 'working' || agent.status === 'thinking') && (
        <div className="mt-2">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-cyan-400"
              initial={{ width: 0 }}
              animate={{ width: `${agent.progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      {/* 能力标签 */}
      {!compact && agent.capabilities.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {agent.capabilities.slice(0, 3).map((cap) => (
            <span key={cap} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
              {cap}
            </span>
          ))}
          {agent.capabilities.length > 3 && (
            <span className="text-[10px] text-slate-500">+{agent.capabilities.length - 3}</span>
          )}
        </div>
      )}

      {/* 结果 */}
      {agent.result && (
        <div className="mt-2 p-2 rounded bg-emerald-400/10 border border-emerald-400/20">
          <p className="text-xs text-emerald-400 line-clamp-2">{agent.result}</p>
        </div>
      )}
    </motion.div>
  );
});

// ==================== 任务卡片组件 ====================

interface TaskCardProps {
  task: TeamTask;
  isSelected: boolean;
  onSelect: (task: TeamTask) => void;
  onAssign: (taskId: string, agentId: string) => void;
  agents: TeamAgent[];
}

const TaskCard = memo(function TaskCard({ task, isSelected, onSelect, onAssign, agents }: TaskCardProps) {
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const assignedAgent = agents.find((a) => a.id === task.assignedAgent);

  const statusIcon = {
    pending: <Clock size={12} className="text-slate-400" />,
    assigned: <ArrowRight size={12} className="text-blue-400" />,
    running: <Loader2 size={12} className="text-primary animate-spin" />,
    completed: <CheckCircle2 size={12} className="text-emerald-400" />,
    failed: <XCircle size={12} className="text-red-400" />,
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      onClick={() => onSelect(task)}
      className={`
        relative overflow-hidden rounded-lg border cursor-pointer transition-all duration-200
        ${priorityConfig.bg} ${priorityConfig.border}
        ${isSelected ? 'ring-1 ring-primary/30' : ''}
        hover:shadow-lg
      `}
    >
      {/* 优先级条 */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${priorityConfig.color}`} />

      <div className="pl-3 pr-3 py-2">
        {/* 头部 */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-1.5 py-0.5 rounded ${priorityConfig.bg} ${priorityConfig.color}`}>
              {priorityConfig.label}
            </span>
            <span className="flex items-center gap-1">
              {statusIcon[task.status]}
            </span>
          </div>
          {task.status === 'pending' && (
            <select
              className="text-xs bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-slate-300"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                if (e.target.value) onAssign(task.id, e.target.value);
              }}
              defaultValue=""
            >
              <option value="" disabled>分配</option>
              {agents.filter((a) => a.status === 'idle' || a.status === 'completed').map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* 标题 */}
        <h4 className="font-medium text-sm text-white truncate">{task.title}</h4>

        {/* 描述 */}
        {task.description && (
          <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{task.description}</p>
        )}

        {/* 分配信息 */}
        {assignedAgent && (
          <div className="flex items-center gap-1 mt-1.5 text-xs text-blue-400">
            <Bot size={10} />
            <span>{assignedAgent.name}</span>
          </div>
        )}

        {/* 依赖 */}
        {task.dependencies.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <GitBranch size={10} className="text-slate-500" />
            <span className="text-[10px] text-slate-500">依赖 {task.dependencies.length} 个任务</span>
          </div>
        )}

        {/* 进度条 */}
        {task.status === 'running' && (
          <div className="mt-2">
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-cyan-400"
                initial={{ width: 0 }}
                animate={{ width: `${task.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* 结果 */}
        {task.result && (
          <div className="mt-2 p-1.5 rounded bg-emerald-400/10">
            <p className="text-xs text-emerald-400 line-clamp-2">{task.result}</p>
          </div>
        )}

        {/* 错误 */}
        {task.error && (
          <div className="mt-2 p-1.5 rounded bg-red-400/10">
            <p className="text-xs text-red-400 line-clamp-2">{task.error}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
});

// ==================== 布局切换器 ====================

interface LayoutSwitcherProps {
  value: LayoutMode;
  onChange: (layout: LayoutMode) => void;
}

const LayoutSwitcher = memo(function LayoutSwitcher({ value, onChange }: LayoutSwitcherProps) {
  const options: { value: LayoutMode; icon: typeof MessageSquare; label: string }[] = [
    { value: 'single', icon: MessageSquare, label: '单窗口' },
    { value: 'dual', icon: SplitSquareHorizontal, label: '双屏对比' },
    { value: 'grid-2x2', icon: Grid3x3, label: '网格 2x2' },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-white/5 rounded-lg">
      {options.map(({ value: v, icon: Icon, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`
            p-1.5 rounded transition-all duration-200
            ${value === v ? 'bg-primary text-primary-foreground' : 'text-slate-400 hover:text-white hover:bg-white/10'}
          `}
          title={label}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
});

// ==================== 主组件 ====================

interface AgentTeamOrchestratorProps {
  className?: string;
  initialAgents?: TeamAgent[];
  initialTasks?: TeamTask[];
  onCollaborationStart?: (tasks: TeamTask[], mode: CoordinationMode) => void;
  onCollaborationUpdate?: (result: CollaborationResult) => void;
  onCollaborationComplete?: (result: CollaborationResult) => void;
}

export const AgentTeamOrchestrator = memo(function AgentTeamOrchestrator({
  className = '',
  initialAgents = [],
  initialTasks = [],
  onCollaborationStart,
  onCollaborationUpdate,
  onCollaborationComplete,
}: AgentTeamOrchestratorProps) {
  // ==================== 状态 ====================
  const [agents, setAgents] = useState<TeamAgent[]>(initialAgents);
  const [tasks, setTasks] = useState<TeamTask[]>(initialTasks);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutMode>('single');
  const [coordinationMode, setCoordinationMode] = useState<CoordinationMode>('collaborative');
  const [isRunning, setIsRunning] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TeamTask['priority']>('medium');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [collaborationResult, setCollaborationResult] = useState<CollaborationResult | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [collaborationId, setCollaborationId] = useState<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ==================== 协作状态轮询 ====================
  const pollCollaborationStatus = useCallback((collabId: string) => {
    const pollIntervalMs = 2000;

    // 停止之前的轮询
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    const checkStatus = async () => {
      const { data } = await fetchApi<{
        success: boolean;
        collaboration: {
          id: string;
          status: string;
          summary: {
            totalTasks: number;
            completed: number;
            failed: number;
            skipped: number;
            successRate: number;
          };
          results: Array<{
            taskId: string;
            agentId: string;
            status: string;
            result?: string;
            error?: string;
            duration: number;
          }>;
        };
      }>(`/api/a2a/collaboration/${collabId}`);

      if (data?.collaboration) {
        const collab = data.collaboration;

        // 更新任务状态
        setTasks((prev) =>
          prev.map((t) => {
            const taskResult = collab.results.find((r) => r.taskId === t.id);
            return {
              ...t,
              status: taskResult?.status === 'completed' ? 'completed' :
                      taskResult?.status === 'failed' ? 'failed' : t.status,
              progress: 100,
              completedAt: taskResult ? Date.now() : undefined,
              result: taskResult?.result,
              error: taskResult?.error,
            };
          })
        );

        // 更新 Agent 状态
        setAgents((prev) =>
          prev.map((a) => {
            const agentResults = collab.results.filter((r) => r.agentId === a.id);
            const hasFailure = agentResults.some((r) => r.status === 'failed');
            const hasCompleted = agentResults.some((r) => r.status === 'completed');
            return {
              ...a,
              status: hasFailure ? 'error' : hasCompleted ? 'completed' : a.status,
              progress: 100,
              result: agentResults.map((r) => r.result).filter(Boolean).join(', ') || a.result,
            };
          })
        );

        // 如果完成或失败，停止轮询
        if (collab.status === 'completed' || collab.status === 'failed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsRunning(false);

          const result: CollaborationResult = {
            id: collab.id,
            title: 'Agent Team 协作',
            status: collab.status,
            summary: collab.summary,
            results: collab.results.map((r) => ({
              taskId: r.taskId,
              agentId: r.agentId,
              status: r.status as TaskStatus,
              result: r.result,
              error: r.error,
              duration: r.duration,
            })),
            duration: Date.now() - startTimeRef.current,
          };

          setCollaborationResult(result);
          onCollaborationComplete?.(result);
        }
      }
    };

    pollIntervalRef.current = setInterval(checkStatus, pollIntervalMs);
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [onCollaborationComplete]);

  // ==================== 计算属性 ====================
  const selectedAgent = useMemo(() => agents.find((a) => a.id === selectedAgentId), [agents, selectedAgentId]);
  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedTaskId), [tasks, selectedTaskId]);

  const stats = useMemo(() => ({
    totalAgents: agents.length,
    idleAgents: agents.filter((a) => a.status === 'idle' || a.status === 'completed').length,
    workingAgents: agents.filter((a) => a.status === 'working' || a.status === 'thinking').length,
    totalTasks: tasks.length,
    pendingTasks: tasks.filter((t) => t.status === 'pending').length,
    runningTasks: tasks.filter((t) => t.status === 'running').length,
    completedTasks: tasks.filter((t) => t.status === 'completed').length,
    failedTasks: tasks.filter((t) => t.status === 'failed').length,
  }), [agents, tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterStatus !== 'all' && task.status !== filterStatus) return false;
      return true;
    });
  }, [tasks, searchQuery, filterStatus]);

  // ==================== 轮询清理 ====================
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // ==================== 定时器 ====================
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      startTimeRef.current = Date.now();
      interval = setInterval(() => {
        setElapsedTime(Date.now() - startTimeRef.current);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  // ==================== 操作函数 ====================
  const addAgent = useCallback((template: { name: string; role: AgentRole; capabilities: string[] }) => {
    const newAgent: TeamAgent = {
      id: generateId(),
      name: template.name,
      role: template.role,
      status: 'idle',
      capabilities: template.capabilities,
      progress: 0,
      lastActive: Date.now(),
    };
    setAgents((prev) => [...prev, newAgent]);
  }, []);

  const addTask = useCallback(() => {
    if (!newTaskTitle.trim()) return;
    const newTask: TeamTask = {
      id: generateId(),
      title: newTaskTitle,
      description: newTaskDesc,
      status: 'pending',
      priority: newTaskPriority,
      dependencies: [],
      progress: 0,
      createdAt: Date.now(),
    };
    setTasks((prev) => [...prev, newTask]);
    setNewTaskTitle('');
    setNewTaskDesc('');
    setShowAddTask(false);
  }, [newTaskTitle, newTaskDesc, newTaskPriority]);

  const assignTask = useCallback((taskId: string, agentId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: 'assigned', assignedAgent: agentId } : t
      )
    );
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId ? { ...a, status: 'waiting', currentTask: tasks.find((t) => t.id === taskId)?.title } : a
      )
    );
  }, [tasks]);

  const startCollaboration = useCallback(async () => {
    if (tasks.length === 0) return;

    setIsRunning(true);
    setElapsedTime(0);
    setCollaborationResult(null);

    // 触发开始回调
    onCollaborationStart?.(tasks, coordinationMode);

    // 准备任务数据，转换为后端格式
    const taskDefinitions = tasks.map((t) => ({
      id: t.id,
      task: t.title,
      description: t.description,
      agentName: agents.find((a) => a.id === t.assignedAgent)?.name || 'assistant',
      dependencies: t.dependencies,
      priority: t.priority === 'critical' ? 3 : t.priority === 'high' ? 2 : t.priority === 'medium' ? 1 : 0,
      timeout: 60000,
    }));

    // 更新任务状态为 running
    setTasks((prev) =>
      prev.map((t) => ({
        ...t,
        status: t.assignedAgent ? 'running' : 'pending',
        startedAt: t.assignedAgent ? Date.now() : undefined,
      }))
    );

    // 更新 Agent 状态
    setAgents((prev) =>
      prev.map((a) => {
        const task = tasks.find((t) => t.assignedAgent === a.id);
        return task ? { ...a, status: 'working', progress: 0 } : a;
      })
    );

    try {
      // 调用后端协作 API
      const { data, error } = await fetchApi<{
        success: boolean;
        collaboration: {
          id: string;
          title: string;
          status: string;
          summary: {
            totalTasks: number;
            completed: number;
            failed: number;
            skipped: number;
            successRate: number;
          };
          results: Array<{
            taskId: string;
            agentId: string;
            status: string;
            result?: string;
            error?: string;
            duration: number;
          }>;
          duration: number;
        };
      }>('/api/a2a/collaborate', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Agent Team 协作任务',
          tasks: taskDefinitions,
          options: {
            coordinationMode,
            useSSE: true,
            enableHooks: true,
          },
        }),
        timeout: 300000, // 5分钟超时
      });

      if (error) {
        throw error;
      }

      const collaboration = data?.collaboration;

      if (collaboration) {
        // 存储协作 ID 并订阅 SSE 更新
        setCollaborationId(collaboration.id);

        // 如果后端已完成（同步模式），直接处理结果
        if (collaboration.status === 'completed' || collaboration.status === 'failed') {
          setIsRunning(false);
        } else {
          // 否则轮询获取实时更新
          pollCollaborationStatus(collaboration.id);
        }

        // 更新任务状态
        setTasks((prev) =>
          prev.map((t) => {
            const taskResult = collaboration.results.find((r) => r.taskId === t.id);
            return {
              ...t,
              status: taskResult?.status === 'completed' ? 'completed' :
                      taskResult?.status === 'failed' ? 'failed' : t.status,
              progress: 100,
              completedAt: Date.now(),
              result: taskResult?.result,
              error: taskResult?.error,
            };
          })
        );

        // 更新 Agent 状态
        setAgents((prev) =>
          prev.map((a) => {
            const agentResults = collaboration.results.filter((r) => r.agentId === a.id);
            const hasFailure = agentResults.some((r) => r.status === 'failed');
            return {
              ...a,
              status: hasFailure ? 'error' : 'completed',
              progress: 100,
              result: agentResults.map((r) => r.result).filter(Boolean).join(', ') || undefined,
            };
          })
        );

        // 生成结果
        const result: CollaborationResult = {
          id: collaboration.id,
          title: collaboration.title,
          status: collaboration.status as CollaborationResult['status'],
          summary: collaboration.summary,
          results: collaboration.results.map((r) => ({
            taskId: r.taskId,
            agentId: r.agentId,
            status: r.status as TaskStatus,
            result: r.result,
            error: r.error,
            duration: r.duration,
          })),
          duration: collaboration.duration,
        };

        setCollaborationResult(result);
        onCollaborationComplete?.(result);
      }
    } catch (err) {
      console.error('Collaboration error:', err);

      // 更新任务和 Agent 状态为错误
      setTasks((prev) =>
        prev.map((t) => ({
          ...t,
          status: 'failed',
          error: err instanceof Error ? err.message : '执行失败',
        }))
      );

      setAgents((prev) =>
        prev.map((a) => ({
          ...a,
          status: 'error',
          result: undefined,
        }))
      );

      const errorResult: CollaborationResult = {
        id: generateId(),
        title: '协作任务',
        status: 'failed',
        summary: {
          totalTasks: tasks.length,
          completed: 0,
          failed: tasks.length,
          skipped: 0,
          successRate: 0,
        },
        results: tasks.map((t) => ({
          taskId: t.id,
          agentId: t.assignedAgent || '',
          status: 'failed' as TaskStatus,
          error: err instanceof Error ? err.message : '执行失败',
          duration: 0,
        })),
        duration: elapsedTime,
      };

      setCollaborationResult(errorResult);
      onCollaborationComplete?.(errorResult);
    }

    setIsRunning(false);
  }, [tasks, agents, coordinationMode, elapsedTime, onCollaborationStart, onCollaborationComplete]);

  const stopCollaboration = useCallback(() => {
    // 停止轮询
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // 取消后端协作任务
    if (collaborationId) {
      fetchApi(`/api/a2a/collaboration/${collaborationId}`, {
        method: 'DELETE',
      }).catch((err) => console.error('Failed to cancel collaboration:', err));
    }

    setIsRunning(false);
    setCollaborationId(null);
    setAgents((prev) =>
      prev.map((a) => ({
        ...a,
        status: 'idle',
        progress: 0,
        currentTask: undefined,
      }))
    );
    setTasks((prev) =>
      prev.map((t) => ({
        ...t,
        status: t.status === 'running' ? 'pending' : t.status,
        progress: 0,
      }))
    );
  }, [collaborationId]);

  const resetAll = useCallback(() => {
    setIsRunning(false);
    setElapsedTime(0);
    setCollaborationResult(null);
    setAgents((prev) =>
      prev.map((a) => ({
        ...a,
        status: 'idle',
        progress: 0,
        currentTask: undefined,
        result: undefined,
      }))
    );
    setTasks((prev) =>
      prev.map((t) => ({
        ...t,
        status: 'pending',
        progress: 0,
        assignedAgent: undefined,
        result: undefined,
        error: undefined,
        startedAt: undefined,
        completedAt: undefined,
      }))
    );
  }, []);

  const deleteAgent = useCallback((id: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== id));
    setTasks((prev) =>
      prev.map((t) => (t.assignedAgent === id ? { ...t, assignedAgent: undefined, status: 'pending' } : t))
    );
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ==================== 渲染 ====================
  return (
    <div className={`flex flex-col h-full bg-slate-900 text-white overflow-hidden ${className}`}>
      {/* 顶部状态栏 */}
      <div className="flex-shrink-0 border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-400/20 flex items-center justify-center">
              <Users size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Agent Team 编排器</h1>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>{stats.totalAgents} 个 Agent</span>
                <span>|</span>
                <span>{stats.totalTasks} 个任务</span>
                {isRunning && (
                  <>
                    <span>|</span>
                    <span className="text-primary animate-pulse">
                      运行中 {formatDuration(elapsedTime)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 布局切换 */}
            <LayoutSwitcher value={layout} onChange={setLayout} />

            {/* 协调模式 */}
            <select
              value={coordinationMode}
              onChange={(e) => setCoordinationMode(e.target.value as CoordinationMode)}
              className="px-3 py-1.5 text-xs bg-white/10 border border-white/20 rounded-lg text-slate-300"
              disabled={isRunning}
            >
              <option value="collaborative">协作模式</option>
              <option value="team_leader">主从模式</option>
              <option value="autonomous">自主模式</option>
            </select>

            {/* 操作按钮 */}
            {!isRunning ? (
              <motion.button
                onClick={startCollaboration}
                disabled={tasks.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm disabled:opacity-50"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Play size={16} />
                开始执行
              </motion.button>
            ) : (
              <motion.button
                onClick={stopCollaboration}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg font-medium text-sm"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Pause size={16} />
                停止
              </motion.button>
            )}

            <motion.button
              onClick={resetAll}
              className="p-2 bg-white/10 rounded-lg hover:bg-white/20"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="重置"
            >
              <RotateCcw size={16} />
            </motion.button>
          </div>
        </div>

        {/* 统计条 */}
        <div className="flex items-center gap-6 px-4 py-2 bg-white/5 text-xs">
          <div className="flex items-center gap-2">
            <Bot size={12} className="text-slate-400" />
            <span className="text-slate-400">空闲:</span>
            <span className="text-white font-medium">{stats.idleAgents}</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-primary" />
            <span className="text-slate-400">工作中:</span>
            <span className="text-white font-medium">{stats.workingAgents}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-amber-400" />
            <span className="text-slate-400">待分配:</span>
            <span className="text-white font-medium">{stats.pendingTasks}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={12} className="text-emerald-400" />
            <span className="text-slate-400">完成:</span>
            <span className="text-white font-medium">{stats.completedTasks}</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle size={12} className="text-red-400" />
            <span className="text-slate-400">失败:</span>
            <span className="text-white font-medium">{stats.failedTasks}</span>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧: Agent 池 */}
        <div className="w-80 border-r border-white/10 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
            <span className="text-sm font-medium">Agent 池</span>
            <div className="flex items-center gap-1">
              <select
                onChange={(e) => {
                  const template = AGENT_TEMPLATES[e.target.value];
                  if (template) {
                    template.forEach((t) => addAgent(t));
                  }
                }}
                className="text-xs bg-white/10 border border-white/20 rounded px-2 py-1 text-slate-300"
                defaultValue=""
              >
                <option value="" disabled>添加 Agent...</option>
                <option value="research">调研组</option>
                <option value="development">开发组</option>
                <option value="fullstack">全栈组</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 mc-scrollbar">
            {agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <Bot size={40} className="text-slate-600 mb-3" />
                <p className="text-sm text-slate-400">暂无 Agent</p>
                <p className="text-xs text-slate-500 mt-1">从预设模板添加或自定义创建</p>
              </div>
            ) : (
              <AnimatePresence>
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    isSelected={agent.id === selectedAgentId}
                    onSelect={(agent) => setSelectedAgentId(agent.id)}
                    onStartTask={(agentId) => {
                      const pendingTask = tasks.find((t) => t.status === 'pending');
                      if (pendingTask) assignTask(pendingTask.id, agentId);
                    }}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* 中间: 任务队列 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 搜索和筛选 */}
          <div className="px-4 py-2 border-b border-white/10 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索任务..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded text-slate-200 placeholder:text-slate-500"
                />
              </div>
              <button
                onClick={() => setShowAddTask(true)}
                className="p-1.5 bg-primary/20 text-primary rounded hover:bg-primary/30"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* 筛选按钮 */}
            <div className="flex items-center gap-1">
              {(['all', 'pending', 'assigned', 'running', 'completed', 'failed'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`
                    px-2 py-0.5 text-xs rounded transition-colors
                    ${filterStatus === status ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-slate-400 hover:bg-white/10'}
                  `}
                >
                  {status === 'all' ? '全部' :
                   status === 'pending' ? '待分配' :
                   status === 'assigned' ? '已分配' :
                   status === 'running' ? '进行中' :
                   status === 'completed' ? '已完成' : '失败'}
                </button>
              ))}
            </div>
          </div>

          {/* 添加任务表单 */}
          <AnimatePresence>
            {showAddTask && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-b border-white/10 overflow-hidden"
              >
                <div className="p-4 space-y-3 bg-white/5">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="任务标题"
                    className="w-full px-3 py-2 text-sm bg-white/10 border border-white/20 rounded text-white placeholder:text-slate-500"
                    autoFocus
                  />
                  <textarea
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                    placeholder="任务描述（可选）"
                    rows={2}
                    className="w-full px-3 py-2 text-sm bg-white/10 border border-white/20 rounded text-white placeholder:text-slate-500 resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <select
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value as TeamTask['priority'])}
                      className="px-3 py-1.5 text-xs bg-white/10 border border-white/20 rounded text-slate-300"
                    >
                      <option value="critical">紧急</option>
                      <option value="high">高</option>
                      <option value="medium">中</option>
                      <option value="low">低</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowAddTask(false)}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                      >
                        取消
                      </button>
                      <button
                        onClick={addTask}
                        disabled={!newTaskTitle.trim()}
                        className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
                      >
                        添加
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 任务列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 mc-scrollbar">
            {filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <Target size={40} className="text-slate-600 mb-3" />
                <p className="text-sm text-slate-400">暂无任务</p>
                <p className="text-xs text-slate-500 mt-1">点击上方 + 按钮添加新任务</p>
              </div>
            ) : (
              <AnimatePresence>
                {filteredTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isSelected={task.id === selectedTaskId}
                    onSelect={(task) => setSelectedTaskId(task.id)}
                    onAssign={assignTask}
                    agents={agents}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* 右侧: 结果面板 */}
        <div className="w-80 border-l border-white/10 flex flex-col">
          <div className="px-4 py-2 border-b border-white/10">
            <span className="text-sm font-medium">执行结果</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 mc-scrollbar">
            {collaborationResult ? (
              <div className="space-y-4">
                {/* 结果汇总 */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-400/10 to-cyan-400/10 border border-emerald-400/20">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 size={20} className="text-emerald-400" />
                    <span className="font-medium">执行完成</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400">总任务</span>
                      <p className="text-lg font-bold">{collaborationResult.summary.totalTasks}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">成功率</span>
                      <p className="text-lg font-bold text-emerald-400">
                        {(collaborationResult.summary.successRate * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">完成</span>
                      <p className="text-lg font-bold text-emerald-400">{collaborationResult.summary.completed}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">失败</span>
                      <p className="text-lg font-bold text-red-400">{collaborationResult.summary.failed}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/10 text-xs text-slate-400">
                    耗时: {formatDuration(collaborationResult.duration)}
                  </div>
                </div>

                {/* 任务详情 */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-slate-400">任务详情</h4>
                  {collaborationResult.results.map((r, i) => {
                    const agent = agents.find((a) => a.id === r.agentId);
                    const task = tasks.find((t) => t.id === r.taskId);
                    return (
                      <div key={i} className="p-2 rounded bg-white/5 border border-white/10">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium truncate">{task?.title || r.taskId}</span>
                          <span className={`text-[10px] ${r.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {r.status === 'completed' ? '成功' : '失败'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {agent?.name || '未分配'} • {formatDuration(r.duration)}
                        </div>
                        {r.result && (
                          <p className="mt-1 text-xs text-slate-400 line-clamp-2">{r.result}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <Layers size={40} className="text-slate-600 mb-3" />
                <p className="text-sm text-slate-400">暂无执行结果</p>
                <p className="text-xs text-slate-500 mt-1">开始执行后显示结果</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default AgentTeamOrchestrator;
