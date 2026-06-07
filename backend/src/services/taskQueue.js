/**
 * 分布式任务队列服务
 * 基于Redis实现，支持Agent任务并行处理
 */

const EventEmitter = require('events');
const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('taskQueue');

// 任务状态
const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// 任务优先级
const TaskPriority = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  CRITICAL: 3
};

// 生成任务ID
const generateTaskId = () => {
  return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

class DistributedTaskQueue extends EventEmitter {
  constructor(options = {}) {
    super();

    this.redis = options.redis || null;
    this.namespace = options.namespace || 'agent:task';
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 5000; // 5秒
    this.defaultTimeout = options.defaultTimeout || 300000; // 5分钟
    this.maxWorkers = options.maxWorkers || 5;
    this.pollInterval = options.pollInterval || 1000;

    // 内存模式（无Redis时使用）
    this.memoryMode = !this.redis;
    this.tasks = new Map();
    this.queues = {
      [TaskPriority.CRITICAL]: [],
      [TaskPriority.HIGH]: [],
      [TaskPriority.NORMAL]: [],
      [TaskPriority.LOW]: []
    };
    this.runningTasks = new Map();
    this.workers = new Map();
    this.workerId = generateTaskId();

    // 启动任务处理循环
    if (this.memoryMode) {
      this.startProcessingLoop();
    }
  }

  /**
   * 初始化Redis连接
   */
  async init(redisClient) {
    this.redis = redisClient;
    this.memoryMode = false;
    logger.info('Redis connected, switched to distributed mode');
    this.emit('redis:connected');
  }

  /**
   * 添加任务到队列
   */
  async enqueue(task) {
    const taskId = task.id || generateTaskId();
    const priority = task.priority !== undefined ? task.priority : TaskPriority.NORMAL;

    const taskData = {
      id: taskId,
      type: task.type,
      payload: task.payload,
      priority,
      status: TaskStatus.PENDING,
      createdAt: Date.now(),
      retries: 0,
      maxRetries: task.maxRetries || this.maxRetries,
      timeout: task.timeout || this.defaultTimeout,
      metadata: task.metadata || {}
    };

    if (this.memoryMode) {
      this.tasks.set(taskId, taskData);
      this.queues[priority].push(taskId);
      this.emit('task:enqueued', taskData);
      return taskId;
    }

    // Redis模式
    try {
      // 存储任务数据
      await this.redis.hset(`${this.namespace}:tasks`, taskId, JSON.stringify(taskData));

      // 添加到优先级队列
      await this.redis.zadd(
        `${this.namespace}:queue`,
        priority,
        taskId
      );

      this.emit('task:enqueued', taskData);
      return taskId;
    } catch (error) {
      logger.error('Enqueue error', { error: error.message });
      throw error;
    }
  }

  /**
   * 从队列获取任务
   */
  async dequeue(workerId) {
    if (this.memoryMode) {
      return this.memoryDequeue(workerId);
    }

    try {
      // 按优先级获取任务
      for (let priority = TaskPriority.CRITICAL; priority >= TaskPriority.LOW; priority--) {
        const taskId = await this.redis.zpopmin(`${this.namespace}:queue`, 1);

        if (taskId && taskId[0]) {
          const id = taskId[0];
          const taskData = await this.redis.hget(`${this.namespace}:tasks`, id);

          if (taskData) {
            const task = JSON.parse(taskData);
            task.status = TaskStatus.RUNNING;
            task.startedAt = Date.now();
            task.workerId = workerId;

            // 更新任务状态
            await this.redis.hset(`${this.namespace}:tasks`, id, JSON.stringify(task));

            // 记录到运行任务
            await this.redis.hset(`${this.namespace}:running`, id, workerId);

            // 设置超时
            this.setTaskTimeout(id, task.timeout);

            this.emit('task:dequeued', task);
            return task;
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Dequeue error', { error: error.message });
      return null;
    }
  }

  /**
   * 内存模式出队
   */
  memoryDequeue(workerId) {
    for (let priority = TaskPriority.CRITICAL; priority >= TaskPriority.LOW; priority--) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        const taskId = queue.shift();
        const task = this.tasks.get(taskId);

        if (task && task.status === TaskStatus.PENDING) {
          task.status = TaskStatus.RUNNING;
          task.startedAt = Date.now();
          task.workerId = workerId;

          this.runningTasks.set(taskId, {
            workerId,
            startedAt: Date.now()
          });

          // 设置超时
          this.setTaskTimeout(taskId, task.timeout);

          this.emit('task:dequeued', task);
          return task;
        }
      }
    }
    return null;
  }

  /**
   * 任务完成
   */
  async complete(taskId, result) {
    if (this.memoryMode) {
      return this.memoryComplete(taskId, result);
    }

    try {
      const taskData = await this.redis.hget(`${this.namespace}:tasks`, taskId);
      if (!taskData) return;

      const task = JSON.parse(taskData);
      task.status = TaskStatus.COMPLETED;
      task.completedAt = Date.now();
      task.result = result;

      await this.redis.hset(`${this.namespace}:tasks`, taskId, JSON.stringify(task));
      await this.redis.hdel(`${this.namespace}:running`, taskId);

      this.emit('task:completed', task);
    } catch (error) {
      logger.error('Complete error', { error: error.message });
    }
  }

  /**
   * 内存模式完成
   */
  memoryComplete(taskId, result) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = TaskStatus.COMPLETED;
    task.completedAt = Date.now();
    task.result = result;

    this.runningTasks.delete(taskId);
    this.emit('task:completed', task);
  }

  /**
   * 任务失败
   */
  async fail(taskId, error) {
    if (this.memoryMode) {
      return this.memoryFail(taskId, error);
    }

    try {
      const taskData = await this.redis.hget(`${this.namespace}:tasks`, taskId);
      if (!taskData) return;

      const task = JSON.parse(taskData);
      task.retries++;

      if (task.retries < task.maxRetries) {
        // 重试
        task.status = TaskStatus.PENDING;
        task.lastError = error.message;
        task.nextRetryAt = Date.now() + this.retryDelay;

        await this.redis.hset(`${this.namespace}:tasks`, taskId, JSON.stringify(task));

        // 延迟后重新入队
        setTimeout(async () => {
          await this.redis.zadd(`${this.namespace}:queue`, task.priority, taskId);
        }, this.retryDelay);

        this.emit('task:retry', { task, error });
      } else {
        // 永久失败
        task.status = TaskStatus.FAILED;
        task.error = error.message;
        task.failedAt = Date.now();

        await this.redis.hset(`${this.namespace}:tasks`, taskId, JSON.stringify(task));
        await this.redis.hdel(`${this.namespace}:running`, taskId);

        this.emit('task:failed', { task, error });
      }
    } catch (err) {
      logger.error('Fail error', { error: err.message });
    }
  }

  /**
   * 内存模式失败
   */
  memoryFail(taskId, error) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.retries++;

    if (task.retries < task.maxRetries) {
      task.status = TaskStatus.PENDING;
      task.lastError = error.message;

      // 延迟后重新入队
      setTimeout(() => {
        this.queues[task.priority].push(taskId);
      }, this.retryDelay);

      this.emit('task:retry', { task, error });
    } else {
      task.status = TaskStatus.FAILED;
      task.error = error.message;
      task.failedAt = Date.now();

      this.runningTasks.delete(taskId);
      this.emit('task:failed', { task, error });
    }
  }

  /**
   * 取消任务
   */
  async cancel(taskId) {
    if (this.memoryMode) {
      const task = this.tasks.get(taskId);
      if (task) {
        task.status = TaskStatus.CANCELLED;
        task.cancelledAt = Date.now();
        this.emit('task:cancelled', task);
      }
      return;
    }

    try {
      const taskData = await this.redis.hget(`${this.namespace}:tasks`, taskId);
      if (!taskData) return;

      const task = JSON.parse(taskData);
      task.status = TaskStatus.CANCELLED;
      task.cancelledAt = Date.now();

      await this.redis.hset(`${this.namespace}:tasks`, taskId, JSON.stringify(task));
      await this.redis.hdel(`${this.namespace}:running`, taskId);

      this.emit('task:cancelled', task);
    } catch (error) {
      logger.error('Cancel error', { error: error.message });
    }
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(taskId) {
    if (this.memoryMode) {
      return this.tasks.get(taskId) || null;
    }

    try {
      const taskData = await this.redis.hget(`${this.namespace}:tasks`, taskId);
      return taskData ? JSON.parse(taskData) : null;
    } catch (error) {
      logger.error('Get status error', { error: error.message });
      return null;
    }
  }

  /**
   * 获取队列统计
   */
  async getStats() {
    if (this.memoryMode) {
      let pending = 0;
      let running = 0;
      let completed = 0;
      let failed = 0;

      for (const [id, task] of this.tasks) {
        switch (task.status) {
          case TaskStatus.PENDING: pending++; break;
          case TaskStatus.RUNNING: running++; break;
          case TaskStatus.COMPLETED: completed++; break;
          case TaskStatus.FAILED: failed++; break;
        }
      }

      return {
        pending,
        running,
        completed,
        failed,
        total: this.tasks.size,
        workers: this.workers.size
      };
    }

    try {
      const [pending, running, completed, failed] = await Promise.all([
        this.redis.zcard(`${this.namespace}:queue`),
        this.redis.hlen(`${this.namespace}:running`),
        this.redis.zcount(`${this.namespace}:tasks`, 0, 0), // 需要特殊查询
        0
      ]);

      return { pending, running, completed: 0, failed };
    } catch (error) {
      return { pending: 0, running: 0, completed: 0, failed: 0 };
    }
  }

  /**
   * 设置任务超时
   */
  setTaskTimeout(taskId, timeout) {
    setTimeout(() => {
      this.handleTaskTimeout(taskId);
    }, timeout);
  }

  /**
   * 处理任务超时
   */
  async handleTaskTimeout(taskId) {
    const status = await this.getTaskStatus(taskId);
    if (status && status.status === TaskStatus.RUNNING) {
      await this.fail(taskId, new Error('Task timeout'));
    }
  }

  /**
   * 启动处理循环（内存模式）
   */
  startProcessingLoop() {
    setInterval(async () => {
      const runningCount = this.runningTasks.size;
      if (runningCount >= this.maxWorkers) return;

      const availableSlots = this.maxWorkers - runningCount;

      for (let i = 0; i < availableSlots; i++) {
        const task = await this.dequeue(this.workerId);
        if (!task) break;

        // 异步执行任务
        this.executeTask(task);
      }
    }, this.pollInterval);
  }

  /**
   * 执行任务
   */
  async executeTask(task) {
    try {
      // 执行任务处理器
      if (task.handler) {
        const result = await task.handler(task.payload);
        await this.complete(task.id, result);
      } else {
        // 默认：直接标记完成
        await this.complete(task.id, { success: true });
      }
    } catch (error) {
      await this.fail(task.id, error);
    }
  }

  /**
   * 注册任务处理器
   */
  onTask(type, handler) {
    this.taskHandlers = this.taskHandlers || new Map();
    this.taskHandlers.set(type, handler);
  }

  /**
   * 提交任务并等待结果
   */
  async submitAndWait(task, timeout = 60000) {
    const taskId = await this.enqueue(task);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off('task:completed', handleComplete);
        this.off('task:failed', handleFailed);
        reject(new Error('Task timeout'));
      }, timeout);

      const handleComplete = (t) => {
        if (t.id === taskId) {
          clearTimeout(timeoutId);
          this.off('task:completed', handleComplete);
          this.off('task:failed', handleFailed);
          resolve(t.result);
        }
      };

      const handleFailed = (t) => {
        if (t.task.id === taskId) {
          clearTimeout(timeoutId);
          this.off('task:completed', handleComplete);
          this.off('task:failed', handleFailed);
          reject(new Error(t.error.message));
        }
      };

      this.on('task:completed', handleComplete);
      this.on('task:failed', handleFailed);
    });
  }

  /**
   * 清理过期任务
   */
  async cleanup(completedAfter = 86400000) { // 24小时
    if (this.memoryMode) {
      const cutoff = Date.now() - completedAfter;
      for (const [id, task] of this.tasks) {
        if (task.completedAt && task.completedAt < cutoff) {
          this.tasks.delete(id);
        }
      }
      return;
    }

    // Redis模式需要手动实现
  }
}

module.exports = {
  DistributedTaskQueue,
  TaskStatus,
  TaskPriority
};