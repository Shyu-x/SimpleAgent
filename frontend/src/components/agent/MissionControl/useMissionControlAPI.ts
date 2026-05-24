/**
 * MissionControl API Hook
 * 连接前端 MissionControl store 到后端 /api/mission API
 */
import { useCallback, useEffect } from 'react';
import { useMissionControlStore } from './store';
import type { MissionAgent, MissionTask, MissionEvent } from './types';
import { BACKEND_URL } from '@/lib/config';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { message: string; type: string };
}

const API_BASE = BACKEND_URL;

interface TaskResponse {
  id: string;
  name: string;
  description?: string;
  priority?: string;
  assignedAgent?: string;
  createdAt: number;
  updatedAt: number;
  status: string;
  result?: string;
  error?: string;
}

interface AgentResponse {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
  status: string;
  currentTask: string | null;
  progress: number;
  capabilities: string[];
  lastHeartbeat: number;
}

interface EventResponse {
  id: string;
  type: string;
  timestamp: number;
  taskId?: string;
  agentId?: string;
  message: string;
  data?: Record<string, unknown>;
}

interface StatsResponse {
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  totalAgents: number;
  idleAgents: number;
  workingAgents: number;
  waitingAgents: number;
  errorAgents: number;
  recentEvents: EventResponse[];
}

// API 请求函数
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
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
      return { success: false, error: data.error || { message: `HTTP ${response.status}`, type: 'network_error' } };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: { message: error instanceof Error ? error.message : 'Network error', type: 'network_error' }
    };
  }
}

// 转换后端任务到前端格式
function convertTask(task: TaskResponse): Omit<MissionTask, 'id' | 'createdAt' | 'updatedAt'> & { id: string; createdAt: number; updatedAt: number } {
  return {
    id: task.id,
    title: task.name,
    description: task.description || '',
    priority: task.priority as MissionTask['priority'],
    status: task.status as MissionTask['status'],
    assignedAgent: task.assignedAgent || undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    result: task.result || undefined,
    error: task.error || undefined,
  };
}

// 转换后端 Agent 到前端格式
function convertAgent(agent: AgentResponse): MissionAgent {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role as MissionAgent['role'],
    avatar: agent.avatar || '🤖',
    status: agent.status as MissionAgent['status'],
    currentTask: agent.currentTask || undefined,
    progress: agent.progress,
    capabilities: agent.capabilities,
    lastHeartbeat: Date.now(),
  };
}

/**
 * useMissionControlAPI - 连接 store 到后端 API
 */
