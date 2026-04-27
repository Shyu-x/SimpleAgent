/**
 * 记忆系统后端 API
 * 支持会话记忆和全局记忆的持久化同步
 *
 * @swagger
 * tags:
 *   - name: memory
 *     description: 记忆系统接口
 */

const express = require('express');
const router = express.Router();
const { memoryStoreService } = require('../services/memoryStore');

// ============ 会话记忆 API ============

/**
 * GET /api/memory/sessions/:sessionId
 * 获取指定会话的所有记忆
 */
router.get('/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const notes = memoryStoreService.getSessionNotes(sessionId);
    res.json({
      success: true,
      data: notes,
      total: notes.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '获取会话记忆失败', details: error.message }
    });
  }
});

/**
 * POST /api/memory/sessions/:sessionId
 * 保存会话记忆
 * Body: { content, type?, importance?, tags?, embedding? }
 */
router.post('/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { content, type = 'short_term', importance = 'medium', tags = [], embedding } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: '记忆内容不能为空' }
      });
    }

    const note = memoryStoreService.createSessionNote(sessionId, {
      content,
      type,
      importance,
      tags,
      embedding
    });

    res.status(201).json({
      success: true,
      data: note
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '保存会话记忆失败', details: error.message }
    });
  }
});

/**
 * PUT /api/memory/sessions/:sessionId
 * 更新会话记忆
 * Body: { noteId, content?, type?, importance?, tags? }
 */
router.put('/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { noteId, content, type, importance, tags } = req.body;

    if (!noteId) {
      return res.status(400).json({
        success: false,
        error: { message: '缺少 noteId 参数' }
      });
    }

    const result = memoryStoreService.updateSessionNote(sessionId, noteId, {
      content,
      type,
      importance,
      tags
    });

    if (!result.success) {
      const statusCode = result.error === 'not_found' ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        error: { message: result.error === 'not_found' ? '记忆不存在' : result.error }
      });
    }

    res.json({
      success: true,
      data: result.note
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '更新会话记忆失败', details: error.message }
    });
  }
});

/**
 * DELETE /api/memory/sessions/:sessionId
 * 清除会话记忆，可指定 noteId 删除单条
 * Query: ?noteId=xxx
 */
router.delete('/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { noteId } = req.query;

    if (noteId) {
      // 删除单条记忆
      const result = memoryStoreService.deleteSessionNote(sessionId, noteId);
      if (!result.success) {
        const statusCode = result.error === 'session_not_found' ? 404 : 404;
        return res.status(statusCode).json({
          success: false,
          error: { message: result.error === 'session_not_found' ? '会话记忆不存在' : '指定记忆不存在' }
        });
      }

      res.json({
        success: true,
        message: '记忆已删除',
        deletedId: noteId
      });
    } else {
      // 清除整个会话的记忆
      memoryStoreService.clearSessionNotes(sessionId);
      res.json({
        success: true,
        message: '会话记忆已全部清除'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '清除会话记忆失败', details: error.message }
    });
  }
});

// ============ 全局记忆 API ============

/**
 * GET /api/memory/global
 * 获取所有全局记忆
 * Query: ?type=xxx&limit=xxx&offset=xxx
 */
router.get('/global', (req, res) => {
  try {
    const { type, limit, offset } = req.query;
    const result = memoryStoreService.getGlobalMemories({ type, limit, offset });

    res.json({
      success: true,
      data: result.data,
      total: result.total,
      offset: result.offset,
      limit: result.limit
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '获取全局记忆失败', details: error.message }
    });
  }
});

/**
 * POST /api/memory/global
 * 创建全局记忆
 * Body: { content, type?, importance?, tags?, userId? }
 */
