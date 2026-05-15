/**
 * Admin SSE Stream Route
 * 实时推送系统统计和Qdrant状态到管理后台
 *
 * @date 2026-05-14
 */

const express = require('express');
const router = express.Router();
const { AgentLogger } = require('../../infra/logger/AgentLogger');
const { Errors } = require('../../common/errors');
const path = require('path');
const fsSync = require('fs');
const fsPromises = fsSync.promises;

const logger = new AgentLogger('admin-stream');

// 缓存配置
const CACHE_TTL = 30;
const cache = new Map();
const cacheTimestamps = new Map();

function getCached(key) {
  if (cache.has(key)) {
    const timestamp = cacheTimestamps.get(key);
    if (Date.now() - timestamp < CACHE_TTL * 1000) {
      return cache.get(key);
    }
    cache.delete(key);
    cacheTimestamps.delete(key);
  }
  return null;
}

function setCached(key, value) {
  cache.set(key, value);
  cacheTimestamps.set(key, Date.now());
}

function getRegistry(req) {
  const registry = req.app.get('toolRegistry');
  if (!registry) {
    throw Errors.unavailable('Tool registry not initialized');
  }
  return registry;
}

async function getSessionStatsAsync() {
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

    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const statPromises = files.slice(0, 100).map(async (file) => {
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

async function getKnowledgeBaseStatsAsync() {
  const cached = getCached('knowledgeBaseStats');
  if (cached) return cached;

  const dataDir = path.join(process.cwd(), 'data', 'rag');
  const knowledgeBasesMap = new Map();

  try {
    const exists = fsSync.existsSync(dataDir);
    if (!exists) {
      setCached('knowledgeBaseStats', []);
      return [];
    }

    const files = (await fsPromises.readdir(dataDir)).filter(f => f.endsWith('.json'));

    const batchSize = 20;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (file) => {
          try {
            const filePath = path.join(dataDir, file);
            const content = await fsPromises.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);
            const name = data.name || file.replace('.json', '');
            return { name, docCount: data.documents?.length || 0 };
          } catch {
            return null;
          }
        })
      );
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

function getMetricsStats() {
  try {
    const { getMetricsCollector } = require('../../infra/metrics');
    const collector = getMetricsCollector();
    const totalRequests = collector.getCounterSum('http_requests_total');
    const modelErrors = collector.getGaugeValue('model_errors_total');
    const toolErrors = collector.getGaugeValue('tool_errors_total');
    const totalErrors = modelErrors + toolErrors;
    const successRate = totalRequests > 0 ? (totalRequests - totalErrors) / totalRequests : 1;
    const latency = collector.extractLatencyMetrics();
    return {
      totalRequests,
      successRate: Math.max(0, Math.min(1, successRate)),
      avgLatency: latency.avg || 0
    };
  } catch {
    return { totalRequests: 0, successRate: 1, avgLatency: 0 };
  }
}

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

function getToolCalls(registry) {
  const tools = registry.listTools();
  return tools.map(t => {
    const stats = registry.getToolStats(t.name);
    return { tool: t.name, count: stats?.totalCalls || 0 };
  }).filter(t => t.count > 0).sort((a, b) => b.count - a.count);
}

async function collectStats(req) {
  try {
    const registry = getRegistry(req);

    const [sessionStats, knowledgeBases] = await Promise.all([
      getSessionStatsAsync(),
      getKnowledgeBaseStatsAsync()
    ]);

    const metricsStats = getMetricsStats();
    const modelCalls = getModelStats();
    const toolCalls = getToolCalls(registry);

    return {
      totalRequests: metricsStats.totalRequests,
      successRate: metricsStats.successRate,
      avgLatency: metricsStats.avgLatency,
      activeSessions: sessionStats.activeSessions,
      modelCalls,
      toolCalls,
      knowledgeBases
    };
  } catch (error) {
    logger.error('收集统计数据失败', { error: error.message });
    return null;
  }
}

async function getQdrantStatus() {
  try {
    const axios = require('axios');
    const qdrantHost = process.env.QDRANT_HOST || 'localhost';
    const qdrantPort = process.env.QDRANT_PORT || 6333;

    const response = await axios.get(`http://${qdrantHost}:${qdrantPort}/collections`, {
      timeout: 3000
    });

    return {
      success: true,
      healthy: true,
      status: 'ready',
      collections: response.data?.result?.collections || []
    };
  } catch (error) {
    return {
      success: false,
      healthy: false,
      status: 'unavailable',
      collections: []
    };
  }
}

async function getCollectionInfo(collectionName) {
  try {
    const axios = require('axios');
    const qdrantHost = process.env.QDRANT_HOST || 'localhost';
    const qdrantPort = process.env.QDRANT_PORT || 6333;

    const response = await axios.get(`http://${qdrantHost}:${qdrantPort}/collections/${collectionName}`, {
      timeout: 3000
    });

    const info = response.data?.result;
    return {
      name: collectionName,
      vectorsCount: info?.vectors_count || 0,
      pointsCount: info?.points_count || 0,
      status: info?.status || 'unknown',
      indexed: info?.indexed || false
    };
  } catch {
    return {
      name: collectionName,
      vectorsCount: 0,
      pointsCount: 0,
      status: 'error',
      indexed: false
    };
  }
}

/**
 * SSE Stream Endpoint
 * GET /api/admin/stream
 */
router.get('/', async (req, res) => {
  const clientId = `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  logger.info('SSE客户端连接', { clientId });

  // 发送连接成功消息
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

  const PUSH_INTERVAL = 5000;
  let lastQdrantHealthy = null;

  const pushStats = async () => {
    try {
      // 收集统计数据
      const stats = await collectStats(req);
      if (stats) {
        res.write(`data: ${JSON.stringify({ type: 'stats', data: stats })}\n\n`);
      }

      // 检查Qdrant状态
      const qdrantStatus = await getQdrantStatus();
      res.write(`data: ${JSON.stringify({ type: 'qdrant_status', data: qdrantStatus })}\n\n`);

      // 如果Qdrant状态变更或首次连接，推送集合列表
      if (lastQdrantHealthy !== qdrantStatus.healthy || lastQdrantHealthy === null) {
        lastQdrantHealthy = qdrantStatus.healthy;

        if (qdrantStatus.healthy && qdrantStatus.collections.length > 0) {
          const collectionInfos = await Promise.all(
            qdrantStatus.collections.map(c => getCollectionInfo(c.name))
          );
          res.write(`data: ${JSON.stringify({ type: 'qdrant_collections', data: collectionInfos })}\n\n`);
        }
      }
    } catch (error) {
      logger.error('推送统计数据失败', { error: error.message });
    }
  };

  // 立即推送一次
  await pushStats();

  // 设置定时推送
  const intervalId = setInterval(pushStats, PUSH_INTERVAL);

  // 心跳保活
  const heartbeatId = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
    } catch (error) {
      clearInterval(intervalId);
      clearInterval(heartbeatId);
      logger.info('SSE客户端断开', { clientId });
    }
  }, 30000);

  const cleanup = () => {
    clearInterval(intervalId);
    clearInterval(heartbeatId);
    logger.info('SSE连接清理', { clientId });
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
});

module.exports = router;