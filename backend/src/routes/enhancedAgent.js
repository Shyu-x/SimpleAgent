/**
 * 增强 Agent 路由 - 仅负责参数校验和响应组装
 * 业务逻辑委托给 application/AgentOrchestrator
 */

const express = require('express');
const router = express.Router();
const { AgentOrchestrator } = require('../application/AgentOrchestrator');

const orchestrator = new AgentOrchestrator();

// ==================== 执行 ====================

router.post('/execute', async (req, res) => {
  const { sessionId, task, context = {} } = req.body;
  if (!task) return res.status(400).json({ success: false, error: 'Task is required' });
  try {
    const result = await orchestrator.execute({ sessionId, task, context });
    res.json({ success: true, sessionId: result.sessionId || sessionId, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 状态管理 ====================

router.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const state = orchestrator.getState(sessionId);
  if (!state) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, status: state });
});

router.post('/pause/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const result = orchestrator.pause(sessionId);
  if (!result) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, message: 'Agent paused', checkpoint: result.checkpoint });
});

router.post('/resume/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const result = orchestrator.resume(sessionId);
  if (!result) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, message: 'Agent resumed' });
});

// ==================== 检查点 ====================

router.post('/checkpoint/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const checkpoint = orchestrator.saveCheckpoint(sessionId);
  if (!checkpoint) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, checkpoint });
});

router.get('/checkpoints/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const checkpoints = orchestrator.listCheckpoints(sessionId);
  if (!checkpoints) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, checkpoints });
});

router.post('/restore/:sessionId/:checkpointId', async (req, res) => {
  const { sessionId, checkpointId } = req.params;
  const result = await orchestrator.restoreFromCheckpoint(sessionId, checkpointId);
  if (!result) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: result.success, ...result });
});

// ==================== 确认 ====================

router.get('/confirmations/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const pending = orchestrator.getPendingConfirmations(sessionId);
  if (!pending) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, pending });
});

router.post('/confirm/:sessionId/:confirmationId', (req, res) => {
  const { sessionId, confirmationId } = req.params;
  const { approved, modifiedInput } = req.body;
  const result = orchestrator.respondToConfirmation(sessionId, confirmationId, approved, modifiedInput);
  if (!result) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: result.success, confirmation: result.confirmation });
});

// ==================== 记忆 ====================

router.get('/memory/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const memory = orchestrator.getMemory(sessionId);
  if (!memory) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, memory });
});

router.post('/memory/:sessionId/search', (req, res) => {
  const { sessionId } = req.params;
  const { query, limit } = req.body;
  const results = orchestrator.searchMemory(sessionId, query, limit);
  if (!results) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, results });
});

router.post('/memory/:sessionId/promote', (req, res) => {
  const { sessionId } = req.params;
  const { content, type, importance } = req.body;
  const memory = orchestrator.promoteMemory(sessionId, content, type, importance);
  if (!memory) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, memory });
});

// ==================== 会话管理 ====================

router.delete('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const deleted = await orchestrator.cleanupSession(sessionId);
  if (!deleted) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, message: 'Session cleaned up' });
});

router.get('/sessions', (_req, res) => {
  res.json({ success: true, sessions: orchestrator.listSessions() });
});

// ==================== 持久化 ====================

router.get('/persistence/sessions', async (_req, res) => {
  try {
    const sessions = await orchestrator.listPersistentSessions();
    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/persistence/recoverable', async (_req, res) => {
  try {
    const sessions = await orchestrator.getRecoverableSessions();
    res.json({ success: true, recoverableSessions: sessions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/persistence/execute', async (req, res) => {
  const { task, context = {}, resumeSessionId } = req.body;
  if (!task && !resumeSessionId) {
    return res.status(400).json({ success: false, error: 'Task or resumeSessionId is required' });
  }
  try {
    const result = await orchestrator.executePersistent({ task, context, resumeSessionId });
    res.json({ success: result.success, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/persistence/resume/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const result = await orchestrator.resumeFromPersistent(sessionId);
    res.json({ success: result.success, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/persistence/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const deleted = await orchestrator.deletePersistentSession(sessionId);
    res.json({ success: deleted, message: deleted ? 'Session deleted' : 'Failed to delete session' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/persistence/cleanup', async (req, res) => {
  const { maxAgeDays = 7 } = req.body;
  try {
    const cleaned = await orchestrator.cleanupExpiredPersistentSessions(maxAgeDays);
    res.json({ success: true, cleanedCount: cleaned, message: `Cleaned ${cleaned} expired sessions` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
