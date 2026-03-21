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

function test(name, fn) {
  try {
    fn();
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } catch (e) {
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.log('    ' + e.message);
    process.exitCode = 1;
  }
}

function describe(name, fn) {
  console.log('\n' + name + ':');
  fn();
}

const { ErrorCode, AppError, createError, isAppError, safeAsync } = require('../../src/common/errors');

describe('ErrorCode - 认证授权类 (1xxx)', () => {
  test('AUTH_MISSING_API_KEY 应该正确配置', () => {
    const err = ErrorCode.AUTH_MISSING_API_KEY;
    assert.strictEqual(err.code, 1001);
    assert.strictEqual(err.status, 401);
    assert.strictEqual(err.message, 'API Key 未配置');
  });

  test('AUTH_INVALID_API_KEY 应该正确配置', () => {
    const err = ErrorCode.AUTH_INVALID_API_KEY;
    assert.strictEqual(err.code, 1002);
    assert.strictEqual(err.status, 401);
  });

  test('AUTH_EXPIRED_TOKEN 应该正确配置', () => {
    const err = ErrorCode.AUTH_EXPIRED_TOKEN;
    assert.strictEqual(err.code, 1003);
    assert.strictEqual(err.status, 401);
  });
});

describe('ErrorCode - 参数校验类 (2xxx)', () => {
  test('VALIDATION_MISSING_FIELD 应该正确配置', () => {
    const err = ErrorCode.VALIDATION_MISSING_FIELD;
    assert.strictEqual(err.code, 2001);
    assert.strictEqual(err.status, 400);
  });

  test('VALIDATION_INVALID_FORMAT 应该正确配置', () => {
    const err = ErrorCode.VALIDATION_INVALID_FORMAT;
    assert.strictEqual(err.code, 2002);
    assert.strictEqual(err.status, 400);
  });

  test('VALIDATION_OUT_OF_RANGE 应该正确配置', () => {
    const err = ErrorCode.VALIDATION_OUT_OF_RANGE;
    assert.strictEqual(err.code, 2003);
    assert.strictEqual(err.status, 400);
  });

  test('VALIDATION_TOO_MANY_MESSAGES 应该正确配置', () => {
    const err = ErrorCode.VALIDATION_TOO_MANY_MESSAGES;
    assert.strictEqual(err.code, 2004);
    assert.strictEqual(err.status, 400);
  });
});

describe('ErrorCode - 业务逻辑类 (3xxx)', () => {
  test('BUSINESS_SESSION_NOT_FOUND 应该正确配置', () => {
    const err = ErrorCode.BUSINESS_SESSION_NOT_FOUND;
    assert.strictEqual(err.code, 3001);
    assert.strictEqual(err.status, 404);
  });

  test('BUSINESS_KB_NOT_FOUND 应该正确配置', () => {
    const err = ErrorCode.BUSINESS_KB_NOT_FOUND;
    assert.strictEqual(err.code, 3002);
    assert.strictEqual(err.status, 404);
  });

  test('BUSINESS_TOOL_NOT_FOUND 应该正确配置', () => {
    const err = ErrorCode.BUSINESS_TOOL_NOT_FOUND;
    assert.strictEqual(err.code, 3003);
    assert.strictEqual(err.status, 404);
  });

  test('BUSINESS_LIMIT_EXCEEDED 应该正确配置', () => {
    const err = ErrorCode.BUSINESS_LIMIT_EXCEEDED;
    assert.strictEqual(err.code, 3004);
    assert.strictEqual(err.status, 429);
  });
});

describe('ErrorCode - 外部依赖类 (4xxx)', () => {
  test('EXTERNAL_MODEL_ERROR 应该正确配置', () => {
    const err = ErrorCode.EXTERNAL_MODEL_ERROR;
    assert.strictEqual(err.code, 4001);
    assert.strictEqual(err.status, 502);
  });

  test('EXTERNAL_MODEL_TIMEOUT 应该正确配置', () => {
    const err = ErrorCode.EXTERNAL_MODEL_TIMEOUT;
    assert.strictEqual(err.code, 4002);
    assert.strictEqual(err.status, 504);
  });

  test('EXTERNAL_MODEL_RATE_LIMIT 应该正确配置', () => {
    const err = ErrorCode.EXTERNAL_MODEL_RATE_LIMIT;
    assert.strictEqual(err.code, 4003);
    assert.strictEqual(err.status, 429);
  });

  test('EXTERNAL_TOOL_ERROR 应该正确配置', () => {
    const err = ErrorCode.EXTERNAL_TOOL_ERROR;
    assert.strictEqual(err.code, 4011);
    assert.strictEqual(err.status, 502);
  });

  test('EXTERNAL_TOOL_TIMEOUT 应该正确配置', () => {
    const err = ErrorCode.EXTERNAL_TOOL_TIMEOUT;
    assert.strictEqual(err.code, 4012);
    assert.strictEqual(err.status, 504);
  });

  test('EXTERNAL_SEARCH_ERROR 应该正确配置', () => {
    const err = ErrorCode.EXTERNAL_SEARCH_ERROR;
    assert.strictEqual(err.code, 4021);
    assert.strictEqual(err.status, 502);
  });
});

