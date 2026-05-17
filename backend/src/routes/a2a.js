/**
 * A2A (Agent-to-Agent) 协议路由
 * 业务逻辑委托给 A2AService，routes 只做参数校验和响应组装
 */

const express = require('express');
const router = express.Router();
const { A2AService, A2A_MESSAGE_TYPES, A2A_TASK_STATUS } = require('../services/a2aService');
const { MultiAgentCoordinator } = require('../services/MultiAgentCoordinator');

const a2aService = new A2AService();
const coordinator = new MultiAgentCoordinator(a2aService);

const ok = (res, d) => res.json({ success: true, ...d });
const created = (res, d) => res.status(201).json({ success: true, ...d });
const fail = (res, s, m) => res.status(s).json({ success: false, error: { message: m } });

// 服务状态
router.get('/status', (req, res) => ok(res, a2aService.getStats()));

// Agent 管理
router.get('/agents', (req, res) => ok(res, { agents: a2aService.listAgents(), count: a2aService.listAgents().length }));
router.get('/agents/:agentId', (req, res) => { const a = a2aService.getAgent(req.params.agentId); if (!a) return fail(res, 404, 'Agent not found'); ok(res, { agent: a }); });
router.post('/agents/register', (req, res) => { const { id, name, type, endpoint, capabilities, metadata } = req.body; if (!id) return fail(res, 400, 'Agent ID is required'); created(res, { agent: a2aService.registerAgent({ id, name: name || id, type: type || 'general', endpoint, capabilities: capabilities || [], metadata: metadata || {} }) }); });
router.post('/agents/:agentId/unregister', (req, res) => { a2aService.unregisterAgent(req.params.agentId); ok(res, { message: 'Agent unregistered' }); });
router.post('/agents/:agentId/heartbeat', (req, res) => { a2aService.agentHeartbeat(req.params.agentId); ok(res, { timestamp: Date.now() }); });

// 消息传递
router.post('/send', (req, res) => {
  const { from, to, type, payload, taskId, priority, timeout } = req.body;
  if (!from || !to) return fail(res, 400, 'from and to are required');
  if (type === A2A_MESSAGE_TYPES.TASK_DELEGATE || type === 'task.delegate') return ok(res, a2aService.delegateTask({ from, to, title: payload?.title || 'Untitled Task', description: payload?.description || '', input: payload?.input || payload || {}, priority: priority || 0, tags: payload?.tags || [], metadata: payload?.metadata || {}, timeout: timeout || 5 * 60 * 1000 }));
  const A2AMessage = require('../services/a2aService').A2AMessage || class { constructor(o) { Object.assign(this, o); this.id = o.id || `msg_${Date.now()}`; } toJSON() { return this; } };
  const message = new A2AMessage({ type: type || 'message.send', from, to, taskId, payload: payload || {} });
  const r = a2aService.broker.send(message);
  ok(res, { messageId: message.id, message: message.toJSON() });
});

router.get('/receive', (req, res) => {
  const { agentId, limit, clear } = req.query;
  if (!agentId) return fail(res, 400, 'agentId is required');
  const msgs = a2aService.receiveMessages(agentId, { limit: parseInt(limit) || 50, includeExpired: false, clearReceived: clear === 'true' });
  a2aService.agentHeartbeat(agentId);
  ok(res, { messages: msgs.map(m => m.toJSON()), count: msgs.length, unreadCount: a2aService.getUnreadCount(agentId) });
});

router.get('/poll', (req, res) => { const { agentId, timeout } = req.query; if (!agentId) return fail(res, 400, 'agentId is required'); a2aService.pollMessages(agentId, parseInt(timeout) || 30000, req, res); });

