/**
 * 统一配置中心 - Unified Configuration Center
 *
 * 架构：分层配置 (defaults → env → runtime)
 *
 * @module config
 * @version 1.0.0
 * @date 2026-03-21
 */

/**
 * 默认配置 - 所有配置的默认值
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  AppError: require('../common/errors/AppError'),
  /**
   * 模型配置
   * @property {string} provider - 模型提供商 (minimax/openai/anthropic等)
   * @property {string} defaultModel - 默认模型名称
   * @property {number} timeout - 请求超时时间(ms)
   * @property {number} retries - 最大重试次数
   * @property {number} maxTokens - 最大输出Token
   */
  model: {
    provider: process.env.MINIMAX_PROVIDER || 'minimax',
    defaultModel: process.env.MINIMAX_DEFAULT_MODEL || 'MiniMax-M2.7',
    timeout: parseInt(process.env.MODEL_TIMEOUT, 10) || 120000,
    retries: parseInt(process.env.MODEL_RETRIES, 10) || 3,
    maxTokens: parseInt(process.env.MODEL_MAX_TOKENS, 10) || 100000,
  },

  /**
   * 工具配置
   * @property {string[]} enabled - 启用的工具列表
   * @property {number} timeout - 工具执行超时(ms)
   * @property {Object} defaults - 工具默认参数
   * @property {boolean} defaults.autoRetry - 自动重试
   * @property {number} defaults.maxConcurrent - 最大并发数
   */
  tools: {
    enabled: [
      'browser',
      'code',
      'file',
      'websearch',
      'mcp',
      'rag',
    ],
    timeout: parseInt(process.env.TOOL_TIMEOUT, 10) || 60000,
    defaults: {
      autoRetry: true,
      maxConcurrent: 5,
    },
  },

  /**
   * RAG知识库配置
   * @property {number} chunkSize - 文档分块大小
   * @property {number} topK - 检索返回数量
   * @property {boolean} rerankEnabled - 是否启用重排序
   * @property {string} embeddingModel - 嵌入模型
   */
  rag: {
    chunkSize: parseInt(process.env.RAG_CHUNK_SIZE, 10) || 512,
    topK: parseInt(process.env.RAG_TOP_K, 10) || 5,
    rerankEnabled: process.env.RAG_RERANK !== 'false',
    // 注意：向量存储使用内存模式（simpleVectorize），如需更精确的语义搜索可配置外部 embedding 服务
    embeddingModel: process.env.RAG_EMBEDDING_MODEL || 'simple',
  },

  /**
   * 限流与资源限制配置
   * @property {number} rateLimit - 全局限流(请求/分钟)
   * @property {number} concurrency - 最大并发数
   * @property {number} tokenBudget - Token预算
   * @property {number} maxMemoryMB - 最大内存使用(MB)
   */
  limits: {
    rateLimit: parseInt(process.env.RATE_LIMIT, 10) || 100,
    concurrency: parseInt(process.env.MAX_CONCURRENCY, 10) || 50,
    tokenBudget: parseInt(process.env.TOKEN_BUDGET, 10) || 1000000,
    maxMemoryMB: parseInt(process.env.MAX_MEMORY_MB, 10) || 512,
  },

  /**
   * Agent配置
   * @property {number} maxIterations - 最大迭代次数
   * @property {number} thinkingTimeout - 思考超时(ms)
   * @property {boolean} enableHistory - 启用历史记录
   * @property {string} memoryType - 记忆类型 (semantic/file/session)
   */
  agent: {
    maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS, 10) || 10,
    thinkingTimeout: parseInt(process.env.AGENT_THINKING_TIMEOUT, 10) || 30000,
    enableHistory: process.env.AGENT_ENABLE_HISTORY !== 'false',
    memoryType: process.env.AGENT_MEMORY_TYPE || 'semantic',
  },

  /**
   * A2A Agent协作配置
   * @property {number} heartbeatInterval - 心跳间隔(ms)
   * @property {number} heartbeatTimeout - 心跳超时(ms)
   * @property {string} registryUrl - Agent注册中心URL
   */
  a2a: {
    heartbeatInterval: parseInt(process.env.A2A_HEARTBEAT_INTERVAL, 10) || 30000,
    heartbeatTimeout: parseInt(process.env.A2A_HEARTBEAT_TIMEOUT, 10) || 90000,
    registryUrl: process.env.A2A_REGISTRY_URL || 'http://localhost:30000/api/a2a/agents',
  },

  /**
   * HITL人机协作配置
   * @property {number} confirmTimeout - 确认超时(秒)
   * @property {string[]} dangerOperations - 危险操作列表
   */
  hitl: {
    confirmTimeout: parseInt(process.env.HITL_CONFIRM_TIMEOUT, 10) || 60,
    dangerOperations: [
      'file:delete',
      'file:format',
      'db:drop',
      'db:truncate',
      'batch:overwrite',
    ],
  },

  /**
   * 日志配置
   * @property {string} level - 日志级别 (debug/info/warn/error)
   * @property {string} format - 日志格式 (json/simple)
   * @property {boolean} console - 是否输出到控制台
   */
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    console: process.env.LOG_CONSOLE !== 'false',
  },

  /**
   * 安全配置
   * @property {string[]} allowedOrigins - 允许的来源
   * @property {number} maxRequestSize - 最大请求大小(字节)
   * @property {boolean} enableCors - 启用CORS
   */
  security: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:8080').split(','),
    maxRequestSize: parseInt(process.env.MAX_REQUEST_SIZE, 10) || 10 * 1024 * 1024,
    enableCors: process.env.ENABLE_CORS !== 'false',
  },
};

