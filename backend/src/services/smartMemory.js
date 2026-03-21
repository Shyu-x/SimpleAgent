/**
 * 智能会话记忆系统
 * 支持滑动窗口、自动摘要、上下文管理
 */

class SmartMemory {
  constructor(options = {}) {
    this.maxWindowSize = options.maxWindowSize || 10;  // 滑动窗口大小
    this.summaryThreshold = options.summaryThreshold || 20; // 触发摘要的消息数
    this.sessions = new Map(); // 会话存储
  }

  // 获取会话记忆
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        messages: [],
        summary: null,
        createdAt: Date.now(),
        lastActiveAt: Date.now()
      });
    }
    return this.sessions.get(sessionId);
  }

  // 添加消息到记忆
  addMessage(sessionId, message) {
    const session = this.getSession(sessionId);
    session.messages.push({
      ...message,
      timestamp: Date.now()
    });
    session.lastActiveAt = Date.now();

    // 滑动窗口裁剪
    if (session.messages.length > this.maxWindowSize * 2) {
      this.compress(sessionId);
    }

    return session;
  }

  // 获取上下文消息
  getContext(sessionId, maxMessages = null) {
    const session = this.getSession(sessionId);
    const limit = maxMessages || this.maxWindowSize;

    const context = [];
    if (session.summary) {
      context.push({ role: 'system', content: `[会话摘要] ${session.summary}` });
    }

    const recent = session.messages.slice(-limit);
    context.push(...recent);

    return context;
  }

  // 压缩会话（触发摘要）
  async compress(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.messages.length < this.summaryThreshold) return;

    // 简单摘要：提取关键信息
    // 实际生产中应调用LLM进行摘要
    const keyPoints = this.extractKeyPoints(session.messages);

    session.summary = keyPoints.join('; ');
    session.messages = session.messages.slice(-this.maxWindowSize);
  }

  // 提取关键点
  extractKeyPoints(messages) {
    const points = [];
    const seen = new Set();

    for (const msg of messages.slice(-10)) {
      if (msg.role === 'user') {
        // 提取关键词作为关键点
        const content = msg.content;
        const words = content.split(/[,，。.]/).filter(w => w.length > 5);
        if (words.length > 0 && !seen.has(words[0])) {
          points.push(words[0].trim());
          seen.add(words[0]);
        }
      }
    }

    return points.slice(0, 5);
  }

  // 清除会话
  clearSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  // 获取会话统计
  getStats(sessionId) {
    const session = this.getSession(sessionId);
    return {
      messageCount: session.messages.length,
      hasSummary: !!session.summary,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt
    };
  }
}

module.exports = { SmartMemory };
