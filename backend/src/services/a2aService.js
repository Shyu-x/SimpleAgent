/**
 * A2A (Agent-to-Agent) 协议服务
 * 实现Agent之间的消息传递、任务委托、结果回传机制
 * 参考 casibase/casibase 的 A2A 实现思路
 */

const EventEmitter = require('events');

// A2A 消息类型
const A2A_MESSAGE_TYPES = {
  // 任务委托
  TASK_DELEGATE: 'task.delegate',
  // 结果回传
  RESULT_RETURN: 'result.return',
  // 状态同步
  STATUS_SYNC: 'status.sync',
  // 心跳检测
  HEARTBEAT: 'heartbeat',
  // 错误通知
  ERROR_NOTIFY: 'error.notify',
  // 进度更新
  PROGRESS_UPDATE: 'progress.update'
};

// A2A 任务状态
const A2A_TASK_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

class A2AMessage {
  constructor(options = {}) {
    this.id = options.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = options.type;
    this.from = options.from; // 发送方 Agent ID
    this.to = options.to; // 接收方 Agent ID
    this.taskId = options.taskId; // 关联的任务ID
    this.sessionId = options.sessionId; // 发送方会话ID
    this.payload = options.payload || {}; // 消息内容
    this.status = options.status || A2A_TASK_STATUS.PENDING;
    this.timestamp = options.timestamp || Date.now();
    this.expiresAt = options.expiresAt || (Date.now() + 30 * 60 * 1000); // 默认30分钟过期
    this.replyTo = options.replyTo || null; // 回复的消息ID
    this.metadata = options.metadata || {};
  }

  toJSON() {
    return {
      jsonrpc: '2.0',
      id: this.id,
      type: this.type,
      from: this.from,
      to: this.to,
      taskId: this.taskId,
      sessionId: this.sessionId,
      payload: this.payload,
      status: this.status,
      timestamp: this.timestamp,
      expiresAt: this.expiresAt,
      replyTo: this.replyTo,
      metadata: this.metadata
    };
  }

  static fromJSON(json) {
    const msg = new A2AMessage();
    Object.assign(msg, json);
    return msg;
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }

  isReply() {
    return this.replyTo !== null;
  }
}

class A2ATask {
  constructor(options = {}) {
    this.id = options.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = options.type || A2A_MESSAGE_TYPES.TASK_DELEGATE;
    this.title = options.title || '';
    this.description = options.description || '';
    this.from = options.from; // 委托方
    this.to = options.to; // 执行方
    this.input = options.input || {};
    this.output = null;
    this.status = A2A_TASK_STATUS.PENDING;
    this.progress = 0;
    this.result = null;
    this.error = null;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
    this.subTasks = options.subTasks || []; // 子任务
    this.parentTaskId = options.parentTaskId || null;
    this.metadata = options.metadata || {};
    this.tags = options.tags || [];
    this.priority = options.priority || 0; // 优先级，数字越大优先级越高
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      title: this.title,
      description: this.description,
      from: this.from,
      to: this.to,
      input: this.input,
      output: this.output,
      status: this.status,
      progress: this.progress,
      result: this.result,
      error: this.error,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      subTasks: this.subTasks,
      parentTaskId: this.parentTaskId,
      metadata: this.metadata,
      tags: this.tags,
      priority: this.priority
    };
  }
}

class A2AAgentRegistry extends EventEmitter {
  constructor() {
    super();
    // Agent 注册表: agentId -> { id, name, type, status, endpoint, metadata, lastSeen }
    this.agents = new Map();
    // 在线心跳: agentId -> timestamp
    this.heartbeats = new Map();
    // 心跳超时阈值 (毫秒)
    this.heartbeatTimeout = 60 * 1000; // 60秒无心跳视为离线
    // 定时清理离线Agent
    this._cleanupInterval = setInterval(() => this._cleanupOfflineAgents(), 30 * 1000);
  }

  /**
   * 注册 Agent
   */
  register(agentInfo) {
    const agent = {
      id: agentInfo.id,
      name: agentInfo.name || agentInfo.id,
      type: agentInfo.type || 'general',
      status: 'online',
      endpoint: agentInfo.endpoint,
      metadata: agentInfo.metadata || {},
      registeredAt: Date.now(),
      lastSeen: Date.now(),
      capabilities: agentInfo.capabilities || []
    };

    this.agents.set(agentInfo.id, agent);
    this.heartbeats.set(agentInfo.id, Date.now());
    this.emit('agent:registered', agent);
    console.log(`[A2A] Agent registered: ${agent.id} (${agent.name})`);

    return agent;
  }

