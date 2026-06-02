/**
 * Redis 客户端工厂 (ioredis)
 * @desc 统一管理 Redis 连接
 */

const Redis = require('ioredis');
const { createLogger } = require('../logger/AgentLogger');

const logger = createLogger('redisClient');

let defaultClient = null;

/**
 * 创建 Redis 客户端
 * @param {string} [url] - Redis URL
 * @returns {object}
 */
function createRedisClient(url = null) {
  const redisUrl = url || process.env.REDIS_URL || 'redis://localhost:6379';

  const client = new Redis(redisUrl, {
    retryStrategy: (retries) => {
      if (retries > 10) {
        logger.error('连接重试次数过多, 停止重连');
        return false;
      }
      return Math.min(retries * 100, 3000);
    },
    maxRetriesPerRequest: 3,
  });

  client.on('error', (err) => {
    logger.error('客户端错误', { error: err.message });
  });

  client.on('connect', () => {
    logger.info('已连接');
  });

  client.on('ready', () => {
    logger.info('就绪');
  });

  client.on('reconnecting', () => {
    logger.warn('正在重连...');
  });

  return client;
}

/**
 * 获取默认 Redis 客户端 (单例)
 * @returns {object}
 */
function getDefaultClient() {
  if (!defaultClient || !defaultClient.status || defaultClient.status === 'close') {
    try {
      defaultClient = createRedisClient();
    } catch (error) {
      logger.warn('创建默认客户端失败', { error: error.message });
      return null;
    }
  }
  return defaultClient;
}

/**
 * 关闭所有 Redis 连接
 */
async function closeAll() {
  if (defaultClient) {
    await defaultClient.quit();
    defaultClient = null;
  }
}

/**
 * 检查 Redis 是否可用
 * @returns {boolean}
 */
function isAvailable() {
  return defaultClient && defaultClient.status === 'ready';
}

module.exports = {
  createRedisClient,
  getDefaultClient,
  closeAll,
  isAvailable,
};
