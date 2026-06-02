/**
 * Redis 客户端
 * 提供分布式缓存层
 */
const Redis = require('ioredis');
const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('redis');

// 配置
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  lazyConnect: true,
};

// 全局单例
let redisClient = null;
let redisPubClient = null;
let redisSubClient = null;

/**
 * 获取 Redis 主客户端
 */
function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(redisConfig);

    redisClient.on('connect', () => {
      logger.info('Redis 客户端已连接');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis 错误', { error: err.message });
    });
  }
  return redisClient;
}

/**
 * 获取发布客户端 (用于发布消息)
 */
function getRedisPubClient() {
  if (!redisPubClient) {
    redisPubClient = new Redis(redisConfig);
  }
  return redisPubClient;
}

/**
 * 获取订阅客户端 (用于订阅消息)
 */
function getRedisSubClient() {
  if (!redisSubClient) {
    redisSubClient = new Redis(redisConfig);
  }
  return redisSubClient;
}

/**
 * 初始化 Redis 连接
 */
async function initializeRedis() {
  try {
    const client = getRedisClient();
    await client.connect();
    logger.info('Redis 连接成功');
    return true;
  } catch (error) {
    logger.error('Redis 连接失败', { error: error.message });
    return false;
  }
}

/**
 * 关闭 Redis 连接
 */
async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
  if (redisPubClient) {
    await redisPubClient.quit();
    redisPubClient = null;
  }
  if (redisSubClient) {
    await redisSubClient.quit();
    redisSubClient = null;
  }
  logger.info('Redis 连接已关闭');
}

/**
 * 缓存工具函数
 */
const cacheUtils = {
  /**
   * 设置缓存
   */
  async set(key, value, ttlSeconds = 3600) {
    const client = getRedisClient();
    const serialized = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await client.setex(key, ttlSeconds, serialized);
    } else {
      await client.set(key, serialized);
    }
  },

  /**
   * 获取缓存
   */
  async get(key) {
    const client = getRedisClient();
    const value = await client.get(key);
    if (value) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return null;
  },

  /**
   * 删除缓存
   */
  async del(key) {
    const client = getRedisClient();
    return await client.del(key);
  },

  /**
   * 检查键是否存在
   */
  async exists(key) {
    const client = getRedisClient();
    return await client.exists(key);
  },

  /**
   * 设置过期时间
   */
  async expire(key, ttlSeconds) {
    const client = getRedisClient();
    return await client.expire(key, ttlSeconds);
  },

  /**
   * 获取 TTL
   */
  async ttl(key) {
    const client = getRedisClient();
    return await client.ttl(key);
  },

  /**
   * 模糊删除 (用于模式匹配)
   */
  async deletePattern(pattern) {
    const client = getRedisClient();
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      return await client.del(...keys);
    }
    return 0;
  },

  /**
   * 哈希表操作
   */
  async hset(key, field, value) {
    const client = getRedisClient();
    return await client.hset(key, field, JSON.stringify(value));
  },

  async hget(key, field) {
    const client = getRedisClient();
    const value = await client.hget(key, field);
    if (value) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return null;
  },

  async hgetall(key) {
    const client = getRedisClient();
    const result = await client.hgetall(key);
    const parsed = {};
    for (const [k, v] of Object.entries(result)) {
      try {
        parsed[k] = JSON.parse(v);
      } catch {
        parsed[k] = v;
      }
    }
    return parsed;
  },

  async hdel(key, ...fields) {
    const client = getRedisClient();
    return await client.hdel(key, ...fields);
  },

  /**
   * 列表操作
   */
  async lpush(key, ...values) {
    const client = getRedisClient();
    const serialized = values.map(v => JSON.stringify(v));
    return await client.lpush(key, ...serialized);
  },

  async lrange(key, start, stop) {
    const client = getRedisClient();
    const result = await client.lrange(key, start, stop);
    return result.map(v => {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    });
  },

  /**
   * 原子计数器
   */
  async incr(key) {
    const client = getRedisClient();
    return await client.incr(key);
  },

  async incrby(key, amount) {
    const client = getRedisClient();
    return await client.incrby(key, amount);
  },

  async decr(key) {
    const client = getRedisClient();
    return await client.decr(key);
  },

  /**
   * 分布式锁
   */
  async lock(key, ttlSeconds = 10) {
    const client = getRedisClient();
    const result = await client.set(`lock:${key}`, process.pid, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  },

  async unlock(key) {
    const client = getRedisClient();
    return await client.del(`lock:${key}`);
  },

  /**
   * 发布/订阅
   */
  async publish(channel, message) {
    const client = getRedisPubClient();
    return await client.publish(channel, JSON.stringify(message));
  },

  subscribe(channel, callback) {
    const client = getRedisSubClient();
    client.subscribe(channel);
    client.on('message', (ch, message) => {
      if (ch === channel) {
        try {
          callback(JSON.parse(message));
        } catch {
          callback(message);
        }
      }
    });
  },
};

module.exports = {
  getRedisClient,
  getRedisPubClient,
  getRedisSubClient,
  initializeRedis,
  closeRedis,
  cacheUtils,
};
