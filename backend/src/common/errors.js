/**
 * 统一错误码体系 v2.0
 * @desc 跨后端统一错误码: 1000-9999
 *
 * 错误码分类:
 *   1xxx  - VALIDATION (参数校验)
 *   2xxx  - AUTH (认证授权)
 *   3xxx  - AGENT (Agent执行)
 *   4xxx  - RAG (知识检索)
 *   5xxx  - TOOL (工具调用)
 *   6xxx  - INTERNAL (系统级)
 */

const ErrorCode = {
  // ========== VALIDATION (1000-1999) ==========
  INVALID_PARAM: { code: 1000, status: 400, type: 'VALIDATION', message: '参数错误' },
  MISSING_PARAM: { code: 1001, status: 400, type: 'VALIDATION', message: '缺少必需参数' },
  INVALID_TYPE: { code: 1002, status: 400, type: 'VALIDATION', message: '参数类型错误' },
  INVALID_FORMAT: { code: 1003, status: 400, type: 'VALIDATION', message: '参数格式错误' },
  PARAM_OUT_OF_RANGE: { code: 1004, status: 400, type: 'VALIDATION', message: '参数超出范围' },
  VALIDATION_FAILED: { code: 1005, status: 400, type: 'VALIDATION', message: '校验失败' },
  INVALID_REQUEST_BODY: { code: 1100, status: 400, type: 'VALIDATION', message: '请求体格式错误' },
  INVALID_JSON: { code: 1101, status: 400, type: 'VALIDATION', message: 'JSON解析失败' },
  MISSING_HEADER: { code: 1102, status: 400, type: 'VALIDATION', message: '缺少必需请求头' },
  INVALID_HEADER: { code: 1103, status: 400, type: 'VALIDATION', message: '请求头格式错误' },

  // ========== AUTH (2000-2999) ==========
  UNAUTHORIZED: { code: 2000, status: 401, type: 'AUTH', message: '未授权访问' },
  INVALID_TOKEN: { code: 2001, status: 401, type: 'AUTH', message: '认证令牌无效' },
  TOKEN_EXPIRED: { code: 2002, status: 401, type: 'AUTH', message: '认证已过期' },
  TOKEN_MISSING: { code: 2003, status: 401, type: 'AUTH', message: '缺少认证令牌' },
  FORBIDDEN: { code: 2004, status: 403, type: 'AUTH', message: '无权限访问' },
  INSUFFICIENT_PERMISSION: { code: 2005, status: 403, type: 'AUTH', message: '权限不足' },
  API_KEY_INVALID: { code: 2100, status: 401, type: 'AUTH', message: 'API Key无效' },
  API_KEY_EXPIRED: { code: 2101, status: 401, type: 'AUTH', message: 'API Key已过期' },
  IP_NOT_ALLOWED: { code: 2102, status: 403, type: 'AUTH', message: 'IP地址不允许' },

  // ========== AGENT (3000-3999) ==========
  AGENT_ERROR: { code: 3000, status: 500, type: 'AGENT', message: 'Agent执行错误' },
  INTENT_CLASSIFY_FAILED: { code: 3001, status: 400, type: 'AGENT', message: '意图分类失败' },
  INTENT_UNSUPPORTED: { code: 3002, status: 400, type: 'AGENT', message: '不支持的意图类型' },
  ROUTING_FAILED: { code: 3003, status: 400, type: 'AGENT', message: '路由分发失败' },
  EXECUTION_TIMEOUT: { code: 3004, status: 504, type: 'AGENT', message: 'Agent执行超时' },
  MAX_TURNS_EXCEEDED: { code: 3005, status: 400, type: 'AGENT', message: '超出最大轮次' },
  SESSION_NOT_FOUND: { code: 3100, status: 404, type: 'AGENT', message: '会话不存在' },
  SESSION_EXPIRED: { code: 3101, status: 401, type: 'AGENT', message: '会话已过期' },
  SESSION_VERSION_CONFLICT: { code: 3102, status: 409, type: 'AGENT', message: '会话版本冲突' },
  MEMORY_ERROR: { code: 3200, status: 500, type: 'AGENT', message: '记忆系统错误' },
  MEMORY_SAVE_FAILED: { code: 3201, status: 500, type: 'AGENT', message: '记忆保存失败' },
  MEMORY_RECALL_FAILED: { code: 3202, status: 500, type: 'AGENT', message: '记忆召回失败' },
  CANCELLED: { code: 3300, status: 400, type: 'AGENT', message: '任务已取消' },
  ABORTED: { code: 3301, status: 400, type: 'AGENT', message: '任务已中止' },

  // ========== RAG (4000-4999) ==========
  RAG_ERROR: { code: 4000, status: 500, type: 'RAG', message: 'RAG系统错误' },
  QUERY_REWRITE_FAILED: { code: 4001, status: 400, type: 'RAG', message: '问题改写失败' },
  QUERY_DECOMPOSE_FAILED: { code: 4002, status: 400, type: 'RAG', message: '问题拆分失败' },
  RETRIEVAL_FAILED: { code: 4003, status: 500, type: 'RAG', message: '检索失败' },
  RERANK_FAILED: { code: 4004, status: 500, type: 'RAG', message: '重排序失败' },
  NO_RESULT: { code: 4005, status: 404, type: 'RAG', message: '检索无结果' },
  LOW_CONFIDENCE: { code: 4006, status: 400, type: 'RAG', message: '检索置信度低' },
  INGESTION_FAILED: { code: 4100, status: 500, type: 'RAG', message: '文档摄取失败' },
  PARSE_FAILED: { code: 4101, status: 400, type: 'RAG', message: '文档解析失败' },
  CHUNK_FAILED: { code: 4102, status: 500, type: 'RAG', message: '文档分块失败' },
  EMBEDDING_FAILED: { code: 4103, status: 500, type: 'RAG', message: '向量化失败' },
  INDEX_FAILED: { code: 4104, status: 500, type: 'RAG', message: '索引写入失败' },
  VECTOR_SEARCH_FAILED: { code: 4200, status: 500, type: 'RAG', message: '向量搜索失败' },
  KEYWORD_SEARCH_FAILED: { code: 4201, status: 500, type: 'RAG', message: '关键词搜索失败' },
  HYBRID_SEARCH_FAILED: { code: 4202, status: 500, type: 'RAG', message: '混合搜索失败' },
  COLLECTION_NOT_FOUND: { code: 4300, status: 404, type: 'RAG', message: '集合不存在' },
  COLLECTION_EXISTS: { code: 4301, status: 409, type: 'RAG', message: '集合已存在' },

  // ========== TOOL (5000-5999) ==========
  TOOL_ERROR: { code: 5000, status: 500, type: 'TOOL', message: '工具系统错误' },
  TOOL_NOT_FOUND: { code: 5001, status: 404, type: 'TOOL', message: '工具不存在' },
  TOOL_DISABLED: { code: 5002, status: 400, type: 'TOOL', message: '工具已禁用' },
  TOOL_EXEC_FAILED: { code: 5003, status: 500, type: 'TOOL', message: '工具执行失败' },
  TOOL_TIMEOUT: { code: 5004, status: 504, type: 'TOOL', message: '工具执行超时' },
  TOOL_PARAM_INVALID: { code: 5005, status: 400, type: 'TOOL', message: '工具参数无效' },
  TOOL_PARAM_MISSING: { code: 5006, status: 400, type: 'TOOL', message: '工具参数缺失' },
  TOOL_NO_IMPLEMENTATION: { code: 5007, status: 500, type: 'TOOL', message: '工具未实现' },
  MCP_ERROR: { code: 5100, status: 500, type: 'TOOL', message: 'MCP协议错误' },
  MCP_CONNECT_FAILED: { code: 5101, status: 500, type: 'TOOL', message: 'MCP连接失败' },
  MCP_REQUEST_FAILED: { code: 5102, status: 500, type: 'TOOL', message: 'MCP请求失败' },
  MCP_RESPONSE_INVALID: { code: 5103, status: 500, type: 'TOOL', message: 'MCP响应无效' },

  // ========== INTERNAL (6000-6999) ==========
  INTERNAL_ERROR: { code: 6000, status: 500, type: 'INTERNAL', message: '内部服务器错误' },
  SERVICE_UNAVAILABLE: { code: 6001, status: 503, type: 'INTERNAL', message: '服务不可用' },
  REQUEST_TIMEOUT: { code: 6002, status: 504, type: 'INTERNAL', message: '请求超时' },
  NETWORK_ERROR: { code: 6003, status: 502, type: 'INTERNAL', message: '网络错误' },
  NOT_FOUND: { code: 6004, status: 404, type: 'INTERNAL', message: '资源不存在' },
  METHOD_NOT_ALLOWED: { code: 6005, status: 405, type: 'INTERNAL', message: '方法不允许' },
  DATABASE_ERROR: { code: 6100, status: 500, type: 'INTERNAL', message: '数据库错误' },
  DB_CONNECTION_FAILED: { code: 6101, status: 503, type: 'INTERNAL', message: '数据库连接失败' },
  DB_QUERY_FAILED: { code: 6102, status: 500, type: 'INTERNAL', message: '数据库查询失败' },
  DB_WRITE_FAILED: { code: 6103, status: 500, type: 'INTERNAL', message: '数据库写入失败' },
  CACHE_ERROR: { code: 6200, status: 500, type: 'INTERNAL', message: '缓存错误' },
  REDIS_ERROR: { code: 6201, status: 500, type: 'INTERNAL', message: 'Redis错误' },
  REDIS_CONNECTION_FAILED: { code: 6202, status: 503, type: 'INTERNAL', message: 'Redis连接失败' },
  EXTERNAL_API_ERROR: { code: 6300, status: 502, type: 'INTERNAL', message: '外部API调用失败' },
  EXTERNAL_API_TIMEOUT: { code: 6301, status: 504, type: 'INTERNAL', message: '外部API超时' },
  MODEL_API_ERROR: { code: 6302, status: 502, type: 'INTERNAL', message: '模型API调用失败' },
  MODEL_API_TIMEOUT: { code: 6303, status: 504, type: 'INTERNAL', message: '模型API超时' },
  RATE_LIMIT_EXCEEDED: { code: 6400, status: 429, type: 'INTERNAL', message: '超出速率限制' },
  QUOTA_EXCEEDED: { code: 6401, status: 429, type: 'INTERNAL', message: '超出配额限制' },
  CIRCUIT_BREAKER_OPEN: { code: 6402, status: 503, type: 'INTERNAL', message: '熔断器已开启' },
  CONFIG_ERROR: { code: 6500, status: 500, type: 'INTERNAL', message: '配置错误' },
  CONFIG_NOT_FOUND: { code: 6501, status: 500, type: 'INTERNAL', message: '配置不存在' },
};