// 任务与结果
router.post('/result/:taskId', (req, res) => { const { result, status, metadata } = req.body; if (!result) return fail(res, 400, 'result is required'); ok(res, a2aService.returnResult(req.params.taskId, result, status || A2A_TASK_STATUS.COMPLETED, metadata || {})); });
router.post('/progress/:taskId', (req, res) => { const { progress, metadata } = req.body; if (progress === undefined) return fail(res, 400, 'progress is required (0-100)'); ok(res, a2aService.sendProgress(req.params.taskId, progress, metadata || {})); });
router.post('/status/sync', (req, res) => { const { agentId, status, metadata } = req.body; if (!agentId) return fail(res, 400, 'agentId is required'); ok(res, a2aService.syncStatus(agentId, status || 'available', metadata || {})); });
router.get('/tasks/:taskId', (req, res) => { const t = a2aService.getTaskStatus(req.params.taskId); if (!t) return fail(res, 404, 'Task not found'); ok(res, { task: t }); });
router.get('/tasks', (req, res) => { const { status, from, to, limit } = req.query; const tasks = a2aService.listTasks({ status, from, to, limit: parseInt(limit) || 100 }); ok(res, { tasks, count: tasks.length }); });
router.delete('/tasks/:taskId', (req, res) => ok(res, a2aService.cancelTask(req.params.taskId)));
router.get('/unread/:agentId', (req, res) => ok(res, { unreadCount: a2aService.getUnreadCount(req.params.agentId) }));

// SSE 实时订阅
router.get('/subscribe/:agentId', (req, res) => a2aService.subscribeAgent(req.params.agentId, req, res));
router.post('/ack', (req, res) => { const { agentId, messageIds } = req.body; if (!agentId || !messageIds || !Array.isArray(messageIds)) return fail(res, 400, 'agentId and messageIds array are required'); ok(res, a2aService.ackMessages(agentId, messageIds)); });

// 协作任务
router.post('/collaborate', async (req, res) => {
  const { title, tasks, subTasks, options = {} } = req.body;
  if (!title) return fail(res, 400, { type: 'validation_error', message: 'title is required' });
  const list = tasks || subTasks;
  if (!list || !Array.isArray(list) || list.length === 0) return fail(res, 400, { type: 'validation_error', message: 'tasks must be a non-empty array' });
  for (let i = 0; i < list.length; i++) if (!list[i].task && !list[i].prompt && !list[i].description) return fail(res, 400, { type: 'validation_error', message: `Task[${i}] is missing required field: task/prompt/description` });
  ok(res, { collaboration: await coordinator.executeCollaboration(title, list, options) });
});
router.get('/collaboration/stats', (req, res) => ok(res, coordinator.getStats()));
router.get('/collaboration/:taskId', (req, res) => { const s = coordinator.getCollaborationStatus(req.params.taskId); if (!s) return fail(res, 404, 'Collaboration task not found'); ok(res, { collaboration: s }); });
router.get('/collaboration/:taskId/result', (req, res) => { const r = coordinator.getCollaborationResult(req.params.taskId); if (!r) return fail(res, 404, 'Collaboration task not found'); ok(res, r); });
router.delete('/collaboration/:taskId', (req, res) => { const c = coordinator.cancelCollaboration(req.params.taskId); if (!c) return fail(res, 404, 'Collaboration task not found or already completed'); ok(res, { message: 'Collaboration cancelled', taskId: req.params.taskId }); });

// 协作任务 SSE 订阅
router.get('/collaboration/:taskId/subscribe', (req, res) => a2aService.subscribeCollaboration(req.params.taskId, req, res));

// 任务定义
router.post('/tasks/define', (req, res) => { const t = req.body; if (!t.task && !t.prompt && !t.description) return fail(res, 400, { type: 'validation_error', message: 'task/prompt/description is required' }); const def = coordinator.createTaskDefinition(t); created(res, { task: def.toJSON() }); });
router.post('/tasks/define/batch', (req, res) => { const { tasks } = req.body; if (!tasks || !Array.isArray(tasks)) return fail(res, 400, { type: 'validation_error', message: 'tasks array is required' }); const defs = coordinator.createTaskDefinitions(tasks); created(res, { tasks: defs.map(d => d.toJSON()), count: defs.length }); });
router.get('/tasks/define/:taskId', (req, res) => { const d = coordinator.getTaskDefinition(req.params.taskId); if (!d) return fail(res, 404, 'Task definition not found'); ok(res, { task: d.toJSON() }); });
router.get('/coordination/modes', (req, res) => ok(res, { modes: { TEAM_LEADER: { value: 'team_leader', description: 'One agent orchestrates others', useCase: 'Complex hierarchical tasks' }, COLLABORATIVE: { value: 'collaborative', description: 'Agents share responsibilities', useCase: 'Parallel specialized work' }, AUTONOMOUS: { value: 'autonomous', description: 'Agents work independently', useCase: 'Independent parallel tasks' } } }));

module.exports = router;
