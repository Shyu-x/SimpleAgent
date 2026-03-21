/**
 * MiniMax M2.7 Agent API 路由
 * 提供完整的 Agent 执行循环接口
 */

const express = require('express');
const router = express.Router();
const { MiniMaxAgentRunner, ToolResult } = require('../services/miniMaxAgentRunner');

// 会话管理
const sessions = new Map();

/**
 * 创建新的 Agent 会话
 */
router.post('/session', async (req, res) => {
  try {
    const {
      apiKey,
      baseURL,
      model = 'MiniMax-M2.7-highspeed',
      workspaceDir = './workspace',
      maxSteps = 50,
      reasoningSplit = true,
      thinkingBudget = 8000,
      showThinking = false
    } = req.body;

    // 创建 Agent 实例
    const agent = new MiniMaxAgentRunner({
      apiKey,
      baseURL: baseURL || 'https://api.minimaxi.com/anthropic',
      model,
      workspaceDir,
      maxSteps,
      reasoningSplit,
      thinkingBudget,
      showThinking
    });

    // 生成会话 ID
    const sessionId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 存储会话
    sessions.set(sessionId, {
      agent,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });

    res.json({
      success: true,
      sessionId,
      tools: agent.getToolSchemas().map(t => ({
        name: t.name,
        description: t.description
      }))
    });
  } catch (error) {
    console.error('创建 Agent 会话失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 执行 Agent 任务
 */
router.post('/execute', async (req, res) => {
  try {
    const { sessionId, task } = req.body;

    if (!sessionId || !task) {
      return res.status(400).json({
        success: false,
        error: '缺少 sessionId 或 task'
      });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '会话不存在'
      });
    }

    // 更新最后活动时间
    session.lastActivity = Date.now();

    // 设置 SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // 监听事件并发送 SSE
    const agent = session.agent;

    agent.on('start', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'start', ...data })}\n\n`);
    });

    agent.on('step_start', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'step_start', ...data })}\n\n`);
    });

    agent.on('thinking', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'thinking', ...data })}\n\n`);
    });

    agent.on('tool_call', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'tool_call', ...data })}\n\n`);
    });

    agent.on('complete', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'complete', ...data })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    });

    agent.on('error', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'error', ...data })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    });

    agent.on('cancelled', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'cancelled', ...data })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    });

    agent.on('max_steps_reached', (data) => {
      res.write(`data: ${JSON.stringify({ type: 'max_steps_reached', ...data })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    });

    // 添加用户消息并执行
    agent.addUserMessage(task);

    // 执行（非阻塞，让事件驱动响应）
    agent.run().then(result => {
      // 结果已经在 complete 事件中发送
      session.lastActivity = Date.now();
    }).catch(error => {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error('Agent 执行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取会话状态
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: '会话不存在'
      });
    }

    res.json({
      success: true,
      sessionId,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      stats: session.agent.getStats()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 关闭会话
 */
router.delete('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (sessions.has(sessionId)) {
      sessions.delete(sessionId);
      res.json({
        success: true,
        message: '会话已关闭'
      });
    } else {
      res.status(404).json({
        success: false,
        error: '会话不存在'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取可用工具列表
 */
router.get('/tools', async (req, res) => {
  try {
    // 返回默认工具列表
    const defaultTools = [
      {
        name: 'file_read',
        description: '读取文件内容',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' },
            lines: { type: 'integer', description: '最多读取的行数' }
          },
          required: ['path']
        }
      },
      {
        name: 'file_write',
        description: '写入内容到文件',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' },
            content: { type: 'string', description: '文件内容' },
            append: { type: 'boolean', description: '是否追加' }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'file_list',
        description: '列出目录中的文件',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '目录路径' },
            recursive: { type: 'boolean', description: '是否递归' }
          }
        }
      },
      {
        name: 'shell',
        description: '执行 Shell 命令',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: '要执行的命令' },
            timeout: { type: 'integer', description: '超时时间(毫秒)' }
          },
          required: ['command']
        }
      },
      {
        name: 'web_search',
        description: '搜索网络信息',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
            max_results: { type: 'integer', description: '最大结果数' }
          },
          required: ['query']
        }
      }
    ];

    res.json({
      success: true,
      tools: defaultTools
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 清理过期会话
 */
setInterval(() => {
  const now = Date.now();
  const sessionTimeout = 30 * 60 * 1000; // 30 分钟

  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > sessionTimeout) {
      sessions.delete(sessionId);
      console.log(`清理过期会话: ${sessionId}`);
    }
  }
}, 5 * 60 * 1000); // 每 5 分钟检查一次

module.exports = router;
