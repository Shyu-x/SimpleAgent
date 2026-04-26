import { Injectable } from '@nestjs/common';

/**
 * 检索通道接口
 */
export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * 通道配置接口
 */
export interface ChannelConfig {
  name?: string;
  weight?: number;
  enabled?: boolean;
  timeout?: number;
  maxResults?: number;
  failureThreshold?: number;
}

/**
 * 检索通道接口 (供 SearchCoordinator 使用)
 */
export interface ISearchChannel {
  name: string;
  weight: number;
  enabled: boolean;
  search(query: string, options?: Record<string, any>): Promise<SearchResult[]>;
  searchWithTimeout(query: string, options?: Record<string, any>): Promise<SearchResult[]>;
  getType(): string;
  isHealthy(): boolean;
  setEnabled(enabled: boolean): void;
  getInfo(): { name: string; type: string; weight: number; enabled: boolean; healthy: boolean; failureCount: number };
}

/**
 * 检索通道抽象基类
 *
 * 设计理念：
 * - 策略模式：每种检索方式（向量/关键词）实现统一接口
 * - 可插拔架构：支持动态添加/移除检索通道
 *
 * 企业级要点：
 * - 子类只需关注检索逻辑，通用能力（超时、重试、限流）由基类提供
 * - 健康检查机制支持模型故障自动隔离
 */
@Injectable()
export class SearchChannelService {
  protected name: string;
  protected weight: number;
  protected enabled: boolean;
  protected timeout: number;
  protected maxResults: number;
  protected _healthy: boolean = true;
  protected _lastHealthCheck: number | null = null;
  protected _failureCount: number = 0;
  protected _failureThreshold: number = 5;

  constructor(config: ChannelConfig = {}) {
    this.name = config.name || 'base_channel';
    this.weight = config.weight || 1.0;
    this.enabled = config.enabled !== false;
    this.timeout = config.timeout || 30000;
    this.maxResults = config.maxResults || 10;
    this._failureThreshold = config.failureThreshold || 5;
  }

  /**
   * 执行检索 - 子类必须实现
   */
  async search(query: string, options: Record<string, any> = {}): Promise<SearchResult[]> {
    throw new Error('search() must be implemented by subclass');
  }

  /**
   * 获取通道类型标识
   */
  getType(): string {
    return 'base';
  }

  /**
   * 健康检查
   */
  isHealthy(): boolean {
    if (this._lastHealthCheck) {
      const elapsed = Date.now() - this._lastHealthCheck;
      if (elapsed > 5 * 60 * 1000 && this._failureCount >= this._failureThreshold) {
        this._healthy = false;
      }
    }
    return this._healthy;
  }

  /**
   * 记录成功
   */
  recordSuccess(): void {
    this._failureCount = 0;
    this._healthy = true;
    this._lastHealthCheck = Date.now();
  }

  /**
   * 记录失败
   */
  recordFailure(): void {
    this._failureCount++;
    this._lastHealthCheck = Date.now();
    if (this._failureCount >= this._failureThreshold) {
      this._healthy = false;
    }
  }

  /**
   * 启用/禁用通道
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 带超时的检索包装
   */
  async searchWithTimeout(query: string, options: Record<string, any> = {}): Promise<SearchResult[]> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Search channel ${this.name} timeout`)), this.timeout);
    });

    try {
      const result = await Promise.race([this.search(query, options), timeoutPromise]);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * 获取通道元信息
   */
  getInfo() {
    return {
      name: this.name,
      type: this.getType(),
      weight: this.weight,
      enabled: this.enabled,
      healthy: this.isHealthy(),
      failureCount: this._failureCount,
    };
  }
}

/**
 * 向量检索通道
 */
@Injectable()
export class VectorSearchChannelService extends SearchChannelService {
  constructor(config: ChannelConfig = {}) {
    super({ ...config, name: config.name || 'vector_channel' });
  }

  getType(): string {
    return 'vector';
  }

  async search(query: string, options: Record<string, any> = {}): Promise<SearchResult[]> {
    // 向量检索实现
    return [];
  }
}

/**
 * 关键词检索通道
 */
@Injectable()
export class KeywordSearchChannelService extends SearchChannelService {
  constructor(config: ChannelConfig = {}) {
    super({ ...config, name: config.name || 'keyword_channel' });
  }

  getType(): string {
    return 'keyword';
  }

  async search(query: string, options: Record<string, any> = {}): Promise<SearchResult[]> {
    // 关键词检索实现
    return [];
  }
}
