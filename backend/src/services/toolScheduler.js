/**
 * 工具调度优化器
 * 智能选择和调度工具执行
 */

const EventEmitter = require('events');
const AppError = require('../common/errors/AppError');
const { sleep, calculateBackoffDelay } = require('../utils/retry');

/**
 * 工具执行优先级
 */
const Priority = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3
};

/**
 * 工具调度器
 */
class ToolScheduler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxConcurrent = options.maxConcurrent || 3;
    this.timeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 2;

    this.queue = [];
    this.running = new Map();
    this.completed = [];
    this.failed = [];

    this.toolStats = new Map();
  }

  /**
   * 调度工具执行
   */
  async schedule(toolName, input, options = {}) {
    const task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      toolName,
      input,
      priority: options.priority || Priority.MEDIUM,
      timeout: options.timeout || this.timeout,
      retries: options.retries ?? this.retryAttempts,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null
    };

    // 按优先级插入队列
    this.insertByPriority(task);

    this.emit('scheduled', task);

    // 尝试执行
    this.processQueue();

    // 返回 Promise 等待结果
    return new Promise((resolve, reject) => {
      task.resolve = resolve;
      task.reject = reject;
    });
  }

  /**
   * 按优先级插入队列
   */
  insertByPriority(task) {
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].priority > task.priority) {
      i--;
    }
    this.queue.splice(i, 0, task);
  }

  /**
   * 处理队列
   */
  async processQueue() {
    while (this.queue.length > 0 && this.running.size < this.maxConcurrent) {
      const task = this.queue.shift();
      this.executeTask(task);
    }
  }

  /**
   * 执行任务
   */
  async executeTask(task) {
    task.startedAt = Date.now();
    this.running.set(task.id, task);

    this.emit('started', task);

    try {
      const result = await this.executeWithRetry(task);
      task.result = result;
      task.completedAt = Date.now();

      this.running.delete(task.id);
      this.completed.push(task);

      // 更新统计
      this.updateStats(task.toolName, true, task.completedAt - task.startedAt);

      this.emit('completed', task);
      task.resolve(result);

    } catch (error) {
      task.error = error;
      task.completedAt = Date.now();

      this.running.delete(task.id);
      this.failed.push(task);

      // 更新统计
      this.updateStats(task.toolName, false, task.completedAt - task.startedAt);

      this.emit('failed', { task, error });
      task.reject(error);
    }

    // 继续处理队列
    this.processQueue();
  }

  /**
   * 带重试的执行
   */
  async executeWithRetry(task) {
    let lastError;

    for (let attempt = 0; attempt <= task.retries; attempt++) {
      try {
        // 这里需要实际的工具执行器
        const result = await this.callTool(task.toolName, task.input, task.timeout);
        return result;
      } catch (error) {
        lastError = error;

        if (attempt < task.retries) {
          const delay = calculateBackoffDelay(attempt);
          await sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * 调用工具（由外部注入执行器）
   */
  async callTool(toolName, input, timeout) {
    // 子类需要重写此方法
    throw AppError.internalError('Tool executor not set');
  }

  /**
   * 设置工具执行器
   */
  setToolExecutor(executor) {
    this.callTool = executor;
  }

  /**
   * 更新统计
   */
  updateStats(toolName, success, duration) {
    if (!this.toolStats.has(toolName)) {
      this.toolStats.set(toolName, {
        calls: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        avgDuration: 0
      });
    }

    const stats = this.toolStats.get(toolName);
    stats.calls++;
    if (success) {
      stats.successes++;
    } else {
      stats.failures++;
    }
    stats.totalDuration += duration;
    stats.avgDuration = stats.totalDuration / stats.calls;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      runningCount: this.running.size,
      completedCount: this.completed.length,
      failedCount: this.failed.length,
      toolStats: Object.fromEntries(this.toolStats)
    };
  }

  /**
   * 取消任务
   */
  cancel(taskId) {
    // 从队列中移除
    const queueIndex = this.queue.findIndex(t => t.id === taskId);
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      task.reject(new Error('Task cancelled'));
      this.emit('cancelled', task);
      return true;
    }

    // 取消正在运行的任务
    const runningTask = this.running.get(taskId);
    if (runningTask) {
      runningTask.reject(new Error('Task cancelled'));
      this.running.delete(taskId);
      this.emit('cancelled', runningTask);
      return true;
    }

    return false;
  }

  /**
   * 清除队列
   */
  clear() {
    for (const task of this.queue) {
      task.reject(new Error('Queue cleared'));
    }
    this.queue = [];
    this.emit('cleared');
  }
}

/**
 * 智能工具选择器
 * 根据任务特征智能选择最佳工具
 */
class SmartToolSelector {
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
    this.toolCapabilities = new Map();
    this.usageHistory = [];
  }

  /**
   * 注册工具能力描述
   */
  registerToolCapability(toolName, capability) {
    this.toolCapabilities.set(toolName, {
      name: toolName,
      keywords: capability.keywords || [],
      category: capability.category || 'general',
      strength: capability.strength || 0.5,
      examples: capability.examples || []
    });
  }

  /**
   * 根据任务选择最佳工具
   */
  selectBestTool(task) {
    const taskLower = task.toLowerCase();
    const candidates = [];

    // 获取所有可用工具
    const tools = this.toolRegistry.listTools();

    for (const tool of tools) {
      const capability = this.toolCapabilities.get(tool.name) || {};
      let score = 0;

      // 关键词匹配
      const keywords = capability.keywords || [];
      for (const keyword of keywords) {
        if (taskLower.includes(keyword.toLowerCase())) {
          score += 0.3;
        }
      }

      // 类别匹配
      if (capability.category) {
        if (this.categoryMatchesTask(capability.category, taskLower)) {
          score += 0.2;
        }
      }

      // 强度加权
      score *= capability.strength || 0.5;

      // 使用历史加权
      const historyScore = this.getHistoryScore(tool.name);
      score += historyScore * 0.1;

      candidates.push({
        tool: tool.name,
        score,
        description: tool.description
      });
    }

    // 排序并返回最佳选择
    candidates.sort((a, b) => b.score - a.score);

    return candidates.length > 0 ? candidates[0] : null;
  }

  /**
   * 类别匹配任务
   */
  categoryMatchesTask(category, taskLower) {
    const categoryKeywords = {
      filesystem: ['文件', 'file', '读取', '写入', '目录', 'folder'],
      system: ['命令', 'command', 'shell', '执行', 'execute'],
      internet: ['网络', 'http', '请求', '搜索', 'search', 'web'],
      data: ['数据', 'json', 'csv', '解析', 'parse', '处理'],
      compute: ['计算', 'math', '代码', 'code', '执行']
    };

    const keywords = categoryKeywords[category] || [];
    return keywords.some(kw => taskLower.includes(kw));
  }

  /**
   * 获取历史使用得分
   */
  getHistoryScore(toolName) {
    const recentUses = this.usageHistory.filter(h => h.tool === toolName);
    if (recentUses.length === 0) return 0;

    const successRate = recentUses.filter(h => h.success).length / recentUses.length;
    return successRate;
  }

  /**
   * 记录使用历史
   */
  recordUsage(toolName, success) {
    this.usageHistory.push({
      tool: toolName,
      success,
      timestamp: Date.now()
    });

    // 保留最近100条记录
    if (this.usageHistory.length > 100) {
      this.usageHistory.shift();
    }
  }

  /**
   * 获取推荐工具列表
   */
  getRecommendations(task, limit = 3) {
    const tools = this.toolRegistry.listTools();
    const recommendations = [];

    for (const tool of tools) {
      const relevance = this.calculateRelevance(tool, task);
      if (relevance > 0.3) {
        recommendations.push({
          ...tool,
          relevance
        });
      }
    }

    return recommendations
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  /**
   * 计算相关性
   */
  calculateRelevance(tool, task) {
    const taskLower = task.toLowerCase();
    let relevance = 0;

    // 描述匹配
    const descLower = (tool.description || '').toLowerCase();
    const descWords = descLower.split(/\s+/);
    for (const word of descWords) {
      if (word.length > 2 && taskLower.includes(word)) {
        relevance += 0.1;
      }
    }

    // 名称匹配
    const nameLower = tool.name.toLowerCase();
    if (taskLower.includes(nameLower) || nameLower.includes(taskLower)) {
      relevance += 0.5;
    }

    return Math.min(relevance, 1);
  }
}

module.exports = {
  ToolScheduler,
  SmartToolSelector,
  Priority
};