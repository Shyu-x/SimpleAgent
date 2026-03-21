/**
 * 增强 Agent API 路由
 * 支持检查点、人机协作、双记忆系统
 */

const express = require('express');
const router = express.Router();
const {
  EnhancedAgentEngine,
  CheckpointManager,
  DualMemorySystem,
  HumanInTheLoopManager
} = require('../services/enhancedAgentEngine');

// 会话管理
const sessions = new Map();

/**
 * 获取或创建会话
 */
function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    const engine = new EnhancedAgentEngine({
      sessionId,
      enableCheckpoints: true,
      enableHumanLoop: true,
      maxIterations: 10
    });

    // 监听事件
    engine.on('checkpoint_saved', (checkpoint) => {
      console.log(`[Session ${sessionId}] Checkpoint saved: ${checkpoint.id}`);
    });

    engine.on('confirmation_required', (confirmation) => {
      console.log(`[Session ${sessionId}] Confirmation required: ${confirmation.id}`);
    });

    engine.on('waiting_confirmation', (data) => {
      console.log(`[Session ${sessionId}] Waiting for confirmation`);
    });

    sessions.set(sessionId, {
      engine,
      createdAt: Date.now(),
      lastAccess: Date.now()
    });
  }

  const session = sessions.get(sessionId);
  session.lastAccess = Date.now();
  return session;
}

/**
 * POST /api/enhanced-agent/execute
 * 执行增强 Agent 任务
 */
