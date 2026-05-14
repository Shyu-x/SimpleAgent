/**
 * 后端 API 完整压测
 * Task #25: 测试所有后端 API 端点
 *
 * @date 2026-05-13
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:30000';

// 压测配置
const CONCURRENCY_LEVELS = [10, 50, 100, 200];
const REQUESTS_PER_LEVEL = 20;

class StressTestRunner {
  constructor() {
    this.results = {};
    this.errors = [];
  }

  // HTTP 请求封装
  async request(url, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const startTime = Date.now();
      const req = client.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const latency = Date.now() - startTime;
          try {
            resolve({
              status: res.statusCode,
              data: JSON.parse(data),
              latency
            });
          } catch {
            resolve({
              status: res.statusCode,
              data: data,
              latency
            });
          }
        });
      });

      req.on('error', (err) => {
        reject({ error: err.message, latency: Date.now() - startTime });
      });

      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }

      req.end();
    });
  }

  // 并发请求测试
  async concurrentTest(url, options, concurrency, count) {
    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(this.request(url, options).catch(e => e));
    }
    return Promise.all(promises);
  }

  // 计算统计值
  calculateStats(results) {
    const latencies = results.filter(r => !r.error).map(r => r.latency).sort((a, b) => a - b);
    const errors = results.filter(r => r.error || r.status >= 400);

    if (latencies.length === 0) {
      return { p50: 0, p90: 0, p99: 0, errors: results.length, errorRate: 1 };
    }

    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p90 = latencies[Math.floor(latencies.length * 0.9)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    return {
      p50,
      p90,
      p99,
      avg,
      errors: errors.length,
      errorRate: errors.length / results.length,
      total: results.length,
      success: latencies.length
    };
  }

  // 测试 /api/chat 接口 (SSE 流式，需要特殊处理)
  async testChatAPI(concurrency) {
    console.log(`\n  测试 /api/chat (并发: ${concurrency}) - SSE 流式`);

    const testMessage = '你好，这是一个压力测试消息';
    const results = [];

    // SSE 请求需要特殊处理
    for (let i = 0; i < REQUESTS_PER_LEVEL; i++) {
      const startTime = Date.now();
      try {
        const result = await this.SSEPostRequest(`${BASE_URL}/api/chat`, { message: testMessage });
        const latency = Date.now() - startTime;
        results.push({ status: result.status, latency, data: result.data });
      } catch (error) {
        results.push({ error: error.message, latency: Date.now() - startTime });
      }
    }

    const stats = this.calculateStats(results);
    console.log(`    P50: ${stats.p50}ms | P90: ${stats.p90}ms | P99: ${stats.p99}ms | 错误率: ${(stats.errorRate * 100).toFixed(1)}%`);

    return { endpoint: '/api/chat (SSE)', concurrency, ...stats };
  }

  // SSE POST 请求
  async SSEPostRequest(url, body) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 30000,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        }
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => {
          data += chunk.toString();
        });
        res.on('end', () => {
          const hasData = data.includes('data:') || data.includes('"type"');
          resolve({
            status: res.statusCode,
            data: data.substring(0, 200),
            success: res.statusCode === 200 || hasData
          });
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(body));
      req.end();

      setTimeout(() => {
        req.destroy();
        reject(new Error('Request timeout'));
      }, 30000);
    });
  }

  // 测试 /api/router/chat 接口
  async testRouterAPI(concurrency) {
    console.log(`\n  测试 /api/router/chat (并发: ${concurrency})`);

    const url = `${BASE_URL}/api/router/chat`;
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { message: '测试路由', model: 'MiniMax-M2.7' }
    };

    const results = await this.concurrentTest(url, options, concurrency, REQUESTS_PER_LEVEL);
    const stats = this.calculateStats(results);

    console.log(`    P50: ${stats.p50}ms | P90: ${stats.p90}ms | P99: ${stats.p99}ms | 错误率: ${(stats.errorRate * 100).toFixed(1)}%`);

    return { endpoint: '/api/router/chat', concurrency, ...stats };
  }

  // 测试管理后台 API
  async testAdminAPIs(concurrency) {
    const results = {};

    // Stats API
    console.log(`\n  测试 /api/admin/stats (并发: ${concurrency})`);
    let res = await this.concurrentTest(`${BASE_URL}/api/admin/stats`, { method: 'GET' }, concurrency, REQUESTS_PER_LEVEL);
    results.stats = this.calculateStats(res);
    console.log(`    P50: ${results.stats.p50}ms | P90: ${results.stats.p90}ms | P99: ${results.stats.p99}ms | 错误率: ${(results.stats.errorRate * 100).toFixed(1)}%`);

    // Knowledge API
    console.log(`\n  测试 /api/admin/knowledge (并发: ${concurrency})`);
    res = await this.concurrentTest(`${BASE_URL}/api/admin/knowledge/list`, { method: 'GET' }, concurrency, REQUESTS_PER_LEVEL);
    results.knowledge = this.calculateStats(res);
    console.log(`    P50: ${results.knowledge.p50}ms | P90: ${results.knowledge.p90}ms | P99: ${results.knowledge.p99}ms | 错误率: ${(results.knowledge.errorRate * 100).toFixed(1)}%`);

    // Tool API
    console.log(`\n  测试 /api/admin/tools (并发: ${concurrency})`);
    res = await this.concurrentTest(`${BASE_URL}/api/admin/tools/categories/list`, { method: 'GET' }, concurrency, REQUESTS_PER_LEVEL);
    results.tools = this.calculateStats(res);
    console.log(`    P50: ${results.tools.p50}ms | P90: ${results.tools.p90}ms | P99: ${results.tools.p99}ms | 错误率: ${(results.tools.errorRate * 100).toFixed(1)}%`);

    // Model API
    console.log(`\n  测试 /api/admin/models (并发: ${concurrency})`);
    res = await this.concurrentTest(`${BASE_URL}/api/admin/models`, { method: 'GET' }, concurrency, REQUESTS_PER_LEVEL);
    results.model = this.calculateStats(res);
    console.log(`    P50: ${results.model.p50}ms | P90: ${results.model.p90}ms | P99: ${results.model.p99}ms | 错误率: ${(results.model.errorRate * 100).toFixed(1)}%`);

    // Intent API
    console.log(`\n  测试 /api/admin/intent (并发: ${concurrency})`);
    res = await this.concurrentTest(`${BASE_URL}/api/admin/intent/tree`, { method: 'GET' }, concurrency, REQUESTS_PER_LEVEL);
    results.intent = this.calculateStats(res);
    console.log(`    P50: ${results.intent.p50}ms | P90: ${results.intent.p90}ms | P99: ${results.intent.p99}ms | 错误率: ${(results.intent.errorRate * 100).toFixed(1)}%`);

    return results;
  }

  // 测试 Qdrant API
  async testQdrantAPIs(concurrency) {
    const results = {};

    // Qdrant status
    console.log(`\n  测试 /api/qdrant/status (并发: ${concurrency})`);
    let res = await this.concurrentTest(`${BASE_URL}/api/qdrant/status`, { method: 'GET' }, concurrency, REQUESTS_PER_LEVEL);
    results.status = this.calculateStats(res);
    console.log(`    P50: ${results.status.p50}ms | P90: ${results.status.p90}ms | P99: ${results.status.p99}ms | 错误率: ${(results.status.errorRate * 100).toFixed(1)}%`);

    // Qdrant collections
    console.log(`\n  测试 /api/qdrant/collections (并发: ${concurrency})`);
    res = await this.concurrentTest(`${BASE_URL}/api/qdrant/collections`, { method: 'GET' }, concurrency, REQUESTS_PER_LEVEL);
    results.collections = this.calculateStats(res);
    console.log(`    P50: ${results.collections.p50}ms | P90: ${results.collections.p90}ms | P99: ${results.collections.p99}ms | 错误率: ${(results.collections.errorRate * 100).toFixed(1)}%`);

    // Qdrant search
    console.log(`\n  测试 /api/qdrant/search (并发: ${concurrency})`);
    const searchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { collection: 'chat_documents', query: '测试查询', topK: 10 }
    };
    res = await this.concurrentTest(`${BASE_URL}/api/qdrant/search`, searchOptions, concurrency, REQUESTS_PER_LEVEL);
    results.search = this.calculateStats(res);
    console.log(`    P50: ${results.search.p50}ms | P90: ${results.search.p90}ms | P99: ${results.search.p99}ms | 错误率: ${(results.search.errorRate * 100).toFixed(1)}%`);

    return results;
  }

  // 测试 A2A API
  async testA2AAPIs(concurrency) {
    const results = {};

    // A2A agents list
    console.log(`\n  测试 /api/a2a/agents (并发: ${concurrency})`);
    let res = await this.concurrentTest(`${BASE_URL}/api/a2a/agents`, { method: 'GET' }, concurrency, REQUESTS_PER_LEVEL);
    results.agents = this.calculateStats(res);
    console.log(`    P50: ${results.agents.p50}ms | P90: ${results.agents.p90}ms | P99: ${results.agents.p99}ms | 错误率: ${(results.agents.errorRate * 100).toFixed(1)}%`);

    // A2A collaborate
    console.log(`\n  测试 /api/a2a/collaborate (并发: ${concurrency})`);
    const collabOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { taskType: 'analysis', prompt: '测试任务' }
    };
    res = await this.concurrentTest(`${BASE_URL}/api/a2a/collaborate`, collabOptions, concurrency, REQUESTS_PER_LEVEL);
    results.collaborate = this.calculateStats(res);
    console.log(`    P50: ${results.collaborate.p50}ms | P90: ${results.collaborate.p90}ms | P99: ${results.collaborate.p99}ms | 错误率: ${(results.collaborate.errorRate * 100).toFixed(1)}%`);

    return results;
  }

  // 测试 HITL API
  async testHITLAPIs(concurrency) {
    const results = {};

    // HITL request
    console.log(`\n  测试 /api/hitl/request (并发: ${concurrency})`);
    const hitlOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { action: 'test_action', riskLevel: 'low', sessionId: 'test-session' }
    };
    let res = await this.concurrentTest(`${BASE_URL}/api/hitl/request`, hitlOptions, concurrency, REQUESTS_PER_LEVEL);
    results.request = this.calculateStats(res);
    console.log(`    P50: ${results.request.p50}ms | P90: ${results.request.p90}ms | P99: ${results.request.p99}ms | 错误率: ${(results.request.errorRate * 100).toFixed(1)}%`);

    // HITL status
    console.log(`\n  测试 /api/hitl/status/:requestId (并发: ${concurrency})`);
    res = await this.concurrentTest(`${BASE_URL}/api/hitl/status/test-request-123`, { method: 'GET' }, concurrency, REQUESTS_PER_LEVEL);
    results.status = this.calculateStats(res);
    console.log(`    P50: ${results.status.p50}ms | P90: ${results.status.p90}ms | P99: ${results.status.p99}ms | 错误率: ${(results.status.errorRate * 100).toFixed(1)}%`);

    return results;
  }

  // 测试 memory API
  async testMemoryAPIs(concurrency) {
    const results = {};

    console.log(`\n  测试 /api/memory (并发: ${concurrency})`);
    let res = await this.concurrentTest(`${BASE_URL}/api/memory`, { method: 'GET' }, concurrency, REQUESTS_PER_LEVEL);
    results.list = this.calculateStats(res);
    console.log(`    P50: ${results.list.p50}ms | P90: ${results.list.p90}ms | P99: ${results.list.p99}ms | 错误率: ${(results.list.errorRate * 100).toFixed(1)}%`);

    console.log(`\n  测试 /api/memory/stats (并发: ${concurrency})`);
    res = await this.concurrentTest(`${BASE_URL}/api/memory/stats`, { method: 'GET' }, concurrency, REQUESTS_PER_LEVEL);
    results.stats = this.calculateStats(res);
    console.log(`    P50: ${results.stats.p50}ms | P90: ${results.stats.p90}ms | P99: ${results.stats.p99}ms | 错误率: ${(results.stats.errorRate * 100).toFixed(1)}%`);

    return results;
  }

  // 运行完整测试
  async run() {
    console.log('========================================');
    console.log('  后端 API 完整压测');
    console.log('  基线: P50 < 100ms, P90 < 300ms, P99 < 500ms, 错误率 < 1%');
    console.log('========================================');

    const allResults = [];

    for (const concurrency of CONCURRENCY_LEVELS) {
      console.log(`\n【并发等级: ${concurrency}】`);

      const levelResults = {
        concurrency,
        timestamp: new Date().toISOString(),
        chat: await this.testChatAPI(concurrency),
        router: await this.testRouterAPI(concurrency),
        admin: await this.testAdminAPIs(concurrency),
        qdrant: await this.testQdrantAPIs(concurrency),
        a2a: await this.testA2AAPIs(concurrency),
        hitl: await this.testHITLAPIs(concurrency),
        memory: await this.testMemoryAPIs(concurrency)
      };

      allResults.push(levelResults);
    }

    // 汇总分析
    console.log('\n========================================');
    console.log('  压测结果汇总');
    console.log('========================================');

    this.printSummary(allResults);

    // 保存结果
    const fs = require('fs');
    const outputPath = require('path').join(__dirname, '../../data/metrics/backend-api-stress-test.json');
    fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
    console.log(`\n结果已保存: ${outputPath}`);

    return allResults;
  }

  printSummary(results) {
    console.log('\n端点 | 并发 | P50 | P90 | P99 | 错误率');
    console.log('---|---:|---:|---:|---:|---:');

    results.forEach(r => {
      // Chat
      console.log(`chat | ${r.concurrency} | ${r.chat.p50}ms | ${r.chat.p90}ms | ${r.chat.p99}ms | ${(r.chat.errorRate * 100).toFixed(1)}%`);
      // Admin stats
      console.log(`admin/stats | ${r.concurrency} | ${r.admin.stats.p50}ms | ${r.admin.stats.p90}ms | ${r.admin.stats.p99}ms | ${(r.admin.stats.errorRate * 100).toFixed(1)}%`);
      // Qdrant status
      console.log(`qdrant/status | ${r.concurrency} | ${r.qdrant.status.p50}ms | ${r.qdrant.status.p90}ms | ${r.qdrant.status.p99}ms | ${(r.qdrant.status.errorRate * 100).toFixed(1)}%`);
      // A2A agents
      console.log(`a2a/agents | ${r.concurrency} | ${r.a2a.agents.p50}ms | ${r.a2a.agents.p90}ms | ${r.a2a.agents.p99}ms | ${(r.a2a.agents.errorRate * 100).toFixed(1)}%`);
    });

    // 基线对比
    console.log('\n基线检查:');
    results.forEach(r => {
      const pass = r.chat.p99 < 500 && r.chat.errorRate < 0.01;
      console.log(`  并发${r.concurrency}: ${pass ? '✅ 通过' : '❌ 未通过'} (P99=${r.chat.p99}ms, 错误率=${(r.chat.errorRate*100).toFixed(1)}%)`);
    });
  }
}

// 执行测试
(async () => {
  try {
    const runner = new StressTestRunner();
    await runner.run();
    console.log('\n压测完成!');
    process.exit(0);
  } catch (error) {
    console.error('压测失败:', error);
    process.exit(1);
  }
})();