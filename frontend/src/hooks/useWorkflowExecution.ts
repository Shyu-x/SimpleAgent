'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAgentWorkflowStore } from '@/store/agentWorkflowStore';
import { workflowExecutionService } from '@/lib/workflowExecutionService';
import { agentWorkflowAPI } from '@/lib/agentWorkflowAPI';
import type {
  WorkflowDefinition,
  WorkflowExecution,
  ConfirmationRequest,
} from '@/store/agentWorkflowStore';

// 确认响应类型
interface ConfirmationResponse {
  approved: boolean;
  modifiedInput?: unknown;
}

interface UseWorkflowExecutionOptions {
  onTaskStart?: (taskId: string, agentId: string) => void;
  onTaskComplete?: (taskId: string, result: string) => void;
  onTaskError?: (taskId: string, error: string) => void;
  onWorkflowComplete?: (result: string) => void;
  onWorkflowError?: (error: string) => void;
  onConfirmation?: (request: { id: string; type: string; title: string; message: string }) => void;
}

/**
 * 工作流执行 Hook
 * 提供完整的工作流执行管理功能
 */
export function useWorkflowExecution(options: UseWorkflowExecutionOptions = {}) {
  const store = useAgentWorkflowStore();
  const isExecutingRef = useRef(false);

  // 获取当前工作流
  const activeWorkflow = store.getActiveWorkflow();

  // 初始化执行状态
  useEffect(() => {
    const unsubscribe = workflowExecutionService.subscribe((event) => {
      // 处理事件
      switch (event.type) {
        case 'task_start':
          store.updateTaskStatus(event.taskId, 'running');
          store.updateAgentStatus(event.agentId, 'busy', event.taskId);
          options.onTaskStart?.(event.taskId, event.agentId);
          break;

        case 'task_complete':
          store.updateTaskStatus(event.taskId, 'completed');
          const task = activeWorkflow?.tasks.find((t) => t.id === event.taskId);
          if (task) {
            store.updateAgentStatus(task.agentId, 'idle');
          }
          options.onTaskComplete?.(event.taskId, event.result);
          break;

        case 'task_error':
          store.updateTaskStatus(event.taskId, 'failed', undefined, event.error);
          options.onTaskError?.(event.taskId, event.error);
          break;

        case 'workflow_complete':
          store.setExecutionStatus('completed');
          options.onWorkflowComplete?.(event.result);
          isExecutingRef.current = false;
          break;

        case 'workflow_error':
          store.setExecutionStatus('error');
          options.onWorkflowError?.(event.error);
          isExecutingRef.current = false;
          break;

        case 'confirmation':
          store.addConfirmation(event.request);
          options.onConfirmation?.(event.request);
          break;

        case 'progress':
          store.updateExecutionProgress(event.progress, event.currentTaskIndex);
          break;

        case 'tool_call':
          store.addToolCall({
            tool: event.call.tool,
            input: event.call.input,
            output: event.call.output,
            duration: event.call.duration,
            success: event.call.success,
          });
          break;
      }
    });

    return unsubscribe;
  }, [store, activeWorkflow, options]);

  // 创建新工作流
  const createWorkflow = useCallback(
    (name: string, process: 'sequential' | 'parallel' | 'hierarchical' = 'sequential') => {
      const workflowId = store.createWorkflow({
        name,
        description: '',
        process,
        agents: [],
        tasks: [],
      });
      store.setActiveWorkflow(workflowId);
      return workflowId;
    },
    [store]
  );

  // 加载预定义工作流
  const loadWorkflow = useCallback(
    (workflow: WorkflowDefinition) => {
      store.setActiveWorkflow(workflow.id);
    },
    [store]
  );

  // 开始执行
  const startExecution = useCallback(
    async (input?: string) => {
      const workflow = store.getActiveWorkflow();
      if (!workflow || isExecutingRef.current) return;

      isExecutingRef.current = true;

      // 初始化执行状态
      store.startExecution(workflow.id);

      // 重置任务状态
      workflow.tasks.forEach((task) => {
        store.updateTaskStatus(task.id, 'pending');
      });

      // 重置 Agent 状态
      workflow.agents.forEach((agent) => {
        store.updateAgentStatus(agent.id, 'idle');
      });

      // 清除错误
      store.clearErrors();
      store.clearConfirmations();

      try {
        await workflowExecutionService.execute(workflow, input);
      } catch (error) {
        store.setExecutionStatus('error');
        store.addError({
          message: error instanceof Error ? error.message : '执行失败',
          recoverable: false,
        });
        isExecutingRef.current = false;
      }
    },
    [store]
  );

  // 暂停执行
  const pauseExecution = useCallback(async () => {
    await workflowExecutionService.pause();
    store.pauseExecution();
  }, [store]);

  // 恢复执行
  const resumeExecution = useCallback(async () => {
    await workflowExecutionService.resume();
    store.resumeExecution();
  }, [store]);

  // 停止执行
  const stopExecution = useCallback(async () => {
    await workflowExecutionService.stop();
    store.stopExecution();
    isExecutingRef.current = false;
  }, [store]);

  // 重试执行
  const retryExecution = useCallback(
    async (input?: string) => {
      await stopExecution();
      await startExecution(input);
    },
    [stopExecution, startExecution]
  );

  // 响应确认请求
  const respondToConfirmation = useCallback(
    async (id: string, response: ConfirmationResponse) => {
      const sessionId = workflowExecutionService.getSessionId();
      if (!sessionId) return;

      // 本地 store 立即更新 (乐观更新, 避免等待网络)
      store.respondToConfirmation(id, response.approved ? 'approved' : 'rejected');

      // 实际发送到后端 (HITL 端点)
      // 注: 当前 store 不持久化 response 状态, 后端失败时仅记录日志,
      // 业务侧通过 SSE 的 confirmation_result 事件获取最终结果
      try {
        await agentWorkflowAPI.respondToConfirmation(
          sessionId,
          id,
          response.approved,
          response.modifiedInput
        );
      } catch (err) {
        // 后端不可达 / 会话已过期; 记录日志供业务侧排查
        console.error('[useWorkflowExecution] 发送确认响应失败:', err);
      }
    },
    [store]
  );

  // 恢复错误
  const recoverFromError = useCallback(
    async (errorId: string, strategy: 'retry' | 'skip' | 'fallback') => {
      store.dismissError(errorId);

      if (strategy === 'retry') {
        await retryExecution();
      } else if (strategy === 'skip') {
        // 跳过当前失败任务, 调用后端 recovery 处理器
        // 后端 strategy='skip' 会跳过该任务并继续执行后续任务
        const sessionId = workflowExecutionService.getSessionId();
        try {
          await agentWorkflowAPI.attemptRecovery('skip', {
            errorId,
            sessionId,
            strategy: 'skip',
          });
        } catch (err) {
          // 后端无 skip 处理器时, 仅记录日志 (降级到本地跳过)
          console.warn('[useWorkflowExecution] skip 恢复失败, 已本地跳过:', err);
        }
      } else if (strategy === 'fallback') {
        // 使用备用方案: 通知后端尝试 fallback handler (例如降级到默认模型)
        const sessionId = workflowExecutionService.getSessionId();
        try {
          await agentWorkflowAPI.attemptRecovery('fallback', {
            errorId,
            sessionId,
            strategy: 'fallback',
          });
        } catch (err) {
          // 后端无 fallback 处理器时降级, 不影响 UI
          console.warn('[useWorkflowExecution] fallback 恢复失败, 已忽略:', err);
        }
      }
    },
    [retryExecution, store]
  );

  // 清理
  const cleanup = useCallback(async () => {
    await workflowExecutionService.cleanup();
    isExecutingRef.current = false;
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    // 数据
    workflows: store.workflows,
    activeWorkflow,
    execution: store.execution,
    engineSessionId: store.engineSessionId,

    // 状态
    isRunning: store.execution?.status === 'running',
    isPaused: store.execution?.status === 'paused',
    isCompleted: store.execution?.status === 'completed',
    isError: store.execution?.status === 'error',

    // 工作流管理
    createWorkflow,
    loadWorkflow,
    deleteWorkflow: store.deleteWorkflow,
    setActiveWorkflow: store.setActiveWorkflow,

    // Agent 管理
    addAgent: (agent: Parameters<typeof store.addAgent>[1]) => {
      if (store.activeWorkflowId) {
        store.addAgent(store.activeWorkflowId, agent);
      }
    },
    updateAgent: (agentId: string, updates: Parameters<typeof store.updateAgent>[2]) => {
      if (store.activeWorkflowId) {
        store.updateAgent(store.activeWorkflowId, agentId, updates);
      }
    },
    removeAgent: (agentId: string) => {
      if (store.activeWorkflowId) {
        store.removeAgent(store.activeWorkflowId, agentId);
      }
    },

    // Task 管理
    addTask: (task: Parameters<typeof store.addTask>[1]) => {
      if (store.activeWorkflowId) {
        store.addTask(store.activeWorkflowId, task);
      }
    },
    updateTask: (taskId: string, updates: Parameters<typeof store.updateTask>[2]) => {
      if (store.activeWorkflowId) {
        store.updateTask(store.activeWorkflowId, taskId, updates);
      }
    },
    removeTask: (taskId: string) => {
      if (store.activeWorkflowId) {
        store.removeTask(store.activeWorkflowId, taskId);
      }
    },

    // 执行控制
    startExecution,
    pauseExecution,
    resumeExecution,
    stopExecution,
    retryExecution,
    respondToConfirmation,
    recoverFromError,

    // 错误和确认
    errors: store.execution?.errors || [],
    confirmations: store.execution?.pendingConfirmations || [],
    toolCalls: store.execution?.toolCalls || [],

    // 清理
    cleanup,
  };
}

export default useWorkflowExecution;
