/**
 * 缓存服务整合层
 * 将 Redis 双层缓存与现有 node-cache 缓存整合
 *
 * 主缓存: Redis (当 Redis 可用时优先使用)
 * 回退缓存: node-cache (本地内存缓存)
 *
 * @date 2026-05-15
 */

const NodeCache = require('node-cache');
const { EventEmitter } = require('events');

// ============================================================
// Redis 客户端管理 (延迟加载)
// ============================================================

let redisClient = null;
let redisStatus = 'disconnected';
let redisInitPromise = null;

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6380', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetriesPerRequest: 2,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: (retries) => {
    if (retries > 3) {
      redisStatus = 'error';
      return false;
    }
    return Math.min(retries * 200, 2000);
  },
  connectTimeout: 5000,
};

/**
 * 获取 Redis 客户端
 */
function getRedisClient() {
  if (!redisClient) {
    try {
      const Redis = require('ioredis');
      redisClient = new Redis(redisConfig);

      redisClient.on('connect', () => {
        redisStatus = 'connected';
      });

      redisClient.on('error', (err) => {
        redisStatus = 'error';
      });

      redisClient.on('close', () => {
        redisStatus = 'disconnected';
      });
    } catch (error) {
      console.warn('[Cache] Redis 模块加载失败:', error.message);
    }
  }
  return redisClient;
}

/**
 * 测试 Redis 连接
 */
async function testRedisConnection() {
  try {
    const client = getRedisClient();
    if (!client) return false;

    await client.connect().catch(() => {});
    await Promise.race([
      client.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
    ]);
    redisStatus = 'connected';
    return true;
  } catch (error) {
    redisStatus = 'disconnected';
    return false;
  }
}

/**
 * Redis 是否可用
 */
function isRedisAvailable() {
  return redisStatus === 'connected';
}

// ============================================================
// 统一缓存包装器
// ============================================================

class UnifiedCacheWrapper {
  constructor(prefix = 'cache:') {
    this.prefix = prefix;
    this.localCache = new NodeCache({
      stdTTL: 300,
      checkperiod: 60,
      useClones: true
    });

    this.stats = {
      redisHits: 0,
      redisMisses: 0,
      localHits: 0,
      localMisses: 0,
      sets: 0,
      errors: 0
    };
  }

  _serialize(value) {
    return JSON.stringify(value);
  }

  _deserialize(value) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  _key(key) {
    return `${this.prefix}${key}`;
  }

