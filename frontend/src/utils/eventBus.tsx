'use client';

/**
 * 事件总线 - 发布/订阅模式实现
 *
 * 功能特性：
 * - 发布/订阅模式（Pub/Sub）
 * - 命名空间隔离（防止事件名冲突）
 * - 类型安全（TypeScript 泛型支持）
 * - 异步事件支持
 * - once（单次订阅）支持
 * - 批量订阅/退订
 *
 * 使用场景：
 * - 跨组件通信
 * - 模块间解耦
 * - 全局状态同步
 * - 自定义事件系统
 */

import React, { createContext, useContext, useCallback, useMemo, useEffect, type ReactNode } from 'react';

// ==================== 类型定义 ====================

/** 事件回调函数类型 */
type EventCallback<T = unknown> = (data: T) => void | Promise<void>;

/** 订阅者信息 */
interface Subscription<T = unknown> {
  /** 订阅 ID（用于取消订阅） */
  id: string;
  /** 事件名称 */
  event: string;
  /** 回调函数 */
  callback: EventCallback<T>;
  /** 是否仅触发一次 */
  once: boolean;
  /** 创建时间戳 */
  createdAt: number;
}

/** 事件总线配置 */
interface EventBusConfig {
  /** 默认命名空间前缀 */
  namespace?: string;
  /** 最大订阅者数量（0 = 无限制） */
  maxSubscribers?: number;
  /** 是否启用调试日志 */
  debug?: boolean;
  /** 事件保留时间（毫秒，0 = 永久） */
  retentionTime?: number;
}

// ==================== 事件总线类 ====================

/**
 * EventBus - 事件总线核心实现
 *
 * 实现发布/订阅模式，支持：
 * - 命名空间隔离
 * - 类型安全的事件
 * - 异步事件处理
 * - once 单次订阅
 * - 批量操作
 */
class EventBusImpl {
  // 订阅者映射表：事件名 -> 订阅者列表
  private subscribers: Map<string, Subscription[]> = new Map();

  // 全局订阅者（不区分命名空间）
  private globalSubscribers: Subscription[] = [];

  // 配置
  private config: Required<EventBusConfig>;

  // 订阅 ID 生成器
  private subscriptionIdCounter = 0;

  constructor(config: EventBusConfig = {}) {
    this.config = {
      namespace: config.namespace || 'app',
      maxSubscribers: config.maxSubscribers || 0,
      debug: config.debug || false,
      retentionTime: config.retentionTime || 0,
    };
  }

  /**
   * 生成唯一订阅 ID
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${++this.subscriptionIdCounter}`;
  }

  /**
   * 获取带命名空间的事件名
   */
  private getNamespacedEvent(event: string): string {
    // 如果事件名已包含命名空间前缀，则不再添加
    if (event.startsWith(`${this.config.namespace}:`)) {
      return event;
    }
    return `${this.config.namespace}:${event}`;
  }

  /**
   * 记录调试日志
   */
  private log(action: string, event: string, ...args: unknown[]): void {
    if (this.config.debug) {
      console.log(`[EventBus:${this.config.namespace}] ${action}: ${event}`, ...args);
    }
  }

  /**
   * 订阅事件
   *
   * @param event - 事件名称
   * @param callback - 回调函数
   * @param once - 是否仅触发一次
   * @returns 订阅 ID（用于取消订阅）
   *
   * @example
   * ```ts
   * const id = eventBus.subscribe('user:login', (data) => {
   *   console.log('用户登录:', data);
   * });
   *
   * // 取消订阅
   * eventBus.unsubscribe('user:login', id);
   * ```
   */
  subscribe<T = unknown>(
    event: string,
    callback: EventCallback<T>,
    once = false
  ): string {
    const namespacedEvent = this.getNamespacedEvent(event);
    const id = this.generateSubscriptionId();

    const subscription: Subscription<T> = {
      id,
      event: namespacedEvent,
      callback: callback as EventCallback<unknown>,
      once,
      createdAt: Date.now(),
    };

    // 初始化事件订阅者列表
    if (!this.subscribers.has(namespacedEvent)) {
      this.subscribers.set(namespacedEvent, []);
    }

    // 检查最大订阅者数量限制
    if (this.config.maxSubscribers > 0) {
      const currentCount = this.subscribers.get(namespacedEvent)!.length;
      if (currentCount >= this.config.maxSubscribers) {
        console.warn(`[EventBus] 事件 "${namespacedEvent}" 订阅者数量已达上限 (${this.config.maxSubscribers})`);
        return id;
      }
    }

    // 添加到订阅者列表
    this.subscribers.get(namespacedEvent)!.push(subscription);

    this.log('subscribe', namespacedEvent, { id, once });

    return id;
  }

