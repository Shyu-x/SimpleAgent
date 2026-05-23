/**
 * TraceService 单元测试
 *
 * 测试内容：
 * 1. Trace 和 Span 创建
 * 2. 采样控制
 * 3. 事件记录
 * 4. 统计信息
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');



const { TraceService, Trace, Span, SpanStatus, EventTypes, FilePersister } = require('../../src/services/tracing/TraceService');

describe('Span', () => {
  test('应该正确初始化', () => {
    const span = new Span('test-span', 'trace-123', 'parent-456', 'span-789');
    assert.strictEqual(span.name, 'test-span');
    assert.strictEqual(span.traceId, 'trace-123');
    assert.strictEqual(span.parentSpanId, 'parent-456');
    assert.strictEqual(span.spanId, 'span-789');
    assert.strictEqual(span.status, SpanStatus.OK);
    assert.ok(span.startTime);
    assert.strictEqual(span.endTime, null);
    assert.strictEqual(span.duration, null);
  });

  test('应该自动生成 spanId', () => {
    const span = new Span('test', 'trace-123');
    assert.ok(span.spanId);
    assert.strictEqual(span.spanId.length, 8);
  });

  test('finish 应该设置 endTime 和 duration', () => {
    const span = new Span('test', 'trace');
    span.finish();
    assert.ok(span.endTime);
    assert.ok(span.duration >= 0);
  });

  test('setStatus 应该设置状态', () => {
    const span = new Span('test', 'trace');
    span.setStatus(SpanStatus.ERROR);
    assert.strictEqual(span.status, SpanStatus.ERROR);
  });

  test('setTag 应该设置单个标签', () => {
    const span = new Span('test', 'trace');
    span.setTag('key', 'value');
    assert.strictEqual(span.tags.key, 'value');
  });

  test('setTags 应该设置多个标签', () => {
    const span = new Span('test', 'trace');
    span.setTags({ key1: 'value1', key2: 'value2' });
    assert.strictEqual(span.tags.key1, 'value1');
    assert.strictEqual(span.tags.key2, 'value2');
  });

  test('addEvent 应该添加事件', () => {
    const span = new Span('test', 'trace');
    span.addEvent('test_event', { data: 'value' });
    assert.strictEqual(span.events.length, 1);
    assert.strictEqual(span.events[0].name, 'test_event');
    assert.deepStrictEqual(span.events[0].data, { data: 'value' });
  });

  test('toJSON 应该正确序列化为 JSON', () => {
    const span = new Span('test-span', 'trace-123', 'parent-456', 'span-789');
    span.setTag('key', 'value');
    span.addEvent('event1');
    span.finish();

    const json = span.toJSON();
    assert.strictEqual(json.spanId, 'span-789');
    assert.strictEqual(json.name, 'test-span');
    assert.strictEqual(json.traceId, 'trace-123');
    assert.strictEqual(json.tags.key, 'value');
    assert.strictEqual(json.events.length, 1);
    assert.ok(json.endTime);
    assert.ok(json.duration >= 0);
  });
});

describe('Trace', () => {
  test('应该正确初始化', () => {
    const trace = new Trace('trace-123', 'test-service');
    assert.strictEqual(trace.traceId, 'trace-123');
    assert.strictEqual(trace.serviceName, 'test-service');
    assert.strictEqual(trace.rootSpan, null);
    assert.strictEqual(trace.status, SpanStatus.OK);
    assert.strictEqual(trace.sampled, true);
  });

  test('setRootSpan 应该设置根 Span', () => {
    const trace = new Trace('trace-123');
    const rootSpan = new Span('root', trace.traceId);
    trace.setRootSpan(rootSpan);
    assert.strictEqual(trace.rootSpan, rootSpan);
    assert.strictEqual(trace.spans.size, 1);
  });

  test('addSpan 应该添加子 Span', () => {
    const trace = new Trace('trace-123');
    const rootSpan = new Span('root', trace.traceId);
    const childSpan = new Span('child', trace.traceId, rootSpan.spanId);
    trace.setRootSpan(rootSpan);
    trace.addSpan(childSpan);
    assert.strictEqual(trace.spans.size, 2);
    assert.ok(rootSpan.children.includes(childSpan.spanId));
  });

  test('finish 应该设置 endTime 和 duration', () => {
    const trace = new Trace('trace-123');
    trace.finish();
    assert.ok(trace.endTime);
    assert.ok(trace.duration >= 0);
  });

  test('getStats 应该返回正确的统计信息', () => {
    const trace = new Trace('trace-123');
    const span1 = new Span('span1', trace.traceId);
    span1.finish();
    const span2 = new Span('span2', trace.traceId);
    span2.setStatus(SpanStatus.ERROR);
    span2.finish();

    trace.setRootSpan(span1);
    trace.addSpan(span2);
    trace.finish();

    const stats = trace.getStats();
    assert.strictEqual(stats.traceId, 'trace-123');
    assert.strictEqual(stats.spanCount, 2);
    assert.strictEqual(stats.completedSpans, 2);
    assert.strictEqual(stats.errorCount, 1);
  });

  test('toTree 应该构建正确的树结构', () => {
    const trace = new Trace('trace-123');
    const rootSpan = new Span('root', trace.traceId, null, 'root-span');
    const childSpan = new Span('child', trace.traceId, 'root-span', 'child-span');

    trace.setRootSpan(rootSpan);
    trace.addSpan(childSpan);

    const tree = trace.toTree();
    assert.ok(tree);
    assert.strictEqual(tree.spanId, 'root-span');
    assert.ok(tree.children);
    assert.strictEqual(tree.children[0].spanId, 'child-span');
  });
});

describe('FilePersister', () => {
  const testDir = path.join(__dirname, 'test-data', 'traces');

  test('构造函数应该设置默认配置', () => {
    const persister = new FilePersister();
    assert.ok(persister.baseDir);
    assert.strictEqual(persister.maxFileSize, 10 * 1024 * 1024);
    assert.strictEqual(persister.maxFiles, 100);
  });

  test('构造函数应该接受自定义配置', () => {
    const persister = new FilePersister({
      baseDir: '/custom/path',
      maxFileSize: 1024,
      maxFiles: 10
    });
    assert.strictEqual(persister.baseDir, '/custom/path');
    assert.strictEqual(persister.maxFileSize, 1024);
    assert.strictEqual(persister.maxFiles, 10);
  });
});

describe('TraceService', () => {
  test('默认配置应该正确', () => {
    const service = new TraceService();
    assert.strictEqual(service.serviceName, 'ai-chat');
    assert.strictEqual(service.version, '1.0.0');
    assert.strictEqual(service.sampleRate, 1.0);
    assert.strictEqual(service.adaptiveSampling, true);
    assert.strictEqual(service.maxTraces, 1000);
    assert.strictEqual(service.maxSpansPerTrace, 500);
  });

  test('自定义配置应该正确应用', () => {
    const service = new TraceService({
      serviceName: 'custom-service',
      version: '2.0.0',
      sampleRate: 0.5,
      maxTraces: 100
    });
    assert.strictEqual(service.serviceName, 'custom-service');
    assert.strictEqual(service.version, '2.0.0');
    assert.strictEqual(service.sampleRate, 0.5);
    assert.strictEqual(service.maxTraces, 100);
  });

  test('generateTraceId 应该生成 16 字符的 traceId', () => {
    const service = new TraceService();
    const traceId = service.generateTraceId();
    assert.strictEqual(traceId.length, 16);
  });

  test('generateSpanId 应该生成 8 字符的 spanId', () => {
    const service = new TraceService();
    const spanId = service.generateSpanId();
    assert.strictEqual(spanId.length, 8);
  });

  test('createTrace 应该创建新的 Trace', () => {
    const service = new TraceService();
    const trace = service.createTrace();
    assert.ok(trace instanceof Trace);
    assert.ok(trace.traceId);
    assert.strictEqual(service.traces.size, 1);
  });

  test('createTrace 应该更新统计信息', () => {
    const service = new TraceService();
    service.createTrace();
    const stats = service.getStats();
    assert.strictEqual(stats.totalTraces, 1);
  });

  test('createSpan 应该创建新的 Span', () => {
    const service = new TraceService();
    const trace = service.createTrace();
    const span = service.createSpan('test-span', null, trace);
    assert.ok(span instanceof Span);
    assert.strictEqual(span.name, 'test-span');
  });

  test('createSpan 应该将第一个 Span 设置为 rootSpan', () => {
    const service = new TraceService();
    const trace = service.createTrace();
    const span = service.createSpan('root-span', null, trace);
    assert.strictEqual(trace.rootSpan, span);
  });

  test('createSpan 应该支持 parent 参数', () => {
    const service = new TraceService();
    const trace = service.createTrace();
    const parentSpan = service.createSpan('parent', null, trace);
    const childSpan = service.createSpan('child', parentSpan, trace);
    assert.strictEqual(childSpan.parentSpanId, parentSpan.spanId);
  });

  test('createSpan 超出限制应该返回 null', () => {
    const service = new TraceService({ maxSpansPerTrace: 2 });
    const trace = service.createTrace();
    service.createSpan('span1', null, trace);
    service.createSpan('span2', null, trace);
    const span3 = service.createSpan('span3', null, trace);
    assert.strictEqual(span3, null);
  });

  test('finishSpan 应该结束 Span 并设置状态', () => {
    const service = new TraceService();
    const trace = service.createTrace();
    const span = service.createSpan('test-span', null, trace);
    service.finishSpan(span, SpanStatus.OK);
    assert.ok(span.endTime);
    assert.strictEqual(span.status, SpanStatus.OK);
  });

  test('finish 应该结束 Trace 并持久化', () => {
    const service = new TraceService({ enableConsoleLog: false });
    const trace = service.createTrace();
    service.finish(trace);
    assert.ok(trace.endTime);
    assert.ok(trace.duration >= 0);
  });

  test('shouldSample sampleRate=1 时应该总是返回 true', () => {
    const service = new TraceService({ sampleRate: 1.0 });
    service.adaptiveSampling = false;
    assert.strictEqual(service.shouldSample(), true);
  });

  test('shouldSample sampleRate=0 时应该总是返回 false', () => {
    const service = new TraceService({ sampleRate: 0, adaptiveSampling: false });
    assert.strictEqual(service.shouldSample(), false);
  });

  test('startOperation 应该创建 trace 和 span', () => {
    const service = new TraceService({ enableConsoleLog: false });
    const operation = service.startOperation('test-operation');
    assert.ok(operation.trace);
    assert.ok(operation.span);
    assert.strictEqual(operation.span.name, 'test-operation');
  });

  test('getTrace 应该通过 traceId 获取 Trace', () => {
    const service = new TraceService();
    const createdTrace = service.createTrace();
    const retrievedTrace = service.getTrace(createdTrace.traceId);
    assert.strictEqual(retrievedTrace, createdTrace);
  });

  test('getTrace 不存在的 traceId 应该返回 null', () => {
    const service = new TraceService();
    const trace = service.getTrace('non-existent');
    assert.strictEqual(trace, null);
  });

  test('getStats 应该返回完整的统计信息', () => {
    const service = new TraceService();
    service.createTrace();
    service.createTrace();
    const stats = service.getStats();
    assert.ok(stats.totalTraces >= 2);
    assert.ok(stats.activeTraces >= 0);
    assert.ok(typeof stats.sampleRate === 'number');
  });

  test('getActiveTraces 应该返回活跃的 trace 列表', () => {
    const service = new TraceService();
    service.createTrace();
    service.createTrace();
    const activeTraces = service.getActiveTraces();
    assert.strictEqual(activeTraces.length, 2);
    assert.ok(activeTraces[0].traceId);
    assert.ok(activeTraces[0].startTime);
    assert.ok(activeTraces[0].status);
  });

  test('middleware 应该返回 Express 中间件函数', () => {
    const service = new TraceService();
    const middleware = service.middleware();
    assert.strictEqual(typeof middleware, 'function');
    assert.strictEqual(middleware.length, 3);
  });

  test('cleanupOldTraces 应该清理超过限制的旧 trace', () => {
    const service = new TraceService({ maxTraces: 3 });
    for (let i = 0; i < 5; i++) {
      service.createTrace();
    }
    assert.ok(service.traces.size <= 3);
  });
});

describe('EventTypes 常量', () => {
  test('应该包含所有预定义事件类型', () => {
    assert.ok(EventTypes.TOOL_CALL);
    assert.ok(EventTypes.MODEL_REQUEST);
    assert.ok(EventTypes.MODEL_RESPONSE);
    assert.ok(EventTypes.SEARCH);
    assert.ok(EventTypes.ERROR);
    assert.ok(EventTypes.RETRY);
    assert.ok(EventTypes.TIMEOUT);
  });
});

describe('SpanStatus 常量', () => {
  test('应该包含所有预定义状态', () => {
    assert.strictEqual(SpanStatus.OK, 'ok');
    assert.strictEqual(SpanStatus.ERROR, 'error');
    assert.strictEqual(SpanStatus.TIMEOUT, 'timeout');
  });
});

// Cleanup
setTimeout(() => {
  try {
    fs.rmSync(path.join(__dirname, 'test-data'), { recursive: true, force: true });
  } catch (e) {}
}, 100);

