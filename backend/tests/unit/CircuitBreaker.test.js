/**
 * 熔断器 单元测试
 *
 * 测试内容：
 * 1. CircuitBreaker 基本状态转换
 * 2. 熔断器工厂
 * 3. 统计信息
 * 4. 事件触发
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

const { CircuitBreaker, CircuitBreakerFactory, CircuitState, breakerFactory } = require('../../src/common/CircuitBreaker');

describe('CircuitBreaker 基本状态转换', () => {
  test('初始状态应该是 CLOSED', () => {
    const breaker = new CircuitBreaker({ name: 'test' });
    assert.strictEqual(breaker.state, CircuitState.CLOSED);
  });

  test('默认配置应该正确', () => {
    const breaker = new CircuitBreaker();
    assert.strictEqual(breaker.name, 'default');
    assert.strictEqual(breaker.failureThreshold, 5);
    assert.strictEqual(breaker.successThreshold, 3);
    assert.strictEqual(breaker.timeout, 60000);
  });

  test('自定义配置应该正确应用', () => {
    const breaker = new CircuitBreaker({
      name: 'custom',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 10000
    });
    assert.strictEqual(breaker.name, 'custom');
    assert.strictEqual(breaker.failureThreshold, 3);
    assert.strictEqual(breaker.successThreshold, 2);
    assert.strictEqual(breaker.timeout, 10000);
  });
});

describe('CircuitBreaker execute 正常路径', () => {
  test('成功操作应该正常返回', async () => {
    const breaker = new CircuitBreaker({ name: 'test-success' });
    const result = await breaker.execute(async () => 'success');
    assert.strictEqual(result, 'success');
  });

  test('成功操作应该重置失败计数', async () => {
    const breaker = new CircuitBreaker({ name: 'test-reset', failureThreshold: 3 });
    breaker.failureCount = 2;
    await breaker.execute(async () => 'success');
    assert.strictEqual(breaker.failureCount, 0);
  });

  test('成功操作应该增加成功计数', async () => {
    const breaker = new CircuitBreaker({ name: 'test-count' });
    await breaker.execute(async () => 'success');
    assert.strictEqual(breaker.stats.successfulCalls, 1);
  });
});

describe('CircuitBreaker execute 异常路径', () => {
  test('失败操作应该增加失败计数', async () => {
    const breaker = new CircuitBreaker({ name: 'test-fail' });
    try {
      await breaker.execute(async () => { throw new Error('fail'); });
    } catch (e) {}
    assert.strictEqual(breaker.stats.failedCalls, 1);
  });

  test('达到失败阈值后应该转换到 OPEN 状态', async () => {
    const breaker = new CircuitBreaker({ name: 'test-open', failureThreshold: 2 });
    try {
      await breaker.execute(async () => { throw new Error('fail1'); });
    } catch (e) {}
    try {
      await breaker.execute(async () => { throw new Error('fail2'); });
    } catch (e) {}
    assert.strictEqual(breaker.state, CircuitState.OPEN);
  });

  test('OPEN 状态时应该拒绝执行并抛出错误', async () => {
    const breaker = new CircuitBreaker({ name: 'test-reject', failureThreshold: 1 });
    try {
      await breaker.execute(async () => { throw new Error('fail'); });
    } catch (e) {}

    try {
      await breaker.execute(async () => 'should not run');
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('CircuitBreaker'));
    }
  });

  test('OPEN 状态时如果有 fallback 应该调用 fallback', async () => {
    const breaker = new CircuitBreaker({ name: 'test-fallback', failureThreshold: 1 });
    try {
      await breaker.execute(async () => { throw new Error('fail'); });
    } catch (e) {}

    const result = await breaker.execute(async () => 'should not run', async () => 'fallback result');
    assert.strictEqual(result, 'fallback result');
  });
});

describe('CircuitBreaker 半开状态 (HALF_OPEN)', () => {
  test('超时后应该转换到 HALF_OPEN', async () => {
    const breaker = new CircuitBreaker({
      name: 'test-half-open',
      failureThreshold: 1,
      timeout: 100
    });

    try {
      await breaker.execute(async () => { throw new Error('fail'); });
    } catch (e) {}
    assert.strictEqual(breaker.state, CircuitState.OPEN);

    await new Promise(resolve => setTimeout(resolve, 150));
    assert.strictEqual(breaker.canExecute(), true);
    assert.strictEqual(breaker.state, CircuitState.HALF_OPEN);
  });

  test('HALF_OPEN 状态下成功应该转换到 CLOSED', async () => {
    const breaker = new CircuitBreaker({
      name: 'test-half-open-success',
      failureThreshold: 1,
      successThreshold: 1,
      timeout: 100
    });

    try {
      await breaker.execute(async () => { throw new Error('fail'); });
    } catch (e) {}

    await new Promise(resolve => setTimeout(resolve, 150));
    breaker.canExecute();
    await breaker.execute(async () => 'success');
    assert.strictEqual(breaker.state, CircuitState.CLOSED);
  });

  test('HALF_OPEN 状态下失败应该回到 OPEN', async () => {
    const breaker = new CircuitBreaker({
      name: 'test-half-open-fail',
      failureThreshold: 1,
      successThreshold: 2,
      timeout: 100
    });

    try {
      await breaker.execute(async () => { throw new Error('fail'); });
    } catch (e) {}

    await new Promise(resolve => setTimeout(resolve, 150));
    breaker.canExecute();

    try {
      await breaker.execute(async () => { throw new Error('fail'); });
    } catch (e) {}
    assert.strictEqual(breaker.state, CircuitState.OPEN);
  });

  test('HALF_OPEN 状态下达到成功阈值应该关闭', async () => {
    const breaker = new CircuitBreaker({
      name: 'test-success-threshold',
      failureThreshold: 1,
      successThreshold: 2,
      timeout: 100
    });

    try {
      await breaker.execute(async () => { throw new Error('fail'); });
    } catch (e) {}

    await new Promise(resolve => setTimeout(resolve, 150));
    breaker.canExecute();
    await breaker.execute(async () => 'success1');
    await breaker.execute(async () => 'success2');
    assert.strictEqual(breaker.state, CircuitState.CLOSED);
  });
});

describe('CircuitBreaker getState', () => {
  test('应该返回完整状态信息', () => {
    const breaker = new CircuitBreaker({ name: 'test-state' });
    const state = breaker.getState();
    assert.strictEqual(state.circuit, 'test-state');
    assert.strictEqual(state.state, CircuitState.CLOSED);
    assert.strictEqual(state.failureCount, 0);
    assert.ok(state.stats);
  });
});

describe('CircuitBreaker reset', () => {
  test('应该重置所有状态', () => {
    const breaker = new CircuitBreaker({ name: 'test-reset', failureThreshold: 2 });
    breaker.failureCount = 2;
    breaker.state = CircuitState.OPEN;
    breaker.reset();
    assert.strictEqual(breaker.state, CircuitState.CLOSED);
    assert.strictEqual(breaker.failureCount, 0);
    assert.strictEqual(breaker.stats.totalCalls, 0);
  });
});

describe('CircuitBreaker forceOpen', () => {
  test('应该强制打开熔断器', () => {
    const breaker = new CircuitBreaker({ name: 'test-force' });
    breaker.forceOpen();
    assert.strictEqual(breaker.state, CircuitState.OPEN);
  });
});

describe('CircuitBreaker 统计信息', () => {
  test('应该正确记录调用统计', async () => {
    const breaker = new CircuitBreaker({ name: 'test-stats' });
    await breaker.execute(async () => 'success');
    try {
      await breaker.execute(async () => { throw new Error('fail'); });
    } catch (e) {}
    assert.strictEqual(breaker.stats.totalCalls, 2);
    assert.strictEqual(breaker.stats.successfulCalls, 1);
    assert.strictEqual(breaker.stats.failedCalls, 1);
  });

  test('状态转换应该记录到 stateChanges', () => {
    const breaker = new CircuitBreaker({ name: 'test-state-changes', failureThreshold: 1 });
    breaker.forceOpen();
    assert.strictEqual(breaker.stats.stateChanges.length, 1);
    assert.strictEqual(breaker.stats.stateChanges[0].from, CircuitState.CLOSED);
    assert.strictEqual(breaker.stats.stateChanges[0].to, CircuitState.OPEN);
  });
});

describe('CircuitBreakerFactory', () => {
  test('get 应该创建新的熔断器', () => {
    const factory = new CircuitBreakerFactory();
    const breaker = factory.get('new-breaker');
    assert.ok(breaker instanceof CircuitBreaker);
    assert.strictEqual(breaker.name, 'new-breaker');
  });

  test('get 应该返回已存在的熔断器', () => {
    const factory = new CircuitBreakerFactory();
    const breaker1 = factory.get('existing');
    const breaker2 = factory.get('existing');
    assert.strictEqual(breaker1, breaker2);
  });

  test('getAllStates 应该返回所有熔断器状态', () => {
    const factory = new CircuitBreakerFactory();
    factory.get('breaker1');
    factory.get('breaker2');
    const states = factory.getAllStates();
    assert.strictEqual(states.length, 2);
  });

  test('resetAll 应该重置所有熔断器', () => {
    const factory = new CircuitBreakerFactory();
    const breaker = factory.get('test-reset-all');
    breaker.forceOpen();
    factory.resetAll();
    assert.strictEqual(breaker.state, CircuitState.CLOSED);
  });
});

describe('breakerFactory 全局实例', () => {
  test('应该是一个 CircuitBreakerFactory 实例', () => {
    assert.ok(breakerFactory instanceof CircuitBreakerFactory);
  });
});

console.log('\n');
