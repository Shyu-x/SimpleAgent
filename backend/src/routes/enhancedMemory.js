const express = require('express');
const router = express.Router();
const { memorySystem, MemoryType, MemorySource } = require('../enhancedMemory');

const ok = (res, data) => res.json({ success: true, ...data });
const fail = (res, status, error) => res.status(status).json({ success: false, error });

router.get('/', (_, res) => ok(res, {
  service: 'enhanced-memory', status: 'ok', timestamp: new Date().toISOString(),
  endpoints: {
    initialize: 'POST /api/memory/initialize', add: 'POST /api/memory/add',
    search: 'POST /api/memory/search', session: 'POST /api/memory/session',
    sessionById: 'GET /api/memory/session/:id', addMessage: 'POST /api/memory/session/:id/message',
    setVariable: 'POST /api/memory/session/:id/variable', cleanup: 'POST /api/memory/cleanup',
    stats: 'GET /api/memory/stats', types: 'GET /api/memory/types',
    health: 'GET /api/memory/health', promote: 'POST /api/memory/:id/promote',
    getById: 'GET /api/memory/:id', delete: 'DELETE /api/memory/:id'
  },
  stats: memorySystem.getStats()
}));

router.post('/initialize', async (_, res) => {
  try { await memorySystem.initialize(); ok(res, { stats: memorySystem.getStats() }); }
  catch (error) { fail(res, 500, error.message); }
});

router.post('/add', async (req, res) => {
  const { content, type, source, metadata, importance, sessionId, agentId, tags } = req.body;
  if (!content) return fail(res, 400, 'Missing content');
  try {
    const memory = await memorySystem.addMemory(content, {
      type: type || MemoryType.SHORT_TERM, source: source || MemorySource.USER,
      metadata: metadata || {}, importance: importance || 0.5, sessionId, agentId, tags: tags || []
    });
    ok(res, { memory: memory.toJSON() });
  } catch (error) { fail(res, 500, error.message); }
});

router.post('/search', (req, res) => {
  const { query, threshold, limit, types } = req.body;
  if (!query) return fail(res, 400, 'Missing query');
  try { const results = memorySystem.search(query, { threshold, limit, types }); ok(res, { results, count: results.length }); }
  catch (error) { fail(res, 500, error.message); }
});

router.post('/session', (req, res) => {
  const id = req.body.sessionId || `session_${Date.now()}`;
  ok(res, { session: memorySystem.createSession(id).getContext() });
});

router.get('/session/:id', (req, res) => ok(res, { session: memorySystem.getSession(req.params.id).getContext() }));

router.post('/session/:id/message', (req, res) => {
  const { role, content } = req.body;
  if (!role || !content) return fail(res, 400, 'Missing role or content');
  const session = memorySystem.getSession(req.params.id);
  session.addMessage(role, content);
  ok(res, { messageCount: session.messages.length });
});

router.post('/session/:id/variable', (req, res) => {
  const { key, value } = req.body;
  if (!key) return fail(res, 400, 'Missing key');
  const session = memorySystem.getSession(req.params.id);
  session.setVariable(key, value);
  ok(res, { variables: session.variables });
});

router.post('/cleanup', async (_, res) => { try { ok(res, { cleaned: await memorySystem.cleanupExpired() }); } catch (error) { fail(res, 500, error.message); } });
router.get('/stats', (_, res) => ok(res, { stats: memorySystem.getStats() }));
router.get('/types', (_, res) => ok(res, { types: Object.values(MemoryType), sources: Object.values(MemorySource) }));
router.get('/health', (_, res) => ok(res, { status: 'ok', service: 'enhanced-memory', ...memorySystem.getStats(), timestamp: new Date().toISOString() }));

router.post('/:id/promote', async (req, res) => {
  try {
    const memory = await memorySystem.promoteToLongTerm(req.params.id);
    if (!memory) return fail(res, 404, 'Memory not found');
    ok(res, { memory: memory.toJSON() });
  } catch (error) { fail(res, 500, error.message); }
});

router.get('/:id', (req, res) => {
  const memory = memorySystem.getMemory(req.params.id);
  if (!memory) return fail(res, 404, 'Memory not found');
  ok(res, { memory: memory.toJSON() });
});

router.delete('/:id', async (req, res) => { try { ok(res, { deleted: await memorySystem.deleteMemory(req.params.id) }); } catch (error) { fail(res, 500, error.message); } });

module.exports = router;