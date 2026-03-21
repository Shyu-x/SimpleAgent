/**
 * 人机协作检查点模块
 * 参考 CrewAI 的人机协作触发器
 * 实现关键决策点的暂停和人工确认功能
 */

// 检查点状态
const CheckpointStatus = {
  PENDING: 'pending',       // 等待确认
  APPROVED: 'approved',     // 已批准
  REJECTED: 'rejected',     // 已拒绝
  TIMEOUT: 'timeout',       // 超时
  CANCELLED: 'cancelled'    // 已取消
};

// 检查点类型
const CheckpointType = {
  DECISION: 'decision',     // 决策点
  ACTION: 'action',         // 操作确认
  DATA_ACCESS: 'data_access', // 数据访问
  HIGH_RISK: 'high_risk',   // 高风险操作
  COST_LIMIT: 'cost_limit'  // 成本限制
};

/**
 * 检查点定义
 */
class Checkpoint {
  constructor(config) {
    this.id = config.id || `cp_${Date.now()}`;
    this.type = config.type || CheckpointType.DECISION;
    this.title = config.title;
    this.description = config.description;
    this.context = config.context || {};      // 上下文信息
    this.options = config.options || [];      // 可选项
    this.defaultOption = config.defaultOption; // 默认选项
    this.timeout = config.timeout || 300000;   // 超时时间（默认5分钟）
    this.required = config.required !== false; // 是否必须确认
    this.createdAt = Date.now();
    this.status = CheckpointStatus.PENDING;
    this.response = null;     // 用户响应
    this.respondedAt = null;  // 响应时间
    this.respondedBy = null;  // 响应者
  }

  /**
   * 批准检查点
   */
  approve(option, comment = '', userId = 'system') {
    this.status = CheckpointStatus.APPROVED;
    this.response = { option, comment };
    this.respondedAt = Date.now();
    this.respondedBy = userId;
    return this;
  }

  /**
   * 拒绝检查点
   */
  reject(reason = '', userId = 'system') {
    this.status = CheckpointStatus.REJECTED;
    this.response = { reason };
    this.respondedAt = Date.now();
    this.respondedBy = userId;
    return this;
  }

  /**
   * 检查是否超时
   */
  checkTimeout() {
    if (this.status !== CheckpointStatus.PENDING) return false;
    if (Date.now() - this.createdAt > this.timeout) {
      this.status = CheckpointStatus.TIMEOUT;
      return true;
    }
    return false;
  }

  /**
   * 获取摘要
   */
  getSummary() {
    return {
      id: this.id,
      type: this.type,
      title: this.title,
      description: this.description,
      status: this.status,
      createdAt: this.createdAt,
      respondedAt: this.respondedAt,
      response: this.response
    };
  }
}

/**
 * 人机协作管理器
 */
class HumanInTheLoopManager {
  constructor() {
    this.checkpoints = new Map();      // 活跃检查点
    this.history = [];                  // 历史记录
    this.handlers = new Map();          // 事件处理器
    this.config = {
      defaultTimeout: 300000,           // 默认超时5分钟
      autoApprove: false,               // 自动批准
      autoApproveDelay: 60000,          // 自动批准延迟
      maxHistorySize: 1000              // 最大历史记录数
    };
  }

  /**
   * 创建检查点
   */
  createCheckpoint(config) {
    const checkpoint = new Checkpoint({
      ...config,
      timeout: config.timeout || this.config.defaultTimeout
    });

    this.checkpoints.set(checkpoint.id, checkpoint);

    // 触发事件
    this.emit('checkpoint:created', checkpoint);

    // 如果配置了自动批准
    if (this.config.autoApprove && !config.required) {
      setTimeout(() => {
        if (checkpoint.status === CheckpointStatus.PENDING) {
          this.approveCheckpoint(checkpoint.id, checkpoint.defaultOption, 'auto-approved');
        }
      }, this.config.autoApproveDelay);
    }

    return checkpoint;
  }

  /**
   * 批准检查点
   */
  approveCheckpoint(checkpointId, option, userId = 'system', comment = '') {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return { success: false, error: 'Checkpoint not found' };
    }

    if (checkpoint.status !== CheckpointStatus.PENDING) {
      return { success: false, error: `Checkpoint already ${checkpoint.status}` };
    }

