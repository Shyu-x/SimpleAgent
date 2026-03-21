/**
 * 记忆持久化路由
 * 提供全局记忆的 CRUD 操作
 */
const express = require('express');
const router = express.Router();
const { prisma } = require('../services/database');

// ==========================================
// 记忆接口
// ==========================================

/**
 * 获取记忆列表
 * GET /api/memories
 */
router.get('/', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('获取记忆列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个记忆
 * GET /api/memories/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const memory = await prisma.globalMemory.findUnique({
      where: { id },
    });

    if (!memory) {
      return res.status(404).json({ success: false, error: '记忆不存在' });
    }

    // 更新访问计数
    await prisma.globalMemory.update({
      where: { id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    res.json({ success: true, data: memory });
  } catch (error) {
    console.error('获取记忆失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建记忆
 * POST /api/memories
 */
router.post('/', async (req, res) => {
  try {
    const { userId = 'default', content, type = 'general', importance = 'medium', tags = [] } = req.body;

    const memory = await prisma.globalMemory.create({
      data: {
        userId,
        content,
        type,
        importance,
        tags,
      },
    });

    res.status(201).json({ success: true, data: memory });
  } catch (error) {
    console.error('创建记忆失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 批量创建记忆
 * POST /api/memories/batch
 */
router.post('/batch', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('批量创建记忆失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新记忆
 * PUT /api/memories/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, type, importance, tags } = req.body;

    const memory = await prisma.globalMemory.update({
      where: { id },
      data: {
        ...(content !== undefined && { content }),
        ...(type && { type }),
        ...(importance && { importance }),
        ...(tags && { tags }),
      },
    });

    res.json({ success: true, data: memory });
  } catch (error) {
    console.error('更新记忆失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除记忆
 * DELETE /api/memories/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.globalMemory.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('删除记忆失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 搜索记忆
 * GET /api/memories/search
 */
router.get('/search/query', async (req, res) => {
  try {
    const { userId = 'default', q, type, limit = 10 } = req.query;

    if (!q) {
      return res.status(400).json({ success: false, error: '搜索关键词不能为空' });
    }

    const memories = await prisma.globalMemory.findMany({
      where: {
        userId,
        type: type || undefined,
        OR: [
          { content: { contains: q, mode: 'insensitive' } },
          { tags: { has: q } },
        ],
      },
      orderBy: { importance: 'desc' },
      take: parseInt(limit),
    });

    res.json({ success: true, data: memories });
  } catch (error) {
    console.error('搜索记忆失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取记忆统计
 * GET /api/memories/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const { userId = 'default' } = req.query;

    const [total, byType, byImportance] = await Promise.all([
      prisma.globalMemory.count({ where: { userId } }),
      prisma.globalMemory.groupBy({
        by: ['type'],
        where: { userId },
        _count: true,
      }),
      prisma.globalMemory.groupBy({
        by: ['importance'],
        where: { userId },
        _count: true,
      }),
    ]);

    res.json({
      success: true,
      data: {
        total,
        byType: byType.reduce((acc, item) => {
          acc[item.type] = item._count;
          return acc;
        }, {}),
        byImportance: byImportance.reduce((acc, item) => {
          acc[item.importance] = item._count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error('获取记忆统计失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