  /**
   * 注销 Agent
   */
  unregister(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      this.heartbeats.delete(agentId);
      this.emit('agent:unregistered', { agentId, agent });
      console.log(`[A2A] Agent unregistered: ${agentId}`);
    }
  }

  /**
   * 更新 Agent 状态
   */
  updateStatus(agentId, status, metadata = {}) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      agent.metadata = { ...agent.metadata, ...metadata };
      agent.lastSeen = Date.now();
      this.emit('agent:statusChanged', { agentId, status, metadata });
    }
  }

  /**
   * 心跳
   */
  heartbeat(agentId) {
    this.heartbeats.set(agentId, Date.now());
    const agent = this.agents.get(agentId);
    if (agent && agent.status === 'offline') {
      this.updateStatus(agentId, 'online');
    }
  }

  /**
   * 获取所有在线 Agent
   */
  listOnlineAgents() {
    const now = Date.now();
    return Array.from(this.agents.values()).filter(agent => {
      const lastSeen = this.heartbeats.get(agent.id) || agent.lastSeen;
      return now - lastSeen < this.heartbeatTimeout;
    });
  }

  /**
   * 获取 Agent 信息
   */
  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * 按类型查找 Agent
   */
  findAgentsByType(type) {
    return this.listOnlineAgents().filter(agent => agent.type === type);
  }

  /**
   * 按能力查找 Agent
   */
  findAgentsByCapability(capability) {
    return this.listOnlineAgents().filter(agent =>
      agent.capabilities && agent.capabilities.includes(capability)
    );
  }

  /**
   * 清理离线 Agent
   */
  _cleanupOfflineAgents() {
    const now = Date.now();
    for (const [agentId, lastSeen] of this.heartbeats.entries()) {
      if (now - lastSeen > this.heartbeatTimeout) {
        this.updateStatus(agentId, 'offline');
      }
    }
  }

  /**
   * 销毁
   */
  destroy() {
    clearInterval(this._cleanupInterval);
    this.removeAllListeners();
  }
}

class A2AMessageBroker extends EventEmitter {
  constructor() {
    super();
    // 消息队列: recipientId -> A2AMessage[]
    this.inbox = new Map();
    // 已处理消息ID集合（用于去重）
    this.processedMessages = new Set();
    // 消息保留时间 (毫秒)
    this.messageRetention = 60 * 60 * 1000; // 1小时
    // 定时清理过期消息
    this._cleanupInterval = setInterval(() => this._cleanupExpiredMessages(), 10 * 60 * 1000);
  }

  /**
   * 发送消息
   */
  send(message) {
    if (!(message instanceof A2AMessage)) {
      message = new A2AMessage(message);
    }

    // 去重检查
    if (this.processedMessages.has(message.id)) {
      console.log(`[A2A] Duplicate message ignored: ${message.id}`);
      return { success: false, error: 'Duplicate message' };
    }

    // 初始化收件箱
    if (!this.inbox.has(message.to)) {
      this.inbox.set(message.to, []);
    }

    this.inbox.get(message.to).push(message);
    this.processedMessages.add(message.id);

    console.log(`[A2A] Message sent: ${message.id} from ${message.from} to ${message.to} (${message.type})`);

    this.emit('message:sent', message);
    this.emit(`message:${message.to}`, message);

    return { success: true, messageId: message.id };
  }

  /**
   * 接收消息（拉取）
   */
  receive(recipientId, options = {}) {
    const { limit = 50, includeExpired = false, clearReceived = false } = options;

    const messages = this.inbox.get(recipientId) || [];

    const available = includeExpired
      ? messages
      : messages.filter(msg => !msg.isExpired());

    // 按时间排序
    available.sort((a, b) => a.timestamp - b.timestamp);

    const result = available.slice(-limit);

    if (clearReceived) {
      // 清除已返回的消息
      const receivedIds = new Set(result.map(m => m.id));
      this.inbox.set(recipientId, messages.filter(m => !receivedIds.has(m.id)));
    }

    return result;
  }

  /**
   * 获取未读消息数量
   */
  getUnreadCount(recipientId) {
    const messages = this.inbox.get(recipientId) || [];
    return messages.filter(msg => !msg.isExpired()).length;
  }

  /**
   * 获取特定消息
   */
  getMessage(messageId) {
    for (const messages of this.inbox.values()) {
      const found = messages.find(m => m.id === messageId);
      if (found) return found;
    }
    return null;
  }

  /**
   * 清理过期消息
   */
  _cleanupExpiredMessages() {
    const now = Date.now();
    for (const [recipientId, messages] of this.inbox.entries()) {
      const valid = messages.filter(msg =>
        !msg.isExpired() && (now - msg.timestamp < this.messageRetention)
      );
      if (valid.length === 0) {
        this.inbox.delete(recipientId);
      } else {
        this.inbox.set(recipientId, valid);
      }
    }

    // 定期清理已处理消息记录
    if (this.processedMessages.size > 10000) {
      const toKeep = new Set();
      for (const messages of this.inbox.values()) {
        for (const msg of messages) {
          toKeep.add(msg.id);
        }
      }
      this.processedMessages = toKeep;
    }
  }

