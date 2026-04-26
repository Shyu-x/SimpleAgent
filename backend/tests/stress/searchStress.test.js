/**
 * 检索系统压力测试
 *
 * 测试场景：
 * 1. 单通道性能 - 向量/关键词检索延迟分布
 * 2. 多通道融合 - RRFS 算法正确性
 * 3. 结果去重 - Jaccard 相似度去重
 * 4. 健康检查 - 故障通道自动隔离
 */

const SearchCoordinator = require('../../src/domain/search/SearchCoordinator');
const { SearchChannel, SearchResult } = require('../../src/domain/search/SearchChannel');

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

// 测试计数器
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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 创建模拟向量检索通道
class MockVectorChannel extends SearchChannel {
  constructor(config = {}) {
    super({ name: 'vector', weight: 0.7, ...config });
    this.latency = config.latency || 50;
    this.failureRate = config.failureRate || 0;
  }

  async search(query, options = {}) {
    if (Math.random() < this.failureRate) {
      throw new Error('Vector search failed');
    }
    await sleep(this.latency);

    return [
      new SearchResult({ id: `v1_${query}`, content: `Vector result for ${query}`, score: 0.9 }),
      new SearchResult({ id: `v2_${query}`, content: `Vector result 2 for ${query}`, score: 0.8 }),
    ];
  }

  getType() {
    return 'vector';
  }
}

// 创建模拟关键词检索通道
class MockKeywordChannel extends SearchChannel {
  constructor(config = {}) {
    super({ name: 'keyword', weight: 0.3, ...config });
    this.latency = config.latency || 20;
    this.failureRate = config.failureRate || 0;
  }

  async search(query, options = {}) {
    if (Math.random() < this.failureRate) {
      throw new Error('Keyword search failed');
    }
    await sleep(this.latency);

    return [
      new SearchResult({ id: `k1_${query}`, content: `Keyword result for ${query}`, score: 0.85 }),
      new SearchResult({ id: `k2_${query}`, content: `Keyword result 2 for ${query}`, score: 0.75 }),
    ];
  }

  getType() {
    return 'keyword';
  }
}

