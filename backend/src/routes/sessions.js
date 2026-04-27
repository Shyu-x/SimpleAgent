const express = require('express');
const router = express.Router();
let sessions = [];

const generateId = () => 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

const validate = {
  session: (title, messages) => {
    const errors = [];
    if (title !== undefined && (typeof title !== 'string' || title.length > 200)) errors.push('title must be string ≤200');
    if (messages !== undefined && (!Array.isArray(messages) || messages.length > 1000)) errors.push('messages must be array ≤1000');
    return errors;
  },
  message: (role, content) => {
    const errors = [];
    if (!role || !['user', 'assistant', 'system'].includes(role)) errors.push('role required: user|assistant|system');
    if (!content || typeof content !== 'string' || content.length > 100000) errors.push('content required: string ≤100000');
    return errors;
  }
};

// GET / - 列表(不含消息)
router.get('/', (req, res) => {
  const list = sessions.map(s => ({
    id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt, messageCount: s.messages.length
  })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(list);
});

// GET /:id - 单个
router.get('/:id', (req, res) => {
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// POST / - 创建
router.post('/', (req, res) => {
  const { title, messages } = req.body;
  const errors = validate.session(title, messages);
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
  const newSession = {
    id: generateId(),
    title: title ? String(title).substring(0, 200) : '新对话',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: messages || []
  };
  sessions.unshift(newSession);
  res.status(201).json(newSession);
});

// PUT /:id - 更新
router.put('/:id', (req, res) => {
  const idx = sessions.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Session not found' });
  const { title, messages } = req.body;
  const errors = validate.session(title, messages);
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
  if (title) sessions[idx].title = String(title).substring(0, 200);
  if (messages) sessions[idx].messages = messages;
  sessions[idx].updatedAt = new Date().toISOString();
  res.json(sessions[idx]);
});

// POST /:id/messages - 添加消息
router.post('/:id/messages', (req, res) => {
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { role, content } = req.body;
  const errors = validate.message(role, content);
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
  const message = { role, content: String(content).substring(0, 100000), timestamp: new Date().toISOString() };
  session.messages.push(message);
  session.updatedAt = new Date().toISOString();
  if (session.messages.length === 1 && role === 'user') {
    session.title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
  }
  res.json(message);
});

// DELETE /:id - 删除
router.delete('/:id', (req, res) => {
  const idx = sessions.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Session not found' });
  res.json({ success: true, deleted: sessions.splice(idx, 1)[0] });
});

// DELETE / - 清除全部
router.delete('/', (req, res) => {
  sessions.length = 0;
  res.json({ success: true, message: 'All sessions cleared' });
});

module.exports = router;
