'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ==================== Types ====================

export type AgentStatus = 'idle' | 'busy' | 'thinking' | 'error';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting';
export type WorkflowStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  model?: string;
  provider?: string;
  tools: string[];
  status: AgentStatus;
  currentTask?: string;
}

export interface TaskConfig {
  id: string;
  name: string;
  description: string;
  agentId: string;
  status: TaskStatus;
  dependencies: string[];
  result?: string;
  error?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: WorkflowStatus;
  progress: number;
  currentTaskIndex: number;
  startedAt?: number;
  completedAt?: number;
  toolCalls: ToolCall[];
  errors: ErrorInfo[];
  pendingConfirmations: ConfirmationRequest[];
}

export interface ToolCall {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  output?: unknown;
  timestamp: number;
  duration?: number;
  success: boolean;
}

export interface ErrorInfo {
  id: string;
  taskId?: string;
  agentId?: string;
  message: string;
  code?: string;
  recoverable: boolean;
  timestamp: number;
}

export interface ConfirmationRequest {
  id: string;
  type: 'approve' | 'select' | 'input';
  title: string;
  message: string;
  options?: string[];
  suggestedInput?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  process: 'sequential' | 'parallel' | 'hierarchical';
  agents: AgentConfig[];
  tasks: TaskConfig[];
  createdAt: number;
  updatedAt: number;
}

// ==================== Store ====================

interface AgentWorkflowState {
  // 工作流定义
  workflows: WorkflowDefinition[];

  // 当前活跃的工作流
  activeWorkflowId: string | null;

  // 执行状态
  execution: WorkflowExecution | null;

  // 引擎会话
  engineSessionId: string | null;

