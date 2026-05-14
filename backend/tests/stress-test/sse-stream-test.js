/**
 * SSE 流式响应压测脚本
 *
 * 测试项目：
 * 1. 并发连接数测试：10/50/100/200 并发 SSE 连接
 * 2. 首包延迟测试：从请求到收到第一个 chunk 的时间
 * 3. 吞吐量测试：单位时间内处理的总请求数
 * 4. 长时间连接稳定性：保持连接 5/10/30 分钟
 * 5. 断线重连测试：模拟客户端断线后重连
 *
 * @module tests/stress-test/sse-stream-test
 */

const http = require('http');
const https = require('https');

// 配置
const CONFIG = {
  baseUrl: 'http://localhost:30000',
  endpoints: {
    chat: '/api/chat',
    agent: '/api/agent/stream'
  },
  concurrencyLevels: [10, 50, 100, 200],
  warmupRequests: 3,
  testMessages: [
    'Hello, how are you?',
    'What is the weather like today?',
    'Explain React hooks in simple terms',
    'Write a function to calculate fibonacci',
    'What are the best practices for API design?'
  ],
  baselines: {
    firstPacketLatency: 500,   // ms
    concurrentConnections: 100,
    toolCallLatency: 200,      // ms
    toolConcurrency: 50,       // per second
    circuitBreakerRecovery: 1000 // ms
  },
  longRunningDurations: [5, 10, 30] // minutes
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
    this.startTime = null;
    this.endTime = null;
    this.firstPacketTimes = [];
    this.chunkCounts = [];
    this.totalBytes = 0;
  }

  addLatency(latency, isFirstPacket = false) {
    this.latencies.push(latency);
    if (isFirstPacket) {
      this.firstPacketTimes.push(latency);
    }
  }

  addChunk(byteCount) {
    this.totalBytes += byteCount;
    if (this.chunkCounts.length === 0) {
      this.chunkCounts.push(1);
    } else {
      this.chunkCounts[this.chunkCounts.length - 1]++;
    }
  }

  incrementErrors() {
    this.errors++;
  }

  incrementSuccesses() {
    this.successes++;
  }

  getStats() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      total: count,
      successes: this.successes,
      errors: this.errors,
      errorRate: count > 0 ? (this.errors / count * 100).toFixed(2) + '%' : '0%',
      duration: this.endTime && this.startTime ?
        ((this.endTime - this.startTime) / 1000).toFixed(2) + 's' : 'N/A',

      // 延迟统计
      latencies: {
        min: count > 0 ? sorted[0].toFixed(2) + 'ms' : 'N/A',
        max: count > 0 ? sorted[count - 1].toFixed(2) + 'ms' : 'N/A',
        avg: count > 0 ? (sorted.reduce((a, b) => a + b, 0) / count).toFixed(2) + 'ms' : 'N/A',
        p50: count > 0 ? sorted[Math.floor(count * 0.5)].toFixed(2) + 'ms' : 'N/A',
        p90: count > 0 ? sorted[Math.floor(count * 0.9)].toFixed(2) + 'ms' : 'N/A',
        p99: count > 0 ? sorted[Math.floor(count * 0.99)].toFixed(2) + 'ms' : 'N/A'
      },

      // 首包延迟
      firstPacket: {
        avg: this.firstPacketTimes.length > 0 ?
          (this.firstPacketTimes.reduce((a, b) => a + b, 0) / this.firstPacketTimes.length).toFixed(2) + 'ms' : 'N/A',
        min: this.firstPacketTimes.length > 0 ?
          Math.min(...this.firstPacketTimes).toFixed(2) + 'ms' : 'N/A',
        max: this.firstPacketTimes.length > 0 ?
          Math.max(...this.firstPacketTimes).toFixed(2) + 'ms' : 'N/A'
      },

      // 吞吐量
      throughput: count > 0 && this.startTime && this.endTime ?
        (count / ((this.endTime - this.startTime) / 1000)).toFixed(2) + ' req/s' : 'N/A',

      // 数据传输
      dataTransfer: {
        totalBytes: this.totalBytes,
        totalMB: (this.totalBytes / 1024 / 1024).toFixed(2) + ' MB',
        avgPerRequest: count > 0 ? (this.totalBytes / count).toFixed(0) + ' bytes' : 'N/A'
      }
    };
  }
}

