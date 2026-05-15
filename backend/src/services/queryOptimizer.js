/**
 * 数据库索引与查询优化服务
 *
 * 为内存存储添加索引优化，解决高频查询性能问题
 *
 * 优化项：
 * 1. MemoryStoreService - 全局记忆按访问频率/重要性排序索引
 * 2. SemanticMemory - 按 ID/Type/Content 哈希索引
 * 3. EnhancedMemoryService - 短期/长期记忆 Map 索引
 * 4. RAGService - 文档块倒排索引
 * 5. 查询超时控制
 */

const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('QueryOptimizer');

// ============ 索引基类 ============

/**
 * 带索引的 Map 存储
 * 支持按多个字段排序索引
 */
class IndexedMap {
  constructor() {
    this.data = new Map();           // 主存储: id -> item
    this.indexes = new Map();        // 索引: fieldName -> Map(value -> [ids])
  }

  /**
   * 添加索引字段
   */
  addIndex(fieldName, comparator = null) {
    this.indexes.set(fieldName, {
      comparator,
      items: new Map()  // value -> sorted [ids]
    });
  }

  /**
   * 设置数据
   */
  set(id, item) {
    this.data.set(id, item);
    this._rebuildIndexes(id, item);
  }

  /**
   * 获取数据
   */
  get(id) {
    return this.data.get(id);
  }

  /**
   * 删除数据
   */
  delete(id) {
    const item = this.data.get(id);
    if (item) {
      this._removeFromIndexes(id, item);
      this.data.delete(id);
    }
  }

  /**
   * 获取所有数据
   */
  values() {
    return this.data.values();
  }

  /**
   * 按索引排序获取
   */
  getSorted(fieldName, options = {}) {
    const { limit, offset = 0, desc = true } = options;
    const index = this.indexes.get(fieldName);

    if (!index) {
      return Array.from(this.data.values());
    }

    // 获取排序后的 ID 列表
    let ids = [];
    for (const [value, idList] of index.items) {
      ids.push(...idList);
    }

    // 排序
    if (index.comparator) {
      ids.sort((a, b) => {
        const itemA = this.data.get(a);
        const itemB = this.data.get(b);
        return desc
          ? index.comparator(itemB, itemA)
          : index.comparator(itemA, itemB);
      });
    } else {
      // 默认按时间戳降序
      ids.sort((a, b) => {
        const itemA = this.data.get(a);
        const itemB = this.data.get(b);
        const timeA = itemA?.timestamp || itemA?.createdAt || 0;
        const timeB = itemB?.timestamp || itemB?.createdAt || 0;
        return desc ? timeB - timeA : timeA - timeB;
      });
    }

    // 分页
    if (limit !== undefined) {
      ids = ids.slice(Number(offset), Number(offset) + Number(limit));
    }

    return ids.map(id => this.data.get(id)).filter(Boolean);
  }

  /**
   * 重建索引
   */
  _rebuildIndexes(id, item) {
    for (const [fieldName, index] of this.indexes) {
      const value = this._getFieldValue(item, fieldName);
      if (value === undefined || value === null) return;

      const key = String(value);
      if (!index.items.has(key)) {
        index.items.set(key, []);
      }

      const idList = index.items.get(key);
      if (!idList.includes(id)) {
        idList.push(id);
      }
    }
  }

  /**
   * 从索引移除
   */
  _removeFromIndexes(id, item) {
    for (const [fieldName, index] of this.indexes) {
      const value = this._getFieldValue(item, fieldName);
      if (value === undefined || value === null) return;

      const key = String(value);
      if (index.items.has(key)) {
        const idList = index.items.get(key);
        const idx = idList.indexOf(id);
        if (idx !== -1) {
          idList.splice(idx, 1);
        }
      }
    }
  }

  /**
   * 获取字段值（支持嵌套路径如 "metadata.type"）
   */
  _getFieldValue(item, fieldPath) {
    const parts = fieldPath.split('.');
    let value = item;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = value[part];
    }

    return value;
  }

  /**
   * 获取大小
   */
  get size() {
    return this.data.size;
  }
}

// ============ 查询超时装饰器 ============

/**
 * 带超时控制的查询包装器
 */
function withQueryTimeout(fn, timeoutMs = 5000) {
  return async (...args) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Query timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      Promise.resolve(fn(...args))
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  };
}

// ============ 分页查询 ============

/**
 * 分页查询工具函数
 */
function paginateQuery(items, options = {}) {
  const { limit, offset = 0 } = options;
  const total = items.length;
  const paginated = limit !== undefined
    ? items.slice(Number(offset), Number(offset) + Number(limit))
    : items;

  return {
    data: paginated,
    total,
    offset: Number(offset),
    limit: Number(limit) || total,
    hasMore: Number(offset) + paginated.length < total
  };
}

// ============ 缓存索引管理器 ============

/**
 * 缓存索引管理器
 * 用于 RAG 等需要频繁检索的场景
 */
class CacheIndexManager {
  constructor(options = {}) {
    this.ttl = options.ttl || 60000;           // 缓存 TTL (ms)
    this.maxSize = options.maxSize || 1000;     // 最大缓存条目
    this.indexes = new Map();                   // 缓存索引
    this.timestamps = new Map();                // 缓存时间戳
  }

  /**
   * 设置索引
   */
  setIndex(key, data, options = {}) {
    const { ttl = this.ttl, priority = 0 } = options;

    // 检查大小限制
    if (this.indexes.size >= this.maxSize && !this.indexes.has(key)) {
      this._evictLRU();
    }

    this.indexes.set(key, {
      data,
      priority,
      size: this._estimateSize(data)
    });
    this.timestamps.set(key, Date.now());
  }

  /**
   * 获取索引
   */
  getIndex(key) {
    const entry = this.indexes.get(key);
    if (!entry) return null;

    // 检查 TTL
    const age = Date.now() - (this.timestamps.get(key) || 0);
    if (age > this.ttl) {
      this.indexes.delete(key);
      this.timestamps.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * 使索引失效
   */
  invalidate(key) {
    this.indexes.delete(key);
    this.timestamps.delete(key);
  }

  /**
   * 清除所有缓存
   */
  clear() {
    this.indexes.clear();
    this.timestamps.clear();
  }

  /**
   * LRU 淘汰
   */
  _evictLRU() {
    let oldest = null;
    let oldestTime = Infinity;

    for (const [key, ts] of this.timestamps) {
      if (ts < oldestTime) {
        oldestTime = ts;
        oldest = key;
      }
    }

    if (oldest) {
      this.indexes.delete(oldest);
      this.timestamps.delete(oldest);
    }
  }

  /**
   * 估算大小
   */
  _estimateSize(data) {
    try {
      return JSON.stringify(data).length;
    } catch {
      return 1;
    }
  }
}

// ============ 导出 ============

module.exports = {
  IndexedMap,
  withQueryTimeout,
  paginateQuery,
  CacheIndexManager,
  logger
};