  // 动作
  createWorkflow: (workflow: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateWorkflow: (id: string, updates: Partial<WorkflowDefinition>) => void;
  deleteWorkflow: (id: string) => void;
  setActiveWorkflow: (id: string | null) => void;

  // Agent 管理
  addAgent: (workflowId: string, agent: Omit<AgentConfig, 'id' | 'status'>) => void;
  updateAgent: (workflowId: string, agentId: string, updates: Partial<AgentConfig>) => void;
  removeAgent: (workflowId: string, agentId: string) => void;

  // Task 管理
  addTask: (workflowId: string, task: Omit<TaskConfig, 'id' | 'status'>) => void;
  updateTask: (workflowId: string, taskId: string, updates: Partial<TaskConfig>) => void;
  removeTask: (workflowId: string, taskId: string) => void;

  // 执行控制
  startExecution: (workflowId: string) => void;
  pauseExecution: () => void;
  resumeExecution: () => void;
  stopExecution: () => void;
  updateExecutionProgress: (progress: number, currentTaskIndex: number) => void;
  setExecutionStatus: (status: WorkflowStatus) => void;
  setEngineSessionId: (id: string | null) => void;

  // 任务状态更新
  updateTaskStatus: (taskId: string, status: TaskStatus, result?: string, error?: string) => void;
  updateAgentStatus: (agentId: string, status: AgentStatus, currentTask?: string) => void;

  // 工具调用
  addToolCall: (call: Omit<ToolCall, 'id' | 'timestamp'>) => void;

  // 错误管理
  addError: (error: Omit<ErrorInfo, 'id' | 'timestamp'>) => void;
  clearErrors: () => void;
  dismissError: (errorId: string) => void;

  // 人机确认
  addConfirmation: (request: Omit<ConfirmationRequest, 'id'>) => void;
  respondToConfirmation: (id: string, response: string) => void;
  clearConfirmations: () => void;

  // SSE 事件处理
  handleSSEEvent: (event: SSEEvent) => void;

  // 获取当前工作流
  getActiveWorkflow: () => WorkflowDefinition | null;
}

export type SSEEvent =
  | { type: 'task_start'; taskId: string; agentId: string }
  | { type: 'task_progress'; taskId: string; progress: number; message?: string }
  | { type: 'task_complete'; taskId: string; result: string }
  | { type: 'task_error'; taskId: string; error: string }
  | { type: 'agent_status'; agentId: string; status: AgentStatus; currentTask?: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'workflow_complete'; result: string }
  | { type: 'workflow_error'; error: string }
  | { type: 'confirmation'; request: ConfirmationRequest }
  | { type: 'progress'; progress: number; currentTaskIndex: number };

const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const useAgentWorkflowStore = create<AgentWorkflowState>()(
  persist(
    (set, get) => ({
      workflows: [],
      activeWorkflowId: null,
      execution: null,
      engineSessionId: null,

      createWorkflow: (workflowData) => {
        const id = generateId();
        const now = Date.now();
        const workflow: WorkflowDefinition = {
          ...workflowData,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          workflows: [...state.workflows, workflow],
        }));
        return id;
      },

      updateWorkflow: (id, updates) => {
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w
          ),
        }));
      },

      deleteWorkflow: (id) => {
        set((state) => ({
          workflows: state.workflows.filter((w) => w.id !== id),
          activeWorkflowId: state.activeWorkflowId === id ? null : state.activeWorkflowId,
        }));
      },

      setActiveWorkflow: (id) => {
        set({ activeWorkflowId: id });
      },

      addAgent: (workflowId, agentData) => {
        const id = generateId();
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId
              ? {
                  ...w,
                  agents: [...w.agents, { ...agentData, id, status: 'idle' as AgentStatus }],
                  updatedAt: Date.now(),
                }
              : w
          ),
        }));
      },

      updateAgent: (workflowId, agentId, updates) => {
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId
              ? {
                  ...w,
                  agents: w.agents.map((a) =>
                    a.id === agentId ? { ...a, ...updates } : a
                  ),
                  updatedAt: Date.now(),
                }
              : w
          ),
        }));
      },

      removeAgent: (workflowId, agentId) => {
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId
              ? {
                  ...w,
                  agents: w.agents.filter((a) => a.id !== agentId),
                  tasks: w.tasks.map((t) =>
                    t.agentId === agentId ? { ...t, agentId: '' } : t
                  ),
                  updatedAt: Date.now(),
                }
              : w
          ),
        }));
      },

      addTask: (workflowId, taskData) => {
        const id = generateId();
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId
              ? {
                  ...w,
                  tasks: [...w.tasks, { ...taskData, id, status: 'pending' as TaskStatus }],
                  updatedAt: Date.now(),
                }
              : w
          ),
        }));
      },

      updateTask: (workflowId, taskId, updates) => {
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId
              ? {
                  ...w,
                  tasks: w.tasks.map((t) =>
                    t.id === taskId ? { ...t, ...updates } : t
                  ),
                  updatedAt: Date.now(),
                }
              : w
          ),
        }));
      },

      removeTask: (workflowId, taskId) => {
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId
              ? {
                  ...w,
                  tasks: w.tasks.filter((t) => t.id !== taskId),
                  updatedAt: Date.now(),
                }
              : w
          ),
        }));
      },

      startExecution: (workflowId) => {
        set({
          execution: {
            id: generateId(),
            workflowId,
            status: 'running',
            progress: 0,
            currentTaskIndex: 0,
            startedAt: Date.now(),
            toolCalls: [],
            errors: [],
            pendingConfirmations: [],
          },
        });
      },

      pauseExecution: () => {
        set((state) => ({
          execution: state.execution
            ? { ...state.execution, status: 'paused' }
            : null,
        }));
      },

      resumeExecution: () => {
        set((state) => ({
          execution: state.execution
            ? { ...state.execution, status: 'running' }
            : null,
        }));
      },

      stopExecution: () => {
        set((state) => ({
          execution: state.execution
            ? {
                ...state.execution,
                status: 'idle',
                completedAt: Date.now(),
              }
            : null,
        }));
      },

      updateExecutionProgress: (progress, currentTaskIndex) => {
        set((state) => ({
          execution: state.execution
            ? { ...state.execution, progress, currentTaskIndex }
            : null,
        }));
      },

      setExecutionStatus: (status) => {
        set((state) => ({
          execution: state.execution
            ? {
                ...state.execution,
                status,
                completedAt: status === 'completed' || status === 'error' ? Date.now() : undefined,
              }
            : null,
        }));
      },

      setEngineSessionId: (id) => {
        set({ engineSessionId: id });
      },

      updateTaskStatus: (taskId, status, result, error) => {
        const workflow = get().getActiveWorkflow();
        if (!workflow) return;

        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflow.id
              ? {
                  ...w,
                  tasks: w.tasks.map((t) =>
                    t.id === taskId ? { ...t, status, result, error } : t
                  ),
                }
              : w
          ),
        }));
      },

      updateAgentStatus: (agentId, status, currentTask) => {
        const workflow = get().getActiveWorkflow();
        if (!workflow) return;

        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflow.id
              ? {
                  ...w,
                  agents: w.agents.map((a) =>
                    a.id === agentId ? { ...a, status, currentTask } : a
                  ),
                }
              : w
          ),
        }));
      },

      addToolCall: (call) => {
        set((state) => ({
          execution: state.execution
            ? {
                ...state.execution,
                toolCalls: [
                  ...state.execution.toolCalls,
                  { ...call, id: generateId(), timestamp: Date.now() },
                ],
              }
            : null,
        }));
      },

      addError: (error) => {
        set((state) => ({
          execution: state.execution
            ? {
                ...state.execution,
                errors: [
                  ...state.execution.errors,
                  { ...error, id: generateId(), timestamp: Date.now() },
                ],
              }
            : null,
        }));
      },

      clearErrors: () => {
        set((state) => ({
          execution: state.execution
            ? { ...state.execution, errors: [] }
            : null,
        }));
      },

      dismissError: (errorId) => {
        set((state) => ({
          execution: state.execution
            ? {
                ...state.execution,
                errors: state.execution.errors.filter((e) => e.id !== errorId),
              }
            : null,
        }));
      },

      addConfirmation: (request) => {
        set((state) => ({
          execution: state.execution
            ? {
                ...state.execution,
                pendingConfirmations: [
                  ...state.execution.pendingConfirmations,
                  { ...request, id: generateId() },
                ],
              }
            : null,
        }));
      },

      respondToConfirmation: (id, response) => {
        set((state) => ({
          execution: state.execution
            ? {
                ...state.execution,
                pendingConfirmations: state.execution.pendingConfirmations.filter(
                  (c) => c.id !== id
                ),
              }
            : null,
        }));
      },

      clearConfirmations: () => {
        set((state) => ({
          execution: state.execution
            ? { ...state.execution, pendingConfirmations: [] }
            : null,
        }));
      },

      handleSSEEvent: (event) => {
        const workflow = get().getActiveWorkflow();
        if (!workflow) return;

        switch (event.type) {
          case 'task_start':
            get().updateTaskStatus(event.taskId, 'running');
            get().updateAgentStatus(event.agentId, 'busy', event.taskId);
            break;

          case 'task_progress':
            get().updateTaskStatus(event.taskId, 'running');
            break;

          case 'task_complete':
            get().updateTaskStatus(event.taskId, 'completed', undefined, undefined);
            get().updateAgentStatus(
              workflow.tasks.find((t) => t.id === event.taskId)?.agentId || '',
              'idle'
            );
            break;

          case 'task_error':
            get().updateTaskStatus(event.taskId, 'failed', undefined, event.error);
            get().updateAgentStatus(
              workflow.tasks.find((t) => t.id === event.taskId)?.agentId || '',
              'error'
            );
            get().addError({
              taskId: event.taskId,
              message: event.error,
              recoverable: true,
            });
            break;

          case 'agent_status':
            get().updateAgentStatus(event.agentId, event.status, event.currentTask);
            break;

          case 'tool_call':
            get().addToolCall({
              tool: event.call.tool,
              input: event.call.input,
              output: event.call.output,
              duration: event.call.duration,
              success: event.call.success,
            });
            break;

          case 'workflow_complete':
            get().setExecutionStatus('completed');
            break;

          case 'workflow_error':
            get().setExecutionStatus('error');
            get().addError({
              message: event.error,
              recoverable: false,
            });
            break;

          case 'confirmation':
            get().addConfirmation(event.request);
            break;

          case 'progress':
            get().updateExecutionProgress(event.progress, event.currentTaskIndex);
            break;
        }
      },

      getActiveWorkflow: () => {
        const state = get();
        return (
          state.workflows.find((w) => w.id === state.activeWorkflowId) || null
        );
      },
    }),
    {
      name: 'agent-workflow-storage',
      partialize: (state) => ({
        workflows: state.workflows,
      }),
    }
  )
);

// ==================== Selectors ====================

export const selectActiveWorkflow = (state: AgentWorkflowState) =>
  state.workflows.find((w) => w.id === state.activeWorkflowId) || null;

export const selectWorkflowById = (id: string) => (state: AgentWorkflowState) =>
  state.workflows.find((w) => w.id === id);

export const selectAgentById = (agentId: string) => (state: AgentWorkflowState) => {
  for (const workflow of state.workflows) {
    const agent = workflow.agents.find((a) => a.id === agentId);
    if (agent) return agent;
  }
  return null;
};

export const selectTaskById = (taskId: string) => (state: AgentWorkflowState) => {
  for (const workflow of state.workflows) {
    const task = workflow.tasks.find((t) => t.id === taskId);
    if (task) return task;
  }
  return null;
};

export const selectExecutionProgress = (state: AgentWorkflowState) => {
  if (!state.execution) return 0;
  return state.execution.progress;
};

export const selectPendingConfirmations = (state: AgentWorkflowState) =>
  state.execution?.pendingConfirmations || [];

export const selectErrors = (state: AgentWorkflowState) =>
  state.execution?.errors || [];

export const selectToolCalls = (state: AgentWorkflowState) =>
  state.execution?.toolCalls || [];
