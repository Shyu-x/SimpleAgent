import { Injectable, NotFoundException } from '@nestjs/common';
import { ListTracesDto, CreateTraceDto } from './dto';

interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  operationName: string;
  serviceName: string;
  startTime: number;
  duration: number;
  endTime: number;
  status: string;
  tags: Record<string, string>;
  logs: any[];
}

interface Trace {
  traceId: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime: number | null;
  duration: number;
  totalSpans: number;
  status: string;
  spans: Span[];
}

@Injectable()
export class TraceService {
  private traces: Map<string, Trace> = new Map();
  private readonly MAX_TRACES = 1000;

  constructor() {
    this.initMockTraces();
  }

  private generateTraceId(): string {
    return `trace_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMockTrace(traceId: string): Trace {
    const now = Date.now();
    const spans: Span[] = [];
    const operations = ['http_request', 'model_call', 'tool_execution', 'db_query', 'cache_lookup'];
    const services = ['api-gateway', 'chat-service', 'agent-engine', 'rag-service', 'tool-registry'];

    const spanCount = 3 + Math.floor(Math.random() * 6);
    let parentSpanId: string | null = null;

    for (let i = 0; i < spanCount; i++) {
      const spanId = `span_${i.toString(16).padStart(8, '0')}`;
      const duration = 5 + Math.floor(Math.random() * 200);
      const service = services[Math.floor(Math.random() * services.length)];
      const operation = operations[Math.floor(Math.random() * operations.length)];

      const span: Span = {
        traceId,
        spanId,
        parentSpanId,
        operationName: `${service}.${operation}`,
        serviceName: service,
        startTime: now + i * 10,
        duration,
        endTime: now + i * 10 + duration,
        status: Math.random() > 0.1 ? 'ok' : 'error',
        tags: {
          'http.method': 'POST',
          'http.status_code': Math.random() > 0.1 ? '200' : '500',
          'span.kind': i === 0 ? 'server' : 'internal',
        },
        logs: [],
      };

      if (span.status === 'error') {
        span.logs.push({
          timestamp: span.startTime + duration / 2,
          event: 'error',
          message: 'Connection timeout',
        });
      }

      spans.push(span);
      parentSpanId = spanId;
    }

    return {
      traceId,
      operationName: 'chat.completion',
      serviceName: 'api-gateway',
      startTime: spans[0]?.startTime || now,
      endTime: spans[spans.length - 1]?.endTime || now,
      duration: spans.reduce((sum, s) => sum + s.duration, 0),
      totalSpans: spans.length,
      status: spans.some(s => s.status === 'error') ? 'error' : 'ok',
      spans,
    };
  }

  private initMockTraces(): void {
    for (let i = 0; i < 20; i++) {
      const traceId = this.generateTraceId();
      const trace = this.generateMockTrace(traceId);
      trace.startTime = Date.now() - (20 - i) * 60000;
      trace.endTime = trace.startTime + trace.duration;
      this.traces.set(traceId, trace);
    }
  }

  listTraces(query: ListTracesDto): any {
    const { limit = 20, offset = 0, status, service, traceId: traceIdFilter } = query;

    let traces = Array.from(this.traces.values());

    if (status) {
      traces = traces.filter(t => t.status === status);
    }
    if (service) {
      traces = traces.filter(t => t.serviceName === service);
    }
    if (traceIdFilter) {
      traces = traces.filter(t => t.traceId.includes(traceIdFilter));
    }

    traces.sort((a, b) => b.startTime - a.startTime);

    const total = traces.length;
    const pageLimit = Math.min(limit || 20, 100);
    const pageOffset = offset || 0;
    const paginatedTraces = traces.slice(pageOffset, pageOffset + pageLimit);

    const simplifiedTraces = paginatedTraces.map(t => ({
      traceId: t.traceId,
      operationName: t.operationName,
      serviceName: t.serviceName,
      startTime: t.startTime,
      endTime: t.endTime,
      duration: t.duration,
      status: t.status,
      totalSpans: t.totalSpans,
    }));

    return {
      traces: simplifiedTraces,
      total,
      limit: pageLimit,
      offset: pageOffset,
      hasMore: pageOffset + pageLimit < total,
    };
  }

  getTrace(traceId: string): any {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new NotFoundException(`追踪 ${traceId} 不存在`);
    }

    return trace;
  }

  getSpans(traceId: string): any {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new NotFoundException(`追踪 ${traceId} 不存在`);
    }

    return {
      traceId,
      spans: trace.spans,
      total: trace.spans.length,
    };
  }

  getStats(): any {
    const traces = Array.from(this.traces.values());
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    const recentTraces = traces.filter(t => t.startTime > oneHourAgo);
    const dailyTraces = traces.filter(t => t.startTime > oneDayAgo);

    const totalDuration = traces.reduce((sum, t) => sum + t.duration, 0);
    const avgDuration = traces.length > 0 ? Math.round(totalDuration / traces.length) : 0;

    const errorTraces = traces.filter(t => t.status === 'error');
    const recentErrors = recentTraces.filter(t => t.status === 'error');

    const serviceCounts: Record<string, number> = {};
    const operationCounts: Record<string, number> = {};
    for (const t of traces) {
      serviceCounts[t.serviceName] = (serviceCounts[t.serviceName] || 0) + 1;
      operationCounts[t.operationName] = (operationCounts[t.operationName] || 0) + 1;
    }

    const sortedDurations = traces.map(t => t.duration).sort((a, b) => a - b);
    const p50 = sortedDurations[Math.floor(sortedDurations.length * 0.5)] || 0;
    const p90 = sortedDurations[Math.floor(sortedDurations.length * 0.9)] || 0;
    const p99 = sortedDurations[Math.floor(sortedDurations.length * 0.99)] || 0;

    return {
      overview: {
        totalTraces: traces.length,
        totalSpans: traces.reduce((sum, t) => sum + t.totalSpans, 0),
        errorCount: errorTraces.length,
        errorRate: traces.length > 0 ? (errorTraces.length / traces.length * 100).toFixed(2) + '%' : '0%',
      },
      recent: {
        lastHour: {
          traces: recentTraces.length,
          errors: recentErrors.length,
          errorRate: recentTraces.length > 0 ? (recentErrors.length / recentTraces.length * 100).toFixed(2) + '%' : '0%',
        },
        lastDay: {
          traces: dailyTraces.length,
        },
      },
      performance: {
        avgDuration: avgDuration + 'ms',
        p50Duration: p50 + 'ms',
        p90Duration: p90 + 'ms',
        p99Duration: p99 + 'ms',
        minDuration: (sortedDurations[0] || 0) + 'ms',
        maxDuration: (sortedDurations[sortedDurations.length - 1] || 0) + 'ms',
      },
      distribution: {
        byService: serviceCounts,
        byOperation: operationCounts,
      },
      timestamp: new Date().toISOString(),
    };
  }

  createTrace(dto: CreateTraceDto): any {
    const traceId = this.generateTraceId();

    const trace: Trace = {
      traceId,
      operationName: dto.operationName || 'test.operation',
      serviceName: dto.serviceName || 'test-service',
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      totalSpans: 0,
      status: 'running',
      spans: [],
    };

    this.traces.set(traceId, trace);

    if (this.traces.size > this.MAX_TRACES) {
      const oldestKey = this.traces.keys().next().value;
      if (oldestKey) {
        this.traces.delete(oldestKey);
      }
    }

    return { traceId };
  }

  clearTraces(password?: string): any {
    if (password !== 'admin') {
      throw new Error('需要管理员密码');
    }

    const count = this.traces.size;
    this.traces.clear();

    return { deleted: count };
  }
}
