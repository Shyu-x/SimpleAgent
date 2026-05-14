/**
 * 模块包结构定义
 * ===============
 *
 * 包含所有模块的 NestJS 模块定义和依赖关系
 */

// ========== Module: User (用户模块) ==========

/**
 * 用户模块 - User Module
 *
 * 功能：
 * - 用户注册与登录
 * - 个人信息管理
 * - 权限与角色管理
 *
 * 依赖：无
 *
 * 数据隔离：module-user 数据库
 */

export const UserModuleDefinition = {
  name: 'module-user',
  displayName: '用户模块',
  version: '1.0.0',

  // 模块结构
  structure: {
    controllers: ['user.controller.ts'],
    services: ['user.service.ts'],
    entities: ['user.entity.ts', 'role.entity.ts', 'permission.entity.ts'],
    dto: ['user.dto.ts', 'auth.dto.ts'],
  },

  // 依赖模块
  dependencies: [],

  // 启动优先级
  startupPriority: 10,
};

/**
 * 用户实体 - User Entity
 */
// user.entity.ts
export interface UserEntity {
  id: string;
  username: string;
  email: string;
  phone?: string;
  passwordHash: string;
  status: 'active' | 'inactive' | 'banned';
  createdAt: Date;
  updatedAt: Date;
}

// ========== Module: Order (订单模块) ==========

/**
 * 订单模块 - Order Module
 *
 * 功能：
 * - 订单创建与查询
 * - 订单状态流转
 * - 订单取消与退款
 *
 * 依赖：module-user（硬依赖）
 *
 * 数据隔离：module-order 数据库
 */

export const OrderModuleDefinition = {
  name: 'module-order',
  displayName: '订单模块',
  version: '1.0.0',

  structure: {
    controllers: ['order.controller.ts'],
    services: ['order.service.ts'],
    entities: ['order.entity.ts', 'order-item.entity.ts'],
    dto: ['order.dto.ts'],
  },

  dependencies: [
    { moduleName: 'module-user', required: true },
  ],

  startupPriority: 20,

  // 事件发布
  publishes: ['order.created', 'order.paid', 'order.cancelled', 'order.completed'],

  // 事件订阅
  subscribes: [],
};

/**
 * 订单实体 - Order Entity
 */
export interface OrderEntity {
  id: string;
  userId: string;
  orderNo: string;
  status: 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled';
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemEntity[];
}

/**
 * 订单项实体 - Order Item Entity
 */
export interface OrderItemEntity {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

// ========== Module: Payment (支付模块) ==========

/**
 * 支付模块 - Payment Module
 *
 * 功能：
 * - 支付通道集成
 * - 交易流水记录
 * - 退款处理
 *
 * 依赖：module-user, module-order（硬依赖）
 *
 * 数据隔离：module-payment 数据库
 */

export const PaymentModuleDefinition = {
  name: 'module-payment',
  displayName: '支付模块',
  version: '1.0.0',

  structure: {
    controllers: ['payment.controller.ts'],
    services: ['payment.service.ts', 'alipay.service.ts', 'wechat.service.ts'],
    entities: ['payment.entity.ts', 'refund.entity.ts'],
    dto: ['payment.dto.ts'],
  },

  dependencies: [
    { moduleName: 'module-user', required: true },
    { moduleName: 'module-order', required: true },
  ],

  startupPriority: 30,

  publishes: ['payment.initiated', 'payment.success', 'payment.failed', 'payment.refunded'],
  subscribes: [
    { event: 'order.paid', handler: 'handleOrderPaid' },
  ],
};

/**
 * 支付实体 - Payment Entity
 */
export interface PaymentEntity {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  channel: 'alipay' | 'wechat' | 'bank';
  status: 'pending' | 'success' | 'failed' | 'refunded';
  tradeNo?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * 退款实体 - Refund Entity
 */
export interface RefundEntity {
  id: string;
  paymentId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
}

// ========== 模块依赖图 ==========

/**
 * 模块依赖关系图
 *
 *        module-user
 *            |
 *            v
 *        module-order
 *            |
 *            v
 *       module-payment
 */
export const ModuleDependencyGraph = {
  nodes: [
    { id: 'module-user', label: '用户模块', priority: 10 },
    { id: 'module-order', label: '订单模块', priority: 20 },
    { id: 'module-payment', label: '支付模块', priority: 30 },
  ],
  edges: [
    { from: 'module-user', to: 'module-order', type: 'hard' },
    { from: 'module-order', to: 'module-payment', type: 'hard' },
  ],
};

/**
 * 模块间事件流
 *
 * 订单创建 -> 通知支付 -> 处理结果 -> 更新订单
 */
export const InterModuleEventFlow = {
  'order.created': {
    subscribers: ['module-payment'],
    description: '订单创建后触发支付',
  },
  'order.paid': {
    subscribers: ['module-notification'],
    description: '订单支付成功后发送通知',
  },
  'payment.success': {
    subscribers: ['module-order', 'module-notification'],
    description: '支付成功后更新订单状态',
  },
  'payment.refunded': {
    subscribers: ['module-order'],
    description: '退款成功后更新订单',
  },
};