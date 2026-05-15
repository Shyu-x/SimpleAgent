/**
 * 并行执行器
 * 支持独立任务的并行执行、结果聚合、错误处理
 */

const EventEmitter = require('events');
const AppError = require('../common/errors/AppError');

// 任务状态
const TASK_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

class ParallelExecutor extends EventEmitter {
  constructor(options = {}) {
    super();

    // 并发限制
    this.maxConcurrency = options.maxConcurrency || 5;

    // 任务队列
    this.taskQueue = [];
    this.runningTasks = new Map();

    // 结果聚合
    this.results = new Map();

    // 统计
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      cancelledTasks: 0,
      totalExecutionTime: 0
    };

    // 状态
    this.isRunning = false;
    this.isPaused = false;
  }

  /**
   * 添加任务到队列
   * @param {string} id - 任务ID
   * @param {Function} taskFn - 任务函数
   * @param {Object} options - 任务选项
   */
  addTask(id, taskFn, options = {}) {
    const task = {
      id,
      taskFn,
      options: {
        timeout: options.timeout || 30000,
        retries: options.retries || 0,
        priority: options.priority || 0,
        ...options
      },
      status: TASK_STATUS.PENDING,
      result: null,
      error: null,
      startTime: null,
      endTime: null,
      attempts: 0
    };

    this.taskQueue.push(task);
    this.results.set(id, task);

    // 按优先级排序
    this.taskQueue.sort((a, b) => b.options.priority - a.options.priority);

    this.stats.totalTasks++;

    this.emit('task:added', { id, options: task.options });

    return id;
  }

  /**
   * 添加多个任务
   * @param {Array} tasks - 任务数组 [{id, fn, options}]
   */
  addTasks(tasks) {
    return tasks.map(t => this.addTask(t.id, t.fn, t.options));
  }

  /**
   * 开始执行
   */
  async execute() {
    if (this.isRunning) {
      throw AppError.internalError('Already running');
    }

    this.isRunning = true;
    this.isPaused = false;
    const startTime = Date.now();

    this.emit('execution:start');

    try {
      while (this.taskQueue.length > 0 || this.runningTasks.size > 0) {
        if (this.isPaused) {
          await this._wait(100);
          continue;
        }

        // 启动新任务（不超过并发限制）
        while (this.taskQueue.length > 0 && this.runningTasks.size < this.maxConcurrency) {
          const task = this.taskQueue.shift();
          this._executeTask(task);
        }

        // 等待一段时间再检查
        await this._wait(50);
      }
    } finally {
      this.isRunning = false;
      this.stats.totalExecutionTime = Date.now() - startTime;
      this.emit('execution:complete', this.getResults());
    }

    return this.getResults();
  }

  /**
   * 执行单个任务
   */
  async _executeTask(task) {
    task.status = TASK_STATUS.RUNNING;
    task.startTime = Date.now();
    task.attempts++;

    this.runningTasks.set(task.id, task);
    this.emit('task:start', { id: task.id, attempt: task.attempts });

    try {
      // 执行任务（带超时）
      const result = await this._withTimeout(
        task.taskFn(),
        task.options.timeout
      );

      task.status = TASK_STATUS.COMPLETED;
      task.result = result;
      task.endTime = Date.now();

      this.stats.completedTasks++;
      this.emit('task:complete', { id: task.id, result, duration: task.endTime - task.startTime });

    } catch (error) {
      task.error = error;
      task.endTime = Date.now();

      // 重试
      if (task.attempts <= task.options.retries) {
        this.emit('task:retry', { id: task.id, attempt: task.attempts, error: error.message });
        this.taskQueue.unshift(task); // 放回队列开头
      } else {
        task.status = TASK_STATUS.FAILED;
        this.stats.failedTasks++;
        this.emit('task:failed', { id: task.id, error: error.message, attempts: task.attempts });
      }
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  /**
   * 带超时的Promise
   */
  _withTimeout(promise, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task timeout after ${timeout}ms`));
      }, timeout);

      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 等待
   */
  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 暂停执行
   */
  pause() {
    this.isPaused = true;
    this.emit('execution:paused');
  }

  /**
   * 恢复执行
   */
  resume() {
    this.isPaused = false;
    this.emit('execution:resumed');
  }

  /**
   * 取消任务
   */
  cancelTask(id) {
    const task = this.results.get(id);
    if (!task) return false;

    if (task.status === TASK_STATUS.PENDING) {
      task.status = TASK_STATUS.CANCELLED;
      this.stats.cancelledTasks++;
      this.taskQueue = this.taskQueue.filter(t => t.id !== id);
      this.emit('task:cancelled', { id });
      return true;
    }

    return false;
  }

  /**
   * 取消所有任务
   */
  cancelAll() {
    for (const task of this.taskQueue) {
      task.status = TASK_STATUS.CANCELLED;
      this.stats.cancelledTasks++;
    }
    this.taskQueue = [];
    this.emit('execution:cancelled');
  }

  /**
   * 获取所有结果
   */
  getResults() {
    const results = [];
    for (const task of this.results.values()) {
      results.push({
        id: task.id,
        status: task.status,
        result: task.result,
        error: task.error,
        duration: task.endTime - task.startTime,
        attempts: task.attempts
      });
    }
    return results;
  }

  /**
   * 获取任务结果
   */
  getTaskResult(id) {
    const task = this.results.get(id);
    if (!task) return null;

    return {
      status: task.status,
      result: task.result,
      error: task.error,
      duration: task.endTime - task.startTime,
      attempts: task.attempts
    };
  }

  /**
   * 等待特定任务完成
   */
  async waitForTask(id, timeout = 60000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const task = this.results.get(id);
      if (!task) {
        throw AppError.notFound(`Task ${id}`);
      }

      if (task.status === TASK_STATUS.COMPLETED) {
        return task.result;
      }

      if (task.status === TASK_STATUS.FAILED) {
        throw task.error;
      }

      await this._wait(100);
    }

    throw AppError.internalError(`Task ${id} timeout`);
  }

  /**
   * 批量等待
   */
  async waitForAll(timeout = 60000) {
    return Promise.all(
      Array.from(this.results.keys()).map(id => this.waitForTask(id, timeout).catch(e => ({ error: e.message })))
    );
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      pendingTasks: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      totalResults: this.results.size
    };
  }

  /**
   * 清除状态
   */
  clear() {
    this.taskQueue = [];
    this.runningTasks.clear();
    this.results.clear();
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      cancelledTasks: 0,
      totalExecutionTime: 0
    };
    this.isRunning = false;
    this.isPaused = false;
  }
}

/**
 * 工具并行执行器
 * 专门用于并行执行独立的工具调用
 */
class ToolParallelExecutor extends ParallelExecutor {
  constructor(toolRegistry, options = {}) {
    super(options);
    this.toolRegistry = toolRegistry;
  }

  /**
   * 并行执行多个工具调用
   * @param {Array} toolCalls - 工具调用数组 [{tool, params, id}]
   */
  async executeTools(toolCalls) {
    // 添加任务
    for (const call of toolCalls) {
      const id = call.id || `tool_${call.tool}_${Date.now()}_${Math.random()}`;

      this.addTask(id, async () => {
        return await this.toolRegistry.executeTool(call.tool, call.params || {});
      }, {
        timeout: call.timeout || 30000,
        retries: call.retries || 0,
        priority: call.priority || 0
      });
    }

    // 执行
    return await this.execute();
  }

  /**
   * 执行并行搜索
   */
  async executeParallelSearch(queries) {
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      this.addTask(`search_${i}`, async () => {
        return await this.toolRegistry.executeTool('web_search', { query });
      }, { priority: 1 });
    }

    return await this.execute();
  }
}

module.exports = {
  ParallelExecutor,
  ToolParallelExecutor,
  TASK_STATUS
};
