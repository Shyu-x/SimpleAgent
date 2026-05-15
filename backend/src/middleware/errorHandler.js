/**
 * 全局错误处理中间件
 * @desc 统一错误处理、格式化响应、日志记录
 * @version 2.0.0 (2026-04-06)
 *
 * 统一响应格式: {success: bool, data: any, error: {code, message}, timestamp}
 */

const AppError = require('../common/errors/AppError');
const { errorResponse, successResponse } = require('../common/response');

/**
 * 整数错误码到字符串错误码的映射
 * 用于统一 API 响应格式
 */
const ERROR_CODE_MAP = {
  // VALIDATION (1000-1999)
  1000: 'VAL_INVALID',
  1001: 'VAL_MISSING_PARAM',
  1002: 'VAL_INVALID_TYPE',
  1003: 'VAL_INVALID_FORMAT',
  1004: 'VAL_OUT_OF_RANGE',
  1005: 'VAL_VALIDATION_FAILED',
  1100: 'VAL_INVALID_BODY',
  1101: 'VAL_INVALID_JSON',
  1102: 'VAL_MISSING_HEADER',
  1103: 'VAL_INVALID_HEADER',
  // AUTH (2000-2999)
  2000: 'AUTH_UNAUTHORIZED',
  2001: 'AUTH_INVALID_TOKEN',
  2002: 'AUTH_TOKEN_EXPIRED',
  2003: 'AUTH_TOKEN_MISSING',
  2004: 'AUTH_FORBIDDEN',
  2005: 'AUTH_INSUFFICIENT_PERM',
  2100: 'AUTH_API_KEY_INVALID',
  2101: 'AUTH_API_KEY_EXPIRED',
  2102: 'AUTH_IP_NOT_ALLOWED',
  // AGENT (3000-3999)
  3000: 'AGENT_ERROR',
  3001: 'AGENT_INTENT_CLASSIFY_FAILED',
  3002: 'AGENT_INTENT_UNSUPPORTED',
  3003: 'AGENT_ROUTING_FAILED',
  3004: 'AGENT_EXEC_TIMEOUT',
  3005: 'AGENT_MAX_TURNS_EXCEEDED',
  3100: 'AGENT_SESSION_NOT_FOUND',
  3101: 'AGENT_SESSION_EXPIRED',
  3102: 'AGENT_SESSION_CONFLICT',
  3200: 'AGENT_MEMORY_ERROR',
  3201: 'AGENT_MEMORY_SAVE_FAILED',
  3202: 'AGENT_MEMORY_RECALL_FAILED',
  3300: 'AGENT_CANCELLED',
  3301: 'AGENT_ABORTED',
  // RAG (4000-4999)
  4000: 'RAG_ERROR',
  4001: 'RAG_QUERY_REWRITE_FAILED',
  4002: 'RAG_QUERY_DECOMPOSE_FAILED',
  4003: 'RAG_RETRIEVAL_FAILED',
  4004: 'RAG_RERANK_FAILED',
  4005: 'RAG_NO_RESULT',
  4006: 'RAG_LOW_CONFIDENCE',
  4100: 'RAG_INGESTION_FAILED',
  4101: 'RAG_PARSE_FAILED',
  4102: 'RAG_CHUNK_FAILED',
  4103: 'RAG_EMBEDDING_FAILED',
  4104: 'RAG_INDEX_FAILED',
  4200: 'RAG_VECTOR_SEARCH_FAILED',
  4201: 'RAG_KEYWORD_SEARCH_FAILED',
  4202: 'RAG_HYBRID_SEARCH_FAILED',
  4300: 'RAG_COLLECTION_NOT_FOUND',
  4301: 'RAG_COLLECTION_EXISTS',
  // TOOL (5000-5999)
  5000: 'TOOL_ERROR',
  5001: 'TOOL_NOT_FOUND',
  5002: 'TOOL_DISABLED',
  5003: 'TOOL_EXEC_FAILED',
  5004: 'TOOL_TIMEOUT',
  5005: 'TOOL_PARAM_INVALID',
  5006: 'TOOL_PARAM_MISSING',
  5007: 'TOOL_NO_IMPLEMENTATION',
  5100: 'TOOL_MCP_ERROR',
  5101: 'TOOL_MCP_CONNECT_FAILED',
  5102: 'TOOL_MCP_REQUEST_FAILED',
  5103: 'TOOL_MCP_RESPONSE_INVALID',
  // INTERNAL (6000-6999)
  6000: 'SYS_INTERNAL',
  6001: 'SYS_UNAVAILABLE',
  6002: 'SYS_REQUEST_TIMEOUT',
  6003: 'SYS_NETWORK_ERROR',
  6004: 'SYS_NOT_FOUND',
  6005: 'SYS_METHOD_NOT_ALLOWED',
  6100: 'SYS_DATABASE_ERROR',
  6101: 'SYS_DB_CONNECTION_FAILED',
  6102: 'SYS_DB_QUERY_FAILED',
  6103: 'SYS_DB_WRITE_FAILED',
  6200: 'SYS_CACHE_ERROR',
  6201: 'SYS_REDIS_ERROR',
  6202: 'SYS_REDIS_CONNECTION_FAILED',
  6300: 'SYS_EXTERNAL_API_ERROR',
  6301: 'SYS_EXTERNAL_API_TIMEOUT',
  6302: 'SYS_MODEL_API_ERROR',
  6303: 'SYS_MODEL_API_TIMEOUT',
  6400: 'SYS_RATE_LIMIT_EXCEEDED',
  6401: 'SYS_QUOTA_EXCEEDED',
  6402: 'SYS_CIRCUIT_BREAKER_OPEN',
  6500: 'SYS_CONFIG_ERROR',
  6501: 'SYS_CONFIG_NOT_FOUND',
};

