/**
 * Metrics API 路由
 * 提供系统指标查询接口，对接 MetricsCollector
 *
 * @swagger
 * tags:
 *   - name: metrics
 *     description: 性能指标接口
 */

const express = require('express');
const router = express.Router();
const { getMetricsCollector } = require('../infra/metrics');

// 获取 MetricsCollector 实例
const getCollector = () => {
  try {
    return getMetricsCollector();
  } catch {
    return null;
  }
};

/**
 * GET /api/metrics
 * 返回 Prometheus 格式的指标
 */
router.get('/', (_req, res) => {
  const collector = getCollector();
  if (collector) {
    res.set('Content-Type', 'text/plain');
    res.send(collector.toPrometheusFormat());
  } else {
    res.set('Content-Type', 'text/plain');
    res.send('# No metrics available\n');
  }
});

/**
 * GET /api/metrics/summary
 * 返回 JSON 格式的指标摘要
 */
router.get('/summary', (_req, res) => {
  const collector = getCollector();
  if (collector) {
    res.json(collector.getSummaryMetrics());
  } else {
    res.json({
      timestamp: new Date().toISOString(),
      system: { cpuUsage: 0, memoryUsage: 0 },
      http: { activeRequests: 0, totalRequests: 0, errorRate: 0 },
      latency: { p50: 0, p95: 0, p99: 0, avg: 0, max: 0 },
      model: { totalTokens: 0, totalRequests: 0, errors: 0 },
      tool: { totalCalls: 0, errors: 0, avgDuration: 0 },
      queue: { length: 0, capacity: 0 },
      agents: { active: 0 },
      histogram: {},
      summary: {},
    });
  }
});

/**
 * GET /api/metrics/realtime
 * 返回实时性能监控数据（供 PerformanceMonitor 使用）
 */
router.get('/realtime', (_req, res) => {
  const collector = getCollector();
  if (collector) {
    res.json(collector.getRealtimeMetrics());
  } else {
    res.json({
      timestamp: new Date().toISOString(),
      performance: { avgResponseTime: 0, minResponseTime: 0, maxResponseTime: 0, p95ResponseTime: 0, p99ResponseTime: 0 },
      throughput: { requestsPerMinute: 0, totalRequests: 0 },
      success: { successRate: 100, errorRate: 0 },
      system: { cpuUsage: 0, memoryUsage: 0 },
      agents: { activeAgents: 0, runningTasks: 0, queuedTasks: 0 },
      tokens: { totalTokens: 0, tokensPerMinute: 0 },
      iterations: { avgIterations: 0, avgToolCalls: 0 },
      cost: { totalCost: 0, costPerRequest: 0 },
      alerts: [],
    });
  }
});

module.exports = router;
