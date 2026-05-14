/**
 * 模块化架构 - 示例模块
 * ====================
 *
 * 展示模块的标准结构和集成方式
 *
 * @module modules
 * @version 1.0.0
 */

/**
 * 用户模块定义
 */
const UserModuleDefinition = {
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

  // 事件发布
  publishes: ['user.registered', 'user.login', 'user.logout', 'user.profile.updated'],

  // 事件订阅
  subscribes: [],
};

/**
 * 订单模块定义
 */
const OrderModuleDefinition = {
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
 * 支付模块定义
 */
const PaymentModuleDefinition = {
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
 * 模块依赖图
 *
 *        module-user
 *            |
 *            v
 *        module-order
 *            |
 *            v
 *       module-payment
 */
const ModuleDependencyGraph = {
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
 */
const InterModuleEventFlow = {
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

/**
 * 实体类型定义
 */
const UserEntity = {
  id: 'string',
  username: 'string',
  email: 'string',
  phone: 'string?',
  passwordHash: 'string',
  status: "'active' | 'inactive' | 'banned'",
  createdAt: 'Date',
  updatedAt: 'Date',
};

const OrderEntity = {
  id: 'string',
  userId: 'string',
  orderNo: 'string',
  status: "'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled'",
  totalAmount: 'number',
  createdAt: 'Date',
  updatedAt: 'Date',
};

const PaymentEntity = {
  id: 'string',
  orderId: 'string',
  userId: 'string',
  amount: 'number',
  channel: "'alipay' | 'wechat' | 'bank'",
  status: "'pending' | 'success' | 'failed' | 'refunded'",
  tradeNo: 'string?',
  createdAt: 'Date',
  completedAt: 'Date?',
};

module.exports = {
  UserModuleDefinition,
  OrderModuleDefinition,
  PaymentModuleDefinition,
  ModuleDependencyGraph,
  InterModuleEventFlow,
  UserEntity,
  OrderEntity,
  PaymentEntity,
};