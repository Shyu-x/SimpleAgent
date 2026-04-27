/**
 * 对话持久化路由
 * 提供对话和消息的 CRUD 操作
 */
const express = require('express');
const router = express.Router();
const { prisma } = require('../services/database');
const { createLogger } = require('../infra/logger/AgentLogger');
const logger = createLogger('conversations');

// ==========================================
// 对话接口
// ==========================================

/**
 * 获取对话列表
 * GET /api/conversations
 */
router.get('/', async (req, res) => {
  try {
    const { userId = 'default', limit = 50, offset = 0 } = req.query;

    const conversations = await prisma.conversation.findMany({
      where: {
        userId,
        isDeleted: false,
      },
      orderBy: { updatedAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      select: {
        id: true,
        title: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true },
        },
      },
    });

    res.json({
      success: true,
      data: conversations.map(c => ({
        id: c.id,
        title: c.title,
        metadata: c.metadata,
        messageCount: c._count.messages,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (error) {
    logger.error('获取对话列表失败:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个对话
 * GET /api/conversations/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { includeMessages = 'true' } = req.query;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: includeMessages === 'true' ? {
        messages: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            model: true,
            provider: true,
            attachments: true,
            metadata: true,
            tokensUsed: true,
            createdAt: true,
          },
        },
      } : undefined,
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: '对话不存在' });
    }

    res.json({ success: true, data: conversation });
  } catch (error) {
    logger.error('获取对话失败:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建对话
 * POST /api/conversations
 */
router.post('/', async (req, res) => {
  try {
    const { userId = 'default', title = '新对话', metadata = {} } = req.body;

    const conversation = await prisma.conversation.create({
      data: {
        userId,
        title,
        metadata,
      },
    });

    res.status(201).json({ success: true, data: conversation });
  } catch (error) {
    logger.error('创建对话失败:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新对话
 * PUT /api/conversations/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, metadata } = req.body;

    const conversation = await prisma.conversation.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(metadata && { metadata }),
      },
    });

    res.json({ success: true, data: conversation });
  } catch (error) {
    logger.error('更新对话失败:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除对话 (软删除)
 * DELETE /api/conversations/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await prisma.conversation.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    res.json({ success: true, data: conversation });
  } catch (error) {
    logger.error('删除对话失败:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 消息接口
// ==========================================

/**
 * 获取对话消息
 * GET /api/conversations/:conversationId/messages
 */
router.get('/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        isDeleted: false,
      },
      orderBy: { createdAt: 'asc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      select: {
        id: true,
        role: true,
        content: true,
        model: true,
        provider: true,
        attachments: true,
        metadata: true,
        tokensUsed: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: messages });
  } catch (error) {
    logger.error('获取消息失败:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 添加消息
 * POST /api/conversations/:conversationId/messages
 */
router.post('/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { role, content, model, provider, attachments, metadata, tokensUsed } = req.body;

    // 验证对话存在
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: '对话不存在' });
    }

    // 创建消息
    const message = await prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        model,
        provider,
        attachments: attachments || [],
        metadata: metadata || {},
        tokensUsed,
      },
    });

    // 更新对话的 updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    logger.error('添加消息失败:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 批量添加消息 (用于导入历史对话)
 * POST /api/conversations/:conversationId/messages/batch
 */
router.post('/:conversationId/messages/batch', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: '消息列表不能为空' });
    }

    // 验证对话存在
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: '对话不存在' });
    }

    // 批量创建消息
    const createdMessages = await prisma.message.createMany({
      data: messages.map(msg => ({
        conversationId,
        role: msg.role,
        content: msg.content,
        model: msg.model,
        provider: msg.provider,
        attachments: msg.attachments || [],
        metadata: msg.metadata || {},
        tokensUsed: msg.tokensUsed,
        createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
      })),
    });

    res.status(201).json({
      success: true,
      data: { count: createdMessages.count },
    });
  } catch (error) {
    logger.error('批量添加消息失败:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新消息
 * PUT /api/conversations/:conversationId/messages/:id
 */
router.put('/:conversationId/messages/:id', async (req, res) => {
  try {
    const { id, conversationId } = req.params;
    const { content, metadata } = req.body;

    const message = await prisma.message.update({
      where: { id },
      data: {
        ...(content && { content }),
        ...(metadata && { metadata }),
      },
    });

    res.json({ success: true, data: message });
  } catch (error) {
    logger.error('更新消息失败:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除消息 (软删除)
 * DELETE /api/conversations/:conversationId/messages/:id
 */
router.delete('/:conversationId/messages/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const message = await prisma.message.update({
      where: { id },
      data: { isDeleted: true },
    });

    res.json({ success: true, data: message });
  } catch (error) {
    logger.error('删除消息失败:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 导出对话 (包含消息)
// ==========================================

/**
 * 导出对话
 * GET /api/conversations/:id/export
 */
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: '对话不存在' });
    }

    res.json({
      success: true,
      data: {
        id: conversation.id,
        title: conversation.title,
        metadata: conversation.metadata,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages: conversation.messages.map(m => ({
          role: m.role,
          content: m.content,
          model: m.model,
          provider: m.provider,
          createdAt: m.createdAt,
        })),
      },
    });
  } catch (error) {
    logger.error('导出对话失败:', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
