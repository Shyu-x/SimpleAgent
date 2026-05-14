/**
 * 对话持久化路由
 * 委托业务逻辑给 conversationService
 */
const express = require('express');
const router = express.Router();
const conversationService = require('../services/conversationService');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/conversations
router.get('/', asyncHandler(async (req, res) => {
  const { userId = 'default', limit = 50, offset = 0 } = req.query;
  res.json({ success: true, data: await conversationService.listConversations({ userId, limit, offset }) });
}));

// GET /api/conversations/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { includeMessages = 'true' } = req.query;
  const data = await conversationService.getConversation(req.params.id, { includeMessages: includeMessages === 'true' });
  if (!data) return res.status(404).json({ success: false, error: '对话不存在' });
  res.json({ success: true, data });
}));

// POST /api/conversations
router.post('/', asyncHandler(async (req, res) => {
  const { userId = 'default', title = '新对话', metadata = {} } = req.body;
  const data = await conversationService.createConversation({ userId, title, metadata });
  res.status(201).json({ success: true, data });
}));

// PUT /api/conversations/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const { title, metadata } = req.body;
  res.json({ success: true, data: await conversationService.updateConversation(req.params.id, { title, metadata }) });
}));

// DELETE /api/conversations/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await conversationService.deleteConversation(req.params.id) });
}));

// GET /api/conversations/:conversationId/messages
router.get('/:conversationId/messages', asyncHandler(async (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  res.json({ success: true, data: await conversationService.listMessages({ conversationId: req.params.conversationId, limit, offset }) });
}));

// POST /api/conversations/:conversationId/messages
router.post('/:conversationId/messages', asyncHandler(async (req, res) => {
  const { role, content, model, provider, attachments, metadata, tokensUsed } = req.body;
  const result = await conversationService.addMessage({ conversationId: req.params.conversationId, role, content, model, provider, attachments, metadata, tokensUsed });
  if (result.error) return res.status(404).json({ success: false, error: result.error });
  res.status(201).json({ success: true, data: result.data });
}));

// POST /api/conversations/:conversationId/messages/batch
router.post('/:conversationId/messages/batch', asyncHandler(async (req, res) => {
  const { messages } = req.body;
  const result = await conversationService.addMessagesBatch(req.params.conversationId, messages);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  res.status(201).json({ success: true, data: { count: result.data.count } });
}));

// PUT /api/conversations/:conversationId/messages/:id
router.put('/:conversationId/messages/:id', asyncHandler(async (req, res) => {
  const { content, metadata } = req.body;
  res.json({ success: true, data: await conversationService.updateMessage(req.params.id, { content, metadata }) });
}));

// DELETE /api/conversations/:conversationId/messages/:id
router.delete('/:conversationId/messages/:id', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await conversationService.deleteMessage(req.params.id) });
}));

// GET /api/conversations/:id/export
router.get('/:id/export', asyncHandler(async (req, res) => {
  const result = await conversationService.exportConversation(req.params.id);
  if (result.error) return res.status(404).json({ success: false, error: result.error });
  res.json({ success: true, data: result.data });
}));

module.exports = router;
