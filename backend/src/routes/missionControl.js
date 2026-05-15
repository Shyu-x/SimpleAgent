/**
 * @swagger
 * tags:
 *   - name: mission
 *     description: 任务控制中心接口
 */

const express = require('express');
const router = express.Router();
const { createLogger } = require('../infra/logger/AgentLogger');
const logger = createLogger('missionControl');
const { missionService } = require('../services/missionService');

// ========== 工具函数 ==========

/** 标准成功响应 */
const ok = (res, data) => res.json({ success: true, ...data });

/** 通用错误处理 */
const handle = (res, fn) => async () => {
  try {
    const result = await fn();
    if (result && result.success === false) {
      const code = result.error.includes('not found') ? 404 : 400;
      return res.status(code).json({ error: { message: result.error, type: 'invalid_state' } });
    }
    return ok(res, result);
  } catch (error) {
    logger.error('Error:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
};

// ========== 任务路由 ==========

/** POST /api/mission/tasks - 创建任务 */
router.post('/tasks', (req, res) => {
  const { name, description, priority, assignedAgent } = req.body;
  if (!name) return res.status(400).json({ error: { message: 'name is required', type: 'validation_error' } });
  handle(res, () => missionService.createTask({ name, description, priority, assignedAgent }))();
});

/** GET /api/mission/tasks - 任务列表 */
router.get('/tasks', (req, res) => {
  const { page = 1, limit = 20, status, priority, agentId } = req.query;
  const result = missionService.listTasks({ page: +page, limit: +limit, status, priority, agentId });
  ok(res, { tasks: result.tasks, pagination: result.pagination });
});

/** GET /api/mission/tasks/:id - 任务详情 */
router.get('/tasks/:id', (req, res) => {
  const task = missionService.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: { message: 'Task not found', type: 'not_found' } });
  ok(res, { task });
});

/** PUT /api/mission/tasks/:id - 更新任务 */
router.put('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, priority, status, assignedAgent, result, error } = req.body;
  const updates = { name, description, priority, status, assignedAgent, result, error };
  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);
  try {
    const task = await missionService.updateTask(id, updates);
    if (!task) return res.status(404).json({ error: { message: 'Task not found', type: 'not_found' } });
    ok(res, { task });
  } catch (error) {
    logger.error('Error:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
});

/** DELETE /api/mission/tasks/:id - 删除任务 */
router.delete('/tasks/:id', async (req, res) => {
  try {
    const deleted = await missionService.deleteTask(req.params.id);
    if (!deleted) return res.status(404).json({ error: { message: 'Task not found', type: 'not_found' } });
    ok(res, { message: 'Task deleted' });
  } catch (error) {
    logger.error('Error:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
});

/** POST /api/mission/tasks/:id/execute - 执行任务 */
router.post('/tasks/:id/execute', (req, res) => handle(res, () => missionService.executeTask(req.params.id))());

/** POST /api/mission/tasks/:id/cancel - 取消任务 */
router.post('/tasks/:id/cancel', (req, res) => handle(res, () => missionService.cancelTask(req.params.id))());

// ========== Agent 路由 ==========

/** GET /api/mission/agents - Agent 状态列表 */
router.get('/agents', (req, res) => {
  const { status, role } = req.query;
  ok(res, { agents: missionService.listAgents({ status, role }) });
});

/** POST /api/mission/agents - 创建/注册 Agent */
router.post('/agents', (req, res) => {
  const { name, role, avatar, capabilities } = req.body;
  if (!name) return res.status(400).json({ error: { message: 'name is required', type: 'validation_error' } });
  handle(res, () => missionService.registerAgent({ name, role, avatar, capabilities }))();
});

/** GET /api/mission/agents/:id - 获取单个Agent */
router.get('/agents/:id', (req, res) => {
  const agent = missionService.getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: { message: 'Agent not found', type: 'not_found' } });
  ok(res, { agent });
});

/** PUT /api/mission/agents/:id - 更新 Agent */
router.put('/agents/:id', async (req, res) => {
  const { status, currentTask, progress, capabilities } = req.body;
  const updates = { status, currentTask, progress, capabilities };
  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);
  try {
    const agent = await missionService.updateAgent(req.params.id, updates);
    if (!agent) return res.status(404).json({ error: { message: 'Agent not found', type: 'not_found' } });
    ok(res, { agent });
  } catch (error) {
    logger.error('Error:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
});

/** DELETE /api/mission/agents/:id - 删除 Agent */
router.delete('/agents/:id', async (req, res) => {
  try {
    const deleted = await missionService.deleteAgent(req.params.id);
    if (!deleted) return res.status(404).json({ error: { message: 'Agent not found', type: 'not_found' } });
    ok(res, { message: 'Agent deleted' });
  } catch (error) {
    logger.error('Error:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
});

// ========== 事件与统计路由 ==========

/** GET /api/mission/stats - 任务统计 */
router.get('/stats', (req, res) => ok(res, { stats: missionService.getStats() }));

/** GET /api/mission/events - 获取事件列表 */
router.get('/events', (req, res) => {
  ok(res, { events: missionService.getEvents(+(req.query.limit || 50)) });
});

/** POST /api/mission/events - 添加事件 */
router.post('/events', (req, res) => {
  const { type, message, taskId, agentId, data } = req.body;
  if (!message) return res.status(400).json({ error: { message: 'message is required', type: 'validation_error' } });
  handle(res, () => missionService.addEvent(type, { message, taskId, agentId, data }))();
});

/** POST /api/mission/broadcast - 广播消息 */
router.post('/broadcast', (req, res) => {
  const { message, data } = req.body;
  if (!message) return res.status(400).json({ error: { message: 'message is required', type: 'validation_error' } });
  handle(res, () => missionService.addEvent('broadcast', { message, data }))();
});

module.exports = router;
