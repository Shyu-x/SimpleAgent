/**
 * 前端负载测试套件
 * 负责 Task #26: 前端负载测试
 */

const http = require('http');
const https = require('https');

const FRONTEND_URL = 'http://127.0.0.1:3001';
const BACKEND_URL = 'http://127.0.0.1:30000';

// 性能指标收集器
class MetricsCollector {
  constructor() {
    this.metrics = {
      pageLoad: [],
      apiCalls: [],
      errors: [],
    };
  }

  record(name, duration, metadata = {}) {
    if (!this.metrics[name]) {
      this.metrics[name] = [];
    }
    this.metrics[name].push({
      duration,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  getStats(name) {
    const values = this.metrics[name].map((m) => m.duration).sort((a, b) => a - b);
    if (values.length === 0) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const p50 = values[Math.floor(values.length * 0.5)];
    const p90 = values[Math.floor(values.length * 0.9)];
    const p95 = values[Math.floor(values.length * 0.95)];
    const p99 = values[Math.floor(values.length * 0.99)];
    const min = values[0];
    const max = values[values.length - 1];

    return { avg, p50, p90, p95, p99, min, max, count: values.length };
  }

  printReport() {
    console.log('\n========== 性能测试报告 ==========\n');

    // 页面加载性能
    const pageStats = this.getStats('pageLoad');
    if (pageStats) {
      console.log('【页面加载性能】');
      console.log(`  平均响应: ${pageStats.avg.toFixed(2)}ms`);
      console.log(`  P50: ${pageStats.p50.toFixed(2)}ms`);
      console.log(`  P90: ${pageStats.p90.toFixed(2)}ms`);
      console.log(`  P95: ${pageStats.p95.toFixed(2)}ms`);
      console.log(`  P99: ${pageStats.p99.toFixed(2)}ms`);
      console.log(`  最小值: ${pageStats.min.toFixed(2)}ms`);
      console.log(`  最大值: ${pageStats.max.toFixed(2)}ms`);
      console.log(`  请求数: ${pageStats.count}`);
      console.log(`  基线(<2000ms): ${pageStats.p95 < 2000 ? '✅ 通过' : '❌ 未通过'}`);
    }

    // API调用性能
    const apiStats = this.getStats('apiCall');
    if (apiStats) {
      console.log('\n【API调用性能】');
      console.log(`  平均响应: ${apiStats.avg.toFixed(2)}ms`);
      console.log(`  P50: ${apiStats.p50.toFixed(2)}ms`);
      console.log(`  P90: ${apiStats.p90.toFixed(2)}ms`);
      console.log(`  P95: ${apiStats.p95.toFixed(2)}ms`);
      console.log(`  P99: ${apiStats.p99.toFixed(2)}ms`);
      console.log(`  最小值: ${apiStats.min.toFixed(2)}ms`);
      console.log(`  最大值: ${apiStats.max.toFixed(2)}ms`);
      console.log(`  请求数: ${apiStats.count}`);
      console.log(`  基线(<500ms): ${apiStats.p95 < 500 ? '✅ 通过' : '❌ 未通过'}`);
    }

    // 错误统计
    if (this.metrics.errors.length > 0) {
      console.log('\n【错误统计】');
      this.metrics.errors.forEach((err) => {
        console.log(`  [${err.code}] ${err.message}`);
      });
    }

    console.log('\n===================================\n');
  }
}

// 简单的HTTP请求函数
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const duration = Date.now() - startTime;
        resolve({ status: res.statusCode, data, duration, headers: res.headers });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// 并发请求测试
async function concurrentRequests(url, count, options = {}) {
  const collector = new MetricsCollector();
  const metricName = options.metricName || 'apiCall';

  const promises = Array(count)
    .fill(null)
    .map(async () => {
      try {
        const startTime = Date.now();
        await httpRequest(url, options);
        collector.record(metricName, Date.now() - startTime);
      } catch (err) {
        collector.record(metricName, Date.now() - startTime, { error: err.message });
      }
    });

  await Promise.all(promises);
  return collector;
}

// 页面加载性能测试
async function testPageLoadPerformance(collector, url, iterations = 10) {
  console.log(`\n📊 测试页面加载性能 (${iterations}次)...`);

  for (let i = 0; i < iterations; i++) {
    try {
      const startTime = Date.now();
      const response = await httpRequest(url);
      const duration = Date.now() - startTime;

      collector.record('pageLoad', duration, {
        status: response.status,
        size: response.data.length,
      });

      process.stdout.write(`  ${i + 1}/${iterations}: ${duration}ms (${response.status})\r`);
    } catch (err) {
      collector.metrics.errors.push({
        code: 'PAGE_LOAD_ERROR',
        message: `${err.message}`,
      });
      console.log(`\n  ❌ 第${i + 1}次加载失败: ${err.message}`);
    }
  }
  console.log('');
}

// API调用性能测试
async function testAPICalls(collector) {
  const apiTests = [
    { url: `${BACKEND_URL}/api/health`, name: 'Health Check' },
    { url: `${BACKEND_URL}/api/admin/stats`, name: 'Admin Stats' },
    { url: `${BACKEND_URL}/api/admin/models`, name: 'Model Config' },
    { url: `${BACKEND_URL}/api/admin/knowledge/docs`, name: 'Knowledge List' },
    { url: `${BACKEND_URL}/api/qdrant/status`, name: 'Qdrant Status' },
  ];

  console.log('\n📊 测试API调用性能...');

  for (const test of apiTests) {
    try {
      const startTime = Date.now();
      const response = await httpRequest(test.url);
      const duration = Date.now() - startTime;

      collector.record('apiCall', duration, { endpoint: test.name });
      console.log(`  ✅ ${test.name}: ${duration}ms (${response.status})`);
    } catch (err) {
      console.log(`  ❌ ${test.name}: ${err.message}`);
      collector.metrics.errors.push({ code: 'API_ERROR', message: `${test.name}: ${err.message}` });
    }
  }
}

// 并发压力测试
async function testConcurrentLoad(collector) {
  console.log('\n📊 测试并发压力...');

  const testCases = [
    { url: `${BACKEND_URL}/api/health`, count: 10, name: '10并发健康检查' },
    { url: `${BACKEND_URL}/api/health`, count: 25, name: '25并发健康检查' },
    { url: `${BACKEND_URL}/api/health`, count: 50, name: '50并发健康检查' },
  ];

  for (const test of testCases) {
    console.log(`  测试 ${test.name}...`);
    const result = await concurrentRequests(test.url, test.count);
    const stats = result.getStats('apiCall');
    if (stats) {
      console.log(`    平均: ${stats.avg.toFixed(2)}ms | P90: ${stats.p90.toFixed(2)}ms | 最大: ${stats.max.toFixed(2)}ms`);
    }
  }
}

// 组件渲染性能测试 (通过分析页面HTML大小)
async function testComponentRendering(collector, url) {
  console.log('\n📊 分析组件渲染特征...');

  try {
    const response = await httpRequest(url);
    const html = response.data;

    // 分析页面结构特征
    const features = {
      hasReactRoot: html.includes('__next') || html.includes('_next'),
      hasHydration: html.includes('__NEXT_DATA__'),
      htmlSize: html.length,
      scriptCount: (html.match(/<script/g) || []).length,
      linkCount: (html.match(/<link/g) || []).length,
    };

    console.log(`  HTML大小: ${(features.htmlSize / 1024).toFixed(2)}KB`);
    console.log(`  ReactRoot: ${features.hasReactRoot ? '✅' : '❌'}`);
    console.log(`  SSR Hydration: ${features.hasHydration ? '✅' : '❌'}`);
    console.log(`  Script标签: ${features.scriptCount}`);
    console.log(`  Link标签: ${features.linkCount}`);

    // 评估组件复杂度
    const complexity = features.scriptCount > 10 ? '高' : features.scriptCount > 5 ? '中' : '低';
    console.log(`  组件复杂度评估: ${complexity}`);
  } catch (err) {
    console.log(`  ❌ 分析失败: ${err.message}`);
  }
}

// 功能测试
async function testFunctionality() {
  console.log('\n📊 测试核心功能...');

  const tests = [
    { url: `${FRONTEND_URL}/`, name: '首页加载', expectedStatus: 200 },
    { url: `${BACKEND_URL}/api/health`, name: '后端健康检查', expectedStatus: 200 },
    { url: `${BACKEND_URL}/api/chat`, name: 'Chat API', expectedStatus: 200, method: 'POST' },
  ];

  const results = [];
  for (const test of tests) {
    try {
      const response = await httpRequest(test.url, { method: test.method });
      const passed = response.status === test.expectedStatus;
      results.push({ name: test.name, passed, status: response.status });
      console.log(`  ${passed ? '✅' : '❌'} ${test.name}: ${response.status}`);
    } catch (err) {
      results.push({ name: test.name, passed: false, error: err.message });
      console.log(`  ❌ ${test.name}: ${err.message}`);
    }
  }

  return results;
}

// 主测试流程
async function runLoadTests() {
  console.log('======================================');
  console.log('  前端负载测试 - Task #26');
  console.log('======================================');

  const collector = new MetricsCollector();

  // 1. 页面加载性能测试
  await testPageLoadPerformance(collector, FRONTEND_URL, 10);

  // 2. API调用性能测试
  await testAPICalls(collector);

  // 3. 组件渲染性能分析
  await testComponentRendering(collector, FRONTEND_URL);

  // 4. 并发压力测试
  await testConcurrentLoad(collector);

  // 5. 功能测试
  const funcResults = await testFunctionality();

  // 输出最终报告
  collector.printReport();

  // 返回测试结果
  return {
    metrics: collector.metrics,
    functionality: funcResults,
    timestamp: new Date().toISOString(),
  };
}

// 运行测试
if (require.main === module) {
  runLoadTests()
    .then((results) => {
      console.log('✅ 测试完成');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ 测试失败:', err);
      process.exit(1);
    });
}

module.exports = { runLoadTests, MetricsCollector };