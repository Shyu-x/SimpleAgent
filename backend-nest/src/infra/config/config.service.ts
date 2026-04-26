/**
 * Config Service - 配置中心服务
 * @description 集中化配置管理、配置热更新、配置验证、配置变更监听
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as fsCallback from 'fs';
import * as path from 'path';

export interface ConfigOptions {
  configDir?: string;
  enableHotReload?: boolean;
}

@Injectable()
export class ConfigService extends EventEmitter implements OnModuleInit {
  private configDir: string;
  private configs = new Map<string, any>();
  private watchers = new Map<string, any>();
  private validationRules = new Map<string, any>();
  private enableHotReload: boolean;
  private watcher: any;

  private readonly defaults: Record<string, any> = {
    model: {
      provider: 'minimax',
      defaultModel: 'MiniMax-M2.7',
      timeout: 120000,
      retries: 3,
      maxTokens: 100000,
    },
    rag: {
      chunkSize: 512,
      topK: 5,
      rerankEnabled: true,
      embeddingModel: 'mxbai-embed-large',
    },
    agent: {
      maxIterations: 10,
      thinkingTimeout: 30000,
      enableHistory: true,
      memoryType: 'semantic',
    },
    rateLimit: {
      global: 100,
      perUser: 20,
      windowMs: 60000,
    },
  };

  constructor(options: ConfigOptions = {}) {
    super();
    this.configDir = options.configDir || path.join(process.cwd(), 'config');
    this.enableHotReload = options.enableHotReload !== false;
  }

  async onModuleInit() {
    await this.loadAll();
    if (this.enableHotReload) {
      await this.startWatching();
    }
  }

  async loadAll(): Promise<Map<string, any>> {
    const configTypes = ['model', 'rag', 'agent', 'rateLimit', 'system'];
    for (const type of configTypes) {
      await this.load(type);
    }
    return this.configs;
  }

  async load(configType: string): Promise<any> {
    try {
      const filePath = path.join(this.configDir, `${configType}.json`);
      let config: any;

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        config = JSON.parse(content);
      } catch {
        config = this.defaults[configType] || {};
      }

      config = this.mergeDefaults(config, this.defaults[configType]);

      if (this.validationRules.has(configType)) {
        config = this.validate(config, this.validationRules.get(configType));
      }

      config = this.applyEnvOverrides(config, configType);
      this.configs.set(configType, config);
      this.emit('configLoaded', { type: configType, config });
      return config;
    } catch (error) {
      this.emit('configError', { type: configType, error: (error as Error).message });
      return this.defaults[configType] || {};
    }
  }

  get(key: string, defaultValue: any = undefined): any {
    const [configType, ...keyParts] = key.split('.');
    const config = this.configs.get(configType);
    if (!config) return defaultValue;

    if (keyParts.length === 0) return config;

    let value = config;
    for (const k of keyParts) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    return value;
  }

  set(key: string, value: any): void {
    const [configType, ...keyParts] = key.split('.');

    if (!this.configs.has(configType)) {
      this.configs.set(configType, {});
    }

    const config = this.configs.get(configType);

    if (keyParts.length === 0) {
      this.configs.set(configType, value);
    } else {
      let target = config;
      for (let i = 0; i < keyParts.length - 1; i++) {
        if (!(keyParts[i] in target)) {
          target[keyParts[i]] = {};
        }
        target = target[keyParts[i]];
      }
      target[keyParts[keyParts.length - 1]] = value;
    }

    this.emit('configChanged', { key, value, type: configType });
  }

  watch(key: string, callback: (value: any, change: any) => void): () => void {
    const wrappedCallback = (change: any) => {
      if (this.matchesKey(change.key, key)) {
        callback(change.value, change);
      }
    };
    this.on('configChanged', wrappedCallback);
    this.watchers.set(key, wrappedCallback);
    return () => {
      this.off('configChanged', wrappedCallback);
      this.watchers.delete(key);
    };
  }

  private matchesKey(changedKey: string, watchedKey: string): boolean {
    if (watchedKey === '*') return true;
    if (watchedKey.endsWith('.*')) {
      return changedKey.startsWith(watchedKey.slice(0, -1));
    }
    return changedKey === watchedKey || changedKey.startsWith(watchedKey + '.');
  }

  async reload(configType?: string): Promise<any> {
    if (configType) return this.load(configType);
    return this.loadAll();
  }

  getAll(): Record<string, any> {
    const snapshot: Record<string, any> = {};
    for (const [type, config] of this.configs) {
      snapshot[type] = { ...config };
    }
    return snapshot;
  }

  registerValidation(configType: string, rules: any): void {
    this.validationRules.set(configType, rules);
  }

  private validate(config: any, rules: any): any {
    if (!rules) return config;

    if (rules.required) {
      for (const field of rules.required) {
        if (!(field in config)) {
          throw new Error(`配置缺少必需字段: ${field}`);
        }
      }
    }

    if (rules.types) {
      for (const [field, expectedType] of Object.entries(rules.types)) {
        if (field in config && typeof config[field] !== expectedType) {
          throw new Error(`配置字段 ${field} 类型错误，期望 ${expectedType}`);
        }
      }
    }

    if (rules.range) {
      for (const [field, range] of Object.entries(rules.range)) {
        if (field in config) {
          const value = config[field];
          const { min, max } = range as { min?: number; max?: number };
          if (min !== undefined && value < min) {
            throw new Error(`配置字段 ${field} 小于最小值 ${min}`);
          }
          if (max !== undefined && value > max) {
            throw new Error(`配置字段 ${field} 大于最大值 ${max}`);
          }
        }
      }
    }

    return config;
  }

  private mergeDefaults(config: any, defaults: any): any {
    if (!defaults) return config;
    if (!config) return defaults;

    const merged = { ...defaults };
    for (const [key, value] of Object.entries(config)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = this.mergeDefaults(value, defaults[key]);
      } else {
        merged[key] = value;
      }
    }
    return merged;
  }

  private applyEnvOverrides(config: any, configType: string): any {
    const envPrefix = `${configType.toUpperCase()}_`;

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(envPrefix)) {
        const configKey = key.slice(envPrefix.length).toLowerCase();
        const parsedValue = this.parseEnvValue(value as string);

        const keys = configKey.split('_');
        let target = config;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!(keys[i] in target)) {
            target[keys[i]] = {};
          }
          target = target[keys[i]];
        }
        target[keys[keys.length - 1]] = parsedValue;
      }
    }

    return config;
  }

  private parseEnvValue(value: string): any {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {}
    }
    return value;
  }

  private async startWatching(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });

      const watcher = fsCallback.watch(this.configDir, (eventType: string, filename: Buffer | string | null) => {
        if (filename) {
          const name = typeof filename === 'string' ? filename : filename.toString();
          if (name.endsWith('.json')) {
            const configType = name.replace('.json', '');
            this.load(configType).catch(err => console.warn('配置重新加载失败:', err));
            this.emit('fileChanged', { type: configType, filename: name });
          }
        }
      });

      this.watcher = watcher;
    } catch (error) {
      console.warn('配置热更新监听启动失败:', (error as Error).message);
    }
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  async exportToFile(configType: string, filePath?: string): Promise<string> {
    const config = this.configs.get(configType);
    if (!config) {
      throw new Error(`配置类型 ${configType} 不存在`);
    }

    const outputPath = filePath || path.join(this.configDir, `${configType}.json`);
    await fs.writeFile(outputPath, JSON.stringify(config, null, 2), 'utf-8');
    return outputPath;
  }

  destroy(): void {
    this.stopWatching();
    this.removeAllListeners();
    this.configs.clear();
    this.watchers.clear();
  }
}
