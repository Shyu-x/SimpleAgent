/**
 * 增强的 Agent 记忆系统
 * 包含短期记忆、长期记忆、向量化、持久化等功能
 */

const fs = require('fs').promises;
const path = require('path');

// 记忆类型
const MemoryType = {
  SHORT_TERM: 'short_term',   // 短期记忆（会话内）
  LONG_TERM: 'long_term',     // 长期记忆（跨会话）
  EPISODIC: 'episodic',       // 情景记忆（事件）
  SEMANTIC: 'semantic',       // 语义记忆（知识）
  PROCEDURAL: 'procedural'    // 程序记忆（技能）
};

// 记忆来源
const MemorySource = {
  USER: 'user',
  AGENT: 'agent',
  SYSTEM: 'system'
};

// 记忆配置
const DEFAULT_CONFIG = {
  storagePath: './data/memories',
  maxShortTermMemory: 100,
  maxLongTermMemory: 1000,
  shortTermExpiry: 3600000,      // 1小时
  longTermExpiry: 2592000000,    // 30天
  similarityThreshold: 0.7,
  cleanupInterval: 3600000       // 1小时清理一次
};

/**
 * 简易向量化（用于语义搜索）
 * 实际生产环境应使用专业的嵌入模型
 */
function simpleVectorize(text) {
  const vector = new Array(128).fill(0);
  const words = text.toLowerCase().split(/\s+/);

  words.forEach((word, idx) => {
    for (let i = 0; i < word.length; i++) {
      const charCode = word.charCodeAt(i);
      vector[(idx + charCode) % 128] += 1;
      vector[(i * 7 + charCode) % 128] += charCode % 10;
    }
  });

  // 归一化
  const max = Math.max(...vector);
  return max > 0 ? vector.map(v => v / max) : vector;
}

/**
 * 余弦相似度计算
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator > 0 ? dotProduct / denominator : 0;
}

/**
 * 记忆项
 */
