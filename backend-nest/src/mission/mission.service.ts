import { Injectable, NotFoundException } from '@nestjs/common';

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum AgentRole {
  PLANNER = 'planner',
  EXECUTOR = 'executor',
  REVIEWER = 'reviewer',
  COORDINATOR = 'coordinator',
}

export enum AgentStatus {
  IDLE = 'idle',
  THINKING = 'thinking',
  WORKING = 'working',
  WAITING = 'waiting',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export interface Task {
  id: string;
  name: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedAgent: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  result: any;
  error: string | null;
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  avatar: string | null;
  status: AgentStatus;
  currentTask: string | null;
  progress: number;
  capabilities: string[];
  lastHeartbeat: number;
}

export interface Event {
  id: string;
  type: string;
  timestamp: number;
  taskId?: string;
  agentId?: string;
  message: string;
  data?: any;
}

@Injectable()
export class MissionService {
  private readonly tasks: Map<string, Task> = new Map();
  private readonly agents: Map<string, Agent> = new Map();
  private readonly events: Event[] = [];

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private paginate<T>(items: T[], page: number = 1, limit: number = 20) {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedItems = items.slice(startIndex, endIndex);
    return {
      items: paginatedItems,
      pagination: {
        page,
        limit,
        total: items.length,
        totalPages: Math.ceil(items.length / limit),
        hasMore: endIndex < items.length,
      },
    };
  }

  // Task methods
  createTask(dto: { name: string; description?: string; priority?: string; assignedAgent?: string }): Task {
    const now = Date.now();
    const task: Task = {
      id: this.generateId(),
      name: dto.name,
      description: dto.description || '',
      priority: (dto.priority as TaskPriority) || TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      assignedAgent: dto.assignedAgent || null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
    };

    this.tasks.set(task.id, task);
    this.addEvent({ type: 'task_created', message: `新建任务: ${task.name}`, taskId: task.id });

    return task;
  }

  getTasks(filters: { page?: number; limit?: number; status?: string; priority?: string; agentId?: string } = {}): {
    tasks: Task[];
    pagination: any;
  } {
    let tasks = Array.from(this.tasks.values());

    if (filters.status) {
      const statuses = filters.status.split(',');
      tasks = tasks.filter((t) => statuses.includes(t.status));
    }

    if (filters.priority) {
      const priorities = filters.priority.split(',');
      tasks = tasks.filter((t) => priorities.includes(t.priority));
    }

    if (filters.agentId) {
      tasks = tasks.filter((t) => t.assignedAgent === filters.agentId);
    }

    tasks.sort((a, b) => b.createdAt - a.createdAt);

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const result = this.paginate(tasks, page, limit);

    return { tasks: result.items, pagination: result.pagination };
  }

  getTask(id: string): Task {
    const task = this.tasks.get(id);
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  updateTask(
    id: string,
    updates: Partial<{
      name: string;
      description: string;
      priority: string;
      status: string;
      assignedAgent: string;
      result: any;
      error: string;
    }>,
  ): Task {
    const task = this.tasks.get(id);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const now = Date.now();
    const updated: Partial<Task> = { updatedAt: now };

    if (updates.name !== undefined) updated.name = updates.name;
    if (updates.description !== undefined) updated.description = updates.description;
    if (updates.priority !== undefined) updated.priority = updates.priority as TaskPriority;
    if (updates.assignedAgent !== undefined) updated.assignedAgent = updates.assignedAgent;
    if (updates.result !== undefined) updated.result = updates.result;
    if (updates.error !== undefined) updated.error = updates.error;

    if (updates.status !== undefined) {
      updated.status = updates.status as TaskStatus;
      if (updates.status === TaskStatus.RUNNING && !task.startedAt) {
        updated.startedAt = now;
      }
      if (updates.status === TaskStatus.COMPLETED || updates.status === TaskStatus.FAILED) {
        updated.completedAt = now;
      }
    }

    const updatedTask = { ...task, ...updated };
    this.tasks.set(id, updatedTask);

    if (updates.status) {
      this.addEvent({
        type: this.getStatusEventType(updates.status as TaskStatus),
        message: this.getStatusMessage(updates.status as TaskStatus, task.name),
        taskId: id,
        agentId: updates.assignedAgent,
      });
    }

    return updatedTask;
  }

  private getStatusEventType(status: TaskStatus): string {
    switch (status) {
      case TaskStatus.RUNNING:
        return 'task_started';
      case TaskStatus.COMPLETED:
        return 'task_completed';
      case TaskStatus.FAILED:
        return 'task_failed';
      case TaskStatus.CANCELLED:
        return 'task_cancelled';
      default:
        return 'task_updated';
    }
  }

  private getStatusMessage(status: string, name: string): string {
    switch (status) {
      case TaskStatus.RUNNING:
        return `任务开始执行: ${name}`;
      case TaskStatus.COMPLETED:
        return `任务完成: ${name}`;
      case TaskStatus.FAILED:
        return `任务失败: ${name}`;
      case TaskStatus.CANCELLED:
        return `任务已取消: ${name}`;
      default:
        return `任务更新: ${name}`;
    }
  }

  deleteTask(id: string): void {
    if (!this.tasks.has(id)) {
      throw new NotFoundException('Task not found');
    }
    this.tasks.delete(id);
  }

  executeTask(id: string): Task {
    const task = this.tasks.get(id);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
      throw new Error('Task already finished');
    }

    const now = Date.now();
    const updated: Task = {
      ...task,
      status: TaskStatus.RUNNING,
      startedAt: task.startedAt || now,
      updatedAt: now,
    };
    this.tasks.set(id, updated);

    this.addEvent({ type: 'task_started', message: `任务开始执行: ${task.name}`, taskId: id });

    return updated;
  }

