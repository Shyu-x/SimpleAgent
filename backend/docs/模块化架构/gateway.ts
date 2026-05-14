/**
 * API 网关 - Gateway
 * =================
 *
 * 职责：
 * 1. 请求路由分发 - 根据路径将请求转发到对应模块
 * 2. 统一鉴权 - 所有请求统一验证
 * 3. 限流保护 - 防止滥用
 * 4. 协议转换 - REST 到内部 RPC
 * 5. 响应聚合 - 多模块数据合并
 */

import {
  Controller,
  Get,
  Post,
  All,
  Req,
  Res,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ModuleConfigService } from './module.config';
import { EventBusService } from './event-bus';

/**
 * 路由配置
 */
interface RouteConfig {
  /** 路由路径 */
  path: string;
  /** 目标模块 */
  targetModule: string;
  /** 目标服务地址 */
  targetUrl: string;
  /** 是否需要鉴权 */
  authRequired: boolean;
  /** 请求超时(毫秒) */
  timeout?: number;
  /** 限流配置 */
  rateLimit?: {
    max: number;
    windowMs: number;
  };
}

/**
 * 路由映射表
 */
const ROUTE_TABLE: RouteConfig[] = [
  // 用户模块路由
  {
    path: '/api/users/*',
    targetModule: 'module-user',
    targetUrl: process.env.MODULE_USER_URL || 'http://localhost:3001',
    authRequired: true,
    timeout: 5000,
    rateLimit: { max: 100, windowMs: 60000 },
  },

  // 订单模块路由
  {
    path: '/api/orders/*',
    targetModule: 'module-order',
    targetUrl: process.env.MODULE_ORDER_URL || 'http://localhost:3002',
    authRequired: true,
    timeout: 10000,
    rateLimit: { max: 50, windowMs: 60000 },
  },

  // 支付模块路由
  {
    path: '/api/payments/*',
    targetModule: 'module-payment',
    targetUrl: process.env.MODULE_PAYMENT_URL || 'http://localhost:3003',
    authRequired: true,
    timeout: 30000,
    rateLimit: { max: 30, windowMs: 60000 },
  },

  // 公开路由（无需鉴权）
  {
    path: '/api/public/*',
    targetModule: 'gateway',
    targetUrl: 'internal',
    authRequired: false,
  },
];

/**
 * 路由统计
 */
interface RouteStats {
  path: string;
  module: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
}

@Controller()
export class GatewayController {
  private readonly logger = new Logger(GatewayController.name);
  private routeStats = new Map<string, RouteStats>();

  constructor(
    private readonly moduleConfig: ModuleConfigService,
    private readonly eventBus: EventBusService,
  ) {
    this.initializeStats();
  }

  /**
   * 初始化路由统计
   */
  private initializeStats(): void {
    ROUTE_TABLE.forEach((route) => {
      this.routeStats.set(route.path, {
        path: route.path,
        module: route.targetModule,
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        avgResponseTime: 0,
      });
    });
  }

  /**
   * 健康检查端点
   */
  @Get('health')
  async healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      modules: this.moduleConfig.getHealthSummary(),
    };
  }

  /**
   * 网关统计信息
   */
  @Get('gateway/stats')
  async getStats() {
    const stats = Array.from(this.routeStats.values());
    return {
      totalRoutes: stats.length,
      routes: stats,
    };
  }

  /**
   * 路由表
   */
  @Get('gateway/routes')
  async getRoutes() {
    return {
      routes: ROUTE_TABLE.map((r) => ({
        path: r.path,
        module: r.targetModule,
        authRequired: r.authRequired,
        rateLimit: r.rateLimit,
      })),
    };
  }

  /**
   * 路由分发测试
   * 展示如何将请求分发到各模块
   */
  @All('api/:module/*')
  async proxyRequest(
    @Param('module') module: string,
    @Param() params: any,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
    @Headers('authorization') auth: string,
  ) {
    const startTime = Date.now();
    const path = `/api/${module}/*`;

    // 查找匹配的路由
    const route = ROUTE_TABLE.find((r) => {
      const regex = new RegExp(r.path.replace('*', '.*'));
      return regex.test(path);
    });

    if (!route) {
      return res.status(404).json({
        error: 'Route not found',
        path: `/api/${module}`,
      });
    }

    // 检查模块是否启用
    if (!this.moduleConfig.isModuleEnabled(route.targetModule)) {
      return res.status(503).json({
        error: 'Module disabled',
        module: route.targetModule,
      });
    }

    // 模拟路由转发
    this.logger.log(`路由分发: ${req.method} ${path} -> ${route.targetModule}`);

    // 记录请求
    const stats = this.routeStats.get(route.path);
    if (stats) {
      stats.totalRequests++;
    }

    // 模拟成功响应（实际会转发到目标服务）
    const responseTime = Date.now() - startTime;
    if (stats) {
      stats.successCount++;
      stats.avgResponseTime = (stats.avgResponseTime * (stats.totalRequests - 1) + responseTime) / stats.totalRequests;
    }

    return res.status(200).json({
      success: true,
      routedTo: route.targetModule,
      requestPath: path,
      responseTime,
    });
  }

  /**
   * 模块控制端点
   * 动态启用/禁用模块
   */
  @Post('gateway/modules/:name/enable')
  @HttpCode(HttpStatus.OK)
  async enableModule(@Param('name') name: string) {
    const success = await this.moduleConfig.enableModule(name);
    return { success, module: name };
  }

  @Post('gateway/modules/:name/disable')
  @HttpCode(HttpStatus.OK)
  async disableModule(@Param('name') name: string) {
    this.moduleConfig.disableModule(name);
    return { success: true, module: name };
  }

  /**
   * 事件触发端点
   * 用于测试模块间通信
   */
  @Post('gateway/events/:eventType')
  @HttpCode(HttpStatus.ACCEPTED)
  async publishEvent(
    @Param('eventType') eventType: string,
    @Body() payload: any,
  ) {
    await this.eventBus.publish({
      eventId: `gateway_${Date.now()}`,
      type: eventType,
      timestamp: Date.now(),
      source: 'gateway',
      payload,
    });

    return {
      success: true,
      eventType,
      message: 'Event published',
    };
  }

  /**
   * 事件历史查询
   */
  @Get('gateway/events')
  async getEventHistory(
    @Req() req: Request,
  ) {
    const eventType = req.query.type as string;
    const limit = parseInt(req.query.limit as string) || 100;

    return {
      events: this.eventBus.getEventHistory(eventType, limit),
      stats: this.eventBus.getSubscriptionStats(),
    };
  }
}

/**
 * 网关模块定义
 */
export const GatewayModuleDefinition = {
  name: 'gateway',
  displayName: 'API网关',
  version: '1.0.0',

  controllers: [GatewayController],

  dependencies: [
    ModuleConfigService,
    EventBusService,
  ],

  middleware: [
    // 统一鉴权中间件
    // 限流中间件
    // 日志中间件
  ],

  startupPriority: 1, // 网关最先启动
};