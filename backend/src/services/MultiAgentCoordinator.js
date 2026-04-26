/**
 * 多Agent协作调度器 (v2.0)
 *
 * 基于 Claude Code 多Agent协作机制设计：
 * - Task Tool + Subagent 模式
 * - 三种协调模式：TEAM_LEADER / COLLABORATIVE / AUTONOMOUS
 * - 依赖管理与拓扑排序
 * - 生命周期钩子系统
 * - 标准化结果汇总
 *
 * @module services/MultiAgentCoordinator
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

/**
 * 协调模式枚举
 * 参考 Claude Code Agent Teams 协调模式
 */
const CoordinationMode = {
  TEAM_LEADER: 'team_leader',     // 主 Agent 主导，其他执行
  COLLABORATIVE: 'collaborative', // 对等协作，共享职责
  AUTONOMOUS: 'autonomous'       // 独立执行，最小协调
};

/**
 * 协作任务状态
 */
const CollaborationStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  PARTIAL_COMPLETED: 'partial_completed',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * 子任务状态
 */
const TaskStatus = {
  PENDING: 'pending',
  WAITING: 'waiting',     // 等待依赖完成
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'     // 因依赖失败而跳过
};

/**
 * 任务努力程度
 */
const TaskEffort = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

/**
 * 增强版任务定义
 * 参考 Claude Code YAML Frontmatter 格式
 */
class TaskDefinition {
  constructor(config = {}) {
    // 基础信息
    this.id = config.id || uuidv4();
    this.agentName = config.agentName || null;           // Agent 名称
    this.taskType = config.taskType || 'general';       // 任务类型 (e.g., code-review, db-implementation)
    this.title = config.title || config.description || 'Untitled Task';
    this.description = config.description || '';         // 详细描述
    this.prompt = config.prompt || '';                   // 完整 prompt

    // 依赖管理（Claude Code 核心特性）
    this.dependencies = config.dependencies || [];      // 依赖的任务 ID 数组
    this.dependents = [];                                // 被依赖的任务 ID 数组（运行时填充）

    // 执行控制
    this.effort = config.effort || TaskEffort.MEDIUM;   // low/medium/high
    this.maxTurns = config.maxTurns || 50;             // 最大轮次限制
    this.timeout = config.timeout || 60000;             // 超时时间(ms)

    // 成功标准
    this.successCriteria = config.successCriteria || null;
    this.onSuccess = config.onSuccess || null;
    this.onFailure = config.onFailure || null;

    // 协调配置
    this.coordinatorSession = config.coordinatorSession || null;
    this.additionalInstructions = config.additionalInstructions || null;

    // 优先级
    this.priority = config.priority || 0;

    // 运行时状态
    this.status = TaskStatus.PENDING;
    this.result = null;
    this.error = null;
    this.startedAt = null;
    this.completedAt = null;
    this.attempts = 0;
  }

  /**
   * 检查依赖是否都已完成
   */
  areDependenciesMet(completedTasks) {
    if (!this.dependencies || this.dependencies.length === 0) {
      return true;
    }
    return this.dependencies.every(depId => {
      const depTask = completedTasks.get(depId);
      return depTask && depTask.status === TaskStatus.COMPLETED;
    });
  }

  /**
   * 检查是否有依赖失败
   */
  hasFailedDependencies(completedTasks) {
    if (!this.dependencies || this.dependencies.length === 0) {
      return false;
    }
    return this.dependencies.some(depId => {
      const depTask = completedTasks.get(depId);
      return depTask && depTask.status === TaskStatus.FAILED;
    });
  }

  /**
   * 验证成功标准
   */
  validateSuccess(result) {
    if (!this.successCriteria) {
      return { passed: true };
    }

    // 支持函数或正则
    if (typeof this.successCriteria === 'function') {
      try {
        const passed = this.successCriteria(result);
        return { passed, message: passed ? 'Passed' : 'Failed criteria check' };
      } catch (e) {
        return { passed: false, message: `Criteria check error: ${e.message}` };
      }
    }

    if (typeof this.successCriteria === 'string' && result) {
      const passed = String(result).includes(this.successCriteria);
      return { passed, message: passed ? 'Passed' : 'Failed string match' };
    }

    return { passed: true };
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      id: this.id,
      agentName: this.agentName,
      taskType: this.taskType,
      title: this.title,
      description: this.description,
      prompt: this.prompt,
      dependencies: this.dependencies,
      effort: this.effort,
      maxTurns: this.maxTurns,
      timeout: this.timeout,
      successCriteria: typeof this.successCriteria === 'function' ? '[Function]' : this.successCriteria,
      coordinatorSession: this.coordinatorSession,
      additionalInstructions: this.additionalInstructions,
      priority: this.priority,
      status: this.status
    };
  }
}

