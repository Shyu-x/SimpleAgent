/**
 * NestJS 主应用入口
 * ==================
 *
 * 模块化架构的根模块
 */

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ModuleConfigService } from './module.config';
import { EventBusService } from './event-bus';
import { DataRouterService } from './data-isolation';
import { GatewayController } from './gateway';
import {
  GlobalExceptionFilter,
  LoggingInterceptor,
  TransformInterceptor,
} from './common';
import { RedisCacheService } from './infra';
import { BullQueueService } from './infra';

/**
 * 根模块
 */
@Module({
  imports: [
    // 基础设施模块
    // - 数据库连接
    // - Redis 缓存
    // - Bull 队列
    // - 配置中心

    // 功能模块（按启动顺序）
    // - Gateway (优先级 1)
    // - User Module (优先级 10)
    // - Order Module (优先级 20)
    // - Payment Module (优先级 30)
  ],

  controllers: [
    GatewayController,
  ],

  providers: [
    // 核心服务
    ModuleConfigService,
    EventBusService,
    DataRouterService,

    // 基础设施
    RedisCacheService,
    BullQueueService,

    // 全局异常过滤器
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },

    // 全局拦截器
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 全局中间件配置
    // - 统一日志
    // - 请求追踪
    // - CORS
  }
}

// ========== 模块依赖关系可视化 ==========

/**
 * 启动顺序图
 *
 * Level 1: Gateway (入口)
 * Level 2: Infrastructure (基础设施)
 * Level 3: Module-User (用户)
 * Level 4: Module-Order (订单，依赖用户)
 * Level 5: Module-Payment (支付，依赖订单和用户)
 */

/**
 * 事件流图
 *
 * order.created ──> payment.initiated ──> payment.success ──> order.updated
 *                    │
 *                    └──> notification.sent
 */

// ========== 启动脚本 ==========

/**
 * 启动检查清单
 *
 * 1. ✅ 配置中心可访问
 * 2. ✅ 数据库连接正常
 * 3. ✅ Redis 连接正常
 * 4. ✅ 队列服务正常
 * 5. ✅ 模块依赖验证通过
 * 6. ✅ 启动顺序正确
 */

/**
 * 健康检查端点
 *
 * GET /health
 * {
 *   "status": "ok",
 *   "modules": [...],
 *   "dependencies": {...}
 * }
 */

// ========== 示例模块实现 ==========

/**
 * User Module 示例结构
 */
export const UserModuleStructure = `
module-user/
├── user.controller.ts    # 用户控制器
├── user.service.ts        # 用户服务
├── user.entity.ts         # 用户实体
├── dto/
│   ├── create-user.dto.ts
│   └── update-user.dto.ts
└── user.module.ts         # 模块定义
`;

/**
 * Order Module 示例结构
 */
export const OrderModuleStructure = `
module-order/
├── order.controller.ts
├── order.service.ts
├── order.entity.ts
├── dto/
│   ├── create-order.dto.ts
│   └── update-order.dto.ts
├── listeners/
│   └── payment.listener.ts  # 监听支付事件
└── order.module.ts
`;

/**
 * Payment Module 示例结构
 */
export const PaymentModuleStructure = `
module-payment/
├── payment.controller.ts
├── payment.service.ts
├── alipay.service.ts       # 支付宝通道
├── wechat.service.ts       # 微信通道
├── payment.entity.ts
├── dto/
│   └── create-payment.dto.ts
├── listeners/
│   └── order.listener.ts   # 监听订单事件
└── payment.module.ts
`;