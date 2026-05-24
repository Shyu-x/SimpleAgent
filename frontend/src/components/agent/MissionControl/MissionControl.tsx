'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BACKEND_URL } from '@/lib/config';
import { motion as motionClass } from 'framer-motion';
import {
  Users,
  ListTodo,
  Radio,
  Activity,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Check
} from 'lucide-react';

import AgentVisualizer from '../AgentVisualizer';

import { useMissionControlStore, initializeAgents, startMission, stopMission } from './store';
import { useMissionControlAPI } from './useMissionControlAPI';
import type { MissionAgent, MissionTask, MissionControlProps, MissionControlState } from './types';

import AgentCard from './AgentCard';
import TaskQueue from './TaskQueue';
import ResultsFeed from './ResultsFeed';
import TaskBroadcast from './TaskBroadcast';
import AgentStatusBar from './AgentStatusBar';
import ActionBar from './ActionBar';

import { demoAgents, demoTasks } from './useMissionControlAPI';

import './styles.css';

// Props 接口扩展（用于 initialAgents 和 initialTasks）
export interface MissionControlPropsExtended extends MissionControlProps {
  initialAgents?: Omit<MissionAgent, 'lastHeartbeat'>[];
  initialTasks?: Omit<MissionTask, 'id' | 'createdAt' | 'updatedAt'>[];
}

// TimelineItem 类型用于 SSE trace 数据
export interface TimelineItem {
  id: string;
  type: string;
  name: string;
  status: 'success' | 'running' | 'error' | 'pending';
  duration: number;
  depth: number;
  startTime: number;
  endTime: number;
  metadata?: Record<string, unknown>;
}

type TabType = 'queue' | 'broadcast';

/**
 * MissionControl 主组件
 * 任务编排与控制中心，采用 CSS Grid 实现严格布局
 */
