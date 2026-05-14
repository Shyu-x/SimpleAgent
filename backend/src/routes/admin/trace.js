/**
 * 链路追踪 API
 * 提供 Trace 查询、详情、Span列表、统计分析
 *
 * @date 2026-04-01
 *
 * @swagger
 * tags:
 *   - name: admin
 *     description: 管理后台接口
 *   - name: traces
 *     description: 链路追踪
 */

const express = require('express');
const router = express.Router();
const { generateTraceId } = require('../../middleware/trace');
const { AgentLogger } = require('../../infra/logger/AgentLogger');

const logger = new AgentLogger('admin-trace');

// 内存追踪存储 - 实际项目应使用分布式追踪系统（如 Jaeger/Zipkin）
const traceStore = new Map();
const MAX_TRACES = 1000;

/**
 * 初始化追踪存储（空启动，等待真实追踪数据）
 */
function initTraceStore() {
  // 追踪数据将由实际请求填充，不再使用模拟数据
  logger.info('追踪存储已初始化，等待真实数据');
}

initTraceStore();

/**
 * GET /api/admin/traces
 * 获取追踪列表
 */
router.get('/', (req, res) => {
  try {
    const { limit = 20, offset = 0, status, service, traceId: traceIdFilter } = req.query;

    let traces = Array.from(traceStore.values());

    // 过滤条件
    if (status) {
      traces = traces.filter(t => t.status === status);
    }
    if (service) {
      traces = traces.filter(t => t.serviceName === service);
    }
    if (traceIdFilter) {
      traces = traces.filter(t => t.traceId.includes(traceIdFilter));
    }

    // 按时间倒序
    traces.sort((a, b) => b.startTime - a.startTime);

    const total = traces.length;
    const pageLimit = Math.min(parseInt(limit) || 20, 100);
    const pageOffset = parseInt(offset) || 0;
    const paginatedTraces = traces.slice(pageOffset, pageOffset + pageLimit);

    // 简化 Span 信息（只返回摘要）
    const simplifiedTraces = paginatedTraces.map(t => ({
      traceId: t.traceId,
      operationName: t.operationName,
      serviceName: t.serviceName,
      startTime: t.startTime,
      endTime: t.endTime,
      duration: t.duration,
      status: t.status,
      totalSpans: t.totalSpans
    }));

    res.json({
      success: true,
      data: {
        traces: simplifiedTraces,
        total,
        limit: pageLimit,
        offset: pageOffset,
        hasMore: pageOffset + pageLimit < total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/traces/stats
 * 获取追踪统计
 * 注意：此路由必须在 /:traceId 之前定义
 */
router.get('/stats', (req, res) => {
  try {
    const traces = Array.from(traceStore.values());
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    // 时间范围过滤
    const recentTraces = traces.filter(t => t.startTime > oneHourAgo);
    const dailyTraces = traces.filter(t => t.startTime > oneDayAgo);

    // 计算统计
    const totalDuration = traces.reduce((sum, t) => sum + t.duration, 0);
    const avgDuration = traces.length > 0 ? Math.round(totalDuration / traces.length) : 0;

    const errorTraces = traces.filter(t => t.status === 'error');
    const recentErrors = recentTraces.filter(t => t.status === 'error');

    // 服务分布
    const serviceCounts = {};
    const operationCounts = {};
    for (const t of traces) {
      serviceCounts[t.serviceName] = (serviceCounts[t.serviceName] || 0) + 1;
      operationCounts[t.operationName] = (operationCounts[t.operationName] || 0) + 1;
    }

    // P50, P90, P99 延迟
    const sortedDurations = traces.map(t => t.duration).sort((a, b) => a - b);
    const p50 = sortedDurations[Math.floor(sortedDurations.length * 0.5)] || 0;
    const p90 = sortedDurations[Math.floor(sortedDurations.length * 0.9)] || 0;
    const p99 = sortedDurations[Math.floor(sortedDurations.length * 0.99)] || 0;

    res.json({
      success: true,
      data: {
        overview: {
          totalTraces: traces.length,
          totalSpans: traces.reduce((sum, t) => sum + t.totalSpans, 0),
          errorCount: errorTraces.length,
          errorRate: traces.length > 0 ? (errorTraces.length / traces.length * 100).toFixed(2) + '%' : '0%'
        },
        recent: {
          lastHour: {
            traces: recentTraces.length,
            errors: recentErrors.length,
            errorRate: recentTraces.length > 0 ? (recentErrors.length / recentTraces.length * 100).toFixed(2) + '%' : '0%'
          },
          lastDay: {
            traces: dailyTraces.length
          }
        },
        performance: {
          avgDuration: avgDuration + 'ms',
          p50Duration: p50 + 'ms',
          p90Duration: p90 + 'ms',
          p99Duration: p99 + 'ms',
          minDuration: sortedDurations[0] || 0 + 'ms',
          maxDuration: sortedDurations[sortedDurations.length - 1] || 0 + 'ms'
        },
        distribution: {
          byService: serviceCounts,
          byOperation: operationCounts
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/traces/:traceId
 * 获取追踪详情
 * 注意：此路由必须在 /stats 之后定义
 */
router.get('/:traceId', (req, res) => {
  try {
    const { traceId } = req.params;
    const trace = traceStore.get(traceId);

    if (!trace) {
      return res.status(404).json({
        success: false,
        error: `追踪 ${traceId} 不存在`
      });
    }

    res.json({
      success: true,
      data: trace
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/traces/:traceId/spans
 * 获取 Span 列表
 */
router.get('/:traceId/spans', (req, res) => {
  try {
    const { traceId } = req.params;
    const trace = traceStore.get(traceId);

    if (!trace) {
      return res.status(404).json({
        success: false,
        error: `追踪 ${traceId} 不存在`
      });
    }

    res.json({
      success: true,
      data: {
        traceId,
        spans: trace.spans,
        total: trace.spans.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/traces
 * 创建新追踪（用于测试）
 */
router.post('/', (req, res) => {
  try {
    const { operationName, serviceName } = req.body;
    const traceId = generateTraceId();

    const trace = {
      traceId,
      operationName: operationName || 'test.operation',
      serviceName: serviceName || 'test-service',
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      totalSpans: 0,
      status: 'running',
      spans: []
    };

    traceStore.set(traceId, trace);

    // 限制存储大小
    if (traceStore.size > MAX_TRACES) {
      const oldestKey = traceStore.keys().next().value;
      traceStore.delete(oldestKey);
    }

    res.status(201).json({
      success: true,
      data: { traceId }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/traces
 * 清空追踪记录
 */
router.delete('/', (req, res) => {
  try {
    const { password } = req.query;

    // 简单验证
    if (password !== 'admin') {
      return res.status(403).json({
        success: false,
        error: '需要管理员密码'
      });
    }

    const count = traceStore.size;
    traceStore.clear();

    res.json({
      success: true,
      data: { deleted: count }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