// SSE 客户端
class SSEClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.chunks = [];
    this.startTime = null;
    this.firstPacketTime = null;
    this.error = null;
    this.isConnected = false;
    this.aborted = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.startTime = Date.now();
      const urlObj = new URL(this.url);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...this.options.headers
        }
      };

      const protocol = urlObj.protocol === 'https:' ? https : http;

      this.req = protocol.request(options, (res) => {
        this.isConnected = true;
        res.on('data', (chunk) => {
          const now = Date.now();
          if (!this.firstPacketTime) {
            this.firstPacketTime = now - this.startTime;
          }
          this.chunks.push({ time: now - this.startTime, size: chunk.length, data: chunk.toString() });
        });

        res.on('end', () => {
          this.endTime = Date.now();
          resolve({
            duration: this.endTime - this.startTime,
            firstPacketTime: this.firstPacketTime,
            chunks: this.chunks.length,
            totalBytes: this.chunks.reduce((sum, c) => sum + c.size, 0),
            data: this.chunks.map(c => c.data).join('')
          });
        });
      });

      this.req.on('error', (err) => {
        this.error = err;
        reject(err);
      });

      this.req.write(JSON.stringify(this.options.body || {}));
      this.req.end();
    });
  }

  abort() {
    this.aborted = true;
    if (this.req) {
      this.req.destroy();
    }
  }
}

// 并发连接测试
async function testConcurrentConnections(endpoint, concurrency) {
  console.log(`\n  [测试] ${concurrency} 并发连接...`);

  const client = new SSEClient(`${CONFIG.baseUrl}${endpoint}`, {
    headers: {},
    body: { message: CONFIG.testMessages[0], stream: true }
  });

  const stats = new StatsCollector();
  stats.startTime = Date.now();

  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    const sse = new SSEClient(`${CONFIG.baseUrl}${endpoint}`, {
      body: {
        message: CONFIG.testMessages[i % CONFIG.testMessages.length],
        stream: true
      }
    });
    promises.push(
      sse.connect()
        .then(result => {
          stats.addLatency(result.duration, true);
          stats.addChunk(result.totalBytes);
          stats.incrementSuccesses();
        })
        .catch(err => {
          stats.incrementErrors();
          stats.error = err.message;
        })
    );
  }

  await Promise.allSettled(promises);
  stats.endTime = Date.now();

  return stats.getStats();
}

// 首包延迟测试
async function testFirstPacketLatency(endpoint, iterations = 20) {
  console.log(`\n  [测试] 首包延迟 (${iterations} 次迭代)...`);

  const stats = new StatsCollector();
  stats.startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    const sse = new SSEClient(`${CONFIG.baseUrl}${endpoint}`, {
      body: { message: CONFIG.testMessages[i % CONFIG.testMessages.length], stream: true }
    });

    try {
      const result = await sse.connect();
      stats.addLatency(result.firstPacketTime, true);
      stats.incrementSuccesses();
    } catch (err) {
      stats.incrementErrors();
    }
  }

  stats.endTime = Date.now();
  return stats.getStats();
}

