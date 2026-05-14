const express = require('express');
const router = express.Router();
const { prisma } = require('../services/database');
const { AgentLogger } = require('../infra/logger/AgentLogger');

const logger = new AgentLogger('memories');

const handle = (fn) => async (req, res, next) => {
  try { await fn(req, res); }
  catch (error) { logger.error('Memory operation failed', { error: error.message, stack: error.stack }); res.status(500).json({ success: false, error: error.message }); }
};

// GET / - 列表
router.get('/', handle(async (req, res) => {
  const { userId = 'default', type, importance, limit = 50, offset = 0 } = req.query;
  const where = { userId };
  if (type) where.type = type;
  if (importance) where.importance = importance;
  const memories = await prisma.globalMemory.findMany({
    where,
    orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
    take: parseInt(limit),
    skip: parseInt(offset),
  });
  res.json({ success: true, data: memories });
}));

// GET /:id - 单个
router.get('/:id', handle(async (req, res) => {
  const memory = await prisma.globalMemory.findUnique({ where: { id: req.params.id } });
  if (!memory) return res.status(404).json({ success: false, error: '记忆不存在' });
  await prisma.globalMemory.update({
    where: { id: req.params.id },
    data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
  });
  res.json({ success: true, data: memory });
}));

// POST / - 创建
router.post('/', handle(async (req, res) => {
  const { userId = 'default', content, type = 'general', importance = 'medium', tags = [] } = req.body;
  const memory = await prisma.globalMemory.create({ data: { userId, content, type, importance, tags } });
  res.status(201).json({ success: true, data: memory });
}));

// POST /batch - 批量创建
router.post('/batch', handle(async (req, res) => {
  const { userId = 'default', memories } = req.body;
  if (!Array.isArray(memories) || memories.length === 0) {
    return res.status(400).json({ success: false, error: '记忆列表不能为空' });
  }
  const created = await prisma.globalMemory.createMany({
    data: memories.map(m => ({
      userId,
      content: m.content,
      type: m.type || 'general',
      importance: m.importance || 'medium',
      tags: m.tags || [],
    })),
  });
  res.status(201).json({ success: true, data: { count: created.count } });
}));

// PUT /:id - 更新
router.put('/:id', handle(async (req, res) => {
  const { content, type, importance, tags } = req.body;
  const memory = await prisma.globalMemory.update({
    where: { id: req.params.id },
    data: { ...(content !== undefined && { content }), ...(type && { type }), ...(importance && { importance }), ...(tags && { tags }) },
  });
  res.json({ success: true, data: memory });
}));

// DELETE /:id - 删除
router.delete('/:id', handle(async (req, res) => {
  await prisma.globalMemory.delete({ where: { id: req.params.id } });
  res.json({ success: true });
}));

// GET /search/query - 搜索
router.get('/search/query', handle(async (req, res) => {
  const { userId = 'default', q, type, limit = 10 } = req.query;
  if (!q) return res.status(400).json({ success: false, error: '搜索关键词不能为空' });
  const memories = await prisma.globalMemory.findMany({
    where: { userId, type: type || undefined, OR: [{ content: { contains: q, mode: 'insensitive' } }, { tags: { has: q } }] },
    orderBy: { importance: 'desc' },
    take: parseInt(limit),
  });
  res.json({ success: true, data: memories });
}));

// GET /stats - 统计
router.get('/stats', handle(async (req, res) => {
  const { userId = 'default' } = req.query;
  const [total, byType, byImportance] = await Promise.all([
    prisma.globalMemory.count({ where: { userId } }),
    prisma.globalMemory.groupBy({ by: ['type'], where: { userId }, _count: true }),
    prisma.globalMemory.groupBy({ by: ['importance'], where: { userId }, _count: true }),
  ]);
  res.json({
    success: true,
    data: {
      total,
      byType: byType.reduce((acc, item) => { acc[item.type] = item._count; return acc; }, {}),
      byImportance: byImportance.reduce((acc, item) => { acc[item.importance] = item._count; return acc; }, {}),
    },
  });
}));

module.exports = router;
