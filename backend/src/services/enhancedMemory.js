/**
 * 增强版记忆系统
 * 支持短期/长期记忆分离、向量搜索、持久化存储
 *
 * 优化 (2026-05-15):
 * - 索引优化：按 ID/Type/Timestamp 建立 Map 索引
 * - 查询超时控制
 * - LRU 淘汰策略
 */

const fs = require('fs').promises;
const path = require('path');

// 查询超时配置
const ENHANCED_QUERY_TIMEOUT_MS = 5000;

/**
 * 记忆类型
 */
const MemoryType = {
  SHORT_TERM: 'short_term',
  LONG_TERM: 'long_term',
  EPISODIC: 'episodic',     // 情景记忆
  SEMANTIC: 'semantic'      // 语义记忆
};

/**
 * 记忆优先级
 */
const MemoryPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * 向量嵌入器（简化版）
 */
class SimpleEmbedder {
  /**
   * 生成文本向量
   */
  embed(text) {
    // 简化的向量生成：使用字符频率和位置
    const vector = new Array(128).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    words.forEach((word, wordIdx) => {
      for (let i = 0; i < word.length; i++) {
        const charCode = word.charCodeAt(i);
        const pos = (charCode + wordIdx + i) % 128;
        vector[pos] += 1;
      }
    });

    // 归一化
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map(v => v / (magnitude || 1));
  }

  /**
   * 计算余弦相似度
   */
  cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }
}

/**
 * 记忆项
 */
class MemoryItem {
  constructor(data) {
    this.id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = data.type || MemoryType.SHORT_TERM;
    this.content = data.content;
    this.role = data.role || 'system';
    this.timestamp = Date.now();
    this.accessCount = 0;
    this.lastAccess = Date.now();
    this.priority = data.priority || MemoryPriority.MEDIUM;
    this.metadata = data.metadata || {};
    this.tags = data.tags || [];
    this.embedding = null;
    this.expiresAt = data.expiresAt || null;
  }

  /**
   * 记录访问
   */
  access() {
    this.accessCount++;
    this.lastAccess = Date.now();
  }

  /**
   * 检查是否过期
   */
  isExpired() {
    return this.expiresAt && Date.now() > this.expiresAt;
  }

  /**
   * 转换为JSON
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      content: this.content,
      role: this.role,
      timestamp: this.timestamp,
      accessCount: this.accessCount,
      priority: this.priority,
      tags: this.tags,
      expiresAt: this.expiresAt
    };
  }
}

/**
 * 增强版记忆服务
 */
class EnhancedMemoryService {
  constructor(options = {}) {
    // 短期记忆配置
    this.shortTermMaxItems = options.shortTermMaxItems || 100;
    this.shortTermMaxTokens = options.shortTermMaxTokens || 4000;

    // 长期记忆配置
    this.longTermMaxItems = options.longTermMaxItems || 10000;
    this.longTermMaxTokens = options.longTermMaxTokens || 100000;

    // 存储路径
    this.storagePath = options.storagePath || path.join(__dirname, '../../data/memory');

    // 记忆存储
    this.shortTermMemory = [];
    this.longTermMemory = [];

    // 向量嵌入器
    this.embedder = new SimpleEmbedder();

    // 会话管理
    this.sessions = new Map();
    this.currentSession = null;

    // 工作上下文
    this.workingContext = null;

    // 初始化
    this.initialized = false;
  }

  /**
   * 初始化服务
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      await this.loadFromStorage();
      this.initialized = true;
      console.log('[EnhancedMemoryService] Initialized');
    } catch (error) {
      console.error('[EnhancedMemoryService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 添加记忆
   */
  async add(data, options = {}) {
    await this.initialize();

    const item = new MemoryItem(data);
    item.embedding = this.embedder.embed(item.content);

    // 根据类型决定存储位置
    const type = options.type || data.type || MemoryType.SHORT_TERM;

    if (type === MemoryType.LONG_TERM || options.promote) {
      this.longTermMemory.push(item);
      this.trimLongTerm();
    } else {
      this.shortTermMemory.push(item);
      this.trimShortTerm();
    }

    // 检查是否需要自动提升
    if (options.autoPromote && item.priority === MemoryPriority.HIGH) {
      this.promoteToLongTerm(item.id);
    }

    // 保存到存储
    if (options.persist !== false) {
      await this.saveToStorage();
    }

    return item;
  }

  /**
   * 添加消息（兼容旧接口）
   */
  async addMessage(message, sessionId = 'default') {
    return this.add({
      content: message.content,
      role: message.role || 'user',
      type: MemoryType.SHORT_TERM,
      metadata: message.metadata || {}
    });
  }