    checkpoint.approve(option, comment, userId);

    // 移动到历史
    this.addToHistory(checkpoint);
    this.checkpoints.delete(checkpointId);

    // 触发事件
    this.emit('checkpoint:approved', checkpoint);

    return { success: true, checkpoint: checkpoint.getSummary() };
  }

  /**
   * 拒绝检查点
   */
  rejectCheckpoint(checkpointId, reason, userId = 'system') {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return { success: false, error: 'Checkpoint not found' };
    }

    if (checkpoint.status !== CheckpointStatus.PENDING) {
      return { success: false, error: `Checkpoint already ${checkpoint.status}` };
    }

    checkpoint.reject(reason, userId);

    // 移动到历史
    this.addToHistory(checkpoint);
    this.checkpoints.delete(checkpointId);

    // 触发事件
    this.emit('checkpoint:rejected', checkpoint);

    return { success: true, checkpoint: checkpoint.getSummary() };
  }

  /**
   * 获取检查点
   */
  getCheckpoint(checkpointId) {
    return this.checkpoints.get(checkpointId);
  }

  /**
   * 获取所有待处理检查点
   */
  getPendingCheckpoints() {
    const pending = [];
    this.checkpoints.forEach(cp => {
      if (cp.status === CheckpointStatus.PENDING) {
        pending.push(cp.getSummary());
      }
    });
    return pending;
  }

  /**
   * 等待检查点响应
   */
  async waitForCheckpoint(checkpointId, timeout) {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return { success: false, error: 'Checkpoint not found' };
    }

    const actualTimeout = timeout || checkpoint.timeout;

    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkInterval = 500; // 每500ms检查一次

      const check = () => {
        const cp = this.checkpoints.get(checkpointId);

        // 检查点已处理
        if (!cp || cp.status !== CheckpointStatus.PENDING) {
          resolve({
            success: cp?.status === CheckpointStatus.APPROVED,
            checkpoint: cp?.getSummary() || this.findInHistory(checkpointId)
          });
          return;
        }

        // 检查超时
        if (Date.now() - startTime > actualTimeout) {
          cp.status = CheckpointStatus.TIMEOUT;
          this.addToHistory(cp);
          this.checkpoints.delete(checkpointId);
          this.emit('checkpoint:timeout', cp);
          resolve({ success: false, error: 'Timeout', checkpoint: cp.getSummary() });
          return;
        }

        setTimeout(check, checkInterval);
      };

      check();
    });
  }

  /**
   * 创建并等待检查点
   */
  async requestConfirmation(config) {
    const checkpoint = this.createCheckpoint(config);
    const result = await this.waitForCheckpoint(checkpoint.id, config.timeout);
    return result;
  }

  /**
   * 添加到历史记录
   */
  addToHistory(checkpoint) {
    this.history.push(checkpoint.getSummary());
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * 从历史中查找
   */
  findInHistory(checkpointId) {
    return this.history.find(h => h.id === checkpointId);
  }

  /**
   * 获取历史记录
   */
  getHistory(limit = 50) {
    return this.history.slice(-limit);
  }

  /**
   * 注册事件处理器
   */
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[HITL] Event handler error:`, error);
        }
      });
    }
  }

  /**
   * 移除事件处理器
   */
  off(event, handler) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const stats = {
      total: this.history.length,
      pending: this.checkpoints.size,
      approved: 0,
      rejected: 0,
      timeout: 0
    };

    this.history.forEach(h => {
      if (h.status === CheckpointStatus.APPROVED) stats.approved++;
      if (h.status === CheckpointStatus.REJECTED) stats.rejected++;
      if (h.status === CheckpointStatus.TIMEOUT) stats.timeout++;
    });

    return stats;
  }

  /**
   * 清除所有待处理检查点
   */
  clearPending() {
    this.checkpoints.forEach((cp, id) => {
      cp.status = CheckpointStatus.CANCELLED;
      this.addToHistory(cp);
    });
    this.checkpoints.clear();
  }
}

// 导出单例
const hitlManager = new HumanInTheLoopManager();

module.exports = {
  hitlManager,
  HumanInTheLoopManager,
  Checkpoint,
  CheckpointStatus,
  CheckpointType
};