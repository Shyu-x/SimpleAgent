/**
 * 执行历史 API
 * 提供 Agent 执行记录查询
 *
 * @date 2026-05-14
 */

const express = require('express');
const router = express.Router();
const { missionService } = require('../services/missionService');
const { getMetricsCollector } = require('../infra/metrics');

// 获取执行历史
router.get('/', (req, res) => {
  try {
    const { limit = 50, status, agentId, dateRange } = req.query;

    // 从 MissionService 获取任务作为执行历史
    const result = missionService.listTasks({
      page: 1,
      limit: parseInt(limit) || 50,
      status,
      agentId
    });

    // 转换任务为执行记录格式
    const executions = result.tasks.map(task => ({
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
      metadata: {
        model: 'MiniMax-M2.7',
        priority: task.priority
      }
    }));

    // 日期过滤
    let filtered = executions;
    if (dateRange) {
      const now = Date.now();
      const ranges = {
        today: 86400000,
        week: 604800000,
        month: 2592000000
      };
      const cutoff = ranges[dateRange] || 0;
      if (cutoff) {
        filtered = executions.filter(e => now - e.startedAt < cutoff);
      }
    }

    // 统计
    const stats = {
      total: filtered.length,
      completed: filtered.filter(e => e.status === 'completed').length,
      failed: filtered.filter(e => e.status === 'error').length,
      running: filtered.filter(e => e.status === 'running').length,
      totalTokens: filtered.reduce((sum, e) => sum + (e.metadata?.tokensUsed || 0), 0),
      totalCost: filtered.reduce((sum, e) => sum + (e.metadata?.cost || 0), 0)
    };

    res.json({
      success: true,
      data: {
        executions: filtered,
        stats,
        pagination: result.pagination
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个执行记录
router.get('/:id', (req, res) => {
  try {
    const id = req.params.id.replace('exec_', '');
    const task = missionService.getTask(id);

    if (!task) {
      return res.status(404).json({ success: false, error: '执行记录不存在' });
    }

    const execution = {
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
        priority: task.priority
      }
    };

    res.json({ success: true, data: execution });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取统计数据
router.get('/stats/summary', (req, res) => {
  try {
    const collector = getMetricsCollector();
    const missionStats = missionService.getStats();

    const result = missionService.listTasks({ page: 1, limit: 1000 });
    const executions = result.tasks;

    const stats = {
      total: executions.length,
      completed: executions.filter(e => e.status === 'completed').length,
      failed: executions.filter(e => e.status === 'failed').length,
      running: executions.filter(e => e.status === 'running' || e.status === 'pending').length,
      totalTokens: 0,
      totalCost: 0
    };

    // 尝试从 metrics collector 获取更多信息
    if (collector) {
      const summary = collector.getSummaryMetrics();
      stats.totalTokens = summary.model?.totalTokens || 0;
    }

    res.json({
      success: true,
      data: {
        ...stats,
        missionStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 辅助函数：映射任务状态到执行状态
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

module.exports = router;