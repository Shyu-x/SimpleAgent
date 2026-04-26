/**
 * 全局 HTTP 异常过滤器
 * 统一处理 HTTP 异常并格式化响应
 *
 * 统一响应格式: {success: false, data: null, error: {code: string, message: string}, timestamp}
 */
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from '../errors';

/**
 * 整数错误码到字符串错误码的映射
 */
const ERROR_CODE_MAP: Record<number, string> = {
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
 */
function intToStringCode(code: number): string {
  return ERROR_CODE_MAP[code] || `ERR_${code}`;
}

interface ErrorResponse {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
  };
  timestamp: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const timestamp = new Date().toISOString();
    let status: number;
    let message: string | object;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || exceptionResponse;
      } else {
        message = exceptionResponse;
      }
    } else if (exception instanceof AppError) {
      status = exception.status;
      message = exception.message;
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = '内部服务器错误';
    }

    const errorResponse: ErrorResponse = {
      success: false,
      data: null,
      error: {
        code: status === HttpStatus.INTERNAL_SERVER_ERROR ? 'SYS_INTERNAL' :
              status === HttpStatus.NOT_FOUND ? 'SYS_NOT_FOUND' :
              status === HttpStatus.BAD_REQUEST ? 'VAL_INVALID' :
              status === HttpStatus.UNAUTHORIZED ? 'AUTH_UNAUTHORIZED' :
              status === HttpStatus.FORBIDDEN ? 'AUTH_FORBIDDEN' :
              status === HttpStatus.TOO_MANY_REQUESTS ? 'SYS_RATE_LIMIT_EXCEEDED' :
              'SYS_INTERNAL',
        message: typeof message === 'object'
          ? (message as Record<string, unknown>).message as string || JSON.stringify(message)
          : message as string,
      },
      timestamp,
    };

    // 记录日志
    if (status >= 500) {
      this.logger.error(
        `[${errorResponse.error.code}] ${typeof message === 'string' ? message : JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`[${errorResponse.error.code}] ${typeof message === 'string' ? message : JSON.stringify(message)}`);
    }

    response.status(status).json(errorResponse);
  }
}
