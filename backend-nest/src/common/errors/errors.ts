/**
 * 错误类型导出
 * 提供常用的错误类工厂方法
 * @version 2.0.0
 */
import { AppError } from './app-error';

/**
 * 错误码常量 (供外部引用)
 */
export const ErrorCodes = {
  // VALIDATION (1000-1999)
  INVALID_PARAM: 1000,
  MISSING_PARAM: 1001,
  INVALID_TYPE: 1002,
  INVALID_FORMAT: 1003,
  PARAM_OUT_OF_RANGE: 1004,
  VALIDATION_FAILED: 1005,
  INVALID_REQUEST_BODY: 1100,
  INVALID_JSON: 1101,
  MISSING_HEADER: 1102,
  INVALID_HEADER: 1103,

  // AUTH (2000-2999)
  UNAUTHORIZED: 2000,
  INVALID_TOKEN: 2001,
  TOKEN_EXPIRED: 2002,
  TOKEN_MISSING: 2003,
  FORBIDDEN: 2004,
  INSUFFICIENT_PERMISSION: 2005,
  API_KEY_INVALID: 2100,
  API_KEY_EXPIRED: 2101,
  IP_NOT_ALLOWED: 2102,

  // AGENT (3000-3999)
  AGENT_ERROR: 3000,
  INTENT_CLASSIFY_FAILED: 3001,
  INTENT_UNSUPPORTED: 3002,
  ROUTING_FAILED: 3003,
  EXECUTION_TIMEOUT: 3004,
  MAX_TURNS_EXCEEDED: 3005,
  SESSION_NOT_FOUND: 3100,
  SESSION_EXPIRED: 3101,
  SESSION_VERSION_CONFLICT: 3102,
  MEMORY_ERROR: 3200,
  MEMORY_SAVE_FAILED: 3201,
  MEMORY_RECALL_FAILED: 3202,
  CANCELLED: 3300,
  ABORTED: 3301,

  // RAG (4000-4999)
  RAG_ERROR: 4000,
  QUERY_REWRITE_FAILED: 4001,
  QUERY_DECOMPOSE_FAILED: 4002,
  RETRIEVAL_FAILED: 4003,
  RERANK_FAILED: 4004,
  NO_RESULT: 4005,
  LOW_CONFIDENCE: 4006,
  INGESTION_FAILED: 4100,
  PARSE_FAILED: 4101,
  CHUNK_FAILED: 4102,
  EMBEDDING_FAILED: 4103,
  INDEX_FAILED: 4104,
  VECTOR_SEARCH_FAILED: 4200,
  KEYWORD_SEARCH_FAILED: 4201,
  HYBRID_SEARCH_FAILED: 4202,
  COLLECTION_NOT_FOUND: 4300,
  COLLECTION_EXISTS: 4301,

  // TOOL (5000-5999)
  TOOL_ERROR: 5000,
  TOOL_NOT_FOUND: 5001,
  TOOL_DISABLED: 5002,
  TOOL_EXEC_FAILED: 5003,
  TOOL_TIMEOUT: 5004,
  TOOL_PARAM_INVALID: 5005,
  TOOL_PARAM_MISSING: 5006,
  TOOL_NO_IMPLEMENTATION: 5007,
  MCP_ERROR: 5100,
  MCP_CONNECT_FAILED: 5101,
  MCP_REQUEST_FAILED: 5102,
  MCP_RESPONSE_INVALID: 5103,

  // INTERNAL (6000-6999)
  INTERNAL_ERROR: 6000,
  SERVICE_UNAVAILABLE: 6001,
  REQUEST_TIMEOUT: 6002,
  NETWORK_ERROR: 6003,
  NOT_FOUND: 6004,
  METHOD_NOT_ALLOWED: 6005,
  DATABASE_ERROR: 6100,
  DB_CONNECTION_FAILED: 6101,
  DB_QUERY_FAILED: 6102,
  DB_WRITE_FAILED: 6103,
  CACHE_ERROR: 6200,
  REDIS_ERROR: 6201,
  REDIS_CONNECTION_FAILED: 6202,
  EXTERNAL_API_ERROR: 6300,
  EXTERNAL_API_TIMEOUT: 6301,
  MODEL_API_ERROR: 6302,
  MODEL_API_TIMEOUT: 6303,
  RATE_LIMIT_EXCEEDED: 6400,
  QUOTA_EXCEEDED: 6401,
  CIRCUIT_BREAKER_OPEN: 6402,
  CONFIG_ERROR: 6500,
  CONFIG_NOT_FOUND: 6501,
} as const;

export type ErrorCodeType = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * 错误工厂函数 (向后兼容)
 */
export const Errors = {
  // 系统错误
  internal: (message = '内部服务器错误') => new AppError(ErrorCodes.INTERNAL_ERROR, message),
  notFound: (resource = '资源') => AppError.notFound(resource),
  unavailable: (message = '服务不可用') => new AppError(ErrorCodes.SERVICE_UNAVAILABLE, message),
  timeout: (message = '请求超时') => new AppError(ErrorCodes.REQUEST_TIMEOUT, message),

  // 验证错误
  validation: (detail: string | Record<string, unknown>) =>
    new AppError(ErrorCodes.VALIDATION_FAILED, typeof detail === 'string' ? detail : JSON.stringify(detail)),
  missingParam: (param: string) => new AppError(ErrorCodes.MISSING_PARAM, `缺少必需参数: ${param}`),
  invalidParam: (param: string, reason?: string) =>
    new AppError(ErrorCodes.INVALID_PARAM, reason ? `参数 ${param} 无效: ${reason}` : `参数 ${param} 无效`),

  // 认证错误
  unauthorized: (message?: string) => AppError.unauthorized(message),
  forbidden: (message = '无权限访问') => new AppError(ErrorCodes.FORBIDDEN, message),
  tokenExpired: () => new AppError(ErrorCodes.TOKEN_EXPIRED, '认证已过期'),
  tokenInvalid: () => new AppError(ErrorCodes.INVALID_TOKEN, '认证信息无效'),

  // 限流错误
  rateLimit: (message?: string) => AppError.rateLimit(message),
  quotaExceeded: () => new AppError(ErrorCodes.QUOTA_EXCEEDED, '配额超限'),

  // 业务错误
  bizConflict: (message = '业务冲突') => new AppError(ErrorCodes.SESSION_VERSION_CONFLICT, message),
  bizState: (message = '业务状态错误') => new AppError(ErrorCodes.AGENT_ERROR, message),

  // 外部服务错误
  apiError: (message = '外部 API 调用失败') => new AppError(ErrorCodes.EXTERNAL_API_ERROR, message),
  modelError: (message = '模型服务异常') => new AppError(ErrorCodes.MODEL_API_ERROR, message),

  // 工具错误
  toolNotFound: (tool: string) => new AppError(ErrorCodes.TOOL_NOT_FOUND, `工具不存在: ${tool}`),
  toolExecError: (tool: string, reason?: string) =>
    new AppError(ErrorCodes.TOOL_EXEC_FAILED, reason ? `工具 ${tool} 执行失败: ${reason}` : `工具 ${tool} 执行失败`),
  toolTimeout: (tool: string) => new AppError(ErrorCodes.TOOL_TIMEOUT, `工具 ${tool} 执行超时`),
};

export { AppError };
