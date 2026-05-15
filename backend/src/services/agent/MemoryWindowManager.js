/**
 * 记忆窗口管理器
 * 控制Token使用量、自动摘要压缩、摘要持久化
 * 集成 tiktoken 专业 Token 计数
 */

const fs = require('fs').promises;
const path = require('path');
const { TokenManager, createTokenManager } = require('./TokenManager');
const createLogger = require('../../common/logger');
const logger = createLogger('MemoryWindowManager');

class MemoryWindowManager {
  /**
   * @param {Object} options
   * @param {number} options.windowSize - 保留最近N轮对话（默认20）
   * @param {number} options.maxTokens - 最大Token预算（默认4000）
   * @param {number} options.summaryThreshold - 触发摘要的Token阈值（默认3000）
   * @param {string} options.storageDir - 摘要持久化目录（默认./data/memory_windows）
   * @param {Function} options.summarizeFn - 自定义摘要函数，接收消息数组返回摘要字符串
   * @param {string} options.model - 模型名称（默认 minimax）
   */
  constructor(options = {}) {
    this.windowSize = options.windowSize || 20;
    this.maxTokens = options.maxTokens || 4000;
    this.summaryThreshold = options.summaryThreshold || 3000;
    this.storageDir = options.storageDir || './data/memory_windows';
    this.customSummarizeFn = options.summarizeFn;
    this.model = options.model || 'minimax';

    // 专业 Token 管理器
    this.tokenManager = createTokenManager({
      model: this.model,
      defaultLimit: options.defaultLimit || 100000
    });

    // 会话记忆窗口
    this.windows = new Map();

    // 摘要缓存（sessionId -> summary）
    this.summaries = new Map();

    this.initialized = false;

    logger.info(`初始化完成，模型: ${this.model}, Token预算: ${this.maxTokens}`);
  }

  /**
   * 初始化
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.storageDir, { recursive: true });

      // 加载已持久化的摘要
      const summaryPath = path.join(this.storageDir, 'summaries.json');
      try {
        const data = await fs.readFile(summaryPath, 'utf-8');
        const parsed = JSON.parse(data);
        for (const [sessionId, summary] of Object.entries(parsed)) {
          this.summaries.set(sessionId, summary);
        }
      } catch {}

      this.initialized = true;
      logger.info(`初始化完成，窗口大小: ${this.windowSize}, Token预算: ${this.maxTokens}`);
    } catch (error) {
      logger.error(`初始化失败: ${error.message}`);
    }
  }

  /**
   * 获取或创建会话窗口
   */
  _getWindow(sessionId) {
    if (!this.windows.has(sessionId)) {
      this.windows.set(sessionId, {
        id: sessionId,
        messages: [],
        summary: this.summaries.get(sessionId) || null,
        tokenCount: 0,
        created: Date.now(),
        lastAccess: Date.now()
      });
    }
    const window = this.windows.get(sessionId);
    window.lastAccess = Date.now();
    return window;
  }

  /**
   * 添加消息
   * @param {Object} message - { role, content, ... }
   * @param {string} sessionId
   */
  async addMessage(message, sessionId = 'default') {
    await this.initialize();

    const window = this._getWindow(sessionId);

    const msg = {
      role: message.role || 'user',
      content: message.content,
      timestamp: message.timestamp || Date.now(),
      metadata: message.metadata || {}
    };

    window.messages.push(msg);
    window.tokenCount += this._estimateTokens(msg.content);

    // 超过窗口大小，自动触发摘要
    if (window.messages.length > this.windowSize) {
      await this.summarize(sessionId);
    }

    return msg;
  }

  /**
   * 获取上下文（根据Token预算）
   * @param {number} maxTokens - 最大Token数限制
   * @param {string} sessionId
   * @returns {Array} 消息数组
   */
  getContext(maxTokens, sessionId = 'default') {
    const window = this._getWindow(sessionId);
    const targetTokens = maxTokens || this.maxTokens;

    const context = [];

    // 1. 如果有摘要，优先注入摘要
    if (window.summary) {
      const summaryTokens = this._estimateTokens(window.summary.content);
      if (summaryTokens < targetTokens * 0.3) {
        context.push(window.summary);
      }
    }

    // 2. 从最新消息开始，优先保留最近的
    let tokenBudget = targetTokens - context.reduce((sum, m) => sum + this._estimateTokens(m.content), 0);

    for (let i = window.messages.length - 1; i >= 0 && tokenBudget > 0; i--) {
      const msg = window.messages[i];
      const msgTokens = this._estimateTokens(msg.content);

      if (msgTokens <= tokenBudget) {
        context.unshift(msg);
        tokenBudget -= msgTokens;
      } else {
        break;
      }
    }

    return context;
  }

  /**
   * 是否应该摘要
   * @param {string} sessionId
   * @returns {boolean}
   */
  shouldSummarize(sessionId = 'default') {
    const window = this._getWindow(sessionId);

    // Token超限
    if (window.tokenCount > this.summaryThreshold) {
      return true;
    }

    // 消息数超窗口
    if (window.messages.length > this.windowSize) {
      return true;
    }

    return false;
  }

