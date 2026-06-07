// MissionControl Hook - 封装 store 常用操作
import { useCallback, useMemo } from 'react';
import { useMissionControlStore, initializeAgents, startMission } from './store';
import type { MissionAgent, MissionTask, MissionEvent, TaskPriority } from './types';
import { API_BASE } from '@/lib/apiConfig';

/**
 * 发起 API 请求
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error?.message || `HTTP ${response.status}` };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

// 任务优先级配置
const priorityConfig: Record<TaskPriority, { label: string; color: string; order: number }> = {
  critical: { label: '紧急', color: 'text-red-500', order: 0 },
  high: { label: '高', color: 'text-orange-500', order: 1 },
  medium: { label: '中', color: 'text-yellow-500', order: 2 },
  low: { label: '低', color: 'text-gray-500', order: 3 },
};

/**
 * useMission - 返回当前任务状态统计
 */
export function useMission() {
  const { isActive, missionId, missionName, createdAt, totalTasks, completedTasks, failedTasks, tasks } =
    useMissionControlStore();

  // 按优先级分组统计
  const tasksByPriority = useMemo(() => {
    const grouped: Record<TaskPriority, MissionTask[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    tasks.forEach((task) => {
      grouped[task.priority].push(task);
    });

    // 按优先级排序
    return Object.entries(grouped)
      .map(([priority, items]) => ({
        priority: priority as TaskPriority,
        ...priorityConfig[priority as TaskPriority],
        tasks: items,
        count: items.length,
      }))
      .sort((a, b) => a.order - b.order);
  }, [tasks]);

  // 按状态分组统计
  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, MissionTask[]> = {};
    tasks.forEach((task) => {
      if (!grouped[task.status]) {
        grouped[task.status] = [];
      }
      grouped[task.status].push(task);
    });
    return grouped;
  }, [tasks]);

  // 进度统计
  const progress = useMemo(() => {
    if (totalTasks === 0) return 0;
    return Math.round((completedTasks / totalTasks) * 100);
  }, [totalTasks, completedTasks]);

  // 预计剩余时间
  const estimatedRemaining = useMemo(() => {
    const pendingTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'failed');
    const totalEstimated = pendingTasks.reduce((sum, t) => sum + (t.estimatedDuration || 0), 0);
    return totalEstimated;
  }, [tasks]);

  return {
    isActive,
    missionId,
    missionName,
    createdAt,
    totalTasks,
    completedTasks,
    failedTasks,
    pendingTasks: totalTasks - completedTasks - failedTasks,
    progress,
    tasksByPriority,
    tasksByStatus,
    estimatedRemaining,
  };
}

/**
 * useAgents - 返回 Agent 列表
 */
export function useAgents() {
  const { agents } = useMissionControlStore();

  // 按角色分组
  const agentsByRole = useMemo(() => {
    const grouped: Record<string, MissionAgent[]> = {};
    agents.forEach((agent) => {
      if (!grouped[agent.role]) {
        grouped[agent.role] = [];
      }
      grouped[agent.role].push(agent);
    });
    return grouped;
  }, [agents]);

  // Agent 状态统计
  const agentStats = useMemo(() => {
    const stats = {
      total: agents.length,
      idle: 0,
      thinking: 0,
      working: 0,
      waiting: 0,
      completed: 0,
      error: 0,
    };
    agents.forEach((agent) => {
      stats[agent.status]++;
    });
    return stats;
  }, [agents]);

  // 忙碌的 Agent
  const busyAgents = useMemo(
    () => agents.filter((a) => a.status === 'thinking' || a.status === 'working'),
    [agents]
  );

  // 空闲的 Agent
  const idleAgents = useMemo(() => agents.filter((a) => a.status === 'idle'), [agents]);

  return {
    agents,
    agentsByRole,
    agentStats,
    busyAgents,
    idleAgents,
  };
}

/**
 * useEvents - 返回事件流
 */
