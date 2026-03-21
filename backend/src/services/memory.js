/**
 * 记忆系统
 * 会话记忆存储、检索和上下文压缩
 */

class MemoryService {
  constructor(options = {}) {
    this.maxMessages = options.maxMessages || 100;
    this.maxTokens = options.maxTokens || 4000;
    this.compressionThreshold = options.compressionThreshold || 3000;
    this.sessions = new Map();
  }

  /**
   * 获取或创建会话
   */
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        messages: [],
        metadata: {
          created: Date.now(),
          lastAccess: Date.now(),
          tokenCount: 0
        }
      });
    }
    const session = this.sessions.get(sessionId);
    session.metadata.lastAccess = Date.now();
    return session;
  }

  /**
   * 添加消息到会话
   */
  async addMessage(message, sessionId = 'default') {
    const session = this.getSession(sessionId);

    const msg = {
      role: message.role || 'user',
      content: message.content,
      timestamp: message.timestamp || Date.now(),
      metadata: message.metadata || {}
    };

    session.messages.push(msg);

    // 更新token计数（简单估算）
    session.metadata.tokenCount += this.estimateTokens(msg.content);

    // 检查是否需要压缩
    if (session.metadata.tokenCount > this.compressionThreshold) {
      await this.compress(session);
    }

    // 检查是否超过最大消息数
    if (session.messages.length > this.maxMessages) {
      session.messages = session.messages.slice(-this.maxMessages);
    }

    return msg;
  }

  /**
   * 获取会话消息
   */
  getMessages(sessionId = 'default', limit = null) {
    const session = this.getSession(sessionId);
    const messages = session.messages;

    if (limit) {
      return messages.slice(-limit);
    }
    return messages;
  }

  /**
   * 搜索记忆
   */
  search(query, sessionId = 'default', options = {}) {
    const session = this.getSession(sessionId);
    const { limit = 10, threshold = 0.3 } = options;

    // 简单的关键词匹配搜索
    const results = session.messages
      .map((msg, index) => {
        const content = msg.content.toLowerCase();
        const queryLower = query.toLowerCase();

        // 计算简单相似度
        const queryWords = queryLower.split(/\s+/);
        const matches = queryWords.filter(word =>
          word.length > 1 && content.includes(word)
        ).length;

        const score = matches / queryWords.length;

        return {
          index,
          message: msg,
          score
        };
      })
      .filter(item => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  /**
   * 压缩会话记忆
   */
  async compress(session) {
    // 保留系统提示和最近的消息
    const systemMessages = session.messages.filter(m => m.role === 'system');
    const recentMessages = session.messages.slice(-20);

    // 生成摘要
    const summary = this.generateSummary(session.messages);

    // 重置会话消息
    session.messages = [
      ...systemMessages,
      {
        role: 'system',
        content: `[记忆摘要] ${summary}`,
        timestamp: Date.now(),
        metadata: { type: 'summary', originalCount: session.messages.length }
      },
      ...recentMessages
    ];

    // 重新计算token
    session.metadata.tokenCount = this.estimateTokens(
      session.messages.map(m => m.content).join('\n')
    );

    return {
      compressed: true,
      originalCount: session.messages.length,
      summary
    };
  }

  /**
   * 生成摘要
   */
  generateSummary(messages) {
    const userMessages = messages.filter(m => m.role === 'user');
    const topics = [];

    // 简单提取主题
    const keywords = new Set();
    userMessages.forEach(msg => {
      const words = msg.content.match(/[\u4e00-\u9fa5a-zA-Z]{2,}/g) || [];
      words.forEach(word => {
        if (word.length > 2) keywords.add(word);
      });
    });

    // 取最常见的关键词作为主题
    const wordCount = {};
    keywords.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    const topWords = Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    return `讨论主题: ${topWords.join(', ')}`;
  }

  /**
   * 估算token数量（简单实现）
   */
  estimateTokens(text) {
    // 简单估算：中文约1.5字符/token，英文约4字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 清除会话
   */
  clear(sessionId = 'default') {
    if (sessionId === 'all') {
      this.sessions.clear();
    } else {
      this.sessions.delete(sessionId);
    }
    return true;
  }

  /**
   * 获取会话统计
   */
  getStats(sessionId = 'default') {
    const session = this.getSession(sessionId);
    return {
      messageCount: session.messages.length,
      tokenCount: session.metadata.tokenCount,
      created: session.metadata.created,
      lastAccess: session.metadata.lastAccess
    };
  }

  /**
   * 获取所有会话ID
   */
  listSessions() {
    return Array.from(this.sessions.keys());
  }

  /**
   * 导出会话数据
   */
  export(sessionId = 'default', format = 'json') {
    const session = this.getSession(sessionId);

    if (format === 'json') {
      return JSON.stringify(session.messages, null, 2);
    }

    // Markdown格式
    return session.messages
      .map(msg => `## ${msg.role}\n\n${msg.content}\n`)
      .join('\n');
  }

  /**
   * 导入会话数据
   */
  async import(data, sessionId = 'default', mode = 'merge') {
    const session = this.getSession(sessionId);

    let messages;
    try {
      messages = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (error) {
      throw new Error('无效的数据格式');
    }

    if (mode === 'replace') {
      session.messages = messages;
    } else {
      session.messages = [...session.messages, ...messages];
    }

    // 重新计算token
    session.metadata.tokenCount = this.estimateTokens(
      session.messages.map(m => m.content).join('\n')
    );

    return {
      imported: messages.length,
      total: session.messages.length
    };
  }
}

module.exports = MemoryService;
