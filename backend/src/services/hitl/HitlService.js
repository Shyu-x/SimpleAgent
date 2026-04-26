/**
 * HITL人机协作服务
 * 业务逻辑层 - 从routes/hitl.js迁移
 */

const { CheckpointStatus, CheckpointType } = require('../../hitl');

/**
 * 创建检查点
 * @param {Object} params - 检查点参数
 * @param {string} params.title - 检查点标题
 * @param {string} [params.type] - 检查点类型
 * @param {string} [params.description] - 检查点描述
 * @param {Object} [params.context] - 上下文数据
 * @param {Array} [params.options] - 可选项列表
 * @param {number} [params.timeout] - 超时时间
 * @param {boolean} [params.required] - 是否必须确认
 * @returns {Object} { success, checkpoint }
 */
function createCheckpoint({ type, title, description, context, options, timeout, required }) {
  if (!title) {
    return { success: false, error: 'Missing title' };
  }

  const hitlManager = require('../../hitl').hitlManager;
  const checkpoint = hitlManager.createCheckpoint({
    type: type || CheckpointType.DECISION,
    title,
    description,
    context,
    options: options || [],
    timeout,
    required
  });

  return {
    success: true,
    checkpoint: checkpoint.getSummary()
  };
}

/**
 * 获取待处理检查点列表
 * @returns {Object} { success, checkpoints, count }
 */
function getPendingCheckpoints() {
  const hitlManager = require('../../hitl').hitlManager;
  const pending = hitlManager.getPendingCheckpoints();
  return {
    success: true,
    checkpoints: pending,
    count: pending.length
  };
}

/**
 * 获取检查点详情
 * @param {string} id - 检查点ID
 * @returns {Object} { success, checkpoint }
 */
function getCheckpoint(id) {
  const hitlManager = require('../../hitl').hitlManager;
  let checkpoint = hitlManager.getCheckpoint(id);
  if (!checkpoint) {
    checkpoint = hitlManager.findInHistory(id);
  }

  if (!checkpoint) {
    return { success: false, error: 'Checkpoint not found' };
  }

  return {
    success: true,
    checkpoint: checkpoint.getSummary ? checkpoint.getSummary() : checkpoint
  };
}

/**
 * 批准检查点
 * @param {string} id - 检查点ID
 * @param {string|number} option - 选择的选项
 * @param {string} [userId] - 用户ID
 * @param {string} [comment] - 注释
 * @returns {Object} { success, checkpoint }
 */
function approveCheckpoint(id, option, userId = 'user', comment = '') {
  const hitlManager = require('../../hitl').hitlManager;
  return hitlManager.approveCheckpoint(id, option, userId, comment);
}

/**
 * 拒绝检查点
 * @param {string} id - 检查点ID
 * @param {string} [reason] - 拒绝原因
 * @param {string} [userId] - 用户ID
 * @returns {Object} { success, checkpoint }
 */
function rejectCheckpoint(id, reason = '', userId = 'user') {
  const hitlManager = require('../../hitl').hitlManager;
  return hitlManager.rejectCheckpoint(id, reason, userId);
}

/**
 * 等待检查点响应
 * @param {string} id - 检查点ID
 * @param {number} [timeout] - 超时时间
 * @returns {Promise<Object>} { success, checkpoint }
 */
async function waitForCheckpoint(id, timeout) {
  const hitlManager = require('../../hitl').hitlManager;
  return hitlManager.waitForCheckpoint(id, timeout);
}

/**
 * 请求确认（创建并等待）
 * @param {Object} params - 检查点参数
 * @returns {Promise<Object>} { success, checkpoint }
 */
async function requestConfirmation({ type, title, description, context, options, timeout, required }) {
  if (!title) {
    return { success: false, error: 'Missing title' };
  }

  const hitlManager = require('../../hitl').hitlManager;
  return hitlManager.requestConfirmation({
    type: type || CheckpointType.DECISION,
    title,
    description,
    context,
    options: options || [],
    timeout,
    required
  });
}

/**
 * 请求确认（带HTTP超时保护）
 * @param {Object} params - 检查点参数
 * @param {number} [httpTimeout=30000] - HTTP超时时间
 * @returns {Promise<Object>} { success, checkpoint }
 */
async function requestConfirmationWithTimeout({ type, title, description, context, options, timeout, required }, httpTimeout = 30000) {
  if (!title) {
    return { success: false, error: 'Missing title' };
  }

  const hitlManager = require('../../hitl').hitlManager;

  return Promise.race([
    hitlManager.requestConfirmation({
      type: type || CheckpointType.DECISION,
      title,
      description,
      context,
      options: options || [],
      timeout,
      required
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('HTTP request timeout (30s)')), httpTimeout)
    )
  ]);
}

/**
 * 获取历史记录
 * @param {number} [limit=50] - 限制条数
 * @returns {Object} { success, history, count }
 */
function getHistory(limit = 50) {
  const hitlManager = require('../../hitl').hitlManager;
  const history = hitlManager.getHistory(limit);
  return {
    success: true,
    history,
    count: history.length
  };
}

/**
 * 获取统计信息
 * @returns {Object} { success, stats }
 */
function getStats() {
  const hitlManager = require('../../hitl').hitlManager;
  const stats = hitlManager.getStats();
  return {
    success: true,
    stats
  };
}

/**
 * 清除所有待处理检查点
 * @returns {Object} { success, message }
 */
function clearPending() {
  const hitlManager = require('../../hitl').hitlManager;
  hitlManager.clearPending();
  return {
    success: true,
    message: 'All pending checkpoints cleared'
  };
}

/**
 * 获取检查点类型列表
 * @returns {Object} { success, types, statuses }
 */
function getTypes() {
  return {
    success: true,
    types: Object.values(CheckpointType),
    statuses: Object.values(CheckpointStatus)
  };
}

/**
 * 健康检查
 * @returns {Object} { status, service, pending, timestamp }
 */
function healthCheck() {
  const hitlManager = require('../../hitl').hitlManager;
  const stats = hitlManager.getStats();
  return {
    status: 'ok',
    service: 'human-in-the-loop',
    pending: stats.pending,
    timestamp: new Date().toISOString()
  };
}

/**
 * SSE事件处理器创建
 * @param {Object} emitter - 事件发射器 (hitlManager)
 * @returns {Object} 事件处理器集合
 */
function createSSEHandlers(emitter) {
  return {
    handleCreated: (checkpoint) => {
      return {
        type: 'confirmation',
        subtype: 'created',
        checkpoint: checkpoint.getSummary()
      };
    },
    handleApproved: (checkpoint) => {
      return {
        type: 'confirmation',
        subtype: 'approved',
        checkpoint: checkpoint.getSummary()
      };
    },
    handleRejected: (checkpoint) => {
      return {
        type: 'confirmation',
        subtype: 'rejected',
        checkpoint: checkpoint.getSummary()
      };
    },
    handleTimeout: (checkpoint) => {
      return {
        type: 'confirmation',
        subtype: 'timeout',
        checkpoint: checkpoint.getSummary()
      };
    },
    createConnectedEvent: (clientId) => ({
      type: 'connected',
      clientId
    }),
    createPendingCheckpointsEvent: (pending) => ({
      type: 'pending_checkpoints',
      checkpoints: pending
    })
  };
}

module.exports = {
  createCheckpoint,
  getPendingCheckpoints,
  getCheckpoint,
  approveCheckpoint,
  rejectCheckpoint,
  waitForCheckpoint,
  requestConfirmation,
  requestConfirmationWithTimeout,
  getHistory,
  getStats,
  clearPending,
  getTypes,
  healthCheck,
  createSSEHandlers
};