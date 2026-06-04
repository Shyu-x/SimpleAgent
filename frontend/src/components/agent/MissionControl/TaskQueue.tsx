'use client';

import { memo, useCallback, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  GripVertical,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  Users,
  X
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TaskQueueProps, MissionTask, TaskPriority, TaskStatus } from './types';
import { useMissionControlStore } from './store';

// 优先级配置 - 优化颜色对比度
const priorityConfig: Record<TaskPriority, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: 'text-red-500', bg: 'bg-red-500/15', border: 'border-red-500/40', label: '紧急' },
  high: { color: 'text-orange-500', bg: 'bg-orange-500/15', border: 'border-orange-500/40', label: '高' },
  medium: { color: 'text-amber-500', bg: 'bg-amber-500/15', border: 'border-amber-500/40', label: '中' },
  low: { color: 'text-emerald-500', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', label: '低' },
};

// 状态配置 - 优化颜色对比度
const statusConfig: Record<TaskStatus, { color: string; bg: string; icon: typeof Clock; label: string }> = {
  pending: { color: 'text-slate-400', bg: 'bg-slate-500/20', icon: Clock, label: '待分配' },
  assigned: { color: 'text-blue-400', bg: 'bg-blue-500/20', icon: ArrowRight, label: '已分配' },
  in_progress: { color: 'text-cyan-400', bg: 'bg-cyan-500/20', icon: Clock, label: '进行中' },
  completed: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', icon: CheckCircle2, label: '已完成' },
  failed: { color: 'text-rose-500', bg: 'bg-rose-500/20', icon: XCircle, label: '失败' },
  cancelled: { color: 'text-slate-500', bg: 'bg-slate-600/20', icon: XCircle, label: '已取消' },
};

// 可排序列举
const STATUS_FILTERS: TaskStatus[] = ['pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled'];
const PRIORITY_FILTERS: TaskPriority[] = ['critical', 'high', 'medium', 'low'];

