import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  A2AMessageType,
  A2ATaskStatus,
  CoordinationMode,
} from './dto/a2a.dto';

export interface Agent {
  id: string;
  name: string;
  type: string;
  endpoint?: string;
  capabilities: string[];
  metadata: Record<string, any>;
  status: string;
  lastHeartbeat: number;
  registeredAt: number;
}

export interface A2AMessage {
  id: string;
  type: A2AMessageType;
  from: string;
  to: string;
  taskId?: string;
  payload: Record<string, any>;
  priority: number;
  createdAt: number;
  expiresAt?: number;
  received: boolean;
}

export interface A2ATask {
  id: string;
  type: string;
  title: string;
  description: string;
  from: string;
  to: string;
  status: A2ATaskStatus;
  input: Record<string, any>;
  result?: Record<string, any>;
  progress: number;
  dependencies: string[];
  priority: number;
  tags: string[];
  metadata: Record<string, any>;
  maxTurns: number;
  timeout: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface CollaborationResult {
  id: string;
  title: string;
  status: string;
  summary: {
    totalTasks: number;
    completed: number;
    failed: number;
    skipped: number;
    successRate: number;
  };
  results: any[];
  dependencyGraph: {
    nodes: any[];
    edges: any[];
  };
  validation: {
    passed: boolean;
    criteria: number;
  };
  createdAt: number;
  completedAt?: number;
}

@Injectable()
export class A2AService {
  private readonly logger = new Logger(A2AService.name);
  private agents: Map<string, Agent> = new Map();
  private messages: Map<string, A2AMessage[]> = new Map();
  private tasks: Map<string, A2ATask> = new Map();
  private collaborations: Map<string, CollaborationResult> = new Map();
  private inbox: Map<string, A2AMessage[]> = new Map();

  constructor() {
    this.logger.log('A2AService initialized');
  }

  // ============ Agent Management ============

  registerAgent(config: {
    id: string;
    name?: string;
    type?: string;
    endpoint?: string;
    capabilities?: string[];
    metadata?: Record<string, any>;
  }): Agent {
    const agent: Agent = {
      id: config.id,
      name: config.name || config.id,
      type: config.type || 'general',
      endpoint: config.endpoint,
      capabilities: config.capabilities || [],
      metadata: config.metadata || {},
      status: 'online',
      lastHeartbeat: Date.now(),
      registeredAt: Date.now(),
    };

    this.agents.set(agent.id, agent);
    this.logger.log(`Agent registered: ${agent.id}`);
    return agent;
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.inbox.delete(agentId);
    this.logger.log(`Agent unregistered: ${agentId}`);
  }

  agentHeartbeat(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastHeartbeat = Date.now();
      agent.status = 'online';
    }
  }

  listAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  // ============ Message Management ============

  sendMessage(message: {
    type?: A2AMessageType;
    from: string;
    to: string;
    taskId?: string;
    payload?: Record<string, any>;
    priority?: number;
    timeout?: number;
  }): { success: boolean; messageId: string } {
    const msg: A2AMessage = {
      id: `msg_${uuidv4()}`,
      type: message.type || A2AMessageType.MESSAGE_SEND,
      from: message.from,
      to: message.to,
      taskId: message.taskId,
      payload: message.payload || {},
      priority: message.priority || 0,
      createdAt: Date.now(),
      expiresAt: message.timeout
        ? Date.now() + message.timeout
        : Date.now() + 5 * 60 * 1000,
      received: false,
    };

    const inbox = this.inbox.get(message.to) || [];
    inbox.push(msg);
    this.inbox.set(message.to, inbox);

    this.logger.debug(`Message sent: ${msg.id} from ${msg.from} to ${msg.to}`);
    return { success: true, messageId: msg.id };
  }

  receiveMessages(
    agentId: string,
    options: {
      limit?: number;
      includeExpired?: boolean;
      clearReceived?: boolean;
    } = {},
  ): A2AMessage[] {
    const inbox = this.inbox.get(agentId) || [];
    const now = Date.now();

    let messages = inbox.filter((m) => {
      if (options.includeExpired) return true;
      return !m.expiresAt || m.expiresAt > now;
    });

    if (options.clearReceived) {
      this.inbox.set(agentId, []);
    }

    messages = messages.slice(0, options.limit || 50);
    return messages;
  }

  getUnreadCount(agentId: string): number {
    const inbox = this.inbox.get(agentId) || [];
    const now = Date.now();
    return inbox.filter((m) => !m.received && (!m.expiresAt || m.expiresAt > now))
      .length;
  }

  // ============ Task Management ============

