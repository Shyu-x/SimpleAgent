/**
 * @swagger
 * tags:
 *   - name: mission
 *     description: 任务控制中心接口
 */

const express = require('express');
const router = express.Router();

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

// 内存存储
const store = {
  tasks: new Map(),
  agents: new Map(),
  events: []
};

// 生成唯一ID
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// 分页辅助函数
function paginate(items, page = 1, limit = 20) {
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
      hasMore: endIndex < items.length
    }
  };
}

/**
 * POST /api/mission/tasks - 创建任务
 */
router.post('/tasks', async (req, res) => {
  try {
    const { name, description, priority, assignedAgent } = req.body;

    if (!name) {
      return res.status(400).json({
        error: { message: 'name is required', type: 'validation_error' }
      });
    }

    const now = Date.now();
    const task = {
      id: generateId(),
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

    store.tasks.set(task.id, task);

    // 添加事件
    const event = {
      id: generateId(),
      type: 'task_created',
      timestamp: now,
      taskId: task.id,
      message: `新建任务: ${task.name}`
    };
    store.events.unshift(event);

    res.status(201).json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * GET /api/mission/tasks - 任务列表（支持分页、状态过滤）
 */
router.get('/tasks', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, priority, agentId } = req.query;

    let tasks = Array.from(store.tasks.values());

    // 状态过滤
    if (status) {
      const statuses = status.split(',');
      tasks = tasks.filter(t => statuses.includes(t.status));
    }

    // 优先级过滤
    if (priority) {
      const priorities = priority.split(',');
      tasks = tasks.filter(t => priorities.includes(t.priority));
    }

    // Agent过滤
    if (agentId) {
      tasks = tasks.filter(t => t.assignedAgent === agentId);
    }

    // 按创建时间倒序
    tasks.sort((a, b) => b.createdAt - a.createdAt);

    const result = paginate(tasks, parseInt(page), parseInt(limit));

    res.json({
      success: true,
      tasks: result.items,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * GET /api/mission/tasks/:id - 任务详情
 */
router.get('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const task = store.tasks.get(id);

    if (!task) {
      return res.status(404).json({
        error: { message: 'Task not found', type: 'not_found' }
      });
    }

    res.json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * PUT /api/mission/tasks/:id - 更新任务（状态、分配）
 */
router.put('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, priority, status, assignedAgent, result, error } = req.body;

    const task = store.tasks.get(id);
    if (!task) {
      return res.status(404).json({
        error: { message: 'Task not found', type: 'not_found' }
      });
    }

    const now = Date.now();
    const updates = { updatedAt: now };

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) {
      updates.status = status;
      if (status === TaskStatus.RUNNING && !task.startedAt) {
        updates.startedAt = now;
      }
      if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
        updates.completedAt = now;
      }
    }
    if (assignedAgent !== undefined) updates.assignedAgent = assignedAgent;
    if (result !== undefined) updates.result = result;
    if (error !== undefined) updates.error = error;

    const updatedTask = { ...task, ...updates };
    store.tasks.set(id, updatedTask);

    // 添加事件
    const event = {
      id: generateId(),
      type: status === TaskStatus.RUNNING ? 'task_started' :
            status === TaskStatus.COMPLETED ? 'task_completed' :
            status === TaskStatus.FAILED ? 'task_failed' :
            status === TaskStatus.CANCELLED ? 'task_cancelled' : 'task_updated',
      timestamp: now,
      taskId: id,
      agentId: assignedAgent,
      message: getStatusMessage(status, task.name)
    };
    store.events.unshift(event);

    res.json({
      success: true,
      task: updatedTask
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

function getStatusMessage(status, name) {
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

/**
 * DELETE /api/mission/tasks/:id - 删除任务
 */
router.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!store.tasks.has(id)) {
      return res.status(404).json({
        error: { message: 'Task not found', type: 'not_found' }
      });
    }

    store.tasks.delete(id);

    res.json({
      success: true,
      message: 'Task deleted'
    });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * POST /api/mission/tasks/:id/execute - 执行任务
 */
router.post('/tasks/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const task = store.tasks.get(id);

    if (!task) {
      return res.status(404).json({
        error: { message: 'Task not found', type: 'not_found' }
      });
    }

    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
      return res.status(400).json({
        error: { message: 'Task already finished', type: 'invalid_state' }
      });
    }

    const now = Date.now();
    const updatedTask = {
      ...task,
      status: TaskStatus.RUNNING,
      startedAt: task.startedAt || now,
      updatedAt: now
    };
    store.tasks.set(id, updatedTask);

    // 添加事件
    const event = {
      id: generateId(),
      type: 'task_started',
      timestamp: now,
      taskId: id,
      message: `任务开始执行: ${task.name}`
    };
    store.events.unshift(event);

    res.json({
      success: true,
      task: updatedTask
    });
  } catch (error) {
    console.error('Execute task error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * POST /api/mission/tasks/:id/cancel - 取消任务
 */
router.post('/tasks/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const task = store.tasks.get(id);

    if (!task) {
      return res.status(404).json({
        error: { message: 'Task not found', type: 'not_found' }
      });
    }

    if (task.status === TaskStatus.COMPLETED) {
      return res.status(400).json({
        error: { message: 'Cannot cancel completed task', type: 'invalid_state' }
      });
    }

    const now = Date.now();
    const updatedTask = {
      ...task,
      status: TaskStatus.CANCELLED,
      updatedAt: now
    };
    store.tasks.set(id, updatedTask);

    // 添加事件
    const event = {
      id: generateId(),
      type: 'task_cancelled',
      timestamp: now,
      taskId: id,
      message: `任务已取消: ${task.name}`
    };
    store.events.unshift(event);

    res.json({
      success: true,
      task: updatedTask
    });
  } catch (error) {
    console.error('Cancel task error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * GET /api/mission/agents - Agent 状态列表
 */
router.get('/agents', async (req, res) => {
  try {
    const { status, role } = req.query;

    let agents = Array.from(store.agents.values());

    if (status) {
      const statuses = status.split(',');
      agents = agents.filter(a => statuses.includes(a.status));
    }

    if (role) {
      agents = agents.filter(a => a.role === role);
    }

    // 按名称排序
    agents.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      agents
    });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * POST /api/mission/agents - 创建/注册 Agent
 */
router.post('/agents', async (req, res) => {
  try {
    const { name, role, avatar, capabilities } = req.body;

    if (!name) {
      return res.status(400).json({
        error: { message: 'name is required', type: 'validation_error' }
      });
    }

    const now = Date.now();
    const agent = {
      id: generateId(),
      name,
      role: role || AgentRole.EXECUTOR,
      avatar: avatar || null,
      status: AgentStatus.IDLE,
      currentTask: null,
      progress: 0,
      capabilities: capabilities || [],
      lastHeartbeat: now
    };

    store.agents.set(agent.id, agent);

    // 添加事件
    const event = {
      id: generateId(),
      type: 'agent_status_change',
      timestamp: now,
      agentId: agent.id,
      message: `Agent 注册: ${agent.name}`
    };
    store.events.unshift(event);

    res.status(201).json({
      success: true,
      agent
    });
  } catch (error) {
    console.error('Create agent error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * PUT /api/mission/agents/:id - 更新 Agent 状态
 */
router.put('/agents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, currentTask, progress, capabilities } = req.body;

    const agent = store.agents.get(id);
    if (!agent) {
      return res.status(404).json({
        error: { message: 'Agent not found', type: 'not_found' }
      });
    }

    const now = Date.now();
    const updates = { lastHeartbeat: now };

    if (status !== undefined) updates.status = status;
    if (currentTask !== undefined) updates.currentTask = currentTask;
    if (progress !== undefined) updates.progress = progress;
    if (capabilities !== undefined) updates.capabilities = capabilities;

    const updatedAgent = { ...agent, ...updates };
    store.agents.set(id, updatedAgent);

    // 添加事件
    if (status) {
      const event = {
        id: generateId(),
        type: 'agent_status_change',
        timestamp: now,
        agentId: id,
        message: `Agent ${agent.name} 状态: ${status}`
      };
      store.events.unshift(event);
    }

    res.json({
      success: true,
      agent: updatedAgent
    });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * DELETE /api/mission/agents/:id - 删除 Agent
 */
router.delete('/agents/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!store.agents.has(id)) {
      return res.status(404).json({
        error: { message: 'Agent not found', type: 'not_found' }
      });
    }

    store.agents.delete(id);

    res.json({
      success: true,
      message: 'Agent deleted'
    });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * GET /api/mission/stats - 任务统计
 */
router.get('/stats', async (req, res) => {
  try {
    const tasks = Array.from(store.tasks.values());
    const agents = Array.from(store.agents.values());

    const stats = {
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
      recentEvents: store.events.slice(0, 20)
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * GET /api/mission/events - 获取事件列表
 */
router.get('/events', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const events = store.events.slice(0, parseInt(limit));

    res.json({
      success: true,
      events
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * POST /api/mission/events - 添加事件
 */
router.post('/events', async (req, res) => {
  try {
    const { type, message, taskId, agentId, data } = req.body;

    if (!message) {
      return res.status(400).json({
        error: { message: 'message is required', type: 'validation_error' }
      });
    }

    const now = Date.now();
    const event = {
      id: generateId(),
      type: type || 'system',
      timestamp: now,
      taskId,
      agentId,
      message,
      data
    };

    store.events.unshift(event);

    res.status(201).json({
      success: true,
      event
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * POST /api/mission/broadcast - 广播消息
 */
router.post('/broadcast', async (req, res) => {
  try {
    const { message, data } = req.body;

    if (!message) {
      return res.status(400).json({
        error: { message: 'message is required', type: 'validation_error' }
      });
    }

    const now = Date.now();
    const event = {
      id: generateId(),
      type: 'broadcast',
      timestamp: now,
      message,
      data
    };

    store.events.unshift(event);

    res.status(201).json({
      success: true,
      event
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

module.exports = router;
