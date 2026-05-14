/**
 * Agent 可视化页面路由 (Thin Wrapper)
 * 委托 AgentVisualizer 服务 + 静态HTML
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const { agentVisualizer } = require('../services/agent/AgentVisualizer');

/**
 * 获取可视化页面
 * GET /agent/visualizer
 */
router.get('/visualizer', (req, res) => {
  res.type('html').sendFile(path.join(__dirname, 'agentTracePage.html'));
});

/**
 * 获取最近轨迹列表
 * GET /agent/traces
 */
router.get('/traces', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const traces = agentVisualizer.getRecentTraces(limit);
    res.json({ success: true, traces, total: agentVisualizer.traces.size });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个轨迹详情
 * GET /agent/trace/:traceId
 */
router.get('/trace/:traceId', (req, res) => {
  try {
    const trace = agentVisualizer.getTrace(req.params.traceId);
    if (!trace) return res.status(404).json({ success: false, error: '轨迹不存在' });
    res.json({ success: true, ...trace.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建新轨迹
 * POST /agent/trace
 */
router.post('/trace', (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, error: '缺少 query 参数' });
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const trace = agentVisualizer.createTrace(traceId, query);
    trace.complete();
    res.json({ success: true, traceId, message: '轨迹已创建' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;