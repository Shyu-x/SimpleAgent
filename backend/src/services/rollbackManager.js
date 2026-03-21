/**
 * 任务回滚管理器
 * 支持操作回滚、补偿事务、状态恢复
 */

const EventEmitter = require('events');

/**
 * 回滚操作类型
 */
const RollbackType = {
  UNDO: 'undo',           // 撤销操作
  COMPENSATE: 'compensate', // 补偿事务
  RESTORE: 'restore',     // 状态恢复
  CLEANUP: 'cleanup'      // 清理操作
};

/**
 * 回滚操作记录
 */
class RollbackRecord {
  constructor(operation, rollbackFn, context = {}) {
    this.id = `rb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.operation = operation;  // 原操作描述
    this.rollbackFn = rollbackFn; // 回滚函数
    this.context = context;       // 上下文数据
    this.createdAt = Date.now();
    this.executed = false;
    this.result = null;
    this.error = null;
  }
}

/**
 * 回滚管理器
 */
class RollbackManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxHistory = options.maxHistory || 100;
    this.rollbackStack = [];  // 回滚栈
    this.executedRollbacks = []; // 已执行的回滚
    this.enabled = options.enabled !== false;
  }

  /**
   * 注册可回滚操作
   */
  register(operation, rollbackFn, context = {}) {
    if (!this.enabled) return null;

    const record = new RollbackRecord(operation, rollbackFn, context);
    this.rollbackStack.push(record);

    // 限制栈大小
    if (this.rollbackStack.length > this.maxHistory) {
      this.rollbackStack.shift();
    }

    this.emit('registered', { record, stackSize: this.rollbackStack.length });
    return record;
  }

  /**
   * 执行单步回滚
   */
  async rollbackOne() {
    if (this.rollbackStack.length === 0) {
      return { success: false, error: 'No operations to rollback' };
    }

    const record = this.rollbackStack.pop();

    try {
      this.emit('rollback_start', { record });

      const result = await record.rollbackFn(record.context);
      record.executed = true;
      record.result = result;

      this.executedRollbacks.push(record);

      this.emit('rollback_complete', { record, result });
      return { success: true, record, result };

    } catch (error) {
      record.error = error.message;
      this.emit('rollback_error', { record, error });

      // 回滚失败，将记录放回栈顶
      this.rollbackStack.push(record);

      return { success: false, error: error.message, record };
    }
  }

  /**
   * 执行多步回滚
   */
  async rollback(steps = 1) {
    const results = [];

    for (let i = 0; i < steps && this.rollbackStack.length > 0; i++) {
      const result = await this.rollbackOne();
      results.push(result);

      if (!result.success) {
        break;
      }
    }

    return {
      success: results.every(r => r.success),
      stepsExecuted: results.filter(r => r.success).length,
      results
    };
  }

  /**
   * 回滚到指定点
   */
  async rollbackTo(recordId) {
    const index = this.rollbackStack.findIndex(r => r.id === recordId);

    if (index === -1) {
      return { success: false, error: 'Record not found' };
    }

    // 回滚到该点（不包括该点）
    const stepsToRollback = this.rollbackStack.length - index - 1;
    return await this.rollback(stepsToRollback);
  }

  /**
   * 回滚所有操作
   */
  async rollbackAll() {
    const totalSteps = this.rollbackStack.length;
    const results = [];

    while (this.rollbackStack.length > 0) {
      const result = await this.rollbackOne();
      results.push(result);

      if (!result.success) {
        break;
      }
    }

    return {
      success: results.every(r => r.success),
      totalSteps,
      stepsExecuted: results.filter(r => r.success).length,
      results
    };
  }

  /**
   * 创建快照
   */
  createSnapshot() {
    return {
      timestamp: Date.now(),
      stackSize: this.rollbackStack.length,
      records: this.rollbackStack.map(r => ({
        id: r.id,
        operation: r.operation,
        createdAt: r.createdAt
      }))
    };
  }

  /**
   * 恢复到快照
   */
  async restoreToSnapshot(snapshot) {
    // 回滚到快照时间点之后的所有操作
    const targetSize = snapshot.stackSize;
    const stepsToRollback = this.rollbackStack.length - targetSize;

    if (stepsToRollback <= 0) {
      return { success: true, message: 'Already at or before snapshot' };
    }

    return await this.rollback(stepsToRollback);
  }

  /**
   * 获取回滚栈状态
   */
  getStackStatus() {
    return {
      stackSize: this.rollbackStack.length,
      executedCount: this.executedRollbacks.length,
      topOperation: this.rollbackStack.length > 0
        ? this.rollbackStack[this.rollbackStack.length - 1].operation
        : null,
      records: this.rollbackStack.map(r => ({
        id: r.id,
        operation: r.operation,
        createdAt: r.createdAt
      }))
    };
  }

  /**
   * 清除回滚栈
   */
  clearStack() {
    const count = this.rollbackStack.length;
    this.rollbackStack = [];
    this.emit('stack_cleared', { count });
    return count;
  }

  /**
   * 清除已执行的回滚记录
   */
  clearHistory() {
    const count = this.executedRollbacks.length;
    this.executedRollbacks = [];
    return count;
  }

  /**
   * 禁用/启用回滚
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

/**
 * 事务管理器
 * 支持事务的开始、提交、回滚
 */
class TransactionManager extends EventEmitter {
  constructor(rollbackManager) {
    super();
    this.rollbackManager = rollbackManager;
    this.activeTransaction = null;
    this.transactions = [];
  }

  /**
   * 开始事务
   */
  begin(name = null) {
    const transaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name,
      startTime: Date.now(),
      snapshot: this.rollbackManager.createSnapshot(),
      status: 'active',
      operations: []
    };

    this.activeTransaction = transaction;
    this.emit('transaction_start', { transaction });

    return transaction;
  }

  /**
   * 记录事务操作
   */
  recordOperation(operation, rollbackFn, context = {}) {
    if (!this.activeTransaction) {
      return this.rollbackManager.register(operation, rollbackFn, context);
    }

    const record = this.rollbackManager.register(operation, rollbackFn, {
      ...context,
      transactionId: this.activeTransaction.id
    });

    this.activeTransaction.operations.push(record.id);
    return record;
  }

  /**
   * 提交事务
   */
  commit() {
    if (!this.activeTransaction) {
      return { success: false, error: 'No active transaction' };
    }

    const transaction = this.activeTransaction;
    transaction.endTime = Date.now();
    transaction.status = 'committed';
    transaction.duration = transaction.endTime - transaction.startTime;

    // 清除事务操作的回滚记录（已提交，不需要回滚）
    transaction.operations.forEach(opId => {
      const index = this.rollbackManager.rollbackStack.findIndex(r => r.id === opId);
      if (index !== -1) {
        this.rollbackManager.rollbackStack.splice(index, 1);
      }
    });

    this.transactions.push(transaction);
    this.emit('transaction_commit', { transaction });

    this.activeTransaction = null;
    return { success: true, transaction };
  }

  /**
   * 回滚事务
   */
  async rollback() {
    if (!this.activeTransaction) {
      return { success: false, error: 'No active transaction' };
    }

    const transaction = this.activeTransaction;
    transaction.status = 'rolling_back';

    // 回滚到事务开始时的快照
    const result = await this.rollbackManager.restoreToSnapshot(transaction.snapshot);

    transaction.endTime = Date.now();
    transaction.status = result.success ? 'rolled_back' : 'rollback_failed';
    transaction.duration = transaction.endTime - transaction.startTime;

    this.transactions.push(transaction);
    this.emit('transaction_rollback', { transaction, result });

    this.activeTransaction = null;
    return { success: result.success, transaction, rollbackResult: result };
  }

  /**
   * 获取活动事务
   */
  getActiveTransaction() {
    return this.activeTransaction;
  }

  /**
   * 获取事务历史
   */
  getTransactionHistory() {
    return this.transactions.map(tx => ({
      id: tx.id,
      name: tx.name,
      status: tx.status,
      operations: tx.operations.length,
      duration: tx.duration
    }));
  }
}

/**
 * 创建可回滚操作包装器
 */
function createRollbackableOperation(operation, rollbackOperation) {
  return {
    execute: async (context) => {
      const result = await operation(context);
      return result;
    },
    rollback: async (context) => {
      return await rollbackOperation(context);
    }
  };
}

module.exports = {
  RollbackManager,
  RollbackRecord,
  RollbackType,
  TransactionManager,
  createRollbackableOperation
};