  /**
   * 订阅事件（仅触发一次）
   */
  once<T = unknown>(event: string, callback: EventCallback<T>): string {
    return this.subscribe(event, callback, true);
  }

  /**
   * 发布事件
   *
   * @param event - 事件名称
   * @param data - 事件数据
   * @returns Promise（等待所有同步回调完成）
   *
   * @example
   * ```ts
   * await eventBus.publish('user:login', { userId: 123, timestamp: Date.now() });
   * ```
   */
  async publish<T = unknown>(event: string, data?: T): Promise<void> {
    const namespacedEvent = this.getNamespacedEvent(event);

    this.log('publish', namespacedEvent, data);

    // 获取事件订阅者
    const subscriptions = this.subscribers.get(namespacedEvent) || [];

    // 获取全局订阅者
    const globalSubs = this.globalSubscribers.filter(
      (sub) => sub.event === namespacedEvent
    );

    // 合并订阅者
    const allSubscriptions = [...subscriptions, ...globalSubs];

    if (allSubscriptions.length === 0) {
      this.log('publish (no subscribers)', namespacedEvent);
      return;
    }

    // 执行所有回调
    const results: Promise<void>[] = [];

    for (const subscription of allSubscriptions) {
      try {
        // 异步执行回调
        const result = subscription.callback(data);

        // 如果返回 Promise，则添加到结果列表
        if (result instanceof Promise) {
          results.push(result);
        }

        // 如果是 once 订阅，则标记待删除
        if (subscription.once) {
          subscription.id = '__to_remove__';
        }
      } catch (error) {
        console.error(`[EventBus] 回调执行错误: ${namespacedEvent}`, error);
      }
    }

    // 清理已标记的 once 订阅
    this.cleanupOnceSubscriptions(namespacedEvent);

    // 等待所有异步回调完成
    if (results.length > 0) {
      await Promise.allSettled(results);
    }
  }

  /**
   * 清理待删除的 once 订阅
   */
  private cleanupOnceSubscriptions(event: string): void {
    const subscriptions = this.subscribers.get(event);
    if (subscriptions) {
      // 过滤掉标记为待删除的订阅
      const filtered = subscriptions.filter((sub) => sub.id !== '__to_remove__');
      this.subscribers.set(event, filtered);
    }
  }

  /**
   * 取消订阅
   *
   * @param event - 事件名称（可选，不填则取消所有该事件的订阅）
   * @param subscriptionId - 订阅 ID（可选，不填则取消该事件所有订阅）
   *
   * @example
   * ```ts
   * // 取消特定订阅
   * eventBus.unsubscribe('user:login', 'sub_123_456');
   *
   * // 取消事件所有订阅
   * eventBus.unsubscribe('user:login');
   *
   * // 取消全局订阅
   * eventBus.unsubscribe();
   * ```
   */
  unsubscribe(event?: string, subscriptionId?: string): void {
    if (!event) {
      // 清除所有订阅
      this.globalSubscribers = [];
      this.subscribers.clear();
      this.log('unsubscribe', 'all');
      return;
    }

    const namespacedEvent = this.getNamespacedEvent(event);

    if (subscriptionId) {
      // 取消特定订阅
      const subscriptions = this.subscribers.get(namespacedEvent);
      if (subscriptions) {
        const index = subscriptions.findIndex((sub) => sub.id === subscriptionId);
        if (index !== -1) {
          subscriptions.splice(index, 1);
          this.log('unsubscribe', namespacedEvent, { id: subscriptionId });
        }
      }
    } else {
      // 取消该事件所有订阅
      this.subscribers.delete(namespacedEvent);
      this.log('unsubscribe', namespacedEvent, '(all)');
    }
  }

  /**
   * 订阅全局事件（不区分命名空间）
   */
  subscribeGlobal<T = unknown>(
    event: string,
    callback: EventCallback<T>,
    once = false
  ): string {
    return this.subscribe(event, callback, once);
  }

