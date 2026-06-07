/**
 * 错误码体系 单元测试
 *
 * 测试内容：
 * 1. ErrorCode 错误定义
 * 2. AppError 类
 * 3. createError 工厂函数
 * 4. isAppError 类型判断
 * 5. safeAsync 安全包装
 */
const assert = require('assert');
const { ErrorCode, AppError, createError, isAppError, safeAsync } = require('../../src/common/errors');

describe('ErrorCode - VALIDATION (1000-1999)', () => {
  it('MISSING_PARAM 应该正确配置', () => {
    const err = ErrorCode.MISSING_PARAM;
    assert.strictEqual(err.code, 1001);
    assert.strictEqual(err.status, 400);
    assert.strictEqual(err.type, 'VALIDATION');
  });

  it('INVALID_PARAM 应该正确配置', () => {
    const err = ErrorCode.INVALID_PARAM;
    assert.strictEqual(err.code, 1000);
    assert.strictEqual(err.status, 400);
  });

  it('INVALID_FORMAT 应该正确配置', () => {
    const err = ErrorCode.INVALID_FORMAT;
    assert.strictEqual(err.code, 1003);
    assert.strictEqual(err.status, 400);
  });

  it('INVALID_JSON 应该正确配置', () => {
    const err = ErrorCode.INVALID_JSON;
    assert.strictEqual(err.code, 1101);
    assert.strictEqual(err.status, 400);
  });
});

describe('ErrorCode - AUTH (2000-2999)', () => {
  it('UNAUTHORIZED 应该正确配置', () => {
    const err = ErrorCode.UNAUTHORIZED;
    assert.strictEqual(err.code, 2000);
    assert.strictEqual(err.status, 401);
    assert.strictEqual(err.type, 'AUTH');
  });

  it('INVALID_TOKEN 应该正确配置', () => {
    const err = ErrorCode.INVALID_TOKEN;
    assert.strictEqual(err.code, 2001);
    assert.strictEqual(err.status, 401);
  });

  it('TOKEN_EXPIRED 应该正确配置', () => {
    const err = ErrorCode.TOKEN_EXPIRED;
    assert.strictEqual(err.code, 2002);
    assert.strictEqual(err.status, 401);
  });

  it('API_KEY_INVALID 应该正确配置', () => {
    const err = ErrorCode.API_KEY_INVALID;
    assert.strictEqual(err.code, 2100);
    assert.strictEqual(err.status, 401);
  });

  it('API_KEY_EXPIRED 应该正确配置', () => {
    const err = ErrorCode.API_KEY_EXPIRED;
    assert.strictEqual(err.code, 2101);
    assert.strictEqual(err.status, 401);
  });
});

describe('ErrorCode - AGENT (3000-3999)', () => {
  it('AGENT_ERROR 应该正确配置', () => {
    const err = ErrorCode.AGENT_ERROR;
    assert.strictEqual(err.code, 3000);
    assert.strictEqual(err.status, 500);
    assert.strictEqual(err.type, 'AGENT');
  });

  it('SESSION_NOT_FOUND 应该正确配置', () => {
    const err = ErrorCode.SESSION_NOT_FOUND;
    assert.strictEqual(err.code, 3100);
    assert.strictEqual(err.status, 404);
  });

  it('EXECUTION_TIMEOUT 应该正确配置', () => {
    const err = ErrorCode.EXECUTION_TIMEOUT;
    assert.strictEqual(err.code, 3004);
    assert.strictEqual(err.status, 504);
  });
});

describe('ErrorCode - RAG (4000-4999)', () => {
  it('RAG_ERROR 应该正确配置', () => {
    const err = ErrorCode.RAG_ERROR;
    assert.strictEqual(err.code, 4000);
    assert.strictEqual(err.status, 500);
    assert.strictEqual(err.type, 'RAG');
  });

  it('QUERY_REWRITE_FAILED 应该正确配置', () => {
    const err = ErrorCode.QUERY_REWRITE_FAILED;
    assert.strictEqual(err.code, 4001);
    assert.strictEqual(err.status, 400);
  });

  it('NO_RESULT 应该正确配置', () => {
    const err = ErrorCode.NO_RESULT;
    assert.strictEqual(err.code, 4005);
    assert.strictEqual(err.status, 404);
  });
});

describe('ErrorCode - TOOL (5000-5999)', () => {
  it('TOOL_ERROR 应该正确配置', () => {
    const err = ErrorCode.TOOL_ERROR;
    assert.strictEqual(err.code, 5000);
    assert.strictEqual(err.status, 500);
    assert.strictEqual(err.type, 'TOOL');
  });

  it('TOOL_NOT_FOUND 应该正确配置', () => {
    const err = ErrorCode.TOOL_NOT_FOUND;
    assert.strictEqual(err.code, 5001);
    assert.strictEqual(err.status, 404);
  });

  it('TOOL_TIMEOUT 应该正确配置', () => {
    const err = ErrorCode.TOOL_TIMEOUT;
    assert.strictEqual(err.code, 5004);
    assert.strictEqual(err.status, 504);
  });
});

