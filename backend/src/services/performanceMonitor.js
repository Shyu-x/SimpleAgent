/**
 * Agent 性能监控
 * 实时监控 Agent 执行性能指标
 */

const EventEmitter = require('events');
const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('performanceMonitor');

/**
 * 性能指标类型
 */
const MetricType = {
  EXECUTION_TIME: 'execution_time',
  TOOL_CALL: 'tool_call',
  MEMORY_USAGE: 'memory_usage',
  ITERATION_COUNT: 'iteration_count',
  ERROR_RATE: 'error_rate',
  TOKEN_USAGE: 'token_usage'
};

/**
 * 性能指标记录
 */
class MetricRecord {
  constructor(type, value, metadata = {}) {
    this.id = `metric_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.type = type;
    this.value = value;
    this.metadata = metadata;
    this.timestamp = Date.now();
  }
}

/**
 * 性能监控器
 */
class PerformanceMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxRecords = options.maxRecords || 10000;
    this.records = [];
    this.aggregates = new Map();
    this.sessionMetrics = new Map();
    this.alertThresholds = options.alertThresholds || {
      execution_time: 60000,    // 60秒
      error_rate: 0.3,          // 30%错误率
      memory_usage: 500 * 1024 * 1024  // 500MB
    };
    this.enabled = options.enabled !== false;
  }

  /**
   * 记录指标
   */
  record(type, value, metadata = {}) {
    if (!this.enabled) return null;

    const record = new MetricRecord(type, value, metadata);
    this.records.push(record);

    // 限制记录数量
    if (this.records.length > this.maxRecords) {
      this.records.shift();
    }

    // 更新聚合统计
    this.updateAggregate(type, value);

    // 检查告警阈值
    this.checkThreshold(type, value, metadata);

    // 发送事件
    this.emit('metric', record);

    return record;
  }

  /**
   * 开始会话监控
   */
  startSession(sessionId) {
    const startTime = Date.now();
    this.sessionMetrics.set(sessionId, {
      startTime,
      endTime: null,
      duration: 0,
      iterations: 0,
      toolCalls: 0,
      errors: 0,
      metrics: []
    });

    this.emit('session_start', { sessionId, startTime });
    return startTime;
  }

  /**
   * 结束会话监控
   */
  endSession(sessionId, result = {}) {
    const session = this.sessionMetrics.get(sessionId);
    if (!session) return null;

    session.endTime = Date.now();
    session.duration = session.endTime - session.startTime;
    session.result = result;

    // 记录执行时间
    this.record(MetricType.EXECUTION_TIME, session.duration, { sessionId });

    this.emit('session_end', { sessionId, ...session });
    return session;
  }

  /**
   * 记录工具调用
   */
  recordToolCall(sessionId, toolName, duration, success) {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.toolCalls++;
      if (!success) session.errors++;
    }

    this.record(MetricType.TOOL_CALL, duration, {
      sessionId,
      toolName,
      success
    });
  }

  /**
   * 记录迭代
   */
  recordIteration(sessionId) {
    const session = this.sessionMetrics.get(sessionId);
    if (session) {
      session.iterations++;
    }

    this.record(MetricType.ITERATION_COUNT, session?.iterations || 0, { sessionId });
  }

  /**
   * 更新聚合统计
   */
  updateAggregate(type, value) {
    if (!this.aggregates.has(type)) {
      this.aggregates.set(type, {
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        avg: 0
      });
    }

    const agg = this.aggregates.get(type);
    agg.count++;
    agg.sum += value;
    agg.min = Math.min(agg.min, value);
    agg.max = Math.max(agg.max, value);
    agg.avg = agg.sum / agg.count;
  }

  /**
   * 检查告警阈值
   */
  checkThreshold(type, value, metadata) {
    const threshold = this.alertThresholds[type];
    if (threshold === undefined) return;

    let shouldAlert = false;

    switch (type) {
      case MetricType.EXECUTION_TIME:
      case MetricType.MEMORY_USAGE:
        shouldAlert = value > threshold;
        break;
      case MetricType.ERROR_RATE:
        shouldAlert = value > threshold;
        break;
    }

    if (shouldAlert) {
      const alert = {
        type,
        value,
        threshold,
        metadata,
        timestamp: Date.now()
      };

      this.emit('alert', alert);
      logger.warn('Alert', { type, value, threshold });
    }
  }

  /**
   * 获取统计数据
   */
  getStats(type = null) {
    if (type) {
      return this.aggregates.get(type) || null;
    }

    const stats = {};
    for (const [key, value] of this.aggregates) {
      stats[key] = value;
    }
    return stats;
  }

  /**
   * 获取会话统计
   */
  getSessionStats(sessionId) {
    if (sessionId) {
      return this.sessionMetrics.get(sessionId) || null;
    }

    const stats = [];
    for (const [id, session] of this.sessionMetrics) {
      stats.push({ id, ...session });
    }
    return stats;
  }

  /**
   * 获取性能报告
   */
  getReport() {
    const now = Date.now();
    const recentRecords = this.records.filter(r => now - r.timestamp < 3600000); // 最近1小时

    return {
      summary: {
        totalRecords: this.records.length,
        recentRecords: recentRecords.length,
        activeSessions: this.sessionMetrics.size
      },
      metrics: this.getStats(),
      topTools: this.getTopTools(recentRecords),
      errorRate: this.calculateErrorRate(recentRecords),
      avgExecutionTime: this.calculateAvgExecutionTime(recentRecords)
    };
  }

  /**
   * 获取热门工具
   */
  getTopTools(records) {
    const toolCounts = {};
    for (const record of records) {
      if (record.type === MetricType.TOOL_CALL && record.metadata.toolName) {
        const tool = record.metadata.toolName;
        toolCounts[tool] = (toolCounts[tool] || 0) + 1;
      }
    }

    return Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tool, count]) => ({ tool, count }));
  }

  /**
   * 计算错误率
   */
  calculateErrorRate(records) {
    const toolCalls = records.filter(r => r.type === MetricType.TOOL_CALL);
    if (toolCalls.length === 0) return 0;

    const errors = toolCalls.filter(r => r.metadata.success === false);
    return errors.length / toolCalls.length;
  }

  /**
   * 计算平均执行时间
   */
  calculateAvgExecutionTime(records) {
    const execTimes = records.filter(r => r.type === MetricType.EXECUTION_TIME);
    if (execTimes.length === 0) return 0;

    const sum = execTimes.reduce((acc, r) => acc + r.value, 0);
    return sum / execTimes.length;
  }

  /**
   * 清除记录
   */
  clear(sessionId = null) {
    if (sessionId) {
      this.sessionMetrics.delete(sessionId);
    } else {
      this.records = [];
      this.aggregates.clear();
      this.sessionMetrics.clear();
    }
  }

  /**
   * 启用/禁用监控
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

/**
 * 资源使用监控
 */
class ResourceMonitor {
  constructor() {
    this.snapshots = [];
    this.maxSnapshots = 100;
  }

  /**
   * 拍摄快照
   */
  snapshot() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    const snap = {
      timestamp: Date.now(),
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        rss: mem.rss
      },
      cpu: {
        user: cpu.user,
        system: cpu.system
      }
    };

    this.snapshots.push(snap);

    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    return snap;
  }

  /**
   * 获取趋势
   */
  getTrend() {
    if (this.snapshots.length < 2) return null;

    const latest = this.snapshots[this.snapshots.length - 1];
    const oldest = this.snapshots[0];

    return {
      memoryGrowth: latest.memory.heapUsed - oldest.memory.heapUsed,
      duration: latest.timestamp - oldest.timestamp,
      memoryTrend: latest.memory.heapUsed > oldest.memory.heapUsed ? 'increasing' : 'decreasing'
    };
  }
}

// 全局监控实例
const globalMonitor = new PerformanceMonitor();

module.exports = {
  PerformanceMonitor,
  ResourceMonitor,
  MetricType,
  MetricRecord,
  globalMonitor
};