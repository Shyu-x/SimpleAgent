/**
 * Multi-Agent Engine 路由
 * 精简版 - 会话管理委托给 services/multiAgentEngine.js
 */
const express = require('express');
const router = express.Router();
const { AgentFactory, AgentType } = require('../services/multiAgentEngine');
const { ExtendedToolRegistry } = require('../services/extendedTools');
const { sendError } = require('../middleware/errorHandler');
const toolRegistry = new ExtendedToolRegistry();
const sessions = new Map();

router.get('/types', (req, res) => {
  res.json({ success: true, types: [
    { type: AgentType.REACT, name: 'ReAct Agent', description: '推理行动Agent', capabilities: ['web_search', 'calculator'] },
    { type: AgentType.PLAN_EXECUTE, name: 'Plan-Execute Agent', description: '计划执行Agent', capabilities: ['task_decomposition'] },
    { type: AgentType.CODEACT, name: 'CodeAct Agent', description: '代码执行Agent', capabilities: ['code_execution'] },
    { type: AgentType.TEXT2SQL, name: 'Text2SQL Agent', description: '自然语言转SQL', capabilities: ['nl_to_sql'] }
  ]});
});

router.get('/tools', (req, res) => {
  try {
    const tools = toolRegistry.list();
    res.json({ success: true, tools: tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) });
  } catch (error) { sendError(res, 500, 6000, error.message); }
});

router.post('/tools/:toolName/execute', async (req, res) => {
  try {
    const result = await toolRegistry.execute(req.params.toolName, req.body);
    res.json({ success: true, tool: req.params.toolName, result });
  } catch (error) { sendError(res, 500, 5003, error.message); }
});

router.post('/sessions', (req, res) => {
  try {
    const { type, name, options } = req.body;
    if (!type) return sendError(res, 400, 1001, 'Agent type is required', { type: 'validation_error' });
    const agent = AgentFactory.create(type, { ...options, toolRegistry });
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessions.set(sessionId, agent);
    res.json({ success: true, sessionId, type, name: agent.name, status: 'idle' });
  } catch (error) { sendError(res, 500, 3000, error.message); }
});

router.get('/sessions/:sessionId', (req, res) => {
  const agent = sessions.get(req.params.sessionId);
  if (!agent) return sendError(res, 404, 3100, 'Session not found', { type: 'not_found' });
  res.json({ success: true, sessionId: req.params.sessionId, state: agent.getState() });
});

router.post('/sessions/:sessionId/run', async (req, res) => {
  const agent = sessions.get(req.params.sessionId);
  if (!agent) return sendError(res, 404, 3100, 'Session not found', { type: 'not_found' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const events = ['start', 'thought', 'action', 'observation', 'complete', 'error'];
  events.forEach(evt => agent.on(evt, (data) => res.write(`data: ${JSON.stringify({ event: evt, data })}\n\n`)));
  if (res.writableEnded) return;
  try {
    const result = await agent.run(req.body.input, req.body.context);
    if (!res.writableEnded) res.json({ success: true, result });
  } catch (error) { sendError(res, 500, 3000, error.message); }
});

router.post('/sessions/:sessionId/pause', (req, res) => {
  const agent = sessions.get(req.params.sessionId);
  if (!agent) return sendError(res, 404, 3100, 'Session not found', { type: 'not_found' });
  agent.pause();
  res.json({ success: true, sessionId: req.params.sessionId, status: 'paused' });
});

router.post('/sessions/:sessionId/resume', (req, res) => {
  const agent = sessions.get(req.params.sessionId);
  if (!agent) return sendError(res, 404, 3100, 'Session not found', { type: 'not_found' });
  agent.resume();
  res.json({ success: true, sessionId: req.params.sessionId, status: 'running' });
});

router.delete('/sessions/:sessionId', (req, res) => {
  if (!sessions.has(req.params.sessionId)) return sendError(res, 404, 3100, 'Session not found', { type: 'not_found' });
  sessions.delete(req.params.sessionId);
  res.json({ success: true, message: 'Session terminated' });
});

router.get('/sessions', (req, res) => {
  const sessionList = Array.from(sessions.keys()).map(sessionId => ({ sessionId, status: sessions.get(sessionId).getState().status, name: sessions.get(sessionId).name }));
  res.json({ success: true, sessions: sessionList, count: sessionList.length });
});

router.post('/run', async (req, res) => {
  try {
    const { type, input, context, options } = req.body;
    if (!type || !input) return sendError(res, 400, 1001, 'type and input are required', { type: 'validation_error' });
    const agent = AgentFactory.create(type, { ...options, toolRegistry });
    const result = await agent.run(input, context);
    res.json({ success: true, result });
  } catch (error) { sendError(res, 500, 3000, error.message); }
});

router.post('/text2sql/config', (req, res) => {
  try {
    const { sessionId, dbConfig } = req.body;
    const agent = sessions.get(sessionId);
    if (!agent || agent.name !== 'Text2SQL Agent') return sendError(res, 400, 1001, 'Invalid session or not a Text2SQL agent', { type: 'validation_error' });
    agent.setDBConfig(dbConfig);
    res.json({ success: true, message: 'Database configured' });
  } catch (error) { sendError(res, 500, 3000, error.message); }
});

module.exports = router;