/**
 * 必需配置项 - 启动时必须检查
 * @type {Array<{key: string, message: string}>}
 */
const REQUIRED_CONFIG = [
  { key: 'model.provider', message: '模型提供商未配置' },
  { key: 'model.defaultModel', message: '默认模型未配置' },
];

/**
 * 运行时配置存储
 * @type {Object}
 */
let runtimeConfig = {};

/**
 * 深度合并配置对象
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的对象
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * 获取嵌套配置值
 * @param {Object} obj - 配置对象
 * @param {string} path - 配置路径 (如 'model.provider')
 * @returns {*} 配置值
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * 设置嵌套配置值
 * @param {Object} obj - 配置对象
 * @param {string} path - 配置路径
 * @param {*} value - 配置值
 */
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

/**
 * 验证配置完整性
 * @throws {Error} 如果必需配置缺失
 */
function validateConfig() {
  const errors = [];

  for (const { key, message } of REQUIRED_CONFIG) {
    const value = getNestedValue(runtimeConfig, key);
    if (value === undefined || value === null || value === '') {
      errors.push(`[配置验证] ${message} (${key})`);
    }
  }

  if (errors.length > 0) {
    const errorMsg = errors.join('\n');
    console.error(`统一配置中心验证失败:\n${errorMsg}`);
    throw this.AppError.validationError('config', `配置验证失败:\n${errorMsg}`);
  }

  return true;
}

/**
 * 创建统一配置中心实例
 * @returns {Object} 配置中心API
 */
function createConfigCenter() {
  // 初始化运行时配置
  runtimeConfig = deepMerge({}, DEFAULT_CONFIG);

  return {
    /**
     * 获取当前配置副本
     * @returns {Object} 当前配置
     */
    getAll() {
      return deepMerge({}, runtimeConfig);
    },

    /**
     * 获取指定配置项
     * @param {string} path - 配置路径 (如 'model.provider')
     * @param {*} defaultValue - 默认值
     * @returns {*} 配置值
     */
    get(path, defaultValue = undefined) {
      const value = getNestedValue(runtimeConfig, path);
      return value !== undefined ? value : defaultValue;
    },

    /**
     * 设置运行时配置
     * @param {string|Object} pathOrUpdates - 配置路径或配置对象
     * @param {*} value - 配置值 (如果path是字符串)
     * @returns {Object} this (支持链式调用)
     */
    set(pathOrUpdates, value) {
      if (typeof pathOrUpdates === 'object') {
        runtimeConfig = deepMerge(runtimeConfig, pathOrUpdates);
      } else {
        setNestedValue(runtimeConfig, pathOrUpdates, value);
      }
      return this;
    },

    /**
     * 重置配置到默认
     */
    reset() {
      runtimeConfig = deepMerge({}, DEFAULT_CONFIG);
    },

    /**
     * 获取配置片段
     * @param {string} section - 配置段落 (如 'model', 'tools')
     * @returns {Object} 配置段落
     */
    getSection(section) {
      return runtimeConfig[section] ? deepMerge({}, runtimeConfig[section]) : undefined;
    },

    /**
     * 验证配置
     * @returns {boolean} 验证是否通过
     */
    validate() {
      return validateConfig();
    },

    /**
     * 获取配置文档
     * @returns {Object} 配置项说明
     */
    getDocumentation() {
      return {
        description: '统一配置中心 - 分层配置 (defaults → env → runtime)',
        sections: {
          model: '模型配置: provider, defaultModel, timeout, retries, maxTokens',
          tools: '工具配置: enabled[], timeout, defaults',
          rag: 'RAG配置: chunkSize, topK, rerankEnabled, embeddingModel',
          limits: '限制配置: rateLimit, concurrency, tokenBudget, maxMemoryMB',
          agent: 'Agent配置: maxIterations, thinkingTimeout, enableHistory, memoryType',
          a2a: 'A2A配置: heartbeatInterval, heartbeatTimeout, registryUrl',
          hitl: 'HITL配置: confirmTimeout, dangerOperations',
          logging: '日志配置: level, format, console',
          security: '安全配置: allowedOrigins, maxRequestSize, enableCors',
        },
        usage: [
          'const config = require("./config").getInstance();',
          'config.get("model.defaultModel");',
          'config.get("limits.rateLimit");',
          'config.set("model.timeout", 60000);',
        ],
      };
    },

    /**
     * 获取默认配置
     * @returns {Object} 默认配置
     */
    getDefaults() {
      return deepMerge({}, DEFAULT_CONFIG);
    },
  };
}

// 导出单例
const config = createConfigCenter();

module.exports = config;
