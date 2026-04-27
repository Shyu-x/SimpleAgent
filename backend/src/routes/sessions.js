const express = require('express');
const router = express.Router();

// 内存会话存储 - 独立的会话管理
let sessions = [];

// 生成唯一ID
function generateId() {
  return 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// 输入验证辅助函数
function validateSessionInput(title, messages) {
  const errors = [];

  if (title !== undefined && typeof title !== 'string') {
    errors.push('title must be a string');
  }
  if (title !== undefined && title.length > 200) {
    errors.push('title must be less than 200 characters');
  }

  if (messages !== undefined && !Array.isArray(messages)) {
    errors.push('messages must be an array');
  }
  if (messages !== undefined && messages.length > 1000) {
    errors.push('messages array too large (max 1000)');
  }

  return errors;
}

function validateMessageInput(role, content) {
  const errors = [];

  if (!role) {
    errors.push('role is required');
  } else if (!['user', 'assistant', 'system'].includes(role)) {
    errors.push('role must be user, assistant, or system');
  }

  if (!content) {
    errors.push('content is required');
  } else if (typeof content !== 'string') {
    errors.push('content must be a string');
  } else if (content.length > 100000) {
    errors.push('content too large (max 100000 characters)');
  }

  return errors;
}

// 获取所有会话
router.get('/', (req, res) => {
  // 返回会话列表（不含消息内容）
  const sessionList = sessions.map(s => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    messageCount: s.messages.length
  }));

  // 按更新时间倒序
  sessionList.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  res.json(sessionList);
});

// 获取指定会话
router.get('/:id', (req, res) => {
  const session = sessions.find(s => s.id === req.params.id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(session);
});

// 创建新会话
router.post('/', (req, res) => {
  const { title, messages } = req.body;

  // 输入验证
  const errors = validateSessionInput(title, messages);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

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

// 更新会话
router.put('/:id', (req, res) => {
  const sessionIndex = sessions.findIndex(s => s.id === req.params.id);

  if (sessionIndex === -1) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const { title, messages } = req.body;

  // 输入验证
  const errors = validateSessionInput(title, messages);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  if (title) {
    sessions[sessionIndex].title = String(title).substring(0, 200);
  }

  if (messages) {
    sessions[sessionIndex].messages = messages;
  }

  sessions[sessionIndex].updatedAt = new Date().toISOString();

  res.json(sessions[sessionIndex]);
});

// 添加消息到会话
router.post('/:id/messages', (req, res) => {
  const session = sessions.find(s => s.id === req.params.id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const { role, content } = req.body;

  // 输入验证
  const errors = validateMessageInput(role, content);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const message = {
    role,
    content: String(content).substring(0, 100000),
    timestamp: new Date().toISOString()
  };

  session.messages.push(message);
  session.updatedAt = new Date().toISOString();

  // 如果是第一条消息，更新会话标题
  if (session.messages.length === 1 && role === 'user') {
    session.title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
  }

  res.json(message);
});

// 删除会话
router.delete('/:id', (req, res) => {
  const sessionIndex = sessions.findIndex(s => s.id === req.params.id);

  if (sessionIndex === -1) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const deleted = sessions.splice(sessionIndex, 1)[0];
  res.json({ success: true, deleted });
});

// 清除所有会话
router.delete('/', (req, res) => {
  sessions.length = 0;
  res.json({ success: true, message: 'All sessions cleared' });
});

module.exports = router;
