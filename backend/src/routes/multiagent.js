/**
 * Multiagent 路由
 * 轻量级 HTTP 包装器，委托给 multiagentService
 */

const express = require('express');
const router = express.Router();
const multiagentService = require('../services/multiagentService');
const { RecoveryManager } = require('../services/errorHandler');

const recoveryManager = new RecoveryManager();

// Helper: wrap service call with 404 check
const withEngine = (fn) => (req, res) => {
  try {
    res.json(fn(req.params.sessionId, req.body));
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
};

const withCrew = (fn) => (req, res) => {
  try {
    res.json(fn(req.params.id));
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
};

// Templates
router.get('/templates', (_, res) => res.json({ success: true, ...multiagentService.getTemplates() }));
router.get('/agent-templates', (_, res) => res.json({ success: true, templates: multiagentService.getTemplates().agentTemplates }));

// Agent / Task
router.post('/agent', (req, res) => {
  try {
    const agent = multiagentService.createAgent(req.body);
    res.json({ success: true, agent: { id: agent.id, role: agent.role, goal: agent.goal, backstory: agent.backstory, tools: agent.tools } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});
router.post('/task', (req, res) => {
  try {
    const task = multiagentService.createTask(req.body);
    res.json({ success: true, task: { id: task.id, description: task.description, expectedOutput: task.expectedOutput } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Crew
router.post('/crew', (req, res) => {
  try { res.json({ success: true, crew: multiagentService.createCrew(req.body).getStatus() }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.get('/crews', (_, res) => {
  const crews = multiagentService.listCrews();
  res.json({ success: true, crews, count: crews.length });
});
router.get('/crew/:id', withCrew(id => ({ success: true, crew: multiagentService.getCrew(id).getStatus() })));
router.delete('/crew/:id', withCrew(id => multiagentService.deleteCrew(id) ? { success: true, message: 'Crew deleted' } : null));
router.post('/crew/:crewId/execute', withCrew(crewId => multiagentService.executeCrew({ crewId })));
router.get('/crew/:crewId/status', withCrew(crewId => ({ success: true, crew: multiagentService.getCrew(crewId).getStatus() })));

// Execute
router.post('/execute', async (req, res) => {
  try { res.json({ success: true, result: await multiagentService.executeCrew(req.body) }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Engine
router.post('/engine', async (req, res) => {
  try {
    const engine = multiagentService.createEngine({ sessionId: req.body.sessionId, options: req.body.options || {} });
    res.json({ success: true, engine: { sessionId: engine.sessionId, state: engine.getState() } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.get('/engine/:sessionId', withEngine(sessionId => ({ success: true, state: multiagentService.getEngine(sessionId).getState() })));
router.post('/engine/:sessionId/execute', async (req, res) => {
  try { res.json({ success: true, result: await multiagentService.executeEngineTask(req.params.sessionId, req.body.task, req.body.context || {}) }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.post('/engine/:sessionId/pause', withEngine(multiagentService.pauseEngine));
router.post('/engine/:sessionId/resume', withEngine(multiagentService.resumeEngine));
router.post('/engine/:sessionId/checkpoint', withEngine(multiagentService.checkpointEngine));
router.get('/engine/:sessionId/checkpoints', withEngine(sessionId => ({ success: true, checkpoints: multiagentService.listEngineCheckpoints(sessionId) })));
router.post('/engine/:sessionId/restore', async (req, res) => {
  try { res.json({ success: true, result: await multiagentService.restoreFromCheckpoint(req.params.sessionId, req.body.checkpointId) }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.post('/engine/:sessionId/confirm', withEngine((sessionId, body) => multiagentService.confirmEngineRequest(sessionId, body.confirmationId, body.approved, body.modifiedInput)));
router.get('/engine/:sessionId/status', withEngine(multiagentService.getEngineStatus));
router.delete('/engine/:sessionId', async (req, res) => {
  const deleted = await multiagentService.deleteEngine(req.params.sessionId);
  res.json(deleted ? { success: true, message: 'Engine deleted' } : { success: false, error: 'Engine not found' });
});

// Memory
router.get('/engine/:sessionId/memory', withEngine(sessionId => ({ success: true, memory: multiagentService.getEngineMemoryStats(sessionId) })));
router.post('/engine/:sessionId/memory/search', async (req, res) => {
  try { res.json({ success: true, results: await multiagentService.searchEngineMemory(req.params.sessionId, req.body.query, req.body.options) }); }
  catch (error) { res.status(404).json({ success: false, error: error.message }); }
});
router.get('/engine/:sessionId/memory/stats', withEngine(sessionId => ({ success: true, memory: multiagentService.getEngineMemoryStats(sessionId) })));

// Tools
router.get('/tools', (_, res) => {
  const tools = multiagentService.listTools();
  res.json({ success: true, tools, count: tools.length });
});
router.post('/tools/execute', async (req, res) => {
  try { res.json({ success: true, result: await multiagentService.executeTool(req.body.toolName, req.body.input, req.body.options || {}) }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Recovery
router.post('/recovery', async (req, res) => {
  try {
    const AppError = require('../common/errors/AppError');
    const error = AppError.agentError(req.body.errorCode, 'Recovery request').addDetails(req.body.context || {});
    res.json({ success: true, recovery: await recoveryManager.attemptRecovery(error, req.body.context || {}) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.get('/recovery/handlers', (_, res) => res.json({ success: true, handlers: Array.from(recoveryManager.recoveryHandlers.keys()) }));

// Health
router.get('/health', (_, res) => res.json(multiagentService.getHealthStatus()));

module.exports = router;