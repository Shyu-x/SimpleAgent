'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
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
} from 'lucide-react';
import { useMultiAgent, AGENT_TEMPLATES } from '@/hooks/useMultiAgent';
import { fetchApi } from '@/lib/apiClient';
import { API_ENDPOINTS } from '@/lib/apiConfig';

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

// 动画变体
const nodeVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.8 },
};

const pulseVariants = {
  pulse: {
    boxShadow: [
      '0 0 0 0 hsl(var(--primary) / 0.35)',
      '0 0 0 10px hsl(var(--primary) / 0)',
    ],
    transition: { duration: 1.5, repeat: Infinity },
  },
};

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

export function MultiAgentVisualization() {
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(true);

  const { isLoading, executeCrew } = useMultiAgent();

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

  // 执行工作流（调用真实 A2A 协作 API）
  const runWorkflow = useCallback(async () => {
    if (!workflow || isRunning) return;

    setIsRunning(true);
    setWorkflow(prev => prev ? { ...prev, status: 'running', startTime: Date.now() } : null);
    addLog('info', '工作流开始执行');

    try {
      // 调用真实的 A2A 协作 API
      const result = await fetchApi<{ collaborationId: string }>('/api/a2a/collaborate', {
        method: 'POST',
        body: JSON.stringify({
          title: workflow.name,
          tasks: workflow.tasks.map((t, i) => ({
            id: t.id,
            agentName: workflow.agents[i % workflow.agents.length]?.name || 'agent-' + i,
            taskType: 'general',
            prompt: t.description,
            dependencies: t.dependencies,
          })),
        }),
      });

      if (result.error || !result.data?.collaborationId) {
        addLog('error', `API 调用失败: ${result.error?.message || '未知错误'}`);
        setWorkflow(prev => prev ? { ...prev, status: 'error', endTime: Date.now() } : null);
        setIsRunning(false);
        return;
      }

      const collaborationId = result.data.collaborationId;
      addLog('info', `协作任务已创建: ${collaborationId}`);

      // 订阅 SSE 获取实时状态更新
      const eventSource = new EventSource(`${API_ENDPOINTS.base}/api/a2a/subscribe/${collaborationId}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // 更新任务状态
          if (data.taskId && data.status) {
            const taskUpdate: Partial<TaskNode> = {
              status: data.status === 'completed' ? 'completed' :
                      data.status === 'failed' ? 'error' :
                      data.status === 'running' ? 'running' : 'pending',
            };

            if (data.status === 'completed' || data.status === 'failed') {
              taskUpdate.endTime = Date.now();
              taskUpdate.result = data.result || (data.status === 'completed' ? '任务完成' : '任务失败');
            }

            setWorkflow(prev => {
              if (!prev) return null;
              return {
                ...prev,
                tasks: prev.tasks.map(t =>
                  t.id === data.taskId ? { ...t, ...taskUpdate } : t
                ),
              };
            });

            // 更新 Agent 状态
            const agentIndex = workflow.tasks.findIndex(t => t.id === data.taskId);
            if (agentIndex >= 0) {
              const agent = workflow.agents[agentIndex % workflow.agents.length];
              setWorkflow(prev => {
                if (!prev) return null;
                return {
                  ...prev,
                  agents: prev.agents.map(a =>
                    a.id === agent.id ? {
                      ...a,
                      status: data.status === 'completed' ? 'completed' :
                             data.status === 'failed' ? 'error' :
                             data.status === 'running' ? 'running' : 'idle',
                      progress: data.status === 'completed' ? 100 : data.progress || 0,
                      currentTask: data.status === 'running' ? data.message : undefined,
                    } : a
                  ),
                };
              });
            }

            // 记录日志
            if (data.status === 'running') {
              addLog('info', data.message || `任务 ${data.taskId} 开始执行`);
            } else if (data.status === 'completed') {
              addLog('success', data.message || `任务 ${data.taskId} 已完成`);
            } else if (data.status === 'failed') {
              addLog('error', data.message || `任务 ${data.taskId} 执行失败`);
            }
          }

          // 检查协作是否完成
          if (data.status === 'completed' || data.status === 'failed') {
            setWorkflow(prev => prev ? {
              ...prev,
              status: data.status === 'completed' ? 'completed' : 'error',
              endTime: Date.now(),
            } : null);

            if (data.status === 'completed') {
              addLog('success', '工作流执行完成');
            }

            eventSource.close();
            setIsRunning(false);
          }
        } catch (e) {
          console.error('[MultiAgentVisualization] SSE 解析错误:', e);
        }
      };

      eventSource.onerror = () => {
        addLog('error', 'SSE 连接错误，尝试模拟进度');
        eventSource.close();

        // SSE 失败时使用模拟进度（降级方案）
        simulateTaskExecution();
      };
    } catch (err) {
      addLog('error', `执行失败: ${err instanceof Error ? err.message : '未知错误'}`);
      setWorkflow(prev => prev ? { ...prev, status: 'error', endTime: Date.now() } : null);
      setIsRunning(false);
    }
  }, [workflow, isRunning]);

  // 降级模拟执行（当 SSE 不可用时）
  const simulateTaskExecution = useCallback(async () => {
    if (!workflow) return;

    for (let i = 0; i < workflow.tasks.length; i++) {
      const task = workflow.tasks[i];
      const agent = workflow.agents[i % workflow.agents.length];

      setWorkflow(prev => {
        if (!prev) return null;
        return {
          ...prev,
          tasks: prev.tasks.map(t =>
            t.id === task.id ? { ...t, status: 'running', assignedAgent: agent.id, startTime: Date.now() } : t
          ),
          agents: prev.agents.map(a =>
            a.id === agent.id ? { ...a, status: 'running', progress: 0, currentTask: task.description } : a
          ),
        };
      });

      addLog('info', `${agent.name} 开始执行: ${task.description}`, agent.id, task.id);

      // 模拟任务执行进度
      for (let p = 0; p <= 100; p += 20) {
        await new Promise(r => setTimeout(r, 400));
        setWorkflow(prev => {
          if (!prev) return null;
          return {
            ...prev,
            agents: prev.agents.map(a =>
              a.id === agent.id ? { ...a, progress: p } : a
            ),
          };
        });
      }

      // 任务完成
      const success = Math.random() > 0.1;
      setWorkflow(prev => {
        if (!prev) return null;
        return {
          ...prev,
          tasks: prev.tasks.map(t =>
            t.id === task.id ? {
              ...t,
              status: success ? 'completed' : 'error',
              endTime: Date.now(),
              result: success ? `完成: ${task.description}` : '执行失败',
            } : t
          ),
          agents: prev.agents.map(a =>
            a.id === agent.id ? {
              ...a,
              status: success ? 'completed' : 'error',
              progress: 100,
              currentTask: undefined,
              endTime: Date.now(),
            } : a
          ),
        };
      });

      if (success) {
        addLog('success', `${agent.name} 完成任务: ${task.description}`, agent.id, task.id);
      } else {
        addLog('error', `${agent.name} 任务失败: ${task.description}`, agent.id, task.id);
        break;
      }
    }

    setWorkflow(prev => prev ? { ...prev, status: 'completed', endTime: Date.now() } : null);
    addLog('success', '工作流执行完成（模拟模式）');
    setIsRunning(false);
  }, [workflow]);

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

  // 重置工作流
  const resetWorkflow = useCallback(() => {
    setWorkflow(prev => {
      if (!prev) return null;
      return {
        ...prev,
        status: 'idle',
        startTime: undefined,
        endTime: undefined,
        agents: prev.agents.map(a => ({ ...a, status: 'idle', progress: 0, currentTask: undefined, result: undefined })),
        tasks: prev.tasks.map(t => ({ ...t, status: 'pending', assignedAgent: undefined, result: undefined })),
        logs: [],
      };
    });
    setIsRunning(false);
  }, []);

  // 计算整体进度
  const overallProgress = useMemo(() => {
    if (!workflow) return 0;
    const completed = workflow.tasks.filter(t => t.status === 'completed').length;
    return (completed / workflow.tasks.length) * 100;
  }, [workflow]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* 头部 */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">多 Agent 协作</h2>
            <p className="text-xs text-muted-foreground">可视化任务分配与执行</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!workflow ? (
            <select
              onChange={(e) => {
                const preset = PRESET_WORKFLOWS.find(p => p.id === e.target.value);
                if (preset) initWorkflow(preset);
              }}
              className="px-3 py-2 rounded-lg border bg-background text-sm"
              defaultValue=""
            >
              <option value="" disabled>选择工作流模板</option>
              {PRESET_WORKFLOWS.map(p => (
                <option key={p.id} value={p.id}>{p.name} - {p.description}</option>
              ))}
            </select>
          ) : (
            <>
              <span className="text-sm text-muted-foreground">{workflow.name}</span>
              <button
                onClick={resetWorkflow}
                disabled={isRunning}
                className="px-3 py-2 rounded-lg border text-sm hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {workflow ? (
        <div className="flex-1 flex overflow-hidden">
          {/* 主要视图 */}
          <div className="flex-1 flex flex-col">
            {/* 进度条 */}
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">整体进度</span>
                <span className="text-sm text-muted-foreground">{Math.round(overallProgress)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary to-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${overallProgress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {workflow.startTime ? new Date(workflow.startTime).toLocaleTimeString() : '--:--'}
                </span>
                <span className={`flex items-center gap-1 ${
                  workflow.status === 'completed' ? 'text-[hsl(var(--success-500))]' :
                  workflow.status === 'error' ? 'text-destructive' :
                  workflow.status === 'running' ? 'text-primary' : ''
                }`}>
                  {workflow.status === 'running' ? <Loader2 size={12} className="animate-spin" /> :
                   workflow.status === 'completed' ? <CheckCircle size={12} /> :
                   workflow.status === 'error' ? <XCircle size={12} /> :
                   <Clock size={12} />}
                  {workflow.status === 'idle' ? '等待开始' :
                   workflow.status === 'running' ? '执行中...' :
                   workflow.status === 'completed' ? '已完成' : '出错'}
                </span>
              </div>
            </div>

            {/* Agent 和 Task 可视化 */}
            <div className="flex-1 p-4 overflow-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Agents 面板 */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Bot size={16} />
                    Agents ({workflow.agents.length})
                  </h3>
                  <div className="space-y-2">
                    {workflow.agents.map((agent, i) => (
                      <motion.div
                        key={agent.id}
                        variants={nodeVariants}
                        initial="hidden"
                        className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                          selectedAgent === agent.id ? 'border-primary bg-primary/5' : 'hover:border-muted'
                        }`}
                        onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                        animate={
                          agent.status === 'running' ? 'pulse' : 'visible'
                        }
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                              agent.status === 'running' ? 'bg-primary/20 text-primary' :
                              agent.status === 'completed' ? 'bg-[hsl(var(--success-500))/0.14] text-[hsl(var(--success-500))]' :
                              agent.status === 'error' ? 'bg-destructive/20 text-destructive' :
                              'bg-muted'
                            }`}>
                              {agent.status === 'running' ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : agent.status === 'completed' ? (
                                <CheckCircle size={16} />
                              ) : agent.status === 'error' ? (
                                <XCircle size={16} />
                              ) : (
                                <Bot size={16} />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{agent.name}</p>
                              <p className="text-xs text-muted-foreground">{AGENT_TEMPLATES.find(t => t.id === agent.role)?.icon || 'Bot'}</p>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {Math.round(agent.progress)}%
                          </div>
                        </div>
                        {agent.status === 'running' && (
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-primary"
                              initial={{ width: 0 }}
                              animate={{ width: `${agent.progress}%` }}
                            />
                          </div>
                        )}
                        {agent.currentTask && (
                          <p className="text-xs text-muted-foreground mt-2 truncate">
                            当前: {agent.currentTask}
                          </p>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Tasks 面板 */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Target size={16} />
                    Tasks ({workflow.tasks.length})
                  </h3>
                  <div className="space-y-2">
                    {workflow.tasks.map((task, i) => (
                      <motion.div
                        key={task.id}
                        variants={nodeVariants}
                        initial="hidden"
                        animate="visible"
                        transition={{ delay: i * 0.05 }}
                        className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                          selectedTask === task.id ? 'border-primary bg-primary/5' : 'hover:border-muted'
                        }`}
                        onClick={() => setSelectedTask(selectedTask === task.id ? null : task.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                            task.status === 'completed' ? 'bg-[hsl(var(--success-500))] text-primary-foreground' :
                            task.status === 'running' ? 'bg-primary text-primary-foreground' :
                            task.status === 'error' ? 'bg-destructive text-destructive-foreground' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {task.status === 'completed' ? <CheckCircle size={14} /> :
                             task.status === 'running' ? <Loader2 size={14} className="animate-spin" /> :
                             task.status === 'error' ? <XCircle size={14} /> :
                             i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{task.description}</p>
                            {task.assignedAgent && (
                              <p className="text-xs text-muted-foreground">
                                执行者: {workflow.agents.find(a => a.id === task.assignedAgent)?.name}
                              </p>
                            )}
                          </div>
                          {i < workflow.tasks.length - 1 && (
                            <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 执行按钮 */}
            <div className="p-4 border-t">
              <button
                onClick={runWorkflow}
                disabled={isRunning || workflow.status === 'completed'}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
              >
                {isRunning ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    执行中...
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    开始执行
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 日志面板 */}
          <div className="w-80 border-l flex flex-col">
            <button
              onClick={() => setLogsExpanded(!logsExpanded)}
              className="p-3 border-b flex items-center justify-between hover:bg-muted/50 transition-colors"
            >
              <span className="text-sm font-medium flex items-center gap-2">
                <Zap size={16} />
                执行日志
              </span>
              {logsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {logsExpanded && (
              <div className="flex-1 overflow-auto p-3 space-y-2">
                {workflow.logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    暂无日志
                  </p>
                ) : (
                  workflow.logs.map((log) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`text-xs p-2 rounded-lg ${
                        log.type === 'success' ? 'bg-[hsl(var(--success-500))/0.14] text-[hsl(var(--success-500))]' :
                        log.type === 'error' ? 'bg-destructive/10 text-destructive' :
                        log.type === 'warning' ? 'bg-[hsl(var(--warning-500))/0.14] text-[hsl(var(--warning-500))]' :
                        'bg-muted'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {log.type === 'success' ? <CheckCircle size={12} className="shrink-0 mt-0.5" /> :
                         log.type === 'error' ? <XCircle size={12} className="shrink-0 mt-0.5" /> :
                         log.type === 'warning' ? <AlertTriangle size={12} className="shrink-0 mt-0.5" /> :
                         <Clock size={12} className="shrink-0 mt-0.5" />}
                        <div>
                          <p>{log.message}</p>
                          <p className="text-muted-foreground mt-0.5">
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
        // 空状态
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4 max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-medium mb-1">选择工作流模板</h3>
              <p className="text-sm text-muted-foreground">
                选择一个预设的工作流模板开始体验多 Agent 协作
              </p>
            </div>
            <div className="grid gap-2">
              {PRESET_WORKFLOWS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => initWorkflow(preset)}
                  className="p-3 rounded-xl border text-left hover:border-primary hover:bg-primary/5 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{preset.name}</p>
                      <p className="text-xs text-muted-foreground">{preset.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MultiAgentVisualization;
