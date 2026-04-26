/**
 * QueueRateLimiter 单元测试
 *
 * 测试内容：
 * 1. 限流器初始化配置
 * 2. 三种限流策略 (固定窗口/滑动窗口/令牌桶)
 * 3. Redis 连接和降级
 * 4. enqueue 队列功能
 * 5. 状态查询和重置
 */

const assert = require('assert');

// 简单的测试运行器
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

// 注意：由于 QueueRateLimiter 依赖 Redis，这里测试内存降级逻辑
// 实际的 Redis 相关功能需要集成测试

describe('QueueRateLimiter 初始化配置', () => {
  test('默认配置应该正确', () => {
    const QueueRateLimiter = require('../../src/infra/rateLimiter/QueueRateLimiter');
    const limiter = new QueueRateLimiter();

    assert.strictEqual(limiter.config.strategy, QueueRateLimiter.STRATEGIES.SLIDING_WINDOW);
    assert.strictEqual(limiter.config.maxRequests, 100);
    assert.strictEqual(limiter.config.windowMs, 60000);
    assert.strictEqual(limiter.config.queueMaxSize, 0);
    assert.strictEqual(limiter.config.queueTimeoutMs, 30000);
  });

  test('自定义配置应该正确应用', () => {
    const QueueRateLimiter = require('../../src/infra/rateLimiter/QueueRateLimiter');
    const limiter = new QueueRateLimiter({
      strategy: 'fixed_window',
      maxRequests: 50,
      windowMs: 30000,
      queueMaxSize: 10
    });

    assert.strictEqual(limiter.config.strategy, 'fixed_window');
    assert.strictEqual(limiter.config.maxRequests, 50);
    assert.strictEqual(limiter.config.windowMs, 30000);
    assert.strictEqual(limiter.config.queueMaxSize, 10);
  });

  test('策略常量应该正确', () => {
    const QueueRateLimiter = require('../../src/infra/rateLimiter/QueueRateLimiter');

    assert.strictEqual(QueueRateLimiter.STRATEGIES.FIXED_WINDOW, 'fixed_window');
    assert.strictEqual(QueueRateLimiter.STRATEGIES.SLIDING_WINDOW, 'sliding_window');
    assert.strictEqual(QueueRateLimiter.STRATEGIES.TOKEN_BUCKET, 'token_bucket');
  });
});

describe('QueueRateLimiter acquire 内存降级', () => {
  test('首次请求应该允许', async () => {
    const QueueRateLimiter = require('../../src/infra/rateLimiter/QueueRateLimiter');
    const limiter = new QueueRateLimiter({
      maxRequests: 10,
      windowMs: 60000
    });

    const result = await limiter.acquire('test-user-1');

    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.remaining, 9);
    assert.strictEqual(result.current, 1);
  });

  test('达到限制应该拒绝', async () => {
    const QueueRateLimiter = require('../../src/infra/rateLimiter/QueueRateLimiter');
    const limiter = new QueueRateLimiter({
      maxRequests: 3,
      windowMs: 60000
    });

    // 3个请求
    await limiter.acquire('test-user-2');
    await limiter.acquire('test-user-2');
    const result = await limiter.acquire('test-user-2');

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.remaining, 0);
    assert.ok(result.retryAfterMs > 0);
  });

  test('不同用户应该独立计数', async () => {
    const QueueRateLimiter = require('../../src/infra/rateLimiter/QueueRateLimiter');
    const limiter = new QueueRateLimiter({
      maxRequests: 5,
      windowMs: 60000
    });

    await limiter.acquire('user-a');
    await limiter.acquire('user-a');
    await limiter.acquire('user-b');

    const resultA = await limiter.acquire('user-a');
    const resultB = await limiter.acquire('user-b');

    assert.strictEqual(resultA.remaining, 2); // 5-3=2
    assert.strictEqual(resultB.remaining, 4); // 5-1=4
  });

  test('固定窗口策略应该正确工作', async () => {
    const QueueRateLimiter = require('../../src/infra/rateLimiter/QueueRateLimiter');
    const limiter = new QueueRateLimiter({
      strategy: QueueRateLimiter.STRATEGIES.FIXED_WINDOW,
      maxRequests: 2,
      windowMs: 60000
    });

    const r1 = await limiter.acquire('test-fixed');
    const r2 = await limiter.acquire('test-fixed');
    const r3 = await limiter.acquire('test-fixed');

    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r2.allowed, true);
    assert.strictEqual(r3.allowed, false);
  });

  test('令牌桶策略应该正确工作', async () => {
    const QueueRateLimiter = require('../../src/infra/rateLimiter/QueueRateLimiter');
    const limiter = new QueueRateLimiter({
      strategy: QueueRateLimiter.STRATEGIES.TOKEN_BUCKET,
      maxRequests: 5,
      windowMs: 1000,
      burstCapacity: 5
    });

    // 消耗所有令牌
    await limiter.acquire('test-bucket');
    await limiter.acquire('test-bucket');
    await limiter.acquire('test-bucket');
    await limiter.acquire('test-bucket');
    const result = await limiter.acquire('test-bucket');

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.remaining, 0);
  });
});

describe('QueueRateLimiter getStatus', () => {
  test('应该返回限流状态', async () => {
    const QueueRateLimiter = require('../../src/infra/rateLimiter/QueueRateLimiter');
    const limiter = new QueueRateLimiter({
      maxRequests: 10,
      windowMs: 60000
    });

    await limiter.acquire('status-user');

    const status = await limiter.getStatus('status-user');

    assert.strictEqual(status.allowed, true);
    assert.strictEqual(status.total, 10);
    assert.strictEqual(status.current, 1);
    assert.ok(status.resetAt > Date.now());
  });
});

describe('QueueRateLimiter reset', () => {
  test('应该重置限流状态', async () => {
    const QueueRateLimiter = require('../../src/infra/rateLimiter/QueueRateLimiter');
    const limiter = new QueueRateLimiter({
      maxRequests: 2,
      windowMs: 60000
    });

    await limiter.acquire('reset-user');
    await limiter.acquire('reset-user');
    await limiter.reset('reset-user');

    const status = await limiter.getStatus('reset-user');

    assert.strictEqual(status.allowed, true);
    assert.strictEqual(status.current, 0);
  });
});

describe('QueueRateLimiter enqueue', () => {
  test('无队列限制时应该直接检查', async () => {
    const QueueRateLimiter = require('../../src/infra/rateLimiter/QueueRateLimiter');
    const limiter = new QueueRateLimiter({
      maxRequests: 5,
      queueMaxSize: 0
    });

    const result = await limiter.enqueue('queue-user');

    assert.strictEqual(result.allowed, true);
  });
});

console.log('\n');