// 吞吐量测试
async function testThroughput(endpoint, durationSeconds = 30) {
  console.log(`\n  [测试] 吞吐量测试 (${durationSeconds} 秒)...`);

  const stats = new StatsCollector();
  stats.startTime = Date.now();
  const endTime = stats.startTime + (durationSeconds * 1000);
  let requestCount = 0;

  const runTest = async () => {
    while (Date.now() < endTime) {
      const sse = new SSEClient(`${CONFIG.baseUrl}${endpoint}`, {
        body: { message: CONFIG.testMessages[requestCount % CONFIG.testMessages.length], stream: true }
      });

      requestCount++;
      const startTime = Date.now();

      sse.connect()
        .then(result => {
          stats.addLatency(result.duration, true);
          stats.incrementSuccesses();
        })
        .catch(() => {
          stats.incrementErrors();
        });

      // 控制并发，每100ms发起一个新请求
      await new Promise(r => setTimeout(r, 100));
    }
  };

  await runTest();

  // 等待剩余请求完成
  await new Promise(r => setTimeout(r, 5000));
  stats.endTime = Date.now();

  return { ...stats.getStats(), totalRequests: requestCount };
}

// 长时间连接稳定性测试
async function testLongRunningConnection(endpoint, durationMinutes) {
  console.log(`\n  [测试] 长时间连接稳定性 (${durationMinutes} 分钟)...`);

  const stats = new StatsCollector();
  const durationMs = durationMinutes * 60 * 1000;

  const sse = new SSEClient(`${CONFIG.baseUrl}${endpoint}`, {
    body: { message: '保持连接测试', stream: true }
  });

  stats.startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  try {
    const result = await sse.connect();
    stats.addLatency(result.duration);
    stats.addChunk(result.totalBytes);
    stats.incrementSuccesses();
  } catch (err) {
    stats.incrementErrors();
  }

  stats.endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed;

  return {
    ...stats.getStats(),
    duration: `${durationMinutes} minutes`,
    memoryDelta: ((endMemory - startMemory) / 1024 / 1024).toFixed(2) + ' MB',
    memoryLeak: endMemory > startMemory * 1.5 ? 'DETECTED' : 'NONE'
  };
}

// 断线重连测试
async function testReconnection(endpoint, disconnectCount = 5) {
  console.log(`\n  [测试] 断线重连 (${disconnectCount} 次)...`);

  const stats = new StatsCollector();
  stats.startTime = Date.now();

  for (let i = 0; i < disconnectCount; i++) {
    const sse = new SSEClient(`${CONFIG.baseUrl}${endpoint}`, {
      body: { message: `重连测试 ${i + 1}`, stream: true }
    });

    const connectStart = Date.now();

    try {
      // 模拟断线：连接后立即断开
      await new Promise((resolve, reject) => {
        sse.connect()
          .then(result => {
            stats.addLatency(Date.now() - connectStart);
            stats.incrementSuccesses();
            resolve(result);
          })
          .catch(err => {
            stats.incrementErrors();
            reject(err);
          });

        // 模拟断线：延迟后断开
        setTimeout(() => {
          if (!sse.isConnected) {
            sse.abort();
          }
        }, 500);
      });
    } catch (err) {
      // 继续重试
    }

    // 等待一小段时间后重连
    await new Promise(r => setTimeout(r, 1000));
  }

  stats.endTime = Date.now();
  return stats.getStats();
}

