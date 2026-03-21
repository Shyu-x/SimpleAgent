'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import {
  X,
  Bot,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
  Users,
  Target,
  ArrowRight,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Maximize2,
  Minimize2,
  FileText,
  Code,
  BarChart3,
  Pause,
  Square,
  Plus,
  Trash2,
  Settings,
  AlertCircle,
} from 'lucide-react';
import { useMultiAgent, AGENT_TEMPLATES } from '@/hooks/useMultiAgent';
import { agentWorkflowAPI } from '@/lib/agentWorkflowAPI';

// 浮动动画
const floatAnimation: Variants = {
  initial: { y: 0 },
  animate: {
    y: [0, -6, 0],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};

// 脉冲动画
const pulseAnimation: Variants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.05, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};

// 卡片动画变体
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.1,
      duration: 0.3,
      ease: [0.25, 0.46, 0.45, 0.94] as const
    }
  }),
  hover: {
    y: -3,
    scale: 1.02,
    boxShadow: '0 12px 24px hsl(var(--text-main) / 0.12)',
    transition: { duration: 0.2 }
  }
};

// 状态颜色映射
const statusColors: Record<string, { bg: string; text: string; icon: string; border?: string }> = {
  idle: { bg: 'bg-muted', text: 'text-muted-foreground', icon: 'text-muted-foreground', border: 'border-border' },
  pending: { bg: 'bg-muted/70', text: 'text-muted-foreground', icon: 'text-muted-foreground', border: 'border-border' },
  assigned: { bg: 'bg-[hsl(var(--accent-500))/0.14]', text: 'text-[hsl(var(--accent-500))]', icon: 'text-[hsl(var(--accent-500))]', border: 'border-[hsl(var(--accent-500))/0.32]' },
  running: { bg: 'bg-primary/15', text: 'text-primary', icon: 'text-primary', border: 'border-primary/30' },
  completed: { bg: 'bg-[hsl(var(--success-500))/0.14]', text: 'text-[hsl(var(--success-500))]', icon: 'text-[hsl(var(--success-500))]', border: 'border-[hsl(var(--success-500))/0.32]' },
  error: { bg: 'bg-destructive/15', text: 'text-destructive', icon: 'text-destructive', border: 'border-destructive/30' }
};

// Agent 状态类型
type AgentStatus = 'idle' | 'running' | 'completed' | 'error';

// 任务状态类型
type TaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'error';

// Agent 节点接口
interface AgentNode {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  progress: number;
  currentTask?: string;
  result?: string;
  startTime?: number;
  endTime?: number;
}

// 任务节点接口
interface TaskNode {
  id: string;
  description: string;
  status: TaskStatus;
  assignedAgent?: string;
  dependencies: string[];
  result?: string;
  startTime?: number;
  endTime?: number;
}

// 工作流状态
interface WorkflowState {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  agents: AgentNode[];
  tasks: TaskNode[];
  startTime?: number;
  endTime?: number;
  logs: LogEntry[];
}

// 日志条目
interface LogEntry {
  id: string;
  timestamp: number;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  agentId?: string;
  taskId?: string;
}

// 预设工作流数据
const PRESET_WORKFLOWS = [
  {
    id: 'research-write',
    name: '调研写作',
    description: '研究 → 写作 → 编辑',
    agents: ['researcher', 'writer', 'editor'],
    tasks: ['调研主题', '撰写内容', '编辑优化'],
  },
  {
    id: 'code-development',
    name: '代码开发',
    description: '编码 → 审查 → 修复',
    agents: ['coder', 'reviewer'],
    tasks: ['编写代码', '代码审查', '修复问题'],
  },
  {
    id: 'multi-analysis',
    name: '多角度分析',
    description: '并行调研 + 汇总',
    agents: ['researcher', 'researcher', 'writer'],
    tasks: ['技术调研', '市场调研', '汇总报告'],
  },
];

interface MultiAgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// 任务输入对话框
interface TaskInputDialogProps {
  isOpen: boolean;
  taskDescription: string;
  onConfirm: (input: string) => void;
  onCancel: () => void;
}

