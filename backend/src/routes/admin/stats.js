/**
 * Admin Stats API
 * 提供管理后台仪表盘所需的系统统计信息
 *
 * 优化版: 添加缓存、并行查询、异步操作
 *
 * @date 2026-04-03
 * @updated 2026-05-13 性能优化
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { AgentLogger } = require('../../infra/logger/AgentLogger');
const { AppError } = require('../../common/errors');

const logger = new AgentLogger('admin-stats');

// 缓存配置
const CACHE_TTL = 30; // 30秒缓存
const cache = new Map();
const cacheTimestamps = new Map();

/**
 * 简单的内存缓存
 */
function getCached(key) {
  if (cache.has(key)) {
    const timestamp = cacheTimestamps.get(key);
    if (Date.now() - timestamp < CACHE_TTL * 1000) {
      return cache.get(key);
    }
    // 缓存过期
    cache.delete(key);
    cacheTimestamps.delete(key);
  }
  return null;
}

function setCached(key, value) {
  cache.set(key, value);
  cacheTimestamps.set(key, Date.now());
}

// 工具注册表缓存
let toolRegistryCache = null;
let toolRegistryCacheTime = 0;
const TOOL_CACHE_TTL = 60; // 工具注册表60秒缓存

/**
 * 获取工具注册表实例
 */
function getRegistry(req) {
  const registry = req.app.get('toolRegistry');
  if (!registry) {
    throw Errors.unavailable('Tool registry not initialized');
  }
  return registry;
}

/**
 * 异步读取会话统计
 */
async function getSessionStatsAsync() {
  // 先检查缓存
  const cached = getCached('sessionStats');
  if (cached) return cached;

  const dataDir = path.join(process.cwd(), 'data', 'agent-states');
  let totalSessions = 0;
  let activeSessions = 0;

  try {
    const exists = fsSync.existsSync(dataDir);
    if (!exists) {
      const result = { totalSessions, activeSessions };
      setCached('sessionStats', result);
      return result;
    }

    const files = fsSync.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    totalSessions = files.length;

    // 使用 Promise.all 并行检查活跃会话
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const statPromises = files.slice(0, 100).map(async (file) => { // 限制最多100个文件
      try {
        const stats = await fs.promises.stat(path.join(dataDir, file));
        return stats.mtimeMs > tenMinutesAgo ? 1 : 0;
      } catch {
        return 0;
      }
    });

    const results = await Promise.all(statPromises);
    activeSessions = results.reduce((sum, v) => sum + v, 0);

  } catch (error) {
    logger.warn('读取会话统计失败', { error: error.message });
  }

  const result = { totalSessions, activeSessions };
  setCached('sessionStats', result);
  return result;
}

/**
 * 异步读取 RAG 知识库统计
 */
async function getKnowledgeBaseStatsAsync() {
  const cached = getCached('knowledgeBaseStats');
  if (cached) return cached;

  const dataDir = path.join(process.cwd(), 'data', 'rag');
  const knowledgeBasesMap = new Map(); // 用 Map 去重，以 name 为 key

  try {
    const exists = fsSync.existsSync(dataDir);
    if (!exists) {
      setCached('knowledgeBaseStats', []);
      return [];
    }

    const files = (await fs.readdir(dataDir)).filter(f => f.endsWith('.json'));

    // 注意：不再对 name 做 HTML 转义，因为：
    // 1. JSON API 响应不需要 HTML 转义
    // 2. HTML 转义会导致已损坏的中文字符进一步损坏（如 ĵ֪ʶ）
    // 如果前端在 HTML 中显示此数据，应自行进行 HTML 转义

    // 并行读取文件（限制并发数）
    const batchSize = 20;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (file) => {
          try {
            const filePath = path.join(dataDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);
            const name = data.name || file.replace('.json', '');
            return { name, docCount: data.documents?.length || 0 };
          } catch {
            return null;
          }
        })
      );
      // 使用 Map 自动去重
      for (const result of results) {
        if (result && !knowledgeBasesMap.has(result.name)) {
          knowledgeBasesMap.set(result.name, result);
        }
      }
    }
  } catch (error) {
    logger.warn('读取知识库统计失败', { error: error.message });
  }

  const knowledgeBases = Array.from(knowledgeBasesMap.values());
  setCached('knowledgeBaseStats', knowledgeBases);
  return knowledgeBases;
}

