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

// 时间常量（毫秒）
const ONE_HOUR_MS = 60 * 60 * 1000;  // 1小时
const ONE_DAY_MS = 24 * 60 * 60 * 1000;  // 1天
const SSE_PUSH_INTERVAL_MS = 5000;  // SSE推送间隔

// 内存追踪存储 - 实际项目应使用分布式追踪系统（如 Jaeger/Zipkin）
const traceStore = new Map();
const MAX_TRACES = 1000;

// SSE 广播客户端管理
const traceSSEClients = new Set();

// 确保 EventEmitter 已初始化
if (!global.traceEventEmitter) {
  require('../../common/EventEmitter');
}

const traceEmitter = global.traceEventEmitter;

// 从 EventEmitter 事件中提取 traceId
function extractTraceId(spanOrTrace) {
  return spanOrTrace?.traceId || spanOrTrace?.id || null;
}

// 广播 span 更新到所有客户端 (via /subscribe/live)
traceEmitter.on('span_update', (span) => {
  const message = JSON.stringify({ type: 'span_update', data: span, timestamp: Date.now() });
  traceSSEClients.forEach(client => {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (e) {
      traceSSEClients.delete(client);
    }
  });

  // 同时更新 traceStore - 查找或创建 trace
  const traceId = extractTraceId(span);
  if (traceId) {
    let trace = traceStore.get(traceId);
    if (!trace) {
      // 创建新 trace
      trace = {
        traceId,
        operationName: span.name || 'unknown',
        serviceName: span.tags?.serviceName || 'agent-engine',
        startTime: span.startTime || Date.now(),
        endTime: null,
        duration: 0,
        totalSpans: 0,
        status: 'running',
        spans: []
      };
      traceStore.set(traceId, trace);
    }

    // 添加或更新 span
    const existingIndex = trace.spans.findIndex(s => s.spanId === span.spanId);
    if (existingIndex >= 0) {
      trace.spans[existingIndex] = span;
    } else {
      trace.spans.push(span);
      trace.totalSpans = trace.spans.length;
    }

    // 更新 trace 状态
    if (span.status === 'error') {
      trace.status = 'error';
    }

    // 限制存储大小
    if (traceStore.size > MAX_TRACES) {
      const oldestKey = traceStore.keys().next().value;
      traceStore.delete(oldestKey);
    }
  }
});

// 广播 trace 完成到所有客户端 (via /subscribe/live)
traceEmitter.on('trace_complete', (trace) => {
  const message = JSON.stringify({ type: 'trace_complete', data: trace, timestamp: Date.now() });
  traceSSEClients.forEach(client => {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (e) {
      traceSSEClients.delete(client);
    }
  });

  // 更新 traceStore 中的 trace
  const traceId = extractTraceId(trace);
  if (traceId) {
    const existingTrace = traceStore.get(traceId);
    if (existingTrace) {
      existingTrace.endTime = trace.endTime;
      existingTrace.duration = trace.duration;
      existingTrace.status = trace.status || 'ok';
    } else {
      // 直接存储完成的 trace
      traceStore.set(traceId, {
        traceId,
        operationName: trace.operationName || 'agent_execution',
        serviceName: trace.serviceName || 'agent-engine',
        startTime: trace.startTime || Date.now(),
        endTime: trace.endTime || Date.now(),
        duration: trace.duration || 0,
        totalSpans: trace.totalSpans || 0,
        status: trace.status || 'ok',
        spans: trace.spans || []
      });
    }

    // 限制存储大小
    if (traceStore.size > MAX_TRACES) {
      const oldestKey = traceStore.keys().next().value;
      traceStore.delete(oldestKey);
    }
  }
});

// 监听 agent_engine 事件并同步到 traceStore
traceEmitter.on('agent_execution_start', (data) => {
  if (data.traceId) {
    const trace = {
      traceId: data.traceId,
      operationName: data.task?.substring(0, 100) || 'agent_execution',
      serviceName: 'agent-engine',
      startTime: data.startTime || Date.now(),
      endTime: null,
      duration: 0,
      totalSpans: 0,
      status: 'running',
      spans: []
    };
    traceStore.set(data.traceId, trace);
  }
});

/**
 * 初始化追踪存储（空启动，等待真实追踪数据）
 */
function initTraceStore() {
  // 追踪数据将由实际请求填充，不再使用模拟数据
  logger.info('追踪存储已初始化，等待真实数据');
}

