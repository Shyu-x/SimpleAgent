// Mission Control 类型定义

// Agent 状态
export type AgentStatus = 'idle' | 'thinking' | 'working' | 'waiting' | 'completed' | 'error';

// Agent 信息
export interface MissionAgent {
  id: string;
  name: string;
  role: 'planner' | 'executor' | 'reviewer' | 'coordinator';
  status: AgentStatus;
  avatar?: string;
  currentTask?: string;
  progress: number; // 0-100
  capabilities: string[];
  lastHeartbeat: number;
}

// 任务优先级
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

// 任务状态
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

// 任务定义
export interface MissionTask {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedAgent?: string;
  createdAt: number;
  updatedAt: number;
  estimatedDuration?: number; // 毫秒
  actualDuration?: number;
  progress?: number; // 0-100, for in_progress tasks
  result?: string;
  error?: string;
  traceId?: string; // 用于 Mini 可视化的 trace ID
  subtasks?: MissionTask[];
}

// 实时事件类型
export type EventType = 'task_created' | 'task_assigned' | 'task_started' | 'task_progress' | 'task_completed' | 'task_failed' | 'agent_status_change' | 'broadcast' | 'system';

// 实时事件
export interface MissionEvent {
  id: string;
  type: EventType;
  timestamp: number;
  agentId?: string;
  taskId?: string;
  message: string;
  data?: Record<string, unknown>;
}

// 操作历史记录
export interface ActionHistoryItem {
  id: string;
  action: string;
  timestamp: number;
  details?: string;
}

// 系统状态
export interface MissionControlState {
  isActive: boolean;
  missionId?: string;
  missionName?: string;
  createdAt?: number;
  agents: MissionAgent[];
  tasks: MissionTask[];
  events: MissionEvent[];
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  soundEnabled: boolean;
  actionHistory: ActionHistoryItem[];
  selectedTaskIds: string[];
}

// Action types
export interface MissionControlActions {
  // 任务操作
  addTask: (task: Omit<MissionTask, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTask: (taskId: string, updates: Partial<MissionTask>) => void;
  assignTask: (taskId: string, agentId: string) => void;
  completeTask: (taskId: string, result?: string) => void;
  failTask: (taskId: string, error: string) => void;

  // Agent 操作
  updateAgentStatus: (agentId: string, status: AgentStatus, currentTask?: string) => void;
  updateAgentProgress: (agentId: string, progress: number) => void;

  // 事件操作
  addEvent: (event: Omit<MissionEvent, 'id' | 'timestamp'>) => void;
  clearEvents: () => void;

  // 任务广播
  broadcastTask: (taskId: string) => void;
  broadcastMessage: (message: string, data?: Record<string, unknown>) => void;

  // 任务清理
  removeTask: (taskId: string) => void;
  clearCompletedTasks: () => void;

  // 状态重置
  reset: () => void;

  // 声音控制
  toggleSound: () => void;
  setSoundEnabled: (enabled: boolean) => void;

  // 操作历史
  addActionHistory: (action: string, details?: string) => void;
  clearActionHistory: () => void;

  // 批量选择
  toggleTaskSelection: (taskId: string) => void;
  selectAllTasks: () => void;
  clearSelection: () => void;
  batchComplete: (result?: string) => void;
  batchFail: (error: string) => void;

  // 后端同步
  setTasks: (tasks: MissionTask[]) => void;
  setAgents: (agents: MissionAgent[]) => void;
}

// 完整 Store 类型
export type MissionControlStore = MissionControlState & MissionControlActions;

// 组件 Props
export interface AgentCardProps {
  agent: MissionAgent;
  isSelected?: boolean;
  onClick?: (agent: MissionAgent) => void;
  onSelect?: (agent: MissionAgent, selected: boolean) => void;
  onTaskClick?: (task: string) => void;
  onBroadcast?: (agentId: string) => void;
}

export interface TaskQueueProps {
  tasks: MissionTask[];
  onTaskClick?: (task: MissionTask) => void;
  onAssign?: (taskId: string) => void;
  maxDisplay?: number;
}

export interface ResultsFeedProps {
  events: MissionEvent[];
  maxDisplay?: number;
}

export interface TaskBroadcastProps {
  pendingTasks: MissionTask[];
  onBroadcast?: (taskId: string) => void;
}

export interface AgentStatusBarProps {
  agents: MissionAgent[];
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  isActive: boolean;
}

export interface ActionBarProps {
  onPublishAll?: () => void;
  onPauseAll?: () => void;
  onResumeAll?: () => void;
  onStopAll?: () => void;
  onClearCompleted?: () => void;
  isPaused?: boolean;
  activeCount: number;
}

export interface MissionControlProps {
  className?: string;
  initialState?: Partial<MissionControlState>;
  onEvent?: (event: MissionEvent) => void;
  onTaskComplete?: (task: MissionTask) => void;
  onAllTasksComplete?: () => void;
}
