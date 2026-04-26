/**
 * 记忆系统
 * 会话记忆存储、检索和上下文压缩
 *
 * 特性：
 * - 智能 Token 控制（双维度判断）
 * - 保留关键信息的压缩策略
 * - 渐进式压缩机制
 * - 对话轮次与 Token 双重监控
 */

class MemoryService {
  constructor(options = {}) {
    this.maxMessages = options.maxMessages || 100;
    this.maxTokens = options.maxTokens || 4000;
    this.compressionThreshold = options.compressionThreshold || 3000;
    // 压缩阈值（双维度）
    this.compressionRatio = options.compressionRatio || 0.8;
    // 保留最近 N 轮完整对话
    this.preserveRecentRounds = options.preserveRecentRounds || 10;
    // 中间消息压缩保留比例
    this.intermediateCompressionRatio = options.intermediateCompressionRatio || 0.3;
    this.sessions = new Map();
  }

  /**
   * 判断是否需要压缩（双维度判断）
   * @param {Object} session - 会话对象
   * @returns {Object} { should: boolean, reason: string, details: Object }
   */
  shouldCompress(session) {
    const tokenRatio = session.metadata.tokenCount / this.maxTokens;
    const messageRatio = session.messages.length / this.maxMessages;

    const details = {
      tokenRatio: tokenRatio.toFixed(3),
      messageRatio: messageRatio.toFixed(3),
      tokenCount: session.metadata.tokenCount,
      maxTokens: this.maxTokens,
      messageCount: session.messages.length,
      maxMessages: this.maxMessages
    };

    // Token 超限优先
    if (tokenRatio > this.compressionRatio) {
      return {
        should: true,
        reason: 'token_exceed',
        details: { ...details, triggerRatio: tokenRatio.toFixed(3), triggerThreshold: this.compressionRatio }
      };
    }

    // 消息数超限
    if (messageRatio > this.compressionRatio) {
      return {
        should: true,
        reason: 'message_exceed',
        details: { ...details, triggerRatio: messageRatio.toFixed(3), triggerThreshold: this.compressionRatio }
      };
    }

    // 双重预警（任一达到 60%）
    const warningThreshold = 0.6;
    if (tokenRatio > warningThreshold || messageRatio > warningThreshold) {
      return {
        should: true,
        reason: 'warning',
        details: { ...details, triggerRatio: `${tokenRatio.toFixed(3)}/${messageRatio.toFixed(3)}`, triggerThreshold: warningThreshold }
      };
    }

    return {
      should: false,
      reason: 'normal',
      details
    };
  }