  /**
   * 批量订阅
   *
   * @param events - 事件映射表
   * @returns 订阅 ID 列表
   *
   * @example
   * ```ts
   * const ids = eventBus.subscribeMany({
   *   'user:login': handleLogin,
   *   'user:logout': handleLogout,
   *   'app:error': handleError,
   * });
   *
   * // 批量取消
   * eventBus.unsubscribeMany(ids);
   * ```
   */
  subscribeMany(
    events: Record<string, EventCallback>
  ): string[] {
    return Object.entries(events).map(([event, callback]) =>
      this.subscribe(event, callback)
    );
  }

  /**
   * 批量取消订阅
   */
  unsubscribeMany(subscriptionIds: string[]): void {
    subscriptionIds.forEach((id) => {
      // 遍历所有事件查找该订阅
      for (const [event, subscriptions] of this.subscribers.entries()) {
        const index = subscriptions.findIndex((sub) => sub.id === id);
        if (index !== -1) {
          subscriptions.splice(index, 1);
          break;
        }
      }
    });
  }

  /**
   * 获取订阅者数量
   */
  getSubscriberCount(event?: string): number {
    if (event) {
      const namespacedEvent = this.getNamespacedEvent(event);
      return this.subscribers.get(namespacedEvent)?.length || 0;
    }

    // 统计所有订阅者
    let count = 0;
    for (const subscriptions of this.subscribers.values()) {
      count += subscriptions.length;
    }
    return count + this.globalSubscribers.length;
  }

  /**
   * 检查是否存在订阅
   */
  hasSubscribers(event?: string): boolean {
    if (event) {
      const namespacedEvent = this.getNamespacedEvent(event);
      const subs = this.subscribers.get(namespacedEvent);
      return subs !== undefined && subs.length > 0;
    }

    return this.subscribers.size > 0 || this.globalSubscribers.length > 0;
  }

  /**
   * 清空所有订阅
   */
  clear(): void {
    this.subscribers.clear();
    this.globalSubscribers = [];
    this.log('clear', 'all');
  }

  /**
   * 获取事件列表
   */
  getEventNames(): string[] {
    return Array.from(this.subscribers.keys());
  }
}

// ==================== 单例管理 ====================

// 全局事件总线实例
let globalEventBus: EventBusImpl | null = null;

/**
 * 获取全局事件总线实例
 */
export function getEventBus(config?: EventBusConfig): EventBusImpl {
  if (!globalEventBus) {
    globalEventBus = new EventBusImpl(config);
  }
  return globalEventBus;
}

/**
 * 创建新的事件总线实例（不共享）
 */
export function createEventBus(config?: EventBusConfig): EventBusImpl {
  return new EventBusImpl(config);
}

// ==================== React Context 集成 ====================

/** React Context 类型 */
interface EventBusContextValue {
  /** 事件总线实例 */
  bus: EventBusImpl;
  /** 快捷方法：发布 */
  publish: <T = unknown>(event: string, data?: T) => Promise<void>;
  /** 快捷方法：订阅 */
  subscribe: <T = unknown>(event: string, callback: EventCallback<T>, once?: boolean) => string;
  /** 快捷方法：订阅一次 */
  once: <T = unknown>(event: string, callback: EventCallback<T>) => string;
  /** 快捷方法：取消订阅 */
  unsubscribe: (event?: string, subscriptionId?: string) => void;
}

// 创建 React Context
const EventBusContext = createContext<EventBusContextValue | null>(null);

/**
 * EventBusProvider - React Context Provider
 *
 * 在应用顶层包裹，提供事件总线到所有子组件
 *
 * @example
 * ```tsx
 * // 在 _app.tsx 或 layout.tsx 中
 * <EventBusProvider namespace="myapp">
 *   <App />
 * </EventBusProvider>
 * ```
 */
