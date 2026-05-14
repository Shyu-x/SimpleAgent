/**
 * 共享类型定义
 * 所有模块共用的类型，避免重复定义
 */

// ============ 通用类型 ============

/**
 * 加载状态
 */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

/**
 * API 响应结构
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * 分页结果
 */
export interface PaginationResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 用户信息（共享）
 */
export interface SharedUser {
  id: string;
  name: string;
  avatar?: string;
  email: string;
}

/**
 * 订单基础信息（共享）
 */
export interface SharedOrder {
  id: string;
  orderNo: string;
  status: 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled';
  totalAmount: number;
  createdAt: string;
}

// ============ 事件总线类型 ============
/**
 * 全局事件类型
 * 用于模块间通信
 */
export type GlobalEventType =
  | 'user:login'
  | 'user:logout'
  | 'user:profile-updated'
  | 'order:created'
  | 'order:paid'
  | 'order:shipped'
  | 'order:updated'
  | 'payment:started'
  | 'payment:completed'
  | 'payment:failed'
  | 'cart:updated'
  | 'cart:cleared'
  | 'app:theme-changed'
  | 'app:language-changed'
  | 'module:loaded'
  | 'module:error'
  | 'nav:changed';

export interface GlobalEvent<T = any> {
  type: GlobalEventType;
  payload: T;
  timestamp: number;
}

/**
 * 事件总线接口
 */
export interface IEventBus {
  emit<T>(type: GlobalEventType, payload: T): void;
  on<T>(type: GlobalEventType, handler: (event: GlobalEvent<T>) => void): () => void;
  off(type: GlobalEventType, handler: (event: GlobalEvent<unknown>) => void): void;
}