class Memory {
  constructor(config) {
    this.id = config.id || `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.content = config.content;
    this.type = config.type || MemoryType.SHORT_TERM;
    this.source = config.source || MemorySource.USER;
    this.embedding = config.embedding || simpleVectorize(config.content);
    this.metadata = config.metadata || {};
    this.importance = config.importance || 0.5;
    this.accessCount = 0;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.expiresAt = this.calculateExpiry(config.type);
    this.sessionId = config.sessionId || null;
    this.agentId = config.agentId || null;
    this.tags = config.tags || [];
  }

  calculateExpiry(type) {
    const now = Date.now();
    switch (type) {
      case MemoryType.SHORT_TERM:
        return now + DEFAULT_CONFIG.shortTermExpiry;
      case MemoryType.LONG_TERM:
        return now + DEFAULT_CONFIG.longTermExpiry;
      default:
        return now + DEFAULT_CONFIG.shortTermExpiry;
    }
  }

  access() {
    this.accessCount++;
    this.updatedAt = Date.now();
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }

  toJSON() {
    return {
      id: this.id,
      content: this.content,
      type: this.type,
      source: this.source,
      embedding: this.embedding,
      metadata: this.metadata,
      importance: this.importance,
      accessCount: this.accessCount,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      expiresAt: this.expiresAt,
      sessionId: this.sessionId,
      agentId: this.agentId,
      tags: this.tags
    };
  }

  static fromJSON(data) {
    const memory = new Memory({
      id: data.id,
      content: data.content,
      type: data.type,
      source: data.source,
      embedding: data.embedding,
      metadata: data.metadata,
      importance: data.importance,
      sessionId: data.sessionId,
      agentId: data.agentId,
      tags: data.tags
    });
    memory.accessCount = data.accessCount || 0;
    memory.createdAt = data.createdAt;
    memory.updatedAt = data.updatedAt;
    memory.expiresAt = data.expiresAt;
    return memory;
  }
}

/**
 * 会话上下文管理器
 */
class SessionContext {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.messages = [];
    this.variables = {};
    this.createdAt = Date.now();
    this.lastAccessedAt = Date.now();
  }

  addMessage(role, content) {
    this.messages.push({
      role,
      content,
      timestamp: Date.now()
    });
    this.lastAccessedAt = Date.now();
  }

  setVariable(key, value) {
    this.variables[key] = value;
    this.lastAccessedAt = Date.now();
  }

  getVariable(key) {
    return this.variables[key];
  }

  getRecentMessages(count = 10) {
    return this.messages.slice(-count);
  }

  getContext() {
    return {
      sessionId: this.sessionId,
      messageCount: this.messages.length,
      variables: { ...this.variables },
      createdAt: this.createdAt,
      lastAccessedAt: this.lastAccessedAt
    };
  }
}

/**
 * 增强记忆系统
 */
class EnhancedMemorySystem {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.shortTermMemory = new Map();
    this.longTermMemory = new Map();
    this.sessions = new Map();
    this.initialized = false;
    this.cleanupTimer = null;
  }

  /**
   * 初始化系统
   */
  async initialize() {
    if (this.initialized) return;

    // 确保存储目录存在
    try {
      await fs.mkdir(this.config.storagePath, { recursive: true });
    } catch (error) {
      console.error('[Memory] Failed to create storage directory:', error);
    }

    // 加载持久化的记忆
    await this.loadMemories();

    // 启动清理定时器
    this.startCleanupTimer();

    this.initialized = true;
    console.log('[Memory] System initialized');
  }

  /**
   * 添加记忆
   */
  async addMemory(content, options = {}) {
    const memory = new Memory({
      content,
      type: options.type || MemoryType.SHORT_TERM,
      source: options.source || MemorySource.USER,
      metadata: options.metadata || {},
      importance: options.importance || 0.5,
      sessionId: options.sessionId,
      agentId: options.agentId,
      tags: options.tags || []
    });

    // 根据类型存储
    if (memory.type === MemoryType.SHORT_TERM) {
      this.shortTermMemory.set(memory.id, memory);
      // 检查容量限制
      if (this.shortTermMemory.size > this.config.maxShortTermMemory) {
        await this.evictLeastUsed(this.shortTermMemory);
      }
    } else {
      this.longTermMemory.set(memory.id, memory);
      // 检查容量限制
      if (this.longTermMemory.size > this.config.maxLongTermMemory) {
        await this.evictLeastUsed(this.longTermMemory);
      }
    }

    // 持久化
    await this.persistMemory(memory);

    return memory;
  }

  /**
   * 获取记忆
   */
  getMemory(memoryId) {
    let memory = this.shortTermMemory.get(memoryId);
    if (!memory) {
      memory = this.longTermMemory.get(memoryId);
    }
    if (memory) {
      memory.access();
    }
    return memory;
  }

  /**
   * 语义搜索
   */
  search(query, options = {}) {
    const queryEmbedding = simpleVectorize(query);
    const threshold = options.threshold || this.config.similarityThreshold;
    const limit = options.limit || 10;
    const types = options.types || Object.values(MemoryType);

    const results = [];

    // 搜索短期记忆
    if (types.includes(MemoryType.SHORT_TERM)) {
      this.shortTermMemory.forEach((memory) => {
        if (memory.isExpired()) return;
        const similarity = cosineSimilarity(queryEmbedding, memory.embedding);
        if (similarity >= threshold) {
          results.push({ memory, similarity });
        }
      });
    }

    // 搜索长期记忆
    types.forEach(type => {
      if (type === MemoryType.SHORT_TERM) return;
      this.longTermMemory.forEach((memory) => {
        if (memory.type !== type) return;
        if (memory.isExpired()) return;
        const similarity = cosineSimilarity(queryEmbedding, memory.embedding);
        if (similarity >= threshold) {
          results.push({ memory, similarity });
        }
      });
    });

    // 按相似度排序
    results.sort((a, b) => b.similarity - a.similarity);

    // 记录访问
    results.forEach(r => r.memory.access());

    return results.slice(0, limit).map(r => ({
      memory: r.memory.toJSON(),
      similarity: r.similarity
    }));
  }

  /**
   * 转移到长期记忆
   */
  async promoteToLongTerm(memoryId) {
    const memory = this.shortTermMemory.get(memoryId);
    if (!memory) return null;

    // 创建长期记忆
    const longTermMemory = new Memory({
      ...memory.toJSON(),
      type: MemoryType.LONG_TERM
    });

    this.longTermMemory.set(longTermMemory.id, longTermMemory);
    this.shortTermMemory.delete(memoryId);

    await this.persistMemory(longTermMemory);

    return longTermMemory;
  }

  /**
   * 会话上下文管理
   */
  createSession(sessionId) {
    const session = new SessionContext(sessionId);
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createSession(sessionId);
    }
    session.lastAccessedAt = Date.now();
    return session;
  }

  /**
   * 删除记忆
   */
  async deleteMemory(memoryId) {
    let deleted = false;

    if (this.shortTermMemory.has(memoryId)) {
      this.shortTermMemory.delete(memoryId);
      deleted = true;
    }

    if (this.longTermMemory.has(memoryId)) {
      this.longTermMemory.delete(memoryId);
      deleted = true;
    }

    if (deleted) {
      await this.deletePersistedMemory(memoryId);
    }

    return deleted;
  }

  /**
   * 驱逐最少使用的记忆
   */
  async evictLeastUsed(memoryMap) {
    // 按访问次数和时间排序
    const entries = Array.from(memoryMap.entries());
    entries.sort((a, b) => {
      if (a[1].accessCount !== b[1].accessCount) {
        return a[1].accessCount - b[1].accessCount;
      }
      return a[1].updatedAt - b[1].updatedAt;
    });

    // 移除 10% 的记忆
    const toRemove = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      const [id, memory] = entries[i];
      memoryMap.delete(id);
      await this.deletePersistedMemory(id);
    }
  }

  /**
   * 清理过期记忆
   */
  async cleanupExpired() {
    console.log('[Memory] Running cleanup...');

    let cleaned = 0;

    // 清理短期记忆
    this.shortTermMemory.forEach((memory, id) => {
      if (memory.isExpired()) {
        this.shortTermMemory.delete(id);
        cleaned++;
      }
    });

    // 清理长期记忆
    this.longTermMemory.forEach((memory, id) => {
      if (memory.isExpired()) {
        this.longTermMemory.delete(id);
        cleaned++;
      }
    });

    // 清理过期会话
    const sessionExpiry = 3600000; // 1小时
    this.sessions.forEach((session, id) => {
      if (Date.now() - session.lastAccessedAt > sessionExpiry) {
        this.sessions.delete(id);
      }
    });

    console.log(`[Memory] Cleaned ${cleaned} expired memories`);
    return cleaned;
  }

  /**
   * 启动清理定时器
   */
  startCleanupTimer() {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.config.cleanupInterval);
  }

  /**
   * 停止清理定时器
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 持久化记忆到文件
   */
  async persistMemory(memory) {
    try {
      const filename = `${memory.type}_${memory.id}.json`;
      const filepath = path.join(this.config.storagePath, filename);
      await fs.writeFile(filepath, JSON.stringify(memory.toJSON(), null, 2));
    } catch (error) {
      console.error('[Memory] Failed to persist memory:', error);
    }
  }

  /**
   * 删除持久化的记忆文件
   */
  async deletePersistedMemory(memoryId) {
    try {
      const files = await fs.readdir(this.config.storagePath);
      const targetFile = files.find(f => f.includes(memoryId));
      if (targetFile) {
        await fs.unlink(path.join(this.config.storagePath, targetFile));
      }
    } catch (error) {
      // 忽略错误
    }
  }

  /**
   * 从文件加载记忆
   */
  async loadMemories() {
    try {
      const files = await fs.readdir(this.config.storagePath);
      let loaded = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const filepath = path.join(this.config.storagePath, file);
          const data = JSON.parse(await fs.readFile(filepath, 'utf-8'));
          const memory = Memory.fromJSON(data);

          if (memory.isExpired()) {
            await fs.unlink(filepath);
            continue;
          }

          if (memory.type === MemoryType.SHORT_TERM) {
            this.shortTermMemory.set(memory.id, memory);
          } else {
            this.longTermMemory.set(memory.id, memory);
          }

          loaded++;
        } catch (e) {
          console.error(`[Memory] Failed to load ${file}:`, e);
        }
      }

      console.log(`[Memory] Loaded ${loaded} memories from storage`);
    } catch (error) {
      console.error('[Memory] Failed to load memories:', error);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      shortTermCount: this.shortTermMemory.size,
      longTermCount: this.longTermMemory.size,
      sessionCount: this.sessions.size,
      initialized: this.initialized
    };
  }

  /**
   * 关闭系统
   */
  async shutdown() {
    this.stopCleanupTimer();

    // 保存所有记忆
    const allMemories = [
      ...this.shortTermMemory.values(),
      ...this.longTermMemory.values()
    ];

    for (const memory of allMemories) {
      await this.persistMemory(memory);
    }

    console.log('[Memory] System shutdown complete');
  }
}

// 导出单例
const memorySystem = new EnhancedMemorySystem();

module.exports = {
  memorySystem,
  EnhancedMemorySystem,
  Memory,
  SessionContext,
  MemoryType,
  MemorySource
};