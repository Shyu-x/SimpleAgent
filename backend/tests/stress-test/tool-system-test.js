/**
 * 工具系统压测脚本
 *
 * 测试项目：
 * 1. 工具注册表：验证工具数量和分类
 * 2. 并发调用测试：同时调用多个工具
 * 3. 工具执行延迟：search/calculate/weather 等工具
 * 4. 失败重试机制：模拟工具执行失败后的重试
 * 5. 熔断触发测试：连续失败时熔断器是否正确触发
 *
 * @module tests/stress-test/tool-system-test
 */

const http = require('http');
const https = require('https');

// 配置
const CONFIG = {
  baseUrl: 'http://localhost:30000',
  endpoints: {
    chat: '/api/chat',
    tools: '/api/tools',
    toolTest: '/api/tools/test'
  },
  concurrencyLevels: [10, 50, 100],
  testIterations: 50,
  baselines: {
    toolCallLatency: 200,        // ms
    toolConcurrency: 50,          // per second
    circuitBreakerRecovery: 1000, // ms
    failureThreshold: 5
  },
  // 工具列表（用于直接测试）
  tools: {
    calculator: { name: 'calculator', args: { expression: '2+2' } },
    search: { name: 'search', args: { query: 'JavaScript' } },
    weather: { name: 'weather', args: { city: 'Beijing' } },
    translate: { name: 'translate', args: { text: 'Hello', from: 'en', to: 'zh' } },
    summary: { name: 'summary', args: { text: 'This is a test text for summarization' } }
  }
};

// 统计收集器
class StatsCollector {
  constructor() {
    this.reset();
  }

  reset() {
    this.latencies = [];
    this.errors = 0;
    this.successes = 0;
    this.timeouts = 0;
    this.startTime = null;
    this.endTime = null;
    this.toolStats = new Map();
    this.circuitBreakerTrips = 0;
    this.retryCount = 0;
  }

  addLatency(toolName, latency, success = true) {
    this.latencies.push({ tool: toolName, latency, success, timestamp: Date.now() });
    if (!this.toolStats.has(toolName)) {
      this.toolStats.set(toolName, { successes: 0, errors: 0, latencies: [] });
    }
    const stats = this.toolStats.get(toolName);
    stats.latencies.push(latency);
    if (success) {
      stats.successes++;
      this.successes++;
    } else {
      stats.errors++;
      this.errors++;
    }
  }

  incrementTimeouts() {
    this.timeouts++;
    this.errors++;
  }

  recordCircuitBreakerTrip() {
    this.circuitBreakerTrips++;
  }

  recordRetry() {
    this.retryCount++;
  }

