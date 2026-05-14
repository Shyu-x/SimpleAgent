/**
 * Conversation Service - 对话业务逻辑层
 * 处理对话和消息的 CRUD 操作
 */
const { prisma } = require('./database');
const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('conversationService');

// ==========================================
// 对话 (Conversation) 操作
// ==========================================

/**
 * 获取对话列表
 */
async function listConversations({ userId = 'default', limit = 50, offset = 0 }) {
  const conversations = await prisma.conversation.findMany({
    where: { userId, isDeleted: false },
    orderBy: { updatedAt: 'desc' },
    take: parseInt(limit),
    skip: parseInt(offset),
    select: {
      id: true,
      title: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return conversations.map(c => ({
    id: c.id,
    title: c.title,
    metadata: c.metadata,
    messageCount: c._count.messages,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

/**
 * 获取单个对话
 */
async function getConversation(id, { includeMessages = true } = {}) {
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: includeMessages ? {
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
  return conversation;
}

/**
 * 创建对话
 */
async function createConversation({ userId = 'default', title = '新对话', metadata = {} } = {}) {
  return await prisma.conversation.create({
    data: { userId, title, metadata },
  });
}

/**
 * 更新对话
 */
async function updateConversation(id, { title, metadata } = {}) {
  return await prisma.conversation.update({
    where: { id },
    data: {
      ...(title && { title }),
      ...(metadata && { metadata }),
    },
  });
}

/**
 * 删除对话 (软删除)
 */
async function deleteConversation(id) {
  return await prisma.conversation.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

// ==========================================
// 消息 (Message) 操作
// ==========================================

/**
 * 获取对话消息列表
 */
async function listMessages({ conversationId, limit = 100, offset = 0 }) {
  return await prisma.message.findMany({
    where: { conversationId, isDeleted: false },
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
}

/**
 * 添加消息
 */
async function addMessage({ conversationId, role, content, model, provider, attachments, metadata, tokensUsed }) {
  // 验证对话存在
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) {
    return { error: '对话不存在' };
  }

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

  return { data: message };
}

/**
 * 批量添加消息 (用于导入历史对话)
 */
async function addMessagesBatch(conversationId, messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: '消息列表不能为空' };
  }

  // 验证对话存在
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) {
    return { error: '对话不存在' };
  }

  const result = await prisma.message.createMany({
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

  return { data: { count: result.count } };
}

/**
 * 更新消息
 */
async function updateMessage(id, { content, metadata } = {}) {
  return await prisma.message.update({
    where: { id },
    data: {
      ...(content && { content }),
      ...(metadata && { metadata }),
    },
  });
}

/**
 * 删除消息 (软删除)
 */
async function deleteMessage(id) {
  return await prisma.message.update({
    where: { id },
    data: { isDeleted: true },
  });
}

// ==========================================
// 导出与统计
// ==========================================

/**
 * 导出对话 (包含消息)
 */
async function exportConversation(id) {
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
    return { error: '对话不存在' };
  }

  return {
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
  };
}

module.exports = {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  listMessages,
  addMessage,
  addMessagesBatch,
  updateMessage,
  deleteMessage,
  exportConversation,
};