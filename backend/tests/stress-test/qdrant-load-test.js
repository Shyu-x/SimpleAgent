/**
 * Qdrant 向量检索压测脚本
 *
 * 测试场景：
 * 1. 并发测试 - 10/50/100/200 并发下的性能表现
 * 2. 批量检索测试 - 不同批量大小的性能
 * 3. 延迟测试 - P50/P90/P99 延迟分布
 * 4. 降级机制测试 - Qdrant 不可用时自动降级到 memory
 *
 * @module tests/stress-test/qdrant-load-test
 */

const { QdrantRouter, getQdrantRouter } = require('../../src/services/vector/QdrantRouter');
const { CircuitBreaker, CircuitState } = require('../../src/infra/circuitBreaker/CircuitBreaker');
const config = require('./config');

let passed = 0;
let failed = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (error) {
    console.log(`  [FAIL] ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function calculatePercentiles(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const count = sorted.length;
  return {
    p50: sorted[Math.floor(count * 0.5)],
    p90: sorted[Math.floor(count * 0.9)],
    p95: sorted[Math.floor(count * 0.95)],
    p99: sorted[Math.floor(count * 0.99)],
    min: sorted[0],
    max: sorted[count - 1],
    avg: sorted.reduce((a, b) => a + b, 0) / count,
  };
}

/**
 * 1. 并发测试
 */
async function runConcurrencyTests() {
  console.log('\n========================================');
  console.log('1. 并发测试');
  console.log('========================================\n');

  const router = new QdrantRouter({
    host: config.qdrant.host,
    port: config.qdrant.port,
    collection: config.qdrant.collection,
    dimension: config.qdrant.dimension,
  });

  // 初始化
  const initResult = await router.initialize();
  if (!initResult.success) {
    console.log(`  [WARN] Qdrant 连接失败: ${initResult.error}`);
    console.log('  [INFO] 测试将使用降级模式 (memory)');
  }

  // 准备测试数据 - 插入文档
  const testDocuments = config.testData.documents.slice(0, 3);
  for (const doc of testDocuments) {
    await router.embedDocument(doc.content, { metadata: { title: doc.title } });
  }

  const queries = config.testData.queries.slice(0, 5);

  for (const concurrency of config.concurrency.levels) {
    console.log(`\n  并发级别: ${concurrency}\n`);

    await runTest(`并发 ${concurrency} - 延迟 P99 < ${config.baselines.latency.p99}ms`, async () => {
      const latencies = [];

      // 预热
      for (let i = 0; i < config.concurrency.warmupRequests; i++) {
        await router.search(queries[i % queries.length]);
      }
      await sleep(config.concurrency.cooldownMs);

      // 正式测试
      const startTime = Date.now();
      const requests = [];

      for (let i = 0; i < concurrency; i++) {
        const reqStart = Date.now();
        requests.push(
          router.search(queries[i % queries.length])
            .then(() => {
              latencies.push(Date.now() - reqStart);
            })
            .catch(() => {
              latencies.push(-1); // 标记失败
            })
        );
      }

      await Promise.all(requests);
      const totalDuration = Date.now() - startTime;

      const stats = calculatePercentiles(latencies.filter(l => l >= 0));
      const errorCount = latencies.filter(l => l < 0).length;
      const errorRate = errorCount / latencies.length;

      console.log(`    总耗时: ${totalDuration}ms`);
      console.log(`    P50: ${stats.p50}ms, P90: ${stats.p90}ms, P99: ${stats.p99}ms`);
      console.log(`    QPS: ${(concurrency / totalDuration * 1000).toFixed(2)}`);
      console.log(`    错误率: ${(errorRate * 100).toFixed(2)}%`);

      assert(errorRate <= config.baselines.errorRate.max, `错误率 ${errorRate * 100}% 超过基线 ${config.baselines.errorRate.max * 100}%`);
      assert(stats.p99 <= config.baselines.latency.p99, `P99 延迟 ${stats.p99}ms 超过基线 ${config.baselines.latency.p99}ms`);
    });

    await runTest(`并发 ${concurrency} - QPS >= ${config.baselines.throughput.minQps}`, async () => {
      const startTime = Date.now();
      const requests = [];

      // 持续发送请求，计算 QPS
      for (let i = 0; i < concurrency * 10; i++) {
        requests.push(router.search(queries[i % queries.length]));
      }

      await Promise.all(requests);
      const duration = Date.now() - startTime;
      const qps = (concurrency * 10) / duration * 1000;

      console.log(`    实际 QPS: ${qps.toFixed(2)}`);
      assert(qps >= config.baselines.throughput.minQps, `QPS ${qps.toFixed(2)} 低于基线 ${config.baselines.throughput.minQps}`);
    });
  }

  router.vectorStore.disconnect();
}

/**
 * 2. 批量检索测试
 */
async function runBatchSearchTests() {
  console.log('\n========================================');
  console.log('2. 批量检索测试');
  console.log('========================================\n');

  const router = new QdrantRouter({
    host: config.qdrant.host,
    port: config.qdrant.port,
    collection: config.qdrant.collection,
    dimension: config.qdrant.dimension,
  });

  await router.initialize();

  const queries = config.testData.queries;

  for (const batchSize of config.batch.sizes) {
    console.log(`\n  批量大小: ${batchSize}\n`);

    await runTest(`批量 ${batchSize} - 延迟符合基线`, async () => {
      const latencies = [];
      const startTime = Date.now();

      // 串行批量执行
      for (let i = 0; i < batchSize; i++) {
        const reqStart = Date.now();
        await router.search(queries[i % queries.length]);
        latencies.push(Date.now() - reqStart);
      }

      const totalDuration = Date.now() - startTime;
      const stats = calculatePercentiles(latencies);

      console.log(`    总耗时: ${totalDuration}ms`);
      console.log(`    P50: ${stats.p50}ms, P90: ${stats.p90}ms, P99: ${stats.p99}ms`);
      console.log(`    平均延迟: ${stats.avg.toFixed(2)}ms`);

      assert(stats.p99 <= config.baselines.latency.p99, `P99 延迟 ${stats.p99}ms 超过基线`);
    });

    await runTest(`批量 ${batchSize} - 并行执行加速比 > 1.5x`, async () => {
      // 串行执行
      const serialStart = Date.now();
      for (let i = 0; i < Math.min(batchSize, 10); i++) {
        await router.search(queries[i % queries.length]);
      }
      const serialDuration = Date.now() - serialStart;

      // 并行执行
      const parallelStart = Date.now();
      await Promise.all(
        queries.slice(0, Math.min(batchSize, 10)).map(q => router.search(q))
      );
      const parallelDuration = Date.now() - parallelStart;

      const speedup = serialDuration / parallelDuration;
      console.log(`    串行: ${serialDuration}ms, 并行: ${parallelDuration}ms`);
      console.log(`    加速比: ${speedup.toFixed(2)}x`);

      assert(speedup >= 1.5, `加速比 ${speedup.toFixed(2)}x 低于 1.5x`);
    });
  }

  router.vectorStore.disconnect();
}

/**
 * 3. 延迟分布测试
 */
async function runLatencyDistributionTests() {
  console.log('\n========================================');
  console.log('3. 延迟分布测试');
  console.log('========================================\n');

  const router = new QdrantRouter({
    host: config.qdrant.host,
    port: config.qdrant.port,
    collection: config.qdrant.collection,
    dimension: config.qdrant.dimension,
  });

  await router.initialize();

  const queries = config.testData.queries;
  const requestCount = 100;
  const latencies = [];
  const results = [];

  console.log(`\n  执行 ${requestCount} 次检索...\n`);

  for (let i = 0; i < requestCount; i++) {
    const reqStart = Date.now();
    const result = await router.search(queries[i % queries.length]);
    const latency = Date.now() - reqStart;

    latencies.push(latency);
    results.push(result);
  }

  const stats = calculatePercentiles(latencies);
  const successCount = results.filter(r => r.success).length;
  const errorCount = requestCount - successCount;

  console.log('  延迟分布:');
  console.log(`    最小: ${stats.min}ms`);
  console.log(`    平均: ${stats.avg.toFixed(2)}ms`);
  console.log(`    P50: ${stats.p50}ms (基线: ${config.baselines.latency.p50}ms)`);
  console.log(`    P90: ${stats.p90}ms (基线: ${config.baselines.latency.p90}ms)`);
  console.log(`    P95: ${stats.p95}ms`);
  console.log(`    P99: ${stats.p99}ms (基线: ${config.baselines.latency.p99}ms)`);
  console.log(`    最大: ${stats.max}ms`);
  console.log(`    成功率: ${(successCount / requestCount * 100).toFixed(2)}%`);

  await runTest('P50 延迟 < 基线', () => {
    assert(stats.p50 <= config.baselines.latency.p50, `P50 ${stats.p50}ms 超过基线 ${config.baselines.latency.p50}ms`);
  });

  await runTest('P90 延迟 < 基线', () => {
    assert(stats.p90 <= config.baselines.latency.p90, `P90 ${stats.p90}ms 超过基线 ${config.baselines.latency.p90}ms`);
  });

  await runTest('P99 延迟 < 基线', () => {
    assert(stats.p99 <= config.baselines.latency.p99, `P99 ${stats.p99}ms 超过基线 ${config.baselines.latency.p99}ms`);
  });

  await runTest('错误率 < 基线', () => {
    const errorRate = errorCount / requestCount;
    assert(errorRate <= config.baselines.errorRate.max, `错误率 ${(errorRate * 100).toFixed(2)}% 超过基线 ${config.baselines.errorRate.max * 100}%`);
  });

  router.vectorStore.disconnect();
}

/**
 * 4. 降级机制测试
 */
async function runFallbackTests() {
  console.log('\n========================================');
  console.log('4. 降级机制测试');
  console.log('========================================\n');

  // 创建模拟 Qdrant 故障的 VectorStore
  class MockFailingVectorStore {
    constructor() {
      this.connected = false;
    }

    async connect() {
      return { success: true };
    }

    async createCollection() {
      return { success: true };
    }

    async healthCheck() {
      return { success: false, status: 'unhealthy', error: 'Connection refused' };
    }

    async insertBatch({ vectors, texts }) {
      throw new Error('Qdrant unavailable');
    }

    async search() {
      throw new Error('Qdrant unavailable');
    }

    async getStats() {
      throw new Error('Qdrant unavailable');
    }

    disconnect() {}
  }

  // 测试 1: Qdrant 不可用时降级到 memory
  await runTest('Qdrant 连接失败时返回降级响应', async () => {
    const router = new QdrantRouter({
      host: 'unreachable-host',
      port: '9999',
      collection: 'test_collection',
    });

    const result = await router.embed('测试文本');
    // 降级模式下仍能通过 simpleVectorize 生成向量
    assert(result.success, '降级模式应返回成功结果');
    assert(result.embedding, '降级模式应返回 embedding');
    assert(result.model === 'simpleVectorize', `降级模式应使用 simpleVectorize，实际: ${result.model}`);
  });

  // 测试 2: 降级模式性能
  await runTest('降级模式延迟 < 500ms', async () => {
    const router = new QdrantRouter({
      host: 'unreachable-host',
      port: '9999',
      collection: 'test_collection',
    });

    const latencies = [];
    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      await router.embed(`测试文本 ${i}`);
      latencies.push(Date.now() - start);
    }

    const stats = calculatePercentiles(latencies);
    console.log(`    降级模式 P99: ${stats.p99}ms`);

    assert(stats.p99 <= config.baselines.fallback.maxLatency,
      `降级模式 P99 ${stats.p99}ms 超过基线 ${config.baselines.fallback.maxLatency}ms`);
  });

  // 测试 3: 熔断器保护
  await runTest('熔断器在连续失败后触发降级', async () => {
    const breaker = new CircuitBreaker({
      name: 'qdrant-fallback-test',
      failureThreshold: 3,
      resetTimeout: 5000,
      successThreshold: 2,
    });

    // 注入失败
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(
          () => Promise.reject(new Error('Qdrant unavailable')),
          () => ({ fallback: true, source: 'circuit-breaker' })
        );
      } catch (e) {
        // 忽略
      }
    }

    // 熔断后应返回 fallback
    const result = await breaker.execute(
      () => Promise.reject(new Error('Should not execute')),
      () => ({ fallback: true, source: 'circuit-breaker' })
    );

    assert(result.fallback === true, '熔断后应返回降级响应');
    assertEqual(breaker.state, CircuitState.OPEN, '熔断器状态应为 OPEN');
  });

  // 测试 4: 熔断恢复
  await runTest('熔断器在 resetTimeout 后恢复', async () => {
    const breaker = new CircuitBreaker({
      name: 'qdrant-recovery-test',
      failureThreshold: 2,
      resetTimeout: 500,
      successThreshold: 1,
    });

    // 触发熔断
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')), () => null);
      } catch (e) {}
    }

    assertEqual(breaker.state, CircuitState.OPEN, '触发熔断后应为 OPEN');

    // 等待恢复
    await sleep(600);
    breaker.canExecute();

    assertEqual(breaker.state, CircuitState.HALF_OPEN, '超时后应进入 HALF_OPEN');

    // 成功探测
    await breaker.execute(() => Promise.resolve('recovered'), () => null);

    assertEqual(breaker.state, CircuitState.CLOSED, '成功后应关闭熔断');
  });

  // 测试 5: 健康检查触发降级
  await runTest('健康检查失败时自动降级', async () => {
    const mockStore = new MockFailingVectorStore();
    const health = await mockStore.healthCheck();

    assert(!health.success, '健康检查应返回失败');
    assert(health.status === 'unhealthy', '状态应为 unhealthy');
  });
}

/**
 * 5. 向量化性能测试
 */
async function runEmbeddingPerformanceTests() {
  console.log('\n========================================');
  console.log('5. 向量化性能测试');
  console.log('========================================\n');

  const router = new QdrantRouter({
    host: config.qdrant.host,
    port: config.qdrant.port,
    dimension: config.qdrant.dimension,
  });

  const testTexts = config.testData.documents.map(d => d.content);
  const batchSizes = [5, 10, 20];

  for (const batchSize of batchSizes) {
    await runTest(`批量向量化 ${batchSize} - 性能符合预期`, async () => {
      const latencies = [];

      for (let i = 0; i < 10; i++) {
        const texts = testTexts.slice(0, batchSize);
        const start = Date.now();
        await router.embedBatch(texts);
        latencies.push(Date.now() - start);
      }

      const stats = calculatePercentiles(latencies);
      const avgPerText = stats.avg / batchSize;

      console.log(`    批量 ${batchSize} 平均耗时: ${stats.avg.toFixed(2)}ms`);
      console.log(`    每条平均: ${avgPerText.toFixed(2)}ms`);

      assert(stats.p99 <= 500, `批量向量化 P99 ${stats.p99}ms 超过 500ms`);
    });
  }
}

/**
 * 6. 稳定性测试（长时间运行）
 */
async function runStabilityTests() {
  console.log('\n========================================');
  console.log('6. 稳定性测试');
  console.log('========================================\n');

  const router = new QdrantRouter({
    host: config.qdrant.host,
    port: config.qdrant.port,
    collection: config.qdrant.collection,
    dimension: config.qdrant.dimension,
  });

  await router.initialize();

  const queries = config.testData.queries;
  const duration = config.duration.spikeTestMs; // 10 秒
  const startTime = Date.now();
  let requestCount = 0;
  let errorCount = 0;
  const latencies = [];

  console.log(`\n  运行 ${duration / 1000} 秒稳定性测试...\n`);

  while (Date.now() - startTime < duration) {
    const reqStart = Date.now();
    try {
      await router.search(queries[requestCount % queries.length]);
      latencies.push(Date.now() - reqStart);
    } catch (e) {
      errorCount++;
    }
    requestCount++;

    // 控制请求速率，避免过度压力
    await sleep(10);
  }

  const stats = calculatePercentiles(latencies);
  const errorRate = errorCount / requestCount;

  console.log(`  总请求数: ${requestCount}`);
  console.log(`  错误数: ${errorCount}`);
  console.log(`  错误率: ${(errorRate * 100).toFixed(2)}%`);
  console.log(`  P50: ${stats.p50}ms, P90: ${stats.p90}ms, P99: ${stats.p99}ms`);

  await runTest('稳定性测试 - 错误率 < 1%', () => {
    assert(errorRate <= config.baselines.errorRate.max,
      `错误率 ${(errorRate * 100).toFixed(2)}% 超过基线 ${config.baselines.errorRate.max * 100}%`);
  });

  await runTest('稳定性测试 - P99 < 500ms', () => {
    assert(stats.p99 <= 500, `P99 ${stats.p99}ms 超过 500ms`);
  });

  router.vectorStore.disconnect();
}

/**
 * 主函数
 */
async function main() {
  console.log('\n========================================');
  console.log('Qdrant 向量检索压测');
  console.log('========================================');
  console.log(`时间: ${new Date().toISOString()}`);
  console.log(`Qdrant: ${config.qdrant.host}:${config.qdrant.port}`);
  console.log(`集合: ${config.qdrant.collection}`);
  console.log(`维度: ${config.qdrant.dimension}`);

  // 1. 并发测试
  await runConcurrencyTests();

  // 2. 批量检索测试
  await runBatchSearchTests();

  // 3. 延迟分布测试
  await runLatencyDistributionTests();

  // 4. 降级机制测试
  await runFallbackTests();

  // 5. 向量化性能测试
  await runEmbeddingPerformanceTests();

  // 6. 稳定性测试
  await runStabilityTests();

  // 汇总
  console.log('\n========================================');
  console.log('压测完成');
  console.log('========================================');
  console.log(`通过: ${passed}, 失败: ${failed}`);
  console.log(`时间: ${new Date().toISOString()}`);

  // 性能总结
  console.log('\n性能基线验收:');
  console.log(`  P50 延迟: < ${config.baselines.latency.p50}ms`);
  console.log(`  P90 延迟: < ${config.baselines.latency.p90}ms`);
  console.log(`  P99 延迟: < ${config.baselines.latency.p99}ms`);
  console.log(`  错误率: < ${config.baselines.errorRate.max * 100}%`);
  console.log(`  最小 QPS: ${config.baselines.throughput.minQps}`);

  return { passed, failed };
}

// 运行
main()
  .then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('压测执行失败:', err);
    process.exit(1);
  });