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

// 内存存储（生产环境应使用数据库）
const sessionMemories = new Map(); // key: sessionId, value: Note[]
const globalMemories = new Map();  // key: memoryId, value: GlobalMemory
const memorySummaries = new Map(); // key: summaryId, value: Summary

/**
 * 记忆数据结构
 * @typedef {Object} Note
 * @property {string} id
 * @property {string} sessionId
 * @property {string} content
 * @property {'short_term'|'long_term'|'semantic'} [type]
 * @property {'low'|'medium'|'high'} [importance]
 * @property {string[]} [tags]
 * @property {number[]} [embedding]
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} GlobalMemory
 * @property {string} id
 * @property {string} userId
 * @property {string} content
 * @property {'user_pref'|'context'|'knowledge'|'task'|'general'} type
 * @property {'low'|'medium'|'high'} importance
 * @property {string[]} tags
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number} lastAccessedAt
 * @property {number} accessCount
 */

/**
 * @typedef {Object} MemorySummary
 * @property {string} id
 * @property {string} sessionId
 * @property {string} content
 * @property {number} createdAt
 */

// ============ 会话记忆 API ============

/**
 * GET /api/memory/sessions/:sessionId
 * 获取指定会话的所有记忆
 */
router.get('/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const notes = sessionMemories.get(sessionId) || [];
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

    const notes = sessionMemories.get(sessionId) || [];

    const note = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      content,
      type,
      importance,
      tags,
      embedding,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    notes.push(note);
    sessionMemories.set(sessionId, notes);

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

    const notes = sessionMemories.get(sessionId) || [];
    const noteIndex = notes.findIndex(n => n.id === noteId);

    if (noteIndex === -1) {
      return res.status(404).json({
        success: false,
        error: { message: '记忆不存在' }
      });
    }

    const updatedNote = {
      ...notes[noteIndex],
      updatedAt: Date.now()
    };

    if (content !== undefined) updatedNote.content = content;
    if (type !== undefined) updatedNote.type = type;
    if (importance !== undefined) updatedNote.importance = importance;
    if (tags !== undefined) updatedNote.tags = tags;

    notes[noteIndex] = updatedNote;
    sessionMemories.set(sessionId, notes);

    res.json({
      success: true,
      data: updatedNote
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

    if (!sessionMemories.has(sessionId)) {
      return res.status(404).json({
        success: false,
        error: { message: '会话记忆不存在' }
      });
    }

    if (noteId) {
      // 删除单条记忆
      const notes = sessionMemories.get(sessionId);
      const filtered = notes.filter(n => n.id !== noteId);

      if (filtered.length === notes.length) {
        return res.status(404).json({
          success: false,
          error: { message: '指定记忆不存在' }
        });
      }

      sessionMemories.set(sessionId, filtered);
      res.json({
        success: true,
        message: '记忆已删除',
        deletedId: noteId
      });
    } else {
      // 清除整个会话的记忆
      sessionMemories.delete(sessionId);
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
    const { type, limit, offset = 0 } = req.query;
    let memories = Array.from(globalMemories.values());

    if (type) {
      memories = memories.filter(m => m.type === type);
    }

    // 按访问时间和重要性排序
    memories.sort((a, b) => {
      const importanceOrder = { high: 0, medium: 1, low: 2 };
      const impDiff = importanceOrder[a.importance] - importanceOrder[b.importance];
      if (impDiff !== 0) return impDiff;
      return b.accessCount - a.accessCount;
    });

    const total = memories.length;
    const limited = limit ? memories.slice(Number(offset), Number(offset) + Number(limit)) : memories;

    res.json({
      success: true,
      data: limited,
      total,
      offset: Number(offset),
      limit: Number(limit) || total
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

    const memory = {
      id: `gm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      content,
      type,
      importance,
      tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0
    };

    globalMemories.set(memory.id, memory);

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

    const memory = globalMemories.get(memoryId);
    if (!memory) {
      return res.status(404).json({
        success: false,
        error: { message: '全局记忆不存在' }
      });
    }

    const updated = {
      ...memory,
      updatedAt: Date.now()
    };

    if (content !== undefined) updated.content = content;
    if (type !== undefined) updated.type = type;
    if (importance !== undefined) updated.importance = importance;
    if (tags !== undefined) updated.tags = tags;

    globalMemories.set(memoryId, updated);

    res.json({
      success: true,
      data: updated
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

    if (!globalMemories.has(memoryId)) {
      return res.status(404).json({
        success: false,
        error: { message: '全局记忆不存在' }
      });
    }

    globalMemories.delete(memoryId);

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

    const memory = globalMemories.get(memoryId);
    if (!memory) {
      return res.status(404).json({
        success: false,
        error: { message: '全局记忆不存在' }
      });
    }

    memory.lastAccessedAt = Date.now();
    memory.accessCount += 1;
    globalMemories.set(memoryId, memory);

    res.json({
      success: true,
      data: memory
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

    const queryLower = q.toLowerCase();
    const memories = Array.from(globalMemories.values())
      .filter(m =>
        m.content.toLowerCase().includes(queryLower) ||
        m.tags.some(tag => tag.toLowerCase().includes(queryLower))
      )
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, Number(limit));

    // 更新访问计数
    memories.forEach(m => {
      m.lastAccessedAt = Date.now();
      m.accessCount += 1;
      globalMemories.set(m.id, m);
    });

    res.json({
      success: true,
      data: memories,
      total: memories.length,
      query: q
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
    let summaries = Array.from(memorySummaries.values());

    if (sessionId) {
      summaries = summaries.filter(s => s.sessionId === sessionId);
    }

    summaries.sort((a, b) => b.createdAt - a.createdAt);
    const limited = summaries.slice(0, Number(limit));

    res.json({
      success: true,
      data: limited,
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

    const summary = {
      id: `sum_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      content,
      createdAt: Date.now()
    };

    memorySummaries.set(summary.id, summary);

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

    if (!memorySummaries.has(id)) {
      return res.status(404).json({
        success: false,
        error: { message: '记忆摘要不存在' }
      });
    }

    memorySummaries.delete(id);

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
    const sessionCount = sessionMemories.size;
    const totalSessionNotes = Array.from(sessionMemories.values()).reduce((sum, notes) => sum + notes.length, 0);
    const globalCount = globalMemories.size;
    const summaryCount = memorySummaries.size;

    // 按类型统计全局记忆
    const byType = {};
    globalMemories.values().forEach(m => {
      byType[m.type] = (byType[m.type] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        sessionCount,
        totalSessionNotes,
        globalMemoryCount: globalCount,
        summaryCount,
        byType
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: '获取统计信息失败', details: error.message }
    });
  }
});

module.exports = router;
