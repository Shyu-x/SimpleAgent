const express = require('express');
const router = express.Router();
const { DistributedTaskQueue, TaskStatus, TaskPriority } = require('../services/taskQueue');

const taskQueue = new DistributedTaskQueue({
  maxWorkers: 5,
  maxRetries: 3,
  retryDelay: 5000,
  defaultTimeout: 300000
});

function normalizePriority(p) {
  if (p == null) return TaskPriority.NORMAL;
  if (typeof p === 'number') return p;
  if (typeof p === 'string') {
    const n = Number(p);
    if (!isNaN(n) && Number.isInteger(n)) return n;
    const l = p.toLowerCase();
    if (l === 'low' || l === 'lowest') return TaskPriority.LOW;
    if (l === 'high' || l === 'highest') return TaskPriority.HIGH;
    if (l === 'normal' || l === 'medium') return TaskPriority.NORMAL;
  }
  return TaskPriority.NORMAL;
}

// 提交任务
router.post('/', async (req, res) => {
  try {
    const { type, payload, priority, timeout, metadata, waitResult } = req.body;
    if (!type || !payload) return res.status(400).json({ error: { message: 'type and payload are required', type: 'validation_error' } });

    const taskId = await taskQueue.enqueue({ type, payload, priority: normalizePriority(priority), timeout, metadata });

    if (waitResult) {
      const result = await taskQueue.submitAndWait({ id: taskId, type, payload, priority, timeout, metadata }, timeout || 60000);
      return res.json({ taskId, result, status: TaskStatus.COMPLETED });
    }
    res.json({ success: true, taskId, status: TaskStatus.PENDING });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
});

// 获取队列统计
router.get('/stats', async (req, res) => {
  try {
    res.json({ success: true, stats: await taskQueue.getStats() });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
});

// 获取任务状态
router.get('/:taskId', async (req, res) => {
  try {
    const task = await taskQueue.getTaskStatus(req.params.taskId);
    if (!task) return res.status(404).json({ error: { message: 'Task not found', type: 'not_found' } });
    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
});

// 取消任务
router.delete('/:taskId', async (req, res) => {
  try {
    await taskQueue.cancel(req.params.taskId);
    res.json({ success: true, message: 'Task cancelled' });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
});

// 注册任务处理器
router.post('/handlers/:taskType', (req, res) => {
  try {
    taskQueue.onTask(req.params.taskType, async (payload) => ({ processed: true, payload }));
    res.json({ success: true, message: `Handler registered for ${req.params.taskType}` });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
});

// 清理过期任务
router.post('/cleanup', async (req, res) => {
  try {
    await taskQueue.cleanup(req.body.completedAfter);
    res.json({ success: true, message: 'Cleanup completed' });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
});

module.exports = router;