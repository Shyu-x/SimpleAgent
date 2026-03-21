const express = require('express');
const router = express.Router();
const { memorySystem, MemoryType, MemorySource } = require('../enhancedMemory');

/**
 * 初始化记忆系统
 * POST /api/memory/initialize
 */
router.post('/initialize', async (req, res) => {
  try {
    await memorySystem.initialize();
    res.json({ success: true, stats: memorySystem.getStats() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 添加记忆
 * POST /api/memory/add
 */
router.post('/add', async (req, res) => {
  const { content, type, source, metadata, importance, sessionId, agentId, tags } = req.body;

  if (!content) {
    return res.status(400).json({ success: false, error: 'Missing content' });
  }

  try {
    const memory = await memorySystem.addMemory(content, {
      type: type || MemoryType.SHORT_TERM,
      source: source || MemorySource.USER,
      metadata: metadata || {},
      importance: importance || 0.5,
      sessionId,
      agentId,
      tags: tags || []
    });

    res.json({ success: true, memory: memory.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * 搜索记忆
 * POST /api/memory/search
 */
router.post('/search', (req, res) => {
  const { query, threshold, limit, types } = req.body;

  if (!query) {
    return res.status(400).json({ success: false, error: 'Missing query' });
  }

  try {
    const results = memorySystem.search(query, {
      threshold,
      limit,
      types
    });

    res.json({ success: true, results, count: results.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * 会话管理 - 创建会话
 * POST /api/memory/session
 */
router.post('/session', (req, res) => {
  const { sessionId } = req.body;
  const id = sessionId || `session_${Date.now()}`;

  const session = memorySystem.createSession(id);
  res.json({ success: true, session: session.getContext() });
});

/**
 * 会话管理 - 获取会话
 * GET /api/memory/session/:id
 */
router.get('/session/:id', (req, res) => {
  const { id } = req.params;

  const session = memorySystem.getSession(id);
  res.json({ success: true, session: session.getContext() });
});

/**
 * 会话管理 - 添加消息
 * POST /api/memory/session/:id/message
 */
router.post('/session/:id/message', (req, res) => {
  const { id } = req.params;
  const { role, content } = req.body;

  if (!role || !content) {
    return res.status(400).json({ success: false, error: 'Missing role or content' });
  }

  const session = memorySystem.getSession(id);
  session.addMessage(role, content);

  res.json({ success: true, messageCount: session.messages.length });
});

/**
 * 会话管理 - 设置变量
 * POST /api/memory/session/:id/variable
 */
router.post('/session/:id/variable', (req, res) => {
  const { id } = req.params;
  const { key, value } = req.body;

  if (!key) {
    return res.status(400).json({ success: false, error: 'Missing key' });
  }

  const session = memorySystem.getSession(id);
  session.setVariable(key, value);

  res.json({ success: true, variables: session.variables });
});

/**
 * 清理过期记忆
 * POST /api/memory/cleanup
 */
router.post('/cleanup', async (req, res) => {
  try {
    const cleaned = await memorySystem.cleanupExpired();
    res.json({ success: true, cleaned });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取统计信息
 * GET /api/memory/stats
 */
router.get('/stats', (req, res) => {
  res.json({ success: true, stats: memorySystem.getStats() });
});

/**
 * 获取记忆类型
 * GET /api/memory/types
 */
router.get('/types', (req, res) => {
  res.json({
    success: true,
    types: Object.values(MemoryType),
    sources: Object.values(MemorySource)
  });
});

/**
 * 健康检查
 * GET /api/memory/health
 */
router.get('/health', (req, res) => {
  const stats = memorySystem.getStats();
  res.json({
    status: 'ok',
    service: 'enhanced-memory',
    ...stats,
    timestamp: new Date().toISOString()
  });
});

/**
 * 转移到长期记忆
 * POST /api/memory/:id/promote
 */
router.post('/:id/promote', async (req, res) => {
  const { id } = req.params;

  try {
    const memory = await memorySystem.promoteToLongTerm(id);
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Memory not found' });
    }

    res.json({ success: true, memory: memory.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取记忆
 * GET /api/memory/:id
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;

  const memory = memorySystem.getMemory(id);
  if (!memory) {
    return res.status(404).json({ success: false, error: 'Memory not found' });
  }

  res.json({ success: true, memory: memory.toJSON() });
});

/**
 * 删除记忆
 * DELETE /api/memory/:id
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await memorySystem.deleteMemory(id);
    res.json({ success: deleted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
