/**
 * Infrastructure - 基础设施层
 * ============================
 *
 * 包含数据库、缓存、消息队列、配置中心等基础设施抽象
 *
 * 目录结构：
 * infra/
 * ├── database/     # 数据库连接管理
 * │   ├── connection.ts
 * │   └── repositories/
 * ├── cache/        # 缓存服务
 * │   └── redis.service.ts
 * ├── queue/        # 消息队列
 * │   └── bull-queue.service.ts
 * └── config/       # 配置中心
 *     └── config-center.service.ts
 */

// ========== 1. 数据库 (Database) ==========

import {
  Injectable,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * 数据库连接管理器
 *
 * 职责：
 * 1. 管理多数据源连接
 * 2. 读写分离路由
 * 3. 连接池配置
 * 4. 健康检查
 */
@Injectable()
export class DatabaseConnectionService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseConnectionService.name);
  private dataSources = new Map<string, DataSource>();

  /**
   * 数据源配置
   */
  private readonly dataSourceConfigs = {
    primary: {
      type: 'mysql' as const,
      host: process.env.DB_PRIMARY_HOST || 'localhost',
      port: parseInt(process.env.DB_PRIMARY_PORT || '3306'),
      database: process.env.DB_PRIMARY_NAME || 'main',
      username: process.env.DB_PRIMARY_USER || 'root',
      password: process.env.DB_PRIMARY_PASSWORD || 'password',
      synchronize: process.env.NODE_ENV !== 'production',
      poolSize: 20,
    },
    readReplica: {
      type: 'mysql' as const,
      host: process.env.DB_REPLICA_HOST || 'localhost',
      port: parseInt(process.env.DB_REPLICA_PORT || '3306'),
      database: process.env.DB_REPLICA_NAME || 'main',
      username: process.env.DB_REPLICA_USER || 'root',
      password: process.env.DB_REPLICA_PASSWORD || 'password',
      synchronize: false,
      poolSize: 30,
    },
  };

  onModuleInit() {
    this.logger.log('数据库连接服务初始化完成');
    this.initializeConnections();
  }

  /**
   * 初始化数据库连接
   */
  private async initializeConnections(): Promise<void> {
    try {
      // 初始化主库（写）
      const primarySource = new DataSource(this.dataSourceConfigs.primary);
      await primarySource.initialize();
      this.dataSources.set('primary', primarySource);
      this.logger.log('主库连接成功');

      // 初始化读库（读）
      const replicaSource = new DataSource(this.dataSourceConfigs.readReplica);
      await replicaSource.initialize();
      this.dataSources.set('readReplica', replicaSource);
      this.logger.log('读库连接成功');
    } catch (error) {
      this.logger.error('数据库连接初始化失败', error);
    }
  }

  /**
   * 获取主库连接
   */
  getPrimaryDataSource(): DataSource {
    const source = this.dataSources.get('primary');
    if (!source) {
      throw new Error('Primary database not initialized');
    }
    return source;
  }

  /**
   * 获取读库连接
   */
  getReadDataSource(): DataSource {
    const source = this.dataSources.get('readReplica');
    if (!source) {
      // 如果读库未初始化，回退到主库
      this.logger.warn('读库未初始化，回退到主库');
      return this.getPrimaryDataSource();
    }
    return source;
  }

  /**
   * 根据操作类型选择数据源
   * @param isWrite 是否是写操作
   */
  getDataSource(isWrite: boolean): DataSource {
    return isWrite ? this.getPrimaryDataSource() : this.getReadDataSource();
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ primary: boolean; replica: boolean }> {
    const results = { primary: false, replica: false };

    try {
      const primarySource = this.dataSources.get('primary');
      if (primarySource) {
        await primarySource.query('SELECT 1');
        results.primary = true;
      }
    } catch {
      results.primary = false;
    }

    try {
      const replicaSource = this.dataSources.get('readReplica');
      if (replicaSource) {
        await replicaSource.query('SELECT 1');
        results.replica = true;
      }
    } catch {
      results.replica = false;
    }

    return results;
  }
}

// ========== 2. 缓存 (Cache) ==========

import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Redis 缓存服务
 *
 * 功能：
 * 1. 基础缓存操作 (get/set/del)
 * 2. 过期时间设置
 * 3. 缓存模式（Cache-Aside/Read-Through/Write-Behind）
 * 4. 分布式锁
 */