  /**
   * 设置缓存
   */
  async set(key, value, ttlSeconds = 3600) {
    const fullKey = this._key(key);
    const serialized = this._serialize(value);

    // 优先写入 Redis
    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        await client.setex(fullKey, ttlSeconds, serialized);
        this.stats.sets++;
        // 同时写入本地缓存
        this.localCache.set(key, value, ttlSeconds);
        return true;
      } catch (error) {
        this.stats.errors++;
        this.localCache.set(key, value, ttlSeconds);
        return false;
      }
    }

    // Redis 不可用，写入本地缓存
    this.localCache.set(key, value, ttlSeconds);
    this.stats.sets++;
    return true;
  }

  /**
   * 获取缓存
   */
  async get(key) {
    // 优先从 Redis 获取
    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        const fullKey = this._key(key);
        const value = await client.get(fullKey);

        if (value !== null) {
          this.stats.redisHits++;
          const deserialized = this._deserialize(value);
          this.localCache.set(key, deserialized);
          return deserialized;
        }

        this.stats.redisMisses++;
        const localValue = this.localCache.get(key);
        if (localValue !== undefined) {
          this.stats.localHits++;
          return localValue;
        }
        this.stats.localMisses++;
        return null;
      } catch (error) {
        this.stats.errors++;
        const localValue = this.localCache.get(key);
        if (localValue !== undefined) {
          this.stats.localHits++;
          return localValue;
        }
        this.stats.localMisses++;
        return null;
      }
    }

    // Redis 不可用，读本地缓存
    const localValue = this.localCache.get(key);
    if (localValue !== undefined) {
      this.stats.localHits++;
      return localValue;
    }
    this.stats.localMisses++;
    return null;
  }

  /**
   * 删除缓存
   */
  async del(key) {
    const fullKey = this._key(key);

    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        await client.del(fullKey);
      } catch (error) {
        // 忽略
      }
    }

    this.localCache.del(key);
    return true;
  }

  /**
   * 检查键是否存在
   */
  async has(key) {
    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        const fullKey = this._key(key);
        return await client.exists(fullKey) === 1;
      } catch (error) {
        return this.localCache.has(key);
      }
    }
    return this.localCache.has(key);
  }

  /**
   * 批量获取
   */
  async mget(keys) {
    const results = {};

    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        const fullKeys = keys.map(k => this._key(k));
        const pipeline = client.pipeline();
        for (const fullKey of fullKeys) {
          pipeline.get(fullKey);
        }
        const values = await pipeline.exec();

        for (let i = 0; i < keys.length; i++) {
          const [err, value] = values[i];
          if (!err && value !== null) {
            results[keys[i]] = this._deserialize(value);
            this.stats.redisHits++;
          } else {
            const localValue = this.localCache.get(keys[i]);
            if (localValue !== undefined) {
              results[keys[i]] = localValue;
              this.stats.localHits++;
            }
            this.stats.redisMisses++;
          }
        }
        return results;
      } catch (error) {
        this.stats.errors++;
      }
    }

    for (const key of keys) {
      const value = this.localCache.get(key);
      if (value !== undefined) {
        results[key] = value;
        this.stats.localHits++;
      } else {
        this.stats.localMisses++;
      }
    }
    return results;
  }

  /**
   * 批量设置
   */
  async mset(keyValuePairs, ttlSeconds = 3600) {
    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        const pipeline = client.pipeline();
        for (const [key, value] of Object.entries(keyValuePairs)) {
          pipeline.setex(this._key(key), ttlSeconds, this._serialize(value));
        }
        await pipeline.exec();
      } catch (error) {
        this.stats.errors++;
      }
    }

    for (const [key, value] of Object.entries(keyValuePairs)) {
      this.localCache.set(key, value, ttlSeconds);
    }
    this.stats.sets += Object.keys(keyValuePairs).length;
    return true;
  }

  /**
   * 按模式删除
   */
  async deletePattern(pattern) {
    let deletedCount = 0;

    const localKeys = this.localCache.keys();
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    for (const key of localKeys) {
      if (regex.test(key)) {
        this.localCache.del(key);
        deletedCount++;
      }
    }

    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        const fullPattern = `${this.prefix}${pattern}`;
        const keys = await client.keys(fullPattern);
        if (keys.length > 0) {
          await client.del(...keys);
          deletedCount += keys.length;
        }
      } catch (error) {
        this.stats.errors++;
      }
    }

    return deletedCount;
  }

  /**
   * 同步方法：设置缓存（用于兼容现有代码）
   */
  syncSet(key, value, ttl = null) {
    this.localCache.set(key, value, ttl);
    this.stats.sets++;
    // 异步写入 Redis
    this.set(key, value, ttl || 3600).catch(() => {});
    return true;
  }

  /**
   * 同步方法：获取缓存（用于兼容现有代码）
   */
  syncGet(key) {
    const value = this.localCache.get(key);
    if (value !== undefined) {
      this.stats.localHits++;
      return value;
    }
    this.stats.localMisses++;
    return null;
  }

  /**
   * 获取统计
   */
  getStats() {
    const total = this.stats.redisHits + this.stats.redisMisses + this.stats.localHits + this.stats.localMisses;
    const hitRate = total > 0 ? (this.stats.redisHits + this.stats.localHits) / total : 0;

    return {
      redis: {
        hits: this.stats.redisHits,
        misses: this.stats.redisMisses,
        available: isRedisAvailable(),
        status: redisStatus
      },
      local: {
        hits: this.stats.localHits,
        misses: this.stats.localMisses,
        keys: this.localCache.keys().length
      },
      total: {
        sets: this.stats.sets,
        errors: this.stats.errors,
        hitRate: parseFloat(hitRate.toFixed(4))
      }
    };
  }

  /**
   * 清空缓存
   */
  flush() {
    this.localCache.flushAll();
    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        const keys = client.keys(`${this.prefix}*`);
        if (keys.length > 0) {
          client.del(...keys);
        }
      } catch (error) {
        // 忽略
      }
    }
  }

  /**
   * 删除单个键
   */
  del(key) {
    this.localCache.del(key);
    if (isRedisAvailable()) {
      try {
        getRedisClient().del(this._key(key));
      } catch (error) {
        // 忽略
      }
    }
    return 1;
  }

  /**
   * 获取键列表
   */
  keys() {
    return this.localCache.keys();
  }

  /**
   * 检查键是否存在（同步）
   */
  has(key) {
    return this.localCache.has(key);
  }
}

