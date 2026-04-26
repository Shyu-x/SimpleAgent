/**
 * MissionService - 任务控制中心业务逻辑层
 * 支持任务和Agent的持久化存储
 */

const fs = require('fs');
const path = require('path');

// 任务状态枚举
const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// 任务优先级枚举
const TaskPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

// Agent 角色枚举
const AgentRole = {
  PLANNER: 'planner',
  EXECUTOR: 'executor',
  REVIEWER: 'reviewer',
  COORDINATOR: 'coordinator'
};

// Agent 状态枚举
const AgentStatus = {
  IDLE: 'idle',
  THINKING: 'thinking',
  WORKING: 'working',
  WAITING: 'waiting',
  COMPLETED: 'completed',
  ERROR: 'error'
};

class MissionService {
  constructor(storePath = 'data/mission-store.json') {
    this.storePath = storePath;
    this.tasks = new Map();
    this.agents = new Map();
    this.events = [];
    this.load();
  }

  // 生成唯一ID
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // 持久化保存
  save() {
    try {
      const dataDir = path.dirname(this.storePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const data = {
        tasks: Array.from(this.tasks.entries()),
        agents: Array.from(this.agents.entries()),
        events: this.events.slice(0, 500) // 最多保留500条事件
      };

      fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('[MissionService] Save failed:', error.message);
    }
  }

  // 从文件加载
  load() {
    try {
      if (fs.existsSync(this.storePath)) {
        const content = fs.readFileSync(this.storePath, 'utf8');
        const data = JSON.parse(content);

        if (data.tasks) {
          this.tasks = new Map(data.tasks);
        }
        if (data.agents) {
          this.agents = new Map(data.agents);
        }
        if (data.events) {
          this.events = data.events;
        }

        console.log(`[MissionService] Loaded ${this.tasks.size} tasks, ${this.agents.size} agents`);
      }
    } catch (error) {
      console.error('[MissionService] Load failed:', error.message);
    }
  }

  // ========== 任务 CRUD ==========

  /**
   * 创建任务
   */
  createTask(data) {
    const { name, description, priority, assignedAgent } = data;

    if (!name) {
      throw new Error('name is required');
    }

    const now = Date.now();
    const task = {
      id: this.generateId(),
      name,
      description: description || '',
      priority: priority || TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      assignedAgent: assignedAgent || null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      result: null,
      error: null
    };

    this.tasks.set(task.id, task);
    this.addEvent('task_created', { taskId: task.id, message: `新建任务: ${task.name}` });
    this.save();

    return task;
  }

  /**
   * 获取单个任务
   */
  getTask(id) {
    return this.tasks.get(id);
  }

  /**
   * 列出任务（支持过滤和分页）
   */
  listTasks(filters = {}) {
    const { status, priority, agentId, page = 1, limit = 20 } = filters;

    let tasks = Array.from(this.tasks.values());

    // 过滤
    if (status) {
      const statuses = status.split(',');
      tasks = tasks.filter(t => statuses.includes(t.status));
    }
    if (priority) {
      const priorities = priority.split(',');
      tasks = tasks.filter(t => priorities.includes(t.priority));
    }
    if (agentId) {
      tasks = tasks.filter(t => t.assignedAgent === agentId);
    }

    // 按创建时间倒序
    tasks.sort((a, b) => b.createdAt - a.createdAt);

    // 分页
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTasks = tasks.slice(startIndex, endIndex);

    return {
      tasks: paginatedTasks,
      pagination: {
        page,
        limit,
        total: tasks.length,
        totalPages: Math.ceil(tasks.length / limit),
        hasMore: endIndex < tasks.length
      }
    };
  }

  /**
   * 更新任务
   */
  updateTask(id, updates) {
    const task = this.tasks.get(id);
    if (!task) {
      return null;
    }

    const now = Date.now();
    const allowedUpdates = ['name', 'description', 'priority', 'status', 'assignedAgent', 'result', 'error'];

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        task[key] = updates[key];
      }
    }
    task.updatedAt = now;

    // 状态变更处理
    if (updates.status === TaskStatus.RUNNING && !task.startedAt) {
      task.startedAt = now;
    }
    if (updates.status === TaskStatus.COMPLETED || updates.status === TaskStatus.FAILED) {
      task.completedAt = now;
    }

    this.tasks.set(id, task);

    // 添加事件
    if (updates.status) {
      const eventType = this.getStatusChangeEventType(updates.status);
      this.addEvent(eventType, { taskId: id, agentId: task.assignedAgent, message: this.getStatusMessage(updates.status, task.name) });
    }

