/**
 * 全链路Trace服务
 * 支持分布式追踪、Span管理、事件记录、持久化和采样控制
 *
 * @author AI Chat 玩具
 * @date 2026-03-21
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const AppError = require('../../common/errors/AppError');

// 预定义的事件类型
const EventTypes = {
  TOOL_CALL: 'tool_call',
  MODEL_REQUEST: 'model_request',
  MODEL_RESPONSE: 'model_response',
  SEARCH: 'search',
  SEARCH_RESULT: 'search_result',
  RAG_QUERY: 'rag_query',
  RAG_RESULT: 'rag_result',
  INTENT_CLASSIFY: 'intent_classify',
  TOOL_RESULT: 'tool_result',
  ERROR: 'error',
  RETRY: 'retry',
  TIMEOUT: 'timeout'
};

// Span状态
const SpanStatus = {
  OK: 'ok',
  ERROR: 'error',
  TIMEOUT: 'timeout'
};

class Span {
  constructor(name, traceId, parentSpanId, spanId) {
    this.spanId = spanId || uuidv4().substring(0, 8);
    this.name = name;
    this.traceId = traceId;
    this.parentSpanId = parentSpanId || null;
    this.startTime = Date.now();
    this.endTime = null;
    this.duration = null;
    this.status = SpanStatus.OK;
    this.tags = {};
    this.events = [];
    this.children = [];
  }

  /**
   * 结束Span
   */
  finish() {
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    return this;
  }

  /**
   * 设置状态
   */
  setStatus(status) {
    this.status = status;
    return this;
  }

  /**
   * 设置标签
   */
  setTag(key, value) {
    this.tags[key] = value;
    return this;
  }

  /**
   * 设置多个标签
   */
  setTags(tags) {
    Object.assign(this.tags, tags);
    return this;
  }

  /**
   * 记录事件
   */
  addEvent(name, data = {}) {
    this.events.push({
      name,
      timestamp: Date.now(),
      data
    });
    return this;
  }

  /**
   * 获取信息
   */
  toJSON() {
    return {
      spanId: this.spanId,
      name: this.name,
      traceId: this.traceId,
      parentSpanId: this.parentSpanId,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      status: this.status,
      tags: this.tags,
      events: this.events,
      childCount: this.children.length
    };
  }
}

/**
 * Trace容器
 * 包含完整的调用链信息
 */
class Trace {
  constructor(traceId, serviceName = 'ai-chat') {
    this.traceId = traceId;
    this.serviceName = serviceName;
    this.rootSpan = null;
    this.spans = new Map();
    this.startTime = Date.now();
    this.endTime = null;
    this.duration = null;
    this.status = SpanStatus.OK;
    this.metadata = {};
    this.sampled = true;
  }

  /**
   * 添加根Span
   */
  setRootSpan(span) {
    this.rootSpan = span;
    this.spans.set(span.spanId, span);
  }

  /**
   * 添加子Span
   */
  addSpan(span) {
    this.spans.set(span.spanId, span);
    if (span.parentSpanId) {
      const parent = this.spans.get(span.parentSpanId);
      if (parent) {
        parent.children.push(span.spanId);
      }
    }
  }

  /**
   * 结束Trace
   */
  finish() {
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;

    // 确保所有span都已结束
    for (const span of this.spans.values()) {
      if (!span.endTime) {
        span.finish();
      }
    }

    return this;
  }

  /**
   * 获取树状结构
   */
  toTree() {
    const buildTree = (spanId) => {
      const span = this.spans.get(spanId);
      if (!span) return null;
      return {
        ...span.toJSON(),
        children: span.children.map(childId => buildTree(childId))
      };
    };

    return this.rootSpan ? buildTree(this.rootSpan.spanId) : null;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const spanList = Array.from(this.spans.values());
    const completedSpans = spanList.filter(s => s.endTime);

    return {
      traceId: this.traceId,
      spanCount: spanList.length,
      completedSpans: completedSpans.length,
      totalDuration: this.duration,
      avgSpanDuration: completedSpans.length > 0
        ? completedSpans.reduce((sum, s) => sum + (s.duration || 0), 0) / completedSpans.length
        : 0,
      errorCount: spanList.filter(s => s.status === SpanStatus.ERROR).length,
      eventCount: spanList.reduce((sum, s) => sum + s.events.length, 0)
    };
  }

  /**
   * 转为JSON
   */
  toJSON() {
    return {
      traceId: this.traceId,
      serviceName: this.serviceName,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      status: this.status,
      metadata: this.metadata,
      sampled: this.sampled,
      stats: this.getStats(),
      tree: this.toTree(),
      spans: Array.from(this.spans.values()).map(s => s.toJSON())
    };
  }
}

/**
 * 文件持久化器
 */
class FilePersister {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(process.cwd(), 'logs', 'traces');
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 100;
    this.currentFile = null;
    this.currentFileSize = 0;
    this.ensureDirectory();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  getFileName() {
    const now = new Date();
    return `trace-${now.toISOString().slice(0, 10)}.jsonl`;
  }

  getFilePath() {
    return path.join(this.baseDir, this.getFileName());
  }

  async write(trace) {
    return new Promise((resolve, reject) => {
      const line = JSON.stringify(trace.toJSON()) + '\n';
      const filePath = this.getFilePath();

      fs.appendFile(filePath, line, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async writeBatch(traces) {
    const lines = traces.map(t => JSON.stringify(t.toJSON())).join('\n') + '\n';
    const filePath = this.getFilePath();

    return new Promise((resolve, reject) => {
      fs.appendFile(filePath, lines, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

/**
 * 数据库持久化器（可选实现）
 */
class DatabasePersister {
  constructor(options = {}) {
    this.collectionName = options.collectionName || 'traces';
    // 预留数据库接口
  }

  async write(trace) {
    // TODO: 实现数据库写入
    console.log(`[TraceService] Would persist trace ${trace.traceId} to database`);
  }

  async writeBatch(traces) {
    // TODO: 实现批量写入
    console.log(`[TraceService] Would persist ${traces.length} traces to database`);
  }
}

/**
 * 全链路Trace服务
 */
class TraceService extends EventEmitter {
  constructor(options = {}) {
    super();

    // 服务配置
    this.serviceName = options.serviceName || 'ai-chat';
    this.version = options.version || '1.0.0';

    // 采样配置
    this.sampleRate = options.sampleRate ?? 1.0; // 默认全量采样
    this.minSampleRate = options.minSampleRate || 0.01; // 最低采样率
    this.adaptiveSampling = options.adaptiveSampling !== false; // 自适应采样

    // 内存管理
    this.traces = new Map();
    this.maxTraces = options.maxTraces || 1000;
    this.maxSpansPerTrace = options.maxSpansPerTrace || 500;

    // 持久化配置
    this.persister = null;
    if (options.persistTo === 'file') {
      this.persister = new FilePersister(options.fileOptions);
    } else if (options.persistTo === 'database') {
      this.persister = new DatabasePersister(options.dbOptions);
    }

    // 日志输出
    this.enableConsoleLog = options.enableConsoleLog !== false;
    this.consoleLogLevel = options.consoleLogLevel || 'info'; // debug, info, warn, error

    // 统计
    this.stats = {
      totalTraces: 0,
      sampledTraces: 0,
      droppedTraces: 0,
      totalSpans: 0,
      errors: 0
    };

    // 自适应采样状态
    this.loadFactor = 1.0;
    this.lastStatsTime = Date.now();
  }

  /**
   * 生成TraceId
   */
  generateTraceId() {
    return uuidv4().replace(/-/g, '').substring(0, 16);
  }

  /**
   * 生成SpanId
   */
  generateSpanId() {
    return uuidv4().substring(0, 8);
  }

  /**
   * 创建新Trace
   * @returns {Trace}
   */
  createTrace() {
    const traceId = this.generateTraceId();
    const trace = new Trace(traceId, this.serviceName);

    // 采样判断
    if (this.shouldSample()) {
      trace.sampled = true;
      this.stats.sampledTraces++;
    } else {
      trace.sampled = false;
      this.stats.droppedTraces++;
      // 不采样的trace只保留基本信息
    }

    this.traces.set(traceId, trace);
    this.stats.totalTraces++;

    // 清理旧trace
    this.cleanupOldTraces();

    if (this.enableConsoleLog) {
      this._log('info', `[TraceService] Created trace: ${traceId}, sampled: ${trace.sampled}`);
    }

    return trace;
  }

  /**
   * 创建Span
   * @param {string} name - Span名称
   * @param {Span|string} parent - 父Span或parentSpanId
   * @param {Trace|string} trace - Trace对象或traceId
   * @returns {Span}
   */
  createSpan(name, parent = null, trace = null) {
    let traceObj = null;
    let parentSpanId = null;

    // 处理参数 - 优先检查 parent
    if (parent instanceof Span) {
      parentSpanId = parent.spanId;
      traceObj = this.traces.get(parent.traceId);
    } else if (parent instanceof Trace) {
      traceObj = parent;
    } else if (trace instanceof Trace) {
      traceObj = trace;
    } else if (typeof trace === 'string') {
      traceObj = this.traces.get(trace);
    }

    if (!traceObj) {
      throw AppError.notFound('Trace');
    }

    // 检查span数量限制
    if (traceObj.spans.size >= this.maxSpansPerTrace) {
      this._log('warn', `[TraceService] Span limit reached for trace ${traceObj.traceId}`);
      return null;
    }

    const spanId = this.generateSpanId();
    const span = new Span(name, traceObj.traceId, parentSpanId || null, spanId);

    if (!traceObj.rootSpan) {
      traceObj.setRootSpan(span);
    } else {
      traceObj.addSpan(span);
    }

    this.stats.totalSpans++;

    if (this.enableConsoleLog && this.consoleLogLevel === 'debug') {
      this._log('debug', `[TraceService] Created span: ${span.spanId} (${name}) in trace: ${traceObj.traceId}`);
    }

    return span;
  }

  /**
   * 记录事件
   * @param {string|Span} spanOrName - Span对象或事件名称
   * @param {string} eventName - 事件名称（当spanOrName是span时）
   * @param {object} data - 事件数据
   */
  recordEvent(spanOrName, eventName = null, data = null) {
    let span;

    if (typeof spanOrName === 'string') {
      // recordEvent(name, data) 形式，需要从当前上下文获取span
      span = this._currentSpan;
      eventName = spanOrName;
    } else if (spanOrName instanceof Span) {
      span = spanOrName;
    }

    if (!span) {
      this._log('warn', '[TraceService] No active span for event recording');
      return;
    }

    // 支持事件类型常量或自定义事件名
    const eventType = EventTypes[eventName.toUpperCase()] || eventName;

    span.addEvent(eventType, {
      ...data,
      _recordedAt: Date.now()
    });

    if (this.enableConsoleLog && this.consoleLogLevel === 'debug') {
      this._log('debug', `[TraceService] Event recorded: ${eventType} on span ${span.spanId}`);
    }

    return span;
  }

  /**
   * 获取完整trace
   * @param {string} traceId
   * @returns {Trace|null}
   */
  getTrace(traceId) {
    return this.traces.get(traceId) || null;
  }

  /**
   * 获取当前活动的trace
   */
  getCurrentTrace() {
    return this._currentTrace;
  }

  /**
   * 获取当前活动的span
   */
  getCurrentSpan() {
    return this._currentSpan;
  }

  /**
   * 结束span
   * @param {Span} span
   * @param {string} status - ok, error, timeout
   */
  finishSpan(span, status = SpanStatus.OK) {
    if (!span) return;

    span.setStatus(status);
    span.finish();

    const trace = this.traces.get(span.traceId);
    if (trace) {
      trace.status = status === SpanStatus.ERROR ? SpanStatus.ERROR : trace.status;
    }

    if (this.enableConsoleLog) {
      this._log('info', `[TraceService] Span finished: ${span.name} (${span.duration}ms) - ${status}`);
    }

    // 触发事件
    this.emit('spanFinish', span);

    return span;
  }

  /**
   * 结束trace
   * @param {Trace} trace
   * @param {string} status
   */
  finish(trace, status = SpanStatus.OK) {
    if (!trace) return;

    trace.status = status === SpanStatus.ERROR ? SpanStatus.ERROR : trace.status;
    trace.finish();

    // 持久化
    if (trace.sampled && this.persister) {
      this.persister.write(trace).catch(err => {
        this._log('error', `[TraceService] Failed to persist trace: ${err.message}`);
      });
    }

    if (this.enableConsoleLog) {
      const stats = trace.getStats();
      this._log('info', `[TraceService] Trace finished: ${trace.traceId}, ${stats.spanCount} spans, ${trace.duration}ms`);
    }

    // 触发事件
    this.emit('traceFinish', trace);

    return trace;
  }

  /**
   * 判断是否应该采样
   */
  shouldSample() {
    // sampleRate=0 表示完全关闭采样
    if (this.sampleRate === 0) {
      return false;
    }

    if (!this.adaptiveSampling) {
      return Math.random() < this.sampleRate;
    }

    // 根据负载动态调整采样率
    const now = Date.now();
    if (now - this.lastStatsTime > 60000) {
      // 每分钟更新一次负载因子
      const recentTraces = this.stats.totalTraces;
      this.loadFactor = Math.min(recentTraces / 100, 1.0); // 假设100 traces/min为满负载
      this.lastStatsTime = now;
    }

    // 负载越高，采样率越低
    const effectiveRate = Math.max(this.sampleRate * this.loadFactor, this.minSampleRate);
    return Math.random() < effectiveRate;
  }

  /**
   * 清理旧trace
   */
  cleanupOldTraces() {
    if (this.traces.size > this.maxTraces) {
      const entries = Array.from(this.traces.entries());
      // 按时间排序，保留最新的
      entries.sort((a, b) => b[1].startTime - a[1].startTime);

      const toDelete = entries.slice(this.maxTraces);
      for (const [id] of toDelete) {
        const trace = this.traces.get(id);
        // 持久化未完成的trace
        if (trace && trace.sampled && this.persister) {
          this.persister.write(trace).catch(() => {});
        }
        this.traces.delete(id);
      }
    }
  }

  /**
   * 创建快速追踪的帮手
   * 自动创建trace和第一个span
   * @param {string} operationName - 操作名称
   * @returns {object} - { trace, span, finish }
   */
  startOperation(operationName) {
    const trace = this.createTrace();
    const span = this.createSpan(operationName, null, trace);

    const self = this;

    return {
      trace,
      span,
      serviceName: this.serviceName,

      /**
       * 创建子span
       */
      child(name) {
        return self.createSpan(name, span, trace);
      },

      /**
       * 记录事件
       */
      event(name, data) {
        return self.recordEvent(span, name, data);
      },

      /**
       * 结束span
       */
      end(status = SpanStatus.OK) {
        self.finishSpan(span, status);
        return self.finish(trace, status);
      },

      /**
       * 获取结果
       */
      getResult() {
        return {
          traceId: trace.traceId,
          stats: trace.getStats(),
          tree: trace.toTree()
        };
      }
    };
  }

  /**
   * Express中间件
   */
  middleware() {
    const self = this;

    return (req, res, next) => {
      // 从header获取traceId或生成新的
      const traceId = req.headers['x-trace-id'] || self.generateTraceId();
      const spanId = req.headers['x-span-id'] || null;

      // 设置响应header
      res.setHeader('X-Trace-Id', traceId);

      // 创建trace
      const trace = self.createTrace();
      trace.metadata = {
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip,
        userAgent: req.get('user-agent')
      };

      // 创建根span
      const rootSpan = self.createSpan(`${req.method} ${req.path}`, spanId, trace);

      // 绑定到请求对象
      req.trace = trace;
      req.span = rootSpan;

      // 响应结束时自动结束
      res.on('finish', () => {
        const status = res.statusCode >= 400 ? SpanStatus.ERROR : SpanStatus.OK;
        self.finishSpan(rootSpan, status);
        self.finish(trace, status);
      });

      next();
    };
  }

  /**
   * 获取服务统计
   */
  getStats() {
    return {
      ...this.stats,
      activeTraces: this.traces.size,
      sampleRate: this.sampleRate,
      loadFactor: this.loadFactor
    };
  }

  /**
   * 获取所有活跃trace
   */
  getActiveTraces() {
    return Array.from(this.traces.values()).map(t => ({
      traceId: t.traceId,
      startTime: t.startTime,
      duration: t.duration,
      status: t.status,
      spanCount: t.spans.size,
      sampled: t.sampled
    }));
  }

  /**
   * 内部日志
   */
  _log(level, message) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.consoleLogLevel);
    const msgLevelIndex = levels.indexOf(level);

    if (msgLevelIndex >= currentLevelIndex) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${message}`);
    }
  }
}

// 导出
module.exports = {
  TraceService,
  Trace,
  Span,
  SpanStatus,
  EventTypes,
  FilePersister,
  DatabasePersister
};
