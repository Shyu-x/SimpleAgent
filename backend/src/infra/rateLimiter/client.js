/**
 * Redis 客户端工厂
 * @desc 统一管理 Redis 连接
 */

const { createClient } = require('redis');

let defaultClient = null;

/**
 * 创建 Redis 客户端
 * @param {string} [url] - Redis URL
 * @returns {Promise<object>}
 */
async function createRedisClient(url = null) {
  const redisUrl = url || process.env.REDIS_URL || 'redis://localhost:6379';

  const client = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('[Redis] 连接重试次数过多, 停止重连');
          return false;
        }
        return Math.min(retries * 100, 3000);
      },
    },
  });

  client.on('error', (err) => {
    console.error('[Redis] 客户端错误:', err.message);
  });

  client.on('connect', () => {
    console.log('[Redis] 已连接');
  });

  client.on('ready', () => {
    console.log('[Redis] 就绪');
  });

  client.on('reconnecting', () => {
    console.warn('[Redis] 正在重连...');
  });

  await client.connect();
  return client;
}

/**
 * 获取默认 Redis 客户端 (单例)
 * @returns {Promise<object>}
 */
async function getDefaultClient() {
  if (!defaultClient || !defaultClient.isOpen) {
    try {
      defaultClient = await createRedisClient();
    } catch (error) {
      console.warn('[Redis] 创建默认客户端失败:', error.message);
      return null;
    }
  }
  return defaultClient;
}

/**
 * 关闭所有 Redis 连接
 */
async function closeAll() {
  if (defaultClient && defaultClient.isOpen) {
    await defaultClient.quit();
    defaultClient = null;
  }
}

/**
 * 检查 Redis 是否可用
 * @returns {boolean}
 */
function isAvailable() {
  return defaultClient && defaultClient.isOpen;
}

module.exports = {
  createRedisClient,
  getDefaultClient,
  closeAll,
  isAvailable,
};