  destroy() {
    clearInterval(this._cleanupInterval);
    this.removeAllListeners();
  }
}

// 全局单例
const agentRegistry = new A2AAgentRegistry();
const messageBroker = new A2AMessageBroker();

class A2AService extends EventEmitter {
  constructor() {
    super();
    this.registry = agentRegistry;
    this.broker = messageBroker;
    this._pendingTasks = new Map(); // taskId -> A2ATask
    this._taskCallbacks = new Map(); // taskId -> [callbacks]
    this._initEventHandlers();
  }

  _initEventHandlers() {
    // 监听消息发送事件
    this.broker.on('message:sent', (message) => {
      // 如果是结果回传，触发任务完成回调
      if (message.type === A2A_MESSAGE_TYPES.RESULT_RETURN && message.taskId) {
        this._resolveTaskCallback(message.taskId, message);
      }
      // 如果是错误通知
      if (message.type === A2A_MESSAGE_TYPES.ERROR_NOTIFY && message.taskId) {
        this._resolveTaskCallback(message.taskId, message);
      }
    });
  }

  /**
   * 注册 Agent
   */
  registerAgent(agentInfo) {
    return this.registry.register(agentInfo);
  }

  /**
   * 注销 Agent
   */
  unregisterAgent(agentId) {
    this.registry.unregister(agentId);
  }

  /**
   * Agent 心跳
   */
  agentHeartbeat(agentId) {
    this.registry.heartbeat(agentId);
  }

  /**
   * 委托任务给其他 Agent
   * @param {Object} taskOptions - 任务配置
   * @returns {Object} { task, message }
   */
  delegateTask(taskOptions) {
    const {
      from,
      to,
      title,
      description,
      input,
      priority = 0,
      tags = [],
      metadata = {},
      timeout = 5 * 60 * 1000 // 默认5分钟超时
    } = taskOptions;

    // 创建任务
    const task = new A2ATask({
      title,
      description,
      from,
      to,
      input,
      priority,
      tags,
      metadata,
      type: A2A_MESSAGE_TYPES.TASK_DELEGATE
    });

    // 创建消息
    const message = new A2AMessage({
      type: A2A_MESSAGE_TYPES.TASK_DELEGATE,
      from,
      to,
      taskId: task.id,
      payload: {
        task: task.toJSON(),
        input
      }
    });

    // 设置任务超时
    task.expiresAt = Date.now() + timeout;

    // 存储任务
    this._pendingTasks.set(task.id, task);

    // 发送消息
    const sendResult = this.broker.send(message);

    if (!sendResult.success) {
      task.status = A2A_TASK_STATUS.FAILED;
      task.error = sendResult.error;
    } else {
      task.status = A2A_TASK_STATUS.PENDING;
    }

    console.log(`[A2A] Task delegated: ${task.id} from ${from} to ${to}`);

    this.emit('task:delegated', task);

    return { task: task.toJSON(), message: message.toJSON(), success: sendResult.success };
  }

  /**
   * 返回结果给委托方
   */
  returnResult(taskId, result, status = A2A_TASK_STATUS.COMPLETED, metadata = {}) {
    const task = this._pendingTasks.get(taskId);
    if (!task) {
      console.warn(`[A2A] Task not found for result return: ${taskId}`);
      return { success: false, error: 'Task not found' };
    }

    const message = new A2AMessage({
      type: A2A_MESSAGE_TYPES.RESULT_RETURN,
      from: task.to, // 执行方
      to: task.from, // 返还给委托方
      taskId: task.id,
      payload: {
        result,
        status,
        metadata
      },
      status,
      replyTo: task.id
    });

    task.result = result;
    task.status = status;
    task.output = result;
    task.completedAt = Date.now();

    if (status === A2A_TASK_STATUS.FAILED) {
      task.error = result.error || result;
    }

    const sendResult = this.broker.send(message);

    if (sendResult.success) {
      this._pendingTasks.delete(taskId);
    }

    console.log(`[A2A] Result returned for task: ${taskId}, status: ${status}`);

    this.emit('task:completed', task);

    return { success: sendResult.success, message: message.toJSON() };
  }

  /**
   * 发送进度更新
   */
  sendProgress(taskId, progress, metadata = {}) {
    const task = this._pendingTasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };

    const message = new A2AMessage({
      type: A2A_MESSAGE_TYPES.PROGRESS_UPDATE,
      from: task.to,
      to: task.from,
      taskId: task.id,
      payload: {
        progress,
        metadata
      }
    });