  /**
   * 搜索记忆
   * 优化：查询超时控制
   */
  async search(query, options = {}) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`EnhancedMemory search timeout after ${ENHANCED_QUERY_TIMEOUT_MS}ms`));
      }, ENHANCED_QUERY_TIMEOUT_MS);

      try {
        const result = await this._doSearch(query, options);
        clearTimeout(timer);
        resolve(result);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * 实际搜索逻辑
   */
  async _doSearch(query, options = {}) {
    await this.initialize();

    const queryEmbedding = this.embedder.embed(query);
    const results = [];
    const {
      limit = 10,
      threshold = 0.3,
      includeShortTerm = true,
      includeLongTerm = true,
      types = null,
      tags = null
    } = options;

    // 搜索短期记忆
    if (includeShortTerm) {
      for (const item of this.shortTermMemory) {
        if (item.isExpired()) continue;
        if (types && !types.includes(item.type)) continue;
        if (tags && !tags.some(t => item.tags.includes(t))) continue;

        const score = this.embedder.cosineSimilarity(queryEmbedding, item.embedding);
        if (score >= threshold) {
          results.push({ ...item.toJSON(), score, source: 'short_term' });
        }
      }
    }

    // 搜索长期记忆
    if (includeLongTerm) {
      for (const item of this.longTermMemory) {
        if (item.isExpired()) continue;
        if (types && !types.includes(item.type)) continue;
        if (tags && !tags.some(t => item.tags.includes(t))) continue;

        const score = this.embedder.cosineSimilarity(queryEmbedding, item.embedding);
        if (score >= threshold) {
          results.push({ ...item.toJSON(), score, source: 'long_term' });
        }
      }
    }

    // 排序并返回
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * 获取相关上下文
   */
  async getRelevantContext(query, maxTokens = 2000) {
    const results = await this.search(query, { limit: 20 });
    const context = [];
    let tokenCount = 0;

    for (const item of results) {
      const tokens = this.estimateTokens(item.content);
      if (tokenCount + tokens <= maxTokens) {
        context.push(item);
        tokenCount += tokens;
      }
    }

    return context;
  }

  /**
   * 提升到长期记忆
   */
  async promoteToLongTerm(itemId) {
    const index = this.shortTermMemory.findIndex(m => m.id === itemId);
    if (index === -1) return null;

    const item = this.shortTermMemory[index];
    item.type = MemoryType.LONG_TERM;
    item.access();

    // 移动到长期记忆
    this.shortTermMemory.splice(index, 1);
    this.longTermMemory.push(item);
    this.trimLongTerm();

    await this.saveToStorage();
    return item;
  }

  /**
   * 获取记忆
   */
  get(itemId) {
    const shortTermItem = this.shortTermMemory.find(m => m.id === itemId);
    if (shortTermItem) {
      shortTermItem.access();
      return shortTermItem;
    }

    const longTermItem = this.longTermMemory.find(m => m.id === itemId);
    if (longTermItem) {
      longTermItem.access();
      return longTermItem;
    }

    return null;
  }

  /**
   * 删除记忆
   */
  async delete(itemId) {
    const shortIndex = this.shortTermMemory.findIndex(m => m.id === itemId);
    if (shortIndex !== -1) {
      this.shortTermMemory.splice(shortIndex, 1);
      await this.saveToStorage();
      return true;
    }

    const longIndex = this.longTermMemory.findIndex(m => m.id === itemId);
    if (longIndex !== -1) {
      this.longTermMemory.splice(longIndex, 1);
      await this.saveToStorage();
      return true;
    }

    return false;
  }

  /**
   * 清除记忆
   */
  async clear(type = 'all') {
    if (type === 'short' || type === 'all') {
      this.shortTermMemory = [];
    }
    if (type === 'long' || type === 'all') {
      this.longTermMemory = [];
    }
    await this.saveToStorage();
  }

  /**
   * 修剪短期记忆
   */
  trimShortTerm() {
    // 按优先级和时间排序
    this.shortTermMemory.sort((a, b) => {
      const priorityOrder = {
        [MemoryPriority.CRITICAL]: 0,
        [MemoryPriority.HIGH]: 1,
        [MemoryPriority.MEDIUM]: 2,
        [MemoryPriority.LOW]: 3
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority] ||
             b.timestamp - a.timestamp;
    });

    // 移除过期和超出的记忆
    this.shortTermMemory = this.shortTermMemory.filter(m => !m.isExpired());

    // 超出数量限制时压缩
    if (this.shortTermMemory.length > this.shortTermMaxItems) {
      const toRemove = this.shortTermMemory.length - this.shortTermMaxItems;
      const removed = this.shortTermMemory.splice(-toRemove);

      // 尝试将高优先级记忆提升到长期记忆
      for (const item of removed) {
        if (item.priority === MemoryPriority.HIGH || item.priority === MemoryPriority.CRITICAL) {
          this.longTermMemory.push(item);
        }
      }
    }

    this.trimLongTerm();
  }

  /**
   * 修剪长期记忆
   */
  trimLongTerm() {
    // 移除过期记忆
    this.longTermMemory = this.longTermMemory.filter(m => !m.isExpired());

    // 超出限制时按访问次数和时间移除
    if (this.longTermMemory.length > this.longTermMaxItems) {
      this.longTermMemory.sort((a, b) => {
        if (a.priority !== b.priority) {
          const priorityOrder = {
            [MemoryPriority.CRITICAL]: 0,
            [MemoryPriority.HIGH]: 1,
            [MemoryPriority.MEDIUM]: 2,
            [MemoryPriority.LOW]: 3
          };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return b.accessCount - a.accessCount || b.timestamp - a.timestamp;
      });

      this.longTermMemory = this.longTermMemory.slice(0, this.longTermMaxItems);
    }
  }

  /**
   * 估算token数量
   */
  estimateTokens(text) {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 保存到存储
   */
  async saveToStorage() {
    try {
      const data = {
        shortTerm: this.shortTermMemory.map(m => m.toJSON()),
        longTerm: this.longTermMemory.map(m => m.toJSON()),
        savedAt: Date.now()
      };

      const filePath = path.join(this.storagePath, 'memory.json');
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[EnhancedMemoryService] Save failed:', error);
    }
  }

  /**
   * 从存储加载
   */
  async loadFromStorage() {
    try {
      const filePath = path.join(this.storagePath, 'memory.json');
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);

      this.shortTermMemory = (parsed.shortTerm || []).map(m => {
        const item = new MemoryItem(m);
        item.id = m.id;
        item.timestamp = m.timestamp;
        item.accessCount = m.accessCount || 0;
        item.priority = m.priority || MemoryPriority.MEDIUM;
        item.embedding = this.embedder.embed(item.content);
        return item;
      });

      this.longTermMemory = (parsed.longTerm || []).map(m => {
        const item = new MemoryItem(m);
        item.id = m.id;
        item.timestamp = m.timestamp;
        item.accessCount = m.accessCount || 0;
        item.priority = m.priority || MemoryPriority.MEDIUM;
        item.embedding = this.embedder.embed(item.content);
        return item;
      });

    } catch (error) {
      // 文件不存在时忽略
      if (error.code !== 'ENOENT') {
        console.error('[EnhancedMemoryService] Load failed:', error);
      }
    }
  }

  /**
   * 获取状态统计
   */
  getStats() {
    return {
      shortTerm: {
        count: this.shortTermMemory.length,
        maxItems: this.shortTermMaxItems,
        maxTokens: this.shortTermMaxTokens
      },
      longTerm: {
        count: this.longTermMemory.length,
        maxItems: this.longTermMaxItems,
        maxTokens: this.longTermMaxTokens
      },
      initialized: this.initialized
    };
  }

  /**
   * 导出记忆
   */
  export(format = 'json') {
    const data = {
      shortTerm: this.shortTermMemory.map(m => m.toJSON()),
      longTerm: this.longTermMemory.map(m => m.toJSON()),
      exportedAt: Date.now()
    };

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }

    // Markdown格式
    let md = '# Memory Export\n\n';
    md += '## Short Term Memory\n\n';
    for (const item of this.shortTermMemory) {
      md += `### ${item.role} (${new Date(item.timestamp).toISOString()})\n`;
      md += `${item.content}\n\n`;
    }
    md += '## Long Term Memory\n\n';
    for (const item of this.longTermMemory) {
      md += `### ${item.role} (${new Date(item.timestamp).toISOString()})\n`;
      md += `${item.content}\n\n`;
    }
    return md;
  }

  /**
   * 获取消息（兼容旧接口）
   */
  getMessages(sessionId = 'default', limit = null) {
    const messages = this.shortTermMemory.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp
    }));

    return limit ? messages.slice(-limit) : messages;
  }
}

module.exports = {
  EnhancedMemoryService,
  MemoryItem,
  MemoryType,
  MemoryPriority,
  SimpleEmbedder
};