/**
 * 应用错误类
 * 支持结构化数字错误码 (1000-9999)
 */
class AppError extends Error {
  constructor(errorDef, details = {}) {
    const def = typeof errorDef === 'string'
      ? ErrorCode[errorDef] || ErrorCode.INTERNAL_ERROR
      : errorDef;

    super(def.message);
    this.name = 'AppError';
    this.code = def.code;
    this.status = def.status;
    this.type = def.type;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.requestId = null;
  }

  /**
   * 设置请求ID (用于链路追踪)
   */
  setRequestId(requestId) {
    this.requestId = requestId;
    return this;
  }

  /**
   * 判断是否为客户端错误 (4xx)
   */
  isClientError() {
    return this.status >= 400 && this.status < 500;
  }

  /**
   * 判断是否为服务器错误 (5xx)
   */
  isServerError() {
    return this.status >= 500 && this.status < 600;
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    const json = {
      code: this.code,
      type: this.type,
      message: this.message,
      timestamp: this.timestamp,
    };

    if (this.details && Object.keys(this.details).length > 0) {
      json.details = this.details;
    }

    if (this.requestId) {
      json.requestId = this.requestId;
    }

    if (process.env.NODE_ENV !== 'production' && this.stack) {
      json.stack = this.stack;
    }

    return json;
  }

