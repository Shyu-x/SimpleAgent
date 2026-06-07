'use client';

/**
 * 并行任务执行进度追踪面板
 * 实时展示多Agent并行任务执行状态与依赖关系
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, Clock, AlertCircle, CheckCircle2, XCircle, Minus, ArrowRight } from 'lucide-react';
import { BACKEND_URL } from '@/lib/config';

/**
 * 任务状态枚举
 */
export type TaskExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/**
 * Agent角色枚举
 */
export type AgentRole = 'PLANNER' | 'EXECUTOR' | 'REVIEWER' | 'COORDINATOR';

/**
 * 任务项接口
 */
export interface TaskExecutionItem {
  id: string;
  name: string;
  status: TaskExecutionStatus;
  role: AgentRole;
  progress: number; // 0-100
  dependencies?: string[]; // 依赖的任务ID列表
  estimatedDuration?: number; // 预估时长(ms)
  actualDuration?: number; // 实际时长(ms)
  error?: string;
  result?: string;
  startTime?: number;
  endTime?: number;
  level?: number; // 执行层级，用于并行任务组可视化
  parallelGroup?: string; // 并行组ID，同一组任务并行执行
}

/**
 * 任务层级组
 */
interface TaskLevelGroup {
  level: number;
  tasks: TaskExecutionItem[];
}

/**
 * 状态颜色配置
 */
const STATUS_COLORS: Record<TaskExecutionStatus, { bg: string; border: string; text: string; badge: string }> = {
  PENDING: {
    bg: 'bg-gray-100',
    border: 'border-gray-300',
    text: 'text-gray-600',
    badge: 'bg-gray-500'
  },
  RUNNING: {
    bg: 'bg-blue-50',
    border: 'border-blue-400',
    text: 'text-blue-700',
    badge: 'bg-blue-500 animate-pulse'
  },
  COMPLETED: {
    bg: 'bg-green-50',
    border: 'border-green-400',
    text: 'text-green-700',
    badge: 'bg-green-500'
  },
  FAILED: {
    bg: 'bg-red-50',
    border: 'border-red-400',
    text: 'text-red-700',
    badge: 'bg-red-500'
  },
  CANCELLED: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-400',
    text: 'text-yellow-700',
    badge: 'bg-yellow-500'
  }
};

/**
 * 角色颜色配置
 */
const ROLE_COLORS: Record<AgentRole, { bg: string; text: string }> = {
  PLANNER: { bg: 'bg-purple-100', text: 'text-purple-700' },
  EXECUTOR: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  REVIEWER: { bg: 'bg-teal-100', text: 'text-teal-700' },
  COORDINATOR: { bg: 'bg-rose-100', text: 'text-rose-700' }
};

/**
 * 角色中文名称
 */
const ROLE_NAMES: Record<AgentRole, string> = {
  PLANNER: '规划者',
  EXECUTOR: '执行者',
  REVIEWER: '审核者',
  COORDINATOR: '协调者'
};

/**
 * 状态中文名称
 */
const STATUS_NAMES: Record<TaskExecutionStatus, string> = {
  PENDING: '待执行',
  RUNNING: '执行中',
  COMPLETED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消'
};

/**
 * 状态图标组件
 */
const StatusIcon: React.FC<{ status: TaskExecutionStatus; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const icons = {
    PENDING: <Minus className={`${iconSize} text-gray-400`} />,
    RUNNING: <Clock className={`${iconSize} text-blue-500 animate-spin`} />,
    COMPLETED: <CheckCircle2 className={`${iconSize} text-green-500`} />,
    FAILED: <XCircle className={`${iconSize} text-red-500`} />,
    CANCELLED: <AlertCircle className={`${iconSize} text-yellow-500`} />
  };
  return icons[status];
};

/**
 * 任务卡片组件
 */