// 可排序任务项
const SortableTaskItem = memo(function SortableTaskItem({
  task,
  isExpanded,
  onToggleExpand,
  onAssign,
}: {
  task: MissionTask;
  isExpanded: boolean;
  onToggleExpand: (taskId: string) => void;
  onAssign: (taskId: string) => void;
}) {
  const priority = priorityConfig[task.priority];
  const status = statusConfig[task.status];
  const StatusIcon = status.icon;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`
        group relative overflow-hidden rounded-lg
        ${priority.bg} ${priority.border}
        border cursor-pointer
        hover:shadow-lg transition-all duration-200
        ${isDragging ? 'shadow-xl ring-2 ring-blue-500/50' : ''}
      `}
    >
      {/* 左侧优先级指示条 */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${priority.color}`} />

      <div className="flex items-start gap-2 pl-2 pr-3 py-2">
        {/* 拖拽手柄 */}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 transition-opacity pt-1 cursor-grab active:cursor-grabbing"
        >
          <GripVertical size={14} className="text-slate-500" />
        </div>

        {/* 展开/折叠按钮 */}
        <button
          onClick={() => onToggleExpand(task.id)}
          className="mt-1 p-0.5 hover:bg-white/10 rounded transition-colors"
        >
          {isExpanded ? (
            <ChevronDown size={14} className="text-slate-400" />
          ) : (
            <ChevronRight size={14} className="text-slate-400" />
          )}
        </button>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-medium text-white text-sm truncate">{task.title}</h4>
            <span className={`flex items-center gap-1 text-xs ${status.color} ${status.bg} px-1.5 py-0.5 rounded`}>
              <StatusIcon size={12} />
              {status.label}
            </span>
          </div>

          {/* 收起状态显示摘要 */}
          {!isExpanded && task.description && (
            <p className="text-xs text-slate-400 line-clamp-1 mt-1">{task.description}</p>
          )}

          {/* 收起状态显示关键信息 */}
          {!isExpanded && (
            <div className="flex items-center justify-between mt-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-1.5 py-0.5 rounded ${priority.bg} ${priority.color}`}>
                  {priority.label}
                </span>
                {task.assignedAgent && (
                  <span className="text-xs text-blue-400">
                    → {task.assignedAgent}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 展开状态显示详情 */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-2 pt-2 border-t border-white/10">
                  {task.description && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">描述</p>
                      <p className="text-xs text-slate-300">{task.description}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${priority.bg} ${priority.color}`}>
                      优先级: {priority.label}
                    </span>
                    {task.assignedAgent && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                        执行者: {task.assignedAgent}
                      </span>
                    )}
                    {task.estimatedDuration && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400">
                        预计: {Math.round(task.estimatedDuration / 1000)}s
                      </span>
                    )}
                    {task.actualDuration && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400">
                        实际: {Math.round(task.actualDuration / 1000)}s
                      </span>
                    )}
                  </div>

                  {task.result && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">结果</p>
                      <p className="text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded">{task.result}</p>
                    </div>
                  )}

                  {task.error && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">错误</p>
                      <p className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded">{task.error}</p>
                    </div>
                  )}

                  {task.subtasks && task.subtasks.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">子任务 ({task.subtasks.length})</p>
                      <div className="space-y-1">
                        {task.subtasks.map((subtask) => (
                          <div
                            key={subtask.id}
                            className="text-xs p-1.5 bg-white/5 rounded flex items-center gap-2"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              subtask.status === 'completed' ? 'bg-emerald-500' :
                              subtask.status === 'failed' ? 'bg-rose-500' :
                              subtask.status === 'in_progress' ? 'bg-cyan-500' :
                              'bg-slate-500'
                            }`} />
                            <span className="flex-1 truncate">{subtask.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-slate-500">
                      创建: {new Date(task.createdAt).toLocaleString('zh-CN')}
                    </span>
                    {task.updatedAt !== task.createdAt && (
                      <span className="text-xs text-slate-500">
                        更新: {new Date(task.updatedAt).toLocaleString('zh-CN')}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 收起状态底部操作 */}
          {!isExpanded && (
            <div className="flex items-center justify-between mt-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-1.5 py-0.5 rounded ${priority.bg} ${priority.color}`}>
                  {priority.label}
                </span>
                {task.assignedAgent && (
                  <span className="text-xs text-blue-400">
                    → {task.assignedAgent}
                  </span>
                )}
              </div>

              {task.status === 'pending' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssign(task.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-blue-400 hover:text-blue-300"
                >
                  分配
                </button>
              )}
            </div>
          )}
        </div>

        {/* 更多按钮 */}
        <button
          aria-label="任务更多操作"
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded"
        >
          <MoreVertical size={14} className="text-slate-400" />
        </button>
      </div>

      {/* 进度条 (进行中) */}
      {task.status === 'in_progress' && (
        <div className="h-1 bg-white/10">
          <motion.div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400"
            initial={{ width: 0 }}
            animate={{ width: `${task.progress || 60}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}
    </motion.div>
  );
});

// 任务队列组件
const TaskQueueInner = memo(function TaskQueueInner({
  tasks,
  onTaskClick,
  onAssign,
  maxDisplay = 20,
}: TaskQueueProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [localTasks, setLocalTasks] = useState<MissionTask[]>(tasks);

  const agents = useMissionControlStore((state) => state.agents);
  const assignTask = useMissionControlStore((state) => state.assignTask);

  // 传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 过滤任务
  const filteredTasks = useMemo(() => {
    return localTasks.filter((task) => {
      // 搜索过滤
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(query);
        const matchDesc = task.description?.toLowerCase().includes(query);
        const matchAgent = task.assignedAgent?.toLowerCase().includes(query);
        if (!matchTitle && !matchDesc && !matchAgent) return false;
      }

      // 状态过滤
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;

      // 优先级过滤
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;

      return true;
    });
  }, [localTasks, searchQuery, statusFilter, priorityFilter]);

  // 统计
  const stats = useMemo(() => {
    const pending = localTasks.filter((t) => t.status === 'pending').length;
    const inProgress = localTasks.filter((t) => t.status === 'in_progress').length;
    const completed = localTasks.filter((t) => t.status === 'completed').length;
    const failed = localTasks.filter((t) => t.status === 'failed').length;
    return { pending, inProgress, completed, failed, total: localTasks.length };
  }, [localTasks]);

  // 展开/折叠
  const handleToggleExpand = useCallback((taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  // 分配任务
  const handleAssign = useCallback((taskId: string) => {
    onAssign?.(taskId);
  }, [onAssign]);

  // 批量分配
  const handleBatchAssign = useCallback(() => {
    const availableAgents = agents.filter((a) => a.status === 'idle' || a.status === 'waiting');
    if (availableAgents.length === 0) return;

    const pendingTasks = filteredTasks.filter((t) => t.status === 'pending');
    pendingTasks.forEach((task, index) => {
      const agent = availableAgents[index % availableAgents.length];
      assignTask(task.id, agent.id);
    });

    // 更新本地状态
    setLocalTasks((prev) =>
      prev.map((t) => {
        const pendingTask = pendingTasks.find((pt) => pt.id === t.id);
        if (pendingTask) {
          const agent = availableAgents[pendingTasks.indexOf(t) % availableAgents.length];
          return { ...t, status: 'assigned' as TaskStatus, assignedAgent: agent.name };
        }
        return t;
      })
    );
  }, [agents, filteredTasks, assignTask]);

  // 拖拽结束
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLocalTasks((items) => {
        const oldIndex = items.findIndex((t) => t.id === active.id);
        const newIndex = items.findIndex((t) => t.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  // 清除筛选
  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('all');
    setPriorityFilter('all');
  }, []);

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || priorityFilter !== 'all';

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
          <Clock size={24} className="text-slate-500" />
        </div>
        <p className="text-sm text-slate-400">暂无任务</p>
        <p className="text-xs text-slate-500 mt-1">创建新任务开始您的任务</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 搜索和筛选栏 */}
      <div className="px-3 py-2 border-b border-white/10 space-y-2">
        {/* 搜索框 */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索任务..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded
                       text-slate-200 placeholder:text-slate-500
                       focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* 筛选按钮和批量操作 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
          >
            <Filter size={12} />
            筛选
            {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
          </button>

          <button
            onClick={handleBatchAssign}
            disabled={filteredTasks.filter((t) => t.status === 'pending').length === 0 || agents.length === 0}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-emerald-500/20 text-emerald-400
                       hover:bg-emerald-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Users size={12} />
            批量分配
          </button>

          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded text-slate-400 hover:bg-white/10"
            >
              <X size={12} />
              清除
            </button>
          )}
        </div>

        {/* 筛选选项 */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 pt-2 border-t border-white/10">
                {/* 状态筛选 */}
                <div>
                  <p className="text-xs text-slate-500 mb-1">状态</p>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setStatusFilter('all')}
                      className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                        statusFilter === 'all' ? 'bg-blue-500/30 text-blue-400' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      全部
                    </button>
                    {STATUS_FILTERS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                          statusFilter === s ? `${statusConfig[s].bg} ${statusConfig[s].color}` : 'bg-white/5 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        {statusConfig[s].label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 优先级筛选 */}
                <div>
                  <p className="text-xs text-slate-500 mb-1">优先级</p>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setPriorityFilter('all')}
                      className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                        priorityFilter === 'all' ? 'bg-blue-500/30 text-blue-400' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      全部
                    </button>
                    {PRIORITY_FILTERS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPriorityFilter(p)}
                        className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                          priorityFilter === p ? `${priorityConfig[p].bg} ${priorityConfig[p].color}` : 'bg-white/5 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        {priorityConfig[p].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 头部统计 */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-white/10 text-xs">
        <div className="text-slate-400">
          共 <span className="text-white font-medium">{stats.total}</span> 个任务
        </div>
        {stats.pending > 0 && (
          <div className="text-yellow-400">
            {stats.pending} 个待分配
          </div>
        )}
        {stats.inProgress > 0 && (
          <div className="text-cyan-400">
            {stats.inProgress} 个进行中
          </div>
        )}
        {stats.completed > 0 && (
          <div className="text-emerald-400">
            {stats.completed} 个完成
          </div>
        )}
        {stats.failed > 0 && (
          <div className="text-rose-400">
            {stats.failed} 个失败
          </div>
        )}
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto p-3 mc-scrollbar">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredTasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {filteredTasks.slice(0, maxDisplay).map((task) => (
                <SortableTaskItem
                  key={task.id}
                  task={task}
                  isExpanded={expandedTasks.has(task.id)}
                  onToggleExpand={handleToggleExpand}
                  onAssign={handleAssign}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {filteredTasks.length === 0 && hasActiveFilters && (
          <div className="text-center py-6">
            <p className="text-sm text-slate-400">没有符合筛选条件的任务</p>
            <button
              onClick={handleClearFilters}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300"
            >
              清除筛选
            </button>
          </div>
        )}

        {filteredTasks.length > maxDisplay && (
          <div className="text-center py-2">
            <span className="text-xs text-slate-500">
              还有 {filteredTasks.length - maxDisplay} 个任务...
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

// 包装组件：使用 store 数据
const TaskQueue = memo(function TaskQueue({
  tasks: externalTasks,
  onTaskClick,
  onAssign,
  maxDisplay,
}: TaskQueueProps) {
  const storeTasks = useMissionControlStore((state) => state.tasks);

  // 如果没有传入 tasks，则使用 store 中的任务
  const tasks = externalTasks ?? storeTasks;

  return (
    <TaskQueueInner
      tasks={tasks}
      onTaskClick={onTaskClick}
      onAssign={onAssign}
      maxDisplay={maxDisplay}
    />
  );
});

export default TaskQueue;