const MissionControl = memo(function MissionControl({
  className = '',
  initialAgents = [],
  initialTasks = [],
  onEvent,
  onTaskComplete,
  onAllTasksComplete,
}: MissionControlPropsExtended) {
  // 从 store 获取状态和操作
  const {
    isActive,
    missionId,
    missionName,
    agents,
    tasks,
    events,
    totalTasks,
    completedTasks,
    failedTasks,
    addTask,
    assignTask,
    completeTask,
    failTask,
    updateAgentStatus,
    updateAgentProgress,
    broadcastTask,
    removeTask,
    reset,
  } = useMissionControlStore();

  // 本地状态
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('queue');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Mini 可视化状态
  const [showMiniViz, setShowMiniViz] = useState(false);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  const [showFullViz, setShowFullViz] = useState(false);

  // SSE trace 数据订阅状态
  const [traceSteps, setTraceSteps] = useState<TimelineItem[]>([]);

  // 连接后端 API
  const {
    syncTasks,
    syncAgents,
    syncEvents,
    createTask,
    updateTaskStatus,
    deleteTask,
  } = useMissionControlAPI();

  // 组件挂载时从后端同步数据
  useEffect(() => {
    syncTasks();
    syncAgents();
    syncEvents();
  }, [syncTasks, syncAgents, syncEvents]);

  // 后端同步后如果没有agents，用demo数据
  useEffect(() => {
    if (agents.length === 0 && !isActive) {
      initializeAgents(demoAgents);
    }
  }, [agents.length, isActive]);

  // 初始化 agents
  useEffect(() => {
    if (initialAgents.length > 0) {
      initializeAgents(initialAgents);
    }
  }, [initialAgents]);

  // 初始化任务
  useEffect(() => {
    if (initialTasks.length > 0 && missionName) {
      startMission(missionName, initialTasks);
    }
  }, [initialTasks, missionName]);

  // 事件回调
  useEffect(() => {
    if (onEvent && events.length > 0) {
      onEvent(events[0]);
    }
  }, [events, onEvent]);

  // 任务完成回调
  useEffect(() => {
    if (onTaskComplete && tasks.length > 0) {
      const completed = tasks.find((t) => t.status === 'completed');
      if (completed) {
        onTaskComplete(completed);
      }
    }
  }, [tasks, onTaskComplete]);

  // 全部任务完成回调
  useEffect(() => {
    if (onAllTasksComplete && totalTasks > 0 && completedTasks + failedTasks === totalTasks) {
      onAllTasksComplete();
    }
  }, [completedTasks, failedTasks, totalTasks, onAllTasksComplete]);

  // 监听任务执行，自动显示 mini 可视化
  useEffect(() => {
    const executingTask = tasks.find(t => t.status === 'in_progress' || t.status === 'assigned');
    if (executingTask?.traceId && !showMiniViz) {
      setActiveTraceId(executingTask.traceId);
      setShowMiniViz(true);
    }
  }, [tasks, showMiniViz]);

  // 任务完成后自动隐藏 mini 可视化
  useEffect(() => {
    const completedCount = tasks.filter(t => t.status === 'completed' || t.status === 'failed').length;
    if (completedCount > 0 && showMiniViz) {
      const timer = setTimeout(() => setShowMiniViz(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [tasks, showMiniViz]);

  // SSE 订阅 trace 数据
  useEffect(() => {
    if (!activeTraceId) return;

    const eventSource = new EventSource(
      `${BACKEND_URL}/api/admin/traces/subscribe/live?traceId=${activeTraceId}`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // 跳过心跳和连接消息
        if (data.type === 'heartbeat' || data.type === 'connected') return;

        // 处理 span_update 事件
        if (data.type === 'span_update') {
          const span = data.data;
          setTraceSteps(prev => [...prev, {
            id: span.spanId || `span-${Date.now()}`,
            type: span.name,
            name: span.name,
            status: span.status === 'ok' ? 'success' : 'running',
            duration: span.duration || 0,
            depth: 0,
            startTime: span.startTime,
            endTime: span.endTime || Date.now(),
            metadata: span.tags || {}
          }]);
        }
      } catch (e) {
        console.error('Trace SSE parse error:', e);
      }
    };

    eventSource.onerror = () => {
      console.warn('Trace SSE connection error, closing...');
      eventSource.close();
    };

    return () => eventSource.close();
  }, [activeTraceId]);

  // 计算进行中的任务数量
  const activeTaskCount = useMemo(() => {
    return tasks.filter((t) => t.status === 'in_progress' || t.status === 'assigned').length;
  }, [tasks]);

  // 待广播的紧急任务
  const pendingTasks = useMemo(() => {
    return tasks.filter((t) => t.status === 'pending' || t.status === 'assigned');
  }, [tasks]);

  // 选中的 Agent
  const selectedAgent = useMemo(() => {
    return agents.find((a) => a.id === selectedAgentId);
  }, [agents, selectedAgentId]);

  // 自动分配空闲 Agent
  const autoAssignTask = useCallback(
    (taskId: string) => {
      const idleAgent = agents.find((a) => a.status === 'idle');
      if (idleAgent) {
        assignTask(taskId, idleAgent.id);
        updateAgentStatus(idleAgent.id, 'working', taskId);
      }
    },
    [agents, assignTask, updateAgentStatus]
  );

  // 任务点击处理
  const handleTaskClick = useCallback(
    (task: MissionTask) => {
      if (task.status === 'pending') {
        autoAssignTask(task.id);
      }
    },
    [autoAssignTask]
  );

  // 任务分配处理
  const handleAssign = useCallback(
    (taskId: string) => {
      const idleAgent = agents.find((a) => a.status === 'idle');
      if (idleAgent) {
        assignTask(taskId, idleAgent.id);
        updateAgentStatus(idleAgent.id, 'working', taskId);
      }
    },
    [agents, assignTask, updateAgentStatus]
  );

  // 广播任务
  const handleBroadcast = useCallback(
    (taskId: string) => {
      broadcastTask(taskId);
    },
    [broadcastTask]
  );

  // 发布全部任务
  const handlePublishAll = useCallback(() => {
    const pending = tasks.filter((t) => t.status === 'pending');
    pending.forEach((task) => {
      autoAssignTask(task.id);
    });
  }, [tasks, autoAssignTask]);

  // 暂停/恢复
  const handlePause = useCallback(() => {
    setIsPaused((prev) => !prev);
    if (!isPaused) {
      // 暂停所有进行中的任务
      tasks
        .filter((t) => t.status === 'in_progress')
        .forEach((task) => {
          if (task.assignedAgent) {
            updateAgentStatus(task.assignedAgent, 'waiting', task.id);
          }
        });
    } else {
      // 恢复任务
      tasks
        .filter((t) => t.status === 'in_progress')
        .forEach((task) => {
          if (task.assignedAgent) {
            updateAgentStatus(task.assignedAgent, 'working', task.id);
          }
        });
    }
  }, [isPaused, tasks, updateAgentStatus]);

  // 停止所有任务
  const handleStopAll = useCallback(() => {
    stopMission();
    agents.forEach((agent) => {
      updateAgentStatus(agent.id, 'idle');
    });
  }, [agents, updateAgentStatus]);

  // 清理已完成任务
  const handleClearCompleted = useCallback(() => {
    tasks
      .filter((t) => t.status === 'completed' || t.status === 'failed')
      .forEach((task) => {
        removeTask(task.id);
      });
  }, [tasks, removeTask]);

  // 重置
  const handleReset = useCallback(() => {
    reset();
    setSelectedAgentId(null);
    setIsPaused(false);
  }, [reset]);

  // Agent 点击处理
  const handleAgentClick = useCallback((agent: MissionAgent) => {
    setSelectedAgentId((prev) => (prev === agent.id ? null : agent.id));
  }, []);

  // 手动添加任务（示例）
  const handleAddTask = useCallback(() => {
    addTask({
      title: `新任务 ${Date.now() % 1000}`,
      description: '这是一个测试任务',
      priority: 'medium',
      status: 'pending',
    });
  }, [addTask]);

  return (
    <motionClass.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      data-mission-control
      className={`flex flex-col h-full bg-slate-900 text-white overflow-hidden ${className}`}
    >
      {/* AgentStatusBar 顶部状态栏 */}
      <div className="flex-shrink-0">
        <AgentStatusBar
          agents={agents}
          totalTasks={totalTasks}
          completedTasks={completedTasks}
          failedTasks={failedTasks}
          isActive={isActive}
        />
      </div>

      {/* 主内容区域 - CSS Grid 布局 */}
      <div
        className={`
          flex-1 grid min-h-0
          grid-cols-[280px_1fr]
          grid-rows-[1fr_auto]
          ${isCollapsed ? 'grid-rows-[0_0_auto]' : ''}
          transition-all duration-300
        `}
      >
        {/* AgentPool 左侧区域 */}
        <motionClass.div
          layout
          className="
            col-span-1 row-span-1
            flex flex-col
            border-r border-white/10
            overflow-hidden
          "
        >
          {/* AgentPool 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-blue-400" />
              <span className="font-medium text-sm">Agent 池</span>
              <span className="text-xs text-slate-500 ml-1">({agents.length})</span>
            </div>
            <button
              onClick={handleAddTask}
              className="
                p-1.5 rounded-lg
                bg-white/5 hover:bg-white/10
                text-slate-400 hover:text-white
                transition-colors
              "
              title="添加任务"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Agent 卡片列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 mc-scrollbar">
            <AnimatePresence mode="popLayout">
              {agents.length === 0 ? (
                <motionClass.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-full text-center"
                >
                  <Users size={32} className="text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400">暂无 Agent</p>
                  <p className="text-xs text-slate-500 mt-1">请先初始化 Agent</p>
                </motionClass.div>
              ) : (
                agents.map((agent) => (
                  <motionClass.div
                    key={agent.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AgentCard
                      agent={agent}
                      isSelected={selectedAgentId === agent.id}
                      onClick={handleAgentClick}
                    />
                  </motionClass.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </motionClass.div>

        {/* 右侧区域 - 任务队列 + 广播 + 结果 */}
        <motionClass.div
          layout
          className="
            col-span-1 row-span-1
            flex flex-col
            overflow-hidden
          "
        >
          {/* 右上: TaskQueue + TaskBroadcast */}
          <div className="flex flex-col border-b border-white/10">
            {/* Tab 切换 */}
            <div className="flex items-center border-b border-white/10">
              <button
                onClick={() => setActiveTab('queue')}
                className={`
                  flex items-center gap-2 px-4 py-2.5 text-sm font-medium
                  border-b-2 transition-colors
                  ${
                    activeTab === 'queue'
                      ? 'text-blue-400 border-blue-400'
                      : 'text-slate-400 border-transparent hover:text-white'
                  }
                `}
              >
                <ListTodo size={14} />
                任务队列
                <span className="ml-1 text-xs bg-white/10 px-1.5 py-0.5 rounded">
                  {tasks.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('broadcast')}
                className={`
                  flex items-center gap-2 px-4 py-2.5 text-sm font-medium
                  border-b-2 transition-colors
                  ${
                    activeTab === 'broadcast'
                      ? 'text-purple-400 border-purple-400'
                      : 'text-slate-400 border-transparent hover:text-white'
                  }
                `}
              >
                <Radio size={14} />
                任务广播
                {pendingTasks.length > 0 && (
                  <span className="ml-1 text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                    {pendingTasks.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab 内容 */}
            <div className="h-64 overflow-hidden">
              <AnimatePresence mode="wait">
                {activeTab === 'queue' ? (
                  <motionClass.div
                    key="queue"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <TaskQueue
                      tasks={tasks}
                      onTaskClick={handleTaskClick}
                      onAssign={handleAssign}
                      maxDisplay={8}
                    />
                  </motionClass.div>
                ) : (
                  <motionClass.div
                    key="broadcast"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <TaskBroadcast
                      pendingTasks={pendingTasks}
                      onBroadcast={handleBroadcast}
                    />
                  </motionClass.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* 右下: ResultsFeed */}
          <motionClass.div
            layout
            className="flex-1 overflow-hidden"
          >
            <ResultsFeed />
          </motionClass.div>
        </motionClass.div>

        {/* ActionBar 底部操作栏 */}
        <motionClass.div
          layout
          className="
            col-span-2
            border-t border-white/10
          "
        >
            <ActionBar
              onPublishAll={handlePublishAll}
              onPauseAll={handlePause}
              onResumeAll={() => setIsPaused(false)}
              onStopAll={handleStopAll}
              onClearCompleted={handleClearCompleted}
              isPaused={isPaused}
              activeCount={activeTaskCount}
            />
        </motionClass.div>
      </div>

      {/* Mini 可视化 - 任务执行时自动显示 */}
      {showMiniViz && activeTraceId && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="fixed bottom-4 right-4 w-96 h-72 bg-white rounded-xl shadow-2xl z-40 overflow-hidden border border-gray-200"
        >
          <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              <span className="text-sm font-medium">执行中...</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFullViz(true)}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                title="展开完整视图"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowMiniViz(false)}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="p-2 h-[calc(100%-44px)] overflow-y-auto">
            <div className="text-xs text-gray-500 mb-2">Trace: {activeTraceId?.substring(0, 12)}...</div>

            {/* 真实的 trace timeline 显示 */}
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {traceSteps.slice(-5).map((step, i) => (
                <div key={step.id} className="bg-indigo-50 rounded px-2 py-1 text-xs flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${step.status === 'success' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  <span className="truncate">{step.type}</span>
                  <span className="text-gray-400 ml-auto">{step.duration}ms</span>
                </div>
              ))}
              {traceSteps.length === 0 && (
                <div className="text-xs text-gray-400 text-center py-4">等待执行...</div>
              )}
            </div>

            {/* 任务状态也显示 */}
            <div className="mt-2 space-y-1">
              {tasks.filter(t => t.status === 'in_progress').map(task => (
                <div key={task.id} className="bg-indigo-50 rounded px-2 py-1 text-xs">
                  执行: {task.title}
                </div>
              ))}
              {tasks.filter(t => t.status === 'completed').slice(-3).map(task => (
                <div key={task.id} className="bg-green-50 rounded px-2 py-1 text-xs flex items-center gap-1">
                  <Check className="w-3 h-3 text-green-500" />
                  {task.title}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* 完整可视化 Modal */}
      <AgentVisualizer
        isOpen={showFullViz}
        onClose={() => setShowFullViz(false)}
        traceId={activeTraceId || undefined}
      />
    </motionClass.div>
  );
});

export default MissionControl;
