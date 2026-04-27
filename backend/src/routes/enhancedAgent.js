/**
 * 增强 Agent 路由 - 仅负责参数校验和响应组装
 * 业务逻辑委托给 application/AgentOrchestrator
 */
const express = require('express');
const router = express.Router();
const { AgentOrchestrator } = require('../application/AgentOrchestrator');

const orchestrator = new AgentOrchestrator();
const notFound = (res) => res.status(404).json({ success: false, error: 'Session not found' });
const handleError = (res, error) => res.status(500).json({ success: false, error: error.message });

// ==================== 执行 ====================
router.post('/execute', async (req, res) => {
  const { sessionId, task, context = {} } = req.body;
  if (!task) return res.status(400).json({ success: false, error: 'Task is required' });
  try {
    const result = await orchestrator.execute({ sessionId, task, context });
    res.json({ success: true, sessionId: result.sessionId || sessionId, result });
  } catch (error) { handleError(res, error); }
});

// ==================== 状态管理 ====================
router.get('/status/:sessionId', (req, res) => {
  const state = orchestrator.getState(req.params.sessionId);
  state ? res.json({ success: true, status: state }) : notFound(res);
});

router.post('/pause/:sessionId', (req, res) => {
  const result = orchestrator.pause(req.params.sessionId);
  result ? res.json({ success: true, message: 'Agent paused', checkpoint: result.checkpoint }) : notFound(res);
});

router.post('/resume/:sessionId', (req, res) => {
  const result = orchestrator.resume(req.params.sessionId);
  result ? res.json({ success: true, message: 'Agent resumed' }) : notFound(res);
});

// ==================== 检查点 ====================
router.post('/checkpoint/:sessionId', (req, res) => {
  const checkpoint = orchestrator.saveCheckpoint(req.params.sessionId);
  checkpoint ? res.json({ success: true, checkpoint }) : notFound(res);
});

router.get('/checkpoints/:sessionId', (req, res) => {
  const checkpoints = orchestrator.listCheckpoints(req.params.sessionId);
  checkpoints ? res.json({ success: true, checkpoints }) : notFound(res);
});

router.post('/restore/:sessionId/:checkpointId', async (req, res) => {
  try {
    const result = await orchestrator.restoreFromCheckpoint(req.params.sessionId, req.params.checkpointId);
    result ? res.json({ success: result.success, ...result }) : notFound(res);
  } catch (error) { handleError(res, error); }
});

// ==================== 确认 ====================
router.get('/confirmations/:sessionId', (req, res) => {
  const pending = orchestrator.getPendingConfirmations(req.params.sessionId);
  pending ? res.json({ success: true, pending }) : notFound(res);
});

router.post('/confirm/:sessionId/:confirmationId', (req, res) => {
  const { approved, modifiedInput } = req.body;
  const result = orchestrator.respondToConfirmation(req.params.sessionId, req.params.confirmationId, approved, modifiedInput);
  result ? res.json({ success: result.success, confirmation: result.confirmation }) : notFound(res);
});

// ==================== 记忆 ====================
router.get('/memory/:sessionId', (req, res) => {
  const memory = orchestrator.getMemory(req.params.sessionId);
  memory ? res.json({ success: true, memory }) : notFound(res);
});

router.post('/memory/:sessionId/search', (req, res) => {
  const { query, limit } = req.body;
  const results = orchestrator.searchMemory(req.params.sessionId, query, limit);
  results ? res.json({ success: true, results }) : notFound(res);
});

router.post('/memory/:sessionId/promote', (req, res) => {
  const { content, type, importance } = req.body;
  const memory = orchestrator.promoteMemory(req.params.sessionId, content, type, importance);
  memory ? res.json({ success: true, memory }) : notFound(res);
});

// ==================== 会话管理 ====================
router.delete('/session/:sessionId', async (req, res) => {
  try {
    const deleted = await orchestrator.cleanupSession(req.params.sessionId);
    deleted ? res.json({ success: true, message: 'Session cleaned up' }) : notFound(res);
  } catch (error) { handleError(res, error); }
});

router.get('/sessions', (_req, res) => {
  res.json({ success: true, sessions: orchestrator.listSessions() });
});

// ==================== 持久化 ====================
router.get('/persistence/sessions', async (_req, res) => {
  try { res.json({ success: true, sessions: await orchestrator.listPersistentSessions() }); }
  catch (error) { handleError(res, error); }
});

router.get('/persistence/recoverable', async (_req, res) => {
  try { res.json({ success: true, recoverableSessions: await orchestrator.getRecoverableSessions() }); }
  catch (error) { handleError(res, error); }
});

router.post('/persistence/execute', async (req, res) => {
  const { task, context = {}, resumeSessionId } = req.body;
  if (!task && !resumeSessionId) return res.status(400).json({ success: false, error: 'Task or resumeSessionId is required' });
  try {
    const result = await orchestrator.executePersistent({ task, context, resumeSessionId });
    res.json({ success: result.success, result });
  } catch (error) { handleError(res, error); }
});

router.post('/persistence/resume/:sessionId', async (req, res) => {
  try {
    const result = await orchestrator.resumeFromPersistent(req.params.sessionId);
    res.json({ success: result.success, result });
  } catch (error) { handleError(res, error); }
});

router.delete('/persistence/session/:sessionId', async (req, res) => {
  try {
    const deleted = await orchestrator.deletePersistentSession(req.params.sessionId);
    res.json({ success: deleted, message: deleted ? 'Session deleted' : 'Failed to delete session' });
  } catch (error) { handleError(res, error); }
});

router.post('/persistence/cleanup', async (req, res) => {
  try {
    const cleaned = await orchestrator.cleanupExpiredPersistentSessions(req.body.maxAgeDays || 7);
    res.json({ success: true, cleanedCount: cleaned, message: `Cleaned ${cleaned} expired sessions` });
  } catch (error) { handleError(res, error); }
});

module.exports = router;