export function useEvents() {
  const { events } = useMissionControlStore();

  // 按类型分组
  const eventsByType = useMemo(() => {
    const grouped: Record<string, MissionEvent[]> = {};
    events.forEach((event) => {
      if (!grouped[event.type]) {
        grouped[event.type] = [];
      }
      grouped[event.type].push(event);
    });
    return grouped;
  }, [events]);

  // 最近的事件
  const recentEvents = useMemo(() => events.slice(0, 20), [events]);

  // 任务相关事件
  const taskEvents = useMemo(
    () => events.filter((e) => e.type.startsWith('task_')),
    [events]
  );

  // Agent 相关事件
  const agentEvents = useMemo(
    () => events.filter((e) => e.type === 'agent_status_change'),
    [events]
  );

  // 系统事件
  const systemEvents = useMemo(
    () => events.filter((e) => e.type === 'system' || e.type === 'broadcast'),
    [events]
  );

  return {
    events,
    eventsByType,
    recentEvents,
    taskEvents,
    agentEvents,
    systemEvents,
  };
}

// 导出 store 中的操作供直接使用
export { useMissionControlStore };

// ==================== 后端 API 连接 ====================

import { agentWorkflowAPI } from '@/lib/agentWorkflowAPI';

/**
 * 从后端获取 Agent 列表
 */
export async function fetchAgentsFromBackend(): Promise<Omit<MissionAgent, 'lastHeartbeat'>[]> {
  try {
    const response = await apiRequest<{ agents: Array<Omit<MissionAgent, 'lastHeartbeat'>> }>('/api/mission/agents');
    if (response.success && response.data?.agents) {
      return response.data.agents;
    }
    console.warn('[MissionControl] No agents from backend, returning empty array');
    return [];
  } catch (error) {
    console.error('[MissionControl] Failed to fetch agents:', error);
    return [];
  }
}

/**
 * 从后端获取任务列表
 */
export async function fetchTasksFromBackend(): Promise<Omit<MissionTask, 'id' | 'createdAt' | 'updatedAt'>[]> {
  try {
    const response = await apiRequest<{ tasks: Array<{ name: string; description?: string; priority?: string; status?: string; estimatedDuration?: number }> }>('/api/mission/tasks');
    if (response.success && response.data?.tasks) {
      // 转换后端任务格式到前端格式
      return response.data.tasks.map(task => ({
        title: task.name || '',
        description: task.description || '',
        priority: (task.priority || 'medium') as 'critical' | 'high' | 'medium' | 'low',
        status: (task.status || 'pending') as 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled',
        estimatedDuration: task.estimatedDuration || 0,
      }));
    }
    console.warn('[MissionControl] No tasks from backend, returning empty array');
    return [];
  } catch (error) {
    console.error('[MissionControl] Failed to fetch tasks:', error);
    return [];
  }
}

/**
 * 初始化任务（从后端获取数据）
 */
export async function initializeMissionFromBackend(missionName: string = '后端任务') {
  try {
    // 从后端获取数据
    const [agents, tasks] = await Promise.all([
      fetchAgentsFromBackend(),
      fetchTasksFromBackend()
    ]);

    // 初始化 store
    initializeAgents(agents);
    startMission(missionName, tasks);

    return { agents, tasks };
  } catch (error) {
    console.error('[MissionControl] Failed to initialize from backend:', error);
    return null;
  }
}

/**
 * 创建 Agent 引擎并执行任务
 */
export async function createAndExecuteTask(task: string, context?: Record<string, unknown>): Promise<{
  success: boolean;
  sessionId?: string;
  result?: string;
  error?: string;
}> {
  try {
    // 1. 创建引擎
    const engineResponse = await agentWorkflowAPI.createEngine({
      options: {
        maxIterations: 10,
        enableCheckpoint: true,
        enableMemory: true,
      }
    });

    if (!engineResponse.success || !engineResponse.data) {
      return { success: false, error: engineResponse.error || '创建引擎失败' };
    }

    const { sessionId } = engineResponse.data;

    // 2. 执行任务
    const executeResponse = await agentWorkflowAPI.executeTask(sessionId, task, context);

    if (!executeResponse.success || !executeResponse.data) {
      return { success: false, error: executeResponse.error || '执行任务失败' };
    }

    const result = executeResponse.data;

    return {
      success: true,
      sessionId,
      result: result.result?.finalResult || result.error || '任务执行完成'
    };
  } catch (error) {
    console.error('[MissionControl] Failed to execute task:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '执行任务失败'
    };
  }
}