export function useMissionControlAPI() {
  const store = useMissionControlStore();

  // 从后端同步任务
  const syncTasks = useCallback(async () => {
    const response = await apiRequest<{ tasks: TaskResponse[] }>('/api/mission/tasks?limit=100');
    if (response.success && response.data) {
      const tasks = response.data.tasks.map(convertTask);
      // 直接用后端数据替换本地任务列表
      store.setTasks(tasks);
    }
  }, [store]);

  // 从后端同步 Agents
  const syncAgents = useCallback(async () => {
    const response = await apiRequest<{ agents: AgentResponse[] }>('/api/mission/agents');
    if (response.success && response.data) {
      const agents = response.data.agents.map(convertAgent);
      // 直接用后端数据替换本地 Agent 列表
      store.setAgents(agents);
    }
  }, [store]);

  // 从后端同步事件
  const syncEvents = useCallback(async () => {
    const response = await apiRequest<{ events: EventResponse[] }>('/api/mission/events?limit=50');
    if (response.success && response.data) {
      console.log('[MissionControlAPI] Synced events from backend:', response.data.events.length);
    }
  }, []);

  // 获取统计信息
  const fetchStats = useCallback(async (): Promise<StatsResponse | null> => {
    const response = await apiRequest<{ stats: StatsResponse }>('/api/mission/stats');
    if (response.success && response.data) {
      return response.data.stats;
    }
    return null;
  }, []);

  // 创建任务到后端
  const createTask = useCallback(async (task: {
    name: string;
    description?: string;
    priority?: string;
    assignedAgent?: string;
  }): Promise<string | null> => {
    const response = await apiRequest<{ task: TaskResponse }>('/api/mission/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
    if (response.success && response.data) {
      return response.data.task.id;
    }
    return null;
  }, []);

  // 更新任务状态到后端
  const updateTaskStatus = useCallback(async (
    taskId: string,
    updates: { status?: string; result?: string; error?: string; assignedAgent?: string }
  ): Promise<boolean> => {
    const response = await apiRequest<{ task: TaskResponse }>(`/api/mission/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return response.success;
  }, []);

  // 删除任务
  const deleteTask = useCallback(async (taskId: string): Promise<boolean> => {
    const response = await apiRequest<void>(`/api/mission/tasks/${taskId}`, {
      method: 'DELETE',
    });
    return response.success;
  }, []);

  // 执行任务 (在后端触发任务执行)
  const executeTask = useCallback(async (taskId: string): Promise<boolean> => {
    const response = await apiRequest<{ task: TaskResponse }>(`/api/mission/tasks/${taskId}/execute`, {
      method: 'POST',
    });
    return response.success;
  }, []);

  // 取消任务
  const cancelTask = useCallback(async (taskId: string): Promise<boolean> => {
    const response = await apiRequest<{ task: TaskResponse }>(`/api/mission/tasks/${taskId}/cancel`, {
      method: 'POST',
    });
    return response.success;
  }, []);

  // 注册 Agent 到后端
  const registerAgent = useCallback(async (agent: {
    name: string;
    role?: string;
    avatar?: string;
    capabilities?: string[];
  }): Promise<string | null> => {
    const response = await apiRequest<{ agent: AgentResponse }>('/api/mission/agents', {
      method: 'POST',
      body: JSON.stringify(agent),
    });
    if (response.success && response.data) {
      return response.data.agent.id;
    }
    return null;
  }, []);

  // 更新 Agent 状态到后端
  const updateAgentStatus = useCallback(async (
    agentId: string,
    updates: { status?: string; currentTask?: string; progress?: number }
  ): Promise<boolean> => {
    const response = await apiRequest<{ agent: AgentResponse }>(`/api/mission/agents/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return response.success;
  }, []);

  // 发送事件到后端
  const sendEvent = useCallback(async (event: {
    type?: string;
    message: string;
    taskId?: string;
    agentId?: string;
    data?: Record<string, unknown>;
  }): Promise<boolean> => {
    const response = await apiRequest<{ event: EventResponse }>('/api/mission/events', {
      method: 'POST',
      body: JSON.stringify(event),
    });
    return response.success;
  }, []);

  // 广播消息
  const broadcast = useCallback(async (message: string, data?: Record<string, unknown>): Promise<boolean> => {
    const response = await apiRequest<{ event: EventResponse }>('/api/mission/broadcast', {
      method: 'POST',
      body: JSON.stringify({ message, data }),
    });
    return response.success;
  }, []);

  return {
    // 同步操作
    syncTasks,
    syncAgents,
    syncEvents,
    fetchStats,

    // 任务操作
    createTask,
    updateTaskStatus,
    deleteTask,
    executeTask,
    cancelTask,

    // Agent 操作
    registerAgent,
    updateAgentStatus,

    // 事件操作
    sendEvent,
    broadcast,
  };
}

// 导出 demo 数据供未连接时使用
export const demoAgents: Omit<MissionAgent, 'lastHeartbeat'>[] = [
  {
    id: 'agent-planner-01',
    name: '战略规划师',
    role: 'planner',
    status: 'idle',
    avatar: '🧠',
    capabilities: ['任务分解', '资源规划', '风险评估', '优先级排序'],
    progress: 0,
  },
  {
    id: 'agent-executor-01',
    name: '执行专家',
    role: 'executor',
    status: 'idle',
    avatar: '⚡',
    capabilities: ['代码生成', '任务执行', '批量处理', '自动化'],
    progress: 0,
  },
  {
    id: 'agent-executor-02',
    name: '数据分析师',
    role: 'executor',
    status: 'idle',
    avatar: '📊',
    capabilities: ['数据分析', '可视化', '报表生成', '指标监控'],
    progress: 0,
  },
  {
    id: 'agent-reviewer-01',
    name: '质量审核员',
    role: 'reviewer',
    status: 'idle',
    avatar: '🔍',
    capabilities: ['代码审查', '质量检查', '测试验证', '合规审计'],
    progress: 0,
  },
  {
    id: 'agent-coordinator-01',
    name: '任务协调员',
    role: 'coordinator',
    status: 'idle',
    avatar: '🎯',
    capabilities: ['任务调度', '进度跟踪', '资源协调', '状态同步'],
    progress: 0,
  },
];

export const demoTasks: Omit<MissionTask, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    title: '系统架构设计',
    description: '设计新一代微服务架构方案，包含服务网格、熔断降级、限流策略',
    priority: 'critical',
    status: 'pending',
    estimatedDuration: 3600000,
  },
  {
    title: '用户认证模块重构',
    description: '将 JWT 认证迁移至 OAuth 2.0，支持第三方登录',
    priority: 'high',
    status: 'pending',
    estimatedDuration: 1800000,
  },
  {
    title: '数据库性能优化',
    description: '分析慢查询日志，优化索引策略，提升查询效率 50%',
    priority: 'high',
    status: 'pending',
    estimatedDuration: 2400000,
  },
  {
    title: '前端组件库升级',
    description: '升级 React 18 至 React 19，更新配套组件库',
    priority: 'medium',
    status: 'pending',
    estimatedDuration: 1200000,
  },
  {
    title: 'API 文档自动化',
    description: '集成 Swagger 生成 API 文档，实现版本管理',
    priority: 'medium',
    status: 'pending',
    estimatedDuration: 900000,
  },
];