describe('ErrorCode - 系统异常类 (5xxx)', () => {
  test('SYSTEM_INTERNAL_ERROR 应该正确配置', () => {
    const err = ErrorCode.SYSTEM_INTERNAL_ERROR;
    assert.strictEqual(err.code, 5001);
    assert.strictEqual(err.status, 500);
  });

  test('SYSTEM_UNEXPECTED_ERROR 应该正确配置', () => {
    const err = ErrorCode.SYSTEM_UNEXPECTED_ERROR;
    assert.strictEqual(err.code, 5002);
    assert.strictEqual(err.status, 500);
  });

  test('SYSTEM_NOT_INITIALIZED 应该正确配置', () => {
    const err = ErrorCode.SYSTEM_NOT_INITIALIZED;
    assert.strictEqual(err.code, 5003);
    assert.strictEqual(err.status, 500);
  });
});

describe('AppError', () => {
  test('应该正确构造错误对象', () => {
    const err = new AppError(ErrorCode.AUTH_MISSING_API_KEY);
    assert.strictEqual(err.name, 'AppError');
    assert.strictEqual(err.code, 1001);
    assert.strictEqual(err.status, 401);
    assert.strictEqual(err.message, 'API Key 未配置');
    assert.strictEqual(err.solution, '请在环境变量或请求中配置 API Key');
  });

  test('应该包含 details 信息', () => {
    const err = new AppError(ErrorCode.VALIDATION_MISSING_FIELD, { field: 'username' });
    assert.deepStrictEqual(err.details, { field: 'username' });
  });

  test('应该正确序列化为 JSON', () => {
    const err = new AppError(ErrorCode.AUTH_MISSING_API_KEY, { test: true });
    const json = err.toJSON();
    assert.strictEqual(json.error.code, 1001);
    assert.strictEqual(json.error.message, 'API Key 未配置');
    assert.strictEqual(json.error.solution, '请在环境变量或请求中配置 API Key');
    assert.deepStrictEqual(json.error.details, { test: true });
  });

  test('应该正确转换为 HTTP 响应格式', () => {
    const err = new AppError(ErrorCode.BUSINESS_SESSION_NOT_FOUND);
    const httpResponse = err.toHttpResponse();
    assert.strictEqual(httpResponse.status, 404);
    assert.strictEqual(httpResponse.body.error.code, 3001);
  });

  test('应该是 Error 的实例', () => {
    const err = new AppError(ErrorCode.SYSTEM_INTERNAL_ERROR);
    assert.ok(err instanceof Error);
    assert.ok(err instanceof AppError);
  });
});

describe('createError', () => {
  test('应该根据错误名称创建错误', () => {
    const err = createError('AUTH_MISSING_API_KEY');
    assert.ok(err instanceof AppError);
    assert.strictEqual(err.code, 1001);
  });

  test('应该支持传递 details', () => {
    const err = createError('AUTH_INVALID_API_KEY', { providedKey: 'xxx' });
    assert.deepStrictEqual(err.details, { providedKey: 'xxx' });
  });

  test('未知错误名称应该返回 SYSTEM_UNEXPECTED_ERROR', () => {
    const err = createError('UNKNOWN_ERROR_NAME');
    assert.ok(err instanceof AppError);
    assert.strictEqual(err.code, 5002); // SYSTEM_UNEXPECTED_ERROR
  });

  test('未知错误名称应该包含原始错误名', () => {
    const err = createError('UNKNOWN_ERROR_NAME');
    assert.deepStrictEqual(err.details, { originalError: 'UNKNOWN_ERROR_NAME' });
  });
});

describe('isAppError', () => {
  test('AppError 实例应该返回 true', () => {
    const err = new AppError(ErrorCode.AUTH_MISSING_API_KEY);
    assert.strictEqual(isAppError(err), true);
  });

  test('普通 Error 实例应该返回 false', () => {
    const err = new Error('普通错误');
    assert.strictEqual(isAppError(err), false);
  });

  test('普通对象应该返回 false', () => {
    assert.strictEqual(isAppError({ message: 'test' }), false);
  });

  test('null 应该返回 false', () => {
    assert.strictEqual(isAppError(null), false);
  });

  test('undefined 应该返回 false', () => {
    assert.strictEqual(isAppError(undefined), false);
  });
});

describe('safeAsync', () => {
  test('正常返回的函数应该直接返回结果', async () => {
    const result = await safeAsync(async () => 'success');
    assert.strictEqual(result, 'success');
  });

  test('抛出 AppError 的函数应该重新抛出', async () => {
    const appError = new AppError(ErrorCode.AUTH_MISSING_API_KEY);
    try {
      await safeAsync(async () => { throw appError; });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.code, 1001);
    }
  });

  test('抛出普通错误的函数应该包装为 SYSTEM_INTERNAL_ERROR', async () => {
    try {
      await safeAsync(async () => { throw new Error('Some error'); });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.code, 5001); // SYSTEM_INTERNAL_ERROR
      assert.deepStrictEqual(err.details, { message: 'Some error' });
    }
  });

  test('应该支持自定义错误码', async () => {
    try {
      await safeAsync(async () => { throw new Error('Auth error'); }, 'AUTH_INVALID_API_KEY');
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.code, 1002); // AUTH_INVALID_API_KEY
    }
  });

  test('同步函数也应该能正常工作', async () => {
    const result = await safeAsync(() => 'sync success');
    assert.strictEqual(result, 'sync success');
  });

  test('同步函数抛出错误也应该被捕获', async () => {
    try {
      await safeAsync(() => { throw new Error('Sync error'); });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof AppError);
      assert.strictEqual(err.code, 5001);
    }
  });
});

console.log('\n');
