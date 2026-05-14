/**
 * SSE 流式推送端点 - 管理后台实时数据推送
 * @description 提供实时系统统计和 Qdrant 状态变更推送
 */
const express = require('express');
const router = express.Router();
const { getMetricsCollector } = require('../../infra/metrics/MetricsCollector');

/**
 * SSE 流式推送端点
 * GET /api/admin/stream
 *
 * 推送格式：
 * - stats: 每 5 秒推送系统统计
 * - qdrant_status: Qdrant 状态变更时推送
 */
router.get('/', (req, res) => {
  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲

  // 发送初始连接确认
  res.write('data: {"type":"connected","data":{"timestamp":"' + new Date().toISOString() + '"}}\n\n');

  // 获取 MetricsCollector 实例
  const metricsCollector = getMetricsCollector();

  // 定时器引用，用于清理
  let statsInterval = null;
  let qdrantCheckInterval = null;
  let lastQdrantStatus = null;

  /**
   * 推送系统统计
   */
  const pushStats = () => {
    try {
      const stats = metricsCollector.getSummaryMetrics();
      const statsData = {
        type: 'stats',
        data: {
          totalRequests: metricsCollector.getCounterSum('http_requests_total'),
          successRate: ((1 - metricsCollector.calculateErrorRate()) * 100).toFixed(2),
          avgLatency: stats.latency?.avg?.toFixed(2) || 0,
          p50Latency: stats.latency?.p50?.toFixed(2) || 0,
          p95Latency: stats.latency?.p95?.toFixed(2) || 0,
          p99Latency: stats.latency?.p99?.toFixed(2) || 0,
          activeRequests: stats.http?.activeRequests || 0,
          cpuUsage: stats.system?.cpuUsage || 0,
          memoryUsage: stats.system?.memoryUsage || 0,
          modelTokens: stats.model?.totalTokens || 0,
          modelRequests: stats.model?.totalRequests || 0,
          modelErrors: stats.model?.errors || 0,
          toolCalls: stats.tool?.totalCalls || 0,
          toolErrors: stats.tool?.errors || 0,
          queueLength: stats.queue?.length || 0,
          queueCapacity: stats.queue?.capacity || 0,
          activeAgents: stats.agents?.active || 0,
          timestamp: new Date().toISOString()
        }
      };

      res.write('data: ' + JSON.stringify(statsData) + '\n\n');
    } catch (error) {
      console.error('[AdminStream] 推送统计失败:', error.message);
    }
  };

  /**
   * 检查并推送 Qdrant 状态
   */
  const checkQdrantStatus = async () => {
    try {
      const QdrantService = require('../../services/QdrantService');
      const qdrantStatus = await QdrantService.getStatus();

      // 只有状态变更时才推送
      const statusKey = JSON.stringify(qdrantStatus);
      if (lastQdrantStatus !== statusKey) {
        lastQdrantStatus = statusKey;

        const qdrantData = {
          type: 'qdrant_status',
          data: {
            success: qdrantStatus.success,
            healthy: qdrantStatus.healthy,
            status: qdrantStatus.healthy ? 'green' : 'red',
            collections: qdrantStatus.collections || 0,
            vectors: qdrantStatus.vectors || 0,
            timestamp: new Date().toISOString()
          }
        };

        res.write('data: ' + JSON.stringify(qdrantData) + '\n\n');
      }
    } catch (error) {
      // Qdrant 连接失败时推送错误状态
      const errorData = {
        type: 'qdrant_status',
        data: {
          success: false,
          healthy: false,
          status: 'unavailable',
          error: error.message,
          timestamp: new Date().toISOString()
        }
      };
      res.write('data: ' + JSON.stringify(errorData) + '\n\n');
    }
  };

  /**
   * 处理客户端断开连接
   */
  const cleanup = () => {
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
    if (qdrantCheckInterval) {
      clearInterval(qdrantCheckInterval);
      qdrantCheckInterval = null;
    }
    console.log('[AdminStream] 客户端断开连接');
  };

  // 注册客户端断开事件
  req.on('close', cleanup);
  req.on('error', cleanup);

  // 立即推送一次初始统计
  pushStats();

  // 每 5 秒推送系统统计
  statsInterval = setInterval(pushStats, 5000);

  // 每 10 秒检查 Qdrant 状态
  qdrantCheckInterval = setInterval(checkQdrantStatus, 10000);

  console.log('[AdminStream] 新 SSE 连接建立');
});

/**
 * 获取当前统计数据（非流式）
 * GET /api/admin/stream/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const metricsCollector = getMetricsCollector();
    const stats = metricsCollector.getSummaryMetrics();
    const QdrantService = require('../../services/QdrantService');

    let qdrantStatus = null;
    try {
      qdrantStatus = await QdrantService.getStatus();
    } catch (e) {
      qdrantStatus = { success: false, healthy: false, error: e.message };
    }

    res.json({
      success: true,
      stats: {
        totalRequests: metricsCollector.getCounterSum('http_requests_total'),
        successRate: ((1 - metricsCollector.calculateErrorRate()) * 100).toFixed(2) + '%',
        avgLatency: stats.latency?.avg?.toFixed(2) || 0,
        activeRequests: stats.http?.activeRequests || 0,
        cpuUsage: stats.system?.cpuUsage || 0,
        memoryUsage: stats.system?.memoryUsage || 0,
        modelTokens: stats.model?.totalTokens || 0,
        modelRequests: stats.model?.totalRequests || 0,
        toolCalls: stats.tool?.totalCalls || 0,
        queueLength: stats.queue?.length || 0,
      },
      qdrant: qdrantStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;