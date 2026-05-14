/**
 * 事件总线
 * 用于 Module Federation 中不同模块间的通信
 *
 * 为什么需要事件总线？
 * 1. Remote 模块之间不能直接调用（解耦）
 * 2. 需要一个中介来传递消息
 * 3. 支持发布-订阅模式
 */

type EventHandler = (data: any) => void;

/**
 * 命名空间隔离的事件总线
 * 支持多个独立的事件空间，避免事件名冲突
 */
class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private namespace: string;

  /**
   * 创建事件总线实例
   * @param namespace 命名空间，用于隔离不同模块的事件
   */
  constructor(namespace: string = 'global') {
    this.namespace = namespace;
  }

  /**
   * 获取带命名空间的事件名
   */
  private getNamespacedEvent(event: string): string {
    return `${this.namespace}:${event}`;
  }

  /**
   * 订阅事件
   * @param event 事件名称（不含命名空间）
   * @param handler 事件处理函数
   * @returns 取消订阅函数
   */
  on(event: string, handler: EventHandler): () => void {
    const namespacedEvent = this.getNamespacedEvent(event);

    if (!this.handlers.has(namespacedEvent)) {
      this.handlers.set(namespacedEvent, new Set());
    }
    this.handlers.get(namespacedEvent)!.add(handler);

    // 返回取消订阅函数
    return () => {
      this.handlers.get(namespacedEvent)?.delete(handler);
    };
  }

  /**
   * 订阅事件（一次性）
   * @param event 事件名称
   * @param handler 事件处理函数
   */
  once(event: string, handler: EventHandler): void {
    const wrappedHandler = (data: any) => {
      handler(data);
      this.off(event, wrappedHandler);
    };
    this.on(event, wrappedHandler);
  }

  /**
   * 发布事件
   * @param event 事件名称（不含命名空间）
   * @param data 事件数据
   */
  emit(event: string, data: any): void {
    const namespacedEvent = this.getNamespacedEvent(event);
    const handlers = this.handlers.get(namespacedEvent);

    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[EventBus:${this.namespace}] Error in handler for "${event}":`, error);
        }
      });
    }
  }

  /**
   * 取消订阅
   * @param event 事件名称（不含命名空间）
   * @param handler 要移除的处理函数
   */
  off(event: string, handler: EventHandler): void {
    const namespacedEvent = this.getNamespacedEvent(event);
    this.handlers.get(namespacedEvent)?.delete(handler);
  }

  /**
   * 清空命名空间下所有事件订阅
   */
  clear(): void {
    const prefix = `${this.namespace}:`;
    for (const key of this.handlers.keys()) {
      if (key.startsWith(prefix)) {
        this.handlers.delete(key);
      }
    }
  }

  /**
   * 获取当前命名空间
   */
  getNamespace(): string {
    return this.namespace;
  }
}

// ================================================================
// 全局事件总线实例
// ================================================================

/**
 * 全局事件总线（默认命名空间）
 */
export const globalEventBus = new EventBus('global');

/**
 * 创建新的命名空间事件总线
 * 用于模块间完全隔离的事件通信
 */
export function createNamespacedBus(namespace: string): EventBus {
  return new EventBus(namespace);
}

// ================================================================
// 预定义事件类型
// ================================================================

export const Events = {
  // 用户相关
  USER_LOGIN: 'user:login',
  USER_LOGOUT: 'user:logout',
  USER_PROFILE_UPDATED: 'user:profile-updated',

  // 订单相关
  ORDER_CREATED: 'order:created',
  ORDER_PAID: 'order:paid',
  ORDER_SHIPPED: 'order:shipped',
  ORDER_UPDATED: 'order:updated',

  // 购物车相关
  CART_UPDATED: 'cart:updated',
  CART_CLEARED: 'cart:cleared',

  // 支付相关
  PAYMENT_STARTED: 'payment:started',
  PAYMENT_COMPLETED: 'payment:completed',
  PAYMENT_FAILED: 'payment:failed',

  // 应用相关
  THEME_CHANGED: 'app:theme-changed',
  LANGUAGE_CHANGED: 'app:language-changed',

  // 模块加载相关
  MODULE_LOADED: 'module:loaded',
  MODULE_ERROR: 'module:error',

  // 导航相关
  NAVIGATION_CHANGED: 'nav:changed'
} as const;

// 事件类型联合类型
export type EventType = typeof Events[keyof typeof Events] | string;

// ================================================================
// React Hooks
// ================================================================

import { useEffect, useCallback } from 'react';

/**
 * 事件订阅 Hook
 *
 * @param event 事件名称
 * @param handler 事件处理函数
 * @param bus 可选的事件总线实例，默认使用全局事件总线
 *
 * @example
 * ```tsx
 * function CartBadge() {
 *   const [count, setCount] = useState(0);
 *
 *   useEventSubscription(Events.CART_UPDATED, (data) => {
 *     setCount(data.itemCount);
 *   });
 *
 *   return <span>{count}</span>;
 * }
 * ```
 */
export function useEventSubscription(
  event: string,
  handler: EventHandler,
  bus: EventBus = globalEventBus
) {
  useEffect(() => {
    const unsubscribe = bus.on(event, handler);
    return unsubscribe;
  }, [event, handler, bus]);
}

/**
 * 发布事件的 Hook
 *
 * @param bus 可选的事件总线实例
 * @returns 发布事件函数
 *
 * @example
 * ```tsx
 * function AddToCartButton() {
 *   const emit = useEventEmitter();
 *
 *   const handleClick = () => {
 *     emit(Events.CART_UPDATED, { itemCount: 1 });
 *   };
 *
 *   return <button onClick={handleClick}>添加到购物车</button>;
 * }
 * ```
 */
export function useEventEmitter(bus: EventBus = globalEventBus) {
  return useCallback((event: string, data: any) => {
    bus.emit(event, data);
  }, [bus]);
}

// ================================================================
// 辅助函数
// ================================================================

/**
 * 订阅事件（同步版本，返回取消函数）
 * 用于在非 React 环境中使用
 */
export function subscribe(event: string, handler: EventHandler): () => void {
  return globalEventBus.on(event, handler);
}

/**
 * 发布事件（同步版本）
 */
export function publish(event: string, data: any): void {
  globalEventBus.emit(event, data);
}

/**
 * 创建模块级事件总线
 * 每个模块使用独立的命名空间，避免事件冲突
 *
 * @param moduleName 模块名称
 * @returns 模块专用的事件总线
 *
 * @example
 * ```typescript
 * // 在订单模块中
 * const orderBus = createModuleBus('order');
 * orderBus.on('created', handleOrderCreated);
 * orderBus.emit('created', { orderId: '123' });
 * ```
 */
export function createModuleBus(moduleName: string): EventBus {
  return createNamespacedBus(`module:${moduleName}`);
}

// ================================================================
// 导出
// ================================================================

export default {
  globalEventBus,
  createNamespacedBus,
  createModuleBus,
  Events,
  subscribe,
  publish,
  useEventSubscription,
  useEventEmitter
};