router.post('/global', (req, res) => {
  try {
    const { content, type = 'general', importance = 'medium', tags = [], userId = 'default' } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: '记忆内容不能为空' }
      });
    }

    const memory = memoryStoreService.createGlobalMemory({
      content,
      type,
      importance,
      tags,
      userId
    });

    res.status(201).json({
      success: true,
      data: memory
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '创建全局记忆失败', details: error.message }
    });
  }
});

/**
 * PUT /api/memory/global/:memoryId
 * 更新全局记忆
 */
router.put('/global/:memoryId', (req, res) => {
  try {
    const { memoryId } = req.params;
    const { content, type, importance, tags } = req.body;

    const result = memoryStoreService.updateGlobalMemory(memoryId, {
      content,
      type,
      importance,
      tags
    });

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: { message: '全局记忆不存在' }
      });
    }

    res.json({
      success: true,
      data: result.memory
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '更新全局记忆失败', details: error.message }
    });
  }
});

/**
 * DELETE /api/memory/global/:memoryId
 * 删除全局记忆
 */
router.delete('/global/:memoryId', (req, res) => {
  try {
    const { memoryId } = req.params;
    const result = memoryStoreService.deleteGlobalMemory(memoryId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: { message: '全局记忆不存在' }
      });
    }

    res.json({
      success: true,
      message: '全局记忆已删除',
      deletedId: memoryId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '删除全局记忆失败', details: error.message }
    });
  }
});

/**
 * POST /api/memory/global/:memoryId/access
 * 更新全局记忆访问时间（增加访问计数）
 */
router.post('/global/:memoryId/access', (req, res) => {
  try {
    const { memoryId } = req.params;
    const result = memoryStoreService.accessGlobalMemory(memoryId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: { message: '全局记忆不存在' }
      });
    }

    res.json({
      success: true,
      data: result.memory
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '更新访问状态失败', details: error.message }
    });
  }
});

/**
 * GET /api/memory/search
 * 搜索全局记忆（简单关键词匹配）
 * Query: ?q=xxx&limit=xxx
 */
router.get('/search', (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: '缺少搜索关键词' }
      });
    }

    const result = memoryStoreService.searchGlobalMemories(q, { limit: Number(limit) });

    res.json({
      success: true,
      data: result.data,
      total: result.total,
      query: result.query
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '搜索记忆失败', details: error.message }
    });
  }
});

// ============ 记忆摘要 API ============

/**
 * GET /api/memory/summaries
 * 获取记忆摘要列表
 * Query: ?sessionId=xxx&limit=xxx
 */
router.get('/summaries', (req, res) => {
  try {
    const { sessionId, limit = 50 } = req.query;
    const summaries = memoryStoreService.getSummaries({ sessionId, limit });

    res.json({
      success: true,
      data: summaries,
      total: summaries.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '获取记忆摘要失败', details: error.message }
    });
  }
});

/**
 * POST /api/memory/summaries
 * 创建记忆摘要
 * Body: { sessionId, content }
 */
router.post('/summaries', (req, res) => {
  try {
    const { sessionId, content } = req.body;

    if (!sessionId || !content) {
      return res.status(400).json({
        success: false,
        error: { message: '缺少 sessionId 或 content' }
      });
    }

    const summary = memoryStoreService.createSummary({ sessionId, content });

    res.status(201).json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '创建记忆摘要失败', details: error.message }
    });
  }
});

/**
 * DELETE /api/memory/summaries/:id
 * 删除记忆摘要
 */
router.delete('/summaries/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = memoryStoreService.deleteSummary(id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: { message: '记忆摘要不存在' }
      });
    }

    res.json({
      success: true,
      message: '记忆摘要已删除',
      deletedId: id
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '删除记忆摘要失败', details: error.message }
    });
  }
});

// ============ 统计 API ============

/**
 * GET /api/memory/stats
 * 获取记忆系统统计信息
 */
router.get('/stats', (req, res) => {
  try {
    const stats = memoryStoreService.getStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '获取统计信息失败', details: error.message }
    });
  }
});

module.exports = router;