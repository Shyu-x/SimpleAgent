/**
 * 全链路追踪服务
 * 基于 OpenTracing 风格实现
 */

const { v4: uuidv4 } = require('uuid');

class TracingService {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'ai-chat';
    this.enableLogging = options.enableLogging !== false;
    this.traces = new Map();
    this.maxTraces = options.maxTraces || 1000;
  }

  // 创建新追踪
  createTrace(operationName, parentSpanId = null) {
    const traceId = uuidv4();
    const spanId = uuidv4().substring(0, 8);

    const span = {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      serviceName: this.serviceName,
      startTime: Date.now(),
      endTime: null,
      status: 'started',
      tags: {},
      logs: []
    };

    this.traces.set(traceId, span);
    this.cleanupOldTraces();

    return span;
  }

  // 结束Span
  endSpan(traceId, status = 'ok', error = null) {
    const span = this.traces.get(traceId);
    if (!span) return;

    span.endTime = Date.now();
    span.status = status;
    span.duration = span.endTime - span.startTime;

    if (error) {
      span.tags.error = true;
      span.logs.push({
        timestamp: Date.now(),
        event: 'error',
        message: error.message
      });
    }

    if (this.enableLogging) {
      this.logSpan(span);
    }

    return span;
  }

  // 添加标签
  addTag(traceId, key, value) {
    const span = this.traces.get(traceId);
    if (span) {
      span.tags[key] = value;
    }
  }

  // 添加日志事件
  addLog(traceId, event, data = {}) {
    const span = this.traces.get(traceId);
    if (span) {
      span.logs.push({
        timestamp: Date.now(),
        event,
        ...data
      });
    }
  }

  // 获取追踪
  getTrace(traceId) {
    return this.traces.get(traceId);
  }

  // 记录Span
  logSpan(span) {
    console.log(`[TRACE] ${span.operationName} - ${span.duration}ms - ${span.status}`);
  }

  // 清理旧追踪
  cleanupOldTraces() {
    if (this.traces.size > this.maxTraces) {
      const entries = Array.from(this.traces.entries());
      entries.slice(0, entries.length - this.maxTraces).forEach(([id]) => {
        this.traces.delete(id);
      });
    }
  }

  // 获取统计
  getStats() {
    const traces = Array.from(this.traces.values());
    const completed = traces.filter(t => t.endTime);

    return {
      total: traces.length,
      completed: completed.length,
      avgDuration: completed.length > 0
        ? completed.reduce((sum, t) => sum + t.duration, 0) / completed.length
        : 0,
      errorRate: completed.length > 0
        ? completed.filter(t => t.status === 'error').length / completed.length
        : 0
    };
  }
}

// Express中间件
function tracingMiddleware(tracingService) {
  return (req, res, next) => {
    const traceId = req.headers['x-trace-id'] || uuidv4();
    res.setHeader('X-Trace-Id', traceId);

    const span = tracingService.createTrace(`${req.method} ${req.path}`, req.headers['x-span-id']);
    tracingService.addTag(traceId, 'http.method', req.method);
    tracingService.addTag(traceId, 'http.url', req.url);
    tracingService.addTag(traceId, 'http.remote_addr', req.ip);

    res.on('finish', () => {
      tracingService.addTag(traceId, 'http.status_code', res.statusCode);
      tracingService.endSpan(traceId, res.statusCode >= 400 ? 'error' : 'ok');
    });

    next();
  };
}

module.exports = { TracingService, tracingMiddleware };
