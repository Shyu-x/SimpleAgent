/**
 * 记忆系统后端 API
 * 业务逻辑委托给 memoryStoreService，routes 只做参数校验和响应组装
 */

const express = require('express');
const router = express.Router();
const { memoryStoreService } = require('../services/memoryStore');

const ok = (res, data) => res.json({ success: true, ...data });
const created = (res, data) => res.status(201).json({ success: true, ...data });
const fail = (res, status, message) => res.status(status).json({ success: false, error: { message } });

// ========== 会话记忆 API ==========
router.get('/sessions/:sessionId', (req, res) => {
  const notes = memoryStoreService.getSessionNotes(req.params.sessionId);
  ok(res, { data: notes, total: notes.length });
});

router.post('/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { content, type = 'short_term', importance = 'medium', tags = [], embedding } = req.body;
  if (!content || typeof content !== 'string') return fail(res, 400, '记忆内容不能为空');
  const note = memoryStoreService.createSessionNote(sessionId, { content, type, importance, tags, embedding });
  created(res, { data: note });
});

router.put('/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { noteId, content, type, importance, tags } = req.body;
  if (!noteId) return fail(res, 400, '缺少 noteId 参数');
  const result = memoryStoreService.updateSessionNote(sessionId, noteId, { content, type, importance, tags });
  if (!result.success) return fail(res, result.error === 'not_found' ? 404 : 400, result.error === 'not_found' ? '记忆不存在' : result.error);
  ok(res, { data: result.note });
});

router.delete('/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { noteId } = req.query;
  if (noteId) {
    const result = memoryStoreService.deleteSessionNote(sessionId, noteId);
    if (!result.success) return fail(res, 404, result.error === 'session_not_found' ? '会话记忆不存在' : '指定记忆不存在');
    return ok(res, { message: '记忆已删除', deletedId: noteId });
  }
  memoryStoreService.clearSessionNotes(sessionId);
  ok(res, { message: '会话记忆已全部清除' });
});

// ========== 全局记忆 API ==========
router.get('/global', async (req, res) => {
  const { type, limit, offset } = req.query;
  try {
    const result = await memoryStoreService.getGlobalMemories({ type, limit, offset });
    ok(res, { data: result.data, total: result.total, offset: result.offset, limit: result.limit });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.post('/global', (req, res) => {
  const { content, type = 'general', importance = 'medium', tags = [], userId = 'default' } = req.body;
  if (!content || typeof content !== 'string') return fail(res, 400, '记忆内容不能为空');
  const memory = memoryStoreService.createGlobalMemory({ content, type, importance, tags, userId });
  created(res, { data: memory });
});

router.put('/global/:memoryId', (req, res) => {
  const { content, type, importance, tags } = req.body;
  const result = memoryStoreService.updateGlobalMemory(req.params.memoryId, { content, type, importance, tags });
  if (!result.success) return fail(res, 404, '全局记忆不存在');
  ok(res, { data: result.memory });
});

router.delete('/global/:memoryId', (req, res) => {
  const result = memoryStoreService.deleteGlobalMemory(req.params.memoryId);
  if (!result.success) return fail(res, 404, '全局记忆不存在');
  ok(res, { message: '全局记忆已删除', deletedId: req.params.memoryId });
});

router.post('/global/:memoryId/access', (req, res) => {
  const result = memoryStoreService.accessGlobalMemory(req.params.memoryId);
  if (!result.success) return fail(res, 404, '全局记忆不存在');
  ok(res, { data: result.memory });
});

// ========== 批量同步 API (前端 syncToBackend) ==========
router.post('/global/sync', (req, res) => {
  const { memories, timestamp } = req.body;
  if (!memories || !Array.isArray(memories)) return fail(res, 400, '无效的记忆数据');

  const existingIds = new Set(Array.from(memoryStoreService.globalMemories.keys()));
  const synced = [];

  for (const memory of memories) {
    if (memory.id && existingIds.has(memory.id)) {
      // 更新已存在的记忆
      memoryStoreService.updateGlobalMemory(memory.id, {
        content: memory.content,
        type: memory.type,
        importance: memory.importance,
        tags: memory.tags,
      });
    } else if (memory.id) {
      // 创建新记忆（使用前端ID保持一致性）
      const newMemory = {
        id: memory.id,
        userId: memory.userId || 'default',
        content: memory.content,
        type: memory.type || 'general',
        importance: memory.importance || 'medium',
        tags: memory.tags || [],
        createdAt: memory.createdAt || Date.now(),
        updatedAt: Date.now(),
        lastAccessedAt: memory.lastAccessedAt || Date.now(),
        accessCount: memory.accessCount || 0,
      };
      memoryStoreService.globalMemories.set(memory.id, newMemory);
    }
    synced.push(memory.id);
  }

  ok(res, { synced: synced.length, timestamp: Date.now() });
});

// ========== 搜索 API ==========
router.get('/search', async (req, res) => {
  const { q, limit = 10 } = req.query;
  if (!q || typeof q !== 'string') return fail(res, 400, '缺少搜索关键词');
  try {
    const result = await memoryStoreService.searchGlobalMemories(q, { limit: Number(limit) });
    ok(res, { data: result.data, total: result.total, query: result.query });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ========== 记忆摘要 API ==========
router.get('/summaries', (req, res) => {
  const { sessionId, limit = 50 } = req.query;
  const summaries = memoryStoreService.getSummaries({ sessionId, limit });
  ok(res, { data: summaries, total: summaries.length });
});

router.post('/summaries', (req, res) => {
  const { sessionId, content } = req.body;
  if (!sessionId || !content) return fail(res, 400, '缺少 sessionId 或 content');
  const summary = memoryStoreService.createSummary({ sessionId, content });
  created(res, { data: summary });
});

router.delete('/summaries/:id', (req, res) => {
  const result = memoryStoreService.deleteSummary(req.params.id);
  if (!result.success) return fail(res, 404, '记忆摘要不存在');
  ok(res, { message: '记忆摘要已删除', deletedId: req.params.id });
});

// ========== 统计 API ==========
router.get('/stats', (req, res) => ok(res, { data: memoryStoreService.getStats() }));

module.exports = router;