function TaskInputDialog({ isOpen, taskDescription, onConfirm, onCancel }: TaskInputDialogProps) {
  const [input, setInput] = useState('');

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-background rounded-2xl border shadow-2xl p-6 w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-lg mb-4">输入任务</h3>
        <p className="text-sm text-muted-foreground mb-4">{taskDescription}</p>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="请输入任务内容..."
          className="w-full h-32 p-3 border rounded-xl resize-none bg-muted/50 focus:ring-2 focus:ring-primary focus:outline-none"
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-xl border hover:bg-muted transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(input)}
            className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            开始执行
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function MultiAgentPanel({ isOpen, onClose }: MultiAgentPanelProps) {
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [taskInputValue, setTaskInputValue] = useState('');
  const [engineSessionId, setEngineSessionId] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isExecutingRef = useRef(false);

  // 初始化工作流
  const initWorkflow = useCallback((preset: typeof PRESET_WORKFLOWS[0]) => {
    const agents: AgentNode[] = preset.agents.map((agentId, i) => {
      const template = AGENT_TEMPLATES.find(t => t.id === agentId) || AGENT_TEMPLATES[0];
      return {
        id: `agent-${i}`,
        name: template.role,
        role: agentId,
        status: 'idle' as AgentStatus,
        progress: 0,
      };
    });

    const tasks: TaskNode[] = preset.tasks.map((desc, i) => ({
      id: `task-${i}`,
      description: desc,
      status: 'pending' as TaskStatus,
      dependencies: i > 0 ? [`task-${i - 1}`] : [],
    }));

    setWorkflow({
      id: `workflow-${Date.now()}`,
      name: preset.name,
      status: 'idle',
      agents,
      tasks,
      logs: [],
    });
  }, []);

  // 添加日志
  const addLog = useCallback((type: LogEntry['type'], message: string, agentId?: string, taskId?: string) => {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      type,
      message,
      agentId,
      taskId,
    };
    setWorkflow(prev => prev ? { ...prev, logs: [...prev.logs, entry] } : null);
  }, []);

  // 健康检查
  useEffect(() => {
    if (!isOpen) return;

    const checkHealth = async () => {
      try {
        const response = await agentWorkflowAPI.healthCheck();
        setHealthStatus(response.success ? 'ok' : 'error');
      } catch {
        setHealthStatus('error');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // 轮询引擎状态（当有活跃执行时）
  useEffect(() => {
    if (!engineSessionId || !isRunning) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    const pollStatus = async () => {
      try {
        const response = await agentWorkflowAPI.getEngineStatus(engineSessionId);
        if (response.success && response.data) {
          const { state } = response.data;

          // 更新 Agent 状态
          if (state.status === 'running') {
            setWorkflow((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                status: 'running',
              };
            });
          } else if (state.status === 'completed') {
            setIsRunning(false);
            setWorkflow((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                status: 'completed',
                endTime: Date.now(),
              };
            });
            addLog('success', '工作流执行完成');
          } else if (state.status === 'error') {
            setIsRunning(false);
            setWorkflow((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                status: 'error',
                endTime: Date.now(),
              };
            });
            addLog('error', `执行出错: ${(state as { error?: string }).error || '未知错误'}`);
          } else if (state.status === 'paused') {
            setIsPaused(true);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    pollingIntervalRef.current = setInterval(pollStatus, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [engineSessionId, isRunning]);

  // 清理引擎
  const cleanupEngine = useCallback(async () => {
    if (engineSessionId) {
      try {
        await agentWorkflowAPI.deleteEngine(engineSessionId);
      } catch (error) {
        console.error('Failed to delete engine:', error);
      }
      setEngineSessionId(null);
    }
  }, [engineSessionId]);

  // 使用后端执行工作流
  const runWorkflowWithBackend = useCallback(async (initialInput: string) => {
    if (!workflow || isExecutingRef.current) return;

    isExecutingRef.current = true;
    setIsRunning(true);
    setIsPaused(false);

    // 创建引擎
    const createResponse = await agentWorkflowAPI.createEngine({
      options: {
        maxIterations: 50,
        enableCheckpoint: true,
        enableMemory: true,
      },
    });

    if (!createResponse.success || !createResponse.data) {
      addLog('error', `创建引擎失败: ${createResponse.error}`);
      setIsRunning(false);
      isExecutingRef.current = false;
      return;
    }

    // 后端返回格式: { success: true, engine: { sessionId: "..." } }
    const sessionId = (createResponse.data as any).engine?.sessionId || createResponse.data.sessionId;
    if (!sessionId) {
      addLog('error', '无法获取引擎会话ID');
      setIsRunning(false);
      isExecutingRef.current = false;
      return;
    }

    setEngineSessionId(sessionId);

    setWorkflow((prev) => prev ? { ...prev, status: 'running', startTime: Date.now() } : null);
    addLog('info', '创建执行引擎成功，开始执行工作流...');

    // 执行每个任务
    for (let i = 0; i < workflow.tasks.length; i++) {
      if (!isExecutingRef.current) break; // 被停止

      // 等待恢复
      while (isPaused && isExecutingRef.current) {
        await new Promise((r) => setTimeout(r, 500));

        // 检查是否被停止
        const statusResponse = await agentWorkflowAPI.getEngineStatus(sessionId);
        if (statusResponse.success && statusResponse.data?.state.status === 'idle') {
          isExecutingRef.current = false;
          setIsRunning(false);
          return;
        }
      }

      const task = workflow.tasks[i];
      const agent = workflow.agents[i % workflow.agents.length];

      // 更新任务状态
      setWorkflow((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === task.id ? { ...t, status: 'running' as TaskStatus, assignedAgent: agent.id, startTime: Date.now() } : t
          ),
          agents: prev.agents.map((a) =>
            a.id === agent.id ? { ...a, status: 'running' as AgentStatus, progress: 0, currentTask: task.description } : a
          ),
        };
      });

      addLog('info', `${agent.name} 开始执行: ${task.description}`, agent.id, task.id);

      // 构建任务提示
      const taskPrompt = `【角色】${agent.name}\n【任务】${task.description}\n【输入】${initialInput || '无'}`;

      // 执行任务
      const executeResponse = await agentWorkflowAPI.executeTask(sessionId, taskPrompt, {
        agent: agent.role,
        taskId: task.id,
      });

      if (executeResponse.success && executeResponse.data) {
        // 提取结果（兼容不同的响应格式）
        const resultData = (executeResponse.data as any).result || executeResponse.data;
        const result = resultData.finalResult || resultData.result || '执行完成';

        setWorkflow((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === task.id
                ? { ...t, status: 'completed' as TaskStatus, endTime: Date.now(), result }
                : t
            ),
            agents: prev.agents.map((a) =>
              a.id === agent.id
                ? { ...a, status: 'completed' as AgentStatus, progress: 100, currentTask: undefined, endTime: Date.now(), result }
                : a
            ),
          };
        });

        addLog('success', `${agent.name} 完成任务: ${task.description}`, agent.id, task.id);

        // 更新输入供下一个任务使用
        initialInput = result;
      } else {
        const errorMsg = executeResponse.error || '任务执行失败';

        setWorkflow((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === task.id
                ? { ...t, status: 'error' as TaskStatus, endTime: Date.now(), result: errorMsg }
                : t
            ),
            agents: prev.agents.map((a) =>
              a.id === agent.id
                ? { ...a, status: 'error' as AgentStatus, currentTask: undefined, endTime: Date.now() }
                : a
            ),
          };
        });

        addLog('error', `${agent.name} 任务失败: ${task.description}`, agent.id, task.id);

        // 遇到错误时停止
        break;
      }
    }

    // 清理引擎
    await cleanupEngine();

    // 检查最终状态
    const hasErrors = workflow.tasks.some((t) => {
      const taskState = workflow.tasks.find((task) => task.id === t.id);
      return taskState?.status === 'error';
    });

    setWorkflow((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        status: hasErrors ? 'error' : 'completed',
        endTime: Date.now(),
      };
    });

    if (hasErrors) {
      addLog('error', '工作流执行遇到错误');
    } else {
      addLog('success', '工作流执行完成');
    }

    setIsRunning(false);
    isExecutingRef.current = false;
  }, [workflow, isPaused, addLog, cleanupEngine]);

  // 显示任务输入对话框并执行
  const handleStartExecution = useCallback(() => {
    if (!workflow) return;

    // 收集所有任务描述作为输入提示
    const taskDescriptions = workflow.tasks.map((t) => `- ${t.description}`).join('\n');
    setTaskInputValue(taskDescriptions);
    setShowTaskInput(true);
  }, [workflow]);

  const handleTaskInputConfirm = useCallback(async (input: string) => {
    setShowTaskInput(false);
    await runWorkflowWithBackend(input);
  }, [runWorkflowWithBackend]);

  // 暂停工作流
  const pauseWorkflow = useCallback(async () => {
    if (!engineSessionId) return;

    try {
      await agentWorkflowAPI.pauseEngine(engineSessionId);
      setIsPaused(true);
      addLog('warning', '工作流已暂停');
    } catch (error) {
      console.error('Failed to pause:', error);
    }
  }, [engineSessionId, addLog]);

  // 恢复工作流
  const resumeWorkflow = useCallback(async () => {
    if (!engineSessionId) return;

    try {
      await agentWorkflowAPI.resumeEngine(engineSessionId);
      setIsPaused(false);
      addLog('info', '工作流已恢复');
    } catch (error) {
      console.error('Failed to resume:', error);
    }
  }, [engineSessionId, addLog]);

  // 停止工作流
  const stopWorkflow = useCallback(async () => {
    isExecutingRef.current = false;
    setIsRunning(false);
    setIsPaused(false);

    await cleanupEngine();

    setWorkflow((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        status: 'idle',
        endTime: undefined,
      };
    });

    addLog('warning', '工作流已停止');
  }, [cleanupEngine, addLog]);

  // 重置工作流
  const resetWorkflow = useCallback(() => {
    isExecutingRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    cleanupEngine();

    setWorkflow((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        status: 'idle',
        startTime: undefined,
        endTime: undefined,
        agents: prev.agents.map((a) => ({ ...a, status: 'idle' as AgentStatus, progress: 0, currentTask: undefined, result: undefined })),
        tasks: prev.tasks.map((t) => ({ ...t, status: 'pending' as TaskStatus, assignedAgent: undefined, result: undefined })),
        logs: [],
      };
    });
  }, [cleanupEngine]);

  // 计算整体进度
  const overallProgress = useMemo(() => {
    if (!workflow) return 0;
    const completed = workflow.tasks.filter(t => t.status === 'completed').length;
    return (completed / workflow.tasks.length) * 100;
  }, [workflow]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      // 清理引擎
      if (engineSessionId) {
        agentWorkflowAPI.deleteEngine(engineSessionId).catch(console.error);
      }
      // 重置执行状态
      isExecutingRef.current = false;
    };
  }, [isOpen, onClose, engineSessionId]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className={`fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 ${isFullscreen ? '' : ''}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* 任务输入对话框 */}
        <TaskInputDialog
          isOpen={showTaskInput}
          taskDescription="请输入任务内容或背景信息"
          onConfirm={handleTaskInputConfirm}
          onCancel={() => setShowTaskInput(false)}
        />

        <motion.div
          className={`bg-gradient-to-br from-background to-background/95 backdrop-blur-xl shadow-2xl border overflow-hidden flex flex-col ${
            isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-6xl h-[85vh] rounded-3xl'
          }`}
          initial={{ scale: 0.9, y: 30, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, y: 30, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {/* 头部 */}
          <div className="border-b p-6 flex items-center justify-between shrink-0 bg-gradient-to-r from-muted/30 to-muted/5">
            <div className="flex items-center gap-4">
              <motion.div
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary shadow-lg shadow-primary/20 flex items-center justify-center"
                {...floatAnimation}
              >
                <Users className="w-6 h-6 text-primary-foreground" />
              </motion.div>
              <div>
                <h2 className="font-bold text-xl">多 Agent 协作平台</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-sm text-muted-foreground">智能任务分配 · 实时执行监控 · 结果自动汇总</p>
                  <div className={`w-2 h-2 rounded-full ${
                    healthStatus === 'checking' ? 'bg-yellow-500 animate-pulse' :
                    healthStatus === 'ok' ? 'bg-green-500' : 'bg-red-500'
                  }`} title={healthStatus === 'checking' ? '检查中' : healthStatus === 'ok' ? '后端正常' : '后端异常'} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <motion.button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-3 rounded-xl hover:bg-muted transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              </motion.button>
              <motion.button
                onClick={onClose}
                className="p-3 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors"
                aria-label="关闭智能体面板"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <X size={20} />
              </motion.button>
            </div>
          </div>

          {workflow ? (
            <div className="flex-1 flex overflow-hidden">
              {/* 主要视图 */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* 进度条 */}
                <div className="p-5 border-b shrink-0 bg-gradient-to-r from-muted/20 to-muted/5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{workflow.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {workflow.tasks.filter(t => t.status === 'completed').length} / {workflow.tasks.length} 任务已完成
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        {Math.round(overallProgress)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary via-[hsl(var(--accent-500))] to-accent"
                      initial={{ width: 0 }}
                      animate={{ width: `${overallProgress}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                  <div className="flex items-center gap-6 mt-3 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock size={14} />
                      <span>
                        {workflow.startTime ? new Date(workflow.startTime).toLocaleTimeString() : '--:--'}
                        {workflow.endTime && ` ~ ${new Date(workflow.endTime).toLocaleTimeString()}`}
                      </span>
                    </div>
                    <div className={`flex items-center gap-1.5 font-medium ${
                      workflow.status === 'completed' ? 'text-[hsl(var(--success-500))]' :
                      workflow.status === 'error' ? 'text-destructive' :
                      workflow.status === 'running' ? 'text-primary' : 'text-muted-foreground'
                    }`}>
                      {workflow.status === 'running' ? <Loader2 size={14} className="animate-spin" /> :
                       workflow.status === 'completed' ? <CheckCircle size={14} /> :
                       workflow.status === 'error' ? <XCircle size={14} /> :
                       <Clock size={14} />}
                      <span>
                        {workflow.status === 'idle' ? '准备就绪' :
                         workflow.status === 'running' ? '执行中...' :
                         workflow.status === 'completed' ? '执行成功' : '执行失败'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Agent 和 Task 可视化 */}
                <div className="flex-1 p-6 overflow-auto bg-gradient-to-b from-background/50 to-background">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Agents 面板 */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur-sm py-3 z-10 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Bot size={16} className="text-primary" />
                        </div>
                        <h3 className="font-semibold">智能体 ({workflow.agents.length})</h3>
                      </div>
                      <div className="space-y-3">
                        {workflow.agents.map((agent, i) => {
                          const status = statusColors[agent.status];
                          return (
                            <motion.div
                              key={agent.id}
                              className={`p-4 rounded-xl border transition-all cursor-pointer backdrop-blur-sm bg-gradient-to-br from-card to-card/80 ${
                                selectedAgent === agent.id
                                  ? `border-primary/50 bg-primary/5 shadow-lg shadow-primary/10`
                                  : `${status.border || 'border-border'} hover:border-primary/30 hover:shadow-md`
                              }`}
                              onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <motion.div
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm shadow-sm ${status.bg} ${status.text}`}
                                    animate={agent.status === 'running' ? { rotate: 360 } : {}}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                  >
                                    {agent.status === 'running' ? (
                                      <Loader2 size={18} className="animate-spin" />
                                    ) : agent.status === 'completed' ? (
                                      <CheckCircle size={18} />
                                    ) : agent.status === 'error' ? (
                                      <XCircle size={18} />
                                    ) : (
                                      <Bot size={18} />
                                    )}
                                  </motion.div>
                                  <div>
                                    <p className="font-medium">{agent.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {AGENT_TEMPLATES.find(t => t.id === agent.role)?.role || '智能体'}
                                    </p>
                                  </div>
                                </div>
                                <div className={`text-sm font-bold ${status.text}`}>
                                  {Math.round(agent.progress)}%
                                </div>
                              </div>
                              {agent.status === 'running' && (
                                <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                                  <motion.div
                                    className="h-full bg-gradient-to-r from-primary to-[hsl(var(--accent-500))]"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${agent.progress}%` }}
                                  />
                                </div>
                              )}
                              {agent.currentTask && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
                                  <Clock size={12} />
                                  <span className="truncate">当前任务: {agent.currentTask}</span>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Tasks 面板 */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur-sm py-3 z-10 rounded-xl">
                        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--warning-500))/0.14] flex items-center justify-center">
                          <Target size={16} className="text-[hsl(var(--warning-500))]" />
                        </div>
                        <h3 className="font-semibold">任务流 ({workflow.tasks.length})</h3>
                      </div>
                      <div className="space-y-4 relative">
                        {/* 连接线 */}
                        <div className="absolute left-[22px] top-[10px] bottom-[10px] w-0.5 bg-gradient-to-b from-primary via-[hsl(var(--warning-500))] to-[hsl(var(--success-500))] opacity-30" />

                        {workflow.tasks.map((task, i) => {
                          const status = statusColors[task.status];
                          return (
                            <motion.div
                              key={task.id}
                              className={`p-4 rounded-xl border transition-all cursor-pointer backdrop-blur-sm bg-gradient-to-br from-card to-card/80 relative z-10 ${
                                selectedTask === task.id
                                  ? `border-primary/50 bg-primary/5 shadow-lg shadow-primary/10`
                                  : `${status.border || 'border-border'} hover:border-primary/30 hover:shadow-md`
                              }`}
                              onClick={() => setSelectedTask(selectedTask === task.id ? null : task.id)}
                              whileHover={{ x: 3 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <div className="flex items-center gap-4">
                                <motion.div
                                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shadow-lg ${status.bg} ${status.text}`}
                                  {...(task.status === 'running' ? pulseAnimation : {})}
                                >
                                  {task.status === 'completed' ? <CheckCircle size={18} /> :
                                   task.status === 'running' ? <Loader2 size={18} className="animate-spin" /> :
                                   task.status === 'error' ? <XCircle size={18} /> :
                                   <span className="text-lg">{i + 1}</span>}
                                </motion.div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium">{task.description}</p>
                                  {task.assignedAgent && (
                                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full inline-flex">
                                      <Users size={10} />
                                      <span>{workflow.agents.find(a => a.id === task.assignedAgent)?.name}</span>
                                    </div>
                                  )}
                                </div>
                                {i < workflow.tasks.length - 1 && (
                                  <div className="shrink-0 text-muted-foreground">
                                    <ArrowRight size={18} />
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 执行按钮 */}
                <div className="p-5 border-t shrink-0 bg-gradient-to-r from-muted/20 to-muted/5 flex gap-3">
                  <motion.button
                    onClick={resetWorkflow}
                    disabled={isRunning}
                    className="px-5 py-3 rounded-xl border text-sm hover:bg-muted disabled:opacity-50 flex items-center gap-2 font-medium"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <RefreshCw size={18} />
                    重置工作流
                  </motion.button>

                  {/* 暂停/恢复按钮 */}
                  {isRunning && (
                    <motion.button
                      onClick={isPaused ? resumeWorkflow : pauseWorkflow}
                      className="px-5 py-3 rounded-xl border text-sm hover:bg-muted flex items-center gap-2 font-medium"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {isPaused ? <Play size={18} /> : <Pause size={18} />}
                      {isPaused ? '恢复' : '暂停'}
                    </motion.button>
                  )}

                  {/* 停止按钮 */}
                  {(isRunning || isPaused) && (
                    <motion.button
                      onClick={stopWorkflow}
                      className="px-5 py-3 rounded-xl border border-destructive/30 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2 font-medium"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Square size={18} />
                      停止
                    </motion.button>
                  )}

                  <motion.button
                    onClick={handleStartExecution}
                    disabled={isRunning || workflow.status === 'completed'}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-primary/20 transition-all"
                    whileHover={{ scale: isRunning || workflow.status === 'completed' ? 1 : 1.02 }}
                    whileTap={{ scale: isRunning || workflow.status === 'completed' ? 1 : 0.98 }}
                  >
                    {isRunning ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        执行中，请稍候...
                      </>
                    ) : workflow.status === 'completed' ? (
                      <>
                        <CheckCircle size={20} />
                        执行完成
                      </>
                    ) : (
                      <>
                        <Play size={20} />
                        开始执行工作流
                      </>
                    )}
                  </motion.button>
                </div>
              </div>

              {/* 日志面板 */}
              <div className="w-80 border-l flex flex-col shrink-0 bg-gradient-to-b from-muted/10 to-background">
                <button
                  onClick={() => setLogsExpanded(!logsExpanded)}
                  className="p-4 border-b flex items-center justify-between hover:bg-muted/30 transition-colors shrink-0 bg-gradient-to-r from-muted/20 to-muted/5"
                >
                  <span className="font-medium flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[hsl(var(--warning-500))/0.14] flex items-center justify-center">
                      <Zap size={14} className="text-[hsl(var(--warning-500))]" />
                    </div>
                    执行日志 ({workflow.logs.length})
                  </span>
                  {logsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {logsExpanded && (
                  <div className="flex-1 overflow-auto p-3 space-y-2">
                    {workflow.logs.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <motion.div {...floatAnimation}>
                          <Clock size={32} className="mx-auto mb-3 opacity-30" />
                        </motion.div>
                        <p className="text-sm">暂无日志</p>
                        <p className="text-xs mt-2 opacity-70">开始执行后将显示运行日志</p>
                      </div>
                    ) : (
                      workflow.logs.map((log) => (
                        <motion.div
                          key={log.id}
                          initial={{ opacity: 0, x: -20, y: 5 }}
                          animate={{ opacity: 1, x: 0, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className={`text-xs p-3 rounded-xl backdrop-blur-sm shadow-sm ${
                            log.type === 'success' ? 'bg-[hsl(var(--success-500))/0.14] border border-[hsl(var(--success-500))/0.32] text-[hsl(var(--success-500))]' :
                            log.type === 'error' ? 'bg-destructive/10 border border-destructive/20 text-destructive' :
                            log.type === 'warning' ? 'bg-[hsl(var(--warning-500))/0.14] border border-[hsl(var(--warning-500))/0.32] text-[hsl(var(--warning-500))]' :
                            'bg-muted border border-border'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5">
                              {log.type === 'success' ? <CheckCircle size={12} className="shrink-0" /> :
                               log.type === 'error' ? <XCircle size={12} className="shrink-0" /> :
                               log.type === 'warning' ? <AlertTriangle size={12} className="shrink-0" /> :
                               <Clock size={12} className="shrink-0" />}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{log.message}</p>
                              <p className="text-muted-foreground mt-1 text-[10px]">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            // 选择工作流模板
            <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
              <div className="text-center space-y-8 max-w-3xl w-full">
                <motion.div
                  className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 via-accent/30 to-primary/10 shadow-xl shadow-primary/20 flex items-center justify-center mx-auto"
                  {...floatAnimation}
                >
                  <Sparkles className="w-12 h-12 text-primary" />
                </motion.div>
                <div>
                  <h3 className="text-2xl font-bold mb-3 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    选择智能工作流模板
                  </h3>
                  <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                    选择预设的多Agent协作工作流，让AI团队自动为您完成复杂任务
                  </p>
                </div>
                <div className="grid md:grid-cols-3 gap-6 pt-4">
                  {PRESET_WORKFLOWS.map((preset, index) => (
                    <motion.button
                      key={preset.id}
                      onClick={() => initWorkflow(preset)}
                      className="p-6 rounded-2xl border bg-gradient-to-br from-card to-card/80 hover:border-primary/50 hover:bg-gradient-to-br hover:from-primary/5 hover:to-muted transition-all group w-full text-left shadow-sm hover:shadow-lg hover:shadow-primary/10"
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      custom={index}
                      whileHover="hover"
                    >
                      <div className="flex flex-col h-full">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center group-hover:from-primary/30 group-hover:to-primary/20 transition-colors mb-4 shadow-sm">
                          {index === 0 ? (
                            <FileText className="w-7 h-7 text-primary" />
                          ) : index === 1 ? (
                            <Code className="w-7 h-7 text-primary" />
                          ) : (
                            <BarChart3 className="w-7 h-7 text-primary" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-lg mb-2">{preset.name}</p>
                          <p className="text-muted-foreground text-sm mb-3">{preset.description}</p>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                          <span className="flex items-center gap-1">
                            <Users size={12} />
                            {preset.agents.length} 个Agent
                          </span>
                          <span className="flex items-center gap-1">
                            <Target size={12} />
                            {preset.tasks.length} 个任务
                          </span>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default MultiAgentPanel;