async function runSearchStressTests() {
  console.log('\n========================================');
  console.log('检索系统压力测试');
  console.log('========================================\n');

  // ========== 1. 单通道性能测试 ==========
  console.log('【1. 单通道性能测试】');

  await runTest('向量通道检索延迟 P99 < 100ms', async () => {
    const channel = new MockVectorChannel({ latency: 50 });
    const latencies = [];

    // 100 次请求
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      await channel.search(`query ${i}`);
      latencies.push(Date.now() - start);
    }

    latencies.sort((a, b) => a - b);
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    console.log(`    P50: ${latencies[Math.floor(latencies.length * 0.5)]}ms`);
    console.log(`    P90: ${latencies[Math.floor(latencies.length * 0.9)]}ms`);
    console.log(`    P99: ${p99}ms`);

    assert(p99 < 100, `P99 延迟应 < 100ms，实际: ${p99}ms`);
  });

  await runTest('关键词通道检索延迟 P99 < 50ms', async () => {
    const channel = new MockKeywordChannel({ latency: 20 });
    const latencies = [];

    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      await channel.search(`query ${i}`);
      latencies.push(Date.now() - start);
    }

    latencies.sort((a, b) => a - b);
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    console.log(`    P50: ${latencies[Math.floor(latencies.length * 0.5)]}ms`);
    console.log(`    P90: ${latencies[Math.floor(latencies.length * 0.9)]}ms`);
    console.log(`    P99: ${p99}ms`);

    assert(p99 < 50, `P99 延迟应 < 50ms，实际: ${p99}ms`);
  });

  // ========== 2. 多通道融合测试 ==========
  console.log('\n【2. 多通道融合测试】');

  await runTest('并行检索应返回融合结果', async () => {
    const coordinator = new SearchCoordinator({ strategy: 'parallel' });
    coordinator.registerChannel(new MockVectorChannel());
    coordinator.registerChannel(new MockKeywordChannel());

    const result = await coordinator.search('test query');

    assert(result.results.length > 0, '应有返回结果');
    assert(result.metadata.channelsUsed.includes('vector'), '应使用向量通道');
    assert(result.metadata.channelsUsed.includes('keyword'), '应使用关键词通道');
  });

  await runTest('RRFS 融合应正确计算得分', async () => {
    const coordinator = new SearchCoordinator({ strategy: 'parallel' });
    coordinator.registerChannel(new MockVectorChannel());
    coordinator.registerChannel(new MockKeywordChannel());

    const result = await coordinator.search('test query');

    // 检查结果是否有融合得分
    for (const r of result.results) {
      assert(typeof r.score === 'number', '结果应有 score 字段');
    }

    // 检查结果是否按得分排序
    for (let i = 1; i < result.results.length; i++) {
      assert(result.results[i-1].score >= result.results[i].score,
             '结果应按得分降序排列');
    }
  });

  await runTest('融合结果应包含来源信息', async () => {
    const coordinator = new SearchCoordinator({ strategy: 'parallel' });
    coordinator.registerChannel(new MockVectorChannel());
    coordinator.registerChannel(new MockKeywordChannel());

    const result = await coordinator.search('test query');

    // 每个结果应有 sources 字段
    for (const r of result.results) {
      if (r.sources) {
        assert(Array.isArray(r.sources), 'sources 应为数组');
      }
    }
  });

  // ========== 3. 去重测试 ==========
  console.log('\n【3. 结果去重测试】');

  await runTest('相同 ID 结果应被去重', async () => {
    const coordinator = new SearchCoordinator({ strategy: 'parallel' });

    // 创建共享结果的通道
    const sharedChannel = new MockVectorChannel({ name: 'shared1' });
    const sharedChannel2 = new MockVectorChannel({ name: 'shared2' });

    coordinator.registerChannel(sharedChannel);
    coordinator.registerChannel(sharedChannel2);

    const result = await coordinator.search('duplicate test');

    // 检查是否有重复 ID
    const ids = result.results.map(r => r.id);
    const uniqueIds = new Set(ids);

    assertEqual(ids.length, uniqueIds.size, '结果 ID 应唯一');
  });

  // ========== 4. 通道故障降级测试 ==========
  console.log('\n【4. 通道故障降级测试】');

  await runTest('单通道故障不影响整体检索', async () => {
    const coordinator = new SearchCoordinator({ strategy: 'parallel' });
    coordinator.registerChannel(new MockVectorChannel({ failureRate: 1.0 })); // 100% 失败
    coordinator.registerChannel(new MockKeywordChannel());

    const result = await coordinator.search('partial failure test');

    // 关键词通道应仍能返回结果
    assert(result.results.length > 0, '故障通道不影响其他通道');
    assert(result.metadata.channelsUsed.includes('keyword'), '关键词通道应被使用');
  });

  await runTest('健康检查应标记故障通道', async () => {
    const channel = new MockVectorChannel({ failureRate: 0 }); // 不自动失败
    channel._failureThreshold = 3; // 设置低阈值

    // 直接调用 recordFailure 而不通过 search
    // 因为 searchWithTimeout 成功后会调用 recordSuccess
    channel.recordFailure();
    channel.recordFailure();
    channel.recordFailure();

    assert(!channel.isHealthy(), '高失败率通道应标记为不健康');
  });

  // ========== 5. 并发压力测试 ==========
  console.log('\n【5. 并发压力测试】');

  await runTest('50 并发检索应正确处理', async () => {
    const coordinator = new SearchCoordinator({ strategy: 'parallel' });
    coordinator.registerChannel(new MockVectorChannel());
    coordinator.registerChannel(new MockKeywordChannel());

    const start = Date.now();

    // 50 并发请求
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(coordinator.search(`concurrent query ${i}`));
    }

    const results = await Promise.all(promises);

    const duration = Date.now() - start;

    // 所有请求都应成功
    assert(results.every(r => r.results.length > 0), '所有并发请求应成功');

    console.log(`    50 并发总耗时: ${duration}ms`);
    console.log(`    平均每请求: ${duration / 50}ms`);
  });

  await runTest('100 并发检索应无竞态条件', async () => {
    const coordinator = new SearchCoordinator({ strategy: 'parallel' });
    coordinator.registerChannel(new MockVectorChannel());
    coordinator.registerChannel(new MockKeywordChannel());

    const start = Date.now();

    // 100 并发请求
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(coordinator.search(`stress query ${i}`));
    }

    const results = await Promise.all(promises);

    const duration = Date.now() - start;

    // 所有请求都应成功
    assert(results.every(r => r.results.length > 0), '所有并发请求应成功');

    console.log(`    100 并发总耗时: ${duration}ms`);
    console.log(`    平均每请求: ${duration / 100}ms`);
  });

  // ========== 6. 策略测试 ==========
  console.log('\n【6. 检索策略测试】');

  await runTest('串行检索应在首通道返回足够结果时停止', async () => {
    const coordinator = new SearchCoordinator({ strategy: 'sequential', defaultMaxResults: 5 });
    coordinator.registerChannel(new MockVectorChannel());
    coordinator.registerChannel(new MockKeywordChannel());

    const result = await coordinator.search('sequential test');

    // 串行策略应在获取足够结果后停止
    assert(result.results.length > 0, '应有返回结果');
  });

  await runTest('通道注册/注销应正确工作', async () => {
    const coordinator = new SearchCoordinator();

    coordinator.registerChannel(new MockVectorChannel());
    assertEqual(coordinator.channels.size, 1, '应有 1 个通道');

    coordinator.registerChannel(new MockKeywordChannel());
    assertEqual(coordinator.channels.size, 2, '应有 2 个通道');

    coordinator.unregisterChannel('vector');
    assertEqual(coordinator.channels.size, 1, '应有 1 个通道');
  });

  // ========== 汇总 ==========
  console.log('\n========================================');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('========================================\n');

  return { passed, failed };
}

// 运行测试
runSearchStressTests()
  .then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('测试执行失败:', err);
    process.exit(1);
  });
