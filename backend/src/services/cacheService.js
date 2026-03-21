/**
 * 缓存服务
 * 使用 node-cache 实现内存缓存，支持TTL过期
 */

const NodeCache = require('node-cache');

class CacheService {
  constructor(options = {}) {
    this.cache = new NodeCache({
      stdTTL: options.stdTTL || 300,           // 默认TTL: 5分钟
      checkperiod: options.checkperiod || 60,   // 检查周期: 1分钟
      useClones: options.useClones !== false,  // 是否克隆对象
      maxKeys: options.maxKeys || 1000         // 最大键数量
    });

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
  }

  /**
   * 设置缓存
   */
  set(key, value, ttl = null) {
    try {
      const result = this.cache.set(key, value, ttl);
      if (result) {
        this.stats.sets++;
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
        return value;
      } else {
        this.stats.misses++;
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
   * 清空所有缓存
   */
  flush() {
    this.cache.flushAll();
    return true;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const keys = this.cache.keys();
    return {
      ...this.stats,
      keys: keys.length,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
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
    return results.every(r => r);
  }

  /**
   * 批量获取
   */
  mget(keys) {
    return this.cache.mget(keys);
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
}

// 创建默认缓存实例
const defaultCache = new CacheService();

module.exports = {
  CacheService,
  defaultCache
};