  /**
   * 估算 token 数量（改进版 - 更精确）
   * @param {string} text - 文本
   * @returns {number} token 数量
   */
  estimateTokens(text) {
    if (!text) return 0;
    // 中文约 1.5 字符/token，英文约 4 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
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

    // 更新 token 计数
    session.metadata.tokenCount += this.estimateTokens(msg.content);

    // 使用双维度压缩判断
    const compressCheck = this.shouldCompress(session);
    if (compressCheck.should) {
      await this.compress(session);
    }

    // 硬性限制：消息数超限时强制裁剪
    if (session.messages.length > this.maxMessages) {
      const excess = session.messages.length - this.maxMessages;
      session.messages = session.messages.slice(excess);
      // 重新计算 token
      session.metadata.tokenCount = this.estimateTokens(
        session.messages.map(m => m.content).join('\n')
      );
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
   * 智能压缩会话记忆
   * 保留策略：
   * 1. 系统提示（完整保留）
   * 2. 最近 N 轮对话（完整保留）
   * 3. 中间轮次（压缩为摘要，保留关键实体）
   * 4. 关键实体和意图（标记保留）
   */
  async compress(session) {
    const originalCount = session.messages.length;
    const originalTokenCount = session.metadata.tokenCount;

    // 分离消息类型
    const systemMessages = session.messages.filter(m => m.role === 'system');
    const userMessages = session.messages.filter(m => m.role === 'user');
    const assistantMessages = session.messages.filter(m => m.role === 'assistant');

    // 计算中间消息（需要压缩的部分）
    // 保留最近 N 轮完整对话（用户+助手配对）
    const recentRoundsCount = this.preserveRecentRounds;
    const totalRounds = Math.min(userMessages.length, assistantMessages.length);
    const recentRoundsStart = Math.max(0, totalRounds - recentRoundsCount);

    // 构建新的消息列表
    const preservedMessages = [];
    const compressedMessages = [];

    // 1. 保留系统提示
    preservedMessages.push(...systemMessages);

    // 2. 早期对话压缩为摘要
    if (recentRoundsStart > 0) {
      const earlyMessages = session.messages.slice(0, recentRoundsStart * 2);
      const earlySummary = this.generateSummary(earlyMessages, {
        mode: 'early',
        preserveEntities: true
      });
      compressedMessages.push({
        role: 'system',
        content: `[早期对话摘要] ${earlySummary}`,
        timestamp: earlyMessages[earlyMessages.length - 1]?.timestamp || Date.now(),
        metadata: {
          type: 'early_summary',
          originalCount: earlyMessages.length,
          tokenSavings: this.estimateTokens(earlyMessages.map(m => m.content).join('\n')) - this.estimateTokens(earlySummary)
        }
      });
    }

    // 3. 保留最近 N 轮完整对话
    const recentMessages = session.messages.slice(-recentRoundsCount * 2);
    preservedMessages.push(...recentMessages);

    // 生成完整对话摘要（用于上下文补充）
    const fullSummary = this.generateSummary(session.messages, {
      mode: 'full',
      preserveKeyInfo: true
    });

    // 4. 添加完整摘要消息
    preservedMessages.push({
      role: 'system',
      content: `[记忆摘要] ${fullSummary}`,
      timestamp: Date.now(),
      metadata: {
        type: 'summary',
        originalCount,
        tokenSavings: originalTokenCount - this.estimateTokens(fullSummary)
      }
    });

    // 更新会话
    session.messages = [...preservedMessages, ...compressedMessages];

    // 重新计算 token
    session.metadata.tokenCount = this.estimateTokens(
      session.messages.map(m => m.content).join('\n')
    );

    // 记录压缩统计
    const compressedCount = originalCount - session.messages.length;
    const tokenSavings = originalTokenCount - session.metadata.tokenCount;

    return {
      compressed: true,
      originalCount,
      compressedCount,
      remainingCount: session.messages.length,
      originalTokenCount,
      remainingTokenCount: session.metadata.tokenCount,
      tokenSavings,
      summary: fullSummary
    };
  }

  /**
   * 渐进式压缩（多次小规模压缩）
   * @param {Object} session - 会话对象
   * @param {number} targetTokens - 目标 token 数量
   */
  async progressiveCompress(session, targetTokens = null) {
    const target = targetTokens || Math.floor(this.maxTokens * 0.6);
    let iterations = 0;
    const maxIterations = 5;

    while (session.metadata.tokenCount > target && iterations < maxIterations) {
      const result = await this.compress(session);
      if (!result.compressed) break;
      iterations++;
    }

    return {
      iterations,
      finalTokenCount: session.metadata.tokenCount,
      targetReached: session.metadata.tokenCount <= target
    };
  }

  /**
   * 生成摘要（改进版 - 支持多种模式）
   * @param {Array} messages - 消息列表
   * @param {Object} options - 选项
   * @param {Function} options.llmSummaryFn - LLM摘要函数（可选）
   * @param {string} options.mode - 摘要模式: 'full'(默认), 'early', 'concise'
   * @param {boolean} options.preserveEntities - 是否保留关键实体
   * @param {boolean} options.preserveKeyInfo - 是否保留关键信息
   * @returns {string} 摘要
   */
  generateSummary(messages, options = {}) {
    const { llmSummaryFn, mode = 'full', preserveEntities = false, preserveKeyInfo = false } = options;

    // 如果有LLM摘要函数，使用语义摘要
    if (llmSummaryFn && typeof llmSummaryFn === 'function') {
      try {
        const summaryPrompt = this._buildSummaryPrompt(messages, options);
        return llmSummaryFn(summaryPrompt);
      } catch (error) {
        console.warn('LLM摘要失败，回退到规则摘要:', error.message);
      }
    }

    // 根据模式选择摘要策略
    switch (mode) {
      case 'early':
        return this._generateEarlySummary(messages, { preserveEntities });
      case 'concise':
        return this._generateConciseSummary(messages);
      case 'full':
      default:
        return this._generateFullSummary(messages, { preserveKeyInfo });
    }
  }

  /**
   * 构建摘要提示
   * @param {Array} messages - 消息列表
   * @param {Object} options - 选项
   */
  _buildSummaryPrompt(messages, options = {}) {
    const { preserveKeyInfo = true } = options;
    const conversation = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    let infoReq = `
1. 主要讨论话题
2. 用户的关键问题或需求
3. 重要的结论或答案`;

    if (preserveKeyInfo) {
      infoReq += `
4. 关键实体和术语
5. 未解决的问题`;
    }

    return `请简要总结以下对话的核心内容，包括：
${infoReq}

对话内容：
${conversation}

请用简洁的中文概括（不超过100字）。`;
  }

  /**
   * 早期对话摘要（更简洁）
   */
  _generateEarlySummary(messages, options = {}) {
    const { preserveEntities = true } = options;
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    if (userMessages.length === 0) {
      return '对话开始';
    }

    // 提取关键意图
    const intents = this._analyzeIntents(messages);
    const mainIntent = intents.length > 0 ? intents[0] : null;

    // 提取关键问题
    const keyQuestions = this._extractKeyEntities(messages);

    // 构建简洁摘要
    const parts = [];

    if (mainIntent) {
      parts.push(`话题: ${mainIntent}`);
    }

    if (keyQuestions.length > 0 && preserveEntities) {
      parts.push(`问题: ${keyQuestions[0].slice(0, 30)}`);
    }

    // 统计对话轮数
    parts.push(`(${userMessages.length}轮对话)`);

    return parts.join(' | ') || '早期对话';
  }

  /**
   * 完整摘要（包含更多信息）
   */
  _generateFullSummary(messages, options = {}) {
    const { preserveKeyInfo = false } = options;
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    if (userMessages.length === 0) {
      return '对话开始';
    }

    // 1. 分析意图
    const intents = this._analyzeIntents(messages);

    // 2. 提取关键词
    const importantWords = this._extractImportantWords(messages, 5);

    // 3. 提取关键实体
    const keyEntities = preserveKeyInfo ? this._extractKeyEntities(messages) : [];

    // 4. 提取待处理任务
    const pendingTasks = this._extractPendingTasks(userMessages);

    // 组合摘要
    const parts = [];

    if (intents.length > 0) {
      parts.push(`主要话题: ${intents.join(', ')}`);
    }

    if (importantWords.length > 0) {
      parts.push(`关键词: ${importantWords.join(', ')}`);
    }

    if (keyEntities.length > 0) {
      parts.push(`核心: ${keyEntities.slice(0, 2).join('; ')}`);
    }

    if (pendingTasks.length > 0) {
      parts.push(`待处理: ${pendingTasks.join(', ')}`);
    }

    // 如果太短，使用关键词方法
    if (parts.length === 0 || parts.join('').length < 20) {
      return this._generateConciseSummary(messages);
    }

    return parts.join(' | ');
  }

  /**
   * 简洁摘要
   */
  _generateConciseSummary(messages) {
    const userMessages = messages.filter(m => m.role === 'user');
    const keywords = new Set();

    userMessages.forEach(msg => {
      const words = msg.content.match(/[\u4e00-\u9fa5a-zA-Z]{2,}/g) || [];
      words.forEach(word => {
        if (word.length > 2) keywords.add(word);
      });
    });

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
   * 分析对话意图
   */
  _analyzeIntents(messages) {
    const intentPatterns = {
      '代码开发': ['代码', '函数', '实现', '编程', 'bug', 'error', 'code', 'function', 'class', '变量'],
      '问题解答': ['为什么', '是什么', '如何', '怎么', '区别', '解释', '原理', '请问'],
      '搜索查询': ['搜索', '查找', '找', '查询', 'search', 'find', '搜索一下'],
      '文件操作': ['文件', '读取', '写入', '删除', 'file', 'read', 'write', 'open'],
      '数据分析': ['分析', '统计', '计算', '数据', 'analyze', 'data', '对比'],
      '知识问答': ['知识', '概念', '定义', '介绍', '什么是', 'define', '解释一下'],
      '任务执行': ['完成', '执行', '做', '帮我', '开始', '进行']
    };

    const intentCounts = {};
    for (const [intent, keywords] of Object.entries(intentPatterns)) {
      let count = 0;
      for (const msg of messages) {
        const content = msg.content.toLowerCase();
        for (const keyword of keywords) {
          if (content.includes(keyword.toLowerCase())) {
            count++;
          }
        }
      }
      if (count > 0) {
        intentCounts[intent] = count;
      }
    }

    return Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([intent]) => intent);
  }

  /**
   * 提取关键实体
   */
  _extractKeyEntities(messages) {
    const entities = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        const content = msg.content.trim();
        // 提取短问句
        if (content.length < 100 && (
          content.includes('?') || content.includes('？') ||
          content.startsWith('如何') || content.startsWith('怎么') ||
          content.startsWith('为什么') || content.startsWith('是什么') ||
          content.startsWith('请问')
        )) {
          entities.push(content.slice(0, 50));
        }
      }
    }

    return entities;
  }

