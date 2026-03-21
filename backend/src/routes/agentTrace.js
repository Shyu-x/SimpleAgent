/**
 * Agent 轨迹 API 路由
 * 提供 Agent 执行轨迹的可视化数据
 */

const express = require('express');
const router = express.Router();
const { agentVisualizer } = require('../services/agent/AgentVisualizer');

/**
 * 获取最近轨迹列表
 * GET /api/agent/traces
 */
router.get('/traces', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const traces = agentVisualizer.getRecentTraces(limit);

    res.json({
      success: true,
      traces,
      total: agentVisualizer.traces.size
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取单个轨迹详情
 * GET /api/agent/trace/:traceId
 */
router.get('/trace/:traceId', (req, res) => {
  try {
    const { traceId } = req.params;
    const trace = agentVisualizer.getTrace(traceId);

    if (!trace) {
      return res.status(404).json({
        success: false,
        error: '轨迹不存在'
      });
    }

    res.json({
      success: true,
      ...trace.toJSON()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取 ASCII 时间线
 * GET /api/agent/trace/:traceId/ascii
 */
router.get('/trace/:traceId/ascii', (req, res) => {
  try {
    const { traceId } = req.params;
    const trace = agentVisualizer.getTrace(traceId);

    if (!trace) {
      return res.status(404).json({
        success: false,
        error: '轨迹不存在'
      });
    }

    const ascii = agentVisualizer.generateAsciiTimeline(trace);
    res.type('text/plain').send(ascii);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 清除所有轨迹
 * DELETE /api/agent/traces
 */
router.delete('/traces', (req, res) => {
  try {
    agentVisualizer.clear();
    res.json({
      success: true,
      message: '所有轨迹已清除'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 创建新的轨迹（用于测试）
 * POST /api/agent/trace
 */
router.post('/trace', (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: '缺少 query 参数'
      });
    }

    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const trace = agentVisualizer.createTrace(traceId, query);

    // 模拟执行流程
    simulateExecution(trace);

    res.json({
      success: true,
      traceId,
      message: '轨迹已创建'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 模拟 Agent 执行流程
 */
async function simulateExecution(trace) {
  // 意图识别
  trace.startStep('intent_detection', '意图识别', { query: trace.query });
  await sleep(100);
  const intent = detectIntent(trace.query);
  trace.endStep({ intent });

  // 问题改写
  trace.startStep('query_rewrite', '问题改写', { original: trace.query });
  await sleep(80);
  const rewritten = rewriteQuery(trace.query);
  trace.endStep({ rewritten });

  // 工具选择
  trace.startStep('tool_selection', '工具选择', { intent });
  await sleep(50);
  const tool = selectTool(intent);
  trace.endStep({ tool });

  // 工具执行
  trace.startStep('tool_execution', '工具执行', { tool, params: {} });
  await sleep(200);
  const result = await executeTool(tool);
  trace.endStep({ result });

  // 结果聚合
  trace.startStep('result_aggregation', '结果聚合');
  await sleep(100);
  trace.endStep({ final: result });

  // 完成
  trace.complete();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function detectIntent(query) {
  if (query.includes('搜索') || query.includes('查找')) return 'search';
  if (query.includes('代码') || query.includes('编程')) return 'code';
  if (query.includes('天气')) return 'weather';
  return 'general';
}

function rewriteQuery(query) {
  return query.replace(/呗/gi, '吧').replace(/啦/gi, '了');
}

function selectTool(intent) {
  const tools = {
    search: 'web_search',
    code: 'code_execution',
    weather: 'weather',
    general: 'chat'
  };
  return tools[intent] || 'chat';
}

async function executeTool(tool) {
  return { success: true, tool, output: '模拟执行结果' };
}

module.exports = router;
