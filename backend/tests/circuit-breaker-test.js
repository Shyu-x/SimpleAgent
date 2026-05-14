/**
 * 熔断器和限流器测试脚本
 * 验证 resilience 和 rate-limiter 模块的功能
 */

const path = require('path');

// 测试熔断器集成
async function testCircuitBreaker() {
  console.log('\n=== 测试熔断器模块 ===\n');

  // 导入熔断器集成模块
  const {
    getBreaker,
    getBreakerWithPreset,
    getAllBreakerStats,
    resetAllBreakers,
    PRESETS
  } = require('../src/common/resilience/integration');

  // 测试1: 使用预设获取熔断器
  console.log('测试1: 使用 STANDARD 预设创建熔断器');
  const breaker1 = getBreakerWithPreset('test-service-1', 'STANDARD');
  console.log(`  - 熔断器名称: ${breaker1.name}`);
  console.log(`  - 当前状态: ${breaker1.state}`);

  // 测试2: 直接获取熔断器（自定义配置）
  console.log('\n测试2: 直接创建熔断器（自定义配置）');
  const breaker2 = getBreaker('test-service-2', {
    failureThreshold: 2,
    successThreshold: 1,
    resetTimeout: 5000,
    halfOpenProbeTimeout: 2000,
  });
  console.log(`  - 熔断器名称: ${breaker2.name}`);
  console.log(`  - 失败阈值: ${breaker2.failureThreshold}`);

  // 测试3: 熔断器执行（成功）
  console.log('\n测试3: 执行成功操作');
  const successResult = await breaker1.execute(
    () => Promise.resolve('操作成功'),
    () => '降级响应'
  );
  console.log(`  - 结果: ${successResult}`);

  // 测试4: 熔断器执行（失败）
  console.log('\n测试4: 执行失败操作（触发熔断）');
  try {
    await breaker2.execute(
      () => Promise.reject(new Error('模拟API失败')),
      () => '降级响应'
    );
  } catch (error) {
    console.log(`  - 抛出错误（预期）: ${error.message}`);
  }

  // 测试5: 连续失败触发熔断打开
  console.log('\n测试5: 连续失败触发熔断打开');
  const breaker3 = getBreaker('test-service-3', {
    failureThreshold: 3,
    successThreshold: 1,
    resetTimeout: 5000,
  });

  // 模拟3次失败
  for (let i = 0; i < 3; i++) {
    try {
      await breaker3.execute(() => Promise.reject(new Error('失败')));
    } catch (e) {}
  }
  console.log(`  - 熔断器状态: ${breaker3.state}`);
  console.log(`  - 失败计数: ${breaker3.stats.failureCount}`);

  // 测试6: 获取所有熔断器状态
  console.log('\n测试6: 获取所有熔断器统计');
  const allStats = getAllBreakerStats();
  console.log(`  - 注册的熔断器数量: ${allStats.length}`);
  allStats.forEach(stat => {
    console.log(`    - ${stat.name}: ${stat.state}, failures=${stat.totalFailures}, successes=${stat.totalSuccesses}`);
  });

  // 测试7: 熔断器重置
  console.log('\n测试7: 重置所有熔断器');
  resetAllBreakers();
  console.log('  - 所有熔断器已重置');

  // 测试预设配置
  console.log('\n测试8: 可用的预设配置');
  console.log(`  - PRESETS: ${Object.keys(PRESETS).join(', ')}`);
}

// 测试限流器集成
async function testRateLimiter() {
  console.log('\n\n=== 测试限流器模块 ===\n');

  const {
    MemoryRateLimiter,
    RATE_LIMIT_PRESETS,
    getLimiter,
    createRateLimiterMiddleware,
    globalRateLimiter,
    chatRateLimiter
  } = require('../src/common/rate-limiter/integration');

  // 测试1: 使用预设创建限流器
  console.log('测试1: 使用预设创建限流器');
  const chatLimiter = getLimiter('chat');
  console.log(`  - 限流器 maxRequests: ${chatLimiter.maxRequests}`);
  console.log(`  - 限流器 windowMs: ${chatLimiter.windowMs}`);

  // 测试2: 限流检查（未超限）
  console.log('\n测试2: 执行限流检查（未超限）');
  const result1 = await chatLimiter.acquire('user-123', 'global');
  console.log(`  - 标识符: user-123`);
  console.log(`  - 允许: ${result1.allowed}`);
  console.log(`  - 剩余: ${result1.remaining}`);
  console.log(`  - 当前: ${result1.current}`);

  // 测试3: 连续请求触发限流
  console.log('\n测试3: 连续请求触发限流');
  const testLimiter = new MemoryRateLimiter({ maxRequests: 3, windowMs: 60000 });

  for (let i = 1; i <= 5; i++) {
    const result = await testLimiter.acquire(`user-test-${i}`, 'scope');
    console.log(`  - 请求 ${i}: allowed=${result.allowed}, remaining=${result.remaining}`);
  }

  // 测试4: 限流状态查询
  console.log('\n测试4: 查询限流状态');
  const status = await testLimiter.getStatus('user-test-5', 'scope');
  console.log(`  - 当前请求数: ${status.current}`);
  console.log(`  - 剩余配额: ${status.remaining}`);
  console.log(`  - 重置时间: ${new Date(status.resetAt).toISOString()}`);

  // 测试5: 限流重置
  console.log('\n测试5: 重置限流记录');
  await testLimiter.reset('user-test-5', 'scope');
  const afterReset = await testLimiter.getStatus('user-test-5', 'scope');
  console.log(`  - 重置后当前请求数: ${afterReset.current}`);

  // 测试6: 创建自定义中间件
  console.log('\n测试6: 创建自定义限流中间件');
  const customMiddleware = createRateLimiterMiddleware({
    maxRequests: 10,
    windowMs: 60000,
    keyGenerator: (req) => req.headers['x-user-id'] || 'anonymous',
    onLimitReached: (req, res, retryAfter) => {
      res.setHeader('X-Custom-Limit', 'reached');
    }
  });
  console.log(`  - 中间件已创建（最大10请求/分钟）`);

  // 测试预设
  console.log('\n测试7: 可用的限流预设');
  console.log(`  - RATE_LIMIT_PRESETS: ${Object.keys(RATE_LIMIT_PRESETS).join(', ')}`);
}

// 执行测试
async function main() {
  console.log('========================================');
  console.log('  熔断器与限流器模块测试');
  console.log('========================================');

  try {
    await testCircuitBreaker();
    await testRateLimiter();

    console.log('\n========================================');
    console.log('  所有测试完成 ✓');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();