/**
 * 子任务结果（增强版）
 */
class SubTaskResult {
  constructor(taskDefinition, agentId, status, result = null, error = null, metadata = {}) {
    this.taskId = taskDefinition.id;
    this.taskType = taskDefinition.taskType;
    this.agentId = agentId;
    this.status = status;
    this.result = result;
    this.error = error;
    this.metadata = metadata;
    this.startedAt = taskDefinition.startedAt;
    this.completedAt = Date.now();
    this.duration = this.completedAt - (this.startedAt || this.completedAt);
    this.validation = status === TaskStatus.COMPLETED ? taskDefinition.validateSuccess(result) : null;
  }
}

/**
 * 协作任务（增强版）
 */
class CollaborationTask {
  constructor(id, title, tasks, options = {}) {
    this.id = id;
    this.title = title;

    // 任务定义数组
    this.tasks = tasks.map((t, i) => {
      if (!(t instanceof TaskDefinition)) {
        t.id = t.id || `${id}-${i}`;
        return new TaskDefinition(t);
      }
      return t;
    });

    // 构建依赖关系
    this._buildDependencyGraph();

    this.status = CollaborationStatus.PENDING;
    this.results = new Map();
    this.options = {
      timeout: options.timeout || 60000,
      coordinationMode: options.coordinationMode || CoordinationMode.COLLABORATIVE,
      minSuccessRate: options.minSuccessRate || 0.5,
      onProgress: options.onProgress || null,
      enableHooks: options.enableHooks !== false, // 默认启用钩子
      ...options
    };

    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
  }

  /**
   * 构建依赖图
   */
  _buildDependencyGraph() {
    const taskMap = new Map(this.tasks.map(t => [t.id, t]));

    for (const task of this.tasks) {
      if (task.dependencies && task.dependencies.length > 0) {
        for (const depId of task.dependencies) {
          const depTask = taskMap.get(depId);
          if (depTask) {
            depTask.dependents.push(task.id);
          }
        }
      }
    }
  }

  /**
   * 拓扑排序（Kahn算法）
   */
  getTopologicalOrder() {
    const inDegree = new Map();
    const adjacency = new Map();
    const taskMap = new Map();

    // 初始化
    for (const task of this.tasks) {
      inDegree.set(task.id, 0);
      adjacency.set(task.id, []);
      taskMap.set(task.id, task);
    }

    // 构建图
    for (const task of this.tasks) {
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          if (inDegree.has(depId)) {
            inDegree.set(task.id, inDegree.get(task.id) + 1);
            adjacency.get(depId).push(task.id);
          }
        }
      }
    }

    // BFS 拓扑排序
    const queue = [];
    const result = [];

    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      result.push(taskMap.get(current));

      for (const neighbor of adjacency.get(current)) {
        const newDegree = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // 检测循环依赖
    if (result.length !== this.tasks.length) {
      throw new Error('Circular dependency detected');
    }

    return result;
  }

  /**
   * 按层级分组（同一层可并行）
   */
  getExecutionLevels() {
    const levels = [];
    const completed = new Set();
    const remaining = [...this.tasks];

    while (remaining.length > 0) {
      const level = [];

      for (let i = remaining.length - 1; i >= 0; i--) {
        const task = remaining[i];
        if (task.areDependenciesMet(new Map(completed.size > 0
          ? this.tasks.filter(t => completed.has(t.id)).map(t => [t.id, t])
          : []))) {
          level.push(task);
          remaining.splice(i, 1);
        }
      }

      if (level.length === 0 && remaining.length > 0) {
        throw new Error('Unable to resolve task order - possible circular dependency');
      }

      levels.push(level);

      // 将本层任务标记为完成（用于下一层判断）
      for (const task of level) {
        completed.add(task.id);
      }
    }

    return levels;
  }
}

/**
 * 多Agent协作调度器 (v2.0)
 */
class MultiAgentCoordinator extends EventEmitter {
  constructor(a2aService) {
    super();
    this.a2aService = a2aService;
    this.collaborationTasks = new Map();
    this.agentPool = new Map();
    this.taskDefinitions = new Map();
    this._initAgentPoolMonitor();
  }

