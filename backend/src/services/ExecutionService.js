/**
 * 执行记录服务
 * 封装执行记录的业务逻辑
 *
 * @date 2026-05-15
 */

const { missionService } = require('./missionService');

/**
 * 映射任务状态到执行状态
 * @param {string} taskStatus - 任务状态
 * @returns {string} 执行状态
 */
function mapTaskStatus(taskStatus) {
  const statusMap = {
    pending: 'running',
    running: 'running',
    completed: 'completed',
    failed: 'error',
    cancelled: 'cancelled'
  };
  return statusMap[taskStatus] || 'paused';
}

/**
 * 将任务转换为执行记录格式
 * @param {Object} task - 任务对象
 * @returns {Object} 执行记录
 */
function mapTaskToExecution(task) {
  return {
    id: `exec_${task.id}`,
    taskId: task.id,
    taskName: task.name,
    description: task.description,
    status: mapTaskStatus(task.status),
    startedAt: task.startedAt || task.createdAt,
    completedAt: task.completedAt,
    duration: task.completedAt && task.startedAt
      ? task.completedAt - task.startedAt
      : task.startedAt ? Date.now() - task.startedAt : 0,
    iterations: 1,
    maxIterations: 10,
    toolCalls: 0,
    checkpoints: 0,
    agentName: task.assignedAgent || 'system',
    errorMessage: task.error,
    result: task.result,
    metadata: {
      model: 'MiniMax-M2.7',
      priority: task.priority,
      tokensUsed: task.tokensUsed || 0,
      cost: task.cost || 0
    }
  };
}

/**
 * 按日期范围过滤执行记录
 * @param {Array} executions - 执行记录列表
 * @param {string} dateRange - 日期范围 (today/week/month)
 * @returns {Array} 过滤后的执行记录
 */
function filterByDateRange(executions, dateRange) {
  if (!dateRange) return executions;

  const now = Date.now();
  const ranges = {
    today: 86400000,
    week: 604800000,
    month: 2592000000
  };
  const cutoff = ranges[dateRange] || 0;
  if (!cutoff) return executions;

  return executions.filter(e => now - e.startedAt < cutoff);
}

/**
 * 计算执行记录统计
 * @param {Array} executions - 执行记录列表
 * @returns {Object} 统计数据
 */
function calculateStats(executions) {
  return {
    total: executions.length,
    completed: executions.filter(e => e.status === 'completed').length,
    failed: executions.filter(e => e.status === 'error').length,
    running: executions.filter(e => e.status === 'running' || e.status === 'pending').length,
    totalTokens: executions.reduce((sum, e) => sum + (e.metadata?.tokensUsed || 0), 0),
    totalCost: executions.reduce((sum, e) => sum + (e.metadata?.cost || 0), 0)
  };
}

/**
 * 获取执行记录列表
 * @param {Object} params - 查询参数
 * @param {number} params.limit - 限制数量
 * @param {string} params.status - 状态过滤
 * @param {string} params.agentId - Agent ID
 * @param {string} params.dateRange - 日期范围
 * @returns {Object} 执行记录响应
 */
function getExecutions(params = {}) {
  const { limit = 50, status, agentId, dateRange } = params;

  const result = missionService.listTasks({
    page: 1,
    limit: parseInt(limit) || 50,
    status,
    agentId
  });

  // 转换任务为执行记录格式
  const executions = result.tasks.map(mapTaskToExecution);

  // 日期过滤
  const filtered = filterByDateRange(executions, dateRange);

  // 统计
  const stats = calculateStats(filtered);

  return {
    data: {
      executions: filtered,
      stats,
      pagination: result.pagination
    }
  };
}

/**
 * 获取单个执行记录
 * @param {string} id - 执行记录ID
 * @returns {Object|null} 执行记录或null
 */
function getExecution(id) {
  // 移除前缀获取真实ID
  const taskId = id.replace('exec_', '');
  const task = missionService.getTask(taskId);

  if (!task) return null;

  return mapTaskToExecution(task);
}

/**
 * 获取执行统计摘要
 * @returns {Object} 统计摘要
 */
function getExecutionStats() {
  let totalTokens = 0;

  // 懒加载 MetricsCollector 避免启动时错误
  try {
    const { getMetricsCollector } = require('../infra/metrics');
    const collector = getMetricsCollector();
    if (collector) {
      const summary = collector.getSummaryMetrics?.() || {};
      totalTokens = summary.model?.totalTokens || 0;
    }
  } catch (e) {
    // MetricsCollector 初始化失败，忽略
  }

  const missionStats = missionService.getStats();
  const result = missionService.listTasks({ page: 1, limit: 1000 });
  const executions = result.tasks;

  const stats = {
    total: executions.length,
    completed: executions.filter(e => e.status === 'completed').length,
    failed: executions.filter(e => e.status === 'failed').length,
    running: executions.filter(e => e.status === 'running' || e.status === 'pending').length,
    totalTokens,
    totalCost: 0
  };

  return {
    data: {
      ...stats,
      missionStats
    }
  };
}

module.exports = {
  // 导出函数
  mapTaskStatus,
  mapTaskToExecution,
  filterByDateRange,
  calculateStats,
  getExecutions,
  getExecution,
  getExecutionStats,
  // 向后兼容常量
  EXECUTION_STATUS_MAP: {
    pending: 'running',
    running: 'running',
    completed: 'completed',
    failed: 'error',
    cancelled: 'cancelled'
  }
};