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
const {
  A2AService,
  A2AMessage,
  A2ATask,
  A2A_MESSAGE_TYPES,
  A2A_TASK_STATUS
} = require('../services/a2aService');
const { MultiAgentCoordinator } = require('../services/MultiAgentCoordinator');

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

/**
 * 获取在线 Agent 列表
 */
router.get('/agents', (req, res) => {
  try {
    const agents = a2aService.listAgents();
    res.json({
      success: true,
      agents,
      count: agents.length
    });
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
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
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
      return res.status(400).json({
        success: false,
        error: 'Agent ID is required'
      });
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

/**
 * 发送消息给其他 Agent (POST /api/agent/send)
 */
router.post('/send', (req, res) => {
  try {
    const { from, to, type, payload, taskId, priority, timeout } = req.body;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: 'from and to are required'
      });
    }

    // 根据消息类型处理
    if (type === A2A_MESSAGE_TYPES.TASK_DELEGATE || type === 'task.delegate') {
      // 任务委托
      const result = a2aService.delegateTask({
        from,
        to,
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

    // 普通消息
    const message = new A2AMessage({
      type: type || 'message.send',
      from,
      to,
      taskId,
      payload: payload || {}
    });

    const sendResult = a2aService.broker.send(message);

    res.json({
      success: sendResult.success,
      messageId: message.id,
      message: message.toJSON()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 接收其他 Agent 的消息 (GET /api/agent/receive)
 */
router.get('/receive', (req, res) => {
  try {
    const { agentId, limit, clear } = req.query;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: 'agentId is required'
      });
    }

    const messages = a2aService.receiveMessages(agentId, {
      limit: parseInt(limit) || 50,
      includeExpired: false,
      clearReceived: clear === 'true'
    });

    // 更新心跳
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
 * 轮询接收消息 (SSE 风格的轮询端点)
 */
router.get('/poll', (req, res) => {
  try {
    const { agentId, timeout } = req.query;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: 'agentId is required'
      });
    }

    // 更新心跳
    a2aService.agentHeartbeat(agentId);

    // 轮询等待消息
    const maxWait = parseInt(timeout) || 30000; // 默认30秒
    const pollInterval = 1000; // 1秒轮询
    let waited = 0;

    const checkMessages = () => {
      const messages = a2aService.receiveMessages(agentId, {
        limit: 50,
        clearReceived: true
      });

      if (messages.length > 0 || waited >= maxWait) {
        res.json({
          success: true,
          messages: messages.map(m => m.toJSON()),
          count: messages.length,
          waited,
          timeout: waited >= maxWait
        });
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

/**
 * 返回任务结果
 */
router.post('/result/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const { result, status, metadata } = req.body;

    if (!result) {
      return res.status(400).json({
        success: false,
        error: 'result is required'
      });
    }

    const returnResult = a2aService.returnResult(
      taskId,
      result,
      status || A2A_TASK_STATUS.COMPLETED,
      metadata || {}
    );

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
      return res.status(400).json({
        success: false,
        error: 'progress is required (0-100)'
      });
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
      return res.status(400).json({
        success: false,
        error: 'agentId is required'
      });
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
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
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
    const tasks = a2aService.listTasks({
      status,
      from,
      to,
      limit: parseInt(limit) || 100
    });
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

/**
 * SSE 实时消息订阅 (长连接)
 */
router.get('/subscribe/:agentId', (req, res) => {
  try {
    const { agentId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 更新心跳
    a2aService.agentHeartbeat(agentId);

    // 定期发送心跳
    const heartbeatInterval = setInterval(() => {
      a2aService.agentHeartbeat(agentId);
      res.write(`: heartbeat\n\n`);
    }, 30 * 1000);

    // 监听新消息
    const onMessage = (message) => {
      if (message.to === agentId) {
        res.write(`data: ${JSON.stringify({
          event: 'message',
          data: message.toJSON()
        })}\n\n`);
      }
    };

    a2aService.broker.on('message:sent', onMessage);

    // 定期检查新消息
    const pollInterval = setInterval(() => {
      const messages = a2aService.receiveMessages(agentId, {
        limit: 10,
        clearReceived: true
      });

      for (const message of messages) {
        res.write(`data: ${JSON.stringify({
          event: 'message',
          data: message.toJSON()
        })}\n\n`);
      }
    }, 2000);

    // 客户端断开连接
    req.on('close', () => {
      clearInterval(heartbeatInterval);
      clearInterval(pollInterval);
      a2aService.broker.removeListener('message:sent', onMessage);
    });

    // 初始连接确认
    res.write(`data: ${JSON.stringify({ event: 'connected', agentId })}\n\n`);

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
      return res.status(400).json({
        success: false,
        error: 'agentId and messageIds array are required'
      });
    }

    const messages = a2aService.receiveMessages(agentId, {
      limit: 1000,
      clearReceived: false
    });

    const ackedIds = [];
    const remaining = [];

    for (const msg of messages) {
      if (messageIds.includes(msg.id)) {
        ackedIds.push(msg.id);
      } else {
        remaining.push(msg);
      }
    }

    // 放回未确认的消息
    if (remaining.length > 0) {
      a2aService.broker.inbox.set(agentId, remaining);
    }

    res.json({
      success: true,
      ackedCount: ackedIds.length,
      ackedIds
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 执行协作任务
 * POST /api/a2a/collaborate
 *
 * 支持三种协调模式：
 * - team_leader: 主 Agent 主导，其他执行
 * - collaborative: 对等协作，共享职责
 * - autonomous: 独立执行，最小协调
 */
router.post('/collaborate', async (req, res) => {
  try {
    const {
      title,
      tasks,           // 新格式：TaskDefinition 数组
      subTasks,        // 兼容旧格式
      options = {}
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: { type: 'validation_error', message: 'title is required' }
      });
    }

    // 兼容旧格式：转换 subTasks 为 tasks
    const taskList = tasks || subTasks;

    if (!taskList || !Array.isArray(taskList) || taskList.length === 0) {
      return res.status(400).json({
        success: false,
        error: { type: 'validation_error', message: 'tasks must be a non-empty array' }
      });
    }

    // 验证每个任务
    for (let i = 0; i < taskList.length; i++) {
      const task = taskList[i];
      if (!task.task && !task.prompt && !task.description) {
        return res.status(400).json({
          success: false,
          error: { type: 'validation_error', message: `Task[${i}] is missing required field: task/prompt/description` }
        });
      }
    }

    // 提取协调模式
    const {
      coordinationMode = 'collaborative',
      useSSE = false,
      enableHooks = true,
      ...coordinatorOptions
    } = options;

    // 启用钩子
    multiAgentCoordinator.setHooksEnabled(enableHooks);

    // SSE 推送模式
    if (useSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // 监听所有钩子事件
      const hookMappings = {
        'task:created': 'task_created',
        'task:completed': 'task_completed',
        'task:failed': 'task_failed',
        'task:skipped': 'task_skipped',
        'task:waiting': 'task_waiting',
        'collaboration:started': 'collaboration_started',
        'collaboration:completed': 'collaboration_completed',
        'collaboration:failed': 'collaboration_failed',
        'collaboration:partial': 'collaboration_partial',
        'collaboration:cancelled': 'collaboration_cancelled',
        'collaboration:error': 'collaboration_error'
      };

      const eventHandlers = {};

      for (const [hookEvent, sseEvent] of Object.entries(hookMappings)) {
        eventHandlers[hookEvent] = (data) => {
          res.write(`data: ${JSON.stringify({ event: sseEvent, ...data })}\n\n`);
        };
        multiAgentCoordinator.onHook(hookEvent, eventHandlers[hookEvent]);
      }

      // 完成后清理
      multiAgentCoordinator.on('collaboration:completed', () => res.end());
      multiAgentCoordinator.on('collaboration:failed', () => res.end());
      multiAgentCoordinator.on('collaboration:cancelled', () => res.end());
      multiAgentCoordinator.on('collaboration:error', () => res.end());

      // 初始确认
      res.write(`data: ${JSON.stringify({
        event: 'connected',
        title,
        coordinationMode,
        taskCount: taskList.length
      })}\n\n`);
    }

    // 执行协作任务
    const result = await multiAgentCoordinator.executeCollaboration(
      title,
      taskList,
      { ...coordinatorOptions, coordinationMode }
    );

    // 清理 SSE 钩子
    if (useSSE) {
      for (const [hookEvent, handler] of Object.entries(eventHandlers)) {
        multiAgentCoordinator.offHook(hookEvent, handler);
      }
    }

    res.json({
      success: true,
      collaboration: result
    });

  } catch (error) {
    console.error('Collaboration error:', error);
    res.status(500).json({
      success: false,
      error: { type: 'collaboration_error', message: error.message }
    });
  }
});

/**
 * 获取协作统计
 * GET /api/a2a/collaboration/stats
 */
router.get('/collaboration/stats', (req, res) => {
  try {
    const stats = multiAgentCoordinator.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取协作任务状态
 * GET /api/a2a/collaboration/:taskId
 */
router.get('/collaboration/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const status = multiAgentCoordinator.getCollaborationStatus(taskId);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Collaboration task not found'
      });
    }

    res.json({
      success: true,
      collaboration: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取协作任务结果（标准化格式）
 * GET /api/a2a/collaboration/:taskId/result
 */
router.get('/collaboration/:taskId/result', (req, res) => {
  try {
    const { taskId } = req.params;
    const result = multiAgentCoordinator.getCollaborationResult(taskId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Collaboration task not found'
      });
    }

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 取消协作任务
 * DELETE /api/a2a/collaboration/:taskId
 */
router.delete('/collaboration/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const cancelled = multiAgentCoordinator.cancelCollaboration(taskId);

    if (!cancelled) {
      return res.status(404).json({
        success: false,
        error: 'Collaboration task not found or already completed'
      });
    }

    res.json({
      success: true,
      message: 'Collaboration cancelled',
      taskId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 创建任务定义
 * POST /api/a2a/tasks/define
 *
 * 支持的字段：
 * - id: 任务 ID（可选，自动生成）
 * - agentName: Agent 名称
 * - taskType: 任务类型 (e.g., code-review, db-implementation)
 * - title/description/prompt: 任务描述
 * - dependencies: 依赖的任务 ID 数组
 * - effort: low/medium/high
 * - maxTurns: 最大轮次
 * - timeout: 超时时间(ms)
 * - successCriteria: 成功标准（字符串或函数）
 * - additionalInstructions: 额外指令
 * - priority: 优先级
 */
router.post('/tasks/define', (req, res) => {
  try {
    const taskConfig = req.body;

    if (!taskConfig.task && !taskConfig.prompt && !taskConfig.description) {
      return res.status(400).json({
        success: false,
        error: { type: 'validation_error', message: 'task/prompt/description is required' }
      });
    }

    const taskDef = multiAgentCoordinator.createTaskDefinition(taskConfig);

    res.json({
      success: true,
      task: taskDef.toJSON()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { type: 'task_definition_error', message: error.message }
    });
  }
});

/**
 * 批量创建任务定义
 * POST /api/a2a/tasks/define/batch
 */
router.post('/tasks/define/batch', (req, res) => {
  try {
    const { tasks } = req.body;

    if (!tasks || !Array.isArray(tasks)) {
      return res.status(400).json({
        success: false,
        error: { type: 'validation_error', message: 'tasks array is required' }
      });
    }

    const taskDefs = multiAgentCoordinator.createTaskDefinitions(tasks);

    res.json({
      success: true,
      tasks: taskDefs.map(t => t.toJSON()),
      count: taskDefs.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { type: 'task_definition_error', message: error.message }
    });
  }
});

/**
 * 获取任务定义
 * GET /api/a2a/tasks/:taskId
 */
router.get('/tasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const taskDef = multiAgentCoordinator.getTaskDefinition(taskId);

    if (!taskDef) {
      return res.status(404).json({
        success: false,
        error: 'Task definition not found'
      });
    }

    res.json({
      success: true,
      task: taskDef.toJSON()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取协调模式信息
 * GET /api/a2a/coordination/modes
 */
router.get('/coordination/modes', (req, res) => {
  res.json({
    success: true,
    modes: {
      TEAM_LEADER: {
        value: 'team_leader',
        description: 'One agent orchestrates others, typically the first task in each level',
        useCase: 'Complex hierarchical tasks with clear delegation'
      },
      COLLABORATIVE: {
        value: 'collaborative',
        description: 'Agents share responsibilities and coordinate as peers',
        useCase: 'Tasks requiring parallel specialized work'
      },
      AUTONOMOUS: {
        value: 'autonomous',
        description: 'Agents work independently with minimal coordination',
        useCase: 'Independent parallel tasks with no dependencies'
      }
    }
  });
});

module.exports = router;
