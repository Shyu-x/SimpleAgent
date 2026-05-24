// stores/taskStore.ts - 任务状态管理 Store
import { create } from 'zustand';

/**
 * 任务状态枚举
 */
export type TaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/**
 * 错误信息结构
 */
export interface ErrorInfo {
  code?: string;
  message: string;
  stack?: string;
}

/**
 * 流数据块结构
 */
export interface StreamChunk {
  type: 'chunk' | 'thinking' | 'tool_call' | 'progress' | 'log';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * 任务数据结构
 */
export interface Task {
  id: string;
  collaborationId: string;
  status: TaskStatus;
  progress: number;
  stage?: string;
  result?: unknown;
  error?: ErrorInfo;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * SSE 连接状态
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * 任务状态 Store 接口
 */
interface TaskState {
  // 任务数据
  tasks: Record<string, Task>;

  // 活跃任务 ID 列表
  activeTaskIds: string[];

  // 流数据缓冲
  streamBuffers: Record<string, StreamChunk[]>;

  // SSE 连接状态
  connectionStatus: ConnectionStatus;

  // 最后错误信息
  lastError: ErrorInfo | null;

  // Actions - 任务管理
  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  removeTask: (taskId: string) => void;
  clearTask: (taskId: string) => void;

  // Actions - 活跃任务管理
  setTaskActive: (taskId: string, active: boolean) => void;
  getActiveTasks: () => Task[];

  // Actions - 流数据缓冲
  addStreamChunk: (taskId: string, chunk: StreamChunk) => void;
  clearStreamBuffer: (taskId: string) => void;
  getStreamBuffer: (taskId: string) => StreamChunk[];

  // Actions - 连接状态
  setConnectionStatus: (status: ConnectionStatus) => void;
  setLastError: (error: ErrorInfo | null) => void;

  // Actions - 批量操作
  batchUpdateTasks: (updates: Array<{ taskId: string; updates: Partial<Task> }>) => void;
  clearAllTasks: () => void;
}

/**
 * 任务状态 Store
 * 管理所有任务的生命周期、流数据缓冲和连接状态
 */
export const useTaskStore = create<TaskState>((set, get) => ({
  // 初始状态
  tasks: {},
  activeTaskIds: [],
  streamBuffers: {},
  connectionStatus: 'disconnected',
  lastError: null,

  // ========== 任务管理 ==========

  /**
   * 添加新任务
   */
  addTask: (task) =>
    set((state) => ({
      tasks: { ...state.tasks, [task.id]: task },
      activeTaskIds: task.status === 'RUNNING'
        ? [...state.activeTaskIds.filter(id => id !== task.id), task.id]
        : state.activeTaskIds,
    })),

  /**
   * 更新任务
   */
  updateTask: (taskId, updates) =>
    set((state) => {
      const existingTask = state.tasks[taskId];
      if (!existingTask) return state;

      const updatedTask: Task = {
        ...existingTask,
        ...updates,
        updatedAt: Date.now(),
      };

      return {
        tasks: { ...state.tasks, [taskId]: updatedTask },
        activeTaskIds: updates.status && !['PENDING', 'RUNNING'].includes(updates.status)
          ? state.activeTaskIds.filter(id => id !== taskId)
          : state.activeTaskIds,
      };
    }),

  /**
   * 移除任务（完全删除）
   */
  removeTask: (taskId) =>
    set((state) => {
      const { [taskId]: _, ...remainingTasks } = state.tasks;
      const { [taskId]: __, ...remainingBuffers } = state.streamBuffers;
      return {
        tasks: remainingTasks,
        streamBuffers: remainingBuffers,
        activeTaskIds: state.activeTaskIds.filter(id => id !== taskId),
      };
    }),

  /**
   * 清除任务数据（保留任务记录，清除流缓冲）
   */
  clearTask: (taskId) =>
    set((state) => ({
      streamBuffers: {
        ...state.streamBuffers,
        [taskId]: [],
      },
    })),

  // ========== 活跃任务管理 ==========

  /**
   * 设置任务活跃状态
   */
  setTaskActive: (taskId, active) =>
    set((state) => ({
      activeTaskIds: active
        ? [...state.activeTaskIds.filter(id => id !== taskId), taskId]
        : state.activeTaskIds.filter(id => id !== taskId),
    })),

  /**
   * 获取所有活跃任务
   */
  getActiveTasks: () => {
    const { activeTaskIds, tasks } = get();
    return activeTaskIds.map(id => tasks[id]).filter(Boolean);
  },

  // ========== 流数据缓冲 ==========

  /**
   * 添加流数据块
   */
  addStreamChunk: (taskId, chunk) =>
    set((state) => ({
      streamBuffers: {
        ...state.streamBuffers,
        [taskId]: [...(state.streamBuffers[taskId] || []), chunk],
      },
    })),

  /**
   * 清除流数据缓冲
   */
  clearStreamBuffer: (taskId) =>
    set((state) => ({
      streamBuffers: {
        ...state.streamBuffers,
        [taskId]: [],
      },
    })),

  /**
   * 获取流数据缓冲
   */
  getStreamBuffer: (taskId) => {
    const state = get();
    return state.streamBuffers[taskId] || [];
  },

  // ========== 连接状态 ==========

  /**
   * 设置连接状态
   */
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  /**
   * 设置最后错误
   */
  setLastError: (error) => set({ lastError: error }),

  // ========== 批量操作 ==========

  /**
   * 批量更新任务
   */
  batchUpdateTasks: (updates) =>
    set((state) => {
      const newTasks = { ...state.tasks };
      let newActiveTaskIds = [...state.activeTaskIds];

      for (const { taskId, updates: taskUpdates } of updates) {
        const existingTask = newTasks[taskId];
        if (!existingTask) continue;

        newTasks[taskId] = {
          ...existingTask,
          ...taskUpdates,
          updatedAt: Date.now(),
        };

        // 更新活跃任务列表
        if (taskUpdates.status && !['PENDING', 'RUNNING'].includes(taskUpdates.status)) {
          newActiveTaskIds = newActiveTaskIds.filter(id => id !== taskId);
        }
      }

      return {
        tasks: newTasks,
        activeTaskIds: newActiveTaskIds,
      };
    }),

  /**
   * 清除所有任务
   */
  clearAllTasks: () =>
    set({
      tasks: {},
      activeTaskIds: [],
      streamBuffers: {},
      lastError: null,
    }),
}));

export default useTaskStore;