/**
 * 获取模型调用统计
 */
function getModelStats() {
  try {
    const { getMetricsCollector } = require('../../infra/metrics');
    const collector = getMetricsCollector();
    const metrics = collector.getMetrics();
    return metrics.modelCalls || [];
  } catch {
    return [];
  }
}

/**
 * 获取工具调用统计（带缓存）
 */
function getToolCallsWithCache(registry) {
  const now = Date.now();
  if (toolRegistryCache && (now - toolRegistryCacheTime) < TOOL_CACHE_TTL * 1000) {
    return toolRegistryCache;
  }

  const tools = registry.listTools();
  const toolCalls = tools.map(t => {
    const stats = registry.getToolStats(t.name);
    return {
      tool: t.name,
      count: stats?.totalCalls || 0
    };
  }).filter(t => t.count > 0).sort((a, b) => b.count - a.count);

  toolRegistryCache = toolCalls;
  toolRegistryCacheTime = now;
  return toolCalls;
}

/**
 * 获取 Metrics 统计（同步）
 */
function getMetricsStats() {
  try {
    const { getMetricsCollector } = require('../../infra/metrics');
    const collector = getMetricsCollector();
    // totalRequests 应该是所有 http_requests_total 计数器的总和
    const totalRequests = collector.getCounterSum('http_requests_total');
    // 获取错误数
    const modelErrors = collector.getGaugeValue('model_errors_total');
    const toolErrors = collector.getGaugeValue('tool_errors_total');
    const totalErrors = modelErrors + toolErrors;
    // 计算成功率
    const successRate = totalRequests > 0 ? (totalRequests - totalErrors) / totalRequests : 1;
    // 获取延迟
    const latency = collector.extractLatencyMetrics();
    return {
      totalRequests,
      successRate: Math.max(0, Math.min(1, successRate)),
      avgLatency: latency.avg || 0
    };
  } catch {
    return {
      totalRequests: 0,
      successRate: 1,
      avgLatency: 0
    };
  }
}

/**
 * 清除相关缓存（当数据更新时可调用）
 */
function invalidateCaches() {
  cache.delete('sessionStats');
  cache.delete('knowledgeBaseStats');
  cacheTimestamps.delete('sessionStats');
  cacheTimestamps.delete('knowledgeBaseStats');
  toolRegistryCache = null;
  toolRegistryCacheTime = 0;
}

/**
 * GET /api/admin/stats
 * 获取系统统计信息
 *
 * 性能优化:
 * - 缓存30秒
 * - 并行查询
 * - 异步文件操作
 * - 请求超时保护
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const REQUEST_TIMEOUT = 5000; // 5秒超时保护

  try {
    // 设置超时保护
    const timeoutId = setTimeout(() => {
      logger.warn('Stats API 超时', { elapsed: Date.now() - startTime });
    }, REQUEST_TIMEOUT);

    const registry = getRegistry(req);

    // 并行执行所有独立查询
    const [
      sessionStats,
      knowledgeBases,
      metricsStats,
      modelCalls
    ] = await Promise.all([
      getSessionStatsAsync(),
      getKnowledgeBaseStatsAsync(),
      Promise.resolve(getMetricsStats()),
      Promise.resolve(getModelStats())
    ]);

    // 工具统计单独处理（有缓存）
    const toolCalls = getToolCallsWithCache(registry);

    clearTimeout(timeoutId);

    // 组装响应数据
    const stats = {
      totalRequests: metricsStats.totalRequests,
      successRate: metricsStats.successRate,
      avgLatency: metricsStats.avgLatency,
      activeSessions: sessionStats.activeSessions,
      modelCalls,
      toolCalls,
      knowledgeBases
    };

    const elapsed = Date.now() - startTime;
    logger.debug('Stats API 响应', { elapsed, cacheSize: cache.size });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('获取统计信息失败', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/stats/invalidate
 * 清除缓存
 */
router.post('/invalidate', (req, res) => {
  invalidateCaches();
  logger.info('Stats 缓存已清除');
  res.json({ success: true, message: '缓存已清除' });
});

module.exports = router;