/**
 * HITL Schema 定义
 * 用于请求参数验证
 * 注意: 实际验证由服务层执行
 */

/**
 * 检查点类型枚举
 */
const CheckpointType = ['DECISION', 'APPROVAL', 'REJECTION', 'CONFIRMATION'];

/**
 * 检查点状态枚举
 */
const CheckpointStatus = ['PENDING', 'APPROVED', 'REJECTED', 'TIMEOUT', 'CANCELLED'];

/**
 * 创建检查点 Schema
 */
const createCheckpointSchema = {
  type: { type: 'string', required: false },
  title: { type: 'string', required: true, min: 1, max: 200 },
  description: { type: 'string', required: false, max: 1000 },
  context: { type: 'object', required: false },
  options: { type: 'array', required: false },
  timeout: { type: 'number', required: false, min: 1000, max: 3600000 },
  required: { type: 'boolean', required: false }
};

/**
 * 获取检查点详情 Schema
 */
const getCheckpointSchema = {
  id: { type: 'string', required: true }
};

/**
 * 批准检查点 Schema
 */
const approveCheckpointSchema = {
  option: { type: 'string', required: true },
  comment: { type: 'string', required: false, max: 500 },
  userId: { type: 'string', required: false, max: 100 }
};

/**
 * 拒绝检查点 Schema
 */
const rejectCheckpointSchema = {
  reason: { type: 'string', required: false, max: 500 },
  userId: { type: 'string', required: false, max: 100 }
};

/**
 * 等待检查点 Schema
 */
const waitCheckpointSchema = {
  timeout: { type: 'number', required: false, min: 1000, max: 3600000 }
};

/**
 * 历史记录 Schema
 */
const historySchema = {
  limit: { type: 'number', required: false, min: 1, max: 200 }
};

module.exports = {
  CheckpointType,
  CheckpointStatus,
  createCheckpointSchema,
  getCheckpointSchema,
  approveCheckpointSchema,
  rejectCheckpointSchema,
  waitCheckpointSchema,
  historySchema
};
