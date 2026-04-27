const express = require('express');
const router = express.Router();
const { DistributedTaskQueue, TaskStatus, TaskPriority } = require('../services/taskQueue');
const AgentLogger = require('../infra/logger/AgentLogger');

const logger = new AgentLogger('taskQueue');

// 创建任务队列实例
const taskQueue = new DistributedTaskQueue({
  maxWorkers: 5,
  maxRetries: 3,
  retryDelay: 5000,
  defaultTimeout: 300000
});

/**
 * 辅助函数：将字符串优先级转换为枚举值
 */
function normalizePriority(priority) {
  if (priority === undefined || priority === null) {
    return TaskPriority.NORMAL;
  }
  if (typeof priority === 'number') {
    return priority;
  }
  if (typeof priority === 'string') {
    // 尝试解析为数字（支持 "0"、"2" 等字符串）
    const num = Number(priority);
    if (!isNaN(num) && Number.isInteger(num)) {
      return num;
    }
    const lower = priority.toLowerCase();
    if (lower === 'low' || lower === 'lowest') {
      return TaskPriority.LOW;
    }
    if (lower === 'high' || lower === 'highest') {
      return TaskPriority.HIGH;
    }
    if (lower === 'normal' || lower === 'medium') {
      return TaskPriority.NORMAL;
    }
  }
  return TaskPriority.NORMAL;
}

/**
 * 提交任务
 */
router.post('/', async (req, res) => {
  try {
    const { type, payload, priority, timeout, metadata, waitResult } = req.body;

    if (!type || !payload) {
      return res.status(400).json({
        error: { message: 'type and payload are required', type: 'validation_error' }
      });
    }

    const taskId = await taskQueue.enqueue({
      type,
      payload,
      priority: normalizePriority(priority),
      timeout,
      metadata
    });

    // 如果需要等待结果
    if (waitResult) {
      try {
        const result = await taskQueue.submitAndWait(
          { id: taskId, type, payload, priority, timeout, metadata },
          timeout || 60000
        );
        return res.json({ taskId, result, status: TaskStatus.COMPLETED });
      } catch (error) {
        return res.status(500).json({
          error: { message: error.message, type: 'task_error', taskId }
        });
      }
    }

    res.json({
      success: true,
      taskId,
      status: TaskStatus.PENDING
    });
  } catch (error) {
    logger.error('Submit task error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 获取队列统计
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await taskQueue.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Get stats error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 获取任务状态
 */
router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await taskQueue.getTaskStatus(taskId);

    if (!task) {
      return res.status(404).json({
        error: { message: 'Task not found', type: 'not_found' }
      });
    }

    res.json({
      success: true,
      task
    });
  } catch (error) {
    logger.error('Get task error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 取消任务
 */
router.delete('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    await taskQueue.cancel(taskId);

    res.json({
      success: true,
      message: 'Task cancelled'
    });
  } catch (error) {
    logger.error('Cancel task error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 注册任务处理器
 */
router.post('/handlers/:taskType', async (req, res) => {
  try {
    const { taskType } = req.params;
    const { handlerCode } = req.body;

    // 在实际实现中，这里应该是一个安全的沙箱执行
    // 这里简化为直接返回成功
    taskQueue.onTask(taskType, async (payload) => {
      // 这里可以执行handlerCode中的逻辑
      return { processed: true, payload };
    });

    res.json({
      success: true,
      message: `Handler registered for ${taskType}`
    });
  } catch (error) {
    logger.error('Register handler error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 清理过期任务
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { completedAfter } = req.body; // 毫秒
    await taskQueue.cleanup(completedAfter);

    res.json({
      success: true,
      message: 'Cleanup completed'
    });
  } catch (error) {
    logger.error('Cleanup error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

module.exports = router;