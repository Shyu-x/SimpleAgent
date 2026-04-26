/**
 * MiniMax Agent 路由 - 仅负责参数校验和响应组装
 * 业务逻辑委托给 application/AgentOrchestrator
 */

const express = require('express');
const router = express.Router();
const { AgentOrchestrator } = require('../application/AgentOrchestrator');

const orchestrator = new AgentOrchestrator();

router.post('/session', async (req, res) => {
  const {
    apiKey, baseURL, model, workspaceDir,
    maxSteps, reasoningSplit, thinkingBudget, showThinking
  } = req.body;

  try {
    const result = orchestrator.createMiniMaxSession({
      apiKey, baseURL, model, workspaceDir,
      maxSteps, reasoningSplit, thinkingBudget, showThinking
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/execute', async (req, res) => {
  const { sessionId, task } = req.body;
  if (!sessionId || !task) {
    return res.status(400).json({ success: false, error: '缺少 sessionId 或 task' });
  }

  const session = orchestrator.getMiniMaxSession(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: '会话不存在' });
  }

  session.lastActivity = Date.now();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
    'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
  });

  const agent = session.agent;
  const sendEvent = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  agent.on('start', sendEvent.bind(null, 'start'));
  agent.on('step_start', sendEvent.bind(null, 'step_start'));
  agent.on('thinking', sendEvent.bind(null, 'thinking'));
  agent.on('tool_call', sendEvent.bind(null, 'tool_call'));
  agent.on('complete', (data) => { sendEvent('complete', data); sendEvent('done', {}); res.end(); });
  agent.on('error', (data) => { sendEvent('error', data); sendEvent('done', {}); res.end(); });
  agent.on('cancelled', (data) => { sendEvent('cancelled', data); sendEvent('done', {}); res.end(); });
  agent.on('max_steps_reached', (data) => { sendEvent('max_steps_reached', data); sendEvent('done', {}); res.end(); });

  agent.addUserMessage(task);
  agent.run().then(() => { session.lastActivity = Date.now(); }).catch((error) => {
    sendEvent('error', { error: error.message });
    sendEvent('done', {});
  });
});

router.get('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = orchestrator.getMiniMaxSession(sessionId);
  if (!session) return res.status(404).json({ success: false, error: '会话不存在' });
  res.json({
    success: true, sessionId,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity,
    stats: session.agent.getStats()
  });
});

router.delete('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!orchestrator.deleteMiniMaxSession(sessionId)) {
    return res.status(404).json({ success: false, error: '会话不存在' });
  }
  res.json({ success: true, message: '会话已关闭' });
});

router.get('/tools', (_req, res) => {
  res.json({ success: true, tools: orchestrator.getMiniMaxTools() });
});

module.exports = router;
