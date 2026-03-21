const express = require('express');
const router = express.Router();
const {
  ReActAgent,
  PlanExecuteAgent,
  CodeActAgent,
  Text2SQLAgent,
  AgentFactory,
  AgentType
} = require('../services/multiAgentEngine');
const { ExtendedToolRegistry } = require('../services/extendedTools');

// 创建工具注册表实例
const toolRegistry = new ExtendedToolRegistry();

/**
 * 获取所有Agent类型
 */
router.get('/types', (req, res) => {
  res.json({
    success: true,
    types: [
      {
        type: AgentType.REACT,
        name: 'ReAct Agent',
        description: '推理行动Agent，支持思考-行动-观察循环',
        capabilities: ['web_search', 'calculator', 'custom_tools']
      },
      {
        type: AgentType.PLAN_EXECUTE,
        name: 'Plan-Execute Agent',
        description: '计划执行Agent，支持任务分解和逐步执行',
        capabilities: ['task_decomposition', 'step_execution', 'plan_adjustment']
      },
      {
        type: AgentType.CODEACT,
        name: 'CodeAct Agent',
        description: '代码执行Agent，支持安全沙箱代码运行',
        capabilities: ['code_execution', 'error_fixing', 'sandbox_isolation']
      },
      {
        type: AgentType.TEXT2SQL,
        name: 'Text2SQL Agent',
        description: '自然语言转SQL查询Agent',
        capabilities: ['nl_to_sql', 'sql_validation', 'db_execution']
      }
    ]
  });
});

/**
 * 获取可用工具列表
 */
router.get('/tools', (req, res) => {
  try {
    const tools = toolRegistry.list();

    res.json({
      success: true,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 执行工具
 */
router.post('/tools/:toolName/execute', async (req, res) => {
  try {
    const { toolName } = req.params;
    const args = req.body;

    const result = await toolRegistry.execute(toolName, args);

    res.json({
      success: true,
      tool: toolName,
      result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建Agent会话
 */
router.post('/sessions', (req, res) => {
  try {
    const { type, name, options } = req.body;

    if (!type) {
      return res.status(400).json({
        error: { message: 'Agent type is required', type: 'validation_error' }
      });
    }

    const agent = AgentFactory.create(type, {
      ...options,
      toolRegistry
    });

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 存储会话
    sessions.set(sessionId, agent);

    res.json({
      success: true,
      sessionId,
      type,
      name: agent.name,
      status: 'idle'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 会话存储
const sessions = new Map();

/**
 * 获取会话状态
 */
router.get('/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const agent = sessions.get(sessionId);

    if (!agent) {
      return res.status(404).json({
        error: { message: 'Session not found', type: 'not_found' }
      });
    }

    res.json({
      success: true,
      sessionId,
      state: agent.getState()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 运行Agent
 */
router.post('/sessions/:sessionId/run', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { input, context } = req.body;
    const agent = sessions.get(sessionId);

    if (!agent) {
      return res.status(404).json({
        error: { message: 'Session not found', type: 'not_found' }
      });
    }

    // 流式响应处理
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 监听事件
    agent.on('start', (data) => {
      res.write(`data: ${JSON.stringify({ event: 'start', data })}\n\n`);
    });

    agent.on('thought', (thought) => {
      res.write(`data: ${JSON.stringify({ event: 'thought', data: thought })}\n\n`);
    });

    agent.on('action', (action) => {
      res.write(`data: ${JSON.stringify({ event: 'action', data: action })}\n\n`);
    });

    agent.on('observation', (observation) => {
      res.write(`data: ${JSON.stringify({ event: 'observation', data: observation })}\n\n`);
    });

    agent.on('complete', (result) => {
      res.write(`data: ${JSON.stringify({ event: 'complete', data: result })}\n\n`);
      res.end();
    });

    agent.on('error', (error) => {
      res.write(`data: ${JSON.stringify({ event: 'error', data: { message: error.message } })}\n\n`);
      res.end();
    });

    // 执行Agent
    const result = await agent.run(input, context);

    // 如果不是流式响应
    if (!res.writableEnded) {
      res.json({ success: true, result });
    }

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 快速运行Agent（不带会话）
 */
router.post('/run', async (req, res) => {
  try {
    const { type, input, context, options } = req.body;

    if (!type || !input) {
      return res.status(400).json({
        error: { message: 'type and input are required', type: 'validation_error' }
      });
    }

    const agent = AgentFactory.create(type, {
      ...options,
      toolRegistry
    });

    const result = await agent.run(input, context);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 暂停Agent执行
 */
router.post('/sessions/:sessionId/pause', (req, res) => {
  try {
    const { sessionId } = req.params;
    const agent = sessions.get(sessionId);

    if (!agent) {
      return res.status(404).json({
        error: { message: 'Session not found', type: 'not_found' }
      });
    }

    agent.pause();

    res.json({
      success: true,
      sessionId,
      status: 'paused'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 恢复Agent执行
 */
router.post('/sessions/:sessionId/resume', (req, res) => {
  try {
    const { sessionId } = req.params;
    const agent = sessions.get(sessionId);

    if (!agent) {
      return res.status(404).json({
        error: { message: 'Session not found', type: 'not_found' }
      });
    }

    agent.resume();

    res.json({
      success: true,
      sessionId,
      status: 'running'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 终止会话
 */
router.delete('/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessions.has(sessionId)) {
      return res.status(404).json({
        error: { message: 'Session not found', type: 'not_found' }
      });
    }

    sessions.delete(sessionId);

    res.json({
      success: true,
      message: 'Session terminated'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取所有会话
 */
router.get('/sessions', (req, res) => {
  const sessionList = Array.from(sessions.keys()).map(sessionId => ({
    sessionId,
    status: sessions.get(sessionId).getState().status,
    name: sessions.get(sessionId).name
  }));

  res.json({
    success: true,
    sessions: sessionList,
    count: sessionList.length
  });
});

/**
 * 配置Text2SQL数据库连接
 */
router.post('/text2sql/config', (req, res) => {
  try {
    const { sessionId, dbConfig } = req.body;
    const agent = sessions.get(sessionId);

    if (!agent || agent.name !== 'Text2SQL Agent') {
      return res.status(400).json({
        error: { message: 'Invalid session or not a Text2SQL agent', type: 'validation_error' }
      });
    }

    agent.setDBConfig(dbConfig);

    res.json({
      success: true,
      message: 'Database configured'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
