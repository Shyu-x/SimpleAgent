/**
 * 数据隔离策略
 * =============
 *
 * 本模块实现分库分表和读写分离策略
 *
 * 设计目标：
 * 1. 按业务模块隔离数据，减少耦合
 * 2. 支持分表策略，应对数据量增长
 * 3. 读写分离提升性能
 * 4. 数据访问层抽象，支持多数据源
 */

import {
  Injectable,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  /** 连接名称 */
  name: string;
  /** 数据库类型 */
  type: 'mysql' | 'postgres' | 'sqlite' | 'mongodb';
  /** 主机地址 */
  host: string;
  /** 端口号 */
  port: number;
  /** 数据库名 */
  database: string;
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
  /** 是否为主库（写） */
  isPrimary: boolean;
  /** 连接池大小 */
  poolSize?: number;
}

/**
 * 分表策略配置
 */
export interface ShardingStrategy {
  /** 策略名称 */
  name: string;
  /** 分表字段 */
  shardingKey: string;
  /** 分表算法 */
  algorithm: 'hash' | 'range' | 'mod';
  /** 分表数量 */
  shardCount: number;
}

/**
 * 路由上下文
 */
export interface RoutingContext {
  /** 当前租户ID（多租户场景） */
  tenantId?: string;
  /** 当前用户ID */
  userId?: string;
  /** 模块标识 */
  module?: string;
}

/**
 * 数据路由服务
 */
@Injectable()
export class DataRouterService implements OnModuleInit {
  private readonly logger = new Logger(DataRouterService.name);
  private dataSources = new Map<string, DataSource>();
  private routingRules = new Map<string, DatabaseConfig>();
  private shardingStrategies = new Map<string, ShardingStrategy>();

  constructor() {
    this.initializeRoutingRules();
    this.initializeShardingStrategies();
  }

  onModuleInit() {
    this.logger.log('数据路由服务初始化完成');
  }

  /**
   * 初始化路由规则
   * 将不同模块路由到不同数据库
   */
  private initializeRoutingRules(): void {
    // 用户模块 - 使用 user_db
    this.routingRules.set('module-user', {
      name: 'user_db',
      type: 'mysql',
      host: process.env.DB_USER_HOST || 'localhost',
      port: 3306,
      database: 'user_db',
      username: process.env.DB_USER_USER || 'root',
      password: process.env.DB_USER_PASSWORD || 'password',
      isPrimary: true,
    });

    // 订单模块 - 使用 order_db
    this.routingRules.set('module-order', {
      name: 'order_db',
      type: 'mysql',
      host: process.env.DB_ORDER_HOST || 'localhost',
      port: 3306,
      database: 'order_db',
      username: process.env.DB_ORDER_USER || 'root',
      password: process.env.DB_ORDER_PASSWORD || 'password',
      isPrimary: true,
    });

    // 支付模块 - 使用 payment_db
    this.routingRules.set('module-payment', {
      name: 'payment_db',
      type: 'mysql',
      host: process.env.DB_PAYMENT_HOST || 'localhost',
      port: 3306,
      database: 'payment_db',
      username: process.env.DB_PAYMENT_USER || 'root',
      password: process.env.DB_PAYMENT_PASSWORD || 'password',
      isPrimary: true,
    });

    // 默认库（公共数据）
    this.routingRules.set('default', {
      name: 'default_db',
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: 3306,
      database: 'default_db',
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      isPrimary: true,
    });
  }

  /**
   * 初始化分片策略
   */
  private initializeShardingStrategies(): void {
    // 订单按月分表
    this.shardingStrategies.set('orders', {
      name: 'orders_monthly',
      shardingKey: 'created_at',
      algorithm: 'range',
      shardCount: 12, // 按月份分表
    });

    // 用户按ID哈希分表
    this.shardingStrategies.set('users', {
      name: 'users_by_id',
      shardingKey: 'id',
      algorithm: 'hash',
      shardCount: 16, // 16个分片
    });
  }

  /**
   * 获取数据源配置
   * @param module 模块名称
   * @param context 路由上下文
   */
  getDataSourceConfig(module: string, context?: RoutingContext): DatabaseConfig {
    // 先检查模块特定配置
    let config = this.routingRules.get(module);

    // 如果没有特定配置，检查租户配置
    if (!config && context?.tenantId) {
      config = this.routingRules.get(`tenant_${context.tenantId}`);
    }

    // 最后使用默认配置
    if (!config) {
      config = this.routingRules.get('default')!;
      this.logger.warn(`模块 ${module} 无特定数据源，使用默认配置`);
    }

    return config;
  }

  /**
   * 获取分表后的表名
   * @param tableName 原表名
   * @param strategy 分片策略名称
   * @param shardingValue 分片字段值
   */
  getShardedTableName(tableName: string, strategy: string, shardingValue: unknown): string {
    const strategyConfig = this.shardingStrategies.get(strategy);

    if (!strategyConfig) {
      this.logger.warn(`未找到分片策略 ${strategy}，返回原表名`);
      return tableName;
    }

    const { algorithm, shardCount } = strategyConfig;

    switch (algorithm) {
      case 'hash':
        const hash = this.hashCode(String(shardingValue));
        const hashShard = Math.abs(hash) % shardCount;
        return `${tableName}_${hashShard.toString().padStart(2, '0')}`;

      case 'range':
        // 按时间范围分表
        const date = new Date(String(shardingValue));
        const month = date.getMonth() + 1;
        return `${tableName}_${month.toString().padStart(2, '0')}`;

      case 'mod':
        const numValue = Number(shardingValue);
        const modShard = numValue % shardCount;
        return `${tableName}_${modShard.toString().padStart(2, '0')}`;

      default:
        return tableName;
    }
  }

  /**
   * 计算哈希值
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * 判断是否使用读库
   * @param isWrite 是否是写操作
   * @param context 路由上下文
   */
  shouldUseReadReplica(isWrite: boolean, context?: RoutingContext): boolean {
    // 写操作必须用主库
    if (isWrite) return false;

    // 某些敏感操作（如财务报表）强制用主库
    if (context?.module === 'finance') return false;

    // 读操作可以使用读库（负载均衡考虑）
    return true;
  }

  /**
   * 获取路由统计信息
   */
  getRoutingStats(): {
    totalRules: number;
    activeShards: number;
    modules: string[];
  } {
    return {
      totalRules: this.routingRules.size,
      activeShards: this.shardingStrategies.size,
      modules: Array.from(this.routingRules.keys()),
    };
  }
}

/**
 * 读写分离装饰器
 * 用于标记读操作使用只读副本
 */
export function ReadOnly() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // 在方法执行前标记为只读
      // 实际实现需要在请求上下文中设置标志
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * 分表装饰器
 * 用于自动分表的实体
 */
export function ShardedTable(strategy: string, shardingKey: string) {
  return function (target: any) {
    target.__shardingStrategy = strategy;
    target.__shardingKey = shardingKey;
  };
}