/**
 * 负载保护中间件 - 系统稳定性保护
 *
 * 功能:
 * - 实时负载检测
 * - 智能队列管理
 * - 降级策略
 * - 系统负载统计
 */

const os = require('os');

const QUEUE_STRATEGY = {
  FIFO: 'fifo',
  PRIORITY: 'priority',
  FAIR: 'fair',
};

const DEGRADATION_MODE = {
  QUEUE: 'queue',
  REJECT: 'reject',
  DELAY: 'delay',
};

// 负载检测配置
const LOAD_CONFIG = {
  low: { maxConcurrent: 100, queueLimit: 200, weight: 1 },
  medium: { maxConcurrent: 50, queueLimit: 100, weight: 2 },
  high: { maxConcurrent: 20, queueLimit: 50, weight: 3 },
  critical: { maxConcurrent: 5, queueLimit: 10, weight: 5 },
};

// 队列存储
let requestQueue = [];
let processingCount = 0;
let rejectedCount = 0;
let delayedCount = 0;
let totalProcessed = 0;

// 负载等级
let currentLoadLevel = 'low';

// 统计
const stats = {
  totalRequests: 0,
  rejected: 0,
  delayed: 0,
  queued: 0,
  avgWaitTime: 0,
  lastUpdate: Date.now(),
};

/**
 * 获取系统负载信息
 */
function getSystemStats() {
  const cpuLoad = os.loadavg();
  const freeMemory = os.freemem();
  const totalMemory = os.totalmem();
  const memoryUsage = ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2);

  return {
    loadAverage: cpuLoad.map(l => l.toFixed(2)),
    memoryUsage: `${memoryUsage}%`,
    freeMemory: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)}GB`,
    totalMemory: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)}GB`,
    queueLength: requestQueue.length,
    processing: processingCount,
    loadLevel: currentLoadLevel,
    totalProcessed,
    rejected: rejectedCount,
    delayed: delayedCount,
    uptime: process.uptime(),
  };
}

/**
 * 获取负载等级
 */
function getLoadLevel() {
  const cpuLoad = os.loadavg()[0];
  const freeMemory = os.freemem() / os.totalmem();

  if (cpuLoad > 10 || freeMemory < 0.1) {
    currentLoadLevel = 'critical';
  } else if (cpuLoad > 5 || freeMemory < 0.2) {
    currentLoadLevel = 'high';
  } else if (cpuLoad > 2 || freeMemory < 0.4) {
    currentLoadLevel = 'medium';
  } else {
    currentLoadLevel = 'low';
  }

  return currentLoadLevel;
}

/**
 * 获取降级模式
 */
function getDegradationMode() {
  const loadLevel = getLoadLevel();
  if (loadLevel === 'critical') {
    return DEGRADATION_MODE.DELAY;
  }
  return DEGRADATION_MODE.QUEUE;
}

/**
 * 计算建议的等待时间
 */
function calculateWaitTime(queueLength) {
  return Math.min(queueLength * 100, 10000);
}

/**
 * 健康检查
 */
function healthCheck() {
  const loadLevel = getLoadLevel();
  const queueLength = requestQueue.length;
  const processing = processingCount;

  const healthy = loadLevel !== 'critical' && queueLength < 200 && processing < 100;

  return {
    status: healthy ? 'healthy' : 'degraded',
    loadLevel,
    queueLength,
    processing,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 负载保护中间件
 */
function loadProtectionMiddleware(req, res, next) {
  const startTime = Date.now();
  const loadLevel = getLoadLevel();
  const config = LOAD_CONFIG[loadLevel];

  stats.totalRequests++;

  const queueLength = requestQueue.length;
  const processing = processingCount;

  res.set({
    'X-Load-Level': loadLevel,
    'X-Queue-Length': queueLength,
    'X-Processing': processing,
    'X-Estimated-Wait': calculateWaitTime(queueLength),
  });

  if (queueLength > 50 && getDegradationMode() === DEGRADATION_MODE.DELAY) {
    const delay = Math.random() * 2000 + 1000;
    delayedCount++;
    stats.delayed++;

    setTimeout(() => {
      processingCount++;
      totalProcessed++;

      res.on('finish', () => {
        processingCount--;
        stats.avgWaitTime = (stats.avgWaitTime + (Date.now() - startTime)) / 2;
        stats.lastUpdate = Date.now();
      });

      next();
    }, delay);
    return;
  }

  if (queueLength >= config.queueLimit) {
    rejectedCount++;
    stats.rejected++;
    stats.queued = queueLength;

    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_OVERLOADED',
        message: '服务负载过高，请稍后再试',
        loadLevel,
        queueLength,
      },
      retryAfter: 5,
    });
  }

  const queueItem = {
    id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: startTime,
    loadLevel,
  };

  requestQueue.push(queueItem);
  stats.queued = requestQueue.length;

  processingCount++;
  totalProcessed++;

  res.on('finish', () => {
    processingCount--;
    requestQueue = requestQueue.filter(item => item.id !== queueItem.id);
    stats.avgWaitTime = (stats.avgWaitTime + (Date.now() - startTime)) / 2;
    stats.lastUpdate = Date.now();
  });

  next();
}

/**
 * 记录请求
 */
function recordRequest() {
  processingCount++;
  totalProcessed++;
}

/**
 * 重置统计
 */
function resetStats() {
  stats.totalRequests = 0;
  stats.rejected = 0;
  stats.delayed = 0;
  stats.queued = 0;
  stats.avgWaitTime = 0;
  stats.lastUpdate = Date.now();
  rejectedCount = 0;
  delayedCount = 0;
  requestQueue = [];
  processingCount = 0;
  totalProcessed = 0;
}

module.exports = {
  loadProtectionMiddleware,
  getSystemStats,
  getLoadLevel,
  healthCheck,
  recordRequest,
  resetStats,
  QUEUE_STRATEGY,
  DEGRADATION_MODE,
};