    this.save();
    return task;
  }

  getStatusChangeEventType(status) {
    switch (status) {
      case TaskStatus.RUNNING: return 'task_started';
      case TaskStatus.COMPLETED: return 'task_completed';
      case TaskStatus.FAILED: return 'task_failed';
      case TaskStatus.CANCELLED: return 'task_cancelled';
      default: return 'task_updated';
    }
  }

  getStatusMessage(status, name) {
    switch (status) {
      case TaskStatus.RUNNING: return `任务开始执行: ${name}`;
      case TaskStatus.COMPLETED: return `任务完成: ${name}`;
      case TaskStatus.FAILED: return `任务失败: ${name}`;
      case TaskStatus.CANCELLED: return `任务已取消: ${name}`;
      default: return `任务更新: ${name}`;
    }
  }

  /**
   * 删除任务
   */
  deleteTask(id) {
    const existed = this.tasks.has(id);
    if (existed) {
      this.tasks.delete(id);
      this.save();
    }
    return existed;
  }

  /**
   * 执行任务
   */
  executeTask(id) {
    const task = this.tasks.get(id);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
      return { success: false, error: 'Task already finished' };
    }

    const now = Date.now();
    task.status = TaskStatus.RUNNING;
    task.startedAt = task.startedAt || now;
    task.updatedAt = now;

    this.tasks.set(id, task);
    this.addEvent('task_started', { taskId: id, message: `任务开始执行: ${task.name}` });
    this.save();

    return { success: true, task };
  }

  /**
   * 取消任务
   */
  cancelTask(id) {
    const task = this.tasks.get(id);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    if (task.status === TaskStatus.COMPLETED) {
      return { success: false, error: 'Cannot cancel completed task' };
    }

    const now = Date.now();
    task.status = TaskStatus.CANCELLED;
    task.updatedAt = now;

    this.tasks.set(id, task);
    this.addEvent('task_cancelled', { taskId: id, message: `任务已取消: ${task.name}` });
    this.save();

    return { success: true, task };
  }

  // ========== Agent 管理 ==========

  /**
   * 注册 Agent
   */
  registerAgent(data) {
    const { name, role, avatar, capabilities } = data;

    if (!name) {
      throw new Error('name is required');
    }

    const now = Date.now();
    const agent = {
      id: this.generateId(),
      name,
      role: role || AgentRole.EXECUTOR,
      avatar: avatar || null,
      status: AgentStatus.IDLE,
      currentTask: null,
      progress: 0,
      capabilities: capabilities || [],
      lastHeartbeat: now
    };

    this.agents.set(agent.id, agent);
    this.addEvent('agent_status_change', { agentId: agent.id, message: `Agent 注册: ${agent.name}` });
    this.save();

    return agent;
  }

  /**
   * 更新 Agent
   */
  updateAgent(id, updates) {
    const agent = this.agents.get(id);
    if (!agent) {
      return null;
    }

    const now = Date.now();
    const allowedUpdates = ['status', 'currentTask', 'progress', 'capabilities'];

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        agent[key] = updates[key];
      }
    }
    agent.lastHeartbeat = now;

    this.agents.set(id, agent);

    if (updates.status) {
      this.addEvent('agent_status_change', { agentId: id, message: `Agent ${agent.name} 状态: ${updates.status}` });
    }

    this.save();
    return agent;
  }

  /**
   * 列出 Agents
   */
  listAgents(filters = {}) {
    const { status, role } = filters;

    let agents = Array.from(this.agents.values());

    if (status) {
      const statuses = status.split(',');
      agents = agents.filter(a => statuses.includes(a.status));
    }
    if (role) {
      agents = agents.filter(a => a.role === role);
    }

    // 按名称排序
    agents.sort((a, b) => a.name.localeCompare(b.name));

    return agents;
  }

  /**
   * 删除 Agent
   */
  deleteAgent(id) {
    const existed = this.agents.has(id);
    if (existed) {
      this.agents.delete(id);
      this.save();
    }
    return existed;
  }

  /**
   * 获取单个 Agent
   */
  getAgent(id) {
    return this.agents.get(id);
  }

  // ========== 事件管理 ==========

  /**
   * 添加事件
   */
  addEvent(type, data = {}) {
    const event = {
      id: this.generateId(),
      type,
      timestamp: Date.now(),
      taskId: data.taskId || null,
      agentId: data.agentId || null,
      message: data.message || '',
      data: data.data || null
    };
    this.events.unshift(event);

    // 限制事件数量
    if (this.events.length > 500) {
      this.events = this.events.slice(0, 500);
    }

    return event;
  }

  /**
   * 获取事件列表
   */
  getEvents(limit = 50) {
    return this.events.slice(0, limit);
  }

  // ========== 统计 ==========

  /**
   * 获取统计数据
   */
  getStats() {
    const tasks = Array.from(this.tasks.values());
    const agents = Array.from(this.agents.values());

    return {
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === TaskStatus.PENDING).length,
      runningTasks: tasks.filter(t => t.status === TaskStatus.RUNNING).length,
      completedTasks: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      failedTasks: tasks.filter(t => t.status === TaskStatus.FAILED).length,
      cancelledTasks: tasks.filter(t => t.status === TaskStatus.CANCELLED).length,
      totalAgents: agents.length,
      idleAgents: agents.filter(a => a.status === AgentStatus.IDLE).length,
      workingAgents: agents.filter(a => a.status === AgentStatus.WORKING).length,
      waitingAgents: agents.filter(a => a.status === AgentStatus.WAITING).length,
      errorAgents: agents.filter(a => a.status === AgentStatus.ERROR).length,
      recentEvents: this.events.slice(0, 20)
    };
  }
}

// 导出单例
const missionService = new MissionService();

module.exports = {
  MissionService,
  missionService,
  TaskStatus,
  TaskPriority,
  AgentRole,
  AgentStatus
};