@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis 连接成功');
    });

    this.redis.on('error', (err) => {
      this.logger.error('Redis 连接错误', err);
    });
  }

  /**
   * 获取缓存
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  /**
   * 设置缓存
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  /**
   * 删除缓存
   */
  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * 批量删除（模式匹配）
   */
  async delByPattern(pattern: string): Promise<number> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      return await this.redis.del(...keys);
    }
    return 0;
  }

  /**
   * 分布式锁
   */
  async acquireLock(key: string, ttlSeconds = 30): Promise<boolean> {
    const lockKey = `lock:${key}`;
    const result = await this.redis.set(lockKey, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * 释放分布式锁
   */
  async releaseLock(key: string): Promise<void> {
    const lockKey = `lock:${key}`;
    await this.redis.del(lockKey);
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

// ========== 3. 消息队列 (Queue) ==========

import { Injectable, Logger } from '@nestjs/common';
import * as Bull from 'bull';

/**
 * Bull 队列服务
 *
 * 功能：
 * 1. 异步任务处理
 * 2. 延迟任务
 * 3. 定时任务
 * 4. 重试机制
 * 5. 并发控制
 */
@Injectable()
export class BullQueueService {
  private readonly logger = new Logger(BullQueueService.name);
  private queues = new Map<string, Bull.Queue>();

  /**
   * 队列配置
   */
  private readonly queueConfigs = {
    order: {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    },
    payment: {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 50,
        removeOnFail: 500,
      },
    },
    notification: {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 500,
        },
        removeOnComplete: 200,
        removeOnFail: 200,
      },
    },
  };

  /**
   * 创建队列
   */
  createQueue(name: string, config?: Bull.QueueOptions): Bull.Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queueConfig = this.queueConfigs[name as keyof typeof this.queueConfigs];
    const queue = new Bull(name, {
      ...queueConfig,
      ...config,
    });

    queue.on('completed', (job) => {
      this.logger.debug(`任务完成: ${name}:${job.id}`);
    });

    queue.on('failed', (job, err) => {
      this.logger.error(`任务失败: ${name}:${job.id} - ${err.message}`);
    });

    this.queues.set(name, queue);
    this.logger.log(`队列创建: ${name}`);
    return queue;
  }

  /**
   * 添加任务
   */
  async addJob<T>(queueName: string, jobName: string, data: T): Promise<Bull.Job> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    return await queue.add(jobName, data);
  }

  /**
   * 添加延迟任务
   */
  async addDelayedJob<T>(queueName: string, jobName: string, data: T, delay: number): Promise<Bull.Job> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    return await queue.add(jobName, data, { delay });
  }

  /**
   * 处理器
   */
  process(queueName: string, processor: (job: Bull.Job) => Promise<void>): void {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    queue.process(processor);
    this.logger.log(`处理器注册: ${queueName}`);
  }

  /**
   * 获取队列状态
   */
  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0 };
    }

    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}

// ========== 4. 配置中心 (Config Center) ==========

import {
  Injectable,
  OnModuleInit,
  Logger,
} from '@nestjs/common';

/**
 * 配置项接口
 */
interface ConfigItem {
  key: string;
  value: any;
  version: number;
  updatedAt: Date;
}

/**
 * 配置监听器
 */
type ConfigChangeListener = (key: string, value: any) => void;

/**
 * 配置中心服务
 *
 * 功能：
 * 1. 集中配置管理
 * 2. 配置热更新（无需重启）
 * 3. 配置版本控制
 * 4. 配置变更监听
 */
@Injectable()
export class ConfigCenterService implements OnModuleInit {
  private readonly logger = new Logger(ConfigCenterService.name);
  private configs = new Map<string, ConfigItem>();
  private listeners = new Map<string, ConfigChangeListener[]>();

  onModuleInit() {
    this.logger.log('配置中心服务初始化完成');
    this.loadConfigs();
  }

  /**
   * 加载配置
   */
  private async loadConfigs(): Promise<void> {
    // 从数据库或远程配置中心加载
    const defaultConfigs: Record<string, any> = {
      'app.name': 'Modular Architecture',
      'app.port': 3000,
      'app.environment': process.env.NODE_ENV || 'development',

      // 模块开关
      'module.user.enabled': true,
      'module.order.enabled': true,
      'module.payment.enabled': true,

      // 限流配置
      'rateLimit.default.max': 100,
      'rateLimit.default.window': 60000,

      // 缓存配置
      'cache.default.ttl': 3600,
    };

    Object.entries(defaultConfigs).forEach(([key, value]) => {
      this.set(key, value);
    });

    this.logger.log(`加载 ${this.configs.size} 个配置项`);
  }

  /**
   * 获取配置
   */
  get<T>(key: string): T | undefined {
    return this.configs.get(key)?.value as T;
  }

  /**
   * 获取配置（带默认值）
   */
  getOrDefault<T>(key: string, defaultValue: T): T {
    return this.get<T>(key) ?? defaultValue;
  }

  /**
   * 设置配置
   */
  set(key: string, value: any): void {
    const existing = this.configs.get(key);
    const version = existing ? existing.version + 1 : 1;

    this.configs.set(key, {
      key,
      value,
      version,
      updatedAt: new Date(),
    });

    // 触发监听器
    this.notifyListeners(key, value);

    this.logger.debug(`配置更新: ${key} = ${JSON.stringify(value)} (v${version})`);
  }

  /**
   * 批量设置配置
   */
  setMany(items: Record<string, any>): void {
    Object.entries(items).forEach(([key, value]) => {
      this.set(key, value);
    });
  }

  /**
   * 删除配置
   */
  delete(key: string): void {
    this.configs.delete(key);
    this.logger.debug(`配置删除: ${key}`);
  }

  /**
   * 订阅配置变更
   */
  subscribe(key: string, listener: ConfigChangeListener): () => void {
    const listeners = this.listeners.get(key) || [];
    listeners.push(listener);
    this.listeners.set(key, listeners);

    // 返回取消订阅函数
    return () => {
      const list = this.listeners.get(key) || [];
      const index = list.indexOf(listener);
      if (index !== -1) {
        list.splice(index, 1);
      }
    };
  }

  /**
   * 触发配置变更通知
   */
  private notifyListeners(key: string, value: any): void {
    const listeners = this.listeners.get(key) || [];
    listeners.forEach((listener) => {
      try {
        listener(key, value);
      } catch (error) {
        this.logger.error(`配置监听器执行失败: ${key}`, error);
      }
    });
  }

  /**
   * 获取所有配置（用于调试）
   */
  getAll(): Record<string, ConfigItem> {
    return Object.fromEntries(this.configs);
  }

  /**
   * 健康检查
   */
  healthCheck(): boolean {
    return this.configs.size > 0;
  }
}