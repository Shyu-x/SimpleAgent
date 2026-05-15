/**
 * 增强的缓存服务
 * 使用 node-cache 实现内存缓存，支持 TTL 过期、命中率监控、大小限制
 *
 * @date 2026-05-15
 */

const NodeCache = require('node-cache');

class CacheService {
  constructor(options = {}) {
    this.cache = new NodeCache({
      stdTTL: options.stdTTL || 300,              // 默认TTL: 5分钟
      checkperiod: options.checkperiod || 60,    // 检查周期: 1分钟
      useClones: options.useClones !== false,   // 是否克隆对象
      maxKeys: options.maxKeys || 1000           // 最大键数量
    });

    // 基础统计
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      // 命中率统计（滑动窗口）
      hitRateWindow: {
        hits: 0,
        misses: 0,
        lastReset: Date.now()
      },
      // 大小限制统计
      sizeLimit: {
        maxSize: options.maxSize || 100 * 1024 * 1024,  // 默认 100MB
        currentSize: 0,
        evictionCount: 0
      },
      // 批量操作统计
      batchOperations: {
        mset: 0,
        mget: 0,
        mdel: 0
      }
    };

    // 缓存键值对大小（用于大小限制）
    this.keySizes = new Map();

    // 自动清理回调
    this.cache.on('del', (key) => {
      this.stats.deletes++;
      const size = this.keySizes.get(key) || 0;
      this.stats.sizeLimit.currentSize -= size;
      this.keySizes.delete(key);
    });

    this.cache.on('expired', (key) => {
      const size = this.keySizes.get(key) || 0;
      this.stats.sizeLimit.currentSize -= size;
      this.keySizes.delete(key);
    });