    task.progress = progress;
    this.broker.send(message);

    this.emit('task:progress', { taskId, progress, metadata });

    return { success: true, messageId: message.id };
  }

  /**
   * 同步状态
   */
  syncStatus(agentId, status, metadata = {}) {
    const message = new A2AMessage({
      type: A2A_MESSAGE_TYPES.STATUS_SYNC,
      from: agentId,
      to: '*', // 广播
      payload: {
        status,
        metadata
      }
    });

    // 发送给所有已注册的消息（简单广播）
    const onlineAgents = this.registry.listOnlineAgents();
    const results = [];

    for (const agent of onlineAgents) {
      if (agent.id !== agentId) {
        const broadcastMsg = new A2AMessage({
          ...message,
          to: agent.id
        });
        results.push(this.broker.send(broadcastMsg));
      }
    }

    return { success: true, broadcastCount: results.length };
  }

  /**
   * 接收消息
   */
  receiveMessages(agentId, options = {}) {
    return this.broker.receive(agentId, options);
  }

  /**
   * 获取未读消息数
   */
  getUnreadCount(agentId) {
    return this.broker.getUnreadCount(agentId);
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId) {
    const task = this._pendingTasks.get(taskId);
    return task ? task.toJSON() : null;
  }

  /**
   * 列出所有任务
   */
  listTasks(options = {}) {
    const { status, from, to, limit = 100 } = options;

    let tasks = Array.from(this._pendingTasks.values()).map(t => t.toJSON());

    if (status) {
      tasks = tasks.filter(t => t.status === status);
    }
    if (from) {
      tasks = tasks.filter(t => t.from === from);
    }
    if (to) {
      tasks = tasks.filter(t => t.to === to);
    }

    // 按优先级和时间排序
    tasks.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.createdAt - b.createdAt;
    });

    return tasks.slice(0, limit);
  }

  /**
   * 取消任务
   */
  cancelTask(taskId) {
    const task = this._pendingTasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };

    const message = new A2AMessage({
      type: A2A_MESSAGE_TYPES.ERROR_NOTIFY,
      from: task.from,
      to: task.to,
      taskId: task.id,
      payload: {
        error: 'Task cancelled by sender',
        status: A2A_TASK_STATUS.CANCELLED
      },
      status: A2A_TASK_STATUS.CANCELLED
    });

    task.status = A2A_TASK_STATUS.CANCELLED;
    task.completedAt = Date.now();
    this.broker.send(message);
    this._pendingTasks.delete(taskId);

    this.emit('task:cancelled', task);

    return { success: true };
  }

  /**
   * 注册任务回调
   */
  onTaskResult(taskId, callback) {
    if (!this._taskCallbacks.has(taskId)) {
      this._taskCallbacks.set(taskId, []);
    }
    this._taskCallbacks.get(taskId).push(callback);
  }

  /**
   * 触发任务回调
   */
  _resolveTaskCallback(taskId, message) {
    const callbacks = this._taskCallbacks.get(taskId);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(message);
        } catch (err) {
          console.error(`[A2A] Task callback error: ${err.message}`);
        }
      });
      this._taskCallbacks.delete(taskId);
    }
  }

  /**
   * 获取在线 Agent 列表
   */
  listAgents() {
    return this.registry.listOnlineAgents();
  }

  /**
   * 获取 Agent 信息
   */
  getAgent(agentId) {
    return this.registry.getAgent(agentId);
  }

  /**
   * 创建统一 API 响应
   * 格式: {success, data, error: {code, message} | null, timestamp}
   */
  createResponse(messageId, success, data, errorCode = null, errorMessage = null) {
    return {
      success,
      data,
      error: errorCode ? { code: errorCode, message: errorMessage } : null,
      timestamp: Date.now()
    };
  }

  /**
   * 获取服务统计
   */
  getStats() {
    return {
      onlineAgents: this.registry.listOnlineAgents().length,
      totalAgents: this.registry.agents.size,
      pendingTasks: this._pendingTasks.size,
      messageInboxSize: Array.from(this.broker.inbox.values()).reduce((sum, msgs) => sum + msgs.length, 0),
      processedMessages: this.broker.processedMessages.size
    };
  }

  /**
   * 销毁服务
   */
  destroy() {
    this.registry.destroy();
    this.broker.destroy();
    this._pendingTasks.clear();
    this._taskCallbacks.clear();
    this.removeAllListeners();
  }
}

module.exports = {
  A2AService,
  A2AMessage,
  A2ATask,
  A2AAgentRegistry,
  A2AMessageBroker,
  A2A_MESSAGE_TYPES,
  A2A_TASK_STATUS
};
