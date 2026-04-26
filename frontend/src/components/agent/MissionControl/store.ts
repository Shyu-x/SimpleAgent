// Mission Control Zustand Store
import { create } from 'zustand';
import type { MissionControlStore, MissionAgent, MissionTask, MissionEvent, AgentStatus, TaskStatus, EventType, ActionHistoryItem } from './types';

// 生成唯一ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// Store 状态扩展
interface MissionControlStoreState extends MissionControlStore {
  soundEnabled: boolean;
  actionHistory: ActionHistoryItem[];
  selectedTaskIds: string[];
}

// 初始状态
const initialState = {
  isActive: false,
  missionId: undefined as string | undefined,
  missionName: undefined as string | undefined,
  createdAt: undefined as number | undefined,
  agents: [] as MissionAgent[],
  tasks: [] as MissionTask[],
  events: [] as MissionEvent[],
  totalTasks: 0,
  completedTasks: 0,
  failedTasks: 0,
  soundEnabled: true,
  actionHistory: [] as ActionHistoryItem[],
  selectedTaskIds: [] as string[],
};

// 创建 Store
export const useMissionControlStore = create<MissionControlStoreState>((set, get) => ({
  ...initialState,

  // 任务操作
  addTask: (taskData) => {
    const id = generateId();
    const now = Date.now();
    const task: MissionTask = {
      ...taskData,
      id,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => ({
      tasks: [...state.tasks, task],
      totalTasks: state.totalTasks + 1,
    }));

    get().addEvent({
      type: 'task_created',
      taskId: id,
      message: `新建任务: ${task.title}`,
    });

    return id;
  },

  updateTask: (taskId, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, ...updates, updatedAt: Date.now() } : t
      ),
    }));
  },

  assignTask: (taskId, agentId) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, assignedAgent: agentId, status: 'assigned' as TaskStatus, updatedAt: Date.now() }
          : t
      ),
    }));

    const agent = get().agents.find((a) => a.id === agentId);
    get().addEvent({
      type: 'task_assigned',
      taskId,
      agentId,
      message: `任务已分配给 ${agent?.name || agentId}`,
    });
  },

  completeTask: (taskId, result) => {
    set((state) => {
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return state;

      return {
        tasks: state.tasks.map((t) =>
          t.id === taskId
            ? { ...t, status: 'completed' as TaskStatus, result, updatedAt: Date.now() }
            : t
        ),
        completedTasks: state.completedTasks + 1,
      };
    });

    get().addEvent({
      type: 'task_completed',
      taskId,
      message: result ? `任务完成: ${result}` : '任务已完成',
    });
    get().addActionHistory('completeTask', `taskId: ${taskId}`);
  },

  failTask: (taskId, error) => {
    set((state) => {
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return state;

      return {
        tasks: state.tasks.map((t) =>
          t.id === taskId
            ? { ...t, status: 'failed' as TaskStatus, error, updatedAt: Date.now() }
            : t
        ),
        failedTasks: state.failedTasks + 1,
      };
    });

    get().addEvent({
      type: 'task_failed',
      taskId,
      message: `任务失败: ${error}`,
    });
    get().addActionHistory('failTask', `taskId: ${taskId}, error: ${error}`);
  },

  // Agent 操作
  updateAgentStatus: (agentId, status, currentTask) => {
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId
          ? { ...a, status, currentTask, lastHeartbeat: Date.now() }
          : a
      ),
    }));

    get().addEvent({
      type: 'agent_status_change',
      agentId,
      message: `Agent ${agentId} 状态: ${status}`,
    });
  },

  updateAgentProgress: (agentId, progress) => {
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, progress } : a
      ),
    }));
  },

  // 事件操作
  addEvent: (eventData) => {
    const event: MissionEvent = {
      ...eventData,
      id: generateId(),
      timestamp: Date.now(),
    };

    set((state) => ({
      events: [event, ...state.events].slice(0, 100),
    }));
  },

  clearEvents: () => {
    set({ events: [] });
  },

  // 广播
  broadcastTask: (taskId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;

    get().addEvent({
      type: 'broadcast',
      taskId,
      message: `广播任务: ${task.title}`,
      data: { task },
    });
    get().addActionHistory('broadcastTask', `taskId: ${taskId}`);
  },

  broadcastMessage: (message, data) => {
    get().addEvent({
      type: 'broadcast',
      message,
      data,
    });
  },

  // 删除任务
  removeTask: (taskId) => {
    set((state) => {
      const task = state.tasks.find((t) => t.id === taskId);
      return {
        tasks: state.tasks.filter((t) => t.id !== taskId),
        totalTasks: state.totalTasks - (task ? 1 : 0),
        completedTasks: state.completedTasks - (task?.status === 'completed' ? 1 : 0),
        failedTasks: state.failedTasks - (task?.status === 'failed' ? 1 : 0),
        selectedTaskIds: state.selectedTaskIds.filter((id) => id !== taskId),
      };
    });
  },

  // 清理已完成任务
  clearCompletedTasks: () => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.status !== 'completed'),
      completedTasks: 0,
      selectedTaskIds: [],
    }));
    get().addActionHistory('clearCompleted', 'Cleared all completed tasks');
  },

  // 声音控制
  toggleSound: () => {
    set((state) => ({ soundEnabled: !state.soundEnabled }));
  },

  setSoundEnabled: (enabled) => {
    set({ soundEnabled: enabled });
  },

  // 操作历史
  addActionHistory: (action, details) => {
    const item: ActionHistoryItem = {
      id: generateId(),
      action,
      timestamp: Date.now(),
      details,
    };
    set((state) => ({
      actionHistory: [item, ...state.actionHistory].slice(0, 50),
    }));
  },

  clearActionHistory: () => {
    set({ actionHistory: [] });
  },

  // 批量选择
  toggleTaskSelection: (taskId) => {
    set((state) => ({
      selectedTaskIds: state.selectedTaskIds.includes(taskId)
        ? state.selectedTaskIds.filter((id) => id !== taskId)
        : [...state.selectedTaskIds, taskId],
    }));
  },

  selectAllTasks: () => {
    set((state) => ({
      selectedTaskIds: state.tasks.map((t) => t.id),
    }));
  },

  clearSelection: () => {
    set({ selectedTaskIds: [] });
  },

  batchComplete: (result) => {
    const { selectedTaskIds, tasks, completeTask } = get();
    selectedTaskIds.forEach((taskId) => {
      const task = tasks.find((t) => t.id === taskId);
      if (task && task.status !== 'completed' && task.status !== 'failed') {
        completeTask(taskId, result);
      }
    });
    get().addActionHistory('batchComplete', `Completed ${selectedTaskIds.length} tasks`);
    set({ selectedTaskIds: [] });
  },

  batchFail: (error) => {
    const { selectedTaskIds, tasks, failTask } = get();
    selectedTaskIds.forEach((taskId) => {
      const task = tasks.find((t) => t.id === taskId);
      if (task && task.status !== 'completed' && task.status !== 'failed') {
        failTask(taskId, error);
      }
    });
    get().addActionHistory('batchFail', `Failed ${selectedTaskIds.length} tasks`);
    set({ selectedTaskIds: [] });
  },

  // 重置
  reset: () => {
    set(initialState);
  },

  // 设置任务列表（用于后端同步）
  setTasks: (tasks) => {
    set({ tasks });
  },

  // 设置 Agent 列表（用于后端同步）
  setAgents: (agents) => {
    set({ agents });
  },
}));

// 初始化 Agent 池
export const initializeAgents = (agents: Omit<MissionAgent, 'lastHeartbeat'>[]) => {
  useMissionControlStore.setState({
    agents: agents.map((a) => ({
      ...a,
      lastHeartbeat: Date.now(),
    })),
  });
};

// 开始任务
export const startMission = (name: string, tasks: Omit<MissionTask, 'id' | 'createdAt' | 'updatedAt'>[]) => {
  const missionId = generateId();
  const now = Date.now();

  useMissionControlStore.setState({
    isActive: true,
    missionId,
    missionName: name,
    createdAt: now,
    totalTasks: tasks.length,
    completedTasks: 0,
    failedTasks: 0,
    tasks: tasks.map((t) => ({
      ...t,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    })),
    events: [
      {
        id: generateId(),
        type: 'system' as EventType,
        timestamp: now,
        message: `任务 "${name}" 已启动`,
      },
    ],
  });
};

// 停止任务
export const stopMission = () => {
  useMissionControlStore.setState({
    isActive: false,
  });
};

// 导出类型
export type { MissionAgent, MissionTask, MissionEvent, AgentStatus, TaskStatus, EventType };