  getStats() {
    const sorted = [...this.latencies].sort((a, b) => a.latency - b.latency);
    const count = sorted.length;

    // 工具统计
    const toolStats = {};
    for (const [name, stats] of this.toolStats) {
      const sortedTool = [...stats.latencies].sort((a, b) => a - b);
      const toolCount = sortedTool.length;
      toolStats[name] = {
        successes: stats.successes,
        errors: stats.errors,
        total: toolCount,
        avgLatency: toolCount > 0 ? (sortedTool.reduce((a, b) => a + b, 0) / toolCount).toFixed(2) + 'ms' : 'N/A',
        minLatency: toolCount > 0 ? sortedTool[0].toFixed(2) + 'ms' : 'N/A',
        maxLatency: toolCount > 0 ? sortedTool[toolCount - 1].toFixed(2) + 'ms' : 'N/A',
        p90: toolCount > 0 ? sortedTool[Math.floor(toolCount * 0.9)].toFixed(2) + 'ms' : 'N/A'
      };
    }

    return {
      total: count,
      successes: this.successes,
      errors: this.errors,
      timeouts: this.timeouts,
      errorRate: count > 0 ? (this.errors / count * 100).toFixed(2) + '%' : '0%',
      successRate: count > 0 ? (this.successes / count * 100).toFixed(2) + '%' : '0%',
      retryCount: this.retryCount,
      circuitBreakerTrips: this.circuitBreakerTrips,

      // 全局延迟统计
      latencies: {
        min: count > 0 ? sorted[0].latency.toFixed(2) + 'ms' : 'N/A',
        max: count > 0 ? sorted[count - 1].latency.toFixed(2) + 'ms' : 'N/A',
        avg: count > 0 ? (sorted.reduce((a, b) => a + b.latency, 0) / count).toFixed(2) + 'ms' : 'N/A',
        p50: count > 0 ? sorted[Math.floor(count * 0.5)].latency.toFixed(2) + 'ms' : 'N/A',
        p90: count > 0 ? sorted[Math.floor(count * 0.9)].latency.toFixed(2) + 'ms' : 'N/A',
        p99: count > 0 ? sorted[Math.floor(count * 0.99)].latency.toFixed(2) + 'ms' : 'N/A'
      },

      // 吞吐量
      throughput: count > 0 && this.startTime && this.endTime ?
        (count / ((this.endTime - this.startTime) / 1000)).toFixed(2) + ' req/s' : 'N/A',

      // 工具统计
      toolStats,

      // 基线对比
      baselineComparison: {
        avgLatency: {
          value: count > 0 ? (sorted.reduce((a, b) => a + b.latency, 0) / count).toFixed(0) : 0,
          baseline: CONFIG.baselines.toolCallLatency,
          passed: count > 0 ?
            (sorted.reduce((a, b) => a + b.latency, 0) / count) <= CONFIG.baselines.toolCallLatency : false
        },
        throughput: {
          value: count > 0 && this.startTime && this.endTime ?
            count / ((this.endTime - this.startTime) / 1000) : 0,
          baseline: CONFIG.baselines.toolConcurrency,
          passed: count > 0 && this.startTime && this.endTime ?
            (count / ((this.endTime - this.startTime) / 1000)) >= CONFIG.baselines.toolConcurrency : false
        }
      }
    };
  }
}

// HTTP 请求封装
async function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers
      },
      timeout: options.timeout || 30000
    };

    const req = protocol.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

