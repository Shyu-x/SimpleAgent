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
 */

import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * 基础事件接口
 */
export interface BaseEvent {
  /** 事件唯一标识 */
  eventId: string;
  /** 事件类型 */
  type: string;
  /** 事件发生时间 */
  timestamp: number;
  /** 触发事件的模块 */
  source: string;
  /** 事件负载数据 */
  payload: Record<string, unknown>;
}

/**
 * 事件订阅选项
 */
export interface EventSubscriptionOptions {
  /** 事件类型 */
  eventType: string;
  /** 处理函数 */
  handler: (event: BaseEvent) => void | Promise<void>;
  /** 是否仅处理一次 */
  once?: boolean;
  /** 优先级（数值越大越先执行） */
  priority?: number;
}

/**
 * 已订阅信息
 */
interface Subscription {
  id: string;
  eventType: string;
  handler: (event: BaseEvent) => void | Promise<void>;
  once: boolean;
  priority: number;
  createdAt: number;
}

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private subscriptions = new Map<string, Subscription[]>();
  private eventHistory: BaseEvent[] = [];
  private readonly maxHistorySize = 1000; // 最多保留1000条历史

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.logger.log('事件总线服务初始化完成');
  }

  /**
   * 发布事件
   * @param event 事件对象
   */
  async publish<T extends BaseEvent>(event: T): Promise<void> {
    // 添加元数据
    event.eventId = event.eventId || this.generateEventId();
    event.timestamp = event.timestamp || Date.now();

    this.logger.log(`发布事件: ${event.type} (来源: ${event.source})`);

    // 记录历史
    this.addToHistory(event);

    // 使用 NestJS EventEmitter 发布
    this.eventEmitter.emit(event.type, event);
  }

  /**
   * 订阅事件
   * @param options 订阅配置
   * @returns 取消订阅函数
   */
  subscribe(options: EventSubscriptionOptions): () => void {
    const { eventType, handler, once = false, priority = 0 } = options;

    const subscription: Subscription = {
      id: this.generateSubscriptionId(),
      eventType,
      handler,
      once,
      priority,
      createdAt: Date.now(),
    };

    // 按优先级排序（高优先级在前）
    const subs = this.subscriptions.get(eventType) || [];
    subs.push(subscription);
    subs.sort((a, b) => b.priority - a.priority);
    this.subscriptions.set(eventType, subs);

    this.logger.log(`订阅事件: ${eventType} (优先级: ${priority})`);

    // 返回取消订阅函数
    return () => this.unsubscribe(subscription.id, eventType);
  }

  /**
   * 订阅一次性事件
   * @param eventType 事件类型
   * @param handler 处理函数
   */
  subscribeOnce(eventType: string, handler: (event: BaseEvent) => void | Promise<void>): void {
    this.subscribe({ eventType, handler, once: true });
  }

  /**
   * 取消订阅
   * @param subscriptionId 订阅ID
   * @param eventType 事件类型
   */
  unsubscribe(subscriptionId: string, eventType: string): void {
    const subs = this.subscriptions.get(eventType);
    if (subs) {
      const index = subs.findIndex((s) => s.id === subscriptionId);
      if (index !== -1) {
        subs.splice(index, 1);
        this.logger.log(`取消订阅: ${eventType} (${subscriptionId})`);
      }
    }
  }

  /**
   * 清除所有订阅
   * @param eventType 事件类型（不传则清除所有）
   */
  clearSubscriptions(eventType?: string): void {
    if (eventType) {
      this.subscriptions.delete(eventType);
      this.logger.log(`清除事件订阅: ${eventType}`);
    } else {
      this.subscriptions.clear();
      this.logger.log('清除所有事件订阅');
    }
  }

  /**
   * 获取事件历史
   * @param eventType 事件类型（可选）
   * @param limit 返回数量限制
   */
  getEventHistory(eventType?: string, limit = 100): BaseEvent[] {
    let history = this.eventHistory;

    if (eventType) {
      history = history.filter((e) => e.type === eventType);
    }

    return history.slice(-limit);
  }

  /**
   * 重放历史事件
   * @param events 事件列表
   */
  async replayEvents(events: BaseEvent[]): Promise<void> {
    this.logger.log(`重放 ${events.length} 个历史事件`);
    for (const event of events) {
      await this.publish(event);
    }
  }

  /**
   * 获取订阅统计
   */
  getSubscriptionStats(): { eventType: string; count: number }[] {
    return Array.from(this.subscriptions.entries()).map(([type, subs]) => ({
      eventType: type,
      count: subs.length,
    }));
  }

  /**
   * 生成事件ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成订阅ID
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 添加事件到历史
   */
  private addToHistory(event: BaseEvent): void {
    this.eventHistory.push(event);

    // 超过最大容量时移除最旧的事件
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }
}

// ========== 常用事件类型定义 ==========

/**
 * 用户相关事件
 */
export class UserEvents {
  static REGISTERED = 'user.registered';
  static LOGIN = 'user.login';
  static LOGOUT = 'user.logout';
  static PROFILE_UPDATED = 'user.profile.updated';
}

/**
 * 订单相关事件
 */
export class OrderEvents {
  static CREATED = 'order.created';
  static PAID = 'order.paid';
  static CANCELLED = 'order.cancelled';
  static COMPLETED = 'order.completed';
}

/**
 * 支付相关事件
 */
export class PaymentEvents {
  static INITIATED = 'payment.initiated';
  static SUCCESS = 'payment.success';
  static FAILED = 'payment.failed';
  static REFUNDED = 'payment.refunded';
}

/**
 * 库存相关事件
 */
export class InventoryEvents {
  static RESERVED = 'inventory.reserved';
  static RELEASED = 'inventory.released';
  static CHANGED = 'inventory.changed';
}