  /**
   * 转换为 HTTP 响应格式
   */
  toHttpResponse() {
    return {
      success: false,
      error: this.toJSON(),
    };
  }
}

// ========== 工厂方法 ==========

const Errors = {
  // VALIDATION
  validation: (detail) => new AppError('VALIDATION_FAILED', { detail }),
  missingParam: (param) => new AppError('MISSING_PARAM', { param }),
  invalidParam: (param, reason) => new AppError('INVALID_PARAM', { param, reason }),

  // AUTH
  unauthorized: (message) => new AppError('UNAUTHORIZED', { message: message || '未授权访问' }),
  forbidden: (message) => new AppError('FORBIDDEN', { message: message || '无权限访问' }),
  tokenExpired: () => new AppError('TOKEN_EXPIRED'),
  tokenInvalid: () => new AppError('INVALID_TOKEN'),
  apiKeyInvalid: () => new AppError('API_KEY_INVALID'),

  // AGENT
  agentError: (message, details) => new AppError('AGENT_ERROR', { message, ...details }),
  sessionNotFound: () => new AppError('SESSION_NOT_FOUND'),
  sessionExpired: () => new AppError('SESSION_EXPIRED'),
  sessionConflict: () => new AppError('SESSION_VERSION_CONFLICT'),
  executionTimeout: () => new AppError('EXECUTION_TIMEOUT'),
  maxTurnsExceeded: () => new AppError('MAX_TURNS_EXCEEDED'),
  memoryError: (details) => new AppError('MEMORY_ERROR', details),
  cancelled: () => new AppError('CANCELLED'),

  // RAG
  ragError: (message, details) => new AppError('RAG_ERROR', { message, ...details }),
  retrievalFailed: (details) => new AppError('RETRIEVAL_FAILED', details),
  noResult: () => new AppError('NO_RESULT'),
  lowConfidence: (score) => new AppError('LOW_CONFIDENCE', { score }),
  ingestionFailed: (details) => new AppError('INGESTION_FAILED', details),
  collectionNotFound: () => new AppError('COLLECTION_NOT_FOUND'),
  collectionExists: () => new AppError('COLLECTION_EXISTS'),

  // TOOL
  toolNotFound: (tool) => new AppError('TOOL_NOT_FOUND', { tool }),
  toolExecError: (tool, reason) => new AppError('TOOL_EXEC_FAILED', { tool, reason }),
  toolTimeout: (tool) => new AppError('TOOL_TIMEOUT', { tool }),
  mcpError: (message) => new AppError('MCP_ERROR', { message }),

  // INTERNAL
  internal: (message) => new AppError('INTERNAL_ERROR', { message: message || '内部服务器错误' }),
  notFound: (resource) => new AppError('NOT_FOUND', { resource }),
  unavailable: (message) => new AppError('SERVICE_UNAVAILABLE', { message: message || '服务不可用' }),
  timeout: (message) => new AppError('REQUEST_TIMEOUT', { message: message || '请求超时' }),
  databaseError: (details) => new AppError('DATABASE_ERROR', details),
  redisError: (details) => new AppError('REDIS_ERROR', details),
  externalApiError: (api, details) => new AppError('EXTERNAL_API_ERROR', { api, ...details }),
  modelApiError: (details) => new AppError('MODEL_API_ERROR', details),
  rateLimit: () => new AppError('RATE_LIMIT_EXCEEDED'),
  circuitBreakerOpen: () => new AppError('CIRCUIT_BREAKER_OPEN'),
  configError: (key) => new AppError('CONFIG_ERROR', { key }),
};

/**
 * 创建错误的便捷方法
 * @param {string} errorName - ErrorCode 中的键名
 * @param {Object} details - 额外详情
 */
function createError(errorName, details = {}) {
  const errorDef = ErrorCode[errorName];
  if (!errorDef) {
    return new AppError('INTERNAL_ERROR', { originalError: errorName });
  }
  return new AppError(errorDef, details);
}

/**
 * 判断是否为 AppError
 */
function isAppError(err) {
  return err instanceof AppError;
}

/**
 * 安全包装 Promise
 * 如果失败，返回格式化错误
 */
async function safeAsync(fn, errorName = 'INTERNAL_ERROR') {
  try {
    return await fn();
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    console.error(`[SafeAsync] ${errorName}:`, err);
    throw createError(errorName, { message: err.message });
  }
}

module.exports = {
  ErrorCode,
  AppError,
  Errors,
  createError,
  isAppError,
  safeAsync,
};
