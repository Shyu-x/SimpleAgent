/**
 * 工作流执行 API 路由
 */
const express = require('express');
const router = express.Router();
const { WorkflowEngine } = require('../services/workflowEngine');
const { createLogger } = require('../infra/logger/AgentLogger');
const logger = createLogger('workflow');

const ok = (res, d) => res.json({ success: true, ...d });
const created = (res, d) => res.status(201).json({ success: true, ...d });
const fail = (res, s, m) => res.status(s).json({ success: false, error: { message: m } });

const activeEngines = new Map();

function mapFrontendNodeToBackend(node) {
  const typeMap = {
    'start': 'start',
    'end': 'end',
    'agent': 'task',
    'tool': 'task',
    'condition': 'condition',
    'parallel': 'parallel',
    'delay': 'sequence'
  };

  return {
    id: node.id,
    type: typeMap[node.type] || 'task',
    name: node.name,
    config: node.config || {},
    task: node.type === 'agent' || node.type === 'tool'
      ? { tool: node.config?.tool || 'echo', params: node.config?.params || {} }
      : null,
    condition: node.type === 'condition' ? node.config?.condition : null,
    loop: node.type === 'delay' ? { maxIterations: 1 } : null,
    nodes: node.nodes || [],
    next: null
  };
}

function buildNodeGraph(workflow) {
  const nodeMap = new Map();

  workflow.nodes.forEach(n => {
    const backendNode = mapFrontendNodeToBackend(n);
    nodeMap.set(n.id, backendNode);
  });

  workflow.connections?.forEach(conn => {
    const fromNode = nodeMap.get(conn.from);
    const toNode = nodeMap.get(conn.to);
    if (fromNode && toNode) {
      if (!fromNode.next) {
        fromNode.next = conn.to;
      }
      if (conn.condition) {
        if (conn.condition === '是' || conn.condition === 'true') {
          fromNode.onTrue = conn.to;
        } else {
          fromNode.onFalse = conn.to;
        }
      }
    }
  });

  return nodeMap;
}

router.post('/execute', async (req, res) => {
  try {
    const { workflow, context = {} } = req.body;
    if (!workflow || !workflow.nodes) {
      return fail(res, 400, 'workflow with nodes is required');
    }

    const engine = new WorkflowEngine({ toolRegistry: req.app.get('toolRegistry') || {} });
    const executionId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const backendNodes = Array.from(buildNodeGraph(workflow).values());
    engine.loadWorkflow({
      id: workflow.id || executionId,
      nodes: backendNodes
    });

    engine.executionId = executionId;
    activeEngines.set(executionId, engine);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (eventName, data) => {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify({ executionId, ...data })}\n\n`);
    };

    engine.on('execution:complete', (d) => {
      sendEvent('execution:complete', d);
      // 延迟删除，确保 SSE 完全结束
      setTimeout(() => { activeEngines.delete(executionId); }, 5000);
      res.end();
    });
    engine.on('execution:failed', (d) => {
      sendEvent('execution:failed', d);
      // 延迟删除，确保 SSE 完全结束
      setTimeout(() => { activeEngines.delete(executionId); }, 5000);
      res.end();
    });
    engine.on('node:complete', (d) => sendEvent('node:complete', d));

    engine.execute(context).catch(err => {
      logger.error('Workflow execution error:', err);
    });

    created(res, { executionId });

  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.get('/execute/:executionId/status', (req, res) => {
  const engine = activeEngines.get(req.params.executionId);
  if (!engine) {
    return fail(res, 404, 'Execution not found or already finished');
  }

  ok(res, {
    executionId: req.params.executionId,
    isRunning: engine.isRunning,
    results: engine.getResults ? engine.getResults() : {},
    stats: engine.getStats ? engine.getStats() : {}
  });
});

router.post('/execute/:executionId/stop', (req, res) => {
  const engine = activeEngines.get(req.params.executionId);
  if (!engine) return fail(res, 404, 'Execution not found');
  engine.stop ? engine.stop() : null;
  ok(res, { message: 'Workflow stopped' });
});

router.get('/subscribe/:executionId', (req, res) => {
  const engine = activeEngines.get(req.params.executionId);
  if (!engine) {
    return fail(res, 404, 'Execution not found or already finished');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (eventName, data) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify({ executionId: req.params.executionId, ...data })}\n\n`);
  };

  engine.on('execution:complete', (d) => { sendEvent('execution:complete', d); res.end(); });
  engine.on('execution:failed', (d) => { sendEvent('execution:failed', d); res.end(); });
  engine.on('node:complete', (d) => sendEvent('node:complete', d));
});

module.exports = router;