/**
 * 将整数错误码转换为字符串错误码
 * @param {number|string} code - 整数或字符串错误码
 * @returns {string} 字符串错误码
 */
function intToStringCode(code) {
  if (typeof code === 'string') {
    return code;
  }
  return ERROR_CODE_MAP[code] || `ERR_${code}`;
}

/**
 * 获取当前时间戳
 * @returns {string}
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * 生成请求ID
 * @returns {string}
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 错误处理中间件
 * @param {Error} err
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 */
function errorHandler(err, req, res, next) {
  // 提取请求ID (用于链路追踪)
  const requestId = req.headers['x-request-id'] || req.headers['x-trace-id'] || generateRequestId();

  // 初始化日志数据
  const logData = {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: getTimestamp(),
  };

  // 处理 AppError
  if (err instanceof AppError) {
    err.setRequestId(requestId);

    logData.error = {
      code: err.code,
      type: err.type,
      message: err.message,
      status: err.status,
    };

    // 根据错误类型设置日志级别
    if (err.isServerError()) {
      console.error(`[${err.code}] ${err.message}`, {
        ...logData,
        stack: err.stack,
      });
    } else {
      console.warn(`[${err.code}] ${err.message}`, logData);
    }

    return res.status(err.status).json({
      success: false,
      data: null,
      error: {
        code: intToStringCode(err.code),
        message: err.message,
      },
      timestamp: getTimestamp(),
    });
  }

  // 处理 ValidationError (来自 express-validator 等)
  if (err.name === 'ValidationError') {
    console.warn('[VALIDATION_ERROR]', err.message, logData);

    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: intToStringCode(1003),
        message: '参数验证失败',
      },
      timestamp: getTimestamp(),
    });
  }

  // 处理 JSON 解析错误
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.warn('[JSON_PARSE_ERROR]', err.message, logData);

    return res.status(400).json({
      success: false,
      data: null,
      error: {
        code: intToStringCode(1101),
        message: '请求体 JSON 格式错误',
      },
      timestamp: getTimestamp(),
    });
  }

  // 处理 Mongoose/ MongoDB 错误
  if (err.name === 'MongoServerError' || err.name === 'MongooseError') {
    console.error('[DATABASE_ERROR]', err.message, { ...logData, stack: err.stack });

    let message = '数据库操作失败';
    let code = 6100;

    // 处理唯一索引冲突
    if (err.code === 11000) {
      message = '数据已存在';
      code = 4301;
    }

    return res.status(500).json({
      success: false,
      data: null,
      error: {
        code: intToStringCode(code),
        message,
      },
      timestamp: getTimestamp(),
    });
  }

  // 处理 JWT 错误
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    console.warn('[AUTH_ERROR]', err.message, logData);

    const code = err.name === 'TokenExpiredError' ? 2002 : 2001;

    return res.status(401).json({
      success: false,
      data: null,
      error: {
        code: intToStringCode(code),
        message: '认证令牌无效',
      },
      timestamp: getTimestamp(),
    });
  }

  // 处理业务错误 (带 statusCode)
  if (err.statusCode || err.status) {
    console.warn('[BUSINESS_ERROR]', err.message, logData);

    return res.status(err.statusCode || err.status).json({
      success: false,
      data: null,
      error: {
        code: intToStringCode(err.code || 3000),
        message: err.message,
      },
      timestamp: getTimestamp(),
    });
  }

  // 未知错误 (服务器内部错误)
  console.error('[INTERNAL_ERROR]', err.message, {
    ...logData,
    stack: err.stack,
    name: err.name,
  });

  // 生产环境隐藏详细错误信息
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      success: false,
      data: null,
      error: {
        code: intToStringCode(6000),
        message: '服务器内部错误',
      },
      timestamp: getTimestamp(),
    });
  }

  // 开发环境返回详细信息
  return res.status(500).json({
    success: false,
    data: null,
    error: {
      code: intToStringCode(6000),
      message: err.message,
    },
    timestamp: getTimestamp(),
  });
}