  /**
   * 提取重要词汇
   * @param {Array} messages - 消息列表
   * @param {number} limit - 返回数量限制
   */
  _extractImportantWords(messages, limit = 5) {
    const stopWords = new Set([
      '这个', '那个', '什么', '怎么', '如何', '为什么', '可以', '不是', '一个',
      '的', '了', '是', '我', '你', '他', '她', '它', '们', '的', '地', '得',
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
      '请', '帮', '一下', '帮我', '想问', '想知', '知道'
    ]);

    const wordCount = {};
    let totalWords = 0;

    for (const msg of messages) {
      const words = msg.content.match(/[\u4e00-\u9fa5a-zA-Z]{3,}/g) || [];
      for (const word of words) {
        const lower = word.toLowerCase();
        if (!stopWords.has(lower) && word.length >= 3) {
          wordCount[lower] = (wordCount[lower] || 0) + 1;
          totalWords++;
        }
      }
    }

    // 计算 TF-IDF 类似分数
    const scores = [];
    for (const [word, count] of Object.entries(wordCount)) {
      const tf = count / Math.max(totalWords, 1);
      const idf = 1 + Math.log(1 / (count + 0.1));
      scores.push({ word, score: tf * idf * count });
    }

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.word);
  }

  /**
   * 提取待处理任务
   */
  _extractPendingTasks(messages) {
    const pending = [];
    const patterns = [
      /需要(.+?)[，,]?/g,
      /还没(.+?)[，,]?/g,
      /下一步(.+?)[。]/g,
      /待(.+?)[，,]?/g,
      /继续(.+?)[。]/g
    ];

    for (const msg of messages) {
      if (msg.role === 'user') {
        for (const pattern of patterns) {
          const matches = msg.content.matchAll(pattern);
          for (const match of matches) {
            if (match[1] && match[1].length < 20) {
              pending.push(match[1]);
            }
          }
        }
      }
    }

    return [...new Set(pending)].slice(0, 3);
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
    const compressCheck = this.shouldCompress(session);

    return {
      messageCount: session.messages.length,
      tokenCount: session.metadata.tokenCount,
      maxMessages: this.maxMessages,
      maxTokens: this.maxTokens,
      messageRatio: (session.messages.length / this.maxMessages).toFixed(3),
      tokenRatio: (session.metadata.tokenCount / this.maxTokens).toFixed(3),
      compressionNeeded: compressCheck.should,
      compressionReason: compressCheck.reason,
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
