/**
 * Multiagent 路由
 * 轻量级 HTTP 包装器，委托给 multiagentService
 *
 * @swagger
 * tags:
 *   - name: multiagent
 *     description: 多Agent编排系统
 */

const express = require('express');
const router = express.Router();
const multiagentService = require('../services/multiagentService');
const { RecoveryManager } = require('../services/errorHandler');

// 恢复管理器实例 (单例)
const recoveryManager = new RecoveryManager();

// ============================================
// 模板
// ============================================

router.get('/templates', (req, res) => {
  res.json({
    success: true,
    ...multiagentService.getTemplates()
  });
});

router.get('/agent-templates', (req, res) => {
  const { agentTemplates } = multiagentService.getTemplates();
  res.json({ success: true, templates: agentTemplates });
});

// ============================================
// Agent
// ============================================

router.post('/agent', (req, res) => {
  const { role, goal, backstory, tools, provider, model } = req.body;
  if (!role || !goal) {
    return res.status(400).json({ success: false, error: 'Missing role or goal' });
  }

  const { Agent } = require('../multiagent');
  try {
    const agent = new Agent({ role, goal, backstory: backstory || '', tools: tools || [], provider, model });
    res.json({
      success: true,
      agent: { id: agent.id, role: agent.role, goal: agent.goal, backstory: agent.backstory, tools: agent.tools }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Task
// ============================================

router.post('/task', (req, res) => {
  const { description, expectedOutput, agentId, context, tools } = req.body;
  if (!description) {
    return res.status(400).json({ success: false, error: 'Missing description' });
  }

  const { Task } = require('../multiagent');
  try {
    const task = new Task({ description, expectedOutput, agent: agentId ? { id: agentId } : null, context: context || [], tools: tools || [] });
    res.json({
      success: true,
      task: { id: task.id, description: task.description, expectedOutput: task.expectedOutput }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Crew
// ============================================

router.post('/crew', (req, res) => {
  try {
    const crew = multiagentService.createCrew(req.body);
    res.json({ success: true, crew: crew.getStatus() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/crews', (req, res) => {
  const crews = multiagentService.listCrews();
  res.json({ success: true, crews, count: crews.length });
});

router.get('/crew/:id', (req, res) => {
  const crew = multiagentService.getCrew(req.params.id);
  if (!crew) {
    return res.status(404).json({ success: false, error: 'Crew not found' });
  }
  res.json({ success: true, crew: crew.getStatus() });
});

router.delete('/crew/:id', (req, res) => {
  if (!multiagentService.deleteCrew(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Crew not found' });
  }
  res.json({ success: true, message: 'Crew deleted' });
});

// ============================================
// 执行
// ============================================

router.post('/execute', async (req, res) => {
  try {
    const { crewId, agents, tasks, process } = req.body;
    const result = await multiagentService.executeCrew({ crewId, agents, tasks, process });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/crew/:crewId/execute', async (req, res) => {
  const crew = multiagentService.getCrew(req.params.crewId);
  if (!crew) {
    return res.status(404).json({ success: false, error: 'Crew not found' });
  }
  try {
    const result = await multiagentService.executeCrew({ crewId: req.params.crewId });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/crew/:crewId/status', (req, res) => {
  const crew = multiagentService.getCrew(req.params.crewId);
  if (!crew) {
    return res.status(404).json({ success: false, error: 'Crew not found' });
  }
  res.json({ success: true, crew: crew.getStatus() });
});

// ============================================
// Engine (增强版 Agent)
// ============================================

router.post('/engine', async (req, res) => {
  try {
    const { sessionId, options = {} } = req.body;
    const engine = multiagentService.createEngine({ sessionId, options });
    res.json({
      success: true,
      engine: { sessionId: engine.sessionId, state: engine.getState() }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/engine/:sessionId', (req, res) => {
  const engine = multiagentService.getEngine(req.params.sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }
  res.json({ success: true, state: engine.getState() });
});

router.post('/engine/:sessionId/execute', async (req, res) => {
  const { task, context = {} } = req.body;
  try {
    const result = await multiagentService.executeEngineTask(req.params.sessionId, task, context);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/engine/:sessionId/pause', (req, res) => {
  const engine = multiagentService.getEngine(req.params.sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }
  engine.pause();
  res.json({ success: true, message: 'Engine paused' });
});

router.post('/engine/:sessionId/resume', (req, res) => {
  const engine = multiagentService.getEngine(req.params.sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }
  engine.resume();
  res.json({ success: true, message: 'Engine resumed' });
});

router.post('/engine/:sessionId/checkpoint', (req, res) => {
  const engine = multiagentService.getEngine(req.params.sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }
  try {
    const checkpoint = engine.checkpointManager.save(req.params.sessionId, engine.getState());
    res.json({ success: true, checkpointId: checkpoint.id, message: 'Checkpoint created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/engine/:sessionId/checkpoints', (req, res) => {
  const engine = multiagentService.getEngine(req.params.sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }
  const checkpoints = engine.checkpointManager.list(req.params.sessionId);
  res.json({ success: true, checkpoints });
});

router.post('/engine/:sessionId/restore', async (req, res) => {
  try {
    const result = await multiagentService.restoreFromCheckpoint(req.params.sessionId, req.body.checkpointId);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/engine/:sessionId/confirm', (req, res) => {
  const engine = multiagentService.getEngine(req.params.sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }
  const result = engine.respondToConfirmation(req.body.confirmationId, req.body.approved, req.body.modifiedInput);
  res.json(result);
});

router.get('/engine/:sessionId/status', (req, res) => {
  const engine = multiagentService.getEngine(req.params.sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }
  res.json({ success: true, state: engine.getState(), status: engine.getState().status });
});

router.delete('/engine/:sessionId', async (req, res) => {
  if (!(await multiagentService.deleteEngine(req.params.sessionId))) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }
  res.json({ success: true, message: 'Engine deleted' });
});

// ============================================
// 记忆
// ============================================

router.get('/engine/:sessionId/memory', (req, res) => {
  const engine = multiagentService.getEngine(req.params.sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }
  const stats = engine.memory.getStats();
  res.json({ success: true, memory: stats });
});

router.post('/engine/:sessionId/memory/search', async (req, res) => {
  const engine = multiagentService.getEngine(req.params.sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }
  const results = await engine.memory.search(req.body.query, req.body.options || {});
  res.json({ success: true, results });
});

router.get('/engine/:sessionId/memory/stats', (req, res) => {
  const engine = multiagentService.getEngine(req.params.sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }
  const stats = engine.memory?.getStats?.() || { total: 0, recent: 0 };
  res.json({ success: true, memory: stats });
});

// ============================================
// 工具
// ============================================

router.get('/tools', (req, res) => {
  const tools = multiagentService.listTools();
  res.json({ success: true, tools, count: tools.length });
});

router.post('/tools/execute', async (req, res) => {
  try {
    const { toolName, input, options = {} } = req.body;
    const result = await multiagentService.executeTool(toolName, input, options);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 错误恢复
// ============================================

router.post('/recovery', async (req, res) => {
  try {
    const { AgentError } = require('../services/errorHandler');
    const error = new AgentError('Recovery request', req.body.errorCode, req.body.context || {});
    const result = await recoveryManager.attemptRecovery(error, req.body.context || {});
    res.json({ success: true, recovery: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/recovery/handlers', (req, res) => {
  const handlers = Array.from(recoveryManager.recoveryHandlers.keys());
  res.json({ success: true, handlers });
});

// ============================================
// 健康检查
// ============================================

router.get('/health', (req, res) => {
  res.json(multiagentService.getHealthStatus());
});

module.exports = router;