/**
 * 404 处理中间件
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    data: null,
    error: {
      code: intToStringCode(6004),
      message: `路由 ${req.method} ${req.path} 不存在`,
    },
    timestamp: getTimestamp(),
  });
}

/**
 * 异步处理包装器
 * 捕获 async 函数中的错误
 * @param {Function} fn
 * @returns {Function}
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 错误日志格式化 (用于日志服务)
 * @param {Error} err
 * @param {object} context
 * @returns {object}
 */
function formatErrorLog(err, context = {}) {
  if (err instanceof AppError) {
    return {
      level: err.isServerError() ? 'error' : 'warn',
      code: err.code,
      type: err.type,
      message: err.message,
      status: err.status,
      requestId: err.requestId,
      details: err.details,
      ...context,
    };
  }

  return {
    level: 'error',
    name: err.name,
    message: err.message,
    stack: err.stack,
    ...context,
  };
}

/**
 * 安全错误响应 (不泄露内部信息)
 * @param {string} message
 * @param {string} [requestId]
 * @returns {object}
 */
function safeErrorResponse(message, requestId = null) {
  return {
    success: false,
    data: null,
    error: {
      code: intToStringCode(6000),
      message,
    },
    timestamp: getTimestamp(),
  };
}

/**
 * 统一的错误响应辅助函数
 * 供路由层直接使用
 */

/**
 * 统一的错误响应格式
 * @param {Response} res - Express Response 对象
 * @param {number} status - HTTP 状态码
 * @param {number} code - 错误码 (1000-9999)
 * @param {string} message - 错误消息
 * @param {object} [details] - 额外详情
 * @returns {Response}
 */
function sendError(res, status, code, message, details = null) {
  const response = {
    success: false,
    data: null,
    error: {
      code: intToStringCode(code),
      message,
      ...(details && { details }),
    },
    timestamp: getTimestamp(),
  };

  return res.status(status).json(response);
}

/**
 * 成功响应辅助函数
 * @param {Response} res
 * @param {any} data
 * @param {string} [message]
 * @returns {Response}
 */
function sendSuccess(res, data, message = null) {
  const response = {
    success: true,
    data,
    ...(message && { message }),
    timestamp: getTimestamp(),
  };

  return res.status(200).json(response);
}

/**
 * 从 AppError 获取响应
 * @param {AppError} err
 * @returns {object}
 */
function getErrorResponse(err) {
  return {
    success: false,
    data: null,
    error: {
      code: intToStringCode(err.code),
      message: err.message,
      type: err.type,
      ...(err.details && { details: err.details }),
    },
    timestamp: getTimestamp(),
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  formatErrorLog,
  safeErrorResponse,
  generateRequestId,
  sendError,
  sendSuccess,
  getErrorResponse,
};
