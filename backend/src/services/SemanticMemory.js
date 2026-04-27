/**
 * 语义记忆系统
 * 支持真向量嵌入、层次化记忆、自动提升
 */

const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('SemanticMemory');

class SemanticMemory {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './data/memory';
    this.shortTermMax = options.shortTermMax || 50;
    this.longTermMax = options.longTermMax || 1000;

    // 短期记忆
    this.shortTerm = {
      items: [],
      context: null
    };

    // 长期记忆（持久化存储）
    this.longTerm = {
      items: [],
      embeddings: new Map()
    };

    // 嵌入服务配置
    this.embeddingConfig = {
      provider: options.embeddingProvider || 'local', // 'openai', 'local', 'mock'
      model: options.embeddingModel || 'text-embedding-3-small',
      dimension: options.embeddingDimension || 1536,
      apiKey: options.apiKey || process.env.OPENAI_API_KEY
    };

    this.initialized = false;
  }

  /**
   * 初始化 - 加载持久化数据
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.storageDir, { recursive: true });

      // 加载长期记忆
      const longTermPath = path.join(this.storageDir, 'longterm.json');
      try {
        const data = await fs.readFile(longTermPath, 'utf-8');
        const parsed = JSON.parse(data);
        this.longTerm.items = parsed.items || [];
        this.longTerm.embeddings = new Map(parsed.embeddings || []);
      } catch {}

      this.initialized = true;
      logger.info(`初始化完成，短期记忆: ${this.shortTermMax}，长期记忆: ${this.longTerm.items.length}`);
    } catch (error) {
      logger.error('初始化失败', { error: error.message });
    }
  }

  /**
   * 添加消息到记忆
   */
  async add(item) {
    await this.initialize();

    const memoryItem = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...item,
      timestamp: Date.now(),
      accessCount: 0
    };

    // 添加到短期记忆
    this.shortTerm.items.push(memoryItem);

    // 生成嵌入向量
    if (item.content) {
      memoryItem.embedding = await this.generateEmbedding(item.content);
    }

    // 短期记忆超限，压缩
    if (this.shortTerm.items.length > this.shortTermMax) {
      await this.compress();
    }

    // 检查是否应该提升到长期记忆
    if (this.shouldPromote(memoryItem)) {
      await this.promote(memoryItem);
    }

    return memoryItem;
  }

  /**
   * 生成嵌入向量
   */
  async generateEmbedding(text) {
    const { provider, model, dimension } = this.embeddingConfig;

    switch (provider) {
      case 'openai':
        return await this.openAIEmbedding(text, model);

      case 'local':
        return await this.localEmbedding(text, dimension);

      default:
        // 简化的模拟嵌入（用于测试）
        return this.mockEmbedding(text, dimension);
    }
  }

  /**
   * OpenAI 嵌入
   */
  async openAIEmbedding(text, model) {
    const axios = require('axios');

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          input: text,
          model: model
        },
        {
          headers: {
            'Authorization': `Bearer ${this.embeddingConfig.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.data[0].embedding;
    } catch (error) {
      logger.error('OpenAI嵌入失败', { error: error.message });
      return this.mockEmbedding(text, this.embeddingConfig.dimension);
    }
  }

  /**
   * 本地嵌入（使用词频统计作为简化实现）
   * 注意：在生产环境中应使用真正的嵌入模型
   */
  async localEmbedding(text, dimension) {
    // 简单的TF-IDF风格嵌入
    const words = text.toLowerCase().split(/\s+/);
    const vector = new Array(dimension).fill(0);

    // 基于词频生成向量
    words.forEach((word, idx) => {
      for (let i = 0; i < Math.min(word.length, 10); i++) {
        const charCode = word.charCodeAt(i);
        const position = (idx * 31 + charCode * 7) % dimension;
        vector[position] += 1;
      }
    });

    // L2归一化
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      return vector.map(v => v / norm);
    }

    return vector;
  }

  /**
   * 模拟嵌入（用于测试）
   */
  mockEmbedding(text, dimension) {
    const words = text.toLowerCase().split(/\s+/);
    const vector = new Array(dimension).fill(0);

    words.forEach((word, idx) => {
      for (let i = 0; i < word.length; i++) {
        const code = word.charCodeAt(i);
        const pos = (idx + code * 3) % dimension;
        vector[pos] += 1;
      }
    });

    // 归一化
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map(v => v / norm);
  }

  /**
   * 判断是否应该提升到长期记忆
   */
  shouldPromote(item) {
    // 重要性高或访问次数多的项目应该提升
    if (item.importance === 'high') return true;
    if (item.accessCount > 3) return true;

    // 包含关键信息
    const keyPatterns = [
      /配置|config/i,
      /密码|password|key/i,
      /地址|address/i,
      /电话|phone/i,
      /名称|name/i
    ];

    return keyPatterns.some(pattern => pattern.test(item.content));
  }

  /**
   * 提升到长期记忆
   */
  async promote(item) {
    if (this.longTerm.items.length >= this.longTermMax) {
      // 移除最不重要的记忆
      await this.prune();
    }

    const longTermItem = { ...item, promotedAt: Date.now() };

    // 生成嵌入向量（如果没有的话）
    if (!longTermItem.embedding && longTermItem.content) {
      longTermItem.embedding = await this.generateEmbedding(longTermItem.content);
    }

    this.longTerm.items.push(longTermItem);

    if (longTermItem.embedding) {
      this.longTerm.embeddings.set(longTermItem.id, longTermItem.embedding);
    }

    // 持久化
    await this.persist();

    logger.info(`提升到长期记忆: ${item.id}`);
  }

  /**
   * 压缩短期记忆
   */
  async compress() {
    const items = this.shortTerm.items;

    // 保留最近的20项
    const recentItems = items.slice(-20);

    // 对旧项目生成摘要
    const oldItems = items.slice(0, -20);
    if (oldItems.length > 0) {
      const summary = this.generateSummary(oldItems);

      // 添加摘要作为记忆
      await this.add({
        type: 'summary',
        role: 'system',
        content: summary,
        importance: 'medium'
      });
    }

    this.shortTerm.items = recentItems;
  }

  /**
   * 生成摘要
   */
  generateSummary(items) {
    const topics = new Set();

    items.forEach(item => {
      if (item.content) {
        // 提取关键词
        const words = item.content.match(/[\u4e00-\u9fa5a-zA-Z]{2,}/g) || [];
        words.slice(0, 10).forEach(w => topics.add(w.toLowerCase()));
      }
    });

    const topTopics = Array.from(topics).slice(0, 10);
    return `【摘要】之前讨论过: ${topTopics.join(', ')}。如有需要可详细展开。`;
  }

  /**
   * 移除最不重要的长期记忆
   */
  async prune() {
    if (this.longTerm.items.length === 0) return;

    // 按重要性和访问频率排序
    const scored = this.longTerm.items.map(item => ({
      item,
      score: (item.accessCount || 0) +
             (item.importance === 'high' ? 10 : 0) +
             (item.promotedAt ? (Date.now() - item.promotedAt) / (24 * 60 * 60 * 1000) : 0)
    }));

    scored.sort((a, b) => a.score - b.score);

    // 移除分数最低的10%
    const toRemove = scored.slice(0, Math.ceil(scored.length * 0.1));

    for (const { item } of toRemove) {
      const idx = this.longTerm.items.findIndex(i => i.id === item.id);
      if (idx !== -1) {
        this.longTerm.items.splice(idx, 1);
        this.longTerm.embeddings.delete(item.id);
      }
    }

    await this.persist();
    console.log(`[SemanticMemory] 清理了 ${toRemove.length} 条记忆`);
  }

  /**
   * 语义搜索
   */
  async search(query, options = {}) {
    await this.initialize();

    const { limit = 5, recallBoost = 0.3 } = options;
    const results = [];

    // 生成查询向量
    const queryEmbedding = await this.generateEmbedding(query);

    // 搜索短期记忆
    for (const item of this.shortTerm.items) {
      if (!item.embedding) {
        item.embedding = await this.generateEmbedding(item.content || '');
      }

      const score = this.cosineSimilarity(queryEmbedding, item.embedding);
      results.push({
        ...item,
        score,
        source: 'short_term'
      });
    }

    // 搜索长期记忆
    for (const item of this.longTerm.items) {
      const embedding = this.longTerm.embeddings.get(item.id) || item.embedding;
      if (!embedding) continue;

      const score = this.cosineSimilarity(queryEmbedding, embedding);
      results.push({
        ...item,
        score: score * (1 + recallBoost), // 长期记忆加权
        source: 'long_term'
      });
    }

    // 按相似度排序
    results.sort((a, b) => b.score - a.score);

    // 更新访问计数
    for (const result of results.slice(0, limit)) {
      result.accessCount = (result.accessCount || 0) + 1;

      const longTermItem = this.longTerm.items.find(i => i.id === result.id);
      if (longTermItem) {
        longTermItem.accessCount = result.accessCount;
      }
    }

    await this.persist();

    return results.slice(0, limit);
  }

  /**
   * 余弦相似度
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * 持久化到磁盘
   */
  async persist() {
    try {
      const longTermPath = path.join(this.storageDir, 'longterm.json');

      await fs.writeFile(longTermPath, JSON.stringify({
        items: this.longTerm.items,
        embeddings: Array.from(this.longTerm.embeddings.entries())
      }, null, 2));
    } catch (error) {
      console.error('[SemanticMemory] 持久化失败:', error);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      shortTerm: {
        count: this.shortTerm.items.length,
        max: this.shortTermMax
      },
      longTerm: {
        count: this.longTerm.items.length,
        max: this.longTermMax
      },
      embedding: {
        provider: this.embeddingConfig.provider,
        dimension: this.embeddingConfig.dimension
      }
    };
  }

  /**
   * 导出记忆
   */
  export() {
    return {
      shortTerm: this.shortTerm.items,
      longTerm: this.longTerm.items
    };
  }

  /**
   * 清除记忆
   */
  async clear(type = 'all') {
    if (type === 'short' || type === 'all') {
      this.shortTerm.items = [];
      this.shortTerm.context = null;
    }

    if (type === 'long' || type === 'all') {
      this.longTerm.items = [];
      this.longTerm.embeddings.clear();
      await this.persist();
    }
  }
}

module.exports = SemanticMemory;
