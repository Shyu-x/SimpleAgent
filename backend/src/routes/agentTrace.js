/**
 * Agent 轨迹 API 路由
 */
const express = require('express');
const router = express.Router();
const { agentVisualizer } = require('../services/agent/AgentVisualizer');
const { sendError } = require('../middleware/errorHandler');

// 获取最近轨迹列表
router.get('/traces', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const traces = agentVisualizer.getRecentTraces(limit);
    res.json({ success: true, traces, total: agentVisualizer.traces.size });
  } catch (error) {
    sendError(res, 500, 6000, error.message);
  }
});

// 获取单个轨迹详情
router.get('/trace/:traceId', (req, res) => {
  try {
    const trace = agentVisualizer.getTrace(req.params.traceId);
    if (!trace) return sendError(res, 404, 6004, '轨迹不存在');
    res.json({ success: true, ...trace.toJSON() });
  } catch (error) {
    sendError(res, 500, 6000, error.message);
  }
});

// 获取 ASCII 时间线
router.get('/trace/:traceId/ascii', (req, res) => {
  try {
    const trace = agentVisualizer.getTrace(req.params.traceId);
    if (!trace) return sendError(res, 404, 6004, '轨迹不存在');
    res.type('text/plain').send(agentVisualizer.generateAsciiTimeline(trace));
  } catch (error) {
    sendError(res, 500, 6000, error.message);
  }
});

// 清除所有轨迹
router.delete('/traces', (req, res) => {
  try {
    agentVisualizer.clear();
    res.json({ success: true, message: '所有轨迹已清除' });
  } catch (error) {
    sendError(res, 500, 6000, error.message);
  }
});

// 创建新轨迹
router.post('/trace', (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return sendError(res, 400, 1001, '缺少 query 参数');
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const trace = agentVisualizer.createTrace(traceId, query);
    trace.complete();
    res.json({ success: true, traceId, message: '轨迹已创建' });
  } catch (error) {
    sendError(res, 500, 6000, error.message);
  }
});

module.exports = router;