  /**
   * 初始化 Agent 池监控
   */
  _initAgentPoolMonitor() {
    setInterval(() => this._cleanupExpiredTasks(), 60000);
  }

  // ==================== P0: 增强任务定义 ====================

  /**
   * 创建任务定义
   * @param {Object} config - 任务配置
   */
  createTaskDefinition(config) {
    const taskDef = new TaskDefinition(config);
    this.taskDefinitions.set(taskDef.id, taskDef);
    this._emitHook('task:defined', { task: taskDef.toJSON() });
    return taskDef;
  }

  /**
   * 批量创建任务定义
   */
  createTaskDefinitions(taskConfigs) {
    return taskConfigs.map(config => this.createTaskDefinition(config));
  }

  /**
   * 获取任务定义
   */
  getTaskDefinition(taskId) {
    return this.taskDefinitions.get(taskId);
  }

  // ==================== P2: 三种协调模式 ====================

  /**
   * 执行协作任务
   * @param {string} title - 任务标题
   * @param {Array} tasks - 任务列表
   * @param {Object} options - 配置选项
   */
  async executeCollaboration(title, tasks, options = {}) {
    const taskId = uuidv4();
    const collaboration = new CollaborationTask(taskId, title, tasks, options);

    this.collaborationTasks.set(taskId, collaboration);

    this._log('info', `Starting collaboration ${taskId}: ${title}`, {
      mode: collaboration.options.coordinationMode,
      taskCount: tasks.length
    });

    try {
      collaboration.status = CollaborationStatus.RUNNING;
      collaboration.startedAt = Date.now();

      this._emitHook('collaboration:started', {
        collaborationId: taskId,
        title,
        mode: collaboration.options.coordinationMode,
        taskCount: tasks.length
      });

      // 根据协调模式执行
      const mode = collaboration.options.coordinationMode;

      switch (mode) {
        case CoordinationMode.TEAM_LEADER:
          await this._executeTeamLeader(collaboration);
          break;
        case CoordinationMode.AUTONOMOUS:
          await this._executeAutonomous(collaboration);
          break;
        case CoordinationMode.COLLABORATIVE:
        default:
          await this._executeCollaborative(collaboration);
          break;
      }

      // P1: 评估结果并汇总
      const result = this._evaluateCollaboration(collaboration);

      this._emitHook('collaboration:completed', {
        collaborationId: taskId,
        ...result
      });

      return result;

    } catch (error) {
      collaboration.status = CollaborationStatus.FAILED;
      this._log('error', `Collaboration ${taskId} failed:`, error);

      this._emitHook('collaboration:error', {
        collaborationId: taskId,
        error: error.message
      });

      return this._formatCollaborationResult(collaboration);
    }
  }

  /**
   * TEAM_LEADER 模式：主 Agent 协调，其他执行
   */
  async _executeTeamLeader(collaboration) {
    const tasks = collaboration.tasks;
    const levels = collaboration.getExecutionLevels();

    for (const level of levels) {
      // 每层选择一个主 Agent 协调
      const leaderTask = level[0];
      const workerTasks = level.slice(1);

      // 主 Agent 执行
      await this._executeTaskWithHook(collaboration, leaderTask);

      // 如果主 Agent 成功，Worker 并行执行
      const leaderResult = collaboration.results.get(leaderTask.id);
      if (leaderResult && leaderResult.status === TaskStatus.COMPLETED) {
        if (workerTasks.length > 0) {
          await Promise.allSettled(
            workerTasks.map(task => this._executeTaskWithHook(collaboration, task))
          );
        }
      } else if (leaderResult && leaderResult.status === TaskStatus.FAILED) {
        // 主 Agent 失败，跳过其他任务
        for (const task of workerTasks) {
          collaboration.results.set(task.id, new SubTaskResult(
            task, task.agentId || 'system', TaskStatus.SKIPPED, null,
            'Skipped due to leader task failure'
          ));
        }
      }
    }
  }

  /**
   * AUTONOMOUS 模式：所有任务独立并行执行
   */
  async _executeAutonomous(collaboration) {
    const promises = collaboration.tasks.map(task =>
      this._executeTaskWithHook(collaboration, task)
    );
    await Promise.allSettled(promises);
  }

  /**
   * COLLABORATIVE 模式：基于依赖的层级执行
   */
  async _executeCollaborative(collaboration) {
    const levels = collaboration.getExecutionLevels();

    for (const level of levels) {
      // 同层任务并行执行
      const promises = level.map(task => this._executeTaskWithHook(collaboration, task));
      await Promise.allSettled(promises);
    }
  }

