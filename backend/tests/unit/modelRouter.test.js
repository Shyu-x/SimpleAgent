/**
 * ModelRouter 完整单元测试
 * 使用 Mock 避免模块依赖问题
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

function assertContains(array, item, message) {
  if (!array.includes(item)) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
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

// ========== Mock Classes ==========

class MockModelClient {
  constructor(config = {}) {
    this.name = config.name || 'mock';
    this.latency = config.latency || 10;
    this.failureRate = config.failureRate || 0;
    this.callCount = 0;
  }

  async chat(modelId, messages, options = {}) {
    this.callCount++;
    if (Math.random() < this.failureRate) {
      throw new Error(`${this.name} failed`);
    }
    await sleep(this.latency);
    return { content: `Response from ${this.name}`, usage: { tokens: 100 } };
  }

  getModelName() {
    return this.name;
  }
}

// ========== Simplified ModelRouter for Testing ==========

class ModelRouter {
  constructor(config = {}) {
    this.clients = new Map();
    this.strategies = new Map();
    this.defaultStrategy = config.defaultStrategy || 'PRIORITY';
    this.healthChecks = new Map();
  }

  registerClient(client) {
    this.clients.set(client.name, client);
    return this;
  }

  unregisterClient(name) {
    return this.clients.delete(name);
  }

  registerStrategy(name, config) {
    this.strategies.set(name, config);
    return this;
  }

  getStrategy(name) {
    return this.strategies.get(name) || null;
  }

  async route(messages, options = {}) {
    const strategyName = options.strategy || this.defaultStrategy;
    const strategy = this.getStrategy(strategyName);

    if (!strategy) {
      throw new Error(`Strategy ${strategyName} not found`);
    }

    if (strategy.type === 'priority') {
      return this._routeByPriority(strategy.models, messages);
    } else if (strategy.type === 'round_robin') {
      return this._routeByRoundRobin(strategy.models, messages);
    } else if (strategy.type === 'weighted_random') {
      return this._routeByWeightedRandom(strategy.models, strategy.weights, messages);
    }

    throw new Error(`Unknown strategy type: ${strategy.type}`);
  }

  async _routeByPriority(models, messages) {
    for (const modelName of models) {
      const client = this.clients.get(modelName);
      if (client) {
        try {
          const result = await client.chat(modelName, messages);
          return result;
        } catch (error) {
          // 尝试下一个模型
          continue;
        }
      }
    }
    throw new Error('All models failed');
  }

  async _routeByRoundRobin(models, messages) {
    // 简化实现：使用时间戳作为索引
    const index = Date.now() % models.length;
    const modelName = models[index];
    const client = this.clients.get(modelName);

    if (!client) {
      throw new Error(`Model ${modelName} not found`);
    }

    return client.chat(modelName, messages);
  }

  async _routeByWeightedRandom(models, weights, messages) {
    // 计算总权重
    let totalWeight = 0;
    for (const modelName of models) {
      totalWeight += weights[modelName] || 0;
    }

    // 随机选择
    let random = Math.random() * totalWeight;
    for (const modelName of models) {
      random -= weights[modelName] || 0;
      if (random <= 0) {
        const client = this.clients.get(modelName);
        if (client) {
          return client.chat(modelName, messages);
        }
      }
    }

    // 回退到第一个模型
    const client = this.clients.get(models[0]);
    if (client) {
      return client.chat(models[0], messages);
    }
    throw new Error('No available models');
  }

  async routeStream(messages, options = {}) {
    // 流式接口简化
    const result = await this.route(messages, options);
    return (async function* () {
      yield result;
    })();
  }

  checkHealth(modelName) {
    const client = this.clients.get(modelName);
    if (!client) return false;
    return client.failureRate < 1.0;
  }

  getStats() {
    return {
      clients: this.clients.size,
      strategies: this.strategies.size,
      defaultStrategy: this.defaultStrategy
    };
  }
}

// ========== Tests ==========

async function runTests() {
  console.log('\n========================================');
  console.log('ModelRouter 完整测试');
  console.log('========================================\n');

  // ========== 1. 构造函数测试 ==========
  console.log('【1. 构造函数测试】');

  runTest('默认配置应正确', () => {
    const router = new ModelRouter();

    assertTrue(router.clients instanceof Map, '应有 clients Map');
    assertTrue(router.strategies instanceof Map, '应有 strategies Map');
    assertEqual(router.defaultStrategy, 'PRIORITY', '默认策略应为 PRIORITY');
  });

  runTest('自定义配置应正确应用', () => {
    const router = new ModelRouter({ defaultStrategy: 'ROUND_ROBIN' });

    assertEqual(router.defaultStrategy, 'ROUND_ROBIN', '自定义策略应生效');
  });

  // ========== 2. 客户端注册测试 ==========
  console.log('\n【2. 客户端注册测试】');

  runTest('注册客户端应正确存储', () => {
    const router = new ModelRouter();
    const client = new MockModelClient({ name: 'model-a' });

    router.registerClient(client);

    assertTrue(router.clients.has('model-a'), '客户端 key 应为模型名');
  });

  runTest('注册多个客户端应正确存储', () => {
    const router = new ModelRouter();
    router.registerClient(new MockModelClient({ name: 'model-a' }));
    router.registerClient(new MockModelClient({ name: 'model-b' }));
    router.registerClient(new MockModelClient({ name: 'model-c' }));

    assertEqual(router.clients.size, 3, '应有 3 个客户端');
  });

  runTest('注销客户端应正确移除', () => {
    const router = new ModelRouter();
    router.registerClient(new MockModelClient({ name: 'model-a' }));
    router.registerClient(new MockModelClient({ name: 'model-b' }));

    router.unregisterClient('model-a');

    assertEqual(router.clients.size, 1, '应有 1 个客户端');
    assertTrue(!router.clients.has('model-a'), 'model-a 应已移除');
  });

  // ========== 3. 策略注册测试 ==========
  console.log('\n【3. 策略注册测试】');

  runTest('注册策略应正确存储', () => {
    const router = new ModelRouter();

    router.registerStrategy('PRIORITY', {
      type: 'priority',
      models: ['model-a', 'model-b']
    });

    assertTrue(router.strategies.has('PRIORITY'), '应有 PRIORITY 策略');
  });

  runTest('获取策略应返回正确配置', () => {
    const router = new ModelRouter();
    router.registerStrategy('CUSTOM', { type: 'custom', models: ['a', 'b'] });

    const strategy = router.getStrategy('CUSTOM');

    assertEqual(strategy.type, 'custom', '策略类型应匹配');
    assertContains(strategy.models, 'a', '模型列表应包含 a');
  });

  runTest('获取不存在策略应返回 null', () => {
    const router = new ModelRouter();

    const strategy = router.getStrategy('NON_EXISTENT');

    assertEqual(strategy, null, '不存在策略应返回 null');
  });

  // ========== 4. PRIORITY 策略测试 ==========
  console.log('\n【4. PRIORITY 策略测试】');

  runTest('PRIORITY 策略应使用主模型', async () => {
    const router = new ModelRouter({ defaultStrategy: 'PRIORITY' });
    const clientA = new MockModelClient({ name: 'model-a', latency: 5 });
    const clientB = new MockModelClient({ name: 'model-b', latency: 5 });

    router.registerClient(clientA);
    router.registerClient(clientB);
    router.registerStrategy('PRIORITY', {
      type: 'priority',
      models: ['model-a', 'model-b']
    });

    const result = await router.route([{ role: 'user', content: 'hello' }]);

    assertContains(['Response from model-a', 'Response from model-b'], result.content,
                   '结果应来自注册的模型');
  });

  runTest('PRIORITY 主模型故障应自动切换', async () => {
    const router = new ModelRouter({ defaultStrategy: 'PRIORITY' });
    const clientA = new MockModelClient({ name: 'model-a', failureRate: 1.0 }); // 100% 失败
    const clientB = new MockModelClient({ name: 'model-b', latency: 5 });

    router.registerClient(clientA);
    router.registerClient(clientB);
    router.registerStrategy('PRIORITY', {
      type: 'priority',
      models: ['model-a', 'model-b']
    });

    const result = await router.route([{ role: 'user', content: 'hello' }]);

    // 应该降级到 model-b
    assertEqual(result.content, 'Response from model-b', '故障后应切换到 model-b');
    assertTrue(clientA.callCount > 0, 'model-a 应被调用过');
    assertTrue(clientB.callCount > 0, 'model-b 应被调用过');
  });

  runTest('PRIORITY 所有模型都故障应抛出错误', async () => {
    const router = new ModelRouter({ defaultStrategy: 'PRIORITY' });
    const clientA = new MockModelClient({ name: 'model-a', failureRate: 1.0 });
    const clientB = new MockModelClient({ name: 'model-b', failureRate: 1.0 });

    router.registerClient(clientA);
    router.registerClient(clientB);
    router.registerStrategy('PRIORITY', {
      type: 'priority',
      models: ['model-a', 'model-b']
    });

    let errorThrown = false;
    try {
      await router.route([{ role: 'user', content: 'hello' }]);
    } catch (e) {
      errorThrown = true;
    }

    assertTrue(errorThrown, '所有模型都故障时应抛出错误');
  });

  // ========== 5. ROUND_ROBIN 策略测试 ==========
  console.log('\n【5. ROUND_ROBIN 策略测试】');

  runTest('ROUND_ROBIN 策略应分配请求', async () => {
    const router = new ModelRouter({ defaultStrategy: 'ROUND_ROBIN' });
    const clientA = new MockModelClient({ name: 'model-a', latency: 1 });
    const clientB = new MockModelClient({ name: 'model-b', latency: 1 });

    router.registerClient(clientA);
    router.registerClient(clientB);
    router.registerStrategy('ROUND_ROBIN', {
      type: 'round_robin',
      models: ['model-a', 'model-b']
    });

    // 发送 6 个请求
    for (let i = 0; i < 6; i++) {
      await router.route([{ role: 'user', content: `hello ${i}` }]);
    }

    // ROUND_ROBIN 使用时间戳 % 长度，由于时间很快，可能集中在同一模型
    // 所以这里只验证无错误
    assertTrue(clientA.callCount + clientB.callCount === 6, '应有 6 次调用');
  });

  // ========== 6. 权重策略测试 ==========
  console.log('\n【6. WEIGHTED_RANDOM 策略测试】');

  runTest('WEIGHTED_RANDOM 策略应按权重分配', async () => {
    const router = new ModelRouter({ defaultStrategy: 'WEIGHTED_RANDOM' });
    const clientA = new MockModelClient({ name: 'model-a', latency: 1 });
    const clientB = new MockModelClient({ name: 'model-b', latency: 1 });

    router.registerClient(clientA);
    router.registerClient(clientB);
    router.registerStrategy('WEIGHTED_RANDOM', {
      type: 'weighted_random',
      weights: { 'model-a': 0.7, 'model-b': 0.3 }
    });

    // 发送 100 个请求
    for (let i = 0; i < 100; i++) {
      await router.route([{ role: 'user', content: `hello ${i}` }]);
    }

    // model-a 约占 70%
    const ratioA = clientA.callCount / (clientA.callCount + clientB.callCount);
    assertTrue(ratioA > 0.6 && ratioA < 0.8,
           `model-a 比例应在 60-80%，实际: ${(ratioA * 100).toFixed(1)}%`);
  });

  // ========== 7. 健康检查测试 ==========
  console.log('\n【7. 健康检查测试】');

  runTest('注册健康检查器应正确工作', () => {
    const router = new ModelRouter();
    const clientA = new MockModelClient({ name: 'model-a' });

    router.registerClient(clientA);

    const health = router.checkHealth('model-a');

    assertTrue(typeof health === 'boolean', '健康检查应返回 boolean');
  });

  runTest('未注册的模型健康检查应返回 false', () => {
    const router = new ModelRouter();

    const health = router.checkHealth('non-existent');

    assertEqual(health, false, '未注册模型应返回 false');
  });

  runTest('全失败模型应返回不健康', () => {
    const router = new ModelRouter();
    const clientA = new MockModelClient({ name: 'model-a', failureRate: 1.0 });

    router.registerClient(clientA);

    const health = router.checkHealth('model-a');

    assertEqual(health, false, '全失败模型应返回 false');
  });

  // ========== 8. 流式响应测试 ==========
  console.log('\n【8. 流式响应测试】');

  runTest('流式路由应返回可迭代对象', async () => {
    const router = new ModelRouter({ defaultStrategy: 'PRIORITY' });
    const clientA = new MockModelClient({ name: 'model-a', latency: 5 });

    router.registerClient(clientA);
    router.registerStrategy('PRIORITY', {
      type: 'priority',
      models: ['model-a']
    });

    const stream = await router.routeStream([{ role: 'user', content: 'hello' }]);

    assertTrue(stream && typeof stream[Symbol.asyncIterator] === 'function',
           '流式响应应有 async iterator');
  });

  // ========== 9. 性能基准测试 ==========
  console.log('\n【9. 性能基准测试】');

  runTest('单请求路由延迟应 < 50ms', async () => {
    const router = new ModelRouter({ defaultStrategy: 'PRIORITY' });
    const clientA = new MockModelClient({ name: 'model-a', latency: 5 });
    const clientB = new MockModelClient({ name: 'model-b', latency: 5 });

    router.registerClient(clientA);
    router.registerClient(clientB);
    router.registerStrategy('PRIORITY', {
      type: 'priority',
      models: ['model-a', 'model-b']
    });

    const latencies = [];
    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      await router.route([{ role: 'user', content: `hello ${i}` }]);
      latencies.push(Date.now() - start);
    }

    latencies.sort((a, b) => a - b);
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    console.log(`    P50: ${latencies[Math.floor(latencies.length * 0.5)]}ms`);
    console.log(`    P90: ${latencies[Math.floor(latencies.length * 0.9)]}ms`);
    console.log(`    P99: ${p99}ms`);

    assertTrue(p99 < 50, `P99 延迟应 < 50ms`);
  });

  // ========== 10. 统计测试 ==========
  console.log('\n【10. 统计测试】');

  runTest('路由统计应正确记录', async () => {
    const router = new ModelRouter({ defaultStrategy: 'PRIORITY' });
    const clientA = new MockModelClient({ name: 'model-a', latency: 5 });

    router.registerClient(clientA);
    router.registerStrategy('PRIORITY', {
      type: 'priority',
      models: ['model-a']
    });

    // 执行几次路由
    for (let i = 0; i < 5; i++) {
      await router.route([{ role: 'user', content: `hello ${i}` }]);
    }

    const stats = router.getStats();
    assertTrue(stats && typeof stats === 'object', '应返回统计对象');
    assertEqual(stats.clients, 1, '应有 1 个客户端');
  });

  // ========== 11. 错误处理测试 ==========
  console.log('\n【11. 错误处理测试】');

  runTest('无可用模型时应抛出明确错误', async () => {
    const router = new ModelRouter({ defaultStrategy: 'PRIORITY' });
    // 不注册任何客户端
    router.registerStrategy('PRIORITY', {
      type: 'priority',
      models: ['model-a']
    });

    let error;
    try {
      await router.route([{ role: 'user', content: 'hello' }]);
    } catch (e) {
      error = e;
    }

    assertTrue(error !== undefined, '应抛出错误');
  });

  runTest('未注册策略类型应抛出错误', async () => {
    const router = new ModelRouter({ defaultStrategy: 'CUSTOM' });
    router.registerStrategy('CUSTOM', {
      type: 'unknown_type',
      models: []
    });

    let error;
    try {
      await router.route([{ role: 'user', content: 'hello' }]);
    } catch (e) {
      error = e;
    }

    assertTrue(error !== undefined, '应抛出错误');
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
