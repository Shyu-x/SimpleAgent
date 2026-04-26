/**
 * 统一错误类 - 企业级错误码体系 v2.0
 * @desc 支持结构化数字错误码 (1000-9999)、HTTP状态码、错误分类
 * @version 2.0.0 (2026-04-06)
 */

class AppError extends Error {
  /**
   * 错误码定义 (1000-9999)
   * 格式: 数字错误码
   * 分类:
   *   1xxx  - VALIDATION (参数校验)
   *   2xxx  - AUTH (认证授权)
   *   3xxx  - AGENT (Agent执行)
   *   4xxx  - RAG (知识检索)
   *   5xxx  - TOOL (工具调用)
   *   6xxx  - INTERNAL (系统级)
   */
  static CODES = {
    // ========== VALIDATION (1000-1999) ==========
    // 通用参数错误
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
   * 错误码到类型映射 (用于旧码兼容)
   */
  static CODE_TYPE_MAP = {
    'SYS': 'INTERNAL',
    'VAL': 'VALIDATION',
    'AUTH': 'AUTH',
    'RATE': 'INTERNAL',
    'BIZ': 'AGENT',
    'EXT': 'INTERNAL',
    'TOOL': 'TOOL',
  };

  /**
   * @param {number|string|object} codeOrConfig - 错误码或配置对象
   * @param {string} [message] - 自定义错误消息
   * @param {object} [details] - 额外详细信息
   */
  constructor(codeOrConfig, message = null, details = null) {
    super();

    if (typeof codeOrConfig === 'number') {
      // 数字错误码查表
      const errorDef = this._findCodeDef(codeOrConfig) || AppError.CODES.INTERNAL_ERROR;
      this.code = errorDef.code;
      this.status = errorDef.status;
      this.type = errorDef.type;
      this.message = message || errorDef.message;
    } else if (typeof codeOrConfig === 'string') {
      // 字符串错误码 (兼容旧版)
      const errorDef = AppError.CODES[codeOrConfig] || AppError.CODES.INTERNAL_ERROR;
      this.code = errorDef.code;
      this.status = errorDef.status;
      this.type = errorDef.type;
      this.message = message || errorDef.message;
    } else if (typeof codeOrConfig === 'object') {
      this.code = codeOrConfig.code || 6000;
      this.status = codeOrConfig.status || 500;
      this.type = codeOrConfig.type || 'INTERNAL';
      this.message = codeOrConfig.message || '内部服务器错误';
    } else {
      this.code = 6000;
      this.status = 500;
      this.type = 'INTERNAL';
      this.message = '内部服务器错误';
    }

    this.name = 'AppError';
    this.details = details || null;
    this.timestamp = new Date().toISOString();
    this.requestId = null;

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * 根据错误码查找定义
   * @param {number} code
   * @returns {object|null}
   */
  _findCodeDef(code) {
    const entries = Object.entries(AppError.CODES);
    for (const [key, def] of entries) {
      if (def.code === code) {
        return def;
      }
    }
    return null;
  }

  /**
   * 设置请求ID (用于链路追踪)
   * @param {string} requestId
   * @returns {AppError}
   */
  setRequestId(requestId) {
    this.requestId = requestId;
    return this;
  }

  /**
   * 添加错误详情
   * @param {object} details
   * @returns {AppError}
   */
  addDetails(details) {
    this.details = { ...this.details, ...details };
    return this;
  }

  /**
   * 转换为 JSON (用于日志/响应)
   * @returns {object}
   */
  toJSON() {
    const json = {
      code: this.code,
      type: this.type,
      message: this.message,
      timestamp: this.timestamp,
    };

    if (this.details) {
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
   * @returns {object}
   */
  toResponse() {
    return {
      success: false,
      error: this.toJSON(),
    };
  }

  /**
   * 判断是否为客户端错误 (4xx)
   * @returns {boolean}
   */
  isClientError() {
    return this.status >= 400 && this.status < 500;
  }

  /**
   * 判断是否为服务端错误 (5xx)
   * @returns {boolean}
   */
  isServerError() {
    return this.status >= 500 && this.status < 600;
  }

  /**
   * 从原始错误创建 AppError
   * @param {Error} err
   * @param {string|number} [defaultCode]
   * @returns {AppError}
   */
  static fromError(err, defaultCode = 6000) {
    if (err instanceof AppError) {
      return err;
    }

    const code = typeof defaultCode === 'number' ? defaultCode :
      (AppError.CODES[defaultCode]?.code || 6000);
    const errorDef = AppError.CODES.INTERNAL_ERROR;
    const appError = new AppError(code, err.message || errorDef.message);
    appError.stack = err.stack;
    return appError;
  }

  // ========== 工厂方法 ==========

  /**
   * 创建参数校验错误
   * @param {string} paramName
   * @param {string} [reason]
   * @returns {AppError}
   */
  static validationError(paramName, reason) {
    return new AppError(AppError.CODES.MISSING_PARAM.code, reason || `缺少必需参数: ${paramName}`);
  }

  /**
   * 创建资源不存在错误
   * @param {string} resource
   * @returns {AppError}
   */
  static notFound(resource = '资源') {
    return new AppError(AppError.CODES.NOT_FOUND.code, `${resource}不存在`);
  }

  /**
   * 创建认证错误
   * @param {string} [message]
   * @returns {AppError}
   */
  static unauthorized(message) {
    return new AppError(AppError.CODES.UNAUTHORIZED.code, message || '未授权访问');
  }

  /**
   * 创建速率限制错误
   * @param {string} [message]
   * @returns {AppError}
   */
  static rateLimit(message) {
    return new AppError(AppError.CODES.RATE_LIMIT_EXCEEDED.code, message || '请求过于频繁');
  }

  // ========== 域特定工厂方法 ==========

  /**
   * 创建 Agent 错误
   * @param {string|number} codeOrName
   * @param {string} [message]
   * @returns {AppError}
   */
  static agentError(codeOrName, message) {
    const code = typeof codeOrName === 'number' ? codeOrName :
      (AppError.CODES[codeOrName]?.code || AppError.CODES.AGENT_ERROR.code);
    return new AppError(code, message || AppError.CODES.AGENT_ERROR.message);
  }

  /**
   * 创建 RAG 错误
   * @param {string|number} codeOrName
   * @param {string} [message]
   * @returns {AppError}
   */
  static ragError(codeOrName, message) {
    const code = typeof codeOrName === 'number' ? codeOrName :
      (AppError.CODES[codeOrName]?.code || AppError.CODES.RAG_ERROR.code);
    return new AppError(code, message || AppError.CODES.RAG_ERROR.message);
  }

  /**
   * 创建 Tool 错误
   * @param {string|number} codeOrName
   * @param {string} [message]
   * @returns {AppError}
   */
  static toolError(codeOrName, message) {
    const code = typeof codeOrName === 'number' ? codeOrName :
      (AppError.CODES[codeOrName]?.code || AppError.CODES.TOOL_ERROR.code);
    return new AppError(code, message || AppError.CODES.TOOL_ERROR.message);
  }

  /**
   * 创建内部错误
   * @param {string} [message]
   * @returns {AppError}
   */
  static internalError(message) {
    return new AppError(AppError.CODES.INTERNAL_ERROR.code, message || '内部服务器错误');
  }
}

module.exports = AppError;