  /**
   * 执行单个任务（带钩子）
   */
  async _executeTaskWithHook(collaboration, task) {
    // 检查依赖是否失败
    const completedTasks = new Map(
      Array.from(collaboration.results.entries()).map(([id, r]) => [id, { status: r.status }])
    );

    if (task.hasFailedDependencies(completedTasks)) {
      const result = new SubTaskResult(
        task, task.agentId || 'system', TaskStatus.SKIPPED, null,
        'Skipped due to dependency failure'
      );
      collaboration.results.set(task.id, result);

      this._emitHook('task:skipped', {
        collaborationId: collaboration.id,
        taskId: task.id,
        reason: 'dependency_failed'
      });
      return result;
    }

    // 等待依赖完成
    if (!task.areDependenciesMet(completedTasks)) {
      task.status = TaskStatus.WAITING;
      this._emitHook('task:waiting', {
        collaborationId: collaboration.id,
        taskId: task.id
      });

      // 等待依赖完成（简化实现：直接执行，让 A2A 处理）
    }

    this._emitHook('task:created', {
      collaborationId: collaboration.id,
      task: task.toJSON()
    });

    try {
      const result = await this._executeTask(collaboration, task);

      this._emitHook('task:completed', {
        collaborationId: collaboration.id,
        taskId: task.id,
        result: result.result,
        duration: result.duration
      });

      return result;

    } catch (error) {
      task.status = TaskStatus.FAILED;
      task.error = error.message;

      this._emitHook('task:failed', {
        collaborationId: collaboration.id,
        taskId: task.id,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * 执行单个子任务
   */
  async _executeTask(collaboration, task) {
    task.status = TaskStatus.RUNNING;
    task.startedAt = Date.now();

    const agentId = task.agentId || this.selectBestAgent(task.taskType);

    this._log('info', `Executing task ${task.id} on ${agentId}`, {
      taskType: task.taskType,
      effort: task.effort
    });

    this.updateAgentLoad(agentId, (this.agentPool.get(agentId)?.load || 0) + 1);

    try {
      // 构建 prompt（包含 additionalInstructions）
      const fullPrompt = this._buildTaskPrompt(task);

      // 委托任务
      const { task: delegatedTask, success } = this.a2aService.delegateTask({
        from: 'coordinator',
        to: agentId,
        title: task.title,
        description: task.description,
        input: { prompt: fullPrompt, taskType: task.taskType },
        timeout: task.timeout
      });

      if (!success) {
        throw new Error(`Failed to delegate task to ${agentId}`);
      }

      // 等待结果
      const result = await this._waitForResult(delegatedTask.id, task.timeout);

      task.status = TaskStatus.COMPLETED;
      task.result = result;

      const subTaskResult = new SubTaskResult(task, agentId, TaskStatus.COMPLETED, result);
      collaboration.results.set(task.id, subTaskResult);

      return subTaskResult;

    } catch (error) {
      task.status = TaskStatus.FAILED;
      task.error = error.message;
      task.attempts++;

      const subTaskResult = new SubTaskResult(task, agentId, TaskStatus.FAILED, null, error.message);
      collaboration.results.set(task.id, subTaskResult);

      throw error;

    } finally {
      if (agentId) {
        this.updateAgentLoad(agentId, Math.max(0, (this.agentPool.get(agentId)?.load || 1) - 1));
      }
    }
  }

  /**
   * 构建任务 prompt
   */
  _buildTaskPrompt(task) {
    let prompt = task.prompt || task.description;

    if (task.additionalInstructions) {
      prompt += `\n\n## Additional Instructions\n${task.additionalInstructions}`;
    }

    if (task.successCriteria) {
      const criteria = typeof task.successCriteria === 'string'
        ? task.successCriteria
        : 'Complete successfully';
      prompt += `\n\n## Success Criteria\n${criteria}`;
    }

    return prompt;
  }

  // ==================== P3: 生命周期钩子 ====================

  /**
   * 触发钩子
   */
  _emitHook(event, data) {
    if (!this._hooksEnabled) return;

    // 触发事件
    this.emit(event, data);

    // 触发全局钩子
    this.emit('*', { event, ...data });
  }

  /**
   * 启用/禁用钩子
   */
  setHooksEnabled(enabled) {
    this._hooksEnabled = enabled;
  }

  /**
   * 注册钩子
   */
  onHook(event, handler) {
    if (event === '*') {
      this.on('*', handler);
    } else {
      this.on(event, handler);
    }
  }

  /**
   * 移除钩子
   */
  offHook(event, handler) {
    if (event === '*') {
      this.off('*', handler);
    } else {
      this.off(event, handler);
    }
  }

  // ==================== P1: 标准化结果汇总 ====================

  /**
   * 评估协作结果
   */
  _evaluateCollaboration(collaboration) {
    const successRate = this._calculateSuccessRate(collaboration);
    const completedCount = Array.from(collaboration.results.values())
      .filter(r => r.status === TaskStatus.COMPLETED).length;
    const failedCount = Array.from(collaboration.results.values())
      .filter(r => r.status === TaskStatus.FAILED).length;
    const skippedCount = Array.from(collaboration.results.values())
      .filter(r => r.status === TaskStatus.SKIPPED).length;

    if (successRate >= collaboration.options.minSuccessRate) {
      collaboration.status = CollaborationStatus.COMPLETED;
    } else if (completedCount > 0) {
      collaboration.status = CollaborationStatus.PARTIAL_COMPLETED;
    } else {
      collaboration.status = CollaborationStatus.FAILED;
    }

    collaboration.completedAt = Date.now();

    return this._formatCollaborationResult(collaboration);
  }

  /**
   * 计算成功率
   */
  _calculateSuccessRate(collaboration) {
    const total = collaboration.tasks.length;
    if (total === 0) return 0;

    const completed = Array.from(collaboration.results.values())
      .filter(r => r.status === TaskStatus.COMPLETED).length;

    return completed / total;
  }

  /**
   * 收集所有结果
   */
  _collectResults(collaboration) {
    return Array.from(collaboration.results.entries()).map(([taskId, result]) => ({
      taskId,
      taskType: result.taskType,
      agentId: result.agentId,
      status: result.status,
      result: result.result,
      error: result.error,
      duration: result.duration,
      validation: result.validation,
      metadata: result.metadata
    }));
  }

  /**
   * 构建依赖图
   */
  _buildDependencyGraph(collaboration) {
    const nodes = collaboration.tasks.map(t => ({
      id: t.id,
      taskType: t.taskType,
      title: t.title,
      dependencies: t.dependencies || [],
      dependents: t.dependents || []
    }));

    const edges = [];
    for (const task of collaboration.tasks) {
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          edges.push({
            from: depId,
            to: task.id
          });
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * 格式化协作结果（标准化汇总格式）
   */
  _formatCollaborationResult(collaboration) {
    const results = this._collectResults(collaboration);
    const completed = results.filter(r => r.status === TaskStatus.COMPLETED);
    const failed = results.filter(r => r.status === TaskStatus.FAILED);
    const skipped = results.filter(r => r.status === TaskStatus.SKIPPED);

    return {
      // 基础信息
      id: collaboration.id,
      title: collaboration.title,
      status: collaboration.status,

      // P1: 标准化汇总格式
      summary: {
        totalTasks: collaboration.tasks.length,
        completed: completed.length,
        failed: failed.length,
        skipped: skipped.length,
        successRate: this._calculateSuccessRate(collaboration)
      },

      // P1: 结果详情
      results,

      // P1: 依赖图
      dependencyGraph: this._buildDependencyGraph(collaboration),

      // P1: 验证结果
      validation: {
        passed: collaboration.status === CollaborationStatus.COMPLETED ||
                collaboration.status === CollaborationStatus.PARTIAL_COMPLETED,
        criteria: collaboration.options.minSuccessRate
      },

      // 性能指标
      performance: {
        duration: collaboration.completedAt - collaboration.createdAt,
        startedAt: collaboration.startedAt,
        completedAt: collaboration.completedAt
      },

      // 原始数据
      raw: {
        coordinationMode: collaboration.options.coordinationMode,
        options: collaboration.options
      }
    };
  }

  // ==================== Agent 池管理 ====================

  /**
   * 注册 Agent
   */
  registerAgent(agentId, capabilities = [], metadata = {}) {
    this.agentPool.set(agentId, {
      id: agentId,
      capabilities,
      load: 0,
      status: 'idle',
      effort: metadata.effort || TaskEffort.MEDIUM,
      registeredAt: Date.now(),
      metadata
    });
  }

  /**
   * 更新 Agent 负载
   */
  updateAgentLoad(agentId, load) {
    const agent = this.agentPool.get(agentId);
    if (agent) {
      agent.load = load;
    }
  }

  /**
   * 选择最佳 Agent
   */
  selectBestAgent(requiredCapabilities = []) {
    let bestAgent = null;
    let lowestLoad = Infinity;

    for (const [agentId, agent] of this.agentPool) {
      if (requiredCapabilities.length > 0) {
        const hasAll = requiredCapabilities.every(cap => agent.capabilities.includes(cap));
        if (!hasAll) continue;
      }

      if (agent.load < lowestLoad) {
        lowestLoad = agent.load;
        bestAgent = agentId;
      }
    }

    return bestAgent;
  }

  // ==================== 任务控制 ====================

  /**
   * 等待任务结果
   */
  _waitForResult(taskId, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task ${taskId} timeout after ${timeout}ms`));
      }, timeout);

      const cleanup = () => {
        clearTimeout(timer);
        this.a2aService.removeListener('task:completed', onTaskCompleted);
        this.a2aService.broker.removeListener('message:sent', onMessage);
      };

      const onTaskCompleted = (task) => {
        if (task.id === taskId) {
          cleanup();
          if (task.status === 'failed') {
            reject(new Error(task.error || `Task ${taskId} failed`));
          } else {
            resolve(task.result || task.output);
          }
        }
      };

      const onMessage = (message) => {
        if (message.taskId === taskId && message.type === 'result.return') {
          cleanup();
          resolve(message.payload?.result || message.payload);
        }
      };

      this.a2aService.on('task:completed', onTaskCompleted);
      this.a2aService.broker.on('message:sent', onMessage);
    });
  }

  /**
   * 取消协作任务
   */
  cancelCollaboration(taskId) {
    const collaboration = this.collaborationTasks.get(taskId);
    if (collaboration) {
      collaboration.status = CollaborationStatus.CANCELLED;

      // 取消所有待执行任务
      for (const task of collaboration.tasks) {
        if (task.status === TaskStatus.PENDING || task.status === TaskStatus.WAITING) {
          task.status = TaskStatus.SKIPPED;
        }
      }

      this._emitHook('collaboration:cancelled', { collaborationId: taskId });
      return true;
    }
    return false;
  }

  /**
   * 获取协作状态
   */
  getCollaborationStatus(taskId) {
    return this.collaborationTasks.get(taskId);
  }

  /**
   * 获取详细结果
   */
  getCollaborationResult(taskId) {
    const collaboration = this.collaborationTasks.get(taskId);
    if (!collaboration) return null;
    return this._formatCollaborationResult(collaboration);
  }

  /**
   * 清理过期任务
   */
  _cleanupExpiredTasks() {
    const now = Date.now();
    for (const [taskId, task] of this.collaborationTasks) {
      if (task.completedAt && now - task.completedAt > 3600000) {
        this.collaborationTasks.delete(taskId);
      }
    }
  }

  /**
   * 日志记录
   */
  _log(level, message, data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: 'MultiAgentCoordinator',
      message,
      ...data
    };

    if (level === 'error') {
      console.error(`[MultiAgentCoordinator] ${message}`, data);
    } else if (level === 'warn') {
      console.warn(`[MultiAgentCoordinator] ${message}`, data);
    } else {
      console.log(`[MultiAgentCoordinator] ${message}`, data);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const tasks = Array.from(this.collaborationTasks.values());
    const running = tasks.filter(t => t.status === CollaborationStatus.RUNNING);
    const completed = tasks.filter(t => t.status === CollaborationStatus.COMPLETED);
    const failed = tasks.filter(t => t.status === CollaborationStatus.FAILED);

    return {
      activeCollaborations: running.length,
      totalCollaborations: tasks.length,
      completedCollaborations: completed.length,
      failedCollaborations: failed.length,
      agentPoolSize: this.agentPool.size,
      agents: Array.from(this.agentPool.entries()).map(([id, agent]) => ({
        id,
        load: agent.load,
        status: agent.status,
        capabilities: agent.capabilities
      })),
      coordinationModes: {
        teamLeader: tasks.filter(t => t.options.coordinationMode === CoordinationMode.TEAM_LEADER).length,
        collaborative: tasks.filter(t => t.options.coordinationMode === CoordinationMode.COLLABORATIVE).length,
        autonomous: tasks.filter(t => t.options.coordinationMode === CoordinationMode.AUTONOMOUS).length
      }
    };
  }
}

module.exports = {
  MultiAgentCoordinator,
  CollaborationTask,
  CollaborationStatus,
  TaskStatus,
  TaskEffort,
  TaskDefinition,
  SubTaskResult,
  CoordinationMode
};
