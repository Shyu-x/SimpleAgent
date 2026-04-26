// MissionControl Hook - 封装 store 常用操作
import { useCallback, useMemo } from 'react';
import { useMissionControlStore, initializeAgents, startMission } from './store';
import type { MissionAgent, MissionTask, MissionEvent, TaskPriority } from './types';

// 后端 API 地址
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000';

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

// Demo Agents - 5个不同角色的 Agent
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

// Demo Tasks - 10个不同优先级的任务
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
  {
    title: '日志监控系统搭建',
    description: '部署 ELK Stack，实现日志收集、分析、告警',
    priority: 'medium',
    status: 'pending',
    estimatedDuration: 3000000,
  },
  {
    title: '单元测试覆盖率提升',
    description: '将单元测试覆盖率从 45% 提升至 80%',
    priority: 'low',
    status: 'pending',
    estimatedDuration: 1500000,
  },
  {
    title: 'CI/CD 流程优化',
    description: '优化构建流程，缩短 CI/CD 耗时 40%',
    priority: 'low',
    status: 'pending',
    estimatedDuration: 600000,
  },
  {
    title: '技术文档整理',
    description: '整理项目技术债，编写架构设计文档',
    priority: 'low',
    status: 'pending',
    estimatedDuration: 720000,
  },
  {
    title: '开发环境容器化',
    description: '使用 Docker Compose 简化本地开发环境搭建',
    priority: 'low',
    status: 'pending',
    estimatedDuration: 450000,
  },
];

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

/**
 * initializeMission - 初始化演示数据
 */
export function initializeMission(missionName: string = '演示任务') {
  initializeAgents(demoAgents);
  startMission(missionName, demoTasks);
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
    const response = await agentWorkflowAPI.healthCheck();
    if (response.success && response.data) {
      // 后端健康检查返回 engines 和 crews 数量
      // 实际的 Agent 列表需要从其他端点获取
      return demoAgents; // 暂时使用 demo，实际应从后端获取
    }
    return demoAgents;
  } catch (error) {
    console.error('[MissionControl] Failed to fetch agents:', error);
    return demoAgents;
  }
}

/**
 * 从后端获取任务列表
 */
export async function fetchTasksFromBackend(): Promise<Omit<MissionTask, 'id' | 'createdAt' | 'updatedAt'>[]> {
  try {
    const response = await agentWorkflowAPI.healthCheck();
    if (response.success && response.data) {
      return demoTasks; // 暂时使用 demo，实际应从后端获取
    }
    return demoTasks;
  } catch (error) {
    console.error('[MissionControl] Failed to fetch tasks:', error);
    return demoTasks;
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
    // 降级到 demo 数据
    initializeMission(missionName);
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
