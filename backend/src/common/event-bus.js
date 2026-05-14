/**
 * 事件总线 (Event Bus)
 * ====================
 *
 * 模块间解耦通信机制
 *
 * 设计原理：
 * - 发布/订阅模式 (Publish-Subscribe)
 * - 模块之间不直接调用，通过事件通信
 * - 支持同步和异步事件处理
 * - 事件可追溯、可重放
 *
 * 使用场景：
 * 1. 订单创建后通知支付模块
 * 2. 用户注册后触发欢迎邮件
 * 3. 库存变化后更新缓存
 *
 * @module common/event-bus
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
const { createLogger } = require('../infra/logger/AgentLogger');
const logger = createLogger('EventBus');

/**
 * 基础事件接口
 * @typedef {Object} BaseEvent
 * @property {string} eventId - 事件唯一标识
 * @property {string} type - 事件类型
 * @property {number} timestamp - 事件发生时间
 * @property {string} source - 触发事件的模块
 * @property {Object} payload - 事件负载数据
 */

/**
 * 事件订阅信息
 * @typedef {Object} Subscription
 * @property {string} id - 订阅ID
 * @property {string} eventType - 事件类型
 * @property {Function} handler - 处理函数
 * @property {boolean} once - 是否仅处理一次
 * @property {number} priority - 优先级
 * @property {number} createdAt - 创建时间
 */

class EventBusService {
  constructor() {
    /** @type {Map<string, Subscription[]>} */
    this.subscriptions = new Map();
    /** @type {BaseEvent[]} */
    this.eventHistory = [];
    this.maxHistorySize = 1000;
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);

    logger.info('事件总线服务初始化完成');
  }

  /**
   * 生成事件ID
   * @private
   */
  _generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成订阅ID
   * @private
   */
  _generateSubscriptionId() {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 添加事件到历史
   * @private
   * @param {BaseEvent} event - 事件对象
   */
  _addToHistory(event) {
    this.eventHistory.push(event);

    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * 发布事件
   * @param {BaseEvent} event - 事件对象
   * @returns {Promise<void>}
   */
  async publish(event) {
    event.eventId = event.eventId || this._generateEventId();
    event.timestamp = event.timestamp || Date.now();

    logger.debug(`发布事件: ${event.type} (来源: ${event.source})`);

    this._addToHistory(event);
    this.emitter.emit(event.type, event);
  }

  /**
   * 订阅事件
   * @param {string} eventType - 事件类型
   * @param {Function} handler - 处理函数
   * @param {Object} [options] - 订阅选项
   * @param {boolean} [options.once=false] - 是否仅处理一次
   * @param {number} [options.priority=0] - 优先级
   * @returns {Function} 取消订阅函数
   */
  subscribe(eventType, handler, options = {}) {
    const { once = false, priority = 0 } = options;

    const subscription = {
      id: this._generateSubscriptionId(),
      eventType,
      handler,
      once,
      priority,
      createdAt: Date.now(),
    };

    const subs = this.subscriptions.get(eventType) || [];
    subs.push(subscription);
    subs.sort((a, b) => b.priority - a.priority);
    this.subscriptions.set(eventType, subs);

    // 注册到 EventEmitter
    if (once) {
      this.emitter.once(eventType, handler);
    } else {
      this.emitter.on(eventType, handler);
    }

    logger.debug(`订阅事件: ${eventType} (优先级: ${priority})`);

    return () => this.unsubscribe(subscription.id, eventType);
  }

  /**
   * 订阅一次性事件
   * @param {string} eventType - 事件类型
   * @param {Function} handler - 处理函数
   */
  subscribeOnce(eventType, handler) {
    this.subscribe(eventType, handler, { once: true });
  }

  /**
   * 取消订阅
   * @param {string} subscriptionId - 订阅ID
   * @param {string} eventType - 事件类型
   */
  unsubscribe(subscriptionId, eventType) {
    const subs = this.subscriptions.get(eventType);
    if (subs) {
      const index = subs.findIndex((s) => s.id === subscriptionId);
      if (index !== -1) {
        const sub = subs[index];
        this.emitter.off(eventType, sub.handler);
        subs.splice(index, 1);
        logger.debug(`取消订阅: ${eventType} (${subscriptionId})`);
      }
    }
  }

  /**
   * 清除所有订阅
   * @param {string} [eventType] - 事件类型（不传则清除所有）
   */
  clearSubscriptions(eventType) {
    if (eventType) {
      const subs = this.subscriptions.get(eventType);
      if (subs) {
        subs.forEach((sub) => {
          this.emitter.off(eventType, sub.handler);
        });
      }
      this.subscriptions.delete(eventType);
      logger.debug(`清除事件订阅: ${eventType}`);
    } else {
      this.subscriptions.forEach((subs, type) => {
        subs.forEach((sub) => {
          this.emitter.off(type, sub.handler);
        });
      });
      this.subscriptions.clear();
      logger.debug('清除所有事件订阅');
    }
  }

  /**
   * 获取事件历史
   * @param {string} [eventType] - 事件类型
   * @param {number} [limit=100] - 返回数量限制
   * @returns {BaseEvent[]}
   */
  getEventHistory(eventType, limit = 100) {
    let history = this.eventHistory;

    if (eventType) {
      history = history.filter((e) => e.type === eventType);
    }

    return history.slice(-limit);
  }

  /**
   * 重放历史事件
   * @param {BaseEvent[]} events - 事件列表
   */
  async replayEvents(events) {
    logger.info(`重放 ${events.length} 个历史事件`);
    for (const event of events) {
      await this.publish(event);
    }
  }

  /**
   * 获取订阅统计
   * @returns {{ eventType: string, count: number }[]}
   */
  getSubscriptionStats() {
    return Array.from(this.subscriptions.entries()).map(([type, subs]) => ({
      eventType: type,
      count: subs.length,
    }));
  }

  /**
   * 清除事件历史
   */
  clearHistory() {
    this.eventHistory = [];
    logger.debug('事件历史已清除');
  }

  /**
   * 获取总线统计
   * @returns {Object}
   */
  getStats() {
    return {
      totalSubscriptions: Array.from(this.subscriptions.values()).reduce(
        (sum, subs) => sum + subs.length,
        0,
      ),
      eventTypes: this.subscriptions.size,
      historySize: this.eventHistory.length,
      maxHistorySize: this.maxHistorySize,
    };
  }
}

// ========== 常用事件类型定义 ==========

/**
 * 用户相关事件
 */
const UserEvents = {
  REGISTERED: 'user.registered',
  LOGIN: 'user.login',
  LOGOUT: 'user.logout',
  PROFILE_UPDATED: 'user.profile.updated',
};

/**
 * 订单相关事件
 */
const OrderEvents = {
  CREATED: 'order.created',
  PAID: 'order.paid',
  CANCELLED: 'order.cancelled',
  COMPLETED: 'order.completed',
};

/**
 * 支付相关事件
 */
const PaymentEvents = {
  INITIATED: 'payment.initiated',
  SUCCESS: 'payment.success',
  FAILED: 'payment.failed',
  REFUNDED: 'payment.refunded',
};

/**
 * 库存相关事件
 */
const InventoryEvents = {
  RESERVED: 'inventory.reserved',
  RELEASED: 'inventory.released',
  CHANGED: 'inventory.changed',
};

// 单例导出
const eventBus = new EventBusService();

module.exports = eventBus;
module.exports.EventBusService = EventBusService;
module.exports.UserEvents = UserEvents;
module.exports.OrderEvents = OrderEvents;
module.exports.PaymentEvents = PaymentEvents;
module.exports.InventoryEvents = InventoryEvents;