describe('ErrorCode - INTERNAL (6000-6999)', () => {
  it('INTERNAL_ERROR 应该正确配置', () => {
    const err = ErrorCode.INTERNAL_ERROR;
    assert.strictEqual(err.code, 6000);
    assert.strictEqual(err.status, 500);
    assert.strictEqual(err.type, 'INTERNAL');
  });

  it('REQUEST_TIMEOUT 应该正确配置', () => {
    const err = ErrorCode.REQUEST_TIMEOUT;
    assert.strictEqual(err.code, 6002);
    assert.strictEqual(err.status, 504);
  });

  it('SERVICE_UNAVAILABLE 应该正确配置', () => {
    const err = ErrorCode.SERVICE_UNAVAILABLE;
    assert.strictEqual(err.code, 6001);
    assert.strictEqual(err.status, 503);
  });

  it('CIRCUIT_BREAKER_OPEN 应该正确配置', () => {
    const err = ErrorCode.CIRCUIT_BREAKER_OPEN;
    assert.strictEqual(err.code, 6402);
    assert.strictEqual(err.status, 503);
  });

  it('RATE_LIMIT_EXCEEDED 应该正确配置', () => {
    const err = ErrorCode.RATE_LIMIT_EXCEEDED;
    assert.strictEqual(err.code, 6400);
    assert.strictEqual(err.status, 429);
  });
});

describe('AppError', () => {
  it('应该正确构造错误对象', () => {
    const err = new AppError(ErrorCode.UNAUTHORIZED);
    assert.strictEqual(err.name, 'AppError');
    assert.strictEqual(err.code, 2000);
    assert.strictEqual(err.status, 401);
    assert.strictEqual(err.type, 'AUTH');
  });

  it('应该包含 details 信息', () => {
    const err = new AppError(ErrorCode.MISSING_PARAM, { field: 'username' });
    assert.deepStrictEqual(err.details, { field: 'username' });
  });

  it('应该是 Error 的实例', () => {
    const err = new AppError(ErrorCode.INTERNAL_ERROR);
    assert.ok(err instanceof Error);
    assert.ok(err instanceof AppError);
  });

  it('isClientError 应该正确判断 4xx 错误', () => {
    const clientErr = new AppError(ErrorCode.MISSING_PARAM);
    assert.strictEqual(clientErr.isClientError(), true);

    const serverErr = new AppError(ErrorCode.INTERNAL_ERROR);
    assert.strictEqual(serverErr.isClientError(), false);
  });

  it('isServerError 应该正确判断 5xx 错误', () => {
    const serverErr = new AppError(ErrorCode.INTERNAL_ERROR);
    assert.strictEqual(serverErr.isServerError(), true);

    const clientErr = new AppError(ErrorCode.MISSING_PARAM);
    assert.strictEqual(clientErr.isServerError(), false);
  });

  it('setRequestId 应该设置请求ID', () => {
    const err = new AppError(ErrorCode.INTERNAL_ERROR);
    err.setRequestId('req-123');
    assert.strictEqual(err.requestId, 'req-123');
  });
});

describe('createError', () => {
  it('应该根据错误名称创建错误', () => {
    const err = createError('UNAUTHORIZED');
    assert.ok(err instanceof AppError);
    assert.strictEqual(err.code, 2000);
  });

  it('应该支持传递 details', () => {
    const err = createError('MISSING_PARAM', { field: 'apiKey' });
    assert.deepStrictEqual(err.details, { field: 'apiKey' });
  });

  it('未知错误名称应该返回 INTERNAL_ERROR', () => {
    const err = createError('UNKNOWN_ERROR_NAME');
    assert.ok(err instanceof AppError);
    assert.strictEqual(err.code, 6000); // INTERNAL_ERROR
  });
});

describe('isAppError', () => {
  it('AppError 实例应该返回 true', () => {
    const err = new AppError(ErrorCode.UNAUTHORIZED);
    assert.strictEqual(isAppError(err), true);
  });

  it('普通 Error 实例应该返回 false', () => {
    const err = new Error('普通错误');
    assert.strictEqual(isAppError(err), false);
  });

  it('普通对象应该返回 false', () => {
    assert.strictEqual(isAppError({ message: 'test' }), false);
  });

  it('null 应该返回 false', () => {
    assert.strictEqual(isAppError(null), false);
  });

  it('undefined 应该返回 false', () => {
    assert.strictEqual(isAppError(undefined), false);
  });
});

describe('safeAsync', () => {
  it('正常返回的函数应该直接返回结果', async () => {
    const result = await safeAsync(async () => 'success');
    assert.strictEqual(result, 'success');
  });

  it('抛出 AppError 的函数应该重新抛出', async () => {
    const appError = new AppError(ErrorCode.UNAUTHORIZED);
    try {
      await safeAsync(async () => { throw appError; });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.code, 2000);
    }
  });

  it('抛出普通错误的函数应该包装为 INTERNAL_ERROR', async () => {
    try {
      await safeAsync(async () => { throw new Error('Some error'); });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.code, 6000); // INTERNAL_ERROR
    }
  });

  it('同步函数也应该能正常工作', async () => {
    const result = await safeAsync(() => 'sync success');
    assert.strictEqual(result, 'sync success');
  });

  it('同步函数抛出错误也应该被捕获', async () => {
    try {
      await safeAsync(() => { throw new Error('Sync error'); });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.code, 6000);
    }
  });
});
