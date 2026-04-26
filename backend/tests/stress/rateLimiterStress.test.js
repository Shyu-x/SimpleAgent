/**
 * 限流器压力测试
 */

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}: ${error.message}`);
    failed++;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== QueueRateLimiter Mock ==========

class QueueRateLimiter {
  constructor(config = {}) {
    this.windowMs = config.windowMs || 60000;  // 窗口大小（毫秒）
    this.maxRequests = config.maxRequests || 100;  // 窗口内最大请求数
    this.keyPrefix = config.keyPrefix || 'ratelimit:';

    // 内存存储（模拟 Redis ZSET）
    this.storage = new Map();

    // 启动清理定时器
    this.cleanupInterval = setInterval(() => this._cleanup(), 10000);
  }

  /**
   * 检查是否允许请求
   * @param {string} key - 限流 key（如用户 ID）
   * @returns {Promise<{allowed: boolean, remaining: number, resetTime: number}>}
   */
  async check(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const storageKey = this.keyPrefix + key;

    // 获取当前窗口的请求记录
    let requests = this.storage.get(storageKey) || [];

    // 清理过期记录
    requests = requests.filter(ts => ts > windowStart);

    // 检查是否超限
    if (requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...requests);
      const resetTime = oldestRequest + this.windowMs - now;

      return {
        allowed: false,
        remaining: 0,
        resetTime: resetTime > 0 ? resetTime : 0,
        total: this.maxRequests
      };
    }

    // 允许请求
    requests.push(now);
    this.storage.set(storageKey, requests);

    return {
      allowed: true,
      remaining: this.maxRequests - requests.length,
      resetTime: this.windowMs,
      total: this.maxRequests
    };
  }

  /**
   * 消耗一个请求配额
   */
  async consume(key) {
    const result = await this.check(key);
    return result;
  }

  /**
   * 重置限流
   */
  async reset(key) {
    const storageKey = this.keyPrefix + key;
    this.storage.delete(storageKey);
    return true;
  }

  /**
   * 获取当前请求数
   */
  async getCount(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const storageKey = this.keyPrefix + key;

    const requests = this.storage.get(storageKey) || [];
    return requests.filter(ts => ts > windowStart).length;
  }

  /**
   * 清理过期记录
   */
  _cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, requests] of this.storage.entries()) {
      const filtered = requests.filter(ts => ts > windowStart);
      if (filtered.length === 0) {
        this.storage.delete(key);
      } else if (filtered.length !== requests.length) {
        this.storage.set(key, filtered);
      }
    }
  }

  /**
   * 获取存储统计
   */
  getStats() {
    return {
      activeKeys: this.storage.size,
      windowMs: this.windowMs,
      maxRequests: this.maxRequests
    };
  }

  /**
   * 销毁
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// ========== Tests ==========

async function runTests() {
  console.log('\n========================================');
  console.log('QueueRateLimiter 压力测试');
  console.log('========================================\n');

  // ========== 1. 基本限流测试 ==========
  console.log('【1. 基本限流测试】');

  await runTest('单窗口限流应正确限制', async () => {
    const limiter = new QueueRateLimiter({ windowMs: 60000, maxRequests: 5 });

    // 前 5 个请求应通过 (使用同一个 key)
    for (let i = 0; i < 5; i++) {
      const result = await limiter.check('same_user');
      if (!result.allowed) {
        throw new Error(`请求 ${i + 1} 应被允许，但被拒绝`);
      }
    }

    // 第 6 个请求应被拒绝 (仍是同一个 key)
    const result6 = await limiter.check('same_user');
    if (result6.allowed) {
      throw new Error(`第 6 个请求应被拒绝，但被允许`);
    }

    limiter.destroy();
  });

  await runTest('remaining 应正确递减', async () => {
    const limiter = new QueueRateLimiter({ windowMs: 60000, maxRequests: 10 });

    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(await limiter.consume('user'));
    }

    // 第一个请求后 remaining = max - 1 = 9
    assertEqual(results[0].remaining, 9, '第一个请求后 remaining 应为 9');
    // 第 10 个请求后 remaining = 0
    assertEqual(results[9].remaining, 0, '第 10 个请求后 remaining 应为 0');

    limiter.destroy();
  });

  // ========== 2. 窗口重置测试 ==========
  console.log('\n【2. 窗口重置测试】');

  await runTest('reset 应清除限流计数', async () => {
    const limiter = new QueueRateLimiter({ windowMs: 1000, maxRequests: 3 });

    // 消耗配额
    await limiter.consume('user');
    await limiter.consume('user');
    await limiter.consume('user');

    // 确认被限流
    const blocked = await limiter.check('user');
    assertTrue(!blocked.allowed, '应被限流');

    // 重置
    await limiter.reset('user');

    // 应该可以继续请求
    const afterReset = await limiter.check('user');
    assertTrue(afterReset.allowed, '重置后应允许请求');

    limiter.destroy();
  });

  // ========== 3. 并发测试 ==========
  console.log('\n【3. 并发测试】');

  await runTest('100 并发请求应正确处理', async () => {
    const limiter = new QueueRateLimiter({ windowMs: 60000, maxRequests: 50 });

    // 同一用户 100 并发请求
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(limiter.check('same_user'));
    }

    const results = await Promise.all(promises);
    const allowed = results.filter(r => r.allowed).length;
    const rejected = results.filter(r => !r.allowed).length;

    console.log(`    允许: ${allowed}, 拒绝: ${rejected}`);

    // 由于并发执行，很多请求会同时检查看到相同的计数值
    // 但最终只有最多 maxRequests 个被允许
    assertTrue(allowed <= 50, `允许数量不应超过 50，实际: ${allowed}`);

    limiter.destroy();
  });

  await runTest('同一 key 100 并发应正确处理', async () => {
    const limiter = new QueueRateLimiter({ windowMs: 60000, maxRequests: 10 });

    // 同一用户 100 并发请求
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(limiter.check('same_user'));
    }

    const results = await Promise.all(promises);
    const allowed = results.filter(r => r.allowed).length;

    // 最多允许 10 个
    assertTrue(allowed <= 10, `允许数量不应超过 10，实际: ${allowed}`);

    limiter.destroy();
  });

  // ========== 4. 多 key 测试 ==========
  console.log('\n【4. 多 key 测试】');

  await runTest('不同 key 应独立限流', async () => {
    const limiter = new QueueRateLimiter({ windowMs: 60000, maxRequests: 5 });

    // 用户 A 消耗 5 个配额
    for (let i = 0; i < 5; i++) {
      await limiter.check('user_a');
    }

    // 用户 A 被限流
    const aBlocked = await limiter.check('user_a');
    assertTrue(!aBlocked.allowed, '用户 A 应被限流');

    // 用户 B 仍可请求
    const bAllowed = await limiter.check('user_b');
    assertTrue(bAllowed.allowed, '用户 B 应被允许');

    limiter.destroy();
  });

  await runTest('多用户并发应正确追踪', async () => {
    const limiter = new QueueRateLimiter({ windowMs: 60000, maxRequests: 100 });

    // 10 个用户，每个发送 20 个请求
    const promises = [];
    for (let u = 0; u < 10; u++) {
      for (let r = 0; r < 20; r++) {
        promises.push(limiter.check(`user_${u}`));
      }
    }

    const results = await Promise.all(promises);
    const allowed = results.filter(r => r.allowed).length;
    const rejected = results.filter(r => !r.allowed).length;

    console.log(`    10 用户 × 20 请求: 允许 ${allowed}, 拒绝 ${rejected}`);

    // 每个用户最多 100 请求，10 用户 = 1000 容量
    // 200 总请求 < 1000，所以应该全部允许
    assertEqual(allowed, 200, '所有请求都应被允许');

    limiter.destroy();
  });

  // ========== 5. 性能测试 ==========
  console.log('\n【5. 性能测试】');

  await runTest('1000 次操作延迟 P99 < 100ms', async () => {
    const limiter = new QueueRateLimiter({ windowMs: 60000, maxRequests: 1000 });

    const latencies = [];
    for (let i = 0; i < 1000; i++) {
      const start = Date.now();
      await limiter.check(`user_${i}`);
      latencies.push(Date.now() - start);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p90 = latencies[Math.floor(latencies.length * 0.9)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    console.log(`    P50: ${p50}ms, P90: ${p90}ms, P99: ${p99}ms`);

    assertTrue(p99 < 100, `P99 延迟应 < 100ms，实际: ${p99}ms`);

    limiter.destroy();
  });

  await runTest('100 并发 QPS > 500', async () => {
    const limiter = new QueueRateLimiter({ windowMs: 60000, maxRequests: 10000 });

    const startTime = Date.now();
    const concurrency = 100;
    const requestsPerThread = 100;

    const promises = [];
    for (let t = 0; t < concurrency; t++) {
      for (let r = 0; r < requestsPerThread; r++) {
        promises.push(limiter.check(`user_${t}`));
      }
    }

    await Promise.all(promises);
    const duration = Date.now() - startTime;
    const qps = (concurrency * requestsPerThread) / (duration / 1000);

    console.log(`    ${concurrency * requestsPerThread} 请求耗时: ${duration}ms, QPS: ${qps.toFixed(0)}`);

    assertTrue(qps > 500, `QPS 应 > 500，实际: ${qps.toFixed(0)}`);

    limiter.destroy();
  });

  // ========== 6. 统计测试 ==========
  console.log('\n【6. 统计测试】');

  await runTest('getStats 应返回正确统计', async () => {
    const limiter = new QueueRateLimiter({ windowMs: 60000, maxRequests: 100 });

    // 添加一些请求
    for (let i = 0; i < 10; i++) {
      await limiter.check(`user_${i}`);
    }

    const stats = limiter.getStats();

    assertEqual(stats.activeKeys, 10, '活跃 key 数应为 10');
    assertEqual(stats.maxRequests, 100, 'maxRequests 应为 100');
    assertEqual(stats.windowMs, 60000, 'windowMs 应为 60000');

    limiter.destroy();
  });

  // ========== 7. 边界测试 ==========
  console.log('\n【7. 边界测试】');

  await runTest('windowMs 为 1ms 应正常工作', async () => {
    const limiter = new QueueRateLimiter({ windowMs: 1, maxRequests: 5 });

    // 快速发送 10 个请求
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(await limiter.check('user'));
      await sleep(1);
    }

    const allowed = results.filter(r => r.allowed).length;
    console.log(`    1ms 窗口允许: ${allowed}`);

    // 由于窗口极小，很多请求会被清理
    assertTrue(allowed > 0, '应有一些请求被允许');

    limiter.destroy();
  });

  await runTest('maxRequests 为 1 应正确限流', async () => {
    const limiter = new QueueRateLimiter({ windowMs: 60000, maxRequests: 1 });

    const first = await limiter.check('user');
    assertTrue(first.allowed, '第一个请求应被允许');

    const second = await limiter.check('user');
    assertTrue(!second.allowed, '第二个请求应被拒绝');

    limiter.destroy();
  });

  // ========== 汇总 ==========
  console.log('\n========================================');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('========================================\n');

  return { passed, failed };
}

// 运行
runTests()
  .then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('测试执行失败:', err);
    process.exit(1);
  });
