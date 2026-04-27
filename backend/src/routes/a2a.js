/**
 * A2A (Agent-to-Agent) 协议路由
 * 实现 Agent 之间的消息传递、任务委托、结果回传接口
 *
 * @swagger
 * tags:
 *   - name: a2a
 *     description: A2A Agent协作协议
 */

const express = require('express');
const router = express.Router();
const { A2AService } = require('../services/a2aService');
const { MultiAgentCoordinator } = require('../services/MultiAgentCoordinator');
const { A2A_MESSAGE_TYPES, A2A_TASK_STATUS } = require('../services/a2aService');

// 创建 A2A 服务单例
const a2aService = new A2AService();

// 创建协作协调器
const multiAgentCoordinator = new MultiAgentCoordinator(a2aService);

/**
 * @swagger
 * /api/a2a/status:
 *   get:
 *     tags: [a2a]
 *     summary: 获取A2A服务状态
 *     responses:
 *       200:
 *         description: 服务状态信息
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    ...a2aService.getStats()
  });
});

// ========== Agent 管理 ==========

/**
 * 获取在线 Agent 列表
 */
router.get('/agents', (req, res) => {
  try {
    const agents = a2aService.listAgents();
    res.json({ success: true, agents, count: agents.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个 Agent 信息
 */
router.get('/agents/:agentId', (req, res) => {
  try {
    const agent = a2aService.getAgent(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, agent });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 注册 Agent
 */
router.post('/agents/register', (req, res) => {
  try {
    const { id, name, type, endpoint, capabilities, metadata } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Agent ID is required' });
    }
    const agent = a2aService.registerAgent({
      id,
      name: name || id,
      type: type || 'general',
      endpoint,
      capabilities: capabilities || [],
      metadata: metadata || {}
    });
    res.json({ success: true, agent });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 注销 Agent
 */
router.post('/agents/:agentId/unregister', (req, res) => {
  try {
    a2aService.unregisterAgent(req.params.agentId);
    res.json({ success: true, message: 'Agent unregistered' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Agent 心跳
 */
router.post('/agents/:agentId/heartbeat', (req, res) => {
  try {
    a2aService.agentHeartbeat(req.params.agentId);
    res.json({ success: true, timestamp: Date.now() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== 消息传递 ==========

/**
 * 发送消息给其他 Agent
 */
router.post('/send', (req, res) => {
  try {
    const { from, to, type, payload, taskId, priority, timeout } = req.body;
    if (!from || !to) {
      return res.status(400).json({ success: false, error: 'from and to are required' });
    }

    // 任务委托
    if (type === A2A_MESSAGE_TYPES.TASK_DELEGATE || type === 'task.delegate') {
      const result = a2aService.delegateTask({
        from, to,
        title: payload?.title || 'Untitled Task',
        description: payload?.description || '',
        input: payload?.input || payload || {},
        priority: priority || 0,
        tags: payload?.tags || [],
        metadata: payload?.metadata || {},
        timeout: timeout || 5 * 60 * 1000
      });
      return res.json(result);
    }

    // 普通消息 - 创建并发送
    const A2AMessage = require('../services/a2aService').A2AMessage ||
      class { constructor(o) { Object.assign(this, o); this.id = o.id || `msg_${Date.now()}`; } toJSON() { return this; } };
    const message = new A2AMessage({ type: type || 'message.send', from, to, taskId, payload: payload || {} });
    const sendResult = a2aService.broker.send(message);
    res.json({ success: sendResult.success, messageId: message.id, message: message.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 接收消息
 */
router.get('/receive', (req, res) => {
  try {
    const { agentId, limit, clear } = req.query;
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required' });
    }
    const messages = a2aService.receiveMessages(agentId, {
      limit: parseInt(limit) || 50,
      includeExpired: false,
      clearReceived: clear === 'true'
    });
    a2aService.agentHeartbeat(agentId);
    res.json({
      success: true,
      messages: messages.map(m => m.toJSON()),
      count: messages.length,
      unreadCount: a2aService.getUnreadCount(agentId)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 轮询接收消息
 */
router.get('/poll', (req, res) => {
  try {
    const { agentId, timeout } = req.query;
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required' });
    }
    a2aService.agentHeartbeat(agentId);
    const maxWait = parseInt(timeout) || 30000;
    const pollInterval = 1000;
    let waited = 0;

    const checkMessages = () => {
      const messages = a2aService.receiveMessages(agentId, { limit: 50, clearReceived: true });
      if (messages.length > 0 || waited >= maxWait) {
        res.json({ success: true, messages: messages.map(m => m.toJSON()), count: messages.length, waited, timeout: waited >= maxWait });
      } else {
        waited += pollInterval;
        setTimeout(checkMessages, pollInterval);
      }
    };
    checkMessages();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== 任务与结果 ==========

/**
 * 返回任务结果
 */
router.post('/result/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const { result, status, metadata } = req.body;
    if (!result) {
      return res.status(400).json({ success: false, error: 'result is required' });
    }
    const returnResult = a2aService.returnResult(taskId, result, status || A2A_TASK_STATUS.COMPLETED, metadata || {});
    res.json(returnResult);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 发送进度更新
 */
router.post('/progress/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const { progress, metadata } = req.body;
    if (progress === undefined) {
      return res.status(400).json({ success: false, error: 'progress is required (0-100)' });
    }
    const result = a2aService.sendProgress(taskId, progress, metadata || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 同步状态
 */
router.post('/status/sync', (req, res) => {
  try {
    const { agentId, status, metadata } = req.body;
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required' });
    }
    const result = a2aService.syncStatus(agentId, status || 'available', metadata || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取任务状态
 */
router.get('/tasks/:taskId', (req, res) => {
  try {
    const task = a2aService.getTaskStatus(req.params.taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 列出任务
 */
router.get('/tasks', (req, res) => {
  try {
    const { status, from, to, limit } = req.query;
    const tasks = a2aService.listTasks({ status, from, to, limit: parseInt(limit) || 100 });
    res.json({ success: true, tasks, count: tasks.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 取消任务
 */
router.delete('/tasks/:taskId', (req, res) => {
  try {
    const result = a2aService.cancelTask(req.params.taskId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取未读消息数
 */
router.get('/unread/:agentId', (req, res) => {
  try {
    const count = a2aService.getUnreadCount(req.params.agentId);
    res.json({ success: true, unreadCount: count });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== SSE 实时订阅 ==========

/**
 * SSE 实时消息订阅 (长连接)
 */
router.get('/subscribe/:agentId', (req, res) => {
  try {
    const { agentId } = req.params;
    a2aService.subscribeAgent(agentId, req, res);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 消息确认（已读）
 */
router.post('/ack', (req, res) => {
  try {
    const { agentId, messageIds } = req.body;
    if (!agentId || !messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ success: false, error: 'agentId and messageIds array are required' });
    }
    const messages = a2aService.receiveMessages(agentId, { limit: 1000, clearReceived: false });
    const ackedIds = [];
    const remaining = [];
    for (const msg of messages) {
      if (messageIds.includes(msg.id)) {
        ackedIds.push(msg.id);
      } else {
        remaining.push(msg);
      }
    }
    if (remaining.length > 0) {
      a2aService.broker.inbox.set(agentId, remaining);
    }
    res.json({ success: true, ackedCount: ackedIds.length, ackedIds });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== 协作任务 ==========

/**
 * 执行协作任务
 * POST /api/a2a/collaborate
 */
router.post('/collaborate', async (req, res) => {
  try {
    const { title, tasks, subTasks, options = {} } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: { type: 'validation_error', message: 'title is required' } });
    }
    const taskList = tasks || subTasks;
    if (!taskList || !Array.isArray(taskList) || taskList.length === 0) {
      return res.status(400).json({ success: false, error: { type: 'validation_error', message: 'tasks must be a non-empty array' } });
    }
    for (let i = 0; i < taskList.length; i++) {
      const task = taskList[i];
      if (!task.task && !task.prompt && !task.description) {
        return res.status(400).json({ success: false, error: { type: 'validation_error', message: `Task[${i}] is missing required field: task/prompt/description` } });
      }
    }
    res.json({ success: true, collaboration: await multiAgentCoordinator.executeCollaboration(title, taskList, options) });
  } catch (error) {
    console.error('Collaboration error:', error);
    res.status(500).json({ success: false, error: { type: 'collaboration_error', message: error.message } });
  }
});

/**
 * 获取协作统计
 */
router.get('/collaboration/stats', (req, res) => {
  try {
    res.json({ success: true, stats: multiAgentCoordinator.getStats() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取协作任务状态
 */
router.get('/collaboration/:taskId', (req, res) => {
  try {
    const status = multiAgentCoordinator.getCollaborationStatus(req.params.taskId);
    if (!status) {
      return res.status(404).json({ success: false, error: 'Collaboration task not found' });
    }
    res.json({ success: true, collaboration: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取协作任务结果
 */
router.get('/collaboration/:taskId/result', (req, res) => {
  try {
    const result = multiAgentCoordinator.getCollaborationResult(req.params.taskId);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Collaboration task not found' });
    }
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 取消协作任务
 */
router.delete('/collaboration/:taskId', (req, res) => {
  try {
    const cancelled = multiAgentCoordinator.cancelCollaboration(req.params.taskId);
    if (!cancelled) {
      return res.status(404).json({ success: false, error: 'Collaboration task not found or already completed' });
    }
    res.json({ success: true, message: 'Collaboration cancelled', taskId: req.params.taskId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== 任务定义 ==========

/**
 * 创建任务定义
 */
router.post('/tasks/define', (req, res) => {
  try {
    const taskConfig = req.body;
    if (!taskConfig.task && !taskConfig.prompt && !taskConfig.description) {
      return res.status(400).json({ success: false, error: { type: 'validation_error', message: 'task/prompt/description is required' } });
    }
    const taskDef = multiAgentCoordinator.createTaskDefinition(taskConfig);
    res.json({ success: true, task: taskDef.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, error: { type: 'task_definition_error', message: error.message } });
  }
});

/**
 * 批量创建任务定义
 */
router.post('/tasks/define/batch', (req, res) => {
  try {
    const { tasks } = req.body;
    if (!tasks || !Array.isArray(tasks)) {
      return res.status(400).json({ success: false, error: { type: 'validation_error', message: 'tasks array is required' } });
    }
    const taskDefs = multiAgentCoordinator.createTaskDefinitions(tasks);
    res.json({ success: true, tasks: taskDefs.map(t => t.toJSON()), count: taskDefs.length });
  } catch (error) {
    res.status(500).json({ success: false, error: { type: 'task_definition_error', message: error.message } });
  }
});

/**
 * 获取任务定义
 */
router.get('/tasks/:taskId', (req, res) => {
  try {
    const taskDef = multiAgentCoordinator.getTaskDefinition(req.params.taskId);
    if (!taskDef) {
      return res.status(404).json({ success: false, error: 'Task definition not found' });
    }
    res.json({ success: true, task: taskDef.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取协调模式信息
 */
router.get('/coordination/modes', (req, res) => {
  res.json({
    success: true,
    modes: {
      TEAM_LEADER: { value: 'team_leader', description: 'One agent orchestrates others', useCase: 'Complex hierarchical tasks' },
      COLLABORATIVE: { value: 'collaborative', description: 'Agents share responsibilities', useCase: 'Parallel specialized work' },
      AUTONOMOUS: { value: 'autonomous', description: 'Agents work independently', useCase: 'Independent parallel tasks' }
    }
  });
});

module.exports = router;