    this.cache.on('set', (key) => {
      this.stats.sets++;
    });
  }

  /**
   * 计算值的近似大小（字节）
   */
  _estimateSize(value) {
    try {
      const str = JSON.stringify(value);
      return Buffer.byteLength(str, 'utf8');
    } catch {
      return 0;
    }
  }

  /**
   * 设置缓存（带大小限制）
   */
  set(key, value, ttl = null) {
    try {
      // 检查大小限制
      const valueSize = this._estimateSize(value);
      const currentSize = this.stats.sizeLimit.currentSize;
      const maxSize = this.stats.sizeLimit.maxSize;

      // 如果单个值超过限制，拒绝写入
      if (valueSize > maxSize) {
        this.stats.errors++;
        console.warn(`Cache: Value too large for key ${key} (${valueSize} bytes > ${maxSize} bytes)`);
        return false;
      }

      // 如果超过限制，尝试清理
      if (currentSize + valueSize > maxSize) {
        this._evictLRU(valueSize);
      }

      // 删除旧值的大小记录
      if (this.keySizes.has(key)) {
        this.stats.sizeLimit.currentSize -= this.keySizes.get(key);
      }

      const result = this.cache.set(key, value, ttl);

      if (result) {
        this.keySizes.set(key, valueSize);
        this.stats.sizeLimit.currentSize += valueSize;
      }

      return result;
    } catch (error) {
      this.stats.errors++;
      console.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * 获取缓存
   */
  get(key) {
    try {
      const value = this.cache.get(key);
      if (value !== undefined) {
        this.stats.hits++;
        this.stats.hitRateWindow.hits++;
        return value;
      } else {
        this.stats.misses++;
        this.stats.hitRateWindow.misses++;
        return null;
      }
    } catch (error) {
      this.stats.errors++;
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * 获取缓存并删除
   */
  getAndDelete(key) {
    try {
      const value = this.cache.get(key);
      this.cache.del(key);
      return value;
    } catch (error) {
      this.stats.errors++;
      return null;
    }
  }

  /**
   * 检查键是否存在
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * 删除缓存
   */
  del(key) {
    try {
      const result = this.cache.del(key);
      if (result > 0) {
        this.stats.deletes++;
      }
      return result;
    } catch (error) {
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * 批量删除
   */
  mdel(keys) {
    let deletedCount = 0;
    for (const key of keys) {
      if (this.del(key) > 0) {
        deletedCount++;
      }
    }
    this.stats.batchOperations.mdel++;
    return deletedCount;
  }

  /**
   * 清空所有缓存
   */
  flush() {
    this.cache.flushAll();
    this.keySizes.clear();
    this.stats.sizeLimit.currentSize = 0;
    return true;
  }

  /**
   * 按模式删除（支持通配符）
   */
  deletePattern(pattern) {
    const allKeys = this.cache.keys();
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    const matchingKeys = allKeys.filter(key => regex.test(key));
    return this.mdel(matchingKeys);
  }

  /**
   * 获取统计信息（增强版）
   */
  getStats() {
    const keys = this.cache.keys();
    const total = this.stats.hits + this.stats.misses;

    // 计算滑动窗口命中率
    const windowTotal = this.stats.hitRateWindow.hits + this.stats.hitRateWindow.misses;
    const windowHitRate = windowTotal > 0 ? this.stats.hitRateWindow.hits / windowTotal : 0;

    // 计算总命中率
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    // 计算大小使用率
    const sizeUsage = this.stats.sizeLimit.maxSize > 0
      ? this.stats.sizeLimit.currentSize / this.stats.sizeLimit.maxSize
      : 0;

    return {
      // 基础统计
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      errors: this.stats.errors,

      // 键统计
      keys: keys.length,

      // 命中率
      hitRate: parseFloat(hitRate.toFixed(4)),
      windowHitRate: parseFloat(windowHitRate.toFixed(4)),
      windowHits: this.stats.hitRateWindow.hits,
      windowMisses: this.stats.hitRateWindow.misses,
      windowAge: Date.now() - this.stats.hitRateWindow.lastReset,

      // 大小限制
      currentSize: this.stats.sizeLimit.currentSize,
      maxSize: this.stats.sizeLimit.maxSize,
      sizeUsage: parseFloat(sizeUsage.toFixed(4)),
      evictionCount: this.stats.sizeLimit.evictionCount,

      // 批量操作
      batchOperations: { ...this.stats.batchOperations }
    };
  }

  /**
   * 重置命中率统计（滑动窗口）
   */
  resetHitRateStats() {
    this.stats.hitRateWindow = {
      hits: 0,
      misses: 0,
      lastReset: Date.now()
    };
  }

  /**
   * 获取所有键
   */
  keys() {
    return this.cache.keys();
  }

  /**
   * 批量设置
   */
  mset(keyValuePairs, ttl = null) {
    const results = [];
    for (const [key, value] of Object.entries(keyValuePairs)) {
      results.push(this.set(key, value, ttl));
    }
    this.stats.batchOperations.mset++;
    return results.every(r => r);
  }

  /**
   * 批量获取
   */
  mget(keys) {
    const result = {};
    for (const key of keys) {
      const value = this.get(key);
      if (value !== null) {
        result[key] = value;
      }
    }
    this.stats.batchOperations.mget++;
    return result;
  }

  /**
   * 获取TTL
   */
  getTTL(key) {
    return this.cache.getTtl(key);
  }

  /**
   * 设置TTL
   */
  setTTL(key, ttl) {
    return this.cache.set(key, this.get(key), ttl);
  }

  /**
   * 获取缓存项详情
   */
  getItemInfo(key) {
    const value = this.cache.get(key);
    if (value === undefined) {
      return null;
    }
    return {
      key,
      value,
      size: this.keySizes.get(key) || this._estimateSize(value),
      ttl: this.cache.getTtl(key),
      exists: true
    };
  }

  /**
   * 获取缓存项列表
   */
  getItemsInfo(keys) {
    return keys.map(key => this.getItemInfo(key)).filter(item => item !== null);
  }

  /**
   * 获取所有键的统计信息
   */
  getKeyStats() {
    const keys = this.cache.keys();
    const totalSize = this.stats.sizeLimit.currentSize;
    const avgSize = keys.length > 0 ? totalSize / keys.length : 0;

    return {
      totalKeys: keys.length,
      totalSize,
      avgSize: Math.round(avgSize),
      maxSize: this.stats.sizeLimit.maxSize,
      sizeUsagePercent: parseFloat((totalSize / this.stats.sizeLimit.maxSize * 100).toFixed(2))
    };
  }

  /**
   * LRU 清理（淘汰最少使用的键）
   */
  _evictLRU(requiredSpace) {
    const allKeys = this.cache.keys();
    const evicted = [];

    // 按 TTL 排序（TTL 长的先淘汰）
    const sortedKeys = allKeys
      .map(key => ({ key, ttl: this.cache.getTtl(key) || 0 }))
      .sort((a, b) => b.ttl - a.ttl);

    // 淘汰直到有足够空间
    for (const { key } of sortedKeys) {
      if (this.stats.sizeLimit.currentSize <= this.stats.sizeLimit.maxSize - requiredSpace) {
        break;
      }

      const size = this.keySizes.get(key) || 0;
      this.cache.del(key);
      this.stats.sizeLimit.evictionCount++;
      evicted.push(key);
    }

    if (evicted.length > 0) {
      console.log(`Cache: Evicted ${evicted.length} keys to free space: ${evicted.slice(0, 5).join(', ')}${evicted.length > 5 ? '...' : ''}`);
    }

    return evicted;
  }

  /**
   * 健康检查
   */
  healthCheck() {
    const stats = this.getStats();
    const healthy = stats.errors < 100 && stats.sizeUsage < 0.95;

    return {
      healthy,
      status: healthy ? 'healthy' : 'degraded',
      stats,
      errors: stats.errors > 50 ? 'High error rate' : null,
      sizeLimit: stats.sizeUsage > 0.9 ? 'Approaching size limit' : null
    };
  }
}

// ============================================================
// 专用缓存实例
// ============================================================

// 模型配置缓存（长期缓存，更新不频繁）
const modelConfigCache = new CacheService({
  stdTTL: 3600,           // 1小时
  maxKeys: 100,
  maxSize: 10 * 1024 * 1024  // 10MB
});

// 工具注册表缓存（长期缓存）
const toolRegistryCache = new CacheService({
  stdTTL: 3600,           // 1小时
  maxKeys: 500,
  maxSize: 20 * 1024 * 1024  // 20MB
});

// RAG 检索结果缓存（短期缓存，更新频繁）
const ragResultCache = new CacheService({
  stdTTL: 300,            // 5分钟
  maxKeys: 1000,
  maxSize: 50 * 1024 * 1024  // 50MB
});

// Prompt 模板缓存
const promptTemplateCache = new CacheService({
  stdTTL: 1800,          // 30分钟
  maxKeys: 200,
  maxSize: 5 * 1024 * 1024  // 5MB
});

// 创建默认缓存实例
const defaultCache = new CacheService();

// ============================================================
// 缓存管理器
// ============================================================

const cacheManager = {
  default: defaultCache,
  modelConfig: modelConfigCache,
  toolRegistry: toolRegistryCache,
  ragResult: ragResultCache,
  promptTemplate: promptTemplateCache,

  // 获取所有缓存实例的统计
  getAllStats() {
    return {
      default: defaultCache.getStats(),
      modelConfig: modelConfigCache.getStats(),
      toolRegistry: toolRegistryCache.getStats(),
      ragResult: ragResultCache.getStats(),
      promptTemplate: promptTemplateCache.getStats()
    };
  },

  // 获取所有缓存的健康状态
  getAllHealth() {
    return {
      default: defaultCache.healthCheck(),
      modelConfig: modelConfigCache.healthCheck(),
      toolRegistry: toolRegistryCache.healthCheck(),
      ragResult: ragResultCache.healthCheck(),
      promptTemplate: promptTemplateCache.healthCheck()
    };
  },

  // 清空所有缓存
  flushAll() {
    defaultCache.flush();
    modelConfigCache.flush();
    toolRegistryCache.flush();
    ragResultCache.flush();
    promptTemplateCache.flush();
    return true;
  },

  // 按模式清空所有缓存
  flushPattern(pattern) {
    return {
      default: defaultCache.deletePattern(pattern),
      modelConfig: modelConfigCache.deletePattern(pattern),
      toolRegistry: toolRegistryCache.deletePattern(pattern),
      ragResult: ragResultCache.deletePattern(pattern),
      promptTemplate: promptTemplateCache.deletePattern(pattern)
    };
  }
};

module.exports = {
  CacheService,
  defaultCache,
  modelConfigCache,
  toolRegistryCache,
  ragResultCache,
  promptTemplateCache,
  cacheManager
};