router.post('/execute', async (req, res) => {
  try {
    const { sessionId, task, context = {} } = req.body;

    if (!task) {
      return res.status(400).json({
        success: false,
        error: 'Task is required'
      });
    }

    const session = getOrCreateSession(sessionId || `session_${Date.now()}`);
    const result = await session.engine.execute(task, context);

    res.json({
      success: true,
      sessionId: session.engine.sessionId,
      result
    });
  } catch (error) {
    console.error('Execute error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/enhanced-agent/status/:sessionId
 * 获取 Agent 状态
 */
router.get('/status/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      status: session.engine.getState()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/enhanced-agent/pause/:sessionId
 * 暂停 Agent 执行
 */
router.post('/pause/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    session.engine.pause();
    res.json({
      success: true,
      message: 'Agent paused',
      checkpoint: session.engine.state.currentCheckpoint
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/enhanced-agent/resume/:sessionId
 * 恢复 Agent 执行
 */
router.post('/resume/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    session.engine.resume();
    res.json({
      success: true,
      message: 'Agent resumed'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/enhanced-agent/checkpoint/:sessionId
 * 保存检查点
 */
router.post('/checkpoint/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const checkpoint = session.engine.checkpointManager.save(
      sessionId,
      session.engine.state
    );

    res.json({
      success: true,
      checkpoint
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/enhanced-agent/checkpoints/:sessionId
 * 获取检查点列表
 */
router.get('/checkpoints/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const checkpoints = session.engine.checkpointManager.list(sessionId);
    res.json({
      success: true,
      checkpoints
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/enhanced-agent/restore/:sessionId/:checkpointId
 * 从检查点恢复
 */
router.post('/restore/:sessionId/:checkpointId', async (req, res) => {
  try {
    const { sessionId, checkpointId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const result = await session.engine.restoreFromCheckpoint(checkpointId);
    res.json({
      success: result.success,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/enhanced-agent/confirmations/:sessionId
 * 获取待处理的确认请求
 */
router.get('/confirmations/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const pending = session.engine.humanLoop.getPending(sessionId);
    res.json({
      success: true,
      pending
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/enhanced-agent/confirm/:sessionId/:confirmationId
 * 响应确认请求
 */
router.post('/confirm/:sessionId/:confirmationId', (req, res) => {
  try {
    const { sessionId, confirmationId } = req.params;
    const { approved, modifiedInput } = req.body;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const result = session.engine.respondToConfirmation(
      confirmationId,
      approved,
      modifiedInput
    );

    res.json({
      success: result.success,
      confirmation: result.confirmation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/enhanced-agent/memory/:sessionId
 * 获取记忆状态
 */
router.get('/memory/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const memory = session.engine.memory.export();
    res.json({
      success: true,
      memory
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/enhanced-agent/memory/:sessionId/search
 * 搜索记忆
 */
router.post('/memory/:sessionId/search', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { query, limit } = req.body;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const results = session.engine.memory.search(query, { limit });
    res.json({
      success: true,
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/enhanced-agent/memory/:sessionId/promote
 * 提升记忆到长期存储
 */
router.post('/memory/:sessionId/promote', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { content, type, importance } = req.body;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const memory = session.engine.memory.promoteToLongTerm({
      content,
      type,
      importance
    });

    res.json({
      success: true,
      memory
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/enhanced-agent/session/:sessionId
 * 清理会话
 */
router.delete('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    await session.engine.cleanup();
    sessions.delete(sessionId);

    res.json({
      success: true,
      message: 'Session cleaned up'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/enhanced-agent/sessions
 * 列出所有会话
 */
router.get('/sessions', (req, res) => {
  try {
    const sessionList = Array.from(sessions.entries()).map(([id, session]) => ({
      id,
      createdAt: session.createdAt,
      lastAccess: session.lastAccess,
      status: session.engine.state.status
    }));

    res.json({
      success: true,
      sessions: sessionList
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== 持久化相关 API ====================

/**
 * GET /api/enhanced-agent/persistence/sessions
 * 获取所有持久化的会话（包括历史会话）
 */
router.get('/persistence/sessions', async (req, res) => {
  try {
    const AgentEngine = require('../services/agentEngine');
    const engine = new AgentEngine();
    const sessions = await engine.listSessions();

    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/enhanced-agent/persistence/recoverable
 * 获取可恢复的会话列表
 */
router.get('/persistence/recoverable', async (req, res) => {
  try {
    const AgentEngine = require('../services/agentEngine');
    const engine = new AgentEngine();
    const sessions = await engine.getRecoverableSessions();

    res.json({
      success: true,
      recoverableSessions: sessions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/enhanced-agent/persistence/execute
 * 执行带持久化的任务
 */
router.post('/persistence/execute', async (req, res) => {
  try {
    const { task, context = {}, resumeSessionId } = req.body;

    if (!task && !resumeSessionId) {
      return res.status(400).json({
        success: false,
        error: 'Task or resumeSessionId is required'
      });
    }

    const AgentEngine = require('../services/agentEngine');
    const engine = new AgentEngine({
      autoCheckpoint: true,
      checkpointEvery: 1
    });

    const result = await engine.execute(task, context, resumeSessionId);

    res.json({
      success: result.success,
      result
    });
  } catch (error) {
    console.error('Persistence execute error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/enhanced-agent/persistence/resume/:sessionId
 * 从持久化会话恢复执行
 */
router.post('/persistence/resume/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const AgentEngine = require('../services/agentEngine');
    const engine = new AgentEngine();

    const result = await engine.resumeFromCheckpoint(sessionId);

    res.json({
      success: result.success,
      result
    });
  } catch (error) {
    console.error('Resume error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/enhanced-agent/persistence/session/:sessionId
 * 删除持久化会话
 */
router.delete('/persistence/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const AgentEngine = require('../services/agentEngine');
    const engine = new AgentEngine();
    const deleted = await engine.deleteSession(sessionId);

    res.json({
      success: deleted,
      message: deleted ? 'Session deleted' : 'Failed to delete session'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/enhanced-agent/persistence/cleanup
 * 清理过期会话
 */
router.post('/persistence/cleanup', async (req, res) => {
  try {
    const { maxAgeDays = 7 } = req.body;
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;

    const AgentEngine = require('../services/agentEngine');
    const engine = new AgentEngine();
    const cleaned = await engine.cleanupExpiredSessions(maxAge);

    res.json({
      success: true,
      cleanedCount: cleaned,
      message: `Cleaned ${cleaned} expired sessions`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;