  /**
   * 执行摘要
   * @param {string} sessionId
   * @returns {Object} 摘要结果
   */
  async summarize(sessionId = 'default') {
    const window = this._getWindow(sessionId);

    if (window.messages.length === 0) {
      return { summarized: false, reason: 'no_messages' };
    }

    // 收集待摘要的消息（窗口外的旧消息）
    const toSummarize = window.messages.slice(0, -this.windowSize);
    const recentMessages = window.messages.slice(-this.windowSize);

    if (toSummarize.length === 0) {
      return { summarized: false, reason: 'no_old_messages' };
    }

    // 生成摘要
    let summaryContent;
    if (this.customSummarizeFn) {
      summaryContent = await this.customSummarizeFn(toSummarize);
    } else {
      summaryContent = this._defaultSummarize(toSummarize);
    }

    const summaryMsg = {
      role: 'system',
      content: `[历史摘要] ${summaryContent}`,
      timestamp: Date.now(),
      metadata: {
        type: 'summary',
        originalCount: toSummarize.length,
        originalTokens: toSummarize.reduce((sum, m) => sum + this._estimateTokens(m.content), 0)
      }
    };

    // 更新窗口：保留摘要和最近消息
    window.messages = [summaryMsg, ...recentMessages];
    window.summary = summaryMsg;
    window.tokenCount = window.messages.reduce((sum, m) => sum + this._estimateTokens(m.content), 0);

    // 持久化摘要
    this.summaries.set(sessionId, summaryMsg);
    await this._persistSummaries();

    logger.info(`会话${sessionId}摘要完成，原始${toSummarize.length}条消息，摘要Token: ${this._estimateTokens(summaryMsg.content)}`);

    return {
      summarized: true,
      originalCount: toSummarize.length,
      summary: summaryMsg,
      remainingMessages: window.messages.length
    };
  }

  /**
   * 默认摘要生成
   */
  _defaultSummarize(messages) {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    // 提取关键主题
    const keywords = new Set();
    const allText = messages.map(m => m.content).join(' ');

    const words = allText.match(/[\u4e00-\u9fa5a-zA-Z]{2,}/g) || [];
    const wordCount = {};
    words.forEach(word => {
      if (word.length > 2) {
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    });

    const topWords = Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);

    // 统计交互轮次
    const rounds = Math.min(userMessages.length, assistantMessages.length);

    const parts = [];
    if (topWords.length > 0) {
      parts.push(`讨论主题: ${topWords.join(', ')}`);
    }
    if (rounds > 0) {
      parts.push(`完成${rounds}轮对话`);
    }
    if (userMessages.length > 0) {
      parts.push(`用户最后问题: ${userMessages[userMessages.length - 1].content.slice(0, 50)}...`);
    }

    return parts.join('；');
  }

  /**
   * 估算Token数量
   */
  _estimateTokens(text) {
    if (!text) return 0;
    return this.tokenManager.count(text);
  }

  _countMessageTokens(messages) {
    if (!messages || messages.length === 0) return 0;
    return this.tokenManager.countMessages(messages);
  }

  /**
   * 持久化摘要
   */
  async _persistSummaries() {
    try {
      const summaryPath = path.join(this.storageDir, 'summaries.json');
      const obj = Object.fromEntries(this.summaries);
      await fs.writeFile(summaryPath, JSON.stringify(obj, null, 2));
    } catch (error) {
      logger.error(`摘要持久化失败: ${error.message}`);
    }
  }

  /**
   * 清除会话
   */
  async clear(sessionId = 'default') {
    if (sessionId === 'all') {
      this.windows.clear();
      this.summaries.clear();
    } else {
      this.windows.delete(sessionId);
      this.summaries.delete(sessionId);
    }
    await this._persistSummaries();
    return true;
  }

  /**
   * 获取会话统计
   */
  getStats(sessionId = 'default') {
    const window = this._getWindow(sessionId);
    return {
      messageCount: window.messages.length,
      tokenCount: window.tokenCount,
      hasSummary: !!window.summary,
      created: window.created,
      lastAccess: window.lastAccess
    };
  }

  /**
   * 获取所有会话ID
   */
  listSessions() {
    return Array.from(this.windows.keys());
  }

  /**
   * 导出会话数据
   */
  export(sessionId = 'default') {
    const window = this._getWindow(sessionId);
    return {
      messages: window.messages,
      summary: window.summary,
      stats: this.getStats(sessionId)
    };
  }

  /**
   * 导入会话数据
   */
  async import(data, sessionId = 'default') {
    await this.initialize();

    const window = this._getWindow(sessionId);

    if (data.messages) {
      window.messages = data.messages;
    }
    if (data.summary) {
      window.summary = data.summary;
      this.summaries.set(sessionId, data.summary);
    }

    window.tokenCount = window.messages.reduce((sum, m) => sum + this._estimateTokens(m.content), 0);

    await this._persistSummaries();

    return {
      imported: data.messages ? data.messages.length : 0,
      total: window.messages.length
    };
  }
}

module.exports = MemoryWindowManager;