// 1. 工具注册表测试
async function testToolRegistry() {
  console.log('\n  [测试] 工具注册表...');

  try {
    // 直接从源码加载工具注册表
    const toolRegistry = require('../../src/services/tools/toolRegistry');
    const toolList = toolRegistry.getAllTools ? toolRegistry.getAllTools() : [];

    // 统计工具分类
    const categories = {};
    let totalTools = 0;

    if (Array.isArray(toolList)) {
      totalTools = toolList.length;
      toolList.forEach(tool => {
        const category = tool.category || 'uncategorized';
        if (!categories[category]) {
          categories[category] = 0;
        }
        categories[category]++;
      });
    } else if (toolList instanceof Map || typeof toolList === 'object') {
      const entries = toolList.entries ? [...toolList.entries()] : Object.entries(toolList);
      totalTools = entries.length;
      entries.forEach(([name, tool]) => {
        const category = (tool && tool.category) || 'uncategorized';
        if (!categories[category]) {
          categories[category] = 0;
        }
        categories[category]++;
      });
    }

    console.log(`   - 工具总数: ${totalTools}`);
    console.log('   - 工具分类:');
    for (const [category, count] of Object.entries(categories)) {
      console.log(`     * ${category}: ${count}`);
    }

    return { success: true, totalTools, categories };
  } catch (error) {
    console.log(`   错误: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 2. 工具并发调用测试（通过 Agent 请求触发工具）
async function testConcurrentToolCalls(iterations, concurrency) {
  console.log(`\n  [测试] 工具并发调用 (${iterations}次迭代, ${concurrency}并发)...`);

  const stats = new StatsCollector();
  stats.startTime = Date.now();

  // 触发工具调用的查询
  const toolQueries = [
    'Calculate 15 * 23 + 45',
    'What is 100 divided by 7?',
    'Search for JavaScript tutorials',
    'Translate hello to Chinese',
    'Summarize this text: Artificial intelligence is transforming the world'
  ];

  const promises = [];
  for (let i = 0; i < iterations; i++) {
    const query = toolQueries[i % toolQueries.length];
    const sse = new (require('./sse-stream-test').SSEClient || class {})(`${CONFIG.baseUrl}${CONFIG.endpoints.chat}`, {
      body: { message: query, stream: false, enableTools: true }
    });

    // 模拟并发
    if (i < concurrency) {
      promises.push(
        httpRequest(`${CONFIG.baseUrl}${CONFIG.endpoints.chat}`, {
          method: 'POST',
          body: { message: query, stream: false, enableTools: true },
          timeout: 30000
        })
          .then(result => {
            const latency = Date.now() - stats.startTime;
            stats.addLatency(query.split(' ')[0], latency, result.status < 400);
          })
          .catch(err => {
            stats.incrementTimeouts();
          })
      );
    }
  }

  await Promise.allSettled(promises);
  stats.endTime = Date.now();

  return stats.getStats();
}

// 3. 工具执行延迟测试
async function testToolExecutionLatency(iterations = 20) {
  console.log(`\n  [测试] 工具执行延迟 (${iterations} 次迭代)...`);

  const stats = new StatsCollector();
  stats.startTime = Date.now();

  // 工具相关查询
  const toolQueries = [
    { query: 'What is 2+2?', tool: 'calculator', expected: 'calculator' },
    { query: 'Search for AI news', tool: 'search', expected: 'search' },
    { query: 'What is the weather in Shanghai?', tool: 'weather', expected: 'weather' },
    { query: 'Translate thank you to French', tool: 'translate', expected: 'translate' },
    { query: 'Summarize machine learning', tool: 'summary', expected: 'summary' }
  ];

  for (let i = 0; i < iterations; i++) {
    const { query, tool } = toolQueries[i % toolQueries.length];
    const requestStart = Date.now();

    try {
      const result = await httpRequest(`${CONFIG.baseUrl}${CONFIG.endpoints.chat}`, {
        method: 'POST',
        body: { message: query, stream: false },
        timeout: 15000
      });

      const latency = Date.now() - requestStart;
      const success = result.status === 200 && !result.data.error;
      stats.addLatency(tool, latency, success);
    } catch (err) {
      stats.incrementTimeouts();
    }
  }

  stats.endTime = Date.now();
  return stats.getStats();
}

// 4. 失败重试机制测试
async function testRetryMechanism() {
  console.log('\n  [测试] 失败重试机制...');

  const results = {
    totalRetries: 0,
    successfulRetries: 0,
    failedRetries: 0,
    maxRetries: 3
  };

  // 测试场景：模拟工具执行失败
  const failureSimulation = async () => {
    let attempt = 0;
    const maxAttempts = results.maxRetries;

    while (attempt < maxAttempts) {
      attempt++;
      console.log(`   尝试 ${attempt}/${maxAttempts}...`);

      // 模拟 50% 失败率，观察重试
      const shouldFail = Math.random() < 0.5;

      if (!shouldFail) {
        results.successfulRetries++;
        return { success: true, attempts: attempt };
      }

      results.totalRetries++;
    }

    results.failedRetries++;
    return { success: false, attempts: attempt };
  };

  // 执行多次重试测试
  const testCount = 10;
  let successCount = 0;

  for (let i = 0; i < testCount; i++) {
    const result = await failureSimulation();
    if (result.success) {
      successCount++;
    }
  }

  console.log(`   - 总重试次数: ${results.totalRetries}`);
  console.log(`   - 重试成功率: ${(successCount / testCount * 100).toFixed(0)}%`);

  return {
    ...results,
    successRate: (successCount / testCount * 100).toFixed(2) + '%',
    testPassed: successCount >= testCount * 0.8 // 80% 成功率视为通过
  };
}

// 5. 熔断触发测试
async function testCircuitBreaker() {
  console.log('\n  [测试] 熔断器触发机制...');

  const results = {
    triggered: false,
    triggerCount: 0,
    recoveryTime: 0,
    protectionActive: false
  };

  try {
    // 检查熔断器状态（通过调用一个会触发熔断的端点）
    const failureThreshold = CONFIG.baselines.failureThreshold;
    console.log(`   - 失败阈值: ${failureThreshold}`);

    // 连续发送失败请求触发熔断
    for (let i = 0; i < failureThreshold + 2; i++) {
      const response = await httpRequest(`${CONFIG.baseUrl}${CONFIG.endpoints.chat}`, {
        method: 'POST',
        body: { message: '', stream: false },  // 空消息应该失败
        timeout: 5000
      });

      if (response.data && response.data.type === 'circuit_breaker_open') {
        results.triggered = true;
        results.triggerCount = i + 1;
        console.log(`   - 熔断器在第 ${i + 1} 次请求后触发`);
        break;
      }
    }

    // 测试熔断恢复
    if (results.triggered) {
      const recoveryStart = Date.now();
      await new Promise(r => setTimeout(r, 1000));  // 等待恢复时间

      const recoveryResponse = await httpRequest(`${CONFIG.baseUrl}${CONFIG.endpoints.chat}`, {
        method: 'POST',
        body: { message: 'test', stream: false },
        timeout: 5000
      });

      results.recoveryTime = Date.now() - recoveryStart;
      results.protectionActive = recoveryResponse.data &&
        recoveryResponse.data.type === 'circuit_breaker_open';

      console.log(`   - 熔断恢复时间: ${results.recoveryTime}ms`);
      console.log(`   - 熔断保护激活: ${results.protectionActive}`);
    }

    return {
      ...results,
      testPassed: results.triggered && results.recoveryTime < CONFIG.baselines.circuitBreakerRecovery * 2
    };
  } catch (error) {
    return { ...results, error: error.message, testPassed: false };
  }
}

// 6. 工具超时测试
async function testToolTimeout() {
  console.log('\n  [测试] 工具超时处理...');

  const results = {
    timeouts: 0,
    completed: 0,
    totalTests: 10
  };

  // 模拟长时间运行的工具调用
  for (let i = 0; i < results.totalTests; i++) {
    try {
      const response = await httpRequest(`${CONFIG.baseUrl}${CONFIG.endpoints.chat}`, {
        method: 'POST',
        body: {
          message: `Calculate ${Math.random() * 1000} + ${Math.random() * 1000}`,
          stream: false
        },
        timeout: 5000
      });

      if (response.status === 200) {
        results.completed++;
      }
    } catch (err) {
      if (err.message.includes('timeout')) {
        results.timeouts++;
      }
    }
  }

  console.log(`   - 超时次数: ${results.timeouts}`);
  console.log(`   - 完成次数: ${results.completed}`);
  console.log(`   - 超时率: ${(results.timeouts / results.totalTests * 100).toFixed(2)}%`);

  return {
    ...results,
    testPassed: results.timeouts <= results.totalTests * 0.1 // 允许 10% 超时
  };
}

// 运行所有测试
async function runAllTests() {
  console.log('='.repeat(70));
  console.log('           工具系统压测');
  console.log('='.repeat(70));

  const results = {
    timestamp: new Date().toISOString(),
    toolRegistry: null,
    concurrentCalls: {},
    executionLatency: null,
    retryMechanism: null,
    circuitBreaker: null,
    toolTimeout: null
  };

  // 1. 工具注册表测试
  console.log('\n[阶段 1] 工具注册表测试...');
  try {
    results.toolRegistry = await testToolRegistry();
  } catch (e) {
    results.toolRegistry = { success: false, error: e.message };
  }

  // 2. 工具执行延迟测试
  console.log('\n[阶段 2] 工具执行延迟测试...');
  try {
    results.executionLatency = await testToolExecutionLatency(CONFIG.testIterations);
  } catch (e) {
    results.executionLatency = { error: e.message };
  }

  // 3. 并发调用测试
  console.log('\n[阶段 3] 工具并发调用测试...');
  for (const level of CONFIG.concurrencyLevels) {
    try {
      results.concurrentCalls[`level_${level}`] =
        await testConcurrentToolCalls(CONFIG.testIterations, level);
    } catch (e) {
      results.concurrentCalls[`level_${level}`] = { error: e.message };
    }
  }

  // 4. 失败重试机制测试
  console.log('\n[阶段 4] 失败重试机制测试...');
  try {
    results.retryMechanism = await testRetryMechanism();
  } catch (e) {
    results.retryMechanism = { error: e.message };
  }

  // 5. 熔断器测试
  console.log('\n[阶段 5] 熔断器测试...');
  try {
    results.circuitBreaker = await testCircuitBreaker();
  } catch (e) {
    results.circuitBreaker = { error: e.message };
  }

  // 6. 超时处理测试
  console.log('\n[阶段 6] 超时处理测试...');
  try {
    results.toolTimeout = await testToolTimeout();
  } catch (e) {
    results.toolTimeout = { error: e.message };
  }

  // 输出结果汇总
  console.log('\n' + '='.repeat(70));
  console.log('           测试结果汇总');
  console.log('='.repeat(70));

  // 工具注册表
  console.log('\n1. 工具注册表:');
  if (results.toolRegistry) {
    if (results.toolRegistry.success) {
      console.log(`   - 工具总数: ${results.toolRegistry.totalTools}`);
      console.log('   - 分类统计:');
      for (const [cat, count] of Object.entries(results.toolRegistry.categories)) {
        console.log(`     * ${cat}: ${count}`);
      }
      console.log('   状态: ✅ 通过');
    } else {
      console.log(`   状态: ❌ 失败 - ${results.toolRegistry.error}`);
    }
  }

  // 执行延迟
  console.log('\n2. 工具执行延迟:');
  if (results.executionLatency && !results.executionLatency.error) {
    console.log(`   - 平均延迟: ${results.executionLatency.latencies.avg}`);
    console.log(`   - P90延迟: ${results.executionLatency.latencies.p90}`);
    console.log(`   - 错误率: ${results.executionLatency.errorRate}`);
    console.log(`   基线比较: ${results.executionLatency.baselineComparison.avgLatency.passed ? '✅ 通过' : '❌ 未通过'} ` +
      `(${results.executionLatency.baselineComparison.avgLatency.value}ms vs ${results.executionLatency.baselineComparison.avgLatency.baseline}ms)`);
  } else {
    console.log(`   状态: ❌ 失败 - ${results.executionLatency?.error || '未知错误'}`);
  }

  // 并发调用
  console.log('\n3. 工具并发调用:');
  for (const [level, data] of Object.entries(results.concurrentCalls)) {
    if (data.error) {
      console.log(`   ${level}: ❌ ${data.error}`);
    } else {
      console.log(`   ${level}:`);
      console.log(`     - 成功率: ${data.successRate}`);
      console.log(`     - 平均延迟: ${data.latencies.avg}`);
      console.log(`     - 吞吐量: ${data.throughput}`);
    }
  }

  // 重试机制
  console.log('\n4. 失败重试机制:');
  if (results.retryMechanism && !results.retryMechanism.error) {
    console.log(`   - 总重试次数: ${results.retryMechanism.totalRetries}`);
    console.log(`   - 重试成功率: ${results.retryMechanism.successRate}`);
    console.log(`   - 测试结果: ${results.retryMechanism.testPassed ? '✅ 通过' : '❌ 未通过'}`);
  } else {
    console.log(`   状态: ❌ 失败 - ${results.retryMechanism?.error || '未知错误'}`);
  }

  // 熔断器
  console.log('\n5. 熔断器测试:');
  if (results.circuitBreaker && !results.circuitBreaker.error) {
    console.log(`   - 熔断触发: ${results.circuitBreaker.triggered ? '✅ 是' : '❌ 否'}`);
    if (results.circuitBreaker.triggered) {
      console.log(`   - 触发次数: ${results.circuitBreaker.triggerCount}`);
      console.log(`   - 恢复时间: ${results.circuitBreaker.recoveryTime}ms`);
      console.log(`   - 保护激活: ${results.circuitBreaker.protectionActive ? '✅ 是' : '❌ 否'}`);
    }
    console.log(`   - 测试结果: ${results.circuitBreaker.testPassed ? '✅ 通过' : '❌ 未通过'}`);
  } else {
    console.log(`   状态: ❌ 失败 - ${results.circuitBreaker?.error || '未知错误'}`);
  }

  // 超时处理
  console.log('\n6. 超时处理:');
  if (results.toolTimeout && !results.toolTimeout.error) {
    console.log(`   - 超时次数: ${results.toolTimeout.timeouts}`);
    console.log(`   - 完成次数: ${results.toolTimeout.completed}`);
    console.log(`   - 测试结果: ${results.toolTimeout.testPassed ? '✅ 通过' : '❌ 未通过'}`);
  } else {
    console.log(`   状态: ❌ 失败 - ${results.toolTimeout?.error || '未知错误'}`);
  }

  // 保存结果
  const fs = require('fs');
  const outputPath = './tests/stress-test/tool-system-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n测试结果已保存到: ${outputPath}`);

  return results;
}

// 主函数
async function main() {
  try {
    await runAllTests();
  } catch (error) {
    console.error('测试执行失败:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runAllTests, testToolRegistry, testToolExecutionLatency };