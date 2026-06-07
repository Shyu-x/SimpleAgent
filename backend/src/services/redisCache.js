/**
 * Redis 缓存服务 - 双层缓存架构
 *
 * 主缓存: Redis (分布式缓存，支持多实例共享)
 * 回退缓存: node-cache (进程内缓存，Redis 不可用时自动启用)
 *
 * @date 2026-05-15
 */

const NodeCache = require('node-cache');
const Redis = require('ioredis');
const { EventEmitter } = require('events');
const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('redisCache');

// ============================================================
// Redis 客户端管理器
// ============================================================

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6380', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetriesPerRequest: 2,
  lazyConnect: true,
  enableOfflineQueue: false,  // 离线时快速失败
  retryStrategy: (retries) => {
    if (retries > MAX_REDIS_RETRIES) {
      redisStatus = 'error';
      return false;  // 停止重连
    }
    return Math.min(retries * 200, 2000);
  },
  connectTimeout: 5000,  // 5秒连接超时
};

let redisClient = null;
let redisStatus = 'disconnected';  // 'connected' | 'disconnected' | 'error'
let redisRetryCount = 0;
const MAX_REDIS_RETRIES = 3;  // 最多重试3次，避免无限重连

/**
 * 获取 Redis 客户端
 */
function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(redisConfig);

    redisClient.on('connect', () => {
      redisStatus = 'connected';
      logger.info('Redis 已连接');
    });

    redisClient.on('error', (err) => {
      redisStatus = 'error';
      logger.warn('Redis 错误', { error: err.message });
    });

    redisClient.on('close', () => {
      redisStatus = 'disconnected';
      logger.info('Redis 连接已关闭');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis 正在重连...');
    });
  }
  return redisClient;
}

/**
 * 测试 Redis 连接
 */
async function testRedisConnection() {
  try {
    const client = getRedisClient();
    // 设置较短的超时避免长时间阻塞
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
// Redis 缓存包装器 (同步接口 + 回退)
// ============================================================

class RedisCacheWrapper {
  constructor(prefix = 'cache:') {
    this.prefix = prefix;
    this.localCache = new NodeCache({
      stdTTL: 300,
      checkperiod: 60,
      useClones: true
    });

    // 统计信息
    this.stats = {
      redisHits: 0,
      redisMisses: 0,
      localHits: 0,
      localMisses: 0,
      sets: 0,
      errors: 0
    };
  }

  /**
   * 序列化值
   */
  _serialize(value) {
    return JSON.stringify(value);
  }

  /**
   * 反序列化值
   */
  _deserialize(value) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * 添加 Redis 前缀的键
   */
  _key(key) {
    return `${this.prefix}${key}`;
  }

  /**
   * 设置缓存 (先写 Redis，失败时写本地)
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
        // 同时写入本地缓存作为备份
        this.localCache.set(key, value, ttlSeconds);
        return true;
      } catch (error) {
        this.stats.errors++;
        // Redis 失败，写入本地缓存
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
   * 获取缓存 (优先从 Redis 获取，失败时读本地)
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
          // 更新本地缓存
          this.localCache.set(key, deserialized);
          return deserialized;
        }

        // Redis 未命中，检查本地缓存
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
        // Redis 失败，读本地缓存
        const localValue = this.localCache.get(key);
        if (localValue !== undefined) {
          this.stats.localHits++;
          return localValue;
        }
        this.stats.localMisses++;
        return null;
      }
    }

    // Redis 不可用，直接读本地缓存
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

    // 先删除 Redis
    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        await client.del(fullKey);
      } catch (error) {
        // 忽略 Redis 删除错误
      }
    }

    // 删除本地缓存
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
        const exists = await client.exists(fullKey);
        return exists === 1;
      } catch (error) {
        // 降级到本地检查
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
            const deserialized = this._deserialize(value);
            results[keys[i]] = deserialized;
            this.stats.redisHits++;
          } else {
            // 降级到本地缓存
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

    // Redis 不可用，读本地缓存
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
    let success = true;

    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        const pipeline = client.pipeline();

        for (const [key, value] of Object.entries(keyValuePairs)) {
          const fullKey = this._key(key);
          pipeline.setex(fullKey, ttlSeconds, this._serialize(value));
        }

        await pipeline.exec();
      } catch (error) {
        this.stats.errors++;
        success = false;
      }
    }

    // 同时写入本地缓存
    for (const [key, value] of Object.entries(keyValuePairs)) {
      this.localCache.set(key, value, ttlSeconds);
    }

    this.stats.sets += Object.keys(keyValuePairs).length;
    return success;
  }

  /**
   * 按模式删除
   */
  async deletePattern(pattern) {
    let deletedCount = 0;

    // 删除本地缓存中匹配的模式
    const localKeys = this.localCache.keys();
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');

    for (const key of localKeys) {
      if (regex.test(key)) {
        this.localCache.del(key);
        deletedCount++;
      }
    }

    // 删除 Redis 中匹配的模式
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
   * 获取统计信息
   */
  getStats() {
    const total = this.stats.redisHits + this.stats.redisMisses + this.stats.localHits + this.stats.localMisses;
    const hitRate = total > 0
      ? (this.stats.redisHits + this.stats.localHits) / total
      : 0;

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
   * 清空所有缓存
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
        // 忽略错误
      }
    }
  }
}

// ============================================================
// 预配置的缓存实例
// ============================================================

// 模型配置缓存 (长TTL)
const modelConfigCache = new RedisCacheWrapper('model:config:');
// 设置更长的 TTL
modelConfigCache.set = async function(key, value, ttlSeconds = 3600) {
  return RedisCacheWrapper.prototype.set.call(this, key, value, ttlSeconds);
};

// 工具注册表缓存
const toolRegistryCache = new RedisCacheWrapper('tool:registry:');

// RAG 检索结果缓存 (短TTL)
const ragResultCache = new RedisCacheWrapper('rag:result:');

// Prompt 模板缓存
const promptTemplateCache = new RedisCacheWrapper('prompt:template:');

// 默认缓存
const defaultCache = new RedisCacheWrapper('cache:default:');

// ============================================================
// 缓存管理器
// ============================================================

const cacheManager = {
  default: defaultCache,
  modelConfig: modelConfigCache,
  toolRegistry: toolRegistryCache,
  ragResult: ragResultCache,
  promptTemplate: promptTemplateCache,

  // 初始化 Redis 连接
  async initialize() {
    return await testRedisConnection();
  },

  // 获取所有缓存的统计
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

  // 清空所有缓存
  flushAll() {
    defaultCache.flush();
    modelConfigCache.flush();
    toolRegistryCache.flush();
    ragResultCache.flush();
    promptTemplateCache.flush();
  },

  // 关闭 Redis 连接
  async close() {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
      redisStatus = 'disconnected';
    }
  },

  // 健康检查
  healthCheck() {
    return {
      redis: isRedisAvailable(),
      redisStatus,
      localCaches: 'healthy'
    };
  }
};

module.exports = {
  RedisCacheWrapper,
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