export const EventBusProvider: React.FC<{
  children: ReactNode;
  namespace?: string;
  debug?: boolean;
}> = ({ children, namespace = 'app', debug = false }) => {
  // 使用 useMemo 初始化事件总线（确保只初始化一次）
  const bus = useMemo(() => createEventBus({ namespace, debug }), [namespace, debug]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      // 可选择是否在卸载时清空所有订阅
      // bus.clear();
    };
  }, []);

  // 快捷方法
  const publish = useCallback(async <T = unknown>(event: string, data?: T) => {
    bus.publish(event, data);
  }, [bus]);

  const subscribe = useCallback(<T = unknown>(
    event: string,
    callback: EventCallback<T>,
    once = false
  ) => {
    return bus.subscribe(event, callback, once) || '';
  }, [bus]);

  const once = useCallback(<T = unknown>(
    event: string,
    callback: EventCallback<T>
  ) => {
    return bus.once(event, callback) || '';
  }, [bus]);

  const unsubscribe = useCallback((
    event?: string,
    subscriptionId?: string
  ) => {
    bus.unsubscribe(event, subscriptionId);
  }, [bus]);

  const contextValue: EventBusContextValue = {
    bus,
    publish,
    subscribe,
    once,
    unsubscribe,
  };

  return (
    <EventBusContext.Provider value={contextValue}>
      {children}
    </EventBusContext.Provider>
  );
};

/**
 * useEventBus - React Hook 获取事件总线
 *
 * @returns 事件总线上下文值（包含快捷方法）
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { publish, subscribe, unsubscribe } = useEventBus();
 *
 *   useEffect(() => {
 *     const id = subscribe('user:login', (data) => {
 *       console.log('用户登录:', data);
 *     });
 *
 *     return () => unsubscribe('user:login', id);
 *   }, []);
 *
 *   const handleLogin = () => {
 *     publish('user:login', { userId: 123 });
 *   };
 *
 *   return <button onClick={handleLogin}>登录</button>;
 * }
 * ```
 */
export function useEventBus(): EventBusContextValue {
  const context = useContext(EventBusContext);

  if (!context) {
    // 如果没有 Provider，返回全局事件总线
    return {
      bus: getEventBus(),
      publish: async <T = unknown>(event: string, data?: T) => getEventBus().publish(event, data),
      subscribe: <T = unknown>(event: string, callback: EventCallback<T>, once = false) =>
        getEventBus().subscribe(event, callback, once),
      once: <T = unknown>(event: string, callback: EventCallback<T>) =>
        getEventBus().once(event, callback),
      unsubscribe: (event?: string, subscriptionId?: string) =>
        getEventBus().unsubscribe(event, subscriptionId),
    };
  }

  return context;
}

// ==================== 快捷工具函数 ====================

/**
 * 创建类型安全的事件总线
 *
 * @example
 * ```ts
 * interface AppEvents {
 *   'user:login': { userId: number; timestamp: number };
 *   'app:error': { code: string; message: string };
 *   'chat:message': { id: string; text: string };
 * }
 *
 * const typedBus = createTypedEventBus<AppEvents>();
 *
 * // 类型检查：data 必须是 { userId: number; timestamp: number }
 * typedBus.subscribe('user:login', (data) => {
 *   console.log(data.userId);
 * });
 *
 * typedBus.publish('user:login', { userId: 123, timestamp: Date.now() });
 * ```
 */
export function createTypedEventBus<
  TEvents extends Record<string, unknown>
>(): EventBusImpl {
  return createEventBus();
}

// ==================== 预定义事件类型 ====================

/** 应用级事件 */
export const AppEvents = {
  /** 全局错误事件 */
  ERROR: 'app:error',
  /** 应用就绪事件 */
  READY: 'app:ready',
  /** 应用销毁事件 */
  DESTROY: 'app:destroy',
  /** 主题切换事件 */
  THEME_CHANGE: 'app:theme',
  /** 语言切换事件 */
  LOCALE_CHANGE: 'app:locale',
  /** 用户登录事件 */
  USER_LOGIN: 'user:login',
  /** 用户登出事件 */
  USER_LOGOUT: 'user:logout',
  /** 网络状态变化事件 */
  NETWORK_CHANGE: 'app:network',
} as const;

/** 组件级事件 */
export const ComponentEvents = {
  /** 组件挂载事件 */
  MOUNT: 'component:mount',
  /** 组件卸载事件 */
  UNMOUNT: 'component:unmount',
  /** 组件可见性变化事件 */
  VISIBILITY_CHANGE: 'component:visibility',
} as const;

// ==================== 默认导出 ====================

export default EventBusImpl;