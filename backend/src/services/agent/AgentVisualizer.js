/**
 * Agent 执行可视化服务
 * 实时追踪和展示 Agent 执行全流程
 */

const EventEmitter = require('events');
const createLogger = require('../../common/logger');
const logger = createLogger('AgentVisualizer');

/**
 * 执行步骤类型
 */
const StepType = {
  INTENT_DETECTION: 'intent_detection',
  QUERY_REWRITE: 'query_rewrite',
  QUERY_DECOMPOSE: 'query_decompose',
  TOOL_SELECTION: 'tool_selection',
  TOOL_EXECUTION: 'tool_execution',
  MODEL_CALL: 'model_call',
  RESULT_AGGREGATION: 'result_aggregation',
  ERROR: 'error'
};

/**
 * 步骤状态
 */
const StepStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error',
  SKIPPED: 'skipped'
};

/**
 * 单个执行步骤
 */
class ExecutionStep {
  constructor(type, name, metadata = {}) {
    this.id = `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = type;
    this.name = name;
    this.status = StepStatus.PENDING;
    this.startTime = null;
    this.endTime = null;
    this.duration = 0;
    this.metadata = metadata;
    this.children = [];
    this.result = null;
    this.error = null;
  }

  start() {
    this.status = StepStatus.RUNNING;
    this.startTime = Date.now();
  }

  complete(result = null) {
    this.status = StepStatus.SUCCESS;
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    this.result = result;
  }

  fail(error) {
    this.status = StepStatus.ERROR;
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    this.error = error.message || String(error);
  }

  skip() {
    this.status = StepStatus.SKIPPED;
    this.endTime = Date.now();
  }

  addChild(step) {
    this.children.push(step);
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      metadata: this.metadata,
      children: this.children.map(c => c.toJSON()),
      result: this.result,
      error: this.error
    };
  }
}

/**
 * Agent 执行轨迹
 */
class ExecutionTrace {
  constructor(traceId) {
    this.traceId = traceId;
    this.query = '';
    this.intent = null;
    this.steps = [];
    this.currentStep = null;
    this.stepStack = [];
    this.startTime = Date.now();
    this.endTime = null;
    this.totalDuration = 0;
    this.status = StepStatus.RUNNING;
    this.metadata = {};
  }

  /**
   * 开始根步骤
   */
  startStep(type, name, metadata = {}) {
    const step = new ExecutionStep(type, name, metadata);

    if (this.currentStep) {
      this.currentStep.addChild(step);
      this.stepStack.push(this.currentStep);
    } else {
      this.steps.push(step);
    }

    this.currentStep = step;
    step.start();

    this.emit('step_start', step);
    return step;
  }

  /**
   * 结束当前步骤
   */
  endStep(result = null) {
    if (!this.currentStep) return;

    this.currentStep.complete(result);
    this.emit('step_complete', this.currentStep);

    this.stepStack.pop();
    this.currentStep = this.stepStack[this.stepStack.length - 1] || null;
  }

  /**
   * 步骤失败
   */
  failStep(error) {
    if (!this.currentStep) return;

    this.currentStep.fail(error);
    this.emit('step_error', this.currentStep);

    this.stepStack.pop();
    this.currentStep = this.stepStack[this.stepStack.length - 1] || null;
  }

  /**
   * 跳过步骤
   */
  skipStep() {
    if (!this.currentStep) return;

    this.currentStep.skip();
    this.emit('step_skip', this.currentStep);

    this.stepStack.pop();
    this.currentStep = this.stepStack[this.stepStack.length - 1] || null;
  }

  /**
   * 完成整个轨迹
   */
  complete(finalResult = null) {
    this.status = StepStatus.SUCCESS;
    this.endTime = Date.now();
    this.totalDuration = this.endTime - this.startTime;

    // 如果还有未完成的步骤，完成它们
    while (this.currentStep) {
      this.currentStep.complete(finalResult);
      this.stepStack.pop();
      this.currentStep = this.stepStack[this.stepStack.length - 1] || null;
    }

    this.emit('trace_complete', this);
  }

  /**
   * 轨迹失败
   */
  fail(error) {
    this.status = StepStatus.ERROR;
    this.endTime = Date.now();
    this.totalDuration = this.endTime - this.startTime;
    this.emit('trace_error', this, error);
  }

  /**
   * 获取可视化作弊条数据
   */
  getTimelineData() {
    const timeline = [];
    this.buildTimeline(this.steps, timeline, 0);
    return timeline;
  }

  buildTimeline(steps, timeline, depth) {
    for (const step of steps) {
      timeline.push({
        id: step.id,
        type: step.type,
        name: step.name,
        status: step.status,
        duration: step.duration,
        depth,
        startTime: step.startTime,
        endTime: step.endTime,
        metadata: step.metadata
      });

      if (step.children.length > 0) {
        this.buildTimeline(step.children, timeline, depth + 1);
      }
    }
  }

  /**
   * 获取性能统计
   */
  getStats() {
    const stats = {
      totalDuration: this.totalDuration,
      stepCount: this.countSteps(this.steps),
      status: this.status,
      byType: {}
    };

    this.aggregateStats(this.steps, stats.byType);
    return stats;
  }

  countSteps(steps) {
    let count = steps.length;
    for (const step of steps) {
      count += this.countSteps(step.children);
    }
    return count;
  }

  aggregateStats(steps, byType) {
    for (const step of steps) {
      if (!byType[step.type]) {
        byType[step.type] = { count: 0, totalDuration: 0, errors: 0 };
      }
      byType[step.type].count++;
      byType[step.type].totalDuration += step.duration;
      if (step.status === StepStatus.ERROR) {
        byType[step.type].errors++;
      }

      this.aggregateStats(step.children, byType);
    }
  }

  toJSON() {
    return {
      traceId: this.traceId,
      query: this.query,
      intent: this.intent,
      steps: this.steps.map(s => s.toJSON()),
      startTime: this.startTime,
      endTime: this.endTime,
      totalDuration: this.totalDuration,
      status: this.status,
      metadata: this.metadata,
      timeline: this.getTimelineData(),
      stats: this.getStats()
    };
  }

  // 事件发射器方法
  emit(event, ...args) {
    if (this._events && this._events[event]) {
      this._events[event].forEach(listener => listener(...args));
    }
  }

  on(event, listener) {
    if (!this._events) this._events = {};
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(listener);
  }

  off(event, listener) {
    if (!this._events || !this._events[event]) return;
    this._events[event] = this._events[event].filter(l => l !== listener);
  }
}

/**
 * Agent 可视化服务
 */
class AgentVisualizer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.traces = new Map();
    this.maxTraces = options.maxTraces || 100;
    this.enableConsoleOutput = options.enableConsoleOutput !== false;

    // 颜色配置
    this.colors = {
      [StepType.INTENT_DETECTION]: '#6366f1', // indigo
      [StepType.QUERY_REWRITE]: '#8b5cf6', // violet
      [StepType.QUERY_DECOMPOSE]: '#a855f7', // purple
      [StepType.TOOL_SELECTION]: '#ec4899', // pink
      [StepType.TOOL_EXECUTION]: '#f97316', // orange
      [StepType.MODEL_CALL]: '#14b8a6', // teal
      [StepType.RESULT_AGGREGATION]: '#22c55e', // green
      [StepType.ERROR]: '#ef4444' // red
    };
  }

  /**
   * 创建新的执行轨迹
   */
  createTrace(traceId, query) {
    const trace = new ExecutionTrace(traceId);
    trace.query = query;

    // 添加事件监听
    trace.on('step_start', (step) => {
      this.logStepStart(step);
      this.emit('step_start', traceId, step);
    });

    trace.on('step_complete', (step) => {
      this.logStepComplete(step);
      this.emit('step_complete', traceId, step);
    });

    trace.on('step_error', (step) => {
      this.logStepError(step);
      this.emit('step_error', traceId, step);
    });

    trace.on('trace_complete', (trace) => {
      this.emit('trace_complete', traceId, trace);
    });

    // 存储轨迹
    this.traces.set(traceId, trace);

    // 清理旧轨迹
    if (this.traces.size > this.maxTraces) {
      const oldestKey = this.traces.keys().next().value;
      this.traces.delete(oldestKey);
    }

    return trace;
  }

  /**
   * 获取轨迹
   */
  getTrace(traceId) {
    return this.traces.get(traceId);
  }

  /**
   * 获取所有轨迹
   */
  getAllTraces() {
    return Array.from(this.traces.values()).map(t => t.toJSON());
  }

  /**
   * 获取最近 N 条轨迹摘要
   */
  getRecentTraces(limit = 10) {
    const traces = Array.from(this.traces.values());
    traces.sort((a, b) => b.startTime - a.startTime);
    return traces.slice(0, limit).map(t => ({
      traceId: t.traceId,
      query: t.query,
      status: t.status,
      totalDuration: t.totalDuration,
      startTime: t.startTime,
      stats: t.getStats(),
      stepCount: t.steps.length,
      steps: t.steps.map(s => s.toJSON()).slice(0, 20)
    }));
  }

  /**
   * 控制台输出 - 步骤开始
   */
  logStepStart(step) {
    if (!this.enableConsoleOutput) return;

    const indent = '  '.repeat(step.id.split('_').length - 2);
    const color = this.colors[step.type] || '#666666';

    logger.debug(`${indent}▶ ${step.name}`, { color });
  }

  /**
   * 控制台输出 - 步骤完成
   */
  logStepComplete(step) {
    if (!this.enableConsoleOutput) return;

    const indent = '  '.repeat(step.id.split('_').length - 2);
    const color = this.colors[step.type] || '#666666';
    const duration = step.duration ? `(${step.duration}ms)` : '';

    logger.info(`${indent}✓ ${step.name} ${duration}`, { color });
  }

  /**
   * 控制台输出 - 步骤错误
   */
  logStepError(step) {
    if (!this.enableConsoleOutput) return;

    const indent = '  '.repeat(step.id.split('_').length - 2);

    logger.error(`${indent}✗ ${step.name}: ${step.error}`);
  }

  /**
   * 生成 ASCII 时间线
   */
  generateAsciiTimeline(trace) {
    const timeline = trace.getTimelineData();
    const lines = [];

    lines.push(`\n╔══════════════════════════════════════════════════════════════╗`);
    lines.push(`║            Agent 执行轨迹 - ${trace.traceId.substring(0, 8)}              ║`);
    lines.push(`╠══════════════════════════════════════════════════════════════╣`);
    lines.push(`║ Query: ${trace.query.substring(0, 50)}${' '.repeat(Math.max(0, 50 - trace.query.length))}║`);
    lines.push(`╠══════════════════════════════════════════════════════════════╣`);

    for (const item of timeline) {
      const indent = '  '.repeat(item.depth);
      const status = item.status === 'success' ? '✓' : item.status === 'error' ? '✗' : '▸';
      const color = this.colors[item.type] || '#666666';
      const duration = item.duration ? `${item.duration}ms` : '';
      const name = `${indent}${status} ${item.name}`;

      const padding = Math.max(0, 55 - name.length - duration.length);
      lines.push(`║ ${name}${' '.repeat(padding)}${duration} ║`);
    }

    lines.push(`╠══════════════════════════════════════════════════════════════╣`);
    lines.push(`║ 总耗时: ${trace.totalDuration}ms | 状态: ${trace.status} | 步骤: ${trace.getStats().stepCount}              ║`);
    lines.push(`╚══════════════════════════════════════════════════════════════╝\n`);

    return lines.join('\n');
  }

  /**
   * 导出轨迹为 JSON
   */
  exportTrace(traceId) {
    const trace = this.traces.get(traceId);
    if (!trace) return null;

    return JSON.stringify(trace.toJSON(), null, 2);
  }

  /**
   * 清理所有轨迹
   */
  clear() {
    this.traces.clear();
  }
}

// 全局可视化实例
const agentVisualizer = new AgentVisualizer();

module.exports = {
  AgentVisualizer,
  ExecutionTrace,
  ExecutionStep,
  StepType,
  StepStatus,
  agentVisualizer
};