const TaskCard: React.FC<{
  task: TaskExecutionItem;
  onClick?: (task: TaskExecutionItem) => void;
  showDependency?: boolean;
  taskMap?: Map<string, TaskExecutionItem>;
}> = ({ task, onClick, showDependency = true, taskMap }) => {
  const colors = STATUS_COLORS[task.status];

  // 获取依赖任务名称
  const dependencyNames = useMemo(() => {
    if (!showDependency || !task.dependencies?.length || !taskMap) return [];
    return task.dependencies
      .map(depId => taskMap.get(depId)?.name)
      .filter(Boolean);
  }, [task.dependencies, taskMap, showDependency]);

  return (
    <div
      className={`
        relative p-3 rounded-lg border-l-4 cursor-pointer
        transition-all duration-200 hover:shadow-md
        ${colors.bg} ${colors.border}
        ${task.status === 'RUNNING' ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
      `}
      onClick={() => onClick?.(task)}
    >
      {/* 头部：状态+角色 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusIcon status={task.status} />
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[task.role].bg} ${ROLE_COLORS[task.role].text}`}>
            {ROLE_NAMES[task.role]}
          </span>
        </div>
        <span className={`text-xs font-medium ${colors.text}`}>
          {STATUS_NAMES[task.status]}
        </span>
      </div>

      {/* 任务名称 */}
      <div className={`font-medium ${colors.text} mb-2 line-clamp-2`}>
        {task.name}
      </div>

      {/* 进度条 */}
      {task.status === 'RUNNING' && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>进度</span>
            <span>{task.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 依赖关系 */}
      {dependencyNames.length > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
          <ArrowRight className="w-3 h-3" />
          <span>依赖: {dependencyNames.join(', ')}</span>
        </div>
      )}

      {/* 执行时长 */}
      {task.actualDuration && (
        <div className="mt-1 text-xs text-gray-400">
          耗时: {(task.actualDuration / 1000).toFixed(1)}s
        </div>
      )}

      {/* 错误信息 */}
      {task.status === 'FAILED' && task.error && (
        <div className="mt-2 text-xs text-red-600 bg-red-100 rounded p-2">
          {task.error}
        </div>
      )}
    </div>
  );
};

/**
 * 依赖箭头组件（SVG绘制）
 */
const DependencyArrow: React.FC<{
  fromIndex: number;
  toIndex: number;
  totalWidth: number;
  isHorizontal?: boolean;
}> = ({ fromIndex, toIndex, totalWidth, isHorizontal = true }) => {
  if (isHorizontal) {
    const arrowWidth = 40;
    const startX = fromIndex * (totalWidth / 2) + (totalWidth / 4);
    const endX = toIndex * (totalWidth / 2) + (totalWidth / 4);
    const y = 0;

    return (
      <svg
        className="absolute top-1/2 left-0 w-full h-4 pointer-events-none"
        style={{ transform: 'translateY(-50%)' }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 6 3, 0 6" fill="#94a3b8" />
          </marker>
        </defs>
        <line
          x1={startX}
          y1={y}
          x2={endX}
          y2={y}
          stroke="#94a3b8"
          strokeWidth="2"
          strokeDasharray="4,2"
          markerEnd="url(#arrowhead)"
        />
      </svg>
    );
  }
  return null;
};

/**
 * 层级任务组组件
 */
const TaskLevelGroup: React.FC<{
  group: TaskLevelGroup;
  taskMap: Map<string, TaskExecutionItem>;
  onTaskClick?: (task: TaskExecutionItem) => void;
}> = ({ group, taskMap, onTaskClick }) => {
  const completedCount = group.tasks.filter(t => t.status === 'COMPLETED').length;
  const failedCount = group.tasks.filter(t => t.status === 'FAILED').length;
  const totalCount = group.tasks.length;

  return (
    <div className="relative mb-4">
      {/* 层级标签 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">
          Level {group.level}
        </span>
        <span className="text-xs text-gray-400">
          ({completedCount}/{totalCount} 完成
          {failedCount > 0 && `, ${failedCount} 失败`})
        </span>
      </div>

      {/* 任务卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {group.tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={onTaskClick}
            taskMap={taskMap}
            showDependency={true}
          />
        ))}
      </div>

      {/* 层级分隔线 */}
      <div className="mt-4 border-t border-gray-200" />
    </div>
  );
};

/**
 * 进度摘要组件
 */
const ProgressSummary: React.FC<{
  tasks: TaskExecutionItem[];
}> = ({ tasks }) => {
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'COMPLETED').length;
    const failed = tasks.filter(t => t.status === 'FAILED').length;
    const running = tasks.filter(t => t.status === 'RUNNING').length;
    const pending = tasks.filter(t => t.status === 'PENDING').length;
    const cancelled = tasks.filter(t => t.status === 'CANCELLED').length;

    // 计算整体进度
    const completedProgress = completed * 100;
    const runningProgress = tasks
      .filter(t => t.status === 'RUNNING')
      .reduce((sum, t) => sum + t.progress, 0);
    const overallProgress = total > 0
      ? Math.round((completedProgress + runningProgress) / total)
      : 0;

    return { total, completed, failed, running, pending, cancelled, overallProgress };
  }, [tasks]);

  return (
    <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-lg p-4 mb-4">
      {/* 总体进度 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-lg font-semibold text-gray-800">
            总体进度
          </span>
          <span className="ml-2 text-2xl font-bold text-blue-600">
            {stats.overallProgress}%
          </span>
        </div>
        <div className="text-sm text-gray-500">
          {stats.total} 个任务
        </div>
      </div>

      {/* 进度条 */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
        <div
          className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${stats.overallProgress}%` }}
        />
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-2">
        <div className="text-center p-2 bg-green-50 rounded-lg">
          <div className="text-lg font-bold text-green-600">{stats.completed}</div>
          <div className="text-xs text-green-600">完成</div>
        </div>
        <div className="text-center p-2 bg-blue-50 rounded-lg">
          <div className="text-lg font-bold text-blue-600">{stats.running}</div>
          <div className="text-xs text-blue-600">进行中</div>
        </div>
        <div className="text-center p-2 bg-gray-100 rounded-lg">
          <div className="text-lg font-bold text-gray-600">{stats.pending}</div>
          <div className="text-xs text-gray-600">待执行</div>
        </div>
        <div className="text-center p-2 bg-red-50 rounded-lg">
          <div className="text-lg font-bold text-red-600">{stats.failed}</div>
          <div className="text-xs text-red-600">失败</div>
        </div>
        <div className="text-center p-2 bg-yellow-50 rounded-lg">
          <div className="text-lg font-bold text-yellow-600">{stats.cancelled}</div>
          <div className="text-xs text-yellow-600">取消</div>
        </div>
      </div>
    </div>
  );
};

/**
 * SSE订阅Hook
 */
function useTaskExecutionSubscription(
  sessionId?: string,
  onTasksUpdate?: (tasks: TaskExecutionItem[]) => void
) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setConnected(false);
      return;
    }

    const eventSource = new EventSource(`${BACKEND_URL}/api/a2a/subscribe/${sessionId}`);

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'heartbeat' || data.type === 'connected') return;

        if (data.type === 'task_update' && data.tasks) {
          onTasksUpdate?.(data.tasks);
        }

        if (data.type === 'collaboration_update' && data.tasks) {
          onTasksUpdate?.(data.tasks);
        }
      } catch (e) {
        // 忽略解析错误
      }
    };

    eventSource.onerror = () => {
      setError('SSE连接失败');
      setConnected(false);
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [sessionId, onTasksUpdate]);

  return { connected, error };
}

/**
 * 主组件 Props
 */
export interface TaskExecutionPanelProps {
  /** 任务列表 */
  tasks: TaskExecutionItem[];
  /** 会话ID（用于SSE订阅） */
  sessionId?: string;
  /** 是否展开 */
  defaultExpanded?: boolean;
  /** 自动刷新间隔(ms)，0表示不自动刷新 */
  autoRefreshInterval?: number;
  /** 是否显示依赖关系 */
  showDependencies?: boolean;
  /** 是否显示进度摘要 */
  showSummary?: boolean;
  /** 任务点击回调 */
  onTaskClick?: (task: TaskExecutionItem) => void;
  /** 所有任务完成回调 */
  onAllComplete?: () => void;
  /** 类名 */
  className?: string;
}

/**
 * 并行任务执行进度追踪面板
 */
const TaskExecutionPanel: React.FC<TaskExecutionPanelProps> = ({
  tasks: initialTasks,
  sessionId,
  defaultExpanded = true,
  autoRefreshInterval = 2000,
  showDependencies = true,
  showSummary = true,
  onTaskClick,
  onAllComplete,
  className = ''
}) => {
  const [tasks, setTasks] = useState<TaskExecutionItem[]>(initialTasks);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  // 创建任务Map用于查找
  const taskMap = useMemo(() => {
    return new Map(tasks.map(t => [t.id, t]));
  }, [tasks]);

  // 按层级分组任务
  const taskLevels = useMemo(() => {
    const levels: TaskLevelGroup[] = [];
    const levelMap = new Map<number, TaskExecutionItem[]>();

    for (const task of tasks) {
      const level = task.level ?? 0;
      if (!levelMap.has(level)) {
        levelMap.set(level, []);
      }
      levelMap.get(level)!.push(task);
    }

    // 按level排序并创建group
    const sortedLevels = Array.from(levelMap.keys()).sort((a, b) => a - b);
    for (const level of sortedLevels) {
      levels.push({
        level,
        tasks: levelMap.get(level) || []
      });
    }

    return levels;
  }, [tasks]);

  // SSE订阅更新
  const handleTasksUpdate = useCallback((newTasks: TaskExecutionItem[]) => {
    setTasks(newTasks);
    setLastUpdate(Date.now());
  }, []);

  const { connected: sseConnected, error: sseError } = useTaskExecutionSubscription(
    sessionId,
    handleTasksUpdate
  );

  // 轮询更新
  useEffect(() => {
    if (autoRefreshInterval <= 0 || sseConnected) return;

    const interval = setInterval(() => {
      setLastUpdate(Date.now());
    }, autoRefreshInterval);

    return () => clearInterval(interval);
  }, [autoRefreshInterval, sseConnected]);

  // 检查是否全部完成
  useEffect(() => {
    const allDone = tasks.every(t =>
      t.status === 'COMPLETED' ||
      t.status === 'FAILED' ||
      t.status === 'CANCELLED'
    );
    if (allDone && tasks.length > 0) {
      onAllComplete?.();
    }
  }, [tasks, onAllComplete]);

  // 合并外部传入的tasks更新
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // 计算统计
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'COMPLETED').length;
    const failed = tasks.filter(t => t.status === 'FAILED').length;
    return { total, completed, failed };
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
        <div className="p-6 text-center text-gray-400">
          暂无任务
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* 头部 */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {/* 展开/折叠图标 */}
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-500" />
          )}

          <h3 className="text-lg font-semibold text-gray-800">
            并行任务进度
          </h3>

          {/* 状态标签 */}
          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
            {stats.completed}/{stats.total}
          </span>

          {/* SSE连接状态 */}
          {sessionId && (
            <span className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-green-500' : sseError ? 'bg-red-500' : 'bg-gray-300'}`} />
          )}
        </div>

        {/* 更新时间 */}
        <div className="text-xs text-gray-400">
          更新: {new Date(lastUpdate).toLocaleTimeString()}
        </div>
      </div>

      {/* 内容区域 */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200">
          {/* 进度摘要 */}
          {showSummary && <ProgressSummary tasks={tasks} />}

          {/* 依赖关系图示（简化版） */}
          {showDependencies && tasks.some(t => t.dependencies?.length) && (
            <div className="mb-4 p-3 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-gray-600 mb-2">依赖关系</div>
              <div className="flex flex-wrap gap-2">
                {tasks.map(task => {
                  if (!task.dependencies?.length) return null;
                  const depTasks = task.dependencies
                    .map(depId => taskMap.get(depId)?.name)
                    .filter(Boolean);
                  return (
                    <div key={task.id} className="text-xs">
                      <span className="text-gray-500">{depTasks.join(', ')}</span>
                      <ArrowRight className="inline w-3 h-3 mx-1 text-gray-400" />
                      <span className="font-medium">{task.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 层级任务组 */}
          <div className="space-y-2">
            {taskLevels.map(group => (
              <TaskLevelGroup
                key={group.level}
                group={group}
                taskMap={taskMap}
                onTaskClick={onTaskClick}
              />
            ))}
          </div>

          {/* 图例 */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs font-medium text-gray-500 mb-2">状态图例</div>
            <div className="flex flex-wrap gap-4">
              {Object.entries(STATUS_COLORS).map(([status, colors]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full ${colors.badge}`} />
                  <span className={`text-xs ${colors.text}`}>
                    {STATUS_NAMES[status as TaskExecutionStatus]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskExecutionPanel;