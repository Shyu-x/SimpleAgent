/**
 * @swagger
 * tags:
 *   - name: mission
 *     description: 任务控制中心接口
 */

const express = require('express');
const router = express.Router();

const { missionService, TaskStatus, TaskPriority, AgentRole, AgentStatus } = require('../services/missionService');

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

    const task = missionService.createTask({ name, description, priority, assignedAgent });

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

    const result = missionService.listTasks({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      priority,
      agentId
    });

    res.json({
      success: true,
      tasks: result.tasks,
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
    const task = missionService.getTask(id);

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

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) updates.status = status;
    if (assignedAgent !== undefined) updates.assignedAgent = assignedAgent;
    if (result !== undefined) updates.result = result;
    if (error !== undefined) updates.error = error;

    const task = missionService.updateTask(id, updates);

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
    console.error('Update task error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * DELETE /api/mission/tasks/:id - 删除任务
 */
router.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = missionService.deleteTask(id);

    if (!deleted) {
      return res.status(404).json({
        error: { message: 'Task not found', type: 'not_found' }
      });
    }

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
    const result = missionService.executeTask(id);

    if (!result.success) {
      const statusCode = result.error === 'Task not found' ? 404 : 400;
      return res.status(statusCode).json({
        error: { message: result.error, type: 'invalid_state' }
      });
    }

    res.json({
      success: true,
      task: result.task
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
    const result = missionService.cancelTask(id);

    if (!result.success) {
      const statusCode = result.error === 'Task not found' ? 404 : 400;
      return res.status(statusCode).json({
        error: { message: result.error, type: 'invalid_state' }
      });
    }

    res.json({
      success: true,
      task: result.task
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

    const agents = missionService.listAgents({ status, role });

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

    const agent = missionService.registerAgent({ name, role, avatar, capabilities });

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
 * GET /api/mission/agents/:id - 获取单个Agent
 */
router.get('/agents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const agent = missionService.getAgent(id);

    if (!agent) {
      return res.status(404).json({
        error: { message: 'Agent not found', type: 'not_found' }
      });
    }

    res.json({
      success: true,
      agent
    });
  } catch (error) {
    console.error('Get agent error:', error);
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

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (currentTask !== undefined) updates.currentTask = currentTask;
    if (progress !== undefined) updates.progress = progress;
    if (capabilities !== undefined) updates.capabilities = capabilities;

    const agent = missionService.updateAgent(id, updates);

    if (!agent) {
      return res.status(404).json({
        error: { message: 'Agent not found', type: 'not_found' }
      });
    }

    res.json({
      success: true,
      agent
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
    const deleted = missionService.deleteAgent(id);

    if (!deleted) {
      return res.status(404).json({
        error: { message: 'Agent not found', type: 'not_found' }
      });
    }

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
    const stats = missionService.getStats();

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
    const events = missionService.getEvents(parseInt(limit));

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

    const event = missionService.addEvent(type, { message, taskId, agentId, data });

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

    const event = missionService.addEvent('broadcast', { message, data });

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