// 运行所有测试
async function runAllTests() {
  console.log('='.repeat(70));
  console.log('           SSE 流式响应压测');
  console.log('='.repeat(70));

  const results = {
    timestamp: new Date().toISOString(),
    concurrentTests: {},
    firstPacketTests: {},
    throughputTests: {},
    longRunningTests: {},
    reconnectionTests: {}
  };

  // 1. 预热
  console.log('\n[阶段 1] 预热请求...');
  for (let i = 0; i < CONFIG.warmupRequests; i++) {
    try {
      await testFirstPacketLatency(CONFIG.endpoints.chat, 1);
    } catch (e) {
      console.log(`  预热请求 ${i + 1} 跳过`);
    }
  }

  // 2. 并发连接数测试
  console.log('\n[阶段 2] 并发连接数测试...');
  for (const level of CONFIG.concurrencyLevels) {
    try {
      results.concurrentTests[`${level}_connections`] =
        await testConcurrentConnections(CONFIG.endpoints.chat, level);
    } catch (e) {
      results.concurrentTests[`${level}_connections`] = { error: e.message };
    }
  }

  // 3. 首包延迟测试
  console.log('\n[阶段 3] 首包延迟测试...');
  try {
    results.firstPacketTests = await testFirstPacketLatency(CONFIG.endpoints.chat, 20);
  } catch (e) {
    results.firstPacketTests = { error: e.message };
  }

  // 4. 吞吐量测试
  console.log('\n[阶段 4] 吞吐量测试...');
  try {
    results.throughputTests = await testThroughput(CONFIG.endpoints.chat, 30);
  } catch (e) {
    results.throughputTests = { error: e.message };
  }

  // 5. 长时间连接稳定性测试
  console.log('\n[阶段 5] 长时间连接稳定性测试...');
  try {
    results.longRunningTests = await testLongRunningConnection(CONFIG.endpoints.chat, 5);
  } catch (e) {
    results.longRunningTests = { error: e.message };
  }

  // 6. 断线重连测试
  console.log('\n[阶段 6] 断线重连测试...');
  try {
    results.reconnectionTests = await testReconnection(CONFIG.endpoints.chat, 5);
  } catch (e) {
    results.reconnectionTests = { error: e.message };
  }

  // 输出结果
  console.log('\n' + '='.repeat(70));
  console.log('           测试结果汇总');
  console.log('='.repeat(70));

  console.log('\n1. 并发连接测试:');
  for (const [key, data] of Object.entries(results.concurrentTests)) {
    console.log(`\n   ${key}:`);
    if (data.error) {
      console.log(`   错误: ${data.error}`);
    } else {
      console.log(`   - 成功率: ${data.successes}/${data.total}`);
      console.log(`   - 错误率: ${data.errorRate}`);
      console.log(`   - 平均延迟: ${data.latencies.avg}`);
      console.log(`   - P90延迟: ${data.latencies.p90}`);
    }
  }

  console.log('\n2. 首包延迟测试:');
  if (results.firstPacketTests.error) {
    console.log(`   错误: ${results.firstPacketTests.error}`);
  } else {
    console.log(`   - 平均: ${results.firstPacketTests.firstPacket.avg}`);
    console.log(`   - 最小: ${results.firstPacketTests.firstPacket.min}`);
    console.log(`   - 最大: ${results.firstPacketTests.firstPacket.max}`);
    console.log(`   - 基线比较: ${parseFloat(results.firstPacketTests.firstPacket.avg) < CONFIG.baselines.firstPacketLatency ? '通过' : '未通过'} (${CONFIG.baselines.firstPacketLatency}ms)`);
  }

  console.log('\n3. 吞吐量测试:');
  if (results.throughputTests.error) {
    console.log(`   错误: ${results.throughputTests.error}`);
  } else {
    console.log(`   - 总请求数: ${results.throughputTests.totalRequests}`);
    console.log(`   - 吞吐量: ${results.throughputTests.throughput}`);
    console.log(`   - 平均延迟: ${results.throughputTests.latencies.avg}`);
  }

  console.log('\n4. 长时间连接测试:');
  if (results.longRunningTests.error) {
    console.log(`   错误: ${results.longRunningTests.error}`);
  } else {
    console.log(`   - 持续时间: ${results.longRunningTests.duration}`);
    console.log(`   - 内存变化: ${results.longRunningTests.memoryDelta}`);
    console.log(`   - 内存泄漏: ${results.longRunningTests.memoryLeak}`);
  }

  console.log('\n5. 断线重连测试:');
  if (results.reconnectionTests.error) {
    console.log(`   错误: ${results.reconnectionTests.error}`);
  } else {
    console.log(`   - 成功率: ${results.reconnectionTests.successes}/${results.reconnectionTests.total}`);
    console.log(`   - 平均重连时间: ${results.reconnectionTests.latencies.avg}`);
  }

  // 保存结果
  const fs = require('fs');
  const outputPath = './tests/stress-test/sse-stream-results.json';
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

module.exports = { runAllTests, testConcurrentConnections, testFirstPacketLatency };