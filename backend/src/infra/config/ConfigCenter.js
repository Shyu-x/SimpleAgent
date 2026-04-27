/**
 * ConfigCenter - 配置中心
 *
 * 功能：
 * - 集中化配置管理
 * - 配置热更新
 * - 配置验证
 * - 配置变更监听
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');

class ConfigCenter extends EventEmitter {
  constructor(options = {}) {
    super();

    this.configDir = options.configDir || path.join(process.cwd(), 'config');
    this.configs = new Map();
    this.watchers = new Map();
    this.validationRules = new Map();
    this.enableHotReload = options.enableHotReload !== false;

    // 默认配置
    this.defaults = {
      model: {
        provider: 'minimax',
        defaultModel: 'MiniMax-M2.7',
        timeout: 120000,
        retries: 3,
        maxTokens: 100000
      },
      rag: {
        chunkSize: 512,
        topK: 5,
        rerankEnabled: true,
        embeddingModel: 'mxbai-embed-large'
      },
      agent: {
        maxIterations: 10,
        thinkingTimeout: 30000,
        enableHistory: true,
        memoryType: 'semantic'
      },
      rateLimit: {
        global: 100,
        perUser: 20,
        windowMs: 60000
      }
    };

    // 初始化
    this._init();
  }

  async _init() {
    // 加载所有配置
    await this.loadAll();

    // 启动热更新监听
    if (this.enableHotReload) {
      this._startWatching();
    }
  }

  /**
   * 加载所有配置
   */
  async loadAll() {
    const configTypes = ['model', 'rag', 'agent', 'rateLimit', 'system'];

    for (const type of configTypes) {
      await this.load(type);
    }

    return this.configs;
  }

  /**
   * 加载指定类型的配置
   */
  async load(configType) {
    try {
      const filePath = path.join(this.configDir, `${configType}.json`);

      // 读取配置文件
      let config;
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        config = JSON.parse(content);
      } catch (error) {
        // 文件不存在，使用默认值
        config = this.defaults[configType] || {};
      }

      // 合并默认值
      config = this._mergeDefaults(config, this.defaults[configType]);

      // 验证配置
      if (this.validationRules.has(configType)) {
        config = this._validate(config, this.validationRules.get(configType));
      }

      // 应用环境变量覆盖
      config = this._applyEnvOverrides(config, configType);

      // 存储配置
      this.configs.set(configType, config);

      this.emit('configLoaded', { type: configType, config });

      return config;
    } catch (error) {
      this.emit('configError', { type: configType, error: error.message });
      return this.defaults[configType] || {};
    }
  }

  /**
   * 获取配置
   */
  get(key, defaultValue = undefined) {
    const [configType, ...path] = key.split('.');

    const config = this.configs.get(configType);
    if (!config) {
      return defaultValue;
    }

    // 支持嵌套路径
    if (path.length === 0) {
      return config;
    }

    let value = config;
    for (const k of path) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * 设置配置（运行时）
   */
  set(key, value) {
    const [configType, ...path] = key.split('.');

    if (!this.configs.has(configType)) {
      this.configs.set(configType, {});
    }

    const config = this.configs.get(configType);

    // 设置嵌套值
    if (path.length === 0) {
      this.configs.set(configType, value);
    } else {
      let target = config;
      for (let i = 0; i < path.length - 1; i++) {
        if (!(path[i] in target)) {
          target[path[i]] = {};
        }
        target = target[path[i]];
      }
      target[path[path.length - 1]] = value;
      this.configs.set(configType, config);
    }
    this.emit('configChanged', { key, value, type: configType });
  }

  /**
   * 监听配置变化
   */
  watch(key, callback) {
    const wrappedCallback = (change) => {
      if (this._matchesKey(change.key, key)) {
        callback(change.value, change);
      }
    };

    this.on('configChanged', wrappedCallback);
    this.watchers.set(key, wrappedCallback);

    // 返回取消监听函数
    return () => {
      this.off('configChanged', wrappedCallback);
      this.watchers.delete(key);
    };
  }

  /**
   * 检查key是否匹配
   */
  _matchesKey(changedKey, watchedKey) {
    if (watchedKey === '*') return true;
    if (watchedKey.endsWith('.*')) {
      return changedKey.startsWith(watchedKey.slice(0, -1));
    }
    return changedKey === watchedKey || changedKey.startsWith(watchedKey + '.');
  }

  /**
   * 重新加载配置
   */
  async reload(configType = null) {
    if (configType) {
      return this.load(configType);
    }
    return this.loadAll();
  }

  /**
   * 获取所有配置（快照）
   */
  getAll() {
    const snapshot = {};
    for (const [type, config] of this.configs) {
      snapshot[type] = { ...config };
    }
    return snapshot;
  }

  /**
   * 注册验证规则
   */
  registerValidation(configType, rules) {
    this.validationRules.set(configType, rules);
  }

  /**
   * 验证配置
   */
  _validate(config, rules) {
    if (!rules) return config;

    // 简化验证：检查必需字段
    if (rules.required) {
      for (const field of rules.required) {
        if (!(field in config)) {
          throw new Error(`配置缺少必需字段: ${field}`);
        }
      }
    }

    // 类型验证
    if (rules.types) {
      for (const [field, expectedType] of Object.entries(rules.types)) {
        if (field in config && typeof config[field] !== expectedType) {
          throw new Error(`配置字段 ${field} 类型错误，期望 ${expectedType}`);
        }
      }
    }

    // 范围验证
    if (rules.range) {
      for (const [field, { min, max }] of Object.entries(rules.range)) {
        if (field in config) {
          const value = config[field];
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

  /**
   * 合并默认值
   */
  _mergeDefaults(config, defaults) {
    if (!defaults) return config;
    if (!config) return defaults;

    const merged = { ...defaults };

    for (const [key, value] of Object.entries(config)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = this._mergeDefaults(value, defaults[key]);
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * 应用环境变量覆盖
   */
  _applyEnvOverrides(config, configType) {
    const envPrefix = `${configType.toUpperCase()}_`;

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(envPrefix)) {
        const configKey = key.slice(envPrefix.toLowerCase()).toLowerCase();
        const parsedValue = this._parseEnvValue(value);

        // 支持嵌套
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

  /**
   * 解析环境变量值
   */
  _parseEnvValue(value) {
    // 布尔值
    if (value === 'true') return true;
    if (value === 'false') return false;

    // 数字
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);

    // JSON对象
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        // 解析失败，返回原字符串
      }
    }

    return value;
  }

  /**
   * 启动文件监听
   */
  async _startWatching() {
    try {
      await fs.mkdir(this.configDir, { recursive: true });

      const watcher = fs.watch(this.configDir, async (eventType, filename) => {
        if (filename && filename.endsWith('.json')) {
          const configType = filename.replace('.json', '');
          await this.load(configType);
          this.emit('fileChanged', { type: configType, filename });
        }
      });

      this._watcher = watcher;
    } catch (error) {
      console.warn('配置热更新监听启动失败:', error.message);
    }
  }

  /**
   * 停止文件监听
   */
  stopWatching() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
  }

  /**
   * 导出配置到文件
   */
  async exportToFile(configType, filePath = null) {
    const config = this.configs.get(configType);
    if (!config) {
      throw new Error(`配置类型 ${configType} 不存在`);
    }

    const outputPath = filePath || path.join(this.configDir, `${configType}.json`);
    await fs.writeFile(outputPath, JSON.stringify(config, null, 2), 'utf-8');

    return outputPath;
  }

  /**
   * 销毁
   */
  destroy() {
    this.stopWatching();
    this.removeAllListeners();
    this.configs.clear();
    this.watchers.clear();
  }
}

// 单例
let instance = null;

function getConfigCenter(options = {}) {
  if (!instance) {
    instance = new ConfigCenter(options);
  }
  return instance;
}

module.exports = {
  ConfigCenter,
  getConfigCenter
};
