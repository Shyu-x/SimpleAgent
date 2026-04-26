/**
 * Agent 路由 - 仅负责参数校验和响应组装
 * 业务逻辑委托给 application/AgentOrchestrator
 */
const express = require('express');
const router = express.Router();
const { AgentOrchestrator } = require('../application/AgentOrchestrator');
const oc = new AgentOrchestrator();

const ok = (res, r) => r ? res.json(r) : res.status(404).json({ success: false, error: 'Session not found' });

// MiniMax Agent
router.post('/session', (req, res) => { try { res.json({ success: true, ...oc.createMiniMaxSession(req.body) }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });

router.post('/execute', async (req, res) => {
  const { sessionId, task } = req.body;
  if (!sessionId || !task) return res.status(400).json({ success: false, error: '缺少 sessionId 或 task' });
  const s = oc.getMiniMaxSession(sessionId);
  if (!s) return res.status(404).json({ success: false, error: '会话不存在' });
  s.lastActivity = Date.now();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  const send = (t, d) => res.write(`data: ${JSON.stringify({ type: t, ...d })}\n\n`);
  s.agent.on('start', (d) => send('start', d)).on('step_start', (d) => send('step_start', d)).on('thinking', (d) => send('thinking', d)).on('tool_call', (d) => send('tool_call', d));
  s.agent.on('complete', (d) => { send('complete', d); send('done', {}); res.end(); }).on('error', (d) => { send('error', d); send('done', {}); res.end(); }).on('cancelled', (d) => { send('cancelled', d); send('done', {}); res.end(); }).on('max_steps_reached', (d) => { send('max_steps_reached', d); send('done', {}); res.end(); });
  s.agent.addUserMessage(task);
  s.agent.run().catch((e) => { send('error', { error: e.message }); send('done', {}); });
});

router.get('/session/:id', (req, res) => { const s = oc.getMiniMaxSession(req.params.id); if (!s) return res.status(404).json({ success: false, error: '会话不存在' }); res.json({ success: true, sessionId: req.params.id, createdAt: s.createdAt, lastActivity: s.lastActivity, stats: s.agent.getStats() }); });
router.delete('/session/:id', (req, res) => { if (!oc.deleteMiniMaxSession(req.params.id)) return res.status(404).json({ success: false, error: '会话不存在' }); res.json({ success: true, message: '会话已关闭' }); });
router.get('/tools', (_req, res) => res.json({ success: true, tools: oc.getMiniMaxTools() }));

// Enhanced Agent
router.post('/enhanced/execute', async (req, res) => { const { sessionId, task, context = {} } = req.body; if (!task) return res.status(400).json({ success: false, error: 'Task is required' }); try { const r = await oc.execute({ sessionId, task, context }); res.json({ success: true, sessionId: r.sessionId || sessionId, result: r }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
router.get('/enhanced/status/:id', (req, res) => ok(res, oc.getState(req.params.id) && { success: true, status: oc.getState(req.params.id) }));
router.post('/enhanced/pause/:id', (req, res) => { const r = oc.pause(req.params.id); ok(res, r && { success: true, message: 'Agent paused', checkpoint: r.checkpoint }); });
router.post('/enhanced/resume/:id', (req, res) => { const r = oc.resume(req.params.id); ok(res, r && { success: true, message: 'Agent resumed' }); });
router.post('/enhanced/checkpoint/:id', (req, res) => { const cp = oc.saveCheckpoint(req.params.id); ok(res, cp && { success: true, checkpoint: cp }); });
router.get('/enhanced/checkpoints/:id', (req, res) => { const cps = oc.listCheckpoints(req.params.id); ok(res, cps && { success: true, checkpoints: cps }); });
router.post('/enhanced/restore/:id/:cpId', async (req, res) => { const r = await oc.restoreFromCheckpoint(req.params.id, req.params.cpId); ok(res, r && { success: r.success, ...r }); });
router.get('/enhanced/confirmations/:id', (req, res) => { const p = oc.getPendingConfirmations(req.params.id); ok(res, p && { success: true, pending: p }); });
router.post('/enhanced/confirm/:id/:cid', (req, res) => { const r = oc.respondToConfirmation(req.params.id, req.params.cid, req.body.approved, req.body.modifiedInput); ok(res, r && { success: r.success, confirmation: r.confirmation }); });
router.get('/enhanced/memory/:id', (req, res) => { const m = oc.getMemory(req.params.id); ok(res, m && { success: true, memory: m }); });
router.post('/enhanced/memory/:id/search', (req, res) => { const r = oc.searchMemory(req.params.id, req.body.query, req.body.limit); ok(res, r && { success: true, results: r }); });
router.post('/enhanced/memory/:id/promote', (req, res) => { const m = oc.promoteMemory(req.params.id, req.body.content, req.body.type, req.body.importance); ok(res, m && { success: true, memory: m }); });
router.delete('/enhanced/session/:id', async (req, res) => { const d = await oc.cleanupSession(req.params.id); ok(res, d && { success: true, message: 'Session cleaned up' }); });
router.get('/enhanced/sessions', (_req, res) => res.json({ success: true, sessions: oc.listSessions() }));

// 持久化
router.get('/persistence/sessions', async (_req, res) => { try { res.json({ success: true, sessions: await oc.listPersistentSessions() }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
router.get('/persistence/recoverable', async (_req, res) => { try { res.json({ success: true, recoverableSessions: await oc.getRecoverableSessions() }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
router.post('/persistence/execute', async (req, res) => { const { task, context = {}, resumeSessionId } = req.body; if (!task && !resumeSessionId) return res.status(400).json({ success: false, error: 'Task or resumeSessionId is required' }); try { const r = await oc.executePersistent({ task, context, resumeSessionId }); res.json({ success: r.success, result: r }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
router.post('/persistence/resume/:id', async (req, res) => { try { const r = await oc.resumeFromPersistent(req.params.id); res.json({ success: r.success, result: r }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
router.delete('/persistence/session/:id', async (req, res) => { try { const d = await oc.deletePersistentSession(req.params.id); res.json({ success: d, message: d ? 'Session deleted' : 'Failed' }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
router.post('/persistence/cleanup', async (req, res) => { try { const c = await oc.cleanupExpiredPersistentSessions(req.body.maxAgeDays || 7); res.json({ success: true, cleanedCount: c, message: `Cleaned ${c} expired sessions` }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });

module.exports = router;