  cancelTask(id: string): Task {
    const task = this.tasks.get(id);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.status === TaskStatus.COMPLETED) {
      throw new Error('Cannot cancel completed task');
    }

    const now = Date.now();
    const updated: Task = { ...task, status: TaskStatus.CANCELLED, updatedAt: now };
    this.tasks.set(id, updated);

    this.addEvent({ type: 'task_cancelled', message: `任务已取消: ${task.name}`, taskId: id });

    return updated;
  }

  // Agent methods
  createAgent(dto: { name: string; role?: string; avatar?: string; capabilities?: string[] }): Agent {
    const now = Date.now();
    const agent: Agent = {
      id: this.generateId(),
      name: dto.name,
      role: (dto.role as AgentRole) || AgentRole.EXECUTOR,
      avatar: dto.avatar || null,
      status: AgentStatus.IDLE,
      currentTask: null,
      progress: 0,
      capabilities: dto.capabilities || [],
      lastHeartbeat: now,
    };

    this.agents.set(agent.id, agent);
    this.addEvent({ type: 'agent_status_change', message: `Agent 注册: ${agent.name}`, agentId: agent.id });

    return agent;
  }

  getAgents(filters: { status?: string; role?: string } = {}): Agent[] {
    let agents = Array.from(this.agents.values());

    if (filters.status) {
      const statuses = filters.status.split(',');
      agents = agents.filter((a) => statuses.includes(a.status));
    }

    if (filters.role) {
      agents = agents.filter((a) => a.role === filters.role);
    }

    agents.sort((a, b) => a.name.localeCompare(b.name));
    return agents;
  }

  updateAgent(
    id: string,
    updates: Partial<{ status: AgentStatus; currentTask: string; progress: number; capabilities: string[] }>,
  ): Agent {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const now = Date.now();
    const updated: Agent = { ...agent, ...updates, lastHeartbeat: now };
    this.agents.set(id, updated);

    if (updates.status) {
      this.addEvent({
        type: 'agent_status_change',
        message: `Agent ${agent.name} 状态: ${updates.status}`,
        agentId: id,
      });
    }

    return updated;
  }

  deleteAgent(id: string): void {
    if (!this.agents.has(id)) {
      throw new NotFoundException('Agent not found');
    }
    this.agents.delete(id);
  }

  // Event methods
  addEvent(dto: { type?: string; message: string; taskId?: string; agentId?: string; data?: any }): Event {
    const event: Event = {
      id: this.generateId(),
      type: dto.type || 'system',
      timestamp: Date.now(),
      taskId: dto.taskId,
      agentId: dto.agentId,
      message: dto.message,
      data: dto.data,
    };

    this.events.unshift(event);
    return event;
  }

  getEvents(limit: number = 50): Event[] {
    return this.events.slice(0, limit);
  }

  getStats(): any {
    const tasks = Array.from(this.tasks.values());
    const agents = Array.from(this.agents.values());

    return {
      totalTasks: tasks.length,
      pendingTasks: tasks.filter((t) => t.status === TaskStatus.PENDING).length,
      runningTasks: tasks.filter((t) => t.status === TaskStatus.RUNNING).length,
      completedTasks: tasks.filter((t) => t.status === TaskStatus.COMPLETED).length,
      failedTasks: tasks.filter((t) => t.status === TaskStatus.FAILED).length,
      cancelledTasks: tasks.filter((t) => t.status === TaskStatus.CANCELLED).length,
      totalAgents: agents.length,
      idleAgents: agents.filter((a) => a.status === AgentStatus.IDLE).length,
      workingAgents: agents.filter((a) => a.status === AgentStatus.WORKING).length,
      waitingAgents: agents.filter((a) => a.status === AgentStatus.WAITING).length,
      errorAgents: agents.filter((a) => a.status === AgentStatus.ERROR).length,
      recentEvents: this.events.slice(0, 20),
    };
  }

  broadcast(message: string, data?: any): Event {
    return this.addEvent({ type: 'broadcast', message, data });
  }
}