  delegateTask(config: {
    from: string;
    to: string;
    title?: string;
    description?: string;
    input?: Record<string, any>;
    priority?: number;
    tags?: string[];
    metadata?: Record<string, any>;
    timeout?: number;
  }): A2ATask {
    const task: A2ATask = {
      id: `task_${uuidv4()}`,
      type: A2AMessageType.TASK_DELEGATE,
      title: config.title || 'Untitled Task',
      description: config.description || '',
      from: config.from,
      to: config.to,
      status: A2ATaskStatus.PENDING,
      input: config.input || {},
      result: undefined,
      progress: 0,
      dependencies: [],
      priority: config.priority || 0,
      tags: config.tags || [],
      metadata: config.metadata || {},
      maxTurns: 50,
      timeout: config.timeout || 5 * 60 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.tasks.set(task.id, task);
    this.logger.log(`Task delegated: ${task.id} from ${task.from} to ${task.to}`);
    return task;
  }

  getTaskStatus(taskId: string): A2ATask | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(filters: {
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
  } = {}): A2ATask[] {
    let tasks = Array.from(this.tasks.values());

    if (filters.status) {
      tasks = tasks.filter((t) => t.status === filters.status);
    }
    if (filters.from) {
      tasks = tasks.filter((t) => t.from === filters.from);
    }
    if (filters.to) {
      tasks = tasks.filter((t) => t.to === filters.to);
    }

    return tasks.slice(0, filters.limit || 100);
  }

  returnResult(
    taskId: string,
    result: Record<string, any>,
    status: A2ATaskStatus = A2ATaskStatus.COMPLETED,
    metadata: Record<string, any> = {},
  ): { success: boolean; task?: A2ATask } {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false };
    }

    task.result = result;
    task.status = status;
    task.metadata = { ...task.metadata, ...metadata };
    task.updatedAt = Date.now();
    task.completedAt = Date.now();

    this.logger.log(`Task result returned: ${taskId} with status ${status}`);
    return { success: true, task };
  }

  sendProgress(
    taskId: string,
    progress: number,
    metadata: Record<string, any> = {},
  ): { success: boolean; task?: A2ATask } {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false };
    }

    task.progress = progress;
    task.status = A2ATaskStatus.IN_PROGRESS;
    task.metadata = { ...task.metadata, ...metadata };
    task.updatedAt = Date.now();

    return { success: true, task };
  }

  cancelTask(taskId: string): { success: boolean; message?: string } {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, message: 'Task not found' };
    }

    if (task.status === A2ATaskStatus.COMPLETED) {
      return { success: false, message: 'Cannot cancel completed task' };
    }

    task.status = A2ATaskStatus.CANCELLED;
    task.updatedAt = Date.now();
    task.completedAt = Date.now();

    this.logger.log(`Task cancelled: ${taskId}`);
    return { success: true, message: 'Task cancelled' };
  }

  // ============ Collaboration Management ============

  createCollaboration(
    title: string,
    tasks: any[],
    options: { coordinationMode?: CoordinationMode; [key: string]: any } = {},
  ): CollaborationResult {
    const collaboration: CollaborationResult = {
      id: `collab_${uuidv4()}`,
      title,
      status: 'pending',
      summary: {
        totalTasks: tasks.length,
        completed: 0,
        failed: 0,
        skipped: 0,
        successRate: 0,
      },
      results: [],
      dependencyGraph: { nodes: [], edges: [] },
      validation: { passed: false, criteria: 0 },
      createdAt: Date.now(),
    };

    this.collaborations.set(collaboration.id, collaboration);
    this.logger.log(`Collaboration created: ${collaboration.id}`);
    return collaboration;
  }

  getCollaborationStatus(collaborationId: string): CollaborationResult | undefined {
    return this.collaborations.get(collaborationId);
  }

  getCollaborationResult(collaborationId: string): CollaborationResult | undefined {
    return this.collaborations.get(collaborationId);
  }

  cancelCollaboration(collaborationId: string): boolean {
    const collab = this.collaborations.get(collaborationId);
    if (!collab) {
      return false;
    }

    if (collab.status === 'completed' || collab.status === 'failed') {
      return false;
    }

    collab.status = 'cancelled';
    collab.completedAt = Date.now();
    return true;
  }

  // ============ Status & Stats ============

  syncStatus(
    agentId: string,
    status: string = 'available',
    metadata: Record<string, any> = {},
  ): { success: boolean; agent?: Agent } {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { success: false };
    }

    agent.status = status;
    agent.metadata = { ...agent.metadata, ...metadata };
    agent.lastHeartbeat = Date.now();

    return { success: true, agent };
  }

  getStats(): {
    totalAgents: number;
    onlineAgents: number;
    totalMessages: number;
    totalTasks: number;
    pendingTasks: number;
    completedTasks: number;
    totalCollaborations: number;
  } {
    const agents = this.listAgents();
    const tasks = this.listTasks();

    return {
      totalAgents: agents.length,
      onlineAgents: agents.filter((a) => a.status === 'online').length,
      totalMessages: Array.from(this.inbox.values()).reduce(
        (sum, msgs) => sum + msgs.length,
        0,
      ),
      totalTasks: tasks.length,
      pendingTasks: tasks.filter((t) => t.status === A2ATaskStatus.PENDING).length,
      completedTasks: tasks.filter(
        (t) => t.status === A2ATaskStatus.COMPLETED,
      ).length,
      totalCollaborations: this.collaborations.size,
    };
  }
}
