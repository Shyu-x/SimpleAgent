/**
 * 统一错误码体系
 *
 * 为什么需要：
 * 企业里线上出问题需要快速定位问题类型、影响范围、解决方案。
 * 如果错误信息不统一，排查问题如同大海捞针。
 *
 * 错误码规范：
 * - 1xxx: 认证授权类
 * - 2xxx: 参数校验类
 * - 3xxx: 业务逻辑类
 * - 4xxx: 外部依赖类 (模型、工具)
 * - 5xxx: 系统异常类
 */

const ErrorCode = {
  // ========== 认证授权类 (1xxx) ==========
  AUTH_MISSING_API_KEY: {
    code: 1001,
    status: 401,
    message: 'API Key 未配置',
    solution: '请在环境变量或请求中配置 API Key'
  },
  AUTH_INVALID_API_KEY: {
    code: 1002,
    status: 401,
    message: 'API Key 无效',
    solution: '请检查 API Key 是否正确'
  },
  AUTH_EXPIRED_TOKEN: {
    code: 1003,
    status: 401,
    message: 'Token 已过期',
    solution: '请刷新 Token 后重试'
  },

  // ========== 参数校验类 (2xxx) ==========
  VALIDATION_MISSING_FIELD: {
    code: 2001,
    status: 400,
    message: '缺少必需字段',
    solution: '请检查请求参数'
  },
  VALIDATION_INVALID_FORMAT: {
    code: 2002,
    status: 400,
    message: '参数格式错误',
    solution: '请检查参数格式是否符合规范'
  },
  VALIDATION_OUT_OF_RANGE: {
    code: 2003,
    status: 400,
    message: '参数超出范围',
    solution: '请检查参数是否在有效范围内'
  },
  VALIDATION_TOO_MANY_MESSAGES: {
    code: 2004,
    status: 400,
    message: '消息数量超限',
    solution: '当前最大支持 100 条消息'
  },

  // ========== 业务逻辑类 (3xxx) ==========
  BUSINESS_SESSION_NOT_FOUND: {
    code: 3001,
    status: 404,
    message: '会话不存在',
    solution: '请创建新会话或检查会话 ID'
  },
  BUSINESS_KB_NOT_FOUND: {
    code: 3002,
    status: 404,
    message: '知识库不存在',
    solution: '请先创建知识库或检查知识库 ID'
  },
  BUSINESS_TOOL_NOT_FOUND: {
    code: 3003,
    status: 404,
    message: '工具不存在',
    solution: '请检查工具名称是否正确'
  },
  BUSINESS_LIMIT_EXCEEDED: {
    code: 3004,
    status: 429,
    message: '业务限流触发',
    solution: '请稍后重试'
  },

  // ========== 外部依赖类 (4xxx) ==========
  EXTERNAL_MODEL_ERROR: {
    code: 4001,
    status: 502,
    message: '模型服务不可用',
    solution: '请检查模型服务状态或切换模型'
  },
  EXTERNAL_MODEL_TIMEOUT: {
    code: 4002,
    status: 504,
    message: '模型响应超时',
    solution: '请重试或减少请求内容'
  },
  EXTERNAL_MODEL_RATE_LIMIT: {
    code: 4003,
    status: 429,
    message: '模型限流',
    solution: '请等待后重试'
  },
  EXTERNAL_TOOL_ERROR: {
    code: 4011,
    status: 502,
    message: '工具执行失败',
    solution: '请检查工具配置或重试'
  },
  EXTERNAL_TOOL_TIMEOUT: {
    code: 4012,
    status: 504,
    message: '工具执行超时',
    solution: '请重试或检查工具实现'
  },
  EXTERNAL_SEARCH_ERROR: {
    code: 4021,
    status: 502,
    message: '检索服务不可用',
    solution: '请检查检索服务配置'
  },

  // ========== 系统异常类 (5xxx) ==========
  SYSTEM_INTERNAL_ERROR: {
    code: 5001,
    status: 500,
    message: '系统内部错误',
    solution: '请联系技术支持'
  },
  SYSTEM_UNEXPECTED_ERROR: {
    code: 5002,
    status: 500,
    message: '未知错误',
    solution: '请联系技术支持'
  },
  SYSTEM_NOT_INITIALIZED: {
    code: 5003,
    status: 500,
    message: '服务未初始化',
    solution: '请等待服务启动完成'
  }
};

/**
 * 应用错误类
 * 支持错误码、HTTP状态、错误信息、解决方案的统一封装
 */
class AppError extends Error {
  constructor(errorDef, details = {}) {
    super(errorDef.message);
    this.name = 'AppError';
    this.code = errorDef.code;
    this.status = errorDef.status;
    this.solution = errorDef.solution;
    this.details = details;
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        solution: this.solution,
        details: this.details
      }
    };
  }

  /**
   * 转换为 HTTP 响应格式
   */
  toHttpResponse() {
    return {
      status: this.status,
      body: this.toJSON()
    };
  }
}

/**
 * 创建错误的便捷方法
 * @param {string} errorName - ErrorCode 中的键名
 * @param {Object} details - 额外详情
 */
function createError(errorName, details = {}) {
  const errorDef = ErrorCode[errorName];
  if (!errorDef) {
    return createError('SYSTEM_UNEXPECTED_ERROR', { originalError: errorName });
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
async function safeAsync(fn, errorName = 'SYSTEM_INTERNAL_ERROR') {
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
  createError,
  isAppError,
  safeAsync
};