initTraceStore();

/**
 * GET /api/admin/traces/subscribe/live
 * 实时订阅 trace 更新 (SSE) - 基于 EventEmitter 广播
 */
router.get('/subscribe/live', (req, res) => {
  const { traceId: filterTraceId } = req.query;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // 添加到客户端集合
  traceSSEClients.add(res);

  // 发送连接成功消息
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    traceId: filterTraceId || null,
    timestamp: Date.now()
  })}\n\n`);

  logger.info('Trace SSE Live客户端连接', { filterTraceId });

  // 清理函数
  const cleanup = () => {
    traceSSEClients.delete(res);
    logger.info('Trace SSE Live客户端断开', { filterTraceId });
  };

  req.on('close', cleanup);
  req.on('error', cleanup);

  // 心跳保活
  const heartbeatId = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
    } catch (e) {
      clearInterval(heartbeatId);
      cleanup();
    }
  }, 30000);
});

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
    const oneHourAgo = now - ONE_HOUR_MS;
    const oneDayAgo = now - ONE_DAY_MS;

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
 * SSE Stream Endpoint for Traces
 * GET /api/admin/traces/subscribe
 * 实时推送追踪数据和统计
 */
router.get('/subscribe', (req, res) => {
  const clientId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  logger.info('Trace SSE客户端连接', { clientId });

  // 发送连接成功消息
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

  const PUSH_INTERVAL = SSE_PUSH_INTERVAL_MS;
  let lastTracesHash = '';

  const getTracesSummary = () => {
    const traces = Array.from(traceStore.values()).slice(0, 50);
    const tracesHash = JSON.stringify(traces.map(t => t.traceId + t.status + t.duration));

    const errorTraces = traces.filter(t => t.status === 'error');
    const avgDuration = traces.length > 0
      ? Math.round(traces.reduce((sum, t) => sum + t.duration, 0) / traces.length)
      : 0;

    return {
      traces: traces.slice(0, 20).map(t => ({
        traceId: t.traceId,
        operationName: t.operationName,
        serviceName: t.serviceName,
        startTime: t.startTime,
        endTime: t.endTime,
        duration: t.duration,
        status: t.status,
        totalSpans: t.totalSpans
      })),
      stats: {
        totalTraces: traceStore.size,
        avgDuration,
        successRate: traces.length > 0 ? (traces.length - errorTraces.length) / traces.length : 1,
        slowTraces: traces.filter(t => t.duration > 5000).length,
        errorTraces: errorTraces.length,
        tracesByType: traces.reduce((acc, t) => {
          acc[t.serviceName] = (acc[t.serviceName] || 0) + 1;
          return acc;
        }, {})
      },
      hash: tracesHash
    };
  };

  const pushTraces = () => {
    try {
      const summary = getTracesSummary();

      // 只在数据变化时推送完整数据
      if (summary.hash !== lastTracesHash || lastTracesHash === '') {
        lastTracesHash = summary.hash;
        res.write(`data: ${JSON.stringify({
          type: 'traces_update',
          data: summary.traces,
          stats: summary.stats,
          timestamp: Date.now()
        })}\n\n`);
      } else {
        // 心跳式推送（无数据变化）
        res.write(`data: ${JSON.stringify({
          type: 'heartbeat',
          stats: summary.stats,
          timestamp: Date.now()
        })}\n\n`);
      }
    } catch (error) {
      logger.error('推送追踪数据失败', { error: error.message });
    }
  };

  // 立即推送一次
  pushTraces();

  // 设置定时推送
  const intervalId = setInterval(pushTraces, PUSH_INTERVAL);

  // 心跳保活
  const heartbeatId = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
    } catch (error) {
      clearInterval(intervalId);
      clearInterval(heartbeatId);
      logger.info('Trace SSE客户端断开', { clientId });
    }
  }, 30000);

  const cleanup = () => {
    clearInterval(intervalId);
    clearInterval(heartbeatId);
    logger.info('Trace SSE连接清理', { clientId });
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
});

/**
 * GET /api/admin/traces/:traceId
 * 获取追踪详情
 * 注意：此路由必须在 /subscribe 之后定义
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
    const adminPassword = process.env.TRACE_ADMIN_PASSWORD || 'admin';

    // 验证
    if (password !== adminPassword) {
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