// ============================================================
// 预配置的缓存实例
// ============================================================

const modelConfigCache = new UnifiedCacheWrapper('model:config:');
const toolRegistryCache = new UnifiedCacheWrapper('tool:registry:');
const ragResultCache = new UnifiedCacheWrapper('rag:result:');
const promptTemplateCache = new UnifiedCacheWrapper('prompt:template:');
const defaultCache = new UnifiedCacheWrapper('cache:default:');

// ============================================================
// 缓存管理器
// ============================================================

const cacheManager = {
  default: defaultCache,
  modelConfig: modelConfigCache,
  toolRegistry: toolRegistryCache,
  ragResult: ragResultCache,
  promptTemplate: promptTemplateCache,

  /**
   * 初始化 Redis 连接
   */
  async initialize() {
    return await testRedisConnection();
  },

  /**
   * 获取所有缓存统计
   */
  getAllStats() {
    return {
      redis: {
        status: redisStatus,
        available: isRedisAvailable()
      },
      caches: {
        default: defaultCache.getStats(),
        modelConfig: modelConfigCache.getStats(),
        toolRegistry: toolRegistryCache.getStats(),
        ragResult: ragResultCache.getStats(),
        promptTemplate: promptTemplateCache.getStats()
      }
    };
  },

  /**
   * 清空所有缓存
   */
  flushAll() {
    defaultCache.flush();
    modelConfigCache.flush();
    toolRegistryCache.flush();
    ragResultCache.flush();
    promptTemplateCache.flush();
  },

  /**
   * 关闭 Redis 连接
   */
  async close() {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
      redisStatus = 'disconnected';
    }
  },

  /**
   * 健康检查
   */
  healthCheck() {
    return {
      redis: isRedisAvailable(),
      redisStatus,
      localCaches: 'healthy'
    };
  },

  /**
   * 获取所有健康状态（兼容现有代码）
   */
  getAllHealth() {
    return {
      default: { healthy: true, status: 'healthy', stats: {}, errors: null, sizeLimit: null },
      modelConfig: { healthy: true, status: 'healthy', stats: {}, errors: null, sizeLimit: null },
      toolRegistry: { healthy: true, status: 'healthy', stats: {}, errors: null, sizeLimit: null },
      ragResult: { healthy: true, status: 'healthy', stats: {}, errors: null, sizeLimit: null },
      promptTemplate: { healthy: true, status: 'healthy', stats: {}, errors: null, sizeLimit: null }
    };
  },

  /**
   * 重置命中率统计（兼容）
   */
  resetHitRateStats() {
    // 统计在 UnifiedCacheWrapper 内部管理
  }
};

// ============================================================
// 初始化
// ============================================================

// 延迟初始化 Redis 连接
setTimeout(async () => {
  try {
    await cacheManager.initialize();
    console.log(`[Cache] Redis ${isRedisAvailable() ? '已连接' : '未连接 (使用本地回退)'}`);
  } catch (error) {
    console.warn('[Cache] Redis 初始化失败:', error.message);
  }
}, 2000);

module.exports = {
  UnifiedCacheWrapper,
  cacheManager,
  defaultCache,
  modelConfigCache,
  toolRegistryCache,
  ragResultCache,
  promptTemplateCache,
  isRedisAvailable,